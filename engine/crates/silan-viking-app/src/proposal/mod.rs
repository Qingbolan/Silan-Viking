//! M7 proposal layer — the agent update path (`docs/silan-viking/03` §3.1,
//! `08` §8.5).
//!
//! A proposal is **not** the truth source: `capture` / `propose` write a draft
//! onto a Git branch `proposal/<id>` of the `content/` repo. `accept` is the
//! only thing that moves the draft into the main branch, and it does so
//! atomically — merge + validation happen in a throwaway `git worktree`, and
//! the main branch pointer is fast-forwarded exactly once, under a lock, with
//! an expected-old-OID guard (`08` §8.5).
//!
//! Module map:
//! - this file — the typed contract (`ProposalId` / `ProposalTarget` /
//!   `ProposalState` / `ProposalSummary` / `ProposalError`).
//! - [`git`] — a thin `git` CLI wrapper (`GitRepo`); silan-viking talks to one
//!   Git line, not a Git library (`03` §3.1 revision B).
//! - [`lock`] — the `proposal-accept.lock` / `agent-write.lock` file locks
//!   (`08` §8.5).
//! - [`store`] — proposal metadata persisted under `.git/silan/proposals/`.
//! - [`accept`] — the worktree-merge-validate-update-ref `accept` flow and
//!   `canonicalize`.

pub mod accept;
pub mod git;
pub mod lock;
pub mod store;

pub use accept::{canonicalize, AcceptOutcome, AcceptReport};
pub use git::{GitError, GitRepo};
pub use lock::{LockError, ProposalLock};
pub use store::ProposalRecord;

use silan_viking_base::SilanUri;
use std::str::FromStr;
use thiserror::Error;

/// A proposal branch id. ULID-shaped in production, string-backed for tests.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProposalId(String);

impl ProposalId {
    /// Create an id after minimal shape validation.
    pub fn new(raw: impl Into<String>) -> Result<Self, ProposalError> {
        let raw = raw.into();
        if raw.is_empty() || raw.contains('/') || raw.contains(' ') {
            return Err(ProposalError::InvalidId(raw));
        }
        Ok(Self(raw))
    }

    /// The branch name used for this proposal.
    pub fn branch_name(&self) -> String {
        format!("proposal/{}", self.0)
    }

    /// Raw id string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// What a proposal changes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProposalTarget {
    /// A full Item URI.
    Item(SilanUri),
    /// One Part under an Item URI.
    Part { item: SilanUri, role: String },
    /// The container series of an `episode` type — the `series.toml` itself.
    /// URI form: `silan://resources/episode/<series_slug>` (2 segments).
    /// Lets the agent propose changes to series metadata (title, description,
    /// status) without touching any of its episode Items.
    Series(SilanUri),
}

impl ProposalTarget {
    /// Parse a proposal target URI.
    ///
    /// Segment counts are type-dependent because `episode` is a *container*
    /// type — its Items live one level deeper, under a series:
    ///
    /// | type     | Series URI            | Item URI                            | Part URI                 |
    /// |----------|-----------------------|-------------------------------------|--------------------------|
    /// | flat     | n/a                   | `…/<kind>/<slug>` (2 seg)            | `…/<slug>/<role>` (3)    |
    /// | episode  | `…/episode/<series>` (2) | `…/episode/<series>/<episode>` (3) | `…/<episode>/<role>` (4) |
    ///
    /// A 2-segment URI is a Series target when its first segment is `episode`,
    /// otherwise it's a flat-type Item.
    pub fn parse(raw: &str) -> Result<Self, ProposalError> {
        let uri =
            SilanUri::from_str(raw).map_err(|e| ProposalError::InvalidTarget(e.to_string()))?;
        if uri.namespace() != silan_viking_base::Namespace::Resources {
            return Err(ProposalError::InvalidTarget(
                "proposal target must be under silan://resources".to_owned(),
            ));
        }
        let segments = uri.segments();
        let is_episode = segments.first().map(String::as_str) == Some("episode");

        // The segment count at which the URI is a whole Item: episode Items
        // carry an extra `<series>` segment.
        let item_len = if is_episode { 3 } else { 2 };

        match segments.len() {
            // Series container — only the `episode` type has this shape.
            2 if is_episode => Ok(ProposalTarget::Series(uri)),
            n if n == item_len => Ok(ProposalTarget::Item(uri)),
            n if n == item_len + 1 => {
                // The last segment is the Part role; the rest is the Item.
                let mut item_segments = segments.to_vec();
                let role = item_segments.pop().unwrap_or_default();
                let item = SilanUri::new(uri.namespace(), item_segments)
                    .map_err(|e| ProposalError::InvalidTarget(e.to_string()))?;
                Ok(ProposalTarget::Part { item, role })
            }
            _ => Err(ProposalError::InvalidTarget(format!(
                "target must identify an item ({item_len} segments) or a part \
                 ({} segments)",
                item_len + 1
            ))),
        }
    }
}

/// Proposal lifecycle state shown by adapters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProposalState {
    /// Created but not yet validated.
    Draft,
    /// Validate-on-submit passed.
    Validated,
    /// Merge or validation conflict blocks acceptance.
    Blocked,
    /// Accepted into main.
    Accepted,
}

/// Proposal metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProposalSummary {
    /// Proposal id.
    pub id: ProposalId,
    /// Target URI/Part.
    pub target: ProposalTarget,
    /// Current state.
    pub state: ProposalState,
    /// Last validation summary.
    pub validation: String,
}

/// Proposal errors — the surface every proposal operation funnels through.
#[derive(Debug, Error)]
pub enum ProposalError {
    /// Id cannot become a branch name.
    #[error("invalid proposal id `{0}`")]
    InvalidId(String),
    /// Target URI is outside the supported proposal surface.
    #[error("invalid proposal target: {0}")]
    InvalidTarget(String),
    /// A `git` invocation failed.
    #[error("git error: {0}")]
    Git(#[from] GitError),
    /// Writing a proposal draft file into the working tree failed — raised
    /// from the `write_draft` closure of `Workspace::create_proposal`.
    #[error("proposal draft io error: {0}")]
    Io(String),
    /// Acquiring or releasing a proposal lock failed.
    #[error("lock error: {0}")]
    Lock(#[from] LockError),
    /// Proposal metadata could not be read or written.
    #[error("proposal store error: {detail}")]
    Store {
        /// What went wrong.
        detail: String,
    },
    /// No proposal with this id is known.
    #[error("unknown proposal `{0}`")]
    Unknown(String),
    /// The merge into the temporary worktree hit a conflict — the main
    /// branch was not touched (`08` §8.5).
    #[error("proposal `{id}` conflicts with main: {detail}")]
    MergeConflict {
        /// The conflicting proposal.
        id: String,
        /// Conflict detail (e.g. the conflicting files).
        detail: String,
    },
    /// Validation ② of the merged result failed — the main branch was not
    /// touched (`03` §3.1).
    #[error("proposal `{id}` failed post-merge validation: {detail}")]
    ValidationFailed {
        /// The proposal that failed validation.
        id: String,
        /// Validation detail.
        detail: String,
    },
    /// The main branch advanced under us between validation and the pointer
    /// update — the expected-old-OID guard rejected the `update-ref`
    /// (`08` §8.5). The accept is aborted and can be retried.
    #[error("main branch advanced during accept of `{id}` (expected {expected}, found {actual})")]
    StaleMain {
        /// The proposal being accepted.
        id: String,
        /// The OID `accept` based its validation on.
        expected: String,
        /// The OID main is actually at now.
        actual: String,
    },
    /// The `content/` working tree had uncommitted changes when `accept` ran.
    /// `accept` ends by `reset --hard`ing the working tree onto the merge
    /// commit, which would discard those edits — so it refuses up front,
    /// leaving the proposal and `main` untouched. Commit or discard the
    /// working-tree changes, then re-run `accept`.
    #[error(
        "`content/` has uncommitted changes — commit or discard them before \
         accepting `{id}`"
    )]
    WorkingTreeDirty {
        /// The proposal being accepted.
        id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn part_targets_are_split_from_item_uri() {
        let target =
            ProposalTarget::parse("silan://resources/ideas/rce/progress").expect("valid target");
        match target {
            ProposalTarget::Part { item, role } => {
                assert_eq!(item.to_string(), "silan://resources/ideas/rce");
                assert_eq!(role, "progress");
            }
            ProposalTarget::Item(_) | ProposalTarget::Series(_) => {
                panic!("expected part target")
            }
        }
    }

    #[test]
    fn parse_series_target_is_a_two_segment_episode_uri() {
        let target =
            ProposalTarget::parse("silan://resources/episode/using-silan-viking").expect("parse");
        match target {
            ProposalTarget::Series(uri) => {
                assert_eq!(
                    uri.to_string(),
                    "silan://resources/episode/using-silan-viking"
                );
            }
            _ => panic!("expected Series target"),
        }
    }

    #[test]
    fn proposal_ids_map_to_branches() {
        let id = ProposalId::new("01HX").expect("valid");
        assert_eq!(id.branch_name(), "proposal/01HX");
    }
}
