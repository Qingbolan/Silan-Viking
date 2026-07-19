//! GitHub OAuth application credentials.
//!
//! Persistence belongs to an outward adapter such as macOS Keychain. This
//! application-layer module owns validation and redaction only, so the CLI,
//! desktop app, and future SDK adapters share one credential contract.

use std::fmt;
use thiserror::Error;

pub const GITHUB_OAUTH_KEYCHAIN_SERVICE: &str = "silan-viking.github-oauth";
pub const GITHUB_OAUTH_KEYCHAIN_ACCOUNT: &str = "oauth-app";

#[derive(Clone, PartialEq, Eq)]
pub struct GitHubOAuthCredentials {
    client_id: String,
    client_secret: String,
}

impl GitHubOAuthCredentials {
    pub fn parse(
        client_id: impl Into<String>,
        client_secret: impl Into<String>,
    ) -> Result<Self, GitHubOAuthCredentialError> {
        let client_id = validate_component("client ID", client_id.into())?;
        let client_secret = validate_component("client secret", client_secret.into())?;
        Ok(Self {
            client_id,
            client_secret,
        })
    }

    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    pub fn expose_client_secret(&self) -> &str {
        &self.client_secret
    }
}

impl fmt::Debug for GitHubOAuthCredentials {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("GitHubOAuthCredentials")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .finish()
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum GitHubOAuthCredentialError {
    #[error("invalid GitHub OAuth {field}: {reason}")]
    InvalidFormat {
        field: &'static str,
        reason: &'static str,
    },
}

fn validate_component(
    field: &'static str,
    value: String,
) -> Result<String, GitHubOAuthCredentialError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(GitHubOAuthCredentialError::InvalidFormat {
            field,
            reason: "value is empty",
        });
    }
    if value.chars().any(char::is_whitespace) {
        return Err(GitHubOAuthCredentialError::InvalidFormat {
            field,
            reason: "value must not contain whitespace",
        });
    }
    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_output_never_exposes_client_secret() {
        let credentials =
            GitHubOAuthCredentials::parse("client-id", "secret-value").expect("valid");
        let debug = format!("{credentials:?}");
        assert!(debug.contains("client-id"));
        assert!(!debug.contains("secret-value"));
        assert!(debug.contains("[REDACTED]"));
    }

    #[test]
    fn rejects_partial_or_whitespace_credentials() {
        assert!(GitHubOAuthCredentials::parse("", "secret").is_err());
        assert!(GitHubOAuthCredentials::parse("client", "").is_err());
        assert!(GitHubOAuthCredentials::parse("client id", "secret").is_err());
    }
}
