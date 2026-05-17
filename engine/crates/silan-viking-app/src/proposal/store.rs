//! Proposal metadata persistence (`08` §8.5).
//!
//! Each proposal carries a small TOML record under
//! `<content>/.git/silan/proposals/<id>.toml`:
//!
//! ```toml
//! id = "01H..."
//! base = "<main_oid>"          # the main OID the proposal branched from
//! kind = "modify"              # create | modify
//! touched = ["silan://resources/ideas/rce/progress"]
//! validation = "passed"       # passed | failed:<detail> | pending
//! state = "validated"
//! ```
//!
//! `silan proposal list` reads these to render proposals and to warn when two
//! pending proposals touch the same Part (`08` §8.5).

use super::{ProposalError, ProposalId, ProposalState};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// What a proposal does to its target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalKind {
    /// Creates a new Item.
    Create,
    /// Modifies an existing Item or Part.
    Modify,
}

/// The on-disk proposal record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProposalRecord {
    /// Proposal id (also the `proposal/<id>` branch name).
    pub id: String,
    /// The main-branch OID this proposal branched from.
    pub base: String,
    /// Whether the proposal creates or modifies.
    pub kind: ProposalKind,
    /// The Item/Part URIs the proposal touches — used by `proposal list` to
    /// flag overlapping pending proposals (`08` §8.5).
    pub touched: Vec<String>,
    /// The last validation outcome: `passed`, `pending`, or `failed:<detail>`.
    pub validation: String,
    /// The lifecycle state, as a lowercase string for stable TOML.
    pub state: String,
}

impl ProposalRecord {
    /// Build a fresh record for a just-created proposal branch.
    pub fn new(
        id: &ProposalId,
        base: impl Into<String>,
        kind: ProposalKind,
        touched: Vec<String>,
    ) -> Self {
        Self {
            id: id.as_str().to_owned(),
            base: base.into(),
            kind,
            touched,
            validation: "pending".to_owned(),
            state: state_str(ProposalState::Draft).to_owned(),
        }
    }

    /// The proposal kind as a stable lowercase string, for display.
    pub fn kind_str(&self) -> &'static str {
        match self.kind {
            ProposalKind::Create => "create",
            ProposalKind::Modify => "modify",
        }
    }

    /// The parsed lifecycle state (falls back to `Draft` for unknown text).
    pub fn state(&self) -> ProposalState {
        match self.state.as_str() {
            "validated" => ProposalState::Validated,
            "blocked" => ProposalState::Blocked,
            "accepted" => ProposalState::Accepted,
            _ => ProposalState::Draft,
        }
    }

    /// Set the lifecycle state.
    pub fn set_state(&mut self, state: ProposalState) {
        self.state = state_str(state).to_owned();
    }

    /// The directory holding proposal records for a `.git` dir.
    fn dir(git_dir: &Path) -> PathBuf {
        git_dir.join("silan").join("proposals")
    }

    /// The record file path for an id.
    fn path(git_dir: &Path, id: &str) -> PathBuf {
        Self::dir(git_dir).join(format!("{id}.toml"))
    }

    /// Persist this record under `<git_dir>/silan/proposals/<id>.toml`.
    pub fn save(&self, git_dir: &Path) -> Result<(), ProposalError> {
        let dir = Self::dir(git_dir);
        fs::create_dir_all(&dir).map_err(|e| ProposalError::Store {
            detail: format!("create {}: {e}", dir.display()),
        })?;
        let text = toml::to_string_pretty(self).map_err(|e| ProposalError::Store {
            detail: format!("serialize proposal {}: {e}", self.id),
        })?;
        let path = Self::path(git_dir, &self.id);
        fs::write(&path, text).map_err(|e| ProposalError::Store {
            detail: format!("write {}: {e}", path.display()),
        })
    }

    /// Load one record by id.
    pub fn load(git_dir: &Path, id: &str) -> Result<Self, ProposalError> {
        let path = Self::path(git_dir, id);
        if !path.exists() {
            return Err(ProposalError::Unknown(id.to_owned()));
        }
        let text = fs::read_to_string(&path).map_err(|e| ProposalError::Store {
            detail: format!("read {}: {e}", path.display()),
        })?;
        toml::from_str(&text).map_err(|e| ProposalError::Store {
            detail: format!("parse {}: {e}", path.display()),
        })
    }

    /// Load every proposal record, sorted by id (ULID ids sort by time).
    pub fn load_all(git_dir: &Path) -> Result<Vec<Self>, ProposalError> {
        let dir = Self::dir(git_dir);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut records = Vec::new();
        let entries = fs::read_dir(&dir).map_err(|e| ProposalError::Store {
            detail: format!("list {}: {e}", dir.display()),
        })?;
        for entry in entries {
            let entry = entry.map_err(|e| ProposalError::Store {
                detail: format!("read dir entry: {e}"),
            })?;
            let path = entry.path();
            if path.extension().and_then(|x| x.to_str()) != Some("toml") {
                continue;
            }
            let text = fs::read_to_string(&path).map_err(|e| ProposalError::Store {
                detail: format!("read {}: {e}", path.display()),
            })?;
            let record: Self = toml::from_str(&text).map_err(|e| ProposalError::Store {
                detail: format!("parse {}: {e}", path.display()),
            })?;
            records.push(record);
        }
        records.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(records)
    }

    /// The ids of other pending proposals that touch a URI this one also
    /// touches — the overlap warning of `08` §8.5.
    pub fn overlapping(&self, others: &[Self]) -> Vec<String> {
        others
            .iter()
            .filter(|o| o.id != self.id && o.state() != ProposalState::Accepted)
            .filter(|o| o.touched.iter().any(|u| self.touched.contains(u)))
            .map(|o| o.id.clone())
            .collect()
    }
}

/// The stable lowercase string for a lifecycle state.
fn state_str(state: ProposalState) -> &'static str {
    match state {
        ProposalState::Draft => "draft",
        ProposalState::Validated => "validated",
        ProposalState::Blocked => "blocked",
        ProposalState::Accepted => "accepted",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_round_trips_through_toml() {
        let id = ProposalId::new("01HXTEST").expect("valid id");
        let mut record = ProposalRecord::new(
            &id,
            "abc123",
            ProposalKind::Modify,
            vec!["silan://resources/ideas/rce/progress".to_owned()],
        );
        record.set_state(ProposalState::Validated);

        let tmp = std::env::temp_dir().join(format!("silan-store-{}", std::process::id()));
        let git_dir = tmp.join(".git");
        record.save(&git_dir).expect("save");

        let loaded = ProposalRecord::load(&git_dir, "01HXTEST").expect("load");
        assert_eq!(loaded, record);
        assert_eq!(loaded.state(), ProposalState::Validated);
        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn overlap_detects_shared_touched_part() {
        let a = ProposalRecord::new(
            &ProposalId::new("01A").expect("id"),
            "base",
            ProposalKind::Modify,
            vec!["silan://resources/ideas/rce/progress".to_owned()],
        );
        let b = ProposalRecord::new(
            &ProposalId::new("01B").expect("id"),
            "base",
            ProposalKind::Modify,
            vec!["silan://resources/ideas/rce/progress".to_owned()],
        );
        let c = ProposalRecord::new(
            &ProposalId::new("01C").expect("id"),
            "base",
            ProposalKind::Modify,
            vec!["silan://resources/ideas/other/body".to_owned()],
        );
        let overlap = a.overlapping(&[a.clone(), b.clone(), c]);
        assert_eq!(overlap, vec!["01B".to_owned()]);
    }
}
