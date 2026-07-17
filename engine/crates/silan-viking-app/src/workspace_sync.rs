//! Explicit source-to-projection synchronization state machine.

use crate::sync::SqliteSink;
use crate::Workspace;
use serde::Serialize;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum WorkspaceSyncError {
    #[error("workspace open failed: {0}")]
    Open(#[from] crate::workspace::OpenError),
    #[error("workspace sync failed: {0}")]
    Sync(#[from] crate::sync::SyncError),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSyncState {
    Synchronized,
    Stale,
    ProjectionMissing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSyncStatus {
    pub state: WorkspaceSyncState,
    pub source_revision: String,
    pub projection_revision: Option<String>,
    pub stale_reason: Option<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceSyncResult {
    pub state: WorkspaceSyncState,
    pub source_revision: String,
    pub projection_revision: String,
    pub items_scanned: usize,
    pub items_written: usize,
    pub rows_written: usize,
    pub wrote: bool,
    pub stale_reason: Option<String>,
    pub errors: Vec<String>,
}

pub struct WorkspaceSync {
    workspace: Workspace,
    db_path: PathBuf,
}

impl WorkspaceSync {
    pub fn open(
        content_root: impl AsRef<Path>,
        db_path: impl AsRef<Path>,
    ) -> Result<Self, WorkspaceSyncError> {
        Ok(Self {
            workspace: Workspace::open(content_root)?,
            db_path: db_path.as_ref().to_path_buf(),
        })
    }

    pub fn status(&self) -> Result<WorkspaceSyncStatus, WorkspaceSyncError> {
        let source_revision = self.workspace.source_revision()?;
        if !self.db_path.is_file() {
            return Ok(WorkspaceSyncStatus {
                state: WorkspaceSyncState::ProjectionMissing,
                source_revision,
                projection_revision: None,
                stale_reason: Some("No local projection has been created.".to_owned()),
                errors: Vec::new(),
            });
        }
        let projection_revision = SqliteSink::open(&self.db_path)?.last_sync_hash()?;
        let state = match projection_revision.as_deref() {
            Some(revision) if revision == source_revision => WorkspaceSyncState::Synchronized,
            Some(_) => WorkspaceSyncState::Stale,
            None => WorkspaceSyncState::ProjectionMissing,
        };
        Ok(WorkspaceSyncStatus {
            stale_reason: match state {
                WorkspaceSyncState::Synchronized => None,
                WorkspaceSyncState::Stale => {
                    Some("Source content changed after the last projection sync.".to_owned())
                }
                WorkspaceSyncState::ProjectionMissing => {
                    Some("Projection provenance is missing.".to_owned())
                }
            },
            state,
            source_revision,
            projection_revision,
            errors: Vec::new(),
        })
    }

    pub fn sync(&self) -> Result<WorkspaceSyncResult, WorkspaceSyncError> {
        let report = self.workspace.sync(&self.db_path)?;
        Ok(WorkspaceSyncResult {
            state: WorkspaceSyncState::Synchronized,
            source_revision: report.content_hash.clone(),
            projection_revision: report.content_hash,
            items_scanned: report.items_scanned,
            items_written: report.items_written,
            rows_written: report.rows_written,
            wrote: report.wrote,
            stale_reason: None,
            errors: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_state_moves_from_missing_to_synchronized() {
        let directory = tempfile::tempdir().expect("temp");
        let content = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../content");
        let db = directory.path().join("portfolio.db");
        let sync = WorkspaceSync::open(content, &db).expect("open");
        assert_eq!(
            sync.status().expect("missing status").state,
            WorkspaceSyncState::ProjectionMissing
        );
        let result = sync.sync().expect("sync");
        assert_eq!(result.state, WorkspaceSyncState::Synchronized);
        let status = sync.status().expect("synced status");
        assert_eq!(status.state, WorkspaceSyncState::Synchronized);
        assert_eq!(
            status.projection_revision.as_deref(),
            Some(status.source_revision.as_str())
        );
    }
}
