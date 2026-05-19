//! The `accept` flow and `canonicalize` (`03` §3.1, `08` §8.5).
//!
//! `accept` is **not** a `git merge`. Its hard invariant: the main branch only
//! ever moves to an already-validated commit, and it moves exactly once.
//!
//! The flow (`03` §3.1 "accept 流程"):
//! 1. Acquire `proposal-accept.lock` + `agent-write.lock` (`08` §8.5).
//! 2. Record the main OID — this is the `expected_old` for step 6; then
//!    refuse if the main `content/` working tree is dirty, since step 6
//!    `reset --hard`s it and an uncommitted edit would be lost.
//! 3. `git worktree add` a throwaway worktree at that OID.
//! 4. In the worktree: `git merge proposal/<id>`. A conflict aborts the
//!    accept; the main branch was never touched.
//! 5. Validation ② — open a `Workspace` on the *merged worktree* and run the
//!    parsers' `validate`. Any `Fatal` issue aborts; main untouched.
//! 6. `git update-ref refs/heads/main <merge_oid> <expected_old>` — the
//!    compare-and-set. If main advanced meanwhile, this fails and main stays.
//!    On success, `git reset --hard <merge_oid>` the main working tree so the
//!    accepted files are actually on disk for `index sync` to scan.
//! 7. The worktree is removed unconditionally — success, conflict, or
//!    validation failure all clean it up.

use super::git::GitRepo;
use super::lock::ProposalLock;
use super::store::ProposalRecord;
use super::{ProposalError, ProposalId, ProposalState};
use crate::parser::Severity;
use crate::Workspace;
use std::path::{Path, PathBuf};

/// How an `accept` resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AcceptOutcome {
    /// The proposal was merged, validated, and main was advanced.
    Accepted,
}

/// The result of a successful `accept`.
#[derive(Debug, Clone)]
pub struct AcceptReport {
    /// Always [`AcceptOutcome::Accepted`] — failures are `ProposalError`s.
    pub outcome: AcceptOutcome,
    /// The proposal id that was accepted.
    pub id: String,
    /// The main OID before the accept (the `expected_old` guard value).
    pub previous_main: String,
    /// The validated merge commit main now points at.
    pub new_main: String,
}

/// A worktree that removes itself from Git on drop — so every exit path of
/// `accept` (success, conflict, validation failure, panic) cleans up
/// (`03` §3.1 step "出口清理").
struct ScopedWorktree<'a> {
    repo: &'a GitRepo,
    path: PathBuf,
}

impl<'a> ScopedWorktree<'a> {
    /// `git worktree add --detach <path> <oid>` — a detached worktree at a
    /// specific commit, so the merge has a clean base.
    fn add(repo: &'a GitRepo, path: PathBuf, oid: &str) -> Result<Self, ProposalError> {
        repo.run([
            "worktree",
            "add",
            "--detach",
            &path.display().to_string(),
            oid,
        ])?;
        Ok(Self { repo, path })
    }

    /// The worktree working directory.
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ScopedWorktree<'_> {
    fn drop(&mut self) {
        // Unconditional cleanup. `--force` because the worktree may hold an
        // in-progress (conflicted) merge. Best-effort: a drop must not unwind.
        if let Err(e) = self.repo.run([
            "worktree",
            "remove",
            "--force",
            &self.path.display().to_string(),
        ]) {
            tracing::warn!(
                worktree = %self.path.display(),
                error = %e,
                "failed to remove accept worktree"
            );
        }
    }
}

/// Accept proposal `id` into the `main` branch of the `content` Git repo.
///
/// `content_root` is the `content/` directory — it is itself the Git repo
/// (`03` §3.1). `main_branch` is usually `"main"`.
///
/// On success the main branch points at a validated merge commit. Every
/// failure mode (`MergeConflict` / `ValidationFailed` / `StaleMain`) leaves
/// the main branch exactly where it was.
pub fn accept(
    content_root: &Path,
    id: &ProposalId,
    main_branch: &str,
) -> Result<AcceptReport, ProposalError> {
    let repo = GitRepo::open(content_root)?;
    let git_dir = repo.git_dir();

    // The proposal must exist as both a record and a branch.
    let mut record = ProposalRecord::load(&git_dir, id.as_str())?;
    let branch = id.branch_name();
    if !repo.branch_exists(&branch) {
        return Err(ProposalError::Unknown(id.as_str().to_owned()));
    }

    // (1) Lock — held for the whole flow; released when `_lock` drops.
    let _lock = ProposalLock::acquire_accept(&git_dir)?;

    // (2) The expected-old OID for the step-6 compare-and-set.
    let expected_old = repo.rev_parse(&format!("refs/heads/{main_branch}"))?;

    // (2.5) The main working tree must be clean before accepting. Step 6.5
    //     `reset --hard`s it onto the merge commit; an uncommitted edit there
    //     would be lost. Fail here — before `main` is touched — so a dirty
    //     tree leaves the proposal and `main` exactly as they were.
    let working_tree_dirty = repo
        .run(["status", "--porcelain"])
        .map(|out| !out.stdout.trim().is_empty())
        .unwrap_or(true);
    if working_tree_dirty {
        return Err(ProposalError::WorkingTreeDirty {
            id: id.as_str().to_owned(),
        });
    }

    // (3) Throwaway worktree at main HEAD. `_worktree` removes it on every
    //     exit path below.
    let worktree_path = git_dir
        .join("silan")
        .join("worktrees")
        .join(format!("accept-{}", id.as_str()));
    let worktree = ScopedWorktree::add(&repo, worktree_path, &expected_old)?;

    // (4) Merge the proposal branch inside the worktree.
    let merge = repo.run_in(
        worktree.path(),
        [
            "merge",
            "--no-ff",
            "-m",
            &format!("accept proposal {}", id.as_str()),
            &branch,
        ],
    );
    if let Err(e) = merge {
        // Abort the half-done merge so worktree removal is clean.
        let _ = repo.run_in(worktree.path(), ["merge", "--abort"]);
        record.set_state(ProposalState::Blocked);
        record.validation = format!("failed:merge conflict: {e}");
        let _ = record.save(&git_dir);
        return Err(ProposalError::MergeConflict {
            id: id.as_str().to_owned(),
            detail: e.to_string(),
        });
    }
    let merge_oid = repo.run_in(worktree.path(), ["rev-parse", "HEAD"])?.stdout;

    // (5) Validation ② — against the merged worktree, the real gate
    //     (`03` §3.1: "校验② 是真正的关卡").
    if let Err(detail) = validate_worktree(worktree.path()) {
        record.set_state(ProposalState::Blocked);
        record.validation = format!("failed:{detail}");
        let _ = record.save(&git_dir);
        return Err(ProposalError::ValidationFailed {
            id: id.as_str().to_owned(),
            detail,
        });
    }

    // (6) Advance main exactly once, guarded by the expected-old OID. If main
    //     moved during validation, Git rejects this and main is left alone.
    if let Err(e) = repo.update_ref_checked(main_branch, &merge_oid, &expected_old) {
        let actual = repo
            .rev_parse(&format!("refs/heads/{main_branch}"))
            .unwrap_or_else(|_| "<unknown>".to_owned());
        if actual != expected_old {
            return Err(ProposalError::StaleMain {
                id: id.as_str().to_owned(),
                expected: expected_old,
                actual,
            });
        }
        return Err(ProposalError::Git(e));
    }

    // (6.5) Sync the main working tree to the advanced `main`.
    //
    // Step 6 moved the `main` *ref* only — the merge happened in a throwaway
    // worktree, so the real `content/` working directory still holds the
    // pre-accept files. Left there, the working tree and `HEAD` disagree:
    // every file the proposal added shows up as a staged deletion, and
    // `index sync` (which scans the working directory, not the commit) never
    // sees the accepted content. The whole point of `accept` is to land the
    // proposal into the truth source — so the working tree must follow.
    //
    // The pre-accept dirtiness check (step 2.5) guarantees the working tree
    // had no uncommitted edits, so `reset --hard` only fast-forwards the
    // files to the merge commit and discards nothing.
    repo.run(["reset", "--hard", &merge_oid])?;

    // Record the accepted state. The worktree drops (removed) right after.
    record.set_state(ProposalState::Accepted);
    record.validation = "passed".to_owned();
    record.save(&git_dir)?;

    Ok(AcceptReport {
        outcome: AcceptOutcome::Accepted,
        id: id.as_str().to_owned(),
        previous_main: expected_old,
        new_main: merge_oid,
    })
}

/// Validation ② — open a `Workspace` on a merged worktree's content tree and
/// run every parser's `validate`. Returns `Err(detail)` if any `Fatal` issue
/// is found, with the issues joined into one message.
fn validate_worktree(worktree: &Path) -> Result<(), String> {
    // The content repo *is* the `content/` dir, so `SCHEMA.md` is at the
    // worktree root.
    let workspace = Workspace::open(worktree).map_err(|e| format!("open workspace: {e}"))?;
    let scan = workspace.scan().map_err(|e| format!("scan: {e}"))?;

    let mut fatals = Vec::new();
    for item in scan.items() {
        let parser = workspace
            .parsers()
            .parser_for(item)
            .map_err(|e| format!("parser dispatch: {e}"))?;
        let parsed = match parser.parse(item) {
            Ok(parsed) => parsed,
            Err(e) => {
                fatals.push(format!("{}: parse error: {e}", item.slug()));
                continue;
            }
        };
        for issue in parser.validate(item, &parsed) {
            if issue.severity() == Severity::Fatal {
                fatals.push(format!("{}: {}", item.slug(), issue.message()));
            }
        }
    }

    if fatals.is_empty() {
        Ok(())
    } else {
        Err(fatals.join("; "))
    }
}

/// Canonicalize a relation direction (`08` §8.5 / `01` §1.10 revision A,
/// `10` §10.5): only canonical directions are stored, so `evolved_from` is
/// rewritten to its `evolved_into` flip with the endpoints swapped. Every
/// other relation type is already canonical and passes through unchanged.
///
/// Returns `(relation_type, from, to)` in canonical form.
pub fn canonicalize<'a>(
    relation_type: &'a str,
    from: &'a str,
    to: &'a str,
) -> (&'a str, &'a str, &'a str) {
    match relation_type {
        // The one non-canonical direction in the closed relation set.
        "evolved_from" => ("evolved_into", to, from),
        other => (other, from, to),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalize_flips_evolved_from() {
        let (rel, from, to) = canonicalize("evolved_from", "a", "b");
        assert_eq!((rel, from, to), ("evolved_into", "b", "a"));
    }

    #[test]
    fn canonicalize_passes_through_canonical_relations() {
        for rel in [
            "evolved_into",
            "documents",
            "references",
            "supersedes",
            "part_of",
        ] {
            let (out, from, to) = canonicalize(rel, "a", "b");
            assert_eq!((out, from, to), (rel, "a", "b"));
        }
    }
}
