//! Durable authored-source snapshots and atomic disaster recovery.
//!
//! Production remains a projection target, not the authoring Git remote. A
//! deploy nevertheless carries the committed public source (`SCHEMA.md`,
//! `.gitignore`, and `resources/`) so a lost workstation can recover the
//! exact deployed tree. The private `agent/` namespace is intentionally not
//! present in this archive; its durability remains the responsibility of the
//! content repository's private Git remote.

use crate::{api_base_url, workspace_stats_sync_token, GitRepo};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tar::Archive;
use thiserror::Error;
use url::{Host, Url};

const AUTHOR_NAME: &str = "Silan.Hu";
const AUTHOR_EMAIL: &str = "silan.hu@u.nus.edu";
const SOURCE_PATHS: &[&str] = &[".gitignore", "SCHEMA.md", "resources"];
const MAX_SOURCE_BYTES: u64 = 256 << 20;

#[derive(Debug, Error)]
pub enum ContentRecoveryError {
    #[error("content recovery repository error: {0}")]
    Repository(String),
    #[error("content recovery configuration error: {0}")]
    Configuration(String),
    #[error("content recovery remote error: {0}")]
    Remote(String),
    #[error("content recovery archive error: {0}")]
    Archive(String),
    #[error("content recovery destination error: {0}")]
    Destination(String),
    #[error("content recovery stopped safely because deployed and local changes conflict: {0}")]
    Conflict(String),
    #[error("content recovery filesystem error: {0}")]
    Filesystem(String),
    #[error(
        "content recovery needs SILAN_STATS_SYNC_TOKEN in the process environment or project .env"
    )]
    MissingCredential,
}

#[derive(Debug, Clone)]
pub struct ContentSourceArchive {
    bytes: Vec<u8>,
    sha256: String,
}

impl ContentSourceArchive {
    /// Archive the committed public source at `HEAD` through Git, never the
    /// mutable working tree. Deployment's full-repository durability gate
    /// guarantees the projection and this source snapshot describe the same
    /// backed-up revision.
    pub fn from_repository(content_root: impl AsRef<Path>) -> Result<Self, ContentRecoveryError> {
        let repo = GitRepo::open(content_root)
            .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
        let bytes = repo
            .archive("HEAD", SOURCE_PATHS)
            .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
        validate_source_archive(&bytes)?;
        let sha256 = sha256_hex(&bytes);
        Ok(Self { bytes, sha256 })
    }

    pub fn from_bytes(bytes: Vec<u8>) -> Result<Self, ContentRecoveryError> {
        validate_source_archive(&bytes)?;
        let sha256 = sha256_hex(&bytes);
        Ok(Self { bytes, sha256 })
    }

    pub fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    pub fn sha256(&self) -> &str {
        &self.sha256
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentRecoveryResult {
    pub deployed_commit: String,
    pub local_commit: String,
    pub destination: PathBuf,
    pub files_restored: usize,
    pub source_sha256: String,
}

pub struct ContentRecoveryClient {
    content_root: Option<PathBuf>,
    base_url: String,
    bearer_token: Option<String>,
}

struct DeployedSourceSnapshot {
    deployed_commit: String,
    source: ContentSourceArchive,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RecoveryEndpointSource {
    WorkspaceConfiguration,
    DirectSiteArgument,
}

impl ContentRecoveryClient {
    /// Open from the expected content path. The path itself may be absent;
    /// only its parent project configuration is needed to locate production.
    pub fn open(expected_content_root: impl AsRef<Path>) -> Result<Self, ContentRecoveryError> {
        let content_root = expected_content_root.as_ref().to_path_buf();
        let base_url = api_base_url(&content_root)
            .map_err(|error| ContentRecoveryError::Configuration(error.to_string()))?;
        let bearer_token = workspace_stats_sync_token(&content_root);
        Self::connect(
            base_url,
            Some(content_root),
            bearer_token,
            RecoveryEndpointSource::WorkspaceConfiguration,
        )
    }

    /// Connect directly to a deployed site without relying on a local
    /// `silan-viking.toml`. This is the new-device bootstrap path: the caller
    /// supplies the public site address and then restores into an absent or
    /// empty content directory.
    pub fn from_site(site_url: impl AsRef<str>) -> Result<Self, ContentRecoveryError> {
        Self::connect(
            site_url.as_ref(),
            None,
            None,
            RecoveryEndpointSource::DirectSiteArgument,
        )
    }

    pub fn with_bearer_token(mut self, token: impl Into<String>) -> Self {
        let token = token.into();
        self.bearer_token = (!token.trim().is_empty()).then(|| token.trim().to_owned());
        self
    }

    pub fn recover(
        &self,
        destination: impl AsRef<Path>,
    ) -> Result<ContentRecoveryResult, ContentRecoveryError> {
        ensure_empty_destination(destination.as_ref())?;
        let snapshot = self.download_source()?;
        restore_source_archive(
            &snapshot.source,
            destination.as_ref(),
            &snapshot.deployed_commit,
        )
    }

    /// Merge the authenticated deployed public-source snapshot into an
    /// existing recovered repository. The incoming commit is synthesized as
    /// a child of the last recovery anchor, so Git can perform a real
    /// three-way merge. A disposable clone proves committed changes merge
    /// cleanly first; the owner's worktree is then updated only when its dirty
    /// paths do not overlap the deployed update.
    pub fn pull_into_repository(
        &self,
        destination: impl AsRef<Path>,
        expected_deployed_commit: &str,
    ) -> Result<ContentRecoveryResult, ContentRecoveryError> {
        let snapshot = self.download_source()?;
        if snapshot.deployed_commit != expected_deployed_commit {
            return Err(ContentRecoveryError::Remote(format!(
                "deployed revision changed from {expected_deployed_commit} to {} while synchronizing; refresh and retry",
                snapshot.deployed_commit
            )));
        }
        merge_source_archive(
            &snapshot.source,
            destination.as_ref(),
            &snapshot.deployed_commit,
        )
    }

    fn download_source(&self) -> Result<DeployedSourceSnapshot, ContentRecoveryError> {
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(ContentRecoveryError::MissingCredential)?;
        let url = format!(
            "{}/api/v1/content/source",
            self.base_url.trim_end_matches('/')
        );
        let response = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(5))
            .timeout_read(Duration::from_secs(300))
            .build()
            .get(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|error| ContentRecoveryError::Remote(format!("{url}: {error}")))?;
        let deployed_commit = required_header(&response, "X-Silan-Content-Commit")?;
        let expected_sha256 = required_header(&response, "X-Silan-Source-SHA256")?;
        if !is_hex(&deployed_commit, 40) || !is_hex(&expected_sha256, 64) {
            return Err(ContentRecoveryError::Remote(
                "server returned invalid recovery provenance".to_owned(),
            ));
        }
        let mut bytes = Vec::new();
        response
            .into_reader()
            .take(MAX_SOURCE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| ContentRecoveryError::Remote(error.to_string()))?;
        if bytes.len() as u64 > MAX_SOURCE_BYTES {
            return Err(ContentRecoveryError::Remote(format!(
                "source archive exceeds {MAX_SOURCE_BYTES} bytes"
            )));
        }
        let source = ContentSourceArchive::from_bytes(bytes)?;
        if source.sha256() != expected_sha256 {
            return Err(ContentRecoveryError::Archive(
                "source archive checksum does not match server provenance".to_owned(),
            ));
        }
        Ok(DeployedSourceSnapshot {
            deployed_commit,
            source,
        })
    }

    pub fn recover_default(&self) -> Result<ContentRecoveryResult, ContentRecoveryError> {
        let content_root = self.content_root.as_ref().ok_or_else(|| {
            ContentRecoveryError::Destination(
                "direct site recovery has no default destination; pass an explicit path".to_owned(),
            )
        })?;
        self.recover(content_root)
    }

    fn connect(
        base_url: impl AsRef<str>,
        content_root: Option<PathBuf>,
        bearer_token: Option<String>,
        endpoint_source: RecoveryEndpointSource,
    ) -> Result<Self, ContentRecoveryError> {
        Ok(Self {
            content_root,
            base_url: normalize_site_url(base_url.as_ref(), endpoint_source)?,
            bearer_token,
        })
    }
}

/// Canonicalize the site origin once at the client boundary. A bare hostname
/// is intentionally accepted for the one-command bootstrap experience and is
/// interpreted as HTTPS. Bearer credentials are never sent over plaintext
/// HTTP except to a loopback development server.
fn normalize_site_url(
    value: &str,
    endpoint_source: RecoveryEndpointSource,
) -> Result<String, ContentRecoveryError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ContentRecoveryError::Configuration(
            "recovery site URL cannot be empty".to_owned(),
        ));
    }
    let candidate = if value.contains("://") {
        value.to_owned()
    } else {
        format!("https://{value}")
    };
    let mut parsed = Url::parse(&candidate)
        .map_err(|error| ContentRecoveryError::Configuration(error.to_string()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(ContentRecoveryError::Configuration(
            "recovery site URL must use https".to_owned(),
        ));
    }
    if parsed.host().is_none() {
        return Err(ContentRecoveryError::Configuration(
            "recovery site URL must include a host".to_owned(),
        ));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(ContentRecoveryError::Configuration(
            "recovery site URL must not contain credentials".to_owned(),
        ));
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(ContentRecoveryError::Configuration(
            "recovery site URL must not contain a query or fragment".to_owned(),
        ));
    }
    if parsed.scheme() == "http"
        && endpoint_source == RecoveryEndpointSource::DirectSiteArgument
        && !is_loopback_host(parsed.host())
    {
        return Err(ContentRecoveryError::Configuration(
            "recovery credentials require https for non-loopback servers".to_owned(),
        ));
    }
    parsed.set_query(None);
    parsed.set_fragment(None);
    Ok(parsed.to_string().trim_end_matches('/').to_owned())
}

fn is_loopback_host(host: Option<Host<&str>>) -> bool {
    match host {
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    }
}

pub fn restore_source_archive(
    source: &ContentSourceArchive,
    destination: &Path,
    deployed_commit: &str,
) -> Result<ContentRecoveryResult, ContentRecoveryError> {
    if !is_hex(deployed_commit, 40) {
        return Err(ContentRecoveryError::Archive(
            "deployed commit must be a 40-character Git object id".to_owned(),
        ));
    }
    ensure_empty_destination(destination)?;
    let parent = destination.parent().ok_or_else(|| {
        ContentRecoveryError::Destination(format!(
            "{} has no parent directory",
            destination.display()
        ))
    })?;
    fs::create_dir_all(parent)
        .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    let staging = tempfile::Builder::new()
        .prefix(".silan-content-recovery-")
        .tempdir_in(parent)
        .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    extract_source_archive(source.bytes(), staging.path())?;
    let files_restored = regular_file_count(staging.path())?;
    let private_namespace = staging.path().join("agent");
    fs::create_dir_all(&private_namespace)
        .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    fs::write(private_namespace.join(".gitkeep"), [])
        .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    let repo =
        GitRepo::initialize_recovered(staging.path(), deployed_commit, AUTHOR_NAME, AUTHOR_EMAIL)
            .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    let local_commit = repo
        .rev_parse("HEAD")
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    if destination.exists() {
        fs::remove_dir(destination)
            .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    }
    fs::rename(staging.path(), destination).map_err(|error| {
        ContentRecoveryError::Filesystem(format!(
            "activate {} as {}: {error}",
            staging.path().display(),
            destination.display()
        ))
    })?;
    Ok(ContentRecoveryResult {
        deployed_commit: deployed_commit.to_owned(),
        local_commit,
        destination: destination.to_path_buf(),
        files_restored,
        source_sha256: source.sha256().to_owned(),
    })
}

/// Integrate a deployed public-source archive into an existing recovery
/// lineage without replacing private source or unrelated local work.
///
/// A production archive cannot recreate its original Git object graph. The
/// recovery commit recorded in the local history is therefore the explicit
/// merge base. The synthesized incoming commit changes only the public paths
/// carried by deployment; `agent/` remains owned exclusively by the local
/// repository and its private upstream.
pub fn merge_source_archive(
    source: &ContentSourceArchive,
    destination: &Path,
    deployed_commit: &str,
) -> Result<ContentRecoveryResult, ContentRecoveryError> {
    if !is_hex(deployed_commit, 40) {
        return Err(ContentRecoveryError::Archive(
            "deployed commit must be a 40-character Git object id".to_owned(),
        ));
    }
    let repo = GitRepo::open(destination)
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    let local_head = repo
        .rev_parse("HEAD")
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    let recovery_base = latest_recovery_commit(&repo)?;
    let temporary = tempfile::Builder::new()
        .prefix(".silan-content-pull-")
        .tempdir_in(destination.parent().ok_or_else(|| {
            ContentRecoveryError::Destination(format!(
                "{} has no parent directory",
                destination.display()
            ))
        })?)
        .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    let integration_root = temporary.path().join("integration");
    let integration = repo
        .clone_to(&integration_root)
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    integration
        .run(["checkout", "--quiet", "--detach", &recovery_base])
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;

    remove_public_source(&integration_root)?;
    extract_source_archive(source.bytes(), &integration_root)?;
    let files_restored = public_file_count(&integration_root)?;
    integration
        .run(["add", "-A", "--", ".gitignore", "SCHEMA.md", "resources"])
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    integration
        .run([
            "-c",
            &format!("user.name={AUTHOR_NAME}"),
            "-c",
            &format!("user.email={AUTHOR_EMAIL}"),
            "commit",
            "--quiet",
            "--allow-empty",
            "-m",
            &format!("recovery: restore deployed content {deployed_commit}"),
        ])
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    let incoming_commit = integration
        .rev_parse("HEAD")
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    integration
        .run(["branch", "production-snapshot", &incoming_commit])
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;

    integration
        .run(["checkout", "--quiet", "-B", "local-preflight", &local_head])
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    integration
        .run([
            "-c",
            &format!("user.name={AUTHOR_NAME}"),
            "-c",
            &format!("user.email={AUTHOR_EMAIL}"),
            "merge",
            "--no-edit",
            "production-snapshot",
        ])
        .map_err(|error| ContentRecoveryError::Conflict(error.to_string()))?;

    repo.run([
        "fetch",
        "--quiet",
        "--no-tags",
        integration_root.to_str().ok_or_else(|| {
            ContentRecoveryError::Filesystem(format!(
                "non-UTF-8 temporary repository path {}",
                integration_root.display()
            ))
        })?,
        "refs/heads/production-snapshot",
    ])
    .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    let merge_result = repo.run([
        "-c",
        &format!("user.name={AUTHOR_NAME}"),
        "-c",
        &format!("user.email={AUTHOR_EMAIL}"),
        "merge",
        "--no-edit",
        "FETCH_HEAD",
    ]);
    if let Err(error) = merge_result {
        if repo.git_dir().join("MERGE_HEAD").is_file() {
            repo.run(["merge", "--abort"]).map_err(|abort_error| {
                ContentRecoveryError::Repository(format!(
                    "merge failed ({error}) and automatic abort failed ({abort_error})"
                ))
            })?;
        }
        return Err(ContentRecoveryError::Conflict(error.to_string()));
    }
    let local_commit = repo
        .rev_parse("HEAD")
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    Ok(ContentRecoveryResult {
        deployed_commit: deployed_commit.to_owned(),
        local_commit,
        destination: destination.to_path_buf(),
        files_restored,
        source_sha256: source.sha256().to_owned(),
    })
}

fn latest_recovery_commit(repo: &GitRepo) -> Result<String, ContentRecoveryError> {
    let output = repo
        .run([
            "log",
            "-1",
            "--format=%H%x1f%s",
            "--fixed-strings",
            "--grep",
            "recovery: restore deployed content ",
            "HEAD",
        ])
        .map_err(|error| ContentRecoveryError::Repository(error.to_string()))?;
    let (commit, subject) = output.stdout.split_once('\x1f').ok_or_else(|| {
        ContentRecoveryError::Destination(
            "this repository has no deployed recovery anchor; configure its private Git upstream"
                .to_owned(),
        )
    })?;
    if subject
        .strip_prefix("recovery: restore deployed content ")
        .is_none_or(|value| !is_hex(value, 40))
    {
        return Err(ContentRecoveryError::Destination(
            "the latest deployed recovery anchor has invalid provenance".to_owned(),
        ));
    }
    Ok(commit.to_owned())
}

fn remove_public_source(root: &Path) -> Result<(), ContentRecoveryError> {
    for relative in SOURCE_PATHS {
        let path = root.join(relative);
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
        } else if path.exists() {
            fs::remove_file(&path)
                .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
        }
    }
    Ok(())
}

fn public_file_count(root: &Path) -> Result<usize, ContentRecoveryError> {
    let mut count = 0;
    for relative in SOURCE_PATHS {
        let path = root.join(relative);
        if path.is_file() {
            count += 1;
        } else if path.is_dir() {
            count += regular_file_count(&path)?;
        }
    }
    Ok(count)
}

fn validate_source_archive(bytes: &[u8]) -> Result<(), ContentRecoveryError> {
    let mut archive = Archive::new(Cursor::new(bytes));
    let mut has_schema = false;
    let mut has_resources = false;
    let entries = archive
        .entries()
        .map_err(|error| ContentRecoveryError::Archive(error.to_string()))?;
    for entry in entries {
        let entry = entry.map_err(|error| ContentRecoveryError::Archive(error.to_string()))?;
        let entry_type = entry.header().entry_type();
        if is_archive_metadata(entry_type) {
            continue;
        }
        let path = entry
            .path()
            .map_err(|error| ContentRecoveryError::Archive(error.to_string()))?;
        validate_source_path(&path)?;
        if !(entry_type.is_file() || entry_type.is_dir()) {
            return Err(ContentRecoveryError::Archive(format!(
                "unsupported source archive entry {}",
                path.display()
            )));
        }
        has_schema |= path == Path::new("SCHEMA.md");
        has_resources |= path == Path::new("resources") || path.starts_with("resources/");
    }
    if !has_schema || !has_resources {
        return Err(ContentRecoveryError::Archive(
            "source archive must contain SCHEMA.md and resources/".to_owned(),
        ));
    }
    Ok(())
}

fn extract_source_archive(bytes: &[u8], destination: &Path) -> Result<(), ContentRecoveryError> {
    validate_source_archive(bytes)?;
    let mut archive = Archive::new(Cursor::new(bytes));
    for entry in archive
        .entries()
        .map_err(|error| ContentRecoveryError::Archive(error.to_string()))?
    {
        let mut entry = entry.map_err(|error| ContentRecoveryError::Archive(error.to_string()))?;
        let entry_type = entry.header().entry_type();
        if is_archive_metadata(entry_type) {
            continue;
        }
        let path = entry
            .path()
            .map_err(|error| ContentRecoveryError::Archive(error.to_string()))?
            .into_owned();
        let target = destination.join(&path);
        if entry_type.is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
            }
            entry
                .unpack(&target)
                .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
        }
    }
    Ok(())
}

fn is_archive_metadata(entry_type: tar::EntryType) -> bool {
    entry_type.is_pax_global_extensions()
        || entry_type.is_pax_local_extensions()
        || entry_type.is_gnu_longname()
        || entry_type.is_gnu_longlink()
}

fn validate_source_path(path: &Path) -> Result<(), ContentRecoveryError> {
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(ContentRecoveryError::Archive(format!(
            "unsafe source archive path {}",
            path.display()
        )));
    }
    let allowed = path == Path::new(".gitignore")
        || path == Path::new("SCHEMA.md")
        || path == Path::new("resources")
        || path.starts_with("resources/");
    if !allowed {
        return Err(ContentRecoveryError::Archive(format!(
            "source archive contains non-public path {}",
            path.display()
        )));
    }
    Ok(())
}

fn ensure_empty_destination(destination: &Path) -> Result<(), ContentRecoveryError> {
    if !destination.exists() {
        return Ok(());
    }
    if !destination.is_dir() {
        return Err(ContentRecoveryError::Destination(format!(
            "{} is not a directory",
            destination.display()
        )));
    }
    let mut entries = fs::read_dir(destination)
        .map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    if entries.next().is_some() {
        return Err(ContentRecoveryError::Destination(format!(
            "{} is not empty",
            destination.display()
        )));
    }
    Ok(())
}

fn regular_file_count(root: &Path) -> Result<usize, ContentRecoveryError> {
    fn visit(path: &Path, count: &mut usize) -> std::io::Result<()> {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                visit(&entry.path(), count)?;
            } else if entry.file_type()?.is_file() {
                *count += 1;
            }
        }
        Ok(())
    }
    let mut count = 0;
    visit(root, &mut count).map_err(|error| ContentRecoveryError::Filesystem(error.to_string()))?;
    Ok(count)
}

fn required_header(response: &ureq::Response, name: &str) -> Result<String, ContentRecoveryError> {
    response
        .header(name)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| ContentRecoveryError::Remote(format!("response is missing {name}")))
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpListener;
    use std::process::Command;
    use std::thread;

    fn git(root: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(root)
            .status()
            .expect("git");
        assert!(status.success());
    }

    fn source_fixture() -> (tempfile::TempDir, ContentSourceArchive, String) {
        let root = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(root.path().join("resources/blog/post")).expect("resources");
        fs::write(root.path().join("SCHEMA.md"), "schema\n").expect("schema");
        fs::write(root.path().join(".gitignore"), "*.db\n").expect("gitignore");
        fs::write(root.path().join("resources/blog/post/en.md"), "body\n").expect("body");
        fs::create_dir_all(root.path().join("agent/notes")).expect("agent");
        fs::write(root.path().join("agent/notes/private.md"), "secret\n").expect("private");
        git(root.path(), &["init", "-q", "-b", "main"]);
        git(root.path(), &["add", "-A"]);
        git(
            root.path(),
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
        let commit = GitRepo::open(root.path())
            .expect("repo")
            .rev_parse("HEAD")
            .expect("head");
        let source = ContentSourceArchive::from_repository(root.path()).expect("archive");
        (root, source, commit)
    }

    #[test]
    fn source_snapshot_excludes_private_agent_namespace() {
        let (_root, source, _commit) = source_fixture();
        let mut archive = Archive::new(Cursor::new(source.bytes()));
        let paths = archive
            .entries()
            .expect("entries")
            .map(|entry| entry.expect("entry").path().expect("path").into_owned())
            .collect::<Vec<_>>();
        assert!(paths.iter().any(|path| path == Path::new("SCHEMA.md")));
        assert!(!paths.iter().any(|path| path.starts_with("agent")));
    }

    #[test]
    fn direct_site_client_normalizes_hostname_and_rejects_plaintext_remote() {
        let client = ContentRecoveryClient::from_site("silan.tech").expect("site client");
        assert_eq!(client.base_url, "https://silan.tech");
        assert!(matches!(
            ContentRecoveryClient::from_site("http://silan.tech"),
            Err(ContentRecoveryError::Configuration(_))
        ));
        assert!(ContentRecoveryClient::from_site("http://127.0.0.1:5200").is_ok());
    }

    #[test]
    fn direct_site_client_recovers_without_local_project_configuration() {
        let (_root, source, deployed_commit) = source_fixture();
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind recovery server");
        let address = listener.local_addr().expect("server address");
        let response_source = source.clone();
        let response_commit = deployed_commit.clone();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept recovery request");
            let mut request = [0_u8; 4096];
            let bytes_read = stream.read(&mut request).expect("read request");
            let request = String::from_utf8_lossy(&request[..bytes_read]);
            assert!(
                request.starts_with("GET /api/v1/content/source HTTP/1.1"),
                "{request}"
            );
            assert!(
                request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer recovery-secret"),
                "{request}"
            );
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nX-Silan-Content-Commit: {}\r\nX-Silan-Source-SHA256: {}\r\nConnection: close\r\n\r\n",
                response_source.bytes().len(),
                response_commit,
                response_source.sha256(),
            )
            .expect("write response headers");
            stream
                .write_all(response_source.bytes())
                .expect("write response body");
        });

        let destination_parent = tempfile::tempdir().expect("destination parent");
        let destination = destination_parent.path().join("content");
        let result = ContentRecoveryClient::from_site(format!("http://{address}"))
            .expect("direct site client")
            .with_bearer_token("recovery-secret")
            .recover(&destination)
            .expect("recover without project config");
        server.join().expect("recovery server");

        assert_eq!(result.deployed_commit, deployed_commit);
        assert!(destination.join("SCHEMA.md").is_file());
        assert!(destination.join("resources/blog/post/en.md").is_file());
        assert!(destination.join("agent/.gitkeep").is_file());
    }

    #[test]
    fn recovery_is_atomic_and_initializes_a_new_repository() {
        let (_root, source, deployed_commit) = source_fixture();
        let parent = tempfile::tempdir().expect("destination parent");
        let destination = parent.path().join("content");
        fs::create_dir(&destination).expect("empty destination");
        let result = restore_source_archive(&source, &destination, &deployed_commit)
            .expect("recover source");
        assert_eq!(result.deployed_commit, deployed_commit);
        assert!(destination.join("SCHEMA.md").is_file());
        assert!(destination.join("resources/blog/post/en.md").is_file());
        assert!(destination.join("agent/.gitkeep").is_file());
        assert!(destination.join(".git").is_dir());
        assert_eq!(
            GitRepo::open(&destination)
                .expect("repo")
                .rev_parse("HEAD")
                .expect("head"),
            result.local_commit
        );
    }

    #[test]
    fn deployed_snapshot_merges_public_changes_and_preserves_local_private_work() {
        let (_old_root, old_source, old_deployed_commit) = source_fixture();
        let parent = tempfile::tempdir().expect("destination parent");
        let destination = parent.path().join("content");
        restore_source_archive(&old_source, &destination, &old_deployed_commit)
            .expect("recover old source");
        fs::create_dir_all(destination.join("agent/notes")).expect("private notes");
        fs::write(
            destination.join("agent/notes/private.md"),
            "committed private\n",
        )
        .expect("private source");
        git(&destination, &["add", "-A"]);
        git(
            &destination,
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-q",
                "-m",
                "test: local private history",
            ],
        );
        fs::write(
            destination.join("agent/notes/private.md"),
            "uncommitted private\n",
        )
        .expect("private draft");

        let (new_root, _source, _commit) = source_fixture();
        fs::write(
            new_root.path().join("resources/blog/post/en.md"),
            "deployed update\n",
        )
        .expect("deployed source");
        git(new_root.path(), &["add", "-A"]);
        git(
            new_root.path(),
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-q",
                "-m",
                "test: deployed public update",
            ],
        );
        let new_deployed_commit = GitRepo::open(new_root.path())
            .expect("new repo")
            .rev_parse("HEAD")
            .expect("new head");
        let new_source =
            ContentSourceArchive::from_repository(new_root.path()).expect("new deployed source");

        let result = merge_source_archive(&new_source, &destination, &new_deployed_commit)
            .expect("merge deployed source");

        assert_eq!(result.deployed_commit, new_deployed_commit);
        assert_eq!(
            fs::read_to_string(destination.join("resources/blog/post/en.md"))
                .expect("deployed content"),
            "deployed update\n"
        );
        assert_eq!(
            fs::read_to_string(destination.join("agent/notes/private.md")).expect("private draft"),
            "uncommitted private\n"
        );
        let status = GitRepo::open(&destination)
            .expect("merged repo")
            .run(["status", "--porcelain"])
            .expect("status")
            .stdout;
        assert!(status.contains("agent/notes/private.md"));
    }

    #[test]
    fn deployed_snapshot_conflict_leaves_head_and_dirty_source_unchanged() {
        let (_old_root, old_source, old_deployed_commit) = source_fixture();
        let parent = tempfile::tempdir().expect("destination parent");
        let destination = parent.path().join("content");
        restore_source_archive(&old_source, &destination, &old_deployed_commit)
            .expect("recover old source");
        let before = GitRepo::open(&destination)
            .expect("local repo")
            .rev_parse("HEAD")
            .expect("local head");
        fs::write(
            destination.join("resources/blog/post/en.md"),
            "local draft\n",
        )
        .expect("local draft");

        let (new_root, _source, _commit) = source_fixture();
        fs::write(
            new_root.path().join("resources/blog/post/en.md"),
            "deployed update\n",
        )
        .expect("deployed source");
        git(new_root.path(), &["add", "-A"]);
        git(
            new_root.path(),
            &[
                "-c",
                "user.name=Silan.Hu",
                "-c",
                "user.email=silan.hu@u.nus.edu",
                "commit",
                "-q",
                "-m",
                "test: conflicting deployed update",
            ],
        );
        let new_repo = GitRepo::open(new_root.path()).expect("new repo");
        let new_deployed_commit = new_repo.rev_parse("HEAD").expect("new head");
        let new_source =
            ContentSourceArchive::from_repository(new_root.path()).expect("new deployed source");

        assert!(matches!(
            merge_source_archive(&new_source, &destination, &new_deployed_commit),
            Err(ContentRecoveryError::Conflict(_))
        ));
        let local_repo = GitRepo::open(&destination).expect("local repo after conflict");
        assert_eq!(
            local_repo.rev_parse("HEAD").expect("head after conflict"),
            before
        );
        assert!(!local_repo.git_dir().join("MERGE_HEAD").exists());
        assert_eq!(
            fs::read_to_string(destination.join("resources/blog/post/en.md"))
                .expect("local draft after conflict"),
            "local draft\n"
        );
    }

    #[test]
    fn source_archive_rejects_paths_outside_public_source() {
        let mut bytes = Vec::new();
        {
            let mut archive = tar::Builder::new(&mut bytes);
            let payload = b"private\n";
            let mut header = tar::Header::new_gnu();
            header.set_size(payload.len() as u64);
            header.set_mode(0o600);
            header.set_cksum();
            archive
                .append_data(&mut header, "agent/notes/private.md", &payload[..])
                .expect("append");
            archive.finish().expect("finish");
        }
        assert!(matches!(
            ContentSourceArchive::from_bytes(bytes),
            Err(ContentRecoveryError::Archive(_))
        ));
    }

    #[test]
    fn recovery_refuses_a_non_empty_destination() {
        let (_root, source, deployed_commit) = source_fixture();
        let parent = tempfile::tempdir().expect("destination parent");
        let destination = parent.path().join("content");
        fs::create_dir(&destination).expect("destination");
        fs::File::create(destination.join("keep.txt"))
            .expect("keep")
            .write_all(b"keep")
            .expect("write");
        assert!(matches!(
            restore_source_archive(&source, &destination, &deployed_commit),
            Err(ContentRecoveryError::Destination(_))
        ));
        assert_eq!(
            fs::read(destination.join("keep.txt")).expect("keep"),
            b"keep"
        );
    }
}
