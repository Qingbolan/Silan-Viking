//! Process-level file locks for proposal acceptance (`08` §8.5).
//!
//! Two locks live under `<content>/.git/silan/locks/`:
//! - `proposal-accept.lock` — only one `accept`/`rebase` may write the main
//!   branch of a content repo at a time.
//! - `agent-write.lock` — the HEAD write lock shared with `ctx_write` /
//!   `reflect`; `accept` must also hold it before advancing main so a direct
//!   `agent/` commit cannot race the `update-ref`.
//!
//! The lock is a file created with `create_new` (atomic O_EXCL). Holding the
//! [`ProposalLock`] guard owns the file; dropping it removes the file. This is
//! advisory across cooperating silan-viking processes — it does not defend
//! against an unrelated process editing `.git` by hand.

use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// The two lock kinds of `08` §8.5.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockKind {
    /// `proposal-accept.lock` — mutual exclusion of `accept`/`rebase`.
    ProposalAccept,
    /// `agent-write.lock` — the shared HEAD write lock.
    AgentWrite,
}

impl LockKind {
    /// The lock file name.
    fn file_name(self) -> &'static str {
        match self {
            LockKind::ProposalAccept => "proposal-accept.lock",
            LockKind::AgentWrite => "agent-write.lock",
        }
    }
}

/// Lock acquisition failures.
#[derive(Debug, Error)]
pub enum LockError {
    /// Another process holds the lock.
    #[error("`{kind}` is held by another process")]
    Held {
        /// The contended lock file name.
        kind: String,
    },
    /// The lock directory or file could not be created/removed.
    #[error("lock io error on `{path}`: {detail}")]
    Io {
        /// The lock path involved.
        path: String,
        /// The underlying error.
        detail: String,
    },
}

/// An RAII guard owning one or more lock files. Dropping it releases them.
///
/// Use [`ProposalLock::acquire_accept`] to take both locks `accept` needs in
/// the order `08` §8.5 prescribes (`proposal-accept` then `agent-write`).
#[derive(Debug)]
pub struct ProposalLock {
    /// Held lock files, released (removed) on drop in reverse order.
    files: Vec<PathBuf>,
}

impl ProposalLock {
    /// The directory holding the lock files for a given `.git` dir.
    fn locks_dir(git_dir: &Path) -> PathBuf {
        git_dir.join("silan").join("locks")
    }

    /// Take a single lock. Fails fast if it is already held — `accept` does
    /// not queue, it tells the caller to retry (`08` §8.5).
    fn take_one(git_dir: &Path, kind: LockKind) -> Result<PathBuf, LockError> {
        let dir = Self::locks_dir(git_dir);
        fs::create_dir_all(&dir).map_err(|e| LockError::Io {
            path: dir.display().to_string(),
            detail: e.to_string(),
        })?;
        let path = dir.join(kind.file_name());
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(_) => Ok(path),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Err(LockError::Held {
                kind: kind.file_name().to_owned(),
            }),
            Err(e) => Err(LockError::Io {
                path: path.display().to_string(),
                detail: e.to_string(),
            }),
        }
    }

    /// Acquire both locks `accept` needs, in the `08` §8.5 order:
    /// `proposal-accept.lock` first, then `agent-write.lock`. If the second
    /// fails the first is released, so a failed acquisition leaves no lock.
    pub fn acquire_accept(git_dir: &Path) -> Result<Self, LockError> {
        let accept = Self::take_one(git_dir, LockKind::ProposalAccept)?;
        let agent = match Self::take_one(git_dir, LockKind::AgentWrite) {
            Ok(p) => p,
            Err(e) => {
                // Release the first lock so we never strand a partial set.
                let _ = fs::remove_file(&accept);
                return Err(e);
            }
        };
        Ok(Self {
            files: vec![accept, agent],
        })
    }
}

impl Drop for ProposalLock {
    fn drop(&mut self) {
        // Release in reverse acquisition order. Best-effort: a failed remove
        // is logged, not panicked — a drop must not unwind.
        for path in self.files.iter().rev() {
            if let Err(e) = fs::remove_file(path) {
                tracing::warn!(path = %path.display(), error = %e, "failed to release proposal lock");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_acquire_is_rejected_then_freed_on_drop() {
        let tmp = std::env::temp_dir().join(format!("silan-lock-test-{}", std::process::id()));
        let git_dir = tmp.join(".git");
        fs::create_dir_all(&git_dir).expect("mk git dir");

        let held = ProposalLock::acquire_accept(&git_dir).expect("first acquire");
        let contended = ProposalLock::acquire_accept(&git_dir);
        assert!(matches!(contended, Err(LockError::Held { .. })));

        drop(held);
        // Once released, a fresh acquisition succeeds.
        let again = ProposalLock::acquire_accept(&git_dir);
        assert!(again.is_ok());
        drop(again);
        let _ = fs::remove_dir_all(&tmp);
    }
}
