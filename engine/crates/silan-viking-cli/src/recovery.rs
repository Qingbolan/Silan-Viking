//! CLI adapter for configuration-backed and new-device content recovery.

use silan_viking_app::ContentRecoveryClient;
use std::io::{self, IsTerminal};
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
struct SiteRecoveryOptions {
    site_url: Option<String>,
    destination: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SiteRecoveryFlag {
    From,
    To,
}

impl SiteRecoveryOptions {
    fn parse(expected_content_root: &Path, flags: &[&str]) -> Result<Self, String> {
        let mut site_url = None;
        let mut destination = None;
        let mut index = 0;
        while index < flags.len() {
            let flag = flags[index];
            let (name, inline_value) = flag
                .split_once('=')
                .map_or((flag, None), |(name, value)| (name, Some(value)));
            let recovery_flag = match name {
                "--from" => SiteRecoveryFlag::From,
                "--to" => SiteRecoveryFlag::To,
                _ => {
                    return Err(format!(
                        "site recover: unknown flag `{flag}` · expected --from URL | --to PATH"
                    ));
                }
            };
            let value = match inline_value {
                Some(value) if !value.trim().is_empty() => value,
                Some(_) => return Err(format!("site recover: {name} requires a value")),
                None => {
                    index += 1;
                    flags
                        .get(index)
                        .copied()
                        .ok_or_else(|| format!("site recover: {name} requires a value"))?
                }
            };
            if value.starts_with("--") {
                return Err(format!("site recover: {name} requires a value"));
            }
            match recovery_flag {
                SiteRecoveryFlag::From if site_url.replace(value.to_owned()).is_some() => {
                    return Err("site recover: --from may only be specified once".to_owned());
                }
                SiteRecoveryFlag::To if destination.replace(PathBuf::from(value)).is_some() => {
                    return Err("site recover: --to may only be specified once".to_owned());
                }
                SiteRecoveryFlag::From | SiteRecoveryFlag::To => {}
            }
            index += 1;
        }
        Ok(Self {
            site_url,
            destination: destination.unwrap_or_else(|| expected_content_root.to_path_buf()),
        })
    }
}

/// Restore the exact public authored source attached to the currently
/// deployed content release. `--from` is the configuration-free new-device
/// path; without it the established project configuration remains valid.
/// The destination must be absent or empty, and activation is atomic.
pub(crate) fn run(expected_content_root: &Path, flags: &[&str]) -> Result<(), String> {
    let options = SiteRecoveryOptions::parse(expected_content_root, flags)?;
    let mut client = match options.site_url.as_deref() {
        Some(site_url) => {
            ContentRecoveryClient::from_site(site_url).map_err(|error| error.to_string())?
        }
        None => {
            ContentRecoveryClient::open(expected_content_root).map_err(|error| error.to_string())?
        }
    };
    let credential_root = if options.site_url.is_some() {
        options.destination.as_path()
    } else {
        expected_content_root
    };
    let mut token = silan_viking_app::workspace_stats_sync_token(credential_root);
    if token.is_none() && io::stdin().is_terminal() {
        let entered = rpassword::prompt_password("Recovery token (SILAN_STATS_SYNC_TOKEN): ")
            .map_err(|error| format!("could not read recovery token: {error}"))?;
        token = (!entered.trim().is_empty()).then(|| entered.trim().to_owned());
    }
    if let Some(token) = token {
        client = client.with_bearer_token(token);
    }
    let result = client
        .recover(&options.destination)
        .map_err(|error| error.to_string())?;
    println!("recovered deployed content {}", result.deployed_commit);
    println!("  destination  {}", result.destination.display());
    println!("  files        {}", result.files_restored);
    println!("  source sha   {}", result.source_sha256);
    println!("  local commit {}", result.local_commit);
    println!("  private      agent/ initialized empty (never stored on the public site)");
    // A recovered repository has no upstream yet — self-repair the private
    // backup right away when the workspace carries the credentials for it,
    // so the recovery commit is durable before any further authoring.
    match crate::private_backup::ensure_private_backup(&result.destination) {
        Ok(crate::private_backup::BackupRepair::Provisioned { url }) => {
            println!("  backup       provisioned private remote `{url}` and pushed this recovery commit");
        }
        Ok(crate::private_backup::BackupRepair::Pushed { upstream })
        | Ok(crate::private_backup::BackupRepair::Synchronized { upstream }) => {
            println!("  backup       synchronized with `{upstream}`");
        }
        Ok(crate::private_backup::BackupRepair::Unavailable { reason }) => {
            println!("  next         configure a private Git remote and push this recovery commit");
            println!("               (self-provisioning unavailable: {reason})");
        }
        Err(error) => {
            println!("  warning      private backup self-repair failed: {error}");
            println!("  next         configure a private Git remote and push this recovery commit");
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::SiteRecoveryOptions;
    use std::path::PathBuf;

    #[test]
    fn options_support_configuration_free_new_device_bootstrap() {
        let expected = PathBuf::from("/tmp/project/content");
        let parsed = SiteRecoveryOptions::parse(
            &expected,
            &["--to", "/tmp/new-device/content", "--from=silan.tech"],
        )
        .expect("parse recovery options");
        assert_eq!(parsed.site_url.as_deref(), Some("silan.tech"));
        assert_eq!(parsed.destination, PathBuf::from("/tmp/new-device/content"));

        let configured = SiteRecoveryOptions::parse(&expected, &[]).expect("configured recovery");
        assert_eq!(configured.site_url, None);
        assert_eq!(configured.destination, expected);
    }

    #[test]
    fn options_reject_ambiguous_or_incomplete_flags() {
        let expected = PathBuf::from("/tmp/project/content");
        assert!(SiteRecoveryOptions::parse(&expected, &["--from"]).is_err());
        assert!(SiteRecoveryOptions::parse(
            &expected,
            &["--from", "silan.tech", "--from", "backup.silan.tech"],
        )
        .is_err());
        assert!(SiteRecoveryOptions::parse(&expected, &["--replace"]).is_err());
    }
}
