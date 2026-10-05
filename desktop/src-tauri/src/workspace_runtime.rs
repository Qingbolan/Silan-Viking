//! Process-wide desktop workspace selection and its durable, device-local record.
//!
//! The selected project path and deployment-key path are machine concerns, so
//! they live under the app config directory rather than in the Git workspace.
//! No key material or repository credential is ever persisted here.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

const REGISTRY_FILE: &str = "workspace.json";
const REGISTRY_VERSION: u8 = 1;

static RUNTIME: OnceLock<DesktopRuntime> = OnceLock::new();

#[derive(Debug)]
struct DesktopRuntime {
    registry_path: PathBuf,
    selection: RwLock<Option<WorkspaceSelection>>,
    initialization_error: RwLock<Option<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkspaceActivationState {
    Prepared,
    Ready,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct WorkspaceSelection {
    version: u8,
    pub(crate) project_root: PathBuf,
    pub(crate) repository_url: String,
    pub(crate) project_name: String,
    pub(crate) deployment_key_path: Option<PathBuf>,
    pub(crate) state: WorkspaceActivationState,
}

impl WorkspaceSelection {
    pub(crate) fn prepared(
        project_root: PathBuf,
        repository_url: String,
        project_name: String,
    ) -> Self {
        Self {
            version: REGISTRY_VERSION,
            project_root,
            repository_url,
            project_name,
            deployment_key_path: None,
            state: WorkspaceActivationState::Prepared,
        }
    }
}

pub(crate) fn initialize(config_dir: impl AsRef<Path>) -> Result<(), String> {
    let config_dir = config_dir.as_ref();
    fs::create_dir_all(config_dir).map_err(|error| {
        format!(
            "cannot create desktop config directory `{}`: {error}",
            config_dir.display()
        )
    })?;
    let registry_path = config_dir.join(REGISTRY_FILE);
    let (mut selection, mut initialization_error) = match read_selection(&registry_path) {
        Ok(selection) => (selection, None),
        Err(error) => (None, Some(error)),
    };
    let launch_root = std::env::var_os("SILAN_DESKTOP_PROJECT")
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("SILAN_DESKTOP_CONTENT")
                .and_then(|content| PathBuf::from(content).parent().map(Path::to_path_buf))
        })
        .or_else(|| {
            (selection.is_none() && initialization_error.is_none())
                .then(|| crate::application::find_project_root_from_current_dir().ok())
                .flatten()
        });
    if let Some(project_root) = launch_root {
        match register_local_workspace(&registry_path, &project_root, selection.as_ref()) {
            Ok(registered) => {
                selection = Some(registered);
                initialization_error = None;
            }
            Err(error) => initialization_error = Some(error),
        }
    }
    apply_device_environment(selection.as_ref());
    RUNTIME
        .set(DesktopRuntime {
            registry_path,
            selection: RwLock::new(selection),
            initialization_error: RwLock::new(initialization_error),
        })
        .map_err(|_| "desktop workspace runtime was initialized more than once".to_owned())
}

/// Activation is recorded only after the local project can be opened. Reopening
/// the same canonical directory preserves its device-specific deployment key.
fn register_local_workspace(
    registry_path: &Path,
    project_root: &Path,
    previous: Option<&WorkspaceSelection>,
) -> Result<WorkspaceSelection, String> {
    let project_root = fs::canonicalize(project_root)
        .map_err(|error| format!("cannot resolve launched workspace: {error}"))?;
    crate::application::DesktopWorkspace::from_project_root(&project_root)?;
    let summary = crate::application::read_desktop_project_summary(&project_root)?;
    let mut selection = previous
        .filter(|saved| fs::canonicalize(&saved.project_root).ok().as_ref() == Some(&project_root))
        .cloned()
        .unwrap_or_else(|| {
            WorkspaceSelection::prepared(
                project_root.clone(),
                String::new(),
                summary.project_name.clone(),
            )
        });
    selection.project_root = project_root;
    selection.project_name = summary.project_name;
    selection.state = WorkspaceActivationState::Ready;
    persist_selection(registry_path, &selection)?;
    Ok(selection)
}

/// Explicit local opens validate before replacing the device selection.
pub(crate) fn activate_local_workspace(project_root: &Path) -> Result<(), String> {
    let runtime = runtime()?;
    let previous = selection();
    let selected =
        register_local_workspace(&runtime.registry_path, project_root, previous.as_ref())?;
    save_selection(selected)
}

pub(crate) fn initialization_error() -> Option<String> {
    runtime()
        .ok()
        .and_then(|runtime| runtime.initialization_error.read().ok()?.clone())
}

pub(crate) fn selection() -> Option<WorkspaceSelection> {
    runtime()
        .ok()
        .and_then(|runtime| runtime.selection.read().ok()?.clone())
}

pub(crate) fn active_project_root() -> Option<PathBuf> {
    selection().and_then(|selection| {
        (selection.state == WorkspaceActivationState::Ready).then_some(selection.project_root)
    })
}

pub(crate) fn save_selection(selection: WorkspaceSelection) -> Result<(), String> {
    let runtime = runtime()?;
    persist_selection(&runtime.registry_path, &selection)?;
    let mut active = runtime
        .selection
        .write()
        .map_err(|_| "desktop workspace registry lock is poisoned".to_owned())?;
    apply_device_environment(Some(&selection));
    *active = Some(selection);
    if let Ok(mut error) = runtime.initialization_error.write() {
        *error = None;
    }
    Ok(())
}

fn apply_device_environment(selection: Option<&WorkspaceSelection>) {
    if let Some(selection) = selection {
        match selection.deployment_key_path.as_ref() {
            Some(path) => std::env::set_var("SILAN_DEPLOY_SSH_KEY_PATH", path),
            None => std::env::remove_var("SILAN_DEPLOY_SSH_KEY_PATH"),
        }
    }
}

pub(crate) fn complete_selection(deployment_key_path: Option<PathBuf>) -> Result<(), String> {
    let mut selection = selection().ok_or_else(|| {
        "no prepared workspace exists; join a workspace before completing onboarding".to_owned()
    })?;
    selection.deployment_key_path = deployment_key_path;
    selection.state = WorkspaceActivationState::Ready;
    save_selection(selection)
}

fn runtime() -> Result<&'static DesktopRuntime, String> {
    RUNTIME
        .get()
        .ok_or_else(|| "desktop workspace runtime is not initialized".to_owned())
}

fn read_selection(path: &Path) -> Result<Option<WorkspaceSelection>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let source = fs::read_to_string(path)
        .map_err(|error| format!("cannot read `{}`: {error}", path.display()))?;
    let selection: WorkspaceSelection = serde_json::from_str(&source)
        .map_err(|error| format!("cannot parse `{}`: {error}", path.display()))?;
    if selection.version != REGISTRY_VERSION {
        return Err(format!(
            "unsupported desktop workspace registry version {}",
            selection.version
        ));
    }
    Ok(Some(selection))
}

fn persist_selection(path: &Path, selection: &WorkspaceSelection) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "cannot resolve desktop config directory for `{}`",
            path.display()
        )
    })?;
    let bytes = serde_json::to_vec_pretty(selection)
        .map_err(|error| format!("cannot encode workspace registry: {error}"))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("cannot stage `{}`: {error}", path.display()))?;
    use std::io::Write;
    temporary
        .write_all(&bytes)
        .map_err(|error| format!("cannot stage `{}`: {error}", path.display()))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format!("cannot sync `{}`: {error}", path.display()))?;
    temporary
        .persist(path)
        .map_err(|error| format!("cannot replace `{}`: {}", path.display(), error.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn local_project(root: &Path, name: &str) -> PathBuf {
        let project = root.join(name);
        let content = project.join("custom-content");
        fs::create_dir_all(content.join("resources")).unwrap();
        assert!(std::process::Command::new("git")
            .args(["init", "--quiet"])
            .arg(&content)
            .status()
            .unwrap()
            .success());
        fs::write(
            content.join("SCHEMA.md"),
            include_str!("../../../engine/tests/fixtures/content/SCHEMA.md"),
        )
        .unwrap();
        fs::write(project.join("silan-viking.toml"), format!(
            "[project]\nname = \"{name}\"\ncontent_dir = \"custom-content\"\n[database]\npath = \"index.sqlite\"\n"
        )).unwrap();
        project
    }

    #[test]
    fn local_launch_is_restored_and_reopening_preserves_device_settings() {
        let directory = tempfile::tempdir().unwrap();
        let project = local_project(directory.path(), "launched-site");
        let registry = directory.path().join(REGISTRY_FILE);
        let mut first = register_local_workspace(&registry, &project, None).unwrap();
        assert_eq!(first.state, WorkspaceActivationState::Ready);
        assert_eq!(first.project_name, "launched-site");
        first.deployment_key_path = Some(PathBuf::from("/keys/device.pem"));
        persist_selection(&registry, &first).unwrap();
        let restored = read_selection(&registry).unwrap().unwrap();
        let reopened =
            register_local_workspace(&registry, &project.join("."), Some(&restored)).unwrap();
        assert_eq!(reopened.project_root, fs::canonicalize(project).unwrap());
        assert_eq!(reopened.deployment_key_path, first.deployment_key_path);
        assert_eq!(
            read_selection(&registry).unwrap().unwrap().project_root,
            reopened.project_root
        );
    }

    #[test]
    fn new_launch_replaces_old_selection_but_invalid_launch_leaves_registry_unchanged() {
        let directory = tempfile::tempdir().unwrap();
        let registry = directory.path().join(REGISTRY_FILE);
        let first =
            register_local_workspace(&registry, &local_project(directory.path(), "first"), None)
                .unwrap();
        let second = register_local_workspace(
            &registry,
            &local_project(directory.path(), "second"),
            Some(&first),
        )
        .unwrap();
        assert_eq!(
            read_selection(&registry).unwrap().unwrap().project_name,
            "second"
        );
        let before = fs::read(&registry).unwrap();
        assert!(register_local_workspace(
            &registry,
            &directory.path().join("missing"),
            Some(&second)
        )
        .is_err());
        assert_eq!(fs::read(&registry).unwrap(), before);
    }

    #[test]
    fn fresh_offline_workspace_opens_without_a_commit_or_deployment_key() {
        use silan_viking_app::workspace_setup::{CreateWorkspaceInput, WorkspaceSetup};
        for include_example in [false, true] {
            let directory = tempfile::tempdir().unwrap();
            let root = WorkspaceSetup::create(
                &CreateWorkspaceInput {
                    destination: directory.path().join("new"),
                    name: "New research".into(),
                    author: "Researcher".into(),
                    language: "zh".into(),
                    include_example,
                    avatar: if include_example {
                        Some(silan_viking_app::workspace_setup::WorkspaceAvatarInput {
                            bytes: include_bytes!("../icons/64x64.png").to_vec(),
                        })
                    } else {
                        None
                    },
                },
                |_| {},
            )
            .unwrap();
            let workspace = crate::application::DesktopWorkspace::from_project_root(&root).unwrap();
            let preferences = workspace.workspace_preferences().unwrap();
            assert_eq!(preferences.default_language, "zh");
            assert_eq!(preferences.identity.display_name, "Researcher");
            if include_example {
                assert!(preferences
                    .identity
                    .avatar_reference
                    .starts_with("silan://resources/resume/assets/"));
                assert!(preferences
                    .identity
                    .avatar_url
                    .as_ref()
                    .is_some_and(|url| !url.is_empty()));
                let source = root.join("content/resources/resume/assets/avatar.png");
                assert!(source.is_file());
            } else {
                assert!(preferences.identity.avatar_reference.is_empty());
            }
            workspace.dashboard().unwrap();
            let control = silan_viking_app::DeliveryControl::open(
                root.join("content"),
                root.join("_deploy/portfolio.db"),
                &root,
            )
            .unwrap();
            let plan = control.deployment_plan().unwrap();
            assert!(plan.head.is_empty());
            assert!(plan.commit_activity.is_empty());
            assert_eq!(control.sync_status().unwrap().state, "not_configured");
            let selection =
                register_local_workspace(&directory.path().join(REGISTRY_FILE), &root, None)
                    .unwrap();
            assert_eq!(selection.state, WorkspaceActivationState::Ready);
        }
    }

    #[test]
    fn registry_round_trip_never_contains_key_material() {
        let directory = tempfile::tempdir().expect("temporary config");
        let path = directory.path().join(REGISTRY_FILE);
        let selection = WorkspaceSelection {
            version: REGISTRY_VERSION,
            project_root: PathBuf::from("/work/site"),
            repository_url: "git@github.com:owner/site.git".to_owned(),
            project_name: "site".to_owned(),
            deployment_key_path: Some(PathBuf::from("/keys/deploy.pem")),
            state: WorkspaceActivationState::Ready,
        };
        persist_selection(&path, &selection).expect("persist");
        let restored = read_selection(&path).expect("read").expect("selection");
        assert_eq!(restored.project_root, selection.project_root);
        assert_eq!(restored.deployment_key_path, selection.deployment_key_path);
        let source = fs::read_to_string(path).expect("registry source");
        assert!(!source.contains("PRIVATE KEY"));
    }
}
