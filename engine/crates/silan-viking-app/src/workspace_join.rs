//! Join an existing Git-backed workspace on a new device.
//!
//! This use case deliberately keeps the Git source remote separate from the
//! production deployment target. A repository is authoritative for authoring
//! source; the deployment server remains authoritative only for runtime data.

use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use thiserror::Error;

use crate::{Workspace, WorkspaceSync};

const CONFIG_FILE: &str = "silan-viking.toml";
const DEFAULT_CONTENT_DIR: &str = "content";
const DEFAULT_DATABASE_PATH: &str = "_deploy/portfolio.db";

#[derive(Debug, Error)]
pub enum WorkspaceJoinError {
    #[error("repository address is invalid: {0}")]
    InvalidRepository(String),
    #[error("workspace destination is invalid: {0}")]
    InvalidDestination(String),
    #[error("repository access failed: {0}")]
    RepositoryAccess(String),
    #[error("git {operation} failed: {detail}")]
    Git { operation: String, detail: String },
    #[error("workspace configuration is invalid: {0}")]
    InvalidConfiguration(String),
    #[error("workspace cannot be synchronized: {0}")]
    UnsafeSynchronization(String),
    #[error("workspace projection failed: {0}")]
    Projection(String),
    #[error("workspace filesystem operation failed: {0}")]
    Filesystem(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GitAuthenticationKind {
    Ssh,
    OAuth,
    Local,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceLayout {
    ProjectRepository,
    ContentRepository,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GitRepositoryState {
    Synchronized,
    LocalAhead,
    RemoteAhead,
    Diverged,
    Dirty,
    NoUpstream,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GitRepositoryStatus {
    pub branch: String,
    pub upstream: Option<String>,
    pub head: String,
    pub upstream_head: Option<String>,
    pub dirty_files: usize,
    pub ahead: usize,
    pub behind: usize,
    pub state: GitRepositoryState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeploymentKeyRequirement {
    pub required: bool,
    pub configured_path: Option<String>,
    pub host: Option<String>,
    pub user: Option<String>,
}

#[derive(Debug, Clone)]
pub struct JoinWorkspaceInput {
    pub repository_url: String,
    pub destination: PathBuf,
    pub branch: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JoinWorkspaceResult {
    pub project_root: PathBuf,
    pub content_root: PathBuf,
    pub database_path: PathBuf,
    pub project_name: String,
    pub repository_url: String,
    pub authentication: GitAuthenticationKind,
    pub layout: WorkspaceLayout,
    pub repository: GitRepositoryStatus,
    pub deployment_key: DeploymentKeyRequirement,
    pub projection_revision: String,
    pub items_scanned: usize,
    pub rows_written: usize,
}

#[derive(Debug, Default, Deserialize)]
struct ProjectConfig {
    project: Option<ProjectSection>,
    database: Option<DatabaseSection>,
    deploy: Option<DeploySection>,
}

#[derive(Debug, Default, Deserialize)]
struct ProjectSection {
    name: Option<String>,
    content_dir: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct DatabaseSection {
    path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct DeploySection {
    host: Option<String>,
    user: Option<String>,
    ssh_key_path: Option<String>,
}

#[derive(Debug)]
struct ResolvedWorkspace {
    project_root: PathBuf,
    content_root: PathBuf,
    database_path: PathBuf,
    project_name: String,
    deployment_key: DeploymentKeyRequirement,
    layout: WorkspaceLayout,
    repository_root: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalWorkspace {
    pub project_root: PathBuf,
    pub content_root: PathBuf,
    pub project_name: String,
}

/// Application service for the new-device join lifecycle.
pub struct WorkspaceJoiner;

impl WorkspaceJoiner {
    /// Verify that Git can read the remote using the machine's existing SSH
    /// agent/key or HTTPS credential-manager OAuth session. Prompts are
    /// disabled so a GUI caller always receives a bounded, actionable result.
    pub fn verify_repository_access(
        repository_url: &str,
    ) -> Result<GitAuthenticationKind, WorkspaceJoinError> {
        let authentication = validate_repository_url(repository_url)?;
        run_git(
            None,
            "verify repository access",
            ["ls-remote", "--", repository_url],
        )?;
        Ok(authentication)
    }

    /// Clone a new checkout, or fetch and fast-forward an existing clean
    /// checkout. Dirty, locally-ahead, and diverged repositories are never
    /// mutated; their state is reported as a synchronization error instead.
    pub fn join(input: &JoinWorkspaceInput) -> Result<JoinWorkspaceResult, WorkspaceJoinError> {
        Self::join_with_progress(input, |_| {})
    }

    pub fn join_with_progress(
        input: &JoinWorkspaceInput,
        progress: impl Fn(crate::workspace_setup::WorkspaceSetupStage),
    ) -> Result<JoinWorkspaceResult, WorkspaceJoinError> {
        use crate::workspace_setup::WorkspaceSetupStage;
        progress(WorkspaceSetupStage::CheckingAccess);
        let authentication = Self::verify_repository_access(&input.repository_url)?;
        validate_branch(input.branch.as_deref())?;
        let destination = expand_home(&input.destination)?;
        let destination_is_empty = destination
            .read_dir()
            .ok()
            .is_some_and(|mut entries| entries.next().is_none());
        // Keep a fresh clone private until synchronization and projection both
        // succeed. A failed join must not leave a half-prepared destination.
        let staging = if !destination.exists() || destination_is_empty {
            let parent = destination.parent().ok_or_else(|| {
                WorkspaceJoinError::InvalidDestination("choose a workspace folder".into())
            })?;
            fs::create_dir_all(parent)
                .map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?;
            Some(
                tempfile::tempdir_in(parent)
                    .map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?,
            )
        } else {
            None
        };
        progress(WorkspaceSetupStage::Cloning);
        let resolved = if let Some(staging) = staging.as_ref() {
            Self::clone_new(input, &staging.path().join("workspace"))?
        } else {
            Self::open_existing(&input.repository_url, &destination)?
        };

        progress(WorkspaceSetupStage::Synchronizing);
        if let Some(branch) = input
            .branch
            .as_deref()
            .map(str::trim)
            .filter(|b| !b.is_empty())
        {
            let current = git_stdout(
                Some(&resolved.repository_root),
                "read branch",
                ["branch", "--show-current"],
            )?;
            if current != branch {
                return Err(WorkspaceJoinError::UnsafeSynchronization(format!("existing checkout is on `{current}`, not `{branch}`; select its current branch or clone into a new folder")));
            }
        }
        fetch_repository(&resolved.repository_root)?;
        let observed = repository_status(&resolved.repository_root)?;
        synchronize_fast_forward(&resolved.repository_root, &observed)?;
        let repository = repository_status(&resolved.repository_root)?;
        if repository.state != GitRepositoryState::Synchronized {
            return Err(WorkspaceJoinError::UnsafeSynchronization(format!(
                "repository is {} after fetch",
                state_label(repository.state)
            )));
        }

        // A fast-forward may have changed project paths. Resolve the new revision.
        let resolved = resolve_project_workspace(&resolved.project_root, resolved.layout)?;
        progress(WorkspaceSetupStage::Indexing);
        fs::create_dir_all(
            resolved
                .database_path
                .parent()
                .unwrap_or(resolved.project_root.as_path()),
        )
        .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
        let sync = WorkspaceSync::open(&resolved.content_root, &resolved.database_path)
            .map_err(|error| WorkspaceJoinError::Projection(error.to_string()))?;
        let projection = sync
            .sync()
            .map_err(|error| WorkspaceJoinError::Projection(error.to_string()))?;

        let mut resolved = resolved;
        if staging.is_some() {
            let content_relative = resolved
                .content_root
                .strip_prefix(&resolved.project_root)
                .map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?
                .to_path_buf();
            let database_relative = resolved
                .database_path
                .strip_prefix(&resolved.project_root)
                .map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?
                .to_path_buf();
            progress(WorkspaceSetupStage::Activating);
            remove_empty_destination(&destination)?;
            fs::rename(&resolved.project_root, &destination)
                .map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?;
            resolved.project_root = destination.clone();
            resolved.content_root = destination.join(content_relative);
            resolved.database_path = destination.join(database_relative);
        }
        Ok(JoinWorkspaceResult {
            project_root: resolved.project_root,
            content_root: resolved.content_root,
            database_path: resolved.database_path,
            project_name: resolved.project_name,
            repository_url: input.repository_url.trim().to_owned(),
            authentication,
            layout: resolved.layout,
            repository,
            deployment_key: resolved.deployment_key,
            projection_revision: projection.projection_revision,
            items_scanned: projection.items_scanned,
            rows_written: projection.rows_written,
        })
    }

    /// Open and rebuild a local project without contacting any remote or
    /// requiring a clean worktree, upstream, or deployment credentials.
    pub fn open_local(destination: &Path) -> Result<LocalWorkspace, WorkspaceJoinError> {
        let destination = expand_home(destination)?;
        let root = if destination.join(CONFIG_FILE).is_file() {
            destination.clone()
        } else if destination.join("SCHEMA.md").is_file() {
            destination
                .parent()
                .ok_or_else(|| {
                    WorkspaceJoinError::InvalidDestination(
                        "select the project folder containing silan-viking.toml".into(),
                    )
                })?
                .to_path_buf()
        } else {
            return Err(WorkspaceJoinError::InvalidDestination("select the project folder containing silan-viking.toml, or its configured content folder".into()));
        };
        let root =
            fs::canonicalize(root).map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?;
        let layout = if root.join(".git").exists() {
            WorkspaceLayout::ProjectRepository
        } else {
            WorkspaceLayout::ContentRepository
        };
        let resolved = resolve_project_workspace(&root, layout)?;
        if destination.join("SCHEMA.md").is_file()
            && fs::canonicalize(&destination).ok() != fs::canonicalize(&resolved.content_root).ok()
        {
            return Err(WorkspaceJoinError::InvalidDestination(
                "this folder is not the content directory declared by the project".into(),
            ));
        }
        if let Some(parent) = resolved.database_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| WorkspaceJoinError::Filesystem(e.to_string()))?;
        }
        WorkspaceSync::open(&resolved.content_root, &resolved.database_path)
            .map_err(|e| WorkspaceJoinError::Projection(e.to_string()))?
            .sync()
            .map_err(|e| WorkspaceJoinError::Projection(e.to_string()))?;
        Ok(LocalWorkspace {
            project_root: root,
            content_root: resolved.content_root,
            project_name: resolved.project_name,
        })
    }

    pub fn inspect_repository(
        root: impl AsRef<Path>,
    ) -> Result<GitRepositoryStatus, WorkspaceJoinError> {
        repository_status(root.as_ref())
    }

    fn clone_new(
        input: &JoinWorkspaceInput,
        destination: &Path,
    ) -> Result<ResolvedWorkspace, WorkspaceJoinError> {
        let parent = destination.parent().ok_or_else(|| {
            WorkspaceJoinError::InvalidDestination(format!(
                "`{}` has no parent directory",
                destination.display()
            ))
        })?;
        fs::create_dir_all(parent)
            .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
        let staging = tempfile::tempdir_in(parent)
            .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
        let checkout = staging.path().join("checkout");
        let mut args = vec![
            "clone".to_owned(),
            "--origin".to_owned(),
            "origin".to_owned(),
            "--recurse-submodules".to_owned(),
        ];
        if let Some(branch) = input
            .branch
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            args.push("--branch".to_owned());
            args.push(branch.trim().to_owned());
        }
        args.push("--".to_owned());
        args.push(input.repository_url.trim().to_owned());
        args.push(checkout.to_string_lossy().into_owned());
        run_git(None, "clone workspace", args)?;

        if checkout.join(CONFIG_FILE).is_file() {
            resolve_project_workspace(&checkout, WorkspaceLayout::ProjectRepository)?;
            remove_empty_destination(destination)?;
            fs::rename(&checkout, destination)
                .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
            return resolve_project_workspace(destination, WorkspaceLayout::ProjectRepository);
        }
        if checkout.join("SCHEMA.md").is_file() {
            Workspace::open(&checkout)
                .map_err(|error| WorkspaceJoinError::InvalidConfiguration(error.to_string()))?;
            remove_empty_destination(destination)?;
            fs::create_dir_all(destination)
                .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
            let content_root = destination.join(DEFAULT_CONTENT_DIR);
            fs::rename(&checkout, &content_root)
                .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
            write_local_project_config(destination, &project_name_from_url(&input.repository_url))?;
            return resolve_project_workspace(destination, WorkspaceLayout::ContentRepository);
        }
        Err(WorkspaceJoinError::InvalidConfiguration(
            "repository contains neither silan-viking.toml nor content/SCHEMA.md".to_owned(),
        ))
    }

    fn open_existing(
        repository_url: &str,
        destination: &Path,
    ) -> Result<ResolvedWorkspace, WorkspaceJoinError> {
        if !destination.is_dir() {
            return Err(WorkspaceJoinError::InvalidDestination(format!(
                "`{}` is not a directory",
                destination.display()
            )));
        }
        let layout = if destination.join(".git").exists() {
            WorkspaceLayout::ProjectRepository
        } else if destination.join(CONFIG_FILE).is_file() {
            WorkspaceLayout::ContentRepository
        } else {
            return Err(WorkspaceJoinError::InvalidDestination(format!(
                "`{}` is not an existing Silan workspace and is not empty",
                destination.display()
            )));
        };
        let resolved = resolve_project_workspace(destination, layout)?;
        let configured_remote = git_stdout(
            Some(&resolved.repository_root),
            "read origin",
            ["remote", "get-url", "origin"],
        )?;
        if normalize_repository_url(&configured_remote) != normalize_repository_url(repository_url)
        {
            return Err(WorkspaceJoinError::InvalidDestination(
                "existing checkout origin does not match the requested repository".to_owned(),
            ));
        }
        Ok(resolved)
    }
}

fn remove_empty_destination(destination: &Path) -> Result<(), WorkspaceJoinError> {
    if !destination.exists() {
        return Ok(());
    }
    let mut entries = destination
        .read_dir()
        .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))?;
    if entries.next().is_some() {
        return Err(WorkspaceJoinError::InvalidDestination(format!(
            "`{}` is not empty",
            destination.display()
        )));
    }
    fs::remove_dir(destination).map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))
}

fn validate_repository_url(value: &str) -> Result<GitAuthenticationKind, WorkspaceJoinError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(WorkspaceJoinError::InvalidRepository(
            "enter a Git repository address".to_owned(),
        ));
    }
    if value.starts_with('-') {
        return Err(WorkspaceJoinError::InvalidRepository(
            "repository address cannot start with `-`".to_owned(),
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(WorkspaceJoinError::InvalidRepository(
            "control characters are not allowed".to_owned(),
        ));
    }
    if value.starts_with("http://") || value.starts_with("https://") {
        let authority = value
            .split_once("://")
            .map(|(_, rest)| rest.split('/').next().unwrap_or(rest))
            .unwrap_or_default();
        if authority.contains('@') {
            return Err(WorkspaceJoinError::InvalidRepository(
                "do not embed OAuth tokens or passwords in the URL; use the system Git credential manager"
                    .to_owned(),
            ));
        }
        return Ok(GitAuthenticationKind::OAuth);
    }
    if value.starts_with("ssh://") || is_scp_style_address(value) {
        return Ok(GitAuthenticationKind::Ssh);
    }
    Ok(GitAuthenticationKind::Local)
}

fn validate_branch(branch: Option<&str>) -> Result<(), WorkspaceJoinError> {
    let Some(branch) = branch.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    if branch.starts_with('-')
        || branch.chars().any(char::is_whitespace)
        || branch.contains("..")
        || branch.contains("@{")
        || branch.ends_with('.')
        || branch.ends_with('/')
        || branch.contains("//")
    {
        return Err(WorkspaceJoinError::InvalidRepository(format!(
            "branch `{branch}` is not a safe Git branch name"
        )));
    }
    Ok(())
}

fn is_scp_style_address(value: &str) -> bool {
    value
        .split_once('@')
        .and_then(|(_, host_path)| host_path.split_once(':'))
        .is_some_and(|(host, path)| !host.is_empty() && !path.is_empty())
}

fn normalize_repository_url(value: &str) -> String {
    value
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_owned()
}

fn expand_home(path: &Path) -> Result<PathBuf, WorkspaceJoinError> {
    let text = path.to_string_lossy();
    let Some(relative) = text.strip_prefix("~/") else {
        return Ok(path.to_path_buf());
    };
    let home = std::env::var_os("HOME").ok_or_else(|| {
        WorkspaceJoinError::InvalidDestination(
            "cannot resolve the current user's home directory".to_owned(),
        )
    })?;
    Ok(PathBuf::from(home).join(relative))
}

fn resolve_project_workspace(
    project_root: &Path,
    layout: WorkspaceLayout,
) -> Result<ResolvedWorkspace, WorkspaceJoinError> {
    let config_path = project_root.join(CONFIG_FILE);
    let source = fs::read_to_string(&config_path).map_err(|error| {
        WorkspaceJoinError::InvalidConfiguration(format!(
            "cannot read `{}`: {error}",
            config_path.display()
        ))
    })?;
    let config: ProjectConfig = toml::from_str(&source).map_err(|error| {
        WorkspaceJoinError::InvalidConfiguration(format!(
            "cannot parse `{}`: {error}",
            config_path.display()
        ))
    })?;
    let project = config.project.ok_or_else(|| {
        WorkspaceJoinError::InvalidConfiguration("[project] is required".to_owned())
    })?;
    let content_dir = project
        .content_dir
        .as_deref()
        .unwrap_or(DEFAULT_CONTENT_DIR);
    let content_root = safe_project_path(project_root, content_dir, "[project].content_dir")?;
    if !content_root.join("SCHEMA.md").is_file() {
        return Err(WorkspaceJoinError::InvalidConfiguration(format!(
            "content schema is missing at `{}`",
            content_root.join("SCHEMA.md").display()
        )));
    }
    Workspace::open(&content_root)
        .map_err(|error| WorkspaceJoinError::InvalidConfiguration(error.to_string()))?;
    let database_path = config
        .database
        .and_then(|database| database.path)
        .filter(|path| !path.trim().is_empty())
        .ok_or_else(|| {
            WorkspaceJoinError::InvalidConfiguration("[database].path is required".to_owned())
        })?;
    let database_path = safe_project_path(project_root, &database_path, "[database].path")?;
    let deployment_key = config.deploy.map_or(
        DeploymentKeyRequirement {
            required: false,
            configured_path: None,
            host: None,
            user: None,
        },
        |deploy| DeploymentKeyRequirement {
            required: deploy.host.as_deref().is_some_and(|host| host != "local"),
            configured_path: deploy.ssh_key_path,
            host: deploy.host,
            user: deploy.user,
        },
    );
    let repository_root = match layout {
        WorkspaceLayout::ProjectRepository => project_root.to_path_buf(),
        WorkspaceLayout::ContentRepository => content_root.clone(),
    };
    if !repository_root.join(".git").exists() {
        return Err(WorkspaceJoinError::InvalidConfiguration(format!(
            "authoring repository is missing at `{}`",
            repository_root.display()
        )));
    }
    Ok(ResolvedWorkspace {
        project_root: project_root.to_path_buf(),
        content_root,
        database_path,
        project_name: project
            .name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "Silan workspace".to_owned()),
        deployment_key,
        layout,
        repository_root,
    })
}

fn safe_project_path(
    project_root: &Path,
    configured: &str,
    field: &str,
) -> Result<PathBuf, WorkspaceJoinError> {
    use std::path::Component;

    let relative = Path::new(configured.trim());
    if relative.as_os_str().is_empty()
        || relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(WorkspaceJoinError::InvalidConfiguration(format!(
            "{field} must be a relative path inside the workspace"
        )));
    }
    let mut cursor = project_root.to_path_buf();
    for component in relative.components() {
        if let Component::Normal(segment) = component {
            cursor.push(segment);
            if fs::symlink_metadata(&cursor)
                .ok()
                .is_some_and(|metadata| metadata.file_type().is_symlink())
            {
                return Err(WorkspaceJoinError::InvalidConfiguration(format!(
                    "{field} cannot traverse symbolic link `{}`",
                    cursor.display()
                )));
            }
        }
    }
    Ok(cursor)
}

fn write_local_project_config(project_root: &Path, name: &str) -> Result<(), WorkspaceJoinError> {
    let escaped_name = name.replace('"', "\\\"");
    let source = format!(
        "# Device-local project shell for an existing Silan content repository.\n\
         [project]\n\
         name = \"{escaped_name}\"\n\
         content_dir = \"{DEFAULT_CONTENT_DIR}\"\n\n\
         [database]\n\
         path = \"{DEFAULT_DATABASE_PATH}\"\n"
    );
    fs::write(project_root.join(CONFIG_FILE), source)
        .map_err(|error| WorkspaceJoinError::Filesystem(error.to_string()))
}

fn project_name_from_url(repository_url: &str) -> String {
    repository_url
        .trim_end_matches('/')
        .rsplit(['/', ':'])
        .next()
        .unwrap_or("silan-workspace")
        .trim_end_matches(".git")
        .replace(['-', '_'], " ")
}

fn fetch_repository(root: &Path) -> Result<(), WorkspaceJoinError> {
    run_git(Some(root), "fetch origin", ["fetch", "--prune", "origin"])?;
    Ok(())
}

fn repository_status(root: &Path) -> Result<GitRepositoryStatus, WorkspaceJoinError> {
    let branch = git_stdout(Some(root), "read branch", ["branch", "--show-current"])?;
    if branch.is_empty() {
        return Err(WorkspaceJoinError::UnsafeSynchronization(
            "detached HEAD cannot join an editable workspace".to_owned(),
        ));
    }
    let head = git_stdout(Some(root), "read HEAD", ["rev-parse", "HEAD"])?;
    let dirty_files = git_stdout(
        Some(root),
        "read worktree status",
        ["status", "--porcelain"],
    )?
    .lines()
    .filter(|line| !line.trim().is_empty())
    .count();
    let upstream = optional_git_stdout(
        root,
        "read upstream",
        ["rev-parse", "--abbrev-ref", "@{upstream}"],
    );
    let Some(upstream) = upstream else {
        return Ok(GitRepositoryStatus {
            branch,
            upstream: None,
            head,
            upstream_head: None,
            dirty_files,
            ahead: 0,
            behind: 0,
            state: if dirty_files > 0 {
                GitRepositoryState::Dirty
            } else {
                GitRepositoryState::NoUpstream
            },
        });
    };
    let upstream_head = git_stdout(Some(root), "read upstream HEAD", ["rev-parse", &upstream])?;
    let counts = git_stdout(
        Some(root),
        "compare repository revisions",
        [
            "rev-list",
            "--left-right",
            "--count",
            &format!("HEAD...{upstream}"),
        ],
    )?;
    let mut parts = counts.split_whitespace();
    let ahead = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let behind = parts
        .next()
        .and_then(|value| value.parse().ok())
        .unwrap_or(0);
    let state = if dirty_files > 0 {
        GitRepositoryState::Dirty
    } else {
        match (ahead, behind) {
            (0, 0) => GitRepositoryState::Synchronized,
            (_, 0) => GitRepositoryState::LocalAhead,
            (0, _) => GitRepositoryState::RemoteAhead,
            _ => GitRepositoryState::Diverged,
        }
    };
    Ok(GitRepositoryStatus {
        branch,
        upstream: Some(upstream),
        head,
        upstream_head: Some(upstream_head),
        dirty_files,
        ahead,
        behind,
        state,
    })
}

fn synchronize_fast_forward(
    root: &Path,
    status: &GitRepositoryStatus,
) -> Result<(), WorkspaceJoinError> {
    match status.state {
        GitRepositoryState::Synchronized => Ok(()),
        GitRepositoryState::RemoteAhead => {
            let upstream = status.upstream.as_deref().ok_or_else(|| {
                WorkspaceJoinError::UnsafeSynchronization("remote branch is unknown".to_owned())
            })?;
            run_git(
                Some(root),
                "fast-forward workspace",
                ["merge", "--ff-only", upstream],
            )?;
            Ok(())
        }
        GitRepositoryState::Dirty => Err(WorkspaceJoinError::UnsafeSynchronization(format!(
            "{} dirty file(s) must be committed or stashed before joining",
            status.dirty_files
        ))),
        GitRepositoryState::LocalAhead => Err(WorkspaceJoinError::UnsafeSynchronization(format!(
            "local branch is {} commit(s) ahead; push or reconcile it before joining",
            status.ahead
        ))),
        GitRepositoryState::Diverged => Err(WorkspaceJoinError::UnsafeSynchronization(format!(
            "local and remote branches diverged ({} ahead, {} behind)",
            status.ahead, status.behind
        ))),
        GitRepositoryState::NoUpstream => Err(WorkspaceJoinError::UnsafeSynchronization(
            "current branch has no upstream".to_owned(),
        )),
    }
}

fn state_label(state: GitRepositoryState) -> &'static str {
    match state {
        GitRepositoryState::Synchronized => "synchronized",
        GitRepositoryState::LocalAhead => "local ahead",
        GitRepositoryState::RemoteAhead => "remote ahead",
        GitRepositoryState::Diverged => "diverged",
        GitRepositoryState::Dirty => "dirty",
        GitRepositoryState::NoUpstream => "without an upstream",
    }
}

fn git_stdout<I, S>(
    root: Option<&Path>,
    operation: &str,
    args: I,
) -> Result<String, WorkspaceJoinError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git(root, operation, args)?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
}

fn optional_git_stdout<I, S>(root: &Path, operation: &str, args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    git_stdout(Some(root), operation, args).ok()
}

fn run_git<I, S>(
    root: Option<&Path>,
    operation: &str,
    args: I,
) -> Result<Output, WorkspaceJoinError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut command = Command::new("git");
    command
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_HTTP_LOW_SPEED_LIMIT", "1")
        .env("GIT_HTTP_LOW_SPEED_TIME", "15")
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new",
        );
    if let Some(root) = root {
        command.current_dir(root);
    }
    let output = command.output().map_err(|error| WorkspaceJoinError::Git {
        operation: operation.to_owned(),
        detail: error.to_string(),
    })?;
    if output.status.success() {
        return Ok(output);
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    Err(if operation == "verify repository access" {
        WorkspaceJoinError::RepositoryAccess(if detail.is_empty() {
            "Git could not read this repository with the current device credentials".to_owned()
        } else {
            detail
        })
    } else {
        WorkspaceJoinError::Git {
            operation: operation.to_owned(),
            detail,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_content() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
    }

    fn copy_tree(source: &Path, destination: &Path) {
        fs::create_dir_all(destination).expect("create fixture destination");
        for entry in fs::read_dir(source).expect("read fixture directory") {
            let entry = entry.expect("fixture entry");
            let source_path = entry.path();
            let destination_path = destination.join(entry.file_name());
            if source_path.is_dir() {
                copy_tree(&source_path, &destination_path);
            } else {
                fs::copy(source_path, destination_path).expect("copy fixture file");
            }
        }
    }

    fn git_ok(root: Option<&Path>, args: &[&str]) {
        let mut command = Command::new("git");
        command.args(args);
        if let Some(root) = root {
            command.current_dir(root);
        }
        let output = command.output().expect("run git fixture command");
        assert!(
            output.status.success(),
            "git {:?}: {}",
            args,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn commit_file(root: &Path, relative: &str, body: &str, message: &str) {
        let path = root.join(relative);
        fs::create_dir_all(path.parent().expect("fixture file parent"))
            .expect("create fixture path");
        fs::write(&path, body).expect("write fixture file");
        git_ok(Some(root), &["add", "--", relative]);
        git_ok(
            Some(root),
            &[
                "-c",
                "user.name=Silan Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-m",
                message,
            ],
        );
    }

    #[test]
    fn repository_authentication_is_inferred_without_accepting_inline_secrets() {
        assert_eq!(
            validate_repository_url("git@github.com:Qingbolan/content.git").expect("ssh"),
            GitAuthenticationKind::Ssh
        );
        assert_eq!(
            validate_repository_url("https://github.com/Qingbolan/content.git").expect("oauth"),
            GitAuthenticationKind::OAuth
        );
        assert!(validate_repository_url("https://token@github.com/private.git").is_err());
    }

    #[test]
    fn unsafe_branch_names_are_rejected() {
        assert!(validate_branch(Some("main")).is_ok());
        assert!(validate_branch(Some("feature/join")).is_ok());
        assert!(validate_branch(Some("--upload-pack=evil")).is_err());
        assert!(validate_branch(Some("main..other")).is_err());
    }

    #[test]
    fn repository_and_config_paths_cannot_escape_the_workspace() {
        assert!(validate_repository_url("--upload-pack=helper").is_err());
        let project = Path::new("/tmp/workspace");
        assert_eq!(
            safe_project_path(project, "content", "content").expect("safe path"),
            project.join("content")
        );
        assert!(safe_project_path(project, "../outside", "content").is_err());
        assert!(safe_project_path(project, "/tmp/outside", "database").is_err());
    }

    #[test]
    fn project_name_is_derived_from_common_git_addresses() {
        assert_eq!(
            project_name_from_url("git@github.com:Qingbolan/research-notes.git"),
            "research notes"
        );
    }

    #[test]
    fn content_repository_join_clones_validates_and_rebuilds_projection() {
        let temporary = tempfile::tempdir().expect("temporary join fixture");
        let source = temporary.path().join("source-content");
        copy_tree(&fixture_content(), &source);
        git_ok(Some(&source), &["init"]);
        git_ok(Some(&source), &["add", "."]);
        git_ok(
            Some(&source),
            &[
                "-c",
                "user.name=Silan Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-m",
                "test: initialize content fixture",
            ],
        );
        let remote = temporary.path().join("content.git");
        git_ok(
            None,
            &[
                "clone",
                "--bare",
                source.to_str().expect("source path"),
                remote.to_str().expect("remote path"),
            ],
        );
        let destination = temporary.path().join("joined-workspace");
        let failed_destination = temporary.path().join("failed-workspace");
        let failed = WorkspaceJoiner::join(&JoinWorkspaceInput {
            repository_url: remote.display().to_string(),
            destination: failed_destination.clone(),
            branch: Some("missing-branch".into()),
        });
        assert!(failed.is_err());
        assert!(
            !failed_destination.exists(),
            "failed clone must not activate its destination"
        );
        let result = WorkspaceJoiner::join(&JoinWorkspaceInput {
            repository_url: remote.display().to_string(),
            destination: destination.clone(),
            branch: None,
        })
        .expect("join content repository");

        assert_eq!(result.layout, WorkspaceLayout::ContentRepository);
        assert_eq!(result.repository.state, GitRepositoryState::Synchronized);
        assert_eq!(result.project_root, destination);
        assert!(result.project_root.join(CONFIG_FILE).is_file());
        assert!(result.content_root.join(".git").exists());
        assert!(result.database_path.is_file());
        assert!(result.items_scanned > 0);
        assert!(result.rows_written > 0);

        let dirty_note = result.content_root.join("agent/notes/device-draft.md");
        fs::create_dir_all(dirty_note.parent().expect("dirty note parent"))
            .expect("create dirty note parent");
        fs::write(&dirty_note, "not committed\n").expect("write dirty note");
        let dirty_head = result.repository.head.clone();
        let dirty_error = WorkspaceJoiner::join(&JoinWorkspaceInput {
            repository_url: remote.display().to_string(),
            destination: destination.clone(),
            branch: None,
        })
        .expect_err("dirty workspace must stop");
        assert!(matches!(
            dirty_error,
            WorkspaceJoinError::UnsafeSynchronization(_)
        ));
        assert!(dirty_note.is_file());
        assert_eq!(
            git_stdout(
                Some(&result.content_root),
                "head after dirty stop",
                ["rev-parse", "HEAD"]
            )
            .expect("read unchanged dirty HEAD"),
            dirty_head
        );
        fs::remove_file(&dirty_note).expect("remove dirty note");

        let publisher = temporary.path().join("publisher");
        git_ok(
            None,
            &[
                "clone",
                remote.to_str().expect("remote path"),
                publisher.to_str().expect("publisher path"),
            ],
        );
        commit_file(
            &publisher,
            "agent/notes/remote-update.md",
            "remote update\n",
            "test: remote workspace update",
        );
        git_ok(Some(&publisher), &["push", "origin", "HEAD"]);

        let updated = WorkspaceJoiner::join(&JoinWorkspaceInput {
            repository_url: remote.display().to_string(),
            destination: destination.clone(),
            branch: None,
        })
        .expect("fast-forward existing workspace");
        assert_eq!(updated.repository.state, GitRepositoryState::Synchronized);
        assert_ne!(updated.repository.head, dirty_head);
        assert!(updated
            .content_root
            .join("agent/notes/remote-update.md")
            .is_file());

        commit_file(
            &updated.content_root,
            "agent/notes/local-only.md",
            "local update\n",
            "test: local workspace update",
        );
        commit_file(
            &publisher,
            "agent/notes/remote-only.md",
            "another remote update\n",
            "test: divergent remote workspace update",
        );
        git_ok(Some(&publisher), &["push", "origin", "HEAD"]);
        let diverged_head = git_stdout(
            Some(&updated.content_root),
            "read divergent head",
            ["rev-parse", "HEAD"],
        )
        .expect("divergent local head");
        let diverged_error = WorkspaceJoiner::join(&JoinWorkspaceInput {
            repository_url: remote.display().to_string(),
            destination,
            branch: None,
        })
        .expect_err("diverged workspace must stop");
        assert!(matches!(
            diverged_error,
            WorkspaceJoinError::UnsafeSynchronization(_)
        ));
        assert_eq!(
            git_stdout(
                Some(&updated.content_root),
                "head after divergence stop",
                ["rev-parse", "HEAD"]
            )
            .expect("unchanged divergent head"),
            diverged_head
        );
    }
}
