//! Tauri-facing onboarding application service.

use crate::application::{read_desktop_project_summary, DesktopWorkspace};
use crate::workspace_runtime::{self, WorkspaceActivationState, WorkspaceSelection};
use serde::{Deserialize, Serialize};
use silan_viking_app::{
    DeploymentKeyRequirement, GitAuthenticationKind, GitRepositoryStatus, JoinWorkspaceInput,
    WorkspaceJoiner, WorkspaceLayout,
};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DesktopBootstrapStatus {
    pub(crate) state: String,
    pub(crate) project_root: Option<String>,
    pub(crate) project_name: Option<String>,
    pub(crate) repository_url: Option<String>,
    pub(crate) deployment_key_path: Option<String>,
    pub(crate) configured_deployment_key: Option<String>,
    pub(crate) deployment_key_required: bool,
    pub(crate) deploy_host: Option<String>,
    pub(crate) deploy_user: Option<String>,
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryAccessInput {
    pub(crate) repository_url: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct RepositoryAccessResult {
    pub(crate) authentication: GitAuthenticationKind,
    pub(crate) label: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopJoinWorkspaceInput {
    pub(crate) repository_url: String,
    pub(crate) destination: String,
    pub(crate) branch: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DesktopJoinWorkspaceResult {
    pub(crate) project_root: String,
    pub(crate) content_root: String,
    pub(crate) database_path: String,
    pub(crate) project_name: String,
    pub(crate) repository_url: String,
    pub(crate) authentication: GitAuthenticationKind,
    pub(crate) layout: WorkspaceLayout,
    pub(crate) repository: GitRepositoryStatus,
    pub(crate) deployment_key: DeploymentKeyRequirement,
    pub(crate) projection_revision: String,
    pub(crate) items_scanned: usize,
    pub(crate) rows_written: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompleteWorkspaceOnboardingInput {
    pub(crate) deployment_key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct DeploymentKeyValidation {
    pub(crate) path: String,
    pub(crate) file_name: String,
    pub(crate) permission_mode: Option<String>,
}

pub(crate) fn bootstrap_status() -> DesktopBootstrapStatus {
    if let Some(error) = workspace_runtime::initialization_error() {
        return DesktopBootstrapStatus {
            state: "invalid_workspace".to_owned(),
            project_root: workspace_runtime::selection()
                .map(|s| s.project_root.display().to_string()),
            project_name: workspace_runtime::selection().map(|s| s.project_name),
            repository_url: None,
            deployment_key_path: None,
            configured_deployment_key: None,
            deployment_key_required: false,
            deploy_host: None,
            deploy_user: None,
            error: Some(error),
        };
    }
    if let Some(selection) = workspace_runtime::selection() {
        let state = match selection.state {
            WorkspaceActivationState::Prepared => "deployment_key",
            WorkspaceActivationState::Ready => "ready",
        };
        return match DesktopWorkspace::from_project_root(&selection.project_root)
            .and_then(|_| read_desktop_project_summary(&selection.project_root))
        {
            Ok(summary) => DesktopBootstrapStatus {
                state: state.to_owned(),
                project_root: Some(selection.project_root.display().to_string()),
                project_name: Some(summary.project_name),
                repository_url: Some(selection.repository_url),
                deployment_key_path: selection
                    .deployment_key_path
                    .map(|path| path.display().to_string()),
                configured_deployment_key: summary.configured_deployment_key,
                deployment_key_required: summary.deployment_key_required,
                deploy_host: summary.deploy_host,
                deploy_user: summary.deploy_user,
                error: None,
            },
            Err(error) => DesktopBootstrapStatus {
                state: "invalid_workspace".to_owned(),
                project_root: Some(selection.project_root.display().to_string()),
                project_name: Some(selection.project_name),
                repository_url: Some(selection.repository_url),
                deployment_key_path: selection
                    .deployment_key_path
                    .map(|path| path.display().to_string()),
                configured_deployment_key: None,
                deployment_key_required: false,
                deploy_host: None,
                deploy_user: None,
                error: Some(error),
            },
        };
    }

    DesktopBootstrapStatus {
        state: "needs_workspace".to_owned(),
        project_root: None,
        project_name: None,
        repository_url: None,
        deployment_key_path: None,
        configured_deployment_key: None,
        deployment_key_required: false,
        deploy_host: None,
        deploy_user: None,
        error: None,
    }
}

/// One workspace row of the desktop workspace switcher.
#[derive(Debug, Clone, Serialize)]
pub(crate) struct WorkspaceSwitcherEntry {
    pub(crate) project_root: String,
    pub(crate) project_name: String,
    pub(crate) last_opened_at: u64,
    pub(crate) available: bool,
}

/// The active workspace, recently opened alternatives, and the workspace this
/// launch replaced (when a CLI launch from another directory switched it).
#[derive(Debug, Clone, Serialize)]
pub(crate) struct WorkspaceSwitcherState {
    pub(crate) current: Option<WorkspaceSwitcherEntry>,
    pub(crate) recent: Vec<WorkspaceSwitcherEntry>,
    pub(crate) replaced: Option<WorkspaceSwitcherEntry>,
}

fn switcher_entry(workspace: workspace_runtime::RecentWorkspace) -> WorkspaceSwitcherEntry {
    WorkspaceSwitcherEntry {
        available: workspace.project_root.join("silan-viking.toml").is_file(),
        project_root: workspace.project_root.display().to_string(),
        project_name: workspace.project_name,
        last_opened_at: workspace.last_opened_at,
    }
}

pub(crate) fn workspace_switcher_state() -> Result<WorkspaceSwitcherState, String> {
    let current_root = workspace_runtime::active_project_root()
        .map(|root| fs::canonicalize(&root).unwrap_or(root));
    let mut current = None;
    let mut recent = Vec::new();
    for workspace in workspace_runtime::recent_workspaces()? {
        let root = fs::canonicalize(&workspace.project_root)
            .unwrap_or_else(|_| workspace.project_root.clone());
        if current_root.as_ref() == Some(&root) {
            current = Some(switcher_entry(workspace));
        } else {
            recent.push(switcher_entry(workspace));
        }
    }
    Ok(WorkspaceSwitcherState {
        current,
        recent,
        replaced: workspace_runtime::replaced_workspace_notice().map(switcher_entry),
    })
}

pub(crate) fn verify_repository_access(
    input: RepositoryAccessInput,
) -> Result<RepositoryAccessResult, String> {
    let authentication = WorkspaceJoiner::verify_repository_access(&input.repository_url)
        .map_err(|error| error.to_string())?;
    let label = match authentication {
        GitAuthenticationKind::Ssh => "SSH access verified with this device's Git identity",
        GitAuthenticationKind::OAuth => {
            "HTTPS access verified with this device's Git credential manager"
        }
        GitAuthenticationKind::Local => "Local Git repository access verified",
    };
    Ok(RepositoryAccessResult {
        authentication,
        label: label.to_owned(),
    })
}

pub(crate) fn join_workspace(
    input: DesktopJoinWorkspaceInput,
    progress: impl Fn(silan_viking_app::workspace_setup::WorkspaceSetupStage),
) -> Result<DesktopJoinWorkspaceResult, String> {
    let result = WorkspaceJoiner::join_with_progress(
        &JoinWorkspaceInput {
            repository_url: input.repository_url,
            destination: PathBuf::from(input.destination),
            branch: input.branch,
        },
        progress,
    )
    .map_err(|error| error.to_string())?;
    workspace_runtime::save_selection(WorkspaceSelection::prepared(
        result.project_root.clone(),
        result.repository_url.clone(),
        result.project_name.clone(),
    ))?;
    Ok(DesktopJoinWorkspaceResult {
        project_root: result.project_root.display().to_string(),
        content_root: result.content_root.display().to_string(),
        database_path: result.database_path.display().to_string(),
        project_name: result.project_name,
        repository_url: result.repository_url,
        authentication: result.authentication,
        layout: result.layout,
        repository: result.repository,
        deployment_key: result.deployment_key,
        projection_revision: result.projection_revision,
        items_scanned: result.items_scanned,
        rows_written: result.rows_written,
    })
}

pub(crate) fn validate_deployment_key(path: &str) -> Result<DeploymentKeyValidation, String> {
    let path = expand_home(path)?;
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("cannot read deployment key `{}`: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!(
            "deployment key `{}` is not a regular file",
            path.display()
        ));
    }
    let file = fs::File::open(&path)
        .map_err(|error| format!("cannot open deployment key `{}`: {error}", path.display()))?;
    let mut first_line = String::new();
    BufReader::new(file)
        .read_line(&mut first_line)
        .map_err(|error| {
            format!(
                "cannot inspect deployment key `{}`: {error}",
                path.display()
            )
        })?;
    if !first_line.trim().starts_with("-----BEGIN ")
        || !first_line.trim().ends_with(" PRIVATE KEY-----")
    {
        return Err("selected file does not look like an SSH private key".to_owned());
    }
    #[cfg(unix)]
    let permission_mode = {
        use std::os::unix::fs::PermissionsExt;
        let mode = metadata.permissions().mode() & 0o777;
        if mode != 0o600 {
            return Err(format!(
                "deployment key permissions are {mode:o}; run `chmod 600 {}` before continuing",
                path.display()
            ));
        }
        Some(format!("{mode:o}"))
    };
    #[cfg(not(unix))]
    let permission_mode = None;

    Ok(DeploymentKeyValidation {
        path: path.display().to_string(),
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("deployment key")
            .to_owned(),
        permission_mode,
    })
}

pub(crate) fn complete_onboarding(
    input: CompleteWorkspaceOnboardingInput,
) -> Result<DesktopBootstrapStatus, String> {
    let selection =
        workspace_runtime::selection().ok_or_else(|| "no prepared workspace exists".to_owned())?;
    let deployment_key_path = match input
        .deployment_key_path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    {
        Some(path) => Some(PathBuf::from(validate_deployment_key(path)?.path)),
        None => selection.deployment_key_path.clone(),
    };
    DesktopWorkspace::from_project_root(&selection.project_root).map_err(|error| {
        format!("workspace cannot enter the editor until validation passes: {error}")
    })?;
    workspace_runtime::complete_selection(deployment_key_path)?;
    Ok(bootstrap_status())
}

fn expand_home(value: &str) -> Result<PathBuf, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("enter the path to this device's deployment key".to_owned());
    }
    let Some(relative) = value.strip_prefix("~/") else {
        let path = PathBuf::from(value);
        if !path.is_absolute() {
            return Err("deployment key path must be absolute or start with `~/`".to_owned());
        }
        return Ok(path);
    };
    let home = std::env::var_os("HOME")
        .ok_or_else(|| "cannot resolve the current user's home directory".to_owned())?;
    Ok(PathBuf::from(home).join(relative))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tauri_join_input_uses_camel_case_fields() {
        let input: DesktopJoinWorkspaceInput = serde_json::from_value(serde_json::json!({
            "repositoryUrl": "git@github.com:owner/workspace.git",
            "destination": "~/Silan Workspaces/workspace",
            "branch": "main"
        }))
        .expect("deserialize Tauri payload");
        assert_eq!(input.branch.as_deref(), Some("main"));
        assert_eq!(input.repository_url, "git@github.com:owner/workspace.git");
    }

    #[cfg(unix)]
    #[test]
    fn deployment_key_validation_requires_private_material_and_owner_only_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempfile::tempdir().expect("temporary key directory");
        let key = directory.path().join("deploy-key");
        fs::write(
            &key,
            "-----BEGIN OPENSSH PRIVATE KEY-----\nfixture\n-----END OPENSSH PRIVATE KEY-----\n",
        )
        .expect("write fixture key");
        fs::set_permissions(&key, fs::Permissions::from_mode(0o600)).expect("secure permissions");
        let validation = validate_deployment_key(&key.display().to_string()).expect("valid key");
        assert_eq!(validation.permission_mode.as_deref(), Some("600"));

        fs::set_permissions(&key, fs::Permissions::from_mode(0o644)).expect("insecure permissions");
        assert!(validate_deployment_key(&key.display().to_string()).is_err());
    }
}
