//! Delivery command adapter. Opening it does not construct editing, media, or
//! analytics services. The engine remains the owner of delivery state.
use super::DesktopWorkspacePaths;
use crate::model::{
    CommitActivityDay, DeliverySyncStatus, DeployRunStatus, DeployVerificationResult,
    DeploymentPlan, DeploymentScopeStatus, RemoteContentVersion, VersionChange, VersionCommit,
    VersionStatus, WorkspaceFileChange,
};
use silan_viking_app::{
    DeepSeekApiKey, DeepSeekCommitMessageGenerator, DeliveryControl, ReleaseScope,
};

pub(crate) struct DesktopDelivery {
    delivery_control: DeliveryControl,
}

impl DesktopDelivery {
    pub(crate) fn from_environment() -> Result<Self, String> {
        Self::from_paths(DesktopWorkspacePaths::resolve()?)
    }

    fn from_paths(paths: DesktopWorkspacePaths) -> Result<Self, String> {
        let delivery_control = DeliveryControl::open(
            &paths.content_root,
            &paths.db_path,
            paths.content_root.parent().unwrap_or(&paths.content_root),
        )
        .map_err(|error| error.to_string())?;
        Ok(Self { delivery_control })
    }

    pub(crate) fn version_status(&self, scope: &str) -> Result<VersionStatus, String> {
        let status = self
            .delivery_control
            .scope_status(ReleaseScope::parse(scope).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        Ok(map_version_status(status))
    }

    pub(crate) fn release_scope(
        &self,
        scope: &str,
        message: &str,
    ) -> Result<VersionStatus, String> {
        let status = self
            .delivery_control
            .release_scope(
                ReleaseScope::parse(scope).map_err(|error| error.to_string())?,
                message,
            )
            .map_err(|error| error.to_string())?;
        Ok(map_version_status(status))
    }

    pub(crate) fn release_file_diff(&self, scope: &str, path: &str) -> Result<String, String> {
        self.delivery_control
            .release_file_diff(
                ReleaseScope::parse(scope).map_err(|error| error.to_string())?,
                path,
            )
            .map_err(|error| error.to_string())
    }

    pub(crate) fn deployment_plan(&self) -> Result<DeploymentPlan, String> {
        let plan = self
            .delivery_control
            .deployment_plan()
            .map_err(|error| error.to_string())?;
        Ok(DeploymentPlan {
            branch: plan.branch,
            head: plan.head,
            deploy_target: plan
                .deploy_target
                .unwrap_or_else(|| "No deployed API target configured".to_owned()),
            dirty_count: plan.dirty_count,
            media_asset_count: plan.media_asset_count,
            next_action: plan.next_action,
            commit_activity: plan
                .commit_activity
                .into_iter()
                .map(|day| CommitActivityDay {
                    date: day.date,
                    commit_count: day.commit_count,
                    scopes: day
                        .scopes
                        .into_iter()
                        .map(|scope| scope.id().to_owned())
                        .collect(),
                })
                .collect(),
            scopes: plan
                .scopes
                .into_iter()
                .map(|scope| DeploymentScopeStatus {
                    scope: scope.scope.id().to_owned(),
                    scope_label: scope.scope_label,
                    dirty_count: scope.dirty_count,
                    clean: scope.dirty_count == 0,
                })
                .collect(),
        })
    }

    pub(crate) fn delivery_sync_status(&self) -> Result<DeliverySyncStatus, String> {
        self.delivery_control
            .sync_status()
            .map(delivery_sync_status_for_desktop)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn pull_remote_changes(&self) -> Result<DeliverySyncStatus, String> {
        self.delivery_control
            .pull_remote_changes()
            .map(delivery_sync_status_for_desktop)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn workspace_changes(&self) -> Result<Vec<WorkspaceFileChange>, String> {
        self.delivery_control
            .workspace_changes()
            .map(|changes| {
                changes
                    .into_iter()
                    .map(|change| WorkspaceFileChange {
                        path: change.path,
                        status: change.status,
                        staged: change.staged,
                        unstaged: change.unstaged,
                    })
                    .collect()
            })
            .map_err(|error| error.to_string())
    }

    pub(crate) fn workspace_file_diff(&self, path: &str, staged: bool) -> Result<String, String> {
        self.delivery_control
            .file_diff(path, staged)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn generate_workspace_commit_message(
        &self,
        api_key: &DeepSeekApiKey,
    ) -> Result<String, String> {
        let staged_diff = self
            .delivery_control
            .staged_diff()
            .map_err(|error| error.to_string())?;
        DeepSeekCommitMessageGenerator::configured()?
            .generate(api_key, &staged_diff)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn stage_workspace_paths(&self, paths: &[String]) -> Result<(), String> {
        self.delivery_control
            .stage_paths(paths)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn unstage_workspace_paths(&self, paths: &[String]) -> Result<(), String> {
        self.delivery_control
            .unstage_paths(paths)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn commit_workspace(&self, message: &str) -> Result<DeliverySyncStatus, String> {
        self.delivery_control
            .commit_workspace(message)
            .map_err(|error| error.to_string())?;
        self.delivery_sync_status()
    }

    pub(crate) fn deploy_content(&self) -> Result<DeployRunStatus, String> {
        let status = self
            .delivery_control
            .deploy_content()
            .map_err(|error| error.to_string())?;
        Ok(DeployRunStatus {
            success: status.success,
            content_commit: status.content_commit,
            static_published: status.static_published,
            static_release: status.static_release,
            stdout: status.stdout,
            stderr: status.stderr,
        })
    }

    pub(crate) fn verify_remote(&self) -> Result<DeployVerificationResult, String> {
        let result = self
            .delivery_control
            .verify_remote()
            .map_err(|error| error.to_string())?;
        Ok(DeployVerificationResult {
            verified: result.verified,
            expected_content_commit: result.expected_content_commit,
            remote: RemoteContentVersion {
                health: result.remote.health,
                content_hash: result.remote.content_hash,
                content_commit: result.remote.content_commit,
                generated_at: result.remote.generated_at,
                media_root_ok: result.remote.media_root_ok,
            },
            mismatch_reason: result.mismatch_reason,
        })
    }
}

fn delivery_sync_status_for_desktop(
    status: silan_viking_app::DeliverySyncStatus,
) -> DeliverySyncStatus {
    DeliverySyncStatus {
        local_head: status.local_head,
        remote_head: status.remote_head,
        local_commits: status.local_commits,
        remote_commits: status.remote_commits,
        workspace_changes: status.workspace_changes,
        state: status.state,
    }
}

fn map_version_status(status: silan_viking_app::ScopeReleaseStatus) -> VersionStatus {
    VersionStatus {
        scope: status.scope.id().to_owned(),
        scope_label: status.scope_label,
        branch: status.branch,
        head: status.head,
        dirty_count: status.dirty_count,
        changes: status
            .changes
            .into_iter()
            .map(|change| VersionChange {
                status: change.status,
                path: change.path,
            })
            .collect(),
        recent_commits: status
            .recent_commits
            .into_iter()
            .map(|commit| VersionCommit {
                hash: commit.hash,
                subject: commit.subject,
                relative_time: commit.relative_time,
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_delivery_does_not_initialize_the_projection_database() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(
            root.path().join("SCHEMA.md"),
            include_str!("../../../../engine/tests/fixtures/content/SCHEMA.md"),
        )
        .unwrap();
        let status = std::process::Command::new("git")
            .args(["init", "--quiet"])
            .arg(root.path())
            .status()
            .unwrap();
        assert!(status.success());
        let db_path = root.path().join("unopened.db");
        let _delivery = DesktopDelivery::from_paths(DesktopWorkspacePaths {
            content_root: root.path().to_path_buf(),
            db_path: db_path.clone(),
        })
        .unwrap();
        assert!(!db_path.exists());
    }
}
