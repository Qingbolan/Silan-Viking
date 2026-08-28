//! Self-repair for the private content Git backup.
//!
//! A rebuilt or migrated workspace (`silan site recover` on a fresh device)
//! starts as a repository with no upstream, and the release gate rightly
//! refuses to publish a revision whose only copy is local. When the
//! workspace already carries `[deploy]` credentials, that gap is repairable
//! rather than fatal: provision a bare repository on the deploy host —
//! under the panel backup area, never a web-served path — point `origin` at
//! it and push the current branch. An upstream the owner configured
//! themselves is respected: repair then only pushes, it never rewrites
//! remotes and never forces.

use silan_viking_app::proposal::{GitRepo, RemoteBackupState};
use std::path::Path;

/// Server-side home of self-provisioned content backups. The panel backup
/// area is a sibling of the web root that no Nginx vhost serves; private
/// history must stay out of every published path.
const SERVER_BACKUP_ROOT: &str = "/www/backup/git";

/// What self-repair did to make the private backup durable.
pub(crate) enum BackupRepair {
    /// The branch upstream already holds this commit; nothing to do.
    Synchronized { upstream: String },
    /// An already-configured remote existed; the branch was pushed to it.
    Pushed { upstream: String },
    /// No remote existed: a bare repository was provisioned on the deploy
    /// host and the branch pushed there.
    Provisioned { url: String },
    /// No remote and no `[deploy]` section to provision one from — the
    /// caller decides how to present the manual path.
    Unavailable { reason: String },
}

pub(crate) fn ensure_private_backup(content_root: &Path) -> Result<BackupRepair, String> {
    let repo = GitRepo::open(content_root)
        .map_err(|error| format!("open content repository: {error}"))?;
    match repo
        .remote_backup_state()
        .map_err(|error| format!("query backup state: {error}"))?
    {
        RemoteBackupState::Synchronized { upstream, .. } => {
            Ok(BackupRepair::Synchronized { upstream })
        }
        RemoteBackupState::OutOfSync { upstream, .. } => {
            let branch = current_branch(&repo)?;
            let remote = upstream
                .split_once('/')
                .map_or_else(|| "origin".to_owned(), |(remote, _)| remote.to_owned());
            // Only a plain push is safe: a rejected non-fast-forward means
            // the backup holds work this checkout does not, and reconciling
            // that is the owner's call, never an automatic force.
            repo.run(["push", &remote, &branch])
                .map_err(|error| format!("push `{branch}` to `{upstream}`: {error}"))?;
            confirm_synchronized(&repo)?;
            Ok(BackupRepair::Pushed { upstream })
        }
        RemoteBackupState::MissingUpstream { branch } => {
            if branch == "HEAD" {
                return Err(
                    "HEAD is detached; check out a branch before backing up".to_owned(),
                );
            }
            let remotes = repo
                .run(["remote"])
                .map_err(|error| format!("list remotes: {error}"))?
                .stdout;
            let existing = remotes
                .lines()
                .find(|remote| *remote == "origin")
                .or_else(|| remotes.lines().next())
                .map(str::to_owned);
            if let Some(remote) = existing {
                repo.run(["push", "-u", &remote, &branch])
                    .map_err(|error| format!("push `{branch}` to `{remote}`: {error}"))?;
                confirm_synchronized(&repo)?;
                return Ok(BackupRepair::Pushed {
                    upstream: format!("{remote}/{branch}"),
                });
            }
            let cfg = match crate::deploy_config(content_root) {
                Ok(cfg) => cfg,
                Err(reason) => return Ok(BackupRepair::Unavailable { reason }),
            };
            let repository = server_repository_path(&cfg.remote_dir)?;
            provision_server_repository(&cfg, &repository, &branch)?;
            let url = remote_url(&cfg.user, &cfg.host, cfg.ssh_port, &repository);
            repo.run(["remote", "add", "origin", &url])
                .map_err(|error| format!("add remote `{url}`: {error}"))?;
            repo.run(["config", "core.sshCommand", &git_ssh_command(&cfg)])
                .map_err(|error| format!("configure repository ssh transport: {error}"))?;
            repo.run(["push", "-u", "origin", &branch])
                .map_err(|error| format!("push `{branch}` to `{url}`: {error}"))?;
            confirm_synchronized(&repo)?;
            Ok(BackupRepair::Provisioned { url })
        }
    }
}

fn current_branch(repo: &GitRepo) -> Result<String, String> {
    let branch = repo
        .run(["rev-parse", "--abbrev-ref", "HEAD"])
        .map_err(|error| format!("resolve current branch: {error}"))?
        .stdout;
    if branch == "HEAD" {
        return Err("HEAD is detached; check out a branch before backing up".to_owned());
    }
    Ok(branch)
}

/// The backup gate is the authority — repair is finished only when the gate
/// itself would pass.
fn confirm_synchronized(repo: &GitRepo) -> Result<(), String> {
    match repo
        .remote_backup_state()
        .map_err(|error| format!("re-query backup state: {error}"))?
    {
        RemoteBackupState::Synchronized { .. } => Ok(()),
        RemoteBackupState::MissingUpstream { branch } => Err(format!(
            "branch `{branch}` still has no upstream after repair"
        )),
        RemoteBackupState::OutOfSync {
            upstream,
            local_head,
            remote_head,
        } => Err(format!(
            "`{upstream}` still diverges after repair (local {local_head}, remote {remote_head})"
        )),
    }
}

/// Map the web root to its backup repository: `/www/wwwroot/silan.tech`
/// owns `/www/backup/git/silan.tech.git`.
fn server_repository_path(remote_dir: &str) -> Result<String, String> {
    let site = Path::new(remote_dir)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| {
            format!("[deploy].remote_dir `{remote_dir}` has no site directory name")
        })?;
    Ok(format!("{SERVER_BACKUP_ROOT}/{site}.git"))
}

fn remote_url(user: &str, host: &str, port: u16, repository: &str) -> String {
    if port == 22 {
        format!("ssh://{user}@{host}{repository}")
    } else {
        format!("ssh://{user}@{host}:{port}{repository}")
    }
}

/// Create the bare repository on the deploy host if it does not exist yet.
/// Idempotent: an existing repository (from an earlier repair or another
/// device) is left untouched so its history survives every migration.
fn provision_server_repository(
    cfg: &crate::DeployConfig,
    repository: &str,
    branch: &str,
) -> Result<(), String> {
    let root = crate::shell_quote(SERVER_BACKUP_ROOT);
    let repo = crate::shell_quote(repository);
    let head = crate::shell_quote(&format!("refs/heads/{branch}"));
    let command = format!(
        "command -v git >/dev/null 2>&1 || {{ echo 'git is not installed on the deploy host' >&2; exit 1; }}; \
         mkdir -p {root} && chmod 700 {root} && \
         if [ ! -d {repo} ]; then git init --bare --quiet {repo} && git -C {repo} symbolic-ref HEAD {head}; fi"
    );
    crate::ssh_exec(cfg, &command).map(|_| ())
}

/// The remote URL cannot carry the key path, so repair pins the same
/// transport `site deploy` uses into repo-local configuration; a migrated
/// checkout is re-pinned by the next repair run.
fn git_ssh_command(cfg: &crate::DeployConfig) -> String {
    let mut command = "ssh".to_owned();
    if !cfg.ssh_key_path.as_os_str().is_empty() {
        command.push_str(" -i ");
        command.push_str(&crate::shell_quote(
            &cfg.ssh_key_path.display().to_string(),
        ));
        command.push_str(" -o IdentitiesOnly=yes");
    }
    command.push_str(" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10");
    command
}

#[cfg(test)]
mod tests {
    use super::{ensure_private_backup, remote_url, server_repository_path, BackupRepair};
    use std::path::{Path, PathBuf};
    use std::process::Command;

    #[test]
    fn server_repository_path_maps_the_web_root_into_the_backup_area() {
        assert_eq!(
            server_repository_path("/www/wwwroot/silan.tech").expect("derive path"),
            "/www/backup/git/silan.tech.git"
        );
        assert!(server_repository_path("/").is_err());
    }

    #[test]
    fn remote_url_only_names_a_non_default_port() {
        assert_eq!(
            remote_url("root", "203.0.113.7", 22, "/www/backup/git/site.git"),
            "ssh://root@203.0.113.7/www/backup/git/site.git"
        );
        assert_eq!(
            remote_url("root", "203.0.113.7", 2222, "/www/backup/git/site.git"),
            "ssh://root@203.0.113.7:2222/www/backup/git/site.git"
        );
    }

    fn fixture(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "silan-private-backup-{label}-{}-{}",
            std::process::id(),
            time::OffsetDateTime::now_utc().unix_timestamp_nanos(),
        ));
        std::fs::create_dir_all(&root).expect("create fixture");
        root
    }

    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .expect("run git");
        assert!(
            status.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&status.stderr)
        );
    }

    fn committed_repository(root: &Path) -> PathBuf {
        let content = root.join("content");
        std::fs::create_dir_all(&content).expect("create content root");
        git(&content, &["init", "--quiet"]);
        git(&content, &["checkout", "-q", "-B", "main"]);
        std::fs::write(content.join("SCHEMA.md"), "schema\n").expect("write schema");
        git(&content, &["add", "SCHEMA.md"]);
        git(
            &content,
            &[
                "-c",
                "user.name=test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-q",
                "-m",
                "seed",
            ],
        );
        content
    }

    #[test]
    fn a_configured_remote_without_upstream_is_pushed_and_tracked() {
        let root = fixture("existing-remote");
        let content = committed_repository(&root);
        let remote = root.join("remote.git");
        git(&root, &["init", "--quiet", "--bare", "remote.git"]);
        git(
            &content,
            &["remote", "add", "origin", remote.to_str().expect("utf-8")],
        );

        let repair = ensure_private_backup(&content).expect("repair");
        assert!(matches!(
            repair,
            BackupRepair::Pushed { ref upstream } if upstream == "origin/main"
        ));
        // Re-entry is a no-op: the gate now reports the backup as durable.
        let settled = ensure_private_backup(&content).expect("settled");
        assert!(matches!(settled, BackupRepair::Synchronized { .. }));
        std::fs::remove_dir_all(root).expect("remove fixture");
    }

    #[test]
    fn without_a_remote_or_deploy_configuration_repair_reports_unavailable() {
        let root = fixture("unavailable");
        let content = committed_repository(&root);
        let repair = ensure_private_backup(&content).expect("repair");
        assert!(matches!(repair, BackupRepair::Unavailable { .. }));
        std::fs::remove_dir_all(root).expect("remove fixture");
    }
}
