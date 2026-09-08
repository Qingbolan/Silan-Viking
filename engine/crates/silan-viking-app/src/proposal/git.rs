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

/// Whether the checked-out content revision exists at its configured
/// upstream. Production snapshots are intentionally public-only, so this
/// remote is the durability boundary for the complete repository, including
/// the private `agent/` namespace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemoteBackupState {
    /// The current branch has no external upstream configured.
    MissingUpstream { branch: String },
    /// The configured upstream exists, but does not point at local HEAD.
    OutOfSync {
        upstream: String,
        local_head: String,
        remote_head: String,
    },
    /// Local HEAD is byte-for-byte present at the configured upstream.
    Synchronized { upstream: String, head: String },
}

impl GitRepo {
    /// Initialise a new content repository and commit its recovered source.
    ///
    /// Recovery cannot recreate the original Git object graph from a source
    /// archive, so the deployed commit is recorded in the commit message while
    /// the restored tree starts a new, explicit history.
    pub fn initialize_recovered(
        root: impl AsRef<Path>,
        deployed_commit: &str,
        author_name: &str,
        author_email: &str,
    ) -> Result<Self, GitError> {
        let root = root.as_ref();
        run_git_command(root, ["init", "--quiet", "-b", "main"])?;
        run_git_command(root, ["config", "user.name", author_name])?;
        run_git_command(root, ["config", "user.email", author_email])?;
        run_git_command(root, ["add", "-A"])?;
        run_git_command(
            root,
            [
                "commit",
                "--quiet",
                "-m",
                &format!("recovery: restore deployed content {deployed_commit}"),
            ],
        )?;
        Self::open(root)
    }

    /// Open the repository rooted at `root`. Verifies `.git` is present so a
    /// caller gets a clear error rather than a confusing later failure.
    pub fn open(root: impl AsRef<Path>) -> Result<Self, GitError> {
        let root = root.as_ref().to_path_buf();
        if !root.join(".git").exists() {
            return Err(GitError::NotARepo(root.display().to_string()));
        }
        Ok(Self { root })
    }

    /// Clone this repository into an absent destination.
    ///
    /// Recovery integration uses an isolated clone to prove a three-way
    /// merge before it touches the owner's checked-out worktree.
    pub fn clone_to(&self, destination: impl AsRef<Path>) -> Result<Self, GitError> {
        let destination = destination.as_ref();
        let parent = destination.parent().ok_or_else(|| {
            GitError::Spawn(format!(
                "clone destination {} has no parent",
                destination.display()
            ))
        })?;
        run_git_command(
            parent,
            [
                "clone",
                "--quiet",
                self.root.to_str().ok_or_else(|| {
                    GitError::Spawn(format!("non-UTF-8 repository path {}", self.root.display()))
                })?,
                destination.to_str().ok_or_else(|| {
                    GitError::Spawn(format!(
                        "non-UTF-8 clone destination {}",
                        destination.display()
                    ))
                })?,
            ],
        )?;
        Self::open(destination)
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
        let raw = self.run_raw(cwd, args)?;
        Ok(GitOutput {
            stdout: raw.stdout.trim().to_owned(),
        })
    }

    /// Like [`GitRepo::run`], but never trims stdout. Machine-readable
    /// formats such as `git status --porcelain` use a leading space as a
    /// meaningful "no change in this column" value — `run`'s `.trim()` would
    /// silently eat that space (and shift every field after it) whenever the
    /// first byte of output happens to be blank.
    pub fn run_raw<I, S>(&self, cwd: &Path, args: I) -> Result<GitOutput, GitError>
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
                stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            })
        } else {
            Err(GitError::Command {
                command: args.first().cloned().unwrap_or_default(),
                code: output.status.code().unwrap_or(-1),
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            })
        }
    }

    /// Produce a byte-exact tar archive from one committed revision.
    ///
    /// Binary Git output stays inside this adapter rather than leaking a
    /// second process-spawning implementation into the application layer.
    pub fn archive(&self, revision: &str, paths: &[&str]) -> Result<Vec<u8>, GitError> {
        let mut args = vec!["archive", "--format=tar", revision, "--"];
        args.extend(paths.iter().copied());
        let output = Command::new("git")
            .args(&args)
            .current_dir(&self.root)
            .output()
            .map_err(|error| GitError::Spawn(error.to_string()))?;
        if output.status.success() {
            Ok(output.stdout)
        } else {
            Err(GitError::Command {
                command: "archive".to_owned(),
                code: output.status.code().unwrap_or(-1),
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
            })
        }
    }

    /// The current OID of a ref (e.g. `refs/heads/main` or `HEAD`).
    pub fn rev_parse(&self, refname: &str) -> Result<String, GitError> {
        Ok(self.run(["rev-parse", refname])?.stdout)
    }

    /// Query the configured upstream directly and compare it with local HEAD.
    ///
    /// `git status` and cached remote-tracking refs are insufficient here:
    /// both can look clean while the local repository remains the only copy.
    /// `ls-remote` verifies the actual backup without mutating either side.
    pub fn remote_backup_state(&self) -> Result<RemoteBackupState, GitError> {
        let branch = self.run(["rev-parse", "--abbrev-ref", "HEAD"])?.stdout;
        if branch == "HEAD" {
            return Ok(RemoteBackupState::MissingUpstream { branch });
        }
        let remote = match self.run(["config", "--get", &format!("branch.{branch}.remote")]) {
            Ok(output) if !output.stdout.is_empty() && output.stdout != "." => output.stdout,
            _ => return Ok(RemoteBackupState::MissingUpstream { branch }),
        };
        let merge_ref = match self.run(["config", "--get", &format!("branch.{branch}.merge")]) {
            Ok(output) if !output.stdout.is_empty() => output.stdout,
            _ => return Ok(RemoteBackupState::MissingUpstream { branch }),
        };
        let local_head = self.rev_parse("HEAD")?;
        let remote_output = self.run(["ls-remote", "--exit-code", &remote, &merge_ref])?;
        let remote_head = remote_output
            .stdout
            .split_whitespace()
            .next()
            .unwrap_or_default()
            .to_owned();
        let upstream = format!("{remote}/{}", merge_ref.trim_start_matches("refs/heads/"));
        if remote_head == local_head {
            Ok(RemoteBackupState::Synchronized {
                upstream,
                head: local_head,
            })
        } else {
            Ok(RemoteBackupState::OutOfSync {
                upstream,
                local_head,
                remote_head,
            })
        }
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

fn run_git_command<I, S>(cwd: &Path, args: I) -> Result<(), GitError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args = args
        .into_iter()
        .map(|argument| argument.as_ref().to_owned())
        .collect::<Vec<_>>();
    let output = Command::new("git")
        .args(&args)
        .current_dir(cwd)
        .output()
        .map_err(|error| GitError::Spawn(error.to_string()))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(GitError::Command {
            command: args.first().cloned().unwrap_or_default(),
            code: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_owned(),
        })
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

    #[test]
    fn remote_backup_state_requires_an_upstream_and_observes_pushes() {
        let directory = tempfile::tempdir().expect("temp");
        let content = directory.path().join("content");
        let remote = directory.path().join("remote.git");
        std::fs::create_dir(&content).expect("content");
        run_git_command(&content, ["init", "--quiet", "-b", "main"]).expect("init");
        std::fs::write(content.join("SCHEMA.md"), "schema\n").expect("source");
        run_git_command(&content, ["add", "."]).expect("add");
        run_git_command(
            &content,
            [
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "--quiet",
                "-m",
                "initial",
            ],
        )
        .expect("commit");
        let repo = GitRepo::open(&content).expect("repo");
        assert!(matches!(
            repo.remote_backup_state().expect("state"),
            RemoteBackupState::MissingUpstream { .. }
        ));

        run_git_command(
            directory.path(),
            ["init", "--quiet", "--bare", remote.to_str().unwrap()],
        )
        .expect("bare remote");
        run_git_command(
            &content,
            ["remote", "add", "origin", remote.to_str().unwrap()],
        )
        .expect("add remote");
        run_git_command(&content, ["push", "--quiet", "-u", "origin", "main"]).expect("push");
        assert!(matches!(
            repo.remote_backup_state().expect("state"),
            RemoteBackupState::Synchronized { .. }
        ));

        std::fs::write(content.join("SCHEMA.md"), "new schema\n").expect("edit");
        run_git_command(&content, ["add", "."]).expect("add edit");
        run_git_command(
            &content,
            [
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "--quiet",
                "-m",
                "local change",
            ],
        )
        .expect("commit edit");
        assert!(matches!(
            repo.remote_backup_state().expect("state"),
            RemoteBackupState::OutOfSync { .. }
        ));
    }
}
