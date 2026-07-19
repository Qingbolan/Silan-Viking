//! Deployment-scoped credential profile names.

use std::fmt;
use thiserror::Error;

pub const DEFAULT_CREDENTIAL_PROFILE: &str = "default";

#[derive(Clone, PartialEq, Eq)]
pub struct CredentialProfile(String);

impl CredentialProfile {
    pub fn parse(value: impl Into<String>) -> Result<Self, CredentialProfileError> {
        let value = value.into();
        let value = value.trim();
        if value.is_empty() {
            return Err(CredentialProfileError::Invalid(
                "profile name is empty".to_owned(),
            ));
        }
        if !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err(CredentialProfileError::Invalid(
                "use only ASCII letters, digits, `-`, or `_`".to_owned(),
            ));
        }
        Ok(Self(value.to_owned()))
    }

    pub fn default_profile() -> Self {
        Self(DEFAULT_CREDENTIAL_PROFILE.to_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn keychain_account(&self, account: &str) -> String {
        if self.0 == DEFAULT_CREDENTIAL_PROFILE {
            account.to_owned()
        } else {
            format!("{account}@{}", self.0)
        }
    }
}

impl fmt::Debug for CredentialProfile {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CredentialProfileError {
    #[error("invalid credential profile: {0}")]
    Invalid(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_stable_scoped_keychain_account() {
        assert_eq!(
            CredentialProfile::default_profile().keychain_account("oauth-app"),
            "oauth-app"
        );
        assert_eq!(
            CredentialProfile::parse("nus")
                .expect("profile")
                .keychain_account("oauth-app"),
            "oauth-app@nus"
        );
    }
}
