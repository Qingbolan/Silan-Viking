//! Release and deployment application control plane.

use crate::{api_base_url, stats::private_api_token, GitRepo, Workspace, WorkspaceSync};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use thiserror::Error;

const AUTHOR_NAME: &str = "Silan.Hu";
const AUTHOR_EMAIL: &str = "silan.hu@u.nus.edu";

#[derive(Debug, Error)]
pub enum DeliveryControlError {
    #[error("delivery repository error: {0}")]
    Repository(String),
    #[error("workspace error: {0}")]
    Workspace(String),
    #[error("deployment runner error: {0}")]
    Runner(String),
    #[error("remote status error: {0}")]
    Remote(String),
    #[error("remote verification needs SILAN_STATS_SYNC_TOKEN")]
    MissingCredential,
    #[error("unsupported release scope `{0}`")]
    UnsupportedScope(String),
    #[error("{0} has no updates to release")]
    NothingToRelease(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReleaseScope {
    Resume,
    Blog,
    Project,
    Idea,
    Update,
}

impl ReleaseScope {
    pub fn parse(value: &str) -> Result<Self, DeliveryControlError> {
        match value {
            "resume" => Ok(Self::Resume),
            "blog" => Ok(Self::Blog),
            "project" => Ok(Self::Project),
            "idea" => Ok(Self::Idea),
            "update" => Ok(Self::Update),
            other => Err(DeliveryControlError::UnsupportedScope(other.to_owned())),
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Self::Resume => "resume",
            Self::Blog => "blog",
            Self::Project => "project",
            Self::Idea => "idea",
            Self::Update => "update",
        }
    }
    fn label(self) -> &'static str {
        match self {
            Self::Resume => "Resume",
            Self::Blog => "Blog",
            Self::Project => "Projects",
            Self::Idea => "Ideas",
            Self::Update => "Updates",
        }
    }
    fn paths(self) -> &'static [&'static str] {
        match self {
            Self::Resume => &["resources/resume"],
            Self::Blog => &["resources/blog", "resources/episode"],
            Self::Project => &["resources/projects"],
            Self::Idea => &["resources/ideas"],
            Self::Update => &["resources/update"],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionChange {
    pub status: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionCommit {
    pub hash: String,
    pub subject: String,
    pub relative_time: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ScopeReleaseStatus {
    pub scope: ReleaseScope,
    pub scope_label: String,
    pub branch: String,
    pub head: String,
    pub dirty_count: usize,
    pub changes: Vec<VersionChange>,
    pub recent_commits: Vec<VersionCommit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommitActivityDay {
    pub date: String,
    pub commit_count: usize,
    pub scopes: Vec<ReleaseScope>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeploymentPlan {
    pub branch: String,
    pub head: String,
    pub deploy_target: Option<String>,
    pub dirty_count: usize,
    pub media_asset_count: usize,
    pub next_action: String,
    pub commit_activity: Vec<CommitActivityDay>,
    pub scopes: Vec<ScopeReleaseStatus>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeployRunStatus {
    pub success: bool,
    pub content_commit: String,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct RemoteContentVersion {
    pub health: String,
    pub content_hash: String,
    pub content_commit: String,
    pub generated_at: String,
    pub media_root_ok: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeployVerificationResult {
    pub verified: bool,
    pub expected_content_commit: String,
    pub remote: RemoteContentVersion,
    pub mismatch_reason: Option<String>,
}

pub struct DeliveryControl {
    content_root: PathBuf,
    db_path: PathBuf,
    repo_root: PathBuf,
    bearer_token: Option<String>,
}

impl DeliveryControl {
    pub fn open(
        content_root: impl AsRef<Path>,
        db_path: impl AsRef<Path>,
        repo_root: impl AsRef<Path>,
    ) -> Result<Self, DeliveryControlError> {
        Workspace::open(content_root.as_ref())
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        GitRepo::open(content_root.as_ref())
            .map_err(|error| DeliveryControlError::Repository(error.to_string()))?;
        Ok(Self {
            content_root: content_root.as_ref().to_path_buf(),
            db_path: db_path.as_ref().to_path_buf(),
            repo_root: repo_root.as_ref().to_path_buf(),
            bearer_token: private_api_token(),
        })
    }

    /// Override the runtime private API token for an explicit embedding or
    /// deterministic HTTP contract test.
    pub fn with_bearer_token(mut self, token: impl Into<String>) -> Self {
        let token = token.into();
        let token = token.trim();
        self.bearer_token = (!token.is_empty()).then(|| token.to_owned());
        self
    }

    pub fn scope_status(
        &self,
        scope: ReleaseScope,
    ) -> Result<ScopeReleaseStatus, DeliveryControlError> {
        let repo = self.repo()?;
        let branch = run(&repo, ["branch", "--show-current"])?;
        let head = run(&repo, ["rev-parse", "--short=12", "HEAD"])?;
        let changes = run(&repo, path_args(&["status", "--porcelain"], scope.paths()))?
            .lines()
            .filter_map(parse_status)
            .collect::<Vec<_>>();
        let recent_commits = run(
            &repo,
            path_args(
                &["log", "-5", "--pretty=format:%h%x1f%s%x1f%cr"],
                scope.paths(),
            ),
        )?
        .lines()
        .filter_map(parse_log)
        .collect();
        Ok(ScopeReleaseStatus {
            scope,
            scope_label: scope.label().to_owned(),
            branch: if branch.is_empty() {
                "(detached)".to_owned()
            } else {
                branch
            },
            head,
            dirty_count: changes.len(),
            changes,
            recent_commits,
        })
    }

    pub fn deployment_plan(&self) -> Result<DeploymentPlan, DeliveryControlError> {
        let release_scopes = [
            ReleaseScope::Resume,
            ReleaseScope::Blog,
            ReleaseScope::Project,
            ReleaseScope::Idea,
            ReleaseScope::Update,
        ];
        let repo = self.repo()?;
        let branch = run(&repo, ["branch", "--show-current"])?;
        let branch = if branch.is_empty() {
            "(detached)".to_owned()
        } else {
            branch
        };
        let head = run(&repo, ["rev-parse", "--short=12", "HEAD"])?;
        let paths = release_scopes
            .iter()
            .flat_map(|scope| scope.paths().iter().copied())
            .collect::<Vec<_>>();
        let all_changes = run(&repo, path_args(&["status", "--porcelain"], &paths))?
            .lines()
            .filter_map(parse_status)
            .collect::<Vec<_>>();
        let scopes = release_scopes
            .iter()
            .copied()
            .map(|scope| {
                let changes = all_changes
                    .iter()
                    .filter(|change| scope_owns_path(scope, &change.path))
                    .cloned()
                    .collect::<Vec<_>>();
                ScopeReleaseStatus {
                    scope,
                    scope_label: scope.label().to_owned(),
                    branch: branch.clone(),
                    head: head.clone(),
                    dirty_count: changes.len(),
                    changes,
                    recent_commits: Vec::new(),
                }
            })
            .collect::<Vec<_>>();
        let dirty_count = scopes.iter().map(|scope| scope.dirty_count).sum();
        let dirty = scopes
            .iter()
            .filter(|scope| scope.dirty_count > 0)
            .map(|scope| scope.scope_label.as_str())
            .collect::<Vec<_>>();
        let deploy_target = api_base_url(&self.content_root).ok();
        let next_action = if !dirty.is_empty() {
            format!(
                "Commit {} changes before deploying content.",
                dirty.join(", ")
            )
        } else if deploy_target.is_some() {
            "Content is clean and ready for content-only deployment.".to_owned()
        } else {
            "Configure a deployment API target before remote delivery.".to_owned()
        };
        let workspace = Workspace::open(&self.content_root)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        let media_asset_count = workspace
            .scan()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?
            .assets()
            .len();
        Ok(DeploymentPlan {
            branch,
            head,
            deploy_target,
            dirty_count,
            media_asset_count,
            next_action,
            commit_activity: self.commit_activity(&release_scopes)?,
            scopes,
        })
    }

    fn commit_activity(
        &self,
        scopes: &[ReleaseScope],
    ) -> Result<Vec<CommitActivityDay>, DeliveryControlError> {
        let repo = self.repo()?;
        let paths = scopes
            .iter()
            .flat_map(|scope| scope.paths().iter().copied())
            .collect::<Vec<_>>();
        let output = run(
            &repo,
            path_args(
                &[
                    "log",
                    "--since=1 year ago",
                    "--date=short",
                    "--pretty=format:%x1e%H%x1f%cs",
                    "--name-only",
                ],
                &paths,
            ),
        )?;
        let mut commits = BTreeMap::<String, BTreeMap<String, BTreeSet<ReleaseScope>>>::new();
        for record in output
            .split('\x1e')
            .filter(|record| !record.trim().is_empty())
        {
            let mut lines = record.lines().filter(|line| !line.trim().is_empty());
            let Some((hash, date)) = lines.next().and_then(|line| line.split_once('\x1f')) else {
                continue;
            };
            let commit_scopes = lines
                .filter_map(|path| {
                    scopes
                        .iter()
                        .copied()
                        .find(|scope| scope_owns_path(*scope, path))
                })
                .collect::<BTreeSet<_>>();
            commits
                .entry(date.to_owned())
                .or_default()
                .insert(hash.to_owned(), commit_scopes);
        }
        Ok(commits
            .into_iter()
            .map(|(date, commits)| CommitActivityDay {
                date,
                commit_count: commits.len(),
                scopes: commits
                    .into_values()
                    .flatten()
                    .collect::<BTreeSet<_>>()
                    .into_iter()
                    .collect(),
            })
            .collect())
    }

    pub fn release_scope(
        &self,
        scope: ReleaseScope,
    ) -> Result<ScopeReleaseStatus, DeliveryControlError> {
        let before = self.scope_status(scope)?;
        if before.dirty_count == 0 {
            return Err(DeliveryControlError::NothingToRelease(
                scope.label().to_owned(),
            ));
        }
        let repo = self.repo()?;
        run(&repo, path_args(&["add", "-A"], scope.paths()))?;
        let staged = run(
            &repo,
            path_args(&["diff", "--cached", "--name-only"], scope.paths()),
        )?;
        if staged.trim().is_empty() {
            return Err(DeliveryControlError::NothingToRelease(
                scope.label().to_owned(),
            ));
        }
        let mut args = vec![
            "-c".to_owned(),
            format!("user.name={AUTHOR_NAME}"),
            "-c".to_owned(),
            format!("user.email={AUTHOR_EMAIL}"),
            "commit".to_owned(),
            "--only".to_owned(),
            "-m".to_owned(),
            format!("release: {} updates", scope.id()),
            "--".to_owned(),
        ];
        args.extend(scope.paths().iter().map(|path| (*path).to_owned()));
        run(&repo, args)?;
        WorkspaceSync::open(&self.content_root, &self.db_path)
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?
            .sync()
            .map_err(|error| DeliveryControlError::Workspace(error.to_string()))?;
        self.scope_status(scope)
    }

    pub fn deploy_content(&self) -> Result<DeployRunStatus, DeliveryControlError> {
        let executable =
            std::env::var("SILAN_VIKING_BIN").unwrap_or_else(|_| "silan-viking".to_owned());
        let output = Command::new(&executable)
            .args(["--content"])
            .arg(&self.content_root)
            .args(["--db"])
            .arg(&self.db_path)
            .args(["site", "update-content", "--confirm"])
            .current_dir(&self.repo_root)
            .output()
            .map_err(|error| {
                DeliveryControlError::Runner(format!("cannot execute `{executable}`: {error}"))
            })?;
        let content_commit = self.content_commit()?;
        let status = DeployRunStatus {
            success: output.status.success(),
            content_commit,
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        };
        if status.success {
            Ok(status)
        } else {
            Err(DeliveryControlError::Runner(format!(
                "content deploy failed: {}",
                status.stderr
            )))
        }
    }

    pub fn remote_content_version(&self) -> Result<RemoteContentVersion, DeliveryControlError> {
        let base = api_base_url(&self.content_root)
            .map_err(|error| DeliveryControlError::Remote(error.to_string()))?;
        let url = format!("{base}/api/v1/content/status");
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(DeliveryControlError::MissingCredential)?;
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(3))
            .timeout_read(Duration::from_secs(8))
            .timeout_write(Duration::from_secs(3))
            .build();
        let mut request = agent.get(&url);
        request = request.set("Authorization", &format!("Bearer {token}"));
        request
            .call()
            .map_err(|error| DeliveryControlError::Remote(format!("{url}: {error}")))?
            .into_json()
            .map_err(|error| DeliveryControlError::Remote(format!("{url}: {error}")))
    }

    pub fn verify_remote(&self) -> Result<DeployVerificationResult, DeliveryControlError> {
        let expected = self.content_commit()?;
        let remote = self.remote_content_version()?;
        let verified =
            remote.health == "ok" && remote.media_root_ok && remote.content_commit == expected;
        Ok(DeployVerificationResult {
            mismatch_reason: (!verified).then(|| {
                format!(
                    "expected commit `{expected}` with healthy media, got commit `{}` and media_root_ok={}",
                    remote.content_commit, remote.media_root_ok
                )
            }),
            verified,
            expected_content_commit: expected,
            remote,
        })
    }

    fn repo(&self) -> Result<GitRepo, DeliveryControlError> {
        GitRepo::open(&self.content_root)
            .map_err(|error| DeliveryControlError::Repository(error.to_string()))
    }

    fn content_commit(&self) -> Result<String, DeliveryControlError> {
        run(&self.repo()?, ["rev-parse", "HEAD"])
    }
}

fn scope_owns_path(scope: ReleaseScope, path: &str) -> bool {
    scope.paths().iter().any(|root| {
        path.strip_prefix(root)
            .is_some_and(|suffix| suffix.is_empty() || suffix.starts_with('/'))
    })
}

fn run<I, S>(repo: &GitRepo, args: I) -> Result<String, DeliveryControlError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    repo.run(args)
        .map(|output| output.stdout)
        .map_err(|error| DeliveryControlError::Repository(error.to_string()))
}

fn path_args(prefix: &[&str], paths: &[&str]) -> Vec<String> {
    let mut args = prefix
        .iter()
        .map(|value| (*value).to_owned())
        .collect::<Vec<_>>();
    args.push("--".to_owned());
    args.extend(paths.iter().map(|value| (*value).to_owned()));
    args
}

fn parse_status(line: &str) -> Option<VersionChange> {
    Some(VersionChange {
        status: line.get(..2)?.trim().to_owned(),
        path: line.get(3..)?.split(" -> ").last()?.trim().to_owned(),
    })
}

fn parse_log(line: &str) -> Option<VersionCommit> {
    let mut values = line.split('\x1f');
    Some(VersionCommit {
        hash: values.next()?.trim().to_owned(),
        subject: values.next()?.trim().to_owned(),
        relative_time: values.next()?.trim().to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn git(directory: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(directory)
            .status()
            .expect("git");
        assert!(status.success());
    }

    fn fixture(api_base: &str) -> (tempfile::TempDir, PathBuf, PathBuf) {
        let directory = tempfile::tempdir().expect("temp");
        let content = directory.path().join("content");
        std::fs::create_dir_all(content.join("resources")).expect("resources");
        std::fs::copy(
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../content/SCHEMA.md"),
            content.join("SCHEMA.md"),
        )
        .expect("schema");
        std::fs::write(
            directory.path().join("silan-viking.toml"),
            format!("[deploy]\napi_base = \"{api_base}\"\n"),
        )
        .expect("config");
        git(&content, &["init", "-q"]);
        git(&content, &["add", "."]);
        git(
            &content,
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-q",
                "-m",
                "fixture",
            ],
        );
        let db = directory.path().join("portfolio.db");
        (directory, content, db)
    }

    #[test]
    fn remote_verification_compares_commit_and_media_readiness() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let (_directory, content, db) = fixture(&format!("http://{address}"));
        let commit = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&content)
            .output()
            .expect("head");
        let commit = String::from_utf8(commit.stdout)
            .expect("utf8")
            .trim()
            .to_owned();
        let expected = commit.clone();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read");
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(request.starts_with("GET /api/v1/content/status "));
            assert!(request.contains("\r\nAuthorization: Bearer delivery-contract-token\r\n"));
            let body = format!(
                "{{\"health\":\"ok\",\"content_hash\":\"hash\",\"content_commit\":\"{expected}\",\"generated_at\":\"2026-07-17T00:00:00Z\",\"media_root_ok\":true}}"
            );
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("respond");
        });
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open")
            .with_bearer_token("delivery-contract-token");
        let result = control.verify_remote().expect("verify");
        server.join().expect("server");
        assert!(result.verified);
        assert_eq!(result.expected_content_commit, commit);
    }

    #[test]
    fn remote_verification_fails_before_http_without_a_credential() {
        let (_directory, content, db) = fixture("http://127.0.0.1:1");
        let control = DeliveryControl::open(&content, &db, content.parent().expect("repo root"))
            .expect("open")
            .with_bearer_token("");
        assert!(matches!(
            control.remote_content_version(),
            Err(DeliveryControlError::MissingCredential)
        ));
    }
}
