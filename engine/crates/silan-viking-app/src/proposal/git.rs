//! A thin wrapper over the `git` CLI.
//!
//! silan-viking does not take a Git library dependency — `content/` is a Git
//! repo and the engine drives it through the `git` binary (`03` §3.1
//! revision B: "version control rides one Git line, not a new dependency").
//! This module is the single place that shells out; everything else in
//! `proposal` speaks `GitRepo` methods.

use std::path::{Path, PathBuf};
use std::process::Command;
use thiserror::Error;

/// A handle to one `content/` Git repository.
#[derive(Debug, Clone)]
pub struct GitRepo {
    /// The repository working tree root.
    root: PathBuf,
}

/// Failures of a `git` invocation.
#[derive(Debug, Error)]
pub enum GitError {
    /// The `git` binary could not be launched.
    #[error("cannot run git: {0}")]
    Spawn(String),
    /// `git` exited non-zero.
    #[error("git {command} failed (exit {code}): {stderr}")]
    Command {
        /// The git subcommand that failed.
        command: String,
        /// The process exit code (or -1 if killed by signal).
        code: i32,
        /// Captured stderr.
        stderr: String,
    },
    /// The directory is not a Git repository.
    #[error("`{0}` is not a git repository")]
    NotARepo(String),
}

/// The successful output of a `git` invocation.
#[derive(Debug, Clone)]
pub struct GitOutput {
    /// Trimmed stdout.
    pub stdout: String,
}

impl GitRepo {
    /// Open the repository rooted at `root`. Verifies `.git` is present so a
    /// caller gets a clear error rather than a confusing later failure.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, GitError> {
        let root = root.as_ref().to_path_buf();
        if !root.join(".git").exists() {
            return Err(GitError::NotARepo(root.display().to_string()));
        }
        Ok(Self { root })
    }

    /// The working-tree root.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The `.git` directory (always `<root>/.git` for the content repo — it is
    /// a normal, non-bare, non-worktree checkout).
    pub fn git_dir(&self) -> PathBuf {
        self.root.join(".git")
    }

    /// Run `git <args>` in the repository root, returning trimmed stdout.
    /// Non-zero exit is a [`GitError::Command`].
    pub fn run<I, S>(&self, args: I) -> Result<GitOutput, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        self.run_in(&self.root, args)
    }

    /// Run `git <args>` with an explicit working directory — used so a
    /// worktree can run `git` against itself.
    pub fn run_in<I, S>(&self, cwd: &Path, args: I) -> Result<GitOutput, GitError>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let args: Vec<String> = args.into_iter().map(|s| s.as_ref().to_owned()).collect();
        let output = Command::new("git")
            .args(&args)
            .current_dir(cwd)
            .output()
            .map_err(|e| GitError::Spawn(e.to_string()))?;
        if output.status.success() {
            Ok(GitOutput {
                stdout: String::from_utf8_lossy(&output.stdout).trim().to_owned(),
            })
        } else {
            Err(GitError::Command {
                command: args.first().cloned().unwrap_or_default(),
                code: output.status.code().unwrap_or(-1),
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            })
        }
    }

    /// The current OID of a ref (e.g. `refs/heads/main` or `HEAD`).
    pub fn rev_parse(&self, refname: &str) -> Result<String, GitError> {
        Ok(self.run(["rev-parse", refname])?.stdout)
    }

    /// Whether a local branch exists.
    pub fn branch_exists(&self, branch: &str) -> bool {
        self.run([
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ])
        .is_ok()
    }

    /// Move `refs/heads/<branch>` to `new_oid`, but only if it currently
    /// points at `expected_old` — the atomicity guard of `08` §8.5. Git's
    /// `update-ref <ref> <new> <old>` performs this compare-and-set itself.
    pub fn update_ref_checked(
        &self,
        branch: &str,
        new_oid: &str,
        expected_old: &str,
    ) -> Result<(), GitError> {
        self.run([
            "update-ref",
            &format!("refs/heads/{branch}"),
            new_oid,
            expected_old,
        ])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_rejects_non_repo() {
        let dir = std::env::temp_dir();
        // temp_dir itself is not a git repo.
        let err = GitRepo::open(&dir);
        assert!(matches!(err, Err(GitError::NotARepo(_))));
    }
}
