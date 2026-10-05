//! Release and deployment application control plane.

use crate::{
    api_base_url, hash_deploy_media_asset, stage_deploy_media_asset, workspace_stats_sync_token,
    ContentRecoveryClient, ContentRecoveryError, ContentSourceArchive, GitRepo, RemoteBackupState,
    Workspace, WorkspaceSync, WorkspaceSyncState,
};
use flate2::{write::GzEncoder, Compression};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tar::Builder;
use thiserror::Error;

const AUTHOR_NAME: &str = "Silan.Hu";
const AUTHOR_EMAIL: &str = "silan.hu@u.nus.edu";

#[derive(Debug, Error)]
pub enum DeliveryControlError {
    #[error("delivery repository error: {0}")]
    Repository(String),
    #[error("workspace error: {0}")]
    Workspace(String),
    #[error("deployment runner error: {0}")]
    Runner(String),
    #[error("remote status error: {0}")]
    Remote(String),
    #[error("remote verification needs SILAN_STATS_SYNC_TOKEN in the process environment or project .env")]
    MissingCredential,
    #[error("unsupported release scope `{0}`")]
    UnsupportedScope(String),
    #[error("{0} has no updates to release")]
    NothingToRelease(String),
    #[error("commit message is required")]
    EmptyCommitMessage,
    #[error("no files are staged for commit")]
    NothingStaged,
    #[error("content release requires a clean committed workspace; pending paths: {0}")]
    DirtyWorkspace(String),
    #[error("content release requires a verified private Git backup: {0}")]
    UndurableRepository(String),
    #[error("workspace synchronization stopped safely: {0}")]
    UnsafeSynchronization(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseScope {
    Resume,
    Blog,
    Project,
    Idea,
    Moment,
}

impl ReleaseScope {
    pub fn parse(value: &str) -> Result<Self, DeliveryControlError> {
        match value {
            "resume" => Ok(Self::Resume),
            "blog" => Ok(Self::Blog),
            "project" => Ok(Self::Project),
            "idea" => Ok(Self::Idea),
            "moment" => Ok(Self::Moment),
            other => Err(DeliveryControlError::UnsupportedScope(other.to_owned())),
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::Resume => "resume",
            Self::Blog => "blog",
            Self::Project => "project",
            Self::Idea => "idea",
            Self::Moment => "moment",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Resume => "Resume",
            Self::Blog => "Blog",
            Self::Project => "Projects",
            Self::Idea => "Ideas",
            Self::Moment => "Moments",
        }
    }
    fn paths(self) -> &'static [&'static str] {
        match self {
            Self::Resume => &["resources/resume"],
            Self::Blog => &["resources/blog", "resources/episode"],
            Self::Project => &["resources/projects"],
            Self::Idea => &["resources/ideas"],
            Self::Moment => &["resources/moment"],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionChange {
    pub status: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceFileChange {
    pub path: String,
    /// Human label derived from the porcelain XY code: "Modified", "Added",
    /// "Deleted", "Renamed", or "Untracked".
    pub status: String,
    /// The index (staged) column is not blank/`?` — this change is already
    /// staged and will be included in the next commit.
    pub staged: bool,
    /// The worktree column is not blank — there is an edit beyond whatever
    /// is currently staged.
    pub unstaged: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionCommit {
    pub hash: String,
    pub subject: String,
    pub relative_time: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ScopeReleaseStatus {
    pub scope: ReleaseScope,
    pub scope_label: String,
    pub branch: String,
    pub head: String,
    pub dirty_count: usize,
    pub changes: Vec<VersionChange>,
    pub recent_commits: Vec<VersionCommit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommitActivityDay {
    pub date: String,
    pub commit_count: usize,
    pub scopes: Vec<ReleaseScope>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeploymentPlan {
    pub branch: String,
    pub head: String,
    pub deploy_target: Option<String>,
    pub dirty_count: usize,
    pub media_asset_count: usize,
    pub next_action: String,
    pub commit_activity: Vec<CommitActivityDay>,
    pub scopes: Vec<ScopeReleaseStatus>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeliverySyncState {
    Synchronized,
    LocalAhead,
    RemoteAhead,
    Diverged,
    RemoteUnknown,
    /// No `[deploy]` target exists, so there is no deployed version to
    /// compare against. This is an onboarding state, not a failure.
    NotConfigured,
}

impl DeliverySyncState {
    fn id(&self) -> &'static str {
        match self {
            Self::Synchronized => "synchronized",
            Self::LocalAhead => "local_ahead",
            Self::RemoteAhead => "remote_ahead",
            Self::Diverged => "diverged",
            Self::RemoteUnknown => "remote_unknown",
            Self::NotConfigured => "not_configured",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeliverySyncStatus {
    pub local_head: String,
    pub remote_head: String,
    pub local_commits: usize,
    pub remote_commits: usize,
    pub workspace_changes: usize,
    pub state: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeployRunStatus {
    pub success: bool,
    pub content_commit: String,
    pub static_published: bool,
    pub static_release: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct RemoteContentVersion {
    pub health: String,
    pub content_hash: String,
    pub content_commit: String,
    pub generated_at: String,
    pub media_root_ok: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct ContentDeployResponse {
    success: bool,
    state: String,
    content_hash: String,
    content_commit: String,
    generated_at: String,
    media_root_ok: bool,
    #[serde(default)]
    static_published: bool,
    #[serde(default)]
    static_release: String,
}

#[derive(Debug, Serialize)]
struct ContentDeployManifest {
    version: u8,
    schema_version: u64,
    content_commit: String,
    content_hash: String,
    database_sha256: String,
    source_sha256: String,
    media: Vec<MediaAssetManifest>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct MediaAssetManifest {
    path: String,
    hash: String,
}

#[derive(Debug, Deserialize)]
struct MediaPlanResponse {
    upload_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeployVerificationResult {
    pub verified: bool,
    pub expected_content_commit: String,
    pub remote: RemoteContentVersion,
    pub mismatch_reason: Option<String>,
}

pub struct DeliveryControl {
    content_root: PathBuf,
    db_path: PathBuf,
    bearer_token: Option<String>,
}

impl DeliveryControl {
    pub fn open(
        content_root: impl AsRef<Path>,
        db_path: impl AsRef<Path>,
        _repo_root: impl AsRef<Path>,
    ) -> Result<Self, DeliveryControlError> {
        Workspace::open(content_root.as_ref())
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        GitRepo::open(content_root.as_ref())
            .map_err(|error| DeliveryControlError::Repository(error.to_string()))?;
        Ok(Self {
            content_root: content_root.as_ref().to_path_buf(),
            db_path: db_path.as_ref().to_path_buf(),
            bearer_token: workspace_stats_sync_token(content_root.as_ref()),
        })
    }

    /// Override the runtime private API token for an explicit embedding or
    /// deterministic HTTP contract test.
    pub fn with_bearer_token(mut self, token: impl Into<String>) -> Self {
        let token = token.into();
        let token = token.trim();
        self.bearer_token = (!token.is_empty()).then(|| token.to_owned());
        self
    }

    pub fn scope_status(
        &self,
        scope: ReleaseScope,
    ) -> Result<ScopeReleaseStatus, DeliveryControlError> {
        let repo = self.repo()?;
        let branch = run(&repo, ["branch", "--show-current"])?;
        let head = repo
            .head_revision()
            .map_err(|e| DeliveryControlError::Repository(e.to_string()))?
            .map(|head| head.chars().take(12).collect::<String>())
            .unwrap_or_default();
        // `run_raw` keeps the leading status column of the first record, and
        // every untracked file is listed individually so each one can be
        // previewed and committed as a file rather than as a directory.
        let changes = run_raw(
            &repo,
            path_args(
                &["status", "--porcelain", "--untracked-files=all"],
                scope.paths(),
            ),
        )?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(parse_status)
        .collect::<Vec<_>>();
        let recent_commits = if head.is_empty() {
            Vec::new()
        } else {
            run(
                &repo,
                path_args(
                    &["log", "-5", "--pretty=format:%h%x1f%s%x1f%cr"],
                    scope.paths(),
                ),
            )?
            .lines()
            .filter_map(parse_log)
            .collect()
        };
        Ok(ScopeReleaseStatus {
            scope,
            scope_label: scope.label().to_owned(),
            branch: if branch.is_empty() {
                "(detached)".to_owned()
            } else {
                branch
            },
            head,
            dirty_count: changes.len(),
            changes,
            recent_commits,
        })
    }

    pub fn deployment_plan(&self) -> Result<DeploymentPlan, DeliveryControlError> {
        let release_scopes = [
            ReleaseScope::Resume,
            ReleaseScope::Blog,
            ReleaseScope::Project,
            ReleaseScope::Idea,
            ReleaseScope::Moment,
        ];
        let repo = self.repo()?;
        let branch = run(&repo, ["branch", "--show-current"])?;
        let branch = if branch.is_empty() {
            "(detached)".to_owned()
        } else {
            branch
        };
        let head = repo
            .head_revision()
            .map_err(|e| DeliveryControlError::Repository(e.to_string()))?
            .map(|head| head.chars().take(12).collect::<String>())
            .unwrap_or_default();
        let paths = release_scopes
            .iter()
            .flat_map(|scope| scope.paths().iter().copied())
            .collect::<Vec<_>>();
        let all_changes = run(&repo, path_args(&["status", "--porcelain"], &paths))?
            .lines()
            .filter_map(parse_status)
            .collect::<Vec<_>>();
        let scopes = release_scopes
            .iter()
            .copied()
            .map(|scope| {
                let changes = all_changes
                    .iter()
                    .filter(|change| scope_owns_path(scope, &change.path))
                    .cloned()
                    .collect::<Vec<_>>();
                ScopeReleaseStatus {
                    scope,
                    scope_label: scope.label().to_owned(),
                    branch: branch.clone(),
                    head: head.clone(),
                    dirty_count: changes.len(),
                    changes,
                    recent_commits: Vec::new(),
                }
            })
            .collect::<Vec<_>>();
        let dirty_count = scopes.iter().map(|scope| scope.dirty_count).sum();
        let dirty = scopes
            .iter()
            .filter(|scope| scope.dirty_count > 0)
            .map(|scope| scope.scope_label.as_str())
            .collect::<Vec<_>>();
        let deploy_target = api_base_url(&self.content_root).ok();
        let next_action = if !dirty.is_empty() {
            format!(
                "Commit {} changes before deploying content.",
                dirty.join(", ")
            )
        } else if deploy_target.is_none() {
            "Configure a deployment API target before remote delivery.".to_owned()
        } else {
            match repo.remote_backup_state() {
                Ok(RemoteBackupState::Synchronized { .. }) => {
                    "Content is clean, backed up, and ready for content-only deployment.".to_owned()
                }
                Ok(RemoteBackupState::MissingUpstream { branch }) => format!(
                    "Configure a private upstream for `{branch}` and push before deployment."
                ),
                Ok(RemoteBackupState::OutOfSync { upstream, .. }) => {
                    format!("Push or reconcile `{upstream}` before deployment.")
                }
                Err(error) => format!("Verify the private Git backup before deployment: {error}"),
            }
        };
        let workspace = Workspace::open(&self.content_root)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        let media_asset_count = workspace
            .scan()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?
            .assets()
            .len();
        Ok(DeploymentPlan {
            branch,
            head,
            deploy_target,
            dirty_count,
            media_asset_count,
            next_action,
            commit_activity: self.commit_activity(&release_scopes)?,
            scopes,
        })
    }

    pub fn sync_status(&self) -> Result<DeliverySyncStatus, DeliveryControlError> {
        let repo = self.repo()?;
        let head = repo
            .head_revision()
            .map_err(|e| DeliveryControlError::Repository(e.to_string()))?;
        let state = if api_base_url(&self.content_root).is_err() || self.bearer_token.is_none() {
            Some(DeliverySyncState::NotConfigured.id())
        } else if head.is_none() {
            Some("uncommitted")
        } else {
            None
        };
        if let Some(state) = state {
            return Ok(DeliverySyncStatus {
                local_head: head.unwrap_or_default(),
                remote_head: String::new(),
                local_commits: 0,
                remote_commits: 0,
                workspace_changes: self.workspace_changes()?.len(),
                state: state.into(),
            });
        }
        let remote_head = self.remote_content_version()?.content_commit;
        validate_remote_commit(&remote_head)?;
        self.sync_status_against(&repo, remote_head)
            .map(|(status, _)| status)
    }

    /// Bring the workspace to the exact revision currently deployed.
    ///
    /// Fetching only populates remote-tracking objects. The checked-out branch
    /// moves exclusively through a fast-forward, so local commits can never be
    /// rewritten and Git remains the owner of deciding whether dirty worktree
    /// paths overlap the incoming tree update. Non-overlapping edits survive
    /// the operation unchanged; overlapping edits stop before HEAD moves.
    pub fn pull_remote_changes(&self) -> Result<DeliverySyncStatus, DeliveryControlError> {
        let repo = self.repo()?;
        let remote_head = self.remote_content_version()?.content_commit;
        validate_remote_commit(&remote_head)?;
        let (initial_status, initial_state) =
            self.sync_status_against(&repo, remote_head.clone())?;
        if matches!(
            initial_state,
            DeliverySyncState::Synchronized | DeliverySyncState::LocalAhead
        ) {
            return Ok(initial_status);
        }

        let branch = run(&repo, ["branch", "--show-current"])?;
        if branch.is_empty() {
            return Err(DeliveryControlError::UnsafeSynchronization(
                "detached HEAD cannot receive deployed changes".to_owned(),
            ));
        }
        let remote = repo
            .run(["config", "--get", &format!("branch.{branch}.remote")])
            .ok()
            .map(|output| output.stdout)
            .filter(|remote| !remote.is_empty() && remote != ".");
        let merge_ref = repo
            .run(["config", "--get", &format!("branch.{branch}.merge")])
            .ok()
            .map(|output| output.stdout)
            .filter(|merge_ref| !merge_ref.is_empty());
        let (remote, merge_ref) = match (remote, merge_ref) {
            (Some(remote), Some(merge_ref)) => (remote, merge_ref),
            _ => return self.pull_deployed_source_snapshot(&repo, remote_head),
        };

        run(&repo, ["fetch", "--prune", &remote])?;
        let upstream = format!("{remote}/{}", merge_ref.trim_start_matches("refs/heads/"));
        repo.run(["cat-file", "-e", &format!("{remote_head}^{{commit}}")])
            .map_err(|_| {
                DeliveryControlError::UnsafeSynchronization(format!(
                    "deployed revision `{}` is not available from `{upstream}`",
                    short_oid(&remote_head),
                ))
            })?;
        repo.run(["merge-base", "--is-ancestor", &remote_head, &upstream])
            .map_err(|_| {
                DeliveryControlError::UnsafeSynchronization(format!(
                    "deployed revision `{}` is not contained in `{upstream}`",
                    short_oid(&remote_head),
                ))
            })?;

        let (observed, observed_state) = self.sync_status_against(&repo, remote_head.clone())?;
        match observed_state {
            DeliverySyncState::Synchronized => return Ok(observed),
            DeliverySyncState::RemoteAhead => {}
            DeliverySyncState::LocalAhead => {
                return Err(DeliveryControlError::UnsafeSynchronization(format!(
                    "local branch is {} commit(s) ahead of the deployed revision",
                    observed.local_commits,
                )))
            }
            DeliverySyncState::Diverged => {
                return Err(DeliveryControlError::UnsafeSynchronization(format!(
                    "local and deployed histories diverged ({} local, {} deployed)",
                    observed.local_commits, observed.remote_commits,
                )))
            }
            DeliverySyncState::RemoteUnknown | DeliverySyncState::NotConfigured => {
                return Err(DeliveryControlError::UnsafeSynchronization(format!(
                    "deployed revision `{}` could not be compared after fetch",
                    short_oid(&remote_head),
                )))
            }
        }

        repo.run(["merge", "--ff-only", &remote_head])
            .map_err(|error| {
                DeliveryControlError::UnsafeSynchronization(format!(
                    "incoming changes overlap local workspace edits: {error}"
                ))
            })?;
        WorkspaceSync::open(&self.content_root, &self.db_path)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?
            .sync()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;

        self.sync_status_against(&repo, remote_head)
            .map(|(status, _)| status)
    }

    fn pull_deployed_source_snapshot(
        &self,
        repo: &GitRepo,
        remote_head: String,
    ) -> Result<DeliverySyncStatus, DeliveryControlError> {
        let mut client =
            ContentRecoveryClient::open(&self.content_root).map_err(map_recovery_sync_error)?;
        if let Some(token) = &self.bearer_token {
            client = client.with_bearer_token(token);
        }
        client
            .pull_into_repository(&self.content_root, &remote_head)
            .map_err(map_recovery_sync_error)?;
        WorkspaceSync::open(&self.content_root, &self.db_path)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?
            .sync()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        self.sync_status_against(repo, remote_head)
            .map(|(status, _)| status)
    }

    fn sync_status_against(
        &self,
        repo: &GitRepo,
        remote_head: String,
    ) -> Result<(DeliverySyncStatus, DeliverySyncState), DeliveryControlError> {
        let local_head = run(repo, ["rev-parse", "HEAD"])?;
        let comparison_head =
            local_recovery_anchor(repo, &remote_head).unwrap_or_else(|| remote_head.clone());
        let workspace_changes = workspace_change_count(repo)?;
        if local_head == comparison_head {
            return Ok((
                DeliverySyncStatus {
                    local_head,
                    remote_head,
                    local_commits: 0,
                    remote_commits: 0,
                    workspace_changes,
                    state: DeliverySyncState::Synchronized.id().to_owned(),
                },
                DeliverySyncState::Synchronized,
            ));
        }
        let local_commits = revision_count(repo, &format!("{comparison_head}..{local_head}"));
        let remote_commits = revision_count(repo, &format!("{local_head}..{comparison_head}"));
        let state = match (local_commits, remote_commits) {
            (Some(local), Some(0)) if local > 0 => DeliverySyncState::LocalAhead,
            (Some(0), Some(remote)) if remote > 0 => DeliverySyncState::RemoteAhead,
            (Some(local), Some(remote)) if local > 0 && remote > 0 => DeliverySyncState::Diverged,
            _ => DeliverySyncState::RemoteUnknown,
        };
        Ok((
            DeliverySyncStatus {
                local_head,
                remote_head,
                local_commits: local_commits.unwrap_or(0),
                remote_commits: remote_commits.unwrap_or(1),
                workspace_changes,
                state: state.id().to_owned(),
            },
            state,
        ))
    }

    /// Every changed path in the content repo, regardless of scope — the
    /// full picture behind the `workspace_changes` count on the sync-status
    /// card, so a caller can list and select individual files instead of
    /// only seeing a total.
    pub fn workspace_changes(&self) -> Result<Vec<WorkspaceFileChange>, DeliveryControlError> {
        let repo = self.repo()?;
        // `-z` NUL-terminates each record instead of newline-joining them, so
        // a rename's `old -> new` never has to be told apart from a literal
        // " -> " inside an ordinary path by string splitting. `run_raw` (not
        // `run`) matters just as much here: the first column of the first
        // record is blank whenever that file has nothing staged, and a plain
        // `.trim()` would eat that meaningful leading space.
        Ok(parse_workspace_changes_z(&run_raw(
            &repo,
            ["status", "--porcelain", "-z"],
        )?))
    }

    /// Diff for one path. Staged changes (already `git add`-ed) diff against
    /// the index; everything else diffs the working tree, with a brand new
    /// untracked file rendered as a synthetic all-added diff since git has no
    /// blob to diff it against yet.
    pub fn file_diff(&self, path: &str, staged: bool) -> Result<String, DeliveryControlError> {
        let repo = self.repo()?;
        if staged {
            return run(&repo, ["diff", "--cached", "--", path]);
        }
        let is_untracked = run(&repo, ["status", "--porcelain", "--", path])?
            .lines()
            .next()
            .is_some_and(|line| line.starts_with("??"));
        if is_untracked {
            return self.untracked_file_diff(path);
        }
        run(&repo, ["diff", "--", path])
    }

    /// Diff for one changed file of a section commit preview: exactly what
    /// [`Self::release_scope`] would commit for that path (HEAD against the
    /// working tree), so the preview cannot disagree with the commit.
    pub fn release_file_diff(
        &self,
        scope: ReleaseScope,
        path: &str,
    ) -> Result<String, DeliveryControlError> {
        if !scope_owns_path(scope, path) || path.split('/').any(|segment| segment == "..") {
            return Err(DeliveryControlError::Repository(format!(
                "`{path}` is not part of the {} section",
                scope.label()
            )));
        }
        let repo = self.repo()?;
        let is_untracked = run_raw(
            &repo,
            ["status", "--porcelain", "--untracked-files=all", "--", path],
        )?
        .lines()
        .next()
        .is_some_and(|line| line.starts_with("??"));
        if is_untracked {
            return self.untracked_file_diff(path);
        }
        run(&repo, ["diff", "HEAD", "--", path])
    }

    /// A brand new untracked file rendered as a synthetic all-added diff,
    /// since git has no blob to diff it against yet.
    fn untracked_file_diff(&self, path: &str) -> Result<String, DeliveryControlError> {
        let contents = fs::read_to_string(self.content_root.join(path))
            .map_err(|error| DeliveryControlError::Repository(error.to_string()))?;
        let body = contents
            .lines()
            .map(|line| format!("+{line}"))
            .collect::<Vec<_>>()
            .join("\n");
        Ok(format!("--- /dev/null\n+++ b/{path}\n{body}"))
    }

    /// Unified diff for exactly the index content that `commit_workspace`
    /// would commit. This is the read model used by AI commit-message
    /// generation, so generated text cannot describe unstaged edits.
    pub fn staged_diff(&self) -> Result<String, DeliveryControlError> {
        let repo = self.repo()?;
        let staged = run(&repo, ["diff", "--cached", "--name-only"])?;
        if staged.trim().is_empty() {
            return Err(DeliveryControlError::NothingStaged);
        }
        run(&repo, ["diff", "--cached"])
    }

    /// Stage the given paths (`git add`), so they will be included the next
    /// time `commit_workspace` runs.
    pub fn stage_paths(&self, paths: &[String]) -> Result<(), DeliveryControlError> {
        if paths.is_empty() {
            return Ok(());
        }
        let repo = self.repo()?;
        let mut args = vec!["add".to_owned(), "--".to_owned()];
        args.extend(paths.iter().cloned());
        run(&repo, args)?;
        Ok(())
    }

    /// Unstage the given paths (`git restore --staged`) without touching
    /// the working-tree edits themselves.
    pub fn unstage_paths(&self, paths: &[String]) -> Result<(), DeliveryControlError> {
        if paths.is_empty() {
            return Ok(());
        }
        let repo = self.repo()?;
        let mut args = vec!["restore".to_owned(), "--staged".to_owned(), "--".to_owned()];
        args.extend(paths.iter().cloned());
        run(&repo, args)?;
        Ok(())
    }

    /// Commit whatever is currently staged in the content repo. Errors if
    /// nothing is staged, so a caller cannot produce an accidental empty
    /// commit.
    pub fn commit_workspace(&self, message: &str) -> Result<String, DeliveryControlError> {
        let message = message.trim();
        if message.is_empty() {
            return Err(DeliveryControlError::EmptyCommitMessage);
        }
        let repo = self.repo()?;
        let staged = run(&repo, ["diff", "--cached", "--name-only"])?;
        if staged.trim().is_empty() {
            return Err(DeliveryControlError::NothingStaged);
        }
        run(
            &repo,
            [
                "-c".to_owned(),
                format!("user.name={AUTHOR_NAME}"),
                "-c".to_owned(),
                format!("user.email={AUTHOR_EMAIL}"),
                "commit".to_owned(),
                "-m".to_owned(),
                message.to_owned(),
            ],
        )?;
        run(&repo, ["rev-parse", "HEAD"])
    }

    fn commit_activity(
        &self,
        scopes: &[ReleaseScope],
    ) -> Result<Vec<CommitActivityDay>, DeliveryControlError> {
        let repo = self.repo()?;
        if repo
            .head_revision()
            .map_err(|e| DeliveryControlError::Repository(e.to_string()))?
            .is_none()
        {
            return Ok(Vec::new());
        }
        let paths = scopes
            .iter()
            .flat_map(|scope| scope.paths().iter().copied())
            .collect::<Vec<_>>();
        let output = run(
            &repo,
            path_args(
                &[
                    "log",
                    "--since=1 year ago",
                    "--date=short",
                    "--pretty=format:%x1e%H%x1f%cs",
                    "--name-only",
                ],
                &paths,
            ),
        )?;
        let mut commits = BTreeMap::<String, BTreeMap<String, BTreeSet<ReleaseScope>>>::new();
        for record in output
            .split('\x1e')
            .filter(|record| !record.trim().is_empty())
        {
            let mut lines = record.lines().filter(|line| !line.trim().is_empty());
            let Some((hash, date)) = lines.next().and_then(|line| line.split_once('\x1f')) else {
                continue;
            };
            let commit_scopes = lines
                .filter_map(|path| {
                    scopes
                        .iter()
                        .copied()
                        .find(|scope| scope_owns_path(*scope, path))
                })
                .collect::<BTreeSet<_>>();
            commits
                .entry(date.to_owned())
                .or_default()
                .insert(hash.to_owned(), commit_scopes);
        }
        Ok(commits
            .into_iter()
            .map(|(date, commits)| CommitActivityDay {
                date,
                commit_count: commits.len(),
                scopes: commits
                    .into_values()
                    .flatten()
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect(),
            })
            .collect())
    }

    /// Commit every change inside one section with the owner-reviewed
    /// `message`. Only section roots that Git can match are passed as
    /// pathspecs: a freshly initialised workspace keeps empty, untracked
    /// section directories (for example `resources/episode`), and naming
    /// them would make `git add`/`git commit` fail.
    pub fn release_scope(
        &self,
        scope: ReleaseScope,
        message: &str,
    ) -> Result<ScopeReleaseStatus, DeliveryControlError> {
        let message = message.trim();
        if message.is_empty() {
            return Err(DeliveryControlError::EmptyCommitMessage);
        }
        let before = self.scope_status(scope)?;
        if before.dirty_count == 0 {
            return Err(DeliveryControlError::NothingToRelease(
                scope.label().to_owned(),
            ));
        }
        let repo = self.repo()?;
        // `git add` and `git commit --only` reject a pathspec that matches
        // nothing, and a fresh workspace has empty, untracked scope folders
        // (e.g. `resources/episode`). Each mutating call therefore receives
        // only the scope roots Git can actually resolve at that moment.
        let addable = addable_scope_paths(&repo, scope)?;
        if addable.is_empty() {
            return Err(DeliveryControlError::NothingToRelease(
                scope.label().to_owned(),
            ));
        }
        run(&repo, path_args(&["add", "-A"], &addable))?;
        let staged = run(
            &repo,
            path_args(&["diff", "--cached", "--name-only"], &addable),
        )?;
        if staged.trim().is_empty() {
            return Err(DeliveryControlError::NothingToRelease(
                scope.label().to_owned(),
            ));
        }
        let committable = scope
            .paths()
            .iter()
            .copied()
            .filter(|path| {
                staged
                    .lines()
                    .any(|staged_path| path_is_within(staged_path, path))
            })
            .collect::<Vec<_>>();
        let mut args = vec![
            "-c".to_owned(),
            format!("user.name={AUTHOR_NAME}"),
            "-c".to_owned(),
            format!("user.email={AUTHOR_EMAIL}"),
            "commit".to_owned(),
            "--only".to_owned(),
            "-m".to_owned(),
            message.to_owned(),
            "--".to_owned(),
        ];
        args.extend(committable.iter().map(|path| (*path).to_owned()));
        run(&repo, args)?;
        let sync = WorkspaceSync::open(&self.content_root, &self.db_path)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        let sync_status = sync
            .status()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        if sync_status.state != WorkspaceSyncState::Synchronized {
            sync.sync()
                .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        }
        self.scope_status(scope)
    }

    pub fn deploy_content(&self) -> Result<DeployRunStatus, DeliveryControlError> {
        self.ensure_releaseable()?;
        self.ensure_remote_backup()?;
        let content_commit = self.content_commit()?;
        let sync = WorkspaceSync::open(&self.content_root, &self.db_path)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        let sync_status = sync
            .status()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        if sync_status.state != WorkspaceSyncState::Synchronized {
            sync.sync()
                .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        }
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(DeliveryControlError::MissingCredential)?;
        let base = api_base_url(&self.content_root)
            .map_err(|error| DeliveryControlError::Remote(error.to_string()))?;
        let workspace = Workspace::open(&self.content_root)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        let scan = workspace
            .scan()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        let media = scan
            .assets()
            .iter()
            .map(|asset| {
                let hash = hash_deploy_media_asset(&asset.abs_path).map_err(|error| {
                    DeliveryControlError::Runner(format!(
                        "hash deploy media {}: {error}",
                        asset.rel_path
                    ))
                })?;
                Ok(MediaAssetManifest {
                    path: asset.rel_path.clone(),
                    hash: hash.to_string(),
                })
            })
            .collect::<Result<Vec<_>, DeliveryControlError>>()?;
        let agent = deploy_http_agent(&self.content_root, &base);
        let url = format!("{base}/api/v1/content/deploy");
        let empty_upload = BTreeSet::new();
        let bundle =
            self.build_deploy_bundle(&content_commit, &media, &empty_upload, scan.assets())?;
        let raw_response = post_content_bundle(&agent, &url, token, &bundle);
        let raw_response = match raw_response.map_err(|error| *error) {
            Err(ureq::Error::Status(409, response)) => {
                let plan: MediaPlanResponse = response.into_json().map_err(|error| {
                    DeliveryControlError::Remote(format!("{url}: invalid media plan: {error}"))
                })?;
                let upload_paths = plan.upload_paths.into_iter().collect::<BTreeSet<_>>();
                if upload_paths
                    .iter()
                    .any(|path| !media.iter().any(|asset| asset.path == *path))
                {
                    return Err(DeliveryControlError::Remote(
                        "server requested an unknown media path".to_owned(),
                    ));
                }
                let bundle = self.build_deploy_bundle(
                    &content_commit,
                    &media,
                    &upload_paths,
                    scan.assets(),
                )?;
                post_content_bundle(&agent, &url, token, &bundle)
                    .map_err(|error| deploy_http_error(&url, *error))?
            }
            Err(error) => return Err(deploy_http_error(&url, error)),
            Ok(response) => response,
        };
        let response: ContentDeployResponse = raw_response
            .into_json()
            .map_err(|error| DeliveryControlError::Remote(format!("{url}: {error}")))?;
        if !response.success
            || response.state != "complete"
            || !response.media_root_ok
            || !response.static_published
            || response.static_release.is_empty()
            || response.content_commit != content_commit
        {
            return Err(DeliveryControlError::Remote(format!(
                "deployment verification failed: state={}, commit={}, media_root_ok={}, static_published={}, static_release={}",
                response.state,
                response.content_commit,
                response.media_root_ok,
                response.static_published,
                response.static_release,
            )));
        }
        Ok(DeployRunStatus {
            success: true,
            content_commit,
            static_published: response.static_published,
            static_release: response.static_release.clone(),
            stdout: format!(
                "Deployed content {} ({}) and SEO release {} at {}",
                response.content_commit,
                response.content_hash,
                response.static_release,
                response.generated_at,
            ),
            stderr: String::new(),
        })
    }

    pub fn rollback_content(&self) -> Result<DeployRunStatus, DeliveryControlError> {
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(DeliveryControlError::MissingCredential)?;
        let base = api_base_url(&self.content_root)
            .map_err(|error| DeliveryControlError::Remote(error.to_string()))?;
        let agent = deploy_http_agent(&self.content_root, &base);
        let url = format!("{base}/api/v1/content/rollback");
        let response: ContentDeployResponse = agent
            .post(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|error| deploy_http_error(&url, error))?
            .into_json()
            .map_err(|error| DeliveryControlError::Remote(format!("{url}: {error}")))?;
        if !response.success
            || response.state != "complete"
            || !response.media_root_ok
            || !response.static_published
            || response.static_release.is_empty()
            || response.content_commit.is_empty()
        {
            return Err(DeliveryControlError::Remote(format!(
                "rollback verification failed: state={}, commit={}, media_root_ok={}, static_published={}, static_release={}",
                response.state,
                response.content_commit,
                response.media_root_ok,
                response.static_published,
                response.static_release,
            )));
        }
        Ok(DeployRunStatus {
            success: true,
            content_commit: response.content_commit.clone(),
            static_published: true,
            static_release: response.static_release.clone(),
            stdout: format!(
                "Rolled back to content {} ({}) and static release {} at {}",
                response.content_commit,
                response.content_hash,
                response.static_release,
                response.generated_at,
            ),
            stderr: String::new(),
        })
    }

    fn build_deploy_bundle(
        &self,
        content_commit: &str,
        media: &[MediaAssetManifest],
        upload_paths: &BTreeSet<String>,
        assets: &[crate::ScannedAsset],
    ) -> Result<Vec<u8>, DeliveryControlError> {
        let staging =
            tempfile::tempdir().map_err(|error| DeliveryControlError::Runner(error.to_string()))?;
        let database = staging.path().join("portfolio.db");
        fs::copy(&self.db_path, &database)
            .map_err(|error| DeliveryControlError::Runner(format!("stage database: {error}")))?;
        let connection = Connection::open(&database).map_err(|error| {
            DeliveryControlError::Runner(format!("open staged database: {error}"))
        })?;
        connection
            .execute("UPDATE sync_meta SET content_commit = ?1", [content_commit])
            .map_err(|error| {
                DeliveryControlError::Runner(format!("stamp content commit: {error}"))
            })?;
        let content_hash: String = connection
            .query_row("SELECT content_hash FROM sync_meta LIMIT 1", [], |row| {
                row.get(0)
            })
            .map_err(|error| DeliveryControlError::Runner(format!("read content hash: {error}")))?;
        drop(connection);
        let database_bytes = fs::read(&database).map_err(|error| {
            DeliveryControlError::Runner(format!("read staged database: {error}"))
        })?;
        let source = ContentSourceArchive::from_repository(&self.content_root)
            .map_err(|error| DeliveryControlError::Runner(error.to_string()))?;
        let manifest = ContentDeployManifest {
            version: 3,
            schema_version: crate::schema::SUPPORTED_SCHEMA_VERSION,
            content_commit: content_commit.to_owned(),
            content_hash,
            database_sha256: format!("{:x}", Sha256::digest(&database_bytes)),
            source_sha256: source.sha256().to_owned(),
            media: media.to_vec(),
        };

        let encoder = GzEncoder::new(Vec::new(), Compression::default());
        let mut archive = Builder::new(encoder);
        let manifest_bytes = serde_json::to_vec(&manifest)
            .map_err(|error| DeliveryControlError::Runner(format!("encode manifest: {error}")))?;
        append_bytes(&mut archive, "manifest.json", &manifest_bytes)?;
        append_bytes(&mut archive, "portfolio.db", &database_bytes)?;
        append_bytes(&mut archive, "source.tar", source.bytes())?;
        append_directory(&mut archive, "media")?;
        for asset in assets
            .iter()
            .filter(|asset| upload_paths.contains(&asset.rel_path))
        {
            let optimized = tempfile::NamedTempFile::new().map_err(|error| {
                DeliveryControlError::Runner(format!("stage optimized media: {error}"))
            })?;
            stage_deploy_media_asset(&asset.abs_path, optimized.path()).map_err(|error| {
                DeliveryControlError::Runner(format!(
                    "stage media {} for bundle: {error}",
                    asset.rel_path
                ))
            })?;
            archive
                .append_path_with_name(optimized.path(), format!("media/{}", asset.rel_path))
                .map_err(|error| DeliveryControlError::Runner(format!("bundle media: {error}")))?;
        }
        let encoder = archive
            .into_inner()
            .map_err(|error| DeliveryControlError::Runner(format!("finish bundle: {error}")))?;
        encoder
            .finish()
            .map_err(|error| DeliveryControlError::Runner(format!("compress bundle: {error}")))
    }

    pub fn remote_content_version(&self) -> Result<RemoteContentVersion, DeliveryControlError> {
        let base = api_base_url(&self.content_root)
            .map_err(|error| DeliveryControlError::Remote(error.to_string()))?;
        let url = format!("{base}/api/v1/content/status");
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(DeliveryControlError::MissingCredential)?;
        let agent = deploy_http_agent(&self.content_root, &base);
        let mut request = agent.get(&url);
        request = request.set("Authorization", &format!("Bearer {token}"));
        request
            .call()
            .map_err(|error| DeliveryControlError::Remote(format!("{url}: {error}")))?
            .into_json()
            .map_err(|error| DeliveryControlError::Remote(format!("{url}: {error}")))
    }

    pub fn verify_remote(&self) -> Result<DeployVerificationResult, DeliveryControlError> {
        let expected = self.content_commit()?;
        let remote = self.remote_content_version()?;
        let verified =
            remote.health == "ok" && remote.media_root_ok && remote.content_commit == expected;
        Ok(DeployVerificationResult {
            mismatch_reason: (!verified).then(|| {
                format!(
                    "expected commit `{expected}` with healthy media, got commit `{}` and media_root_ok={}",
                    remote.content_commit, remote.media_root_ok
                )
            }),
            verified,
            expected_content_commit: expected,
            remote,
        })
    }

    fn repo(&self) -> Result<GitRepo, DeliveryControlError> {
        GitRepo::open(&self.content_root)
            .map_err(|error| DeliveryControlError::Repository(error.to_string()))
    }

    fn content_commit(&self) -> Result<String, DeliveryControlError> {
        run(&self.repo()?, ["rev-parse", "HEAD"])
    }

    /// A deployment bundle represents one immutable authored revision. Local
    /// edits must never be projected under the previous Git commit.
    fn ensure_releaseable(&self) -> Result<(), DeliveryControlError> {
        let repo = self.repo()?;
        // `agent/` is a private, non-projectable namespace and does not alter
        // a public release. Only schema and authored resource changes block
        // provenance stamping.
        let pending = run_raw(
            &repo,
            [
                "status",
                "--porcelain",
                "--untracked-files=all",
                "--",
                "SCHEMA.md",
                "resources",
            ],
        )?;
        let paths = pending
            .lines()
            .filter_map(parse_porcelain_path)
            .take(8)
            .collect::<Vec<_>>();
        if paths.is_empty() {
            return Ok(());
        }
        let suffix = (pending.lines().count() > paths.len()).then_some(", …");
        Err(DeliveryControlError::DirtyWorkspace(format!(
            "{}{}",
            paths.join(", "),
            suffix.unwrap_or_default(),
        )))
    }

    /// Public release archives deliberately exclude `agent/`; deployment is
    /// therefore legal only after the complete content commit is verifiably
    /// present at the branch's private upstream. An upstream that is merely
    /// behind is repaired in place with a plain fast-forward push before the
    /// verdict — every release surface (CLI and desktop) shares this gate,
    /// so none of them fails on work the owner simply hasn't pushed yet.
    fn ensure_remote_backup(&self) -> Result<(), DeliveryControlError> {
        let repo = self.repo()?;
        let pending = run_raw(&repo, ["status", "--porcelain", "--untracked-files=all"])?;
        let paths = pending
            .lines()
            .filter_map(parse_porcelain_path)
            .take(8)
            .collect::<Vec<_>>();
        if !paths.is_empty() {
            let suffix = (pending.lines().count() > paths.len()).then_some(", …");
            return Err(DeliveryControlError::UndurableRepository(format!(
                "uncommitted repository paths are not backed up: {}{}",
                paths.join(", "),
                suffix.unwrap_or_default(),
            )));
        }
        let state = repo
            .remote_backup_state()
            .map_err(|error| DeliveryControlError::Repository(error.to_string()))?;
        match state {
            RemoteBackupState::Synchronized { .. } => Ok(()),
            RemoteBackupState::MissingUpstream { branch } => {
                Err(DeliveryControlError::UndurableRepository(format!(
                    "branch `{branch}` has no external upstream; configure a private remote and push it"
                )))
            }
            RemoteBackupState::OutOfSync {
                upstream,
                local_head,
                remote_head,
            } => {
                // Never a force: git refuses a diverged push, and only the
                // gate's own re-query — not the push's exit status — decides
                // that the backup became durable.
                let repaired = push_branch_to_backup(&repo).is_ok()
                    && matches!(
                        repo.remote_backup_state(),
                        Ok(RemoteBackupState::Synchronized { .. })
                    );
                if repaired {
                    return Ok(());
                }
                Err(DeliveryControlError::UndurableRepository(format!(
                    "local HEAD {} is not backed up at `{upstream}` (remote {}); push or reconcile the branch first",
                    short_oid(&local_head),
                    short_oid(&remote_head),
                )))
            }
        }
    }
}

/// Push the checked-out branch to its configured upstream remote. Divergence
/// or an unreachable remote is not repairable here: git refuses, and the
/// durability gate reports the manual path.
fn push_branch_to_backup(repo: &GitRepo) -> Result<(), DeliveryControlError> {
    let branch = run(repo, ["rev-parse", "--abbrev-ref", "HEAD"])?;
    let tracking = format!("branch.{branch}.remote");
    let remote = run(repo, ["config", "--get", tracking.as_str()])?;
    run(repo, ["push", remote.as_str(), branch.as_str()]).map(|_| ())
}

fn short_oid(value: &str) -> &str {
    value.get(..12).unwrap_or(value)
}

fn validate_remote_commit(value: &str) -> Result<(), DeliveryControlError> {
    if matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err(DeliveryControlError::Remote(
        "deployed content status returned an invalid commit identifier".to_owned(),
    ))
}

fn parse_porcelain_path(line: &str) -> Option<String> {
    let value = line.get(3..)?.trim();
    if value.is_empty() {
        return None;
    }
    Some(
        value
            .rsplit_once(" -> ")
            .map_or(value, |(_, destination)| destination)
            .trim_matches('"')
            .to_owned(),
    )
}

fn workspace_change_count(repo: &GitRepo) -> Result<usize, DeliveryControlError> {
    Ok(run(repo, ["status", "--porcelain"])?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count())
}

fn scope_owns_path(scope: ReleaseScope, path: &str) -> bool {
    scope.paths().iter().any(|root| path_is_within(path, root))
}

fn path_is_within(path: &str, root: &str) -> bool {
    path.strip_prefix(root)
        .is_some_and(|suffix| suffix.is_empty() || suffix.starts_with('/'))
}

/// The scope roots that hold at least one tracked or untracked (non-ignored)
/// file. Git rejects a mutating pathspec that matches nothing, so empty or
/// absent scope folders must be omitted rather than passed on.
fn addable_scope_paths(
    repo: &GitRepo,
    scope: ReleaseScope,
) -> Result<Vec<&'static str>, DeliveryControlError> {
    let listing = ["ls-files", "--cached", "--others", "--exclude-standard"];
    let mut known = Vec::new();
    for path in scope.paths().iter().copied() {
        if !run(repo, path_args(&listing, &[path]))?.trim().is_empty() {
            known.push(path);
        }
    }
    Ok(known)
}

fn run<I, S>(repo: &GitRepo, args: I) -> Result<String, DeliveryControlError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    repo.run(args)
        .map(|output| output.stdout)
        .map_err(|error| DeliveryControlError::Repository(error.to_string()))
}

fn map_recovery_sync_error(error: ContentRecoveryError) -> DeliveryControlError {
    match error {
        ContentRecoveryError::Conflict(message) | ContentRecoveryError::Destination(message) => {
            DeliveryControlError::UnsafeSynchronization(message)
        }
        ContentRecoveryError::MissingCredential => DeliveryControlError::MissingCredential,
        other => DeliveryControlError::Remote(other.to_string()),
    }
}

/// Like [`run`], but preserves a meaningful leading space instead of
/// trimming it away — required for `git status --porcelain`, whose first
/// column is blank exactly when nothing is staged for that file.
fn run_raw<I, S>(repo: &GitRepo, args: I) -> Result<String, DeliveryControlError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    repo.run_raw(repo.root(), args)
        .map(|output| output.stdout)
        .map_err(|error| DeliveryControlError::Repository(error.to_string()))
}

fn revision_count(repo: &GitRepo, revision: &str) -> Option<usize> {
    repo.run(["rev-list", "--count", revision])
        .ok()?
        .stdout
        .trim()
        .parse()
        .ok()
}

/// A recovered workspace starts a new Git object graph, but its root commit
/// records the production revision whose public source tree it materialized.
/// Treat that commit as the local representative of the deployed OID so the
/// dashboard does not misclassify every recovered checkout as remote-unknown.
fn local_recovery_anchor(repo: &GitRepo, deployed_commit: &str) -> Option<String> {
    let subject = format!("recovery: restore deployed content {deployed_commit}");
    let output = repo
        .run([
            "log",
            "-1",
            "--format=%H",
            "--fixed-strings",
            "--grep",
            &subject,
            "HEAD",
        ])
        .ok()?;
    (!output.stdout.is_empty()).then_some(output.stdout)
}

fn deploy_http_agent(content_root: &Path, api_base: &str) -> ureq::Agent {
    let mut builder = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(3))
        .timeout_read(Duration::from_secs(300))
        .timeout_write(Duration::from_secs(60));
    if let Some((api_host, deploy_ip)) = deploy_socket_override(content_root, api_base) {
        builder = builder.resolver(move |netloc: &str| {
            let (host, port) = netloc
                .rsplit_once(':')
                .and_then(|(host, port)| port.parse::<u16>().ok().map(|port| (host, port)))
                .ok_or_else(|| {
                    std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid network address")
                })?;
            if host == api_host {
                Ok(vec![SocketAddr::new(deploy_ip, port)])
            } else {
                netloc.to_socket_addrs().map(Iterator::collect)
            }
        });
    }
    builder.build()
}

fn deploy_socket_override(content_root: &Path, api_base: &str) -> Option<(String, IpAddr)> {
    let config = fs::read_to_string(content_root.parent()?.join("silan-viking.toml")).ok()?;
    let config: toml::Value = toml::from_str(&config).ok()?;
    let deploy = config.get("deploy")?.as_table()?;
    let deploy_ip = deploy.get("host")?.as_str()?.parse::<IpAddr>().ok()?;
    let api_host = url::Url::parse(api_base).ok()?.host_str()?.to_owned();
    Some((api_host, deploy_ip))
}

fn post_content_bundle(
    agent: &ureq::Agent,
    url: &str,
    token: &str,
    bundle: &[u8],
) -> Result<ureq::Response, Box<ureq::Error>> {
    agent
        .post(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set(
            "Content-Type",
            "application/vnd.silan.content-deploy+tar+gzip",
        )
        .send_bytes(bundle)
        .map_err(Box::new)
}

fn deploy_http_error(url: &str, error: ureq::Error) -> DeliveryControlError {
    match error {
        ureq::Error::Status(status, response) => {
            let detail = response
                .into_string()
                .unwrap_or_else(|_| "response body unavailable".to_owned());
            DeliveryControlError::Remote(format!("{url}: HTTP {status}: {}", detail.trim()))
        }
        other => DeliveryControlError::Remote(format!("{url}: {other}")),
    }
}

fn append_bytes(
    archive: &mut Builder<GzEncoder<Vec<u8>>>,
    path: &str,
    bytes: &[u8],
) -> Result<(), DeliveryControlError> {
    let mut header = tar::Header::new_gnu();
    header.set_size(bytes.len() as u64);
    header.set_mode(0o600);
    header.set_cksum();
    archive
        .append_data(&mut header, path, bytes)
        .map_err(|error| DeliveryControlError::Runner(format!("bundle {path}: {error}")))
}

fn append_directory(
    archive: &mut Builder<GzEncoder<Vec<u8>>>,
    path: &str,
) -> Result<(), DeliveryControlError> {
    let mut header = tar::Header::new_gnu();
    header.set_entry_type(tar::EntryType::Directory);
    header.set_size(0);
    header.set_mode(0o755);
    header.set_cksum();
    archive
        .append_data(&mut header, path, std::io::empty())
        .map_err(|error| DeliveryControlError::Runner(format!("bundle {path}: {error}")))
}

fn path_args(prefix: &[&str], paths: &[&str]) -> Vec<String> {
    let mut args = prefix
        .iter()
        .map(|value| (*value).to_owned())
        .collect::<Vec<_>>();
    args.push("--".to_owned());
    args.extend(paths.iter().map(|value| (*value).to_owned()));
    args
}

fn parse_status(line: &str) -> Option<VersionChange> {
    Some(VersionChange {
        status: line.get(..2)?.trim().to_owned(),
        path: line.get(3..)?.split(" -> ").last()?.trim().to_owned(),
    })
}

/// Parse the NUL-terminated `git status --porcelain -z` stream. Unlike the
/// newline form, a rename or copy is two separate NUL-delimited fields (the
/// current path, then the original path) rather than one line joined by the
/// literal text `" -> "` — which a path containing that exact substring could
/// otherwise be confused for.
fn parse_workspace_changes_z(raw: &str) -> Vec<WorkspaceFileChange> {
    let label = |code: u8| match code {
        b'A' => Some("Added"),
        b'D' => Some("Deleted"),
        b'R' => Some("Renamed"),
        b'C' => Some("Copied"),
        b'M' => Some("Modified"),
        _ => None,
    };

    let mut fields = raw.split('\x00');
    let mut changes = Vec::new();
    while let Some(entry) = fields.next() {
        if entry.is_empty() {
            continue;
        }
        let Some(code) = entry.get(..2) else { continue };
        let Some(path) = entry.get(3..) else { continue };
        let (index, worktree) = (code.as_bytes()[0], code.as_bytes()[1]);
        // A rename/copy carries the original path as its own NUL-delimited
        // field right after this one; consume and discard it so the next
        // loop iteration starts at the following real entry.
        if index == b'R' || index == b'C' || worktree == b'R' || worktree == b'C' {
            fields.next();
        }
        if index == b'?' && worktree == b'?' {
            changes.push(WorkspaceFileChange {
                path: path.to_owned(),
                status: "Untracked".to_owned(),
                staged: false,
                unstaged: true,
            });
            continue;
        }
        let status = label(index)
            .or_else(|| label(worktree))
            .unwrap_or("Modified");
        changes.push(WorkspaceFileChange {
            path: path.to_owned(),
            status: status.to_owned(),
            staged: index != b' ',
            unstaged: worktree != b' ',
        });
    }
    changes
}

fn parse_log(line: &str) -> Option<VersionCommit> {
    let mut values = line.split('\x1f');
    Some(VersionCommit {
        hash: values.next()?.trim().to_owned(),
        subject: values.next()?.trim().to_owned(),
        relative_time: values.next()?.trim().to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::process::Command;
    use std::thread::JoinHandle;

    fn git(directory: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(directory)
            .status()
            .expect("git");
        assert!(status.success());
    }

    fn fixture(api_base: &str) -> (tempfile::TempDir, PathBuf, PathBuf) {
        let directory = tempfile::tempdir().expect("temp");
        let content = directory.path().join("content");
        std::fs::create_dir_all(content.join("resources")).expect("resources");
        std::fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../tests/fixtures/content/SCHEMA.md"),
            content.join("SCHEMA.md"),
        )
        .expect("schema");
        std::fs::write(
            directory.path().join("silan-viking.toml"),
            format!("[deploy]\napi_base = \"{api_base}\"\n"),
        )
        .expect("config");
        git(&content, &["init", "-q"]);
        git(&content, &["add", "."]);
        git(
            &content,
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-q",
                "-m",
                "fixture",
            ],
        );
        let db = directory.path().join("portfolio.db");
        (directory, content, db)
    }

    fn serve_remote_version(listener: TcpListener, commit: String) -> JoinHandle<()> {
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read");
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(request.starts_with("GET /api/v1/content/status "));
            let body = format!(
                "{{\"health\":\"ok\",\"content_hash\":\"hash\",\"content_commit\":\"{commit}\",\"generated_at\":\"2026-08-27T00:00:00Z\",\"media_root_ok\":true}}"
            );
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("respond");
        })
    }

    fn serve_remote_version_and_source(
        listener: TcpListener,
        commit: String,
        source: ContentSourceArchive,
    ) -> JoinHandle<()> {
        std::thread::spawn(move || {
            for request_index in 0..2 {
                let (mut stream, _) = listener.accept().expect("accept");
                let mut request = [0_u8; 4096];
                let read = stream.read(&mut request).expect("read");
                let request = String::from_utf8_lossy(&request[..read]);
                assert!(request.contains("\r\nAuthorization: Bearer delivery-contract-token\r\n"));
                if request_index == 0 {
                    assert!(request.starts_with("GET /api/v1/content/status "));
                    let body = format!(
                        "{{\"health\":\"ok\",\"content_hash\":\"hash\",\"content_commit\":\"{commit}\",\"generated_at\":\"2026-08-27T00:00:00Z\",\"media_root_ok\":true}}"
                    );
                    write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        body.len(),
                        body
                    )
                    .expect("respond with status");
                } else {
                    assert!(request.starts_with("GET /api/v1/content/source "));
                    write!(
                        stream,
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nX-Silan-Content-Commit: {}\r\nX-Silan-Source-SHA256: {}\r\nConnection: close\r\n\r\n",
                        source.bytes().len(),
                        commit,
                        source.sha256(),
                    )
                    .expect("respond with source headers");
                    stream
                        .write_all(source.bytes())
                        .expect("respond with source body");
                }
            }
        })
    }

    fn configure_remote(content: &Path, remote: &Path) -> String {
        git(
            content,
            &["init", "--bare", remote.to_str().expect("remote path")],
        );
        git(
            content,
            &[
                "remote",
                "add",
                "origin",
                remote.to_str().expect("remote path"),
            ],
        );
        let branch = Command::new("git")
            .args(["branch", "--show-current"])
            .current_dir(content)
            .output()
            .expect("read branch");
        let branch = String::from_utf8(branch.stdout)
            .expect("branch utf8")
            .trim()
            .to_owned();
        git(content, &["push", "-u", "origin", &branch]);
        branch
    }

    fn commit(directory: &Path, message: &str) {
        git(directory, &["add", "."]);
        git(
            directory,
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-q",
                "-m",
                message,
            ],
        );
    }

    fn head(directory: &Path) -> String {
        let output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(directory)
            .output()
            .expect("read HEAD");
        assert!(output.status.success());
        String::from_utf8(output.stdout)
            .expect("head utf8")
            .trim()
            .to_owned()
    }

    #[test]
    fn pull_remote_changes_fast_forwards_and_preserves_non_conflicting_edits() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let (directory, content, db) = fixture(&format!("http://{address}"));
        std::fs::create_dir_all(content.join("agent/notes")).expect("local notes");
        std::fs::write(content.join("agent/notes/local.md"), "base\n").expect("local base");
        commit(&content, "test: local draft base");
        let remote = directory.path().join("remote.git");
        configure_remote(&content, &remote);
        let publisher = directory.path().join("publisher");
        git(
            directory.path(),
            &[
                "clone",
                "-q",
                remote.to_str().expect("remote path"),
                publisher.to_str().expect("publisher path"),
            ],
        );
        std::fs::create_dir_all(publisher.join("agent/notes")).expect("remote notes");
        std::fs::write(publisher.join("agent/notes/remote.md"), "remote update\n")
            .expect("remote update");
        commit(&publisher, "test: remote update");
        git(&publisher, &["push", "origin", "HEAD"]);
        let remote_head = head(&publisher);

        std::fs::write(content.join("agent/notes/local.md"), "local draft\n").expect("local draft");
        let server = serve_remote_version(listener, remote_head.clone());
        let status = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .with_bearer_token("delivery-contract-token")
            .pull_remote_changes()
            .expect("pull remote changes");
        server.join().expect("server");

        assert_eq!(status.state, "synchronized");
        assert_eq!(status.local_head, remote_head);
        assert_eq!(status.workspace_changes, 1);
        assert_eq!(
            std::fs::read_to_string(content.join("agent/notes/local.md")).expect("local draft"),
            "local draft\n"
        );
        assert!(content.join("agent/notes/remote.md").is_file());
        assert!(db.is_file(), "pull must rebuild the local projection");
    }

    #[test]
    fn sync_status_maps_a_deployed_oid_to_its_local_recovery_anchor() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let (directory, content, db) = fixture(&format!("http://{address}"));
        let deployed_commit = "38145ba5b6d4916b3901997f14ddf77154397c6a";
        git(
            &content,
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "--amend",
                "-q",
                "-m",
                &format!("recovery: restore deployed content {deployed_commit}"),
            ],
        );
        std::fs::create_dir_all(content.join("agent/notes")).expect("notes");
        std::fs::write(content.join("agent/notes/local.md"), "local update\n")
            .expect("local update");
        commit(&content, "test: local change after recovery");

        let server = serve_remote_version(listener, deployed_commit.to_owned());
        let status = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .with_bearer_token("delivery-contract-token")
            .sync_status()
            .expect("recovered sync status");
        server.join().expect("server");

        assert_eq!(status.state, "local_ahead");
        assert_eq!(status.local_commits, 1);
        assert_eq!(status.remote_commits, 0);
        assert_eq!(status.remote_head, deployed_commit);
    }

    #[test]
    fn pull_remote_changes_uses_deployed_snapshot_without_an_upstream() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let (directory, content, db) = fixture(&format!("http://{address}"));
        let old_deployed_commit = "38145ba5b6d4916b3901997f14ddf77154397c6a";
        git(
            &content,
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "--amend",
                "-q",
                "-m",
                &format!("recovery: restore deployed content {old_deployed_commit}"),
            ],
        );
        let publisher = directory.path().join("publisher");
        git(
            directory.path(),
            &[
                "clone",
                "-q",
                content.to_str().expect("content path"),
                publisher.to_str().expect("publisher path"),
            ],
        );
        std::fs::write(publisher.join(".gitignore"), "*.db\nnew-cache/\n")
            .expect("deployed source update");
        std::fs::create_dir_all(publisher.join("resources")).expect("resource directory");
        std::fs::write(publisher.join("resources/.gitkeep"), []).expect("resource root");
        commit(&publisher, "test: deployed snapshot update");
        let remote_head = head(&publisher);
        let source = ContentSourceArchive::from_repository(&publisher).expect("source archive");

        std::fs::create_dir_all(content.join("agent/notes")).expect("local notes");
        std::fs::write(content.join("agent/notes/local.md"), "committed\n").expect("local note");
        commit(&content, "test: local private update");
        std::fs::write(content.join("agent/notes/local.md"), "uncommitted\n").expect("local draft");

        let server = serve_remote_version_and_source(listener, remote_head.clone(), source);
        let status = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .with_bearer_token("delivery-contract-token")
            .pull_remote_changes()
            .expect("pull deployed snapshot");
        server.join().expect("server");

        assert_eq!(status.state, "local_ahead");
        assert_eq!(status.remote_head, remote_head);
        assert_eq!(status.remote_commits, 0);
        assert_eq!(
            std::fs::read_to_string(content.join(".gitignore")).expect("deployed gitignore"),
            "*.db\nnew-cache/\n"
        );
        assert_eq!(
            std::fs::read_to_string(content.join("agent/notes/local.md")).expect("local draft"),
            "uncommitted\n"
        );
        assert!(
            db.is_file(),
            "snapshot pull must rebuild the local projection"
        );
    }

    #[test]
    fn pull_remote_changes_stops_before_overwriting_conflicting_edits() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let (directory, content, db) = fixture(&format!("http://{address}"));
        std::fs::create_dir_all(content.join("agent/notes")).expect("notes");
        std::fs::write(content.join("agent/notes/shared.md"), "base\n").expect("base");
        commit(&content, "test: shared base");
        let remote = directory.path().join("remote.git");
        configure_remote(&content, &remote);
        let local_head = head(&content);
        let publisher = directory.path().join("publisher");
        git(
            directory.path(),
            &[
                "clone",
                "-q",
                remote.to_str().expect("remote path"),
                publisher.to_str().expect("publisher path"),
            ],
        );
        std::fs::write(publisher.join("agent/notes/shared.md"), "remote\n").expect("remote edit");
        commit(&publisher, "test: conflicting remote update");
        git(&publisher, &["push", "origin", "HEAD"]);
        let remote_head = head(&publisher);
        std::fs::write(content.join("agent/notes/shared.md"), "local\n").expect("local edit");

        let server = serve_remote_version(listener, remote_head);
        let error = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .with_bearer_token("delivery-contract-token")
            .pull_remote_changes()
            .expect_err("conflicting pull must stop");
        server.join().expect("server");

        assert!(matches!(
            error,
            DeliveryControlError::UnsafeSynchronization(_)
        ));
        assert_eq!(head(&content), local_head, "HEAD must remain unchanged");
        assert_eq!(
            std::fs::read_to_string(content.join("agent/notes/shared.md")).expect("local edit"),
            "local\n",
            "local edit must remain unchanged"
        );
    }

    #[test]
    fn remote_verification_compares_commit_and_media_readiness() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let (_directory, content, db) = fixture(&format!("http://{address}"));
        let commit = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&content)
            .output()
            .expect("head");
        let commit = String::from_utf8(commit.stdout)
            .expect("utf8")
            .trim()
            .to_owned();
        let expected = commit.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read");
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(request.starts_with("GET /api/v1/content/status "));
            assert!(request.contains("\r\nAuthorization: Bearer delivery-contract-token\r\n"));
            let body = format!(
                "{{\"health\":\"ok\",\"content_hash\":\"hash\",\"content_commit\":\"{expected}\",\"generated_at\":\"2026-07-17T00:00:00Z\",\"media_root_ok\":true}}"
            );
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("respond");
        });
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open")
            .with_bearer_token("delivery-contract-token");
        let result = control.verify_remote().expect("verify");
        server.join().expect("server");
        assert!(result.verified);
        assert_eq!(result.expected_content_commit, commit);
    }

    #[test]
    fn remote_verification_fails_before_http_without_a_credential() {
        let (_directory, content, db) = fixture("http://127.0.0.1:1");
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open")
            .with_bearer_token("");
        assert!(matches!(
            control.remote_content_version(),
            Err(DeliveryControlError::MissingCredential)
        ));
    }

    #[test]
    fn staged_diff_excludes_unstaged_edits() {
        let (_directory, content, db) = fixture("http://127.0.0.1:1");
        let path = content.join("resources/note.md");
        std::fs::write(&path, "staged version\n").expect("write staged file");
        git(&content, &["add", "resources/note.md"]);
        std::fs::write(&path, "unstaged version\n").expect("write unstaged file");

        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open");
        let diff = control.staged_diff().expect("staged diff");

        assert!(diff.contains("+staged version"));
        assert!(!diff.contains("unstaged version"));
    }

    #[test]
    fn deployment_rejects_uncommitted_content_before_network_or_projection() {
        let (_directory, content, db) = fixture("http://127.0.0.1:1");
        std::fs::write(content.join("resources/pending.md"), "not committed\n")
            .expect("write pending content");
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open")
            .with_bearer_token("delivery-contract-token");

        let error = control
            .deploy_content()
            .expect_err("dirty deploy must fail");

        let message = error.to_string();
        assert!(matches!(error, DeliveryControlError::DirtyWorkspace(_)));
        assert!(message.contains("resources/pending.md"), "{message}");
        assert!(
            !db.exists(),
            "projection must not be built for a dirty release"
        );
    }

    #[test]
    fn deployment_rejects_a_clean_repository_without_a_private_backup() {
        let (_directory, content, db) = fixture("http://127.0.0.1:1");
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open")
            .with_bearer_token("delivery-contract-token");

        let error = control
            .deploy_content()
            .expect_err("unbacked release must fail");

        assert!(matches!(
            error,
            DeliveryControlError::UndurableRepository(_)
        ));
        assert!(!db.exists(), "projection must wait for durable source");
    }

    #[test]
    fn deployment_pushes_a_backup_that_is_merely_behind() {
        let (directory, content, db) = fixture("http://127.0.0.1:1");
        let remote = directory.path().join("remote.git");
        let branch = configure_remote(&content, &remote);
        std::fs::write(content.join("resources/new.md"), "committed locally\n")
            .expect("write new content");
        commit(&content, "test: local-only work");

        let control = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .with_bearer_token("delivery-contract-token");
        let error = control
            .deploy_content()
            .expect_err("no live API is reachable in this fixture");

        // The durability gate must repair the merely-behind backup with a
        // fast-forward push and let the release proceed to the network phase.
        assert!(
            !matches!(error, DeliveryControlError::UndurableRepository(_)),
            "{error}"
        );
        let pushed = Command::new("git")
            .args(["rev-parse", &branch])
            .current_dir(&remote)
            .output()
            .expect("read backup head");
        assert!(pushed.status.success());
        assert_eq!(
            String::from_utf8(pushed.stdout).expect("head utf8").trim(),
            head(&content),
            "backup must hold the local head"
        );
    }

    #[test]
    fn release_scope_skips_scope_folders_git_does_not_know() {
        // A fresh `silan init` leaves `resources/episode` absent or empty;
        // releasing the blog scope must not hand Git a dead pathspec.
        let (_directory, content, db) = fixture("http://127.0.0.1:1");
        std::fs::create_dir_all(content.join("resources/blog")).expect("blog dir");
        std::fs::create_dir_all(content.join("resources/episode")).expect("episode dir");
        std::fs::write(content.join("resources/blog/note.md"), "draft\n").expect("write");
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open");

        let before = control.scope_status(ReleaseScope::Blog).expect("status");
        assert_eq!(before.dirty_count, 1);
        let result = control.release_scope(ReleaseScope::Blog, "release: blog updates");

        assert!(
            !matches!(result, Err(DeliveryControlError::Repository(_))),
            "{result:?}"
        );
        let subject = Command::new("git")
            .args(["log", "-1", "--pretty=%s"])
            .current_dir(&content)
            .output()
            .expect("log");
        assert_eq!(
            String::from_utf8_lossy(&subject.stdout).trim(),
            "release: blog updates"
        );
        let after = control.scope_status(ReleaseScope::Blog).expect("status");
        assert_eq!(after.dirty_count, 0);
        assert_eq!(after.recent_commits.len(), 1);
    }

    #[test]
    fn porcelain_rename_reports_the_destination_path() {
        assert_eq!(
            parse_porcelain_path("R  resources/old.md -> resources/new.md"),
            Some("resources/new.md".to_owned())
        );
    }

    fn copy_fixture_item(content: &Path, relative: &str) {
        fn copy(from: &Path, to: &Path) {
            std::fs::create_dir_all(to).expect("fixture directory");
            for entry in std::fs::read_dir(from).expect("read fixture") {
                let entry = entry.expect("fixture entry");
                let target = to.join(entry.file_name());
                if entry.file_type().expect("fixture type").is_dir() {
                    copy(&entry.path(), &target);
                } else {
                    std::fs::copy(entry.path(), target).expect("copy fixture file");
                }
            }
        }
        copy(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../tests/fixtures/content")
                .join(relative),
            &content.join(relative),
        );
    }

    #[test]
    fn sync_status_without_a_deploy_target_is_not_configured_instead_of_an_error() {
        let (directory, content, db) = fixture("http://127.0.0.1:9");
        std::fs::write(
            directory.path().join("silan-viking.toml"),
            "[project]\nname = \"fresh\"\n",
        )
        .expect("config without deploy");
        let status = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .sync_status()
            .expect("an unconfigured deployment is a state, not a failure");
        assert_eq!(status.state, "not_configured");
        assert_eq!(status.local_head, head(&content));
        assert!(status.remote_head.is_empty());
        assert_eq!((status.local_commits, status.remote_commits), (0, 0));
    }

    #[test]
    fn section_status_lists_each_new_file_with_its_full_path() {
        let (directory, content, db) = fixture("http://127.0.0.1:9");
        copy_fixture_item(&content, "resources/blog/hello-world");
        let status = DeliveryControl::open(&content, &db, directory.path())
            .expect("open")
            .scope_status(ReleaseScope::Blog)
            .expect("blog status");
        assert!(status.dirty_count > 0);
        assert!(status.changes.iter().all(|change| change
            .path
            .starts_with("resources/blog/hello-world/")
            && !change.path.ends_with('/')));
    }

    #[test]
    fn section_release_skips_empty_untracked_roots_and_uses_the_reviewed_message() {
        let (directory, content, db) = fixture("http://127.0.0.1:9");
        // `silan init` leaves this empty and untracked; naming it as a Git
        // pathspec used to fail the whole Blog commit.
        std::fs::create_dir_all(content.join("resources/episode")).expect("empty episode root");
        copy_fixture_item(&content, "resources/blog/hello-world");
        let control = DeliveryControl::open(&content, &db, directory.path()).expect("open");
        let path = control
            .scope_status(ReleaseScope::Blog)
            .expect("status")
            .changes[0]
            .path
            .clone();
        assert!(control
            .release_file_diff(ReleaseScope::Blog, &path)
            .expect("preview diff")
            .starts_with("--- /dev/null"));

        let released = control
            .release_scope(ReleaseScope::Blog, "  feat(blog): add hello world  ")
            .expect("blog release");

        assert_eq!(released.dirty_count, 0);
        assert_eq!(
            released.recent_commits[0].subject,
            "feat(blog): add hello world"
        );
    }

    #[test]
    fn section_release_requires_a_message_and_leaves_other_sections_uncommitted() {
        let (directory, content, db) = fixture("http://127.0.0.1:9");
        copy_fixture_item(&content, "resources/blog/hello-world");
        copy_fixture_item(&content, "resources/moment/changelog-2026-q2");
        let control = DeliveryControl::open(&content, &db, directory.path()).expect("open");
        assert!(matches!(
            control.release_scope(ReleaseScope::Moment, "   "),
            Err(DeliveryControlError::EmptyCommitMessage)
        ));

        control
            .release_scope(ReleaseScope::Moment, "release: moment updates")
            .expect("moment release");

        assert_eq!(
            control
                .scope_status(ReleaseScope::Moment)
                .expect("moment status")
                .dirty_count,
            0
        );
        assert!(
            control
                .scope_status(ReleaseScope::Blog)
                .expect("blog status")
                .dirty_count
                > 0,
            "a Moments commit must never include Blog sources"
        );
        assert!(control
            .release_file_diff(ReleaseScope::Moment, "resources/blog/hello-world/item.toml")
            .is_err());
    }
}
