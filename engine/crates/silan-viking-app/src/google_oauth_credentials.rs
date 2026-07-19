//! Google OAuth web client configuration shared by SDK adapters.

use std::fmt;
use thiserror::Error;

pub const GOOGLE_OAUTH_KEYCHAIN_SERVICE: &str = "silan-viking.google-oauth";
pub const GOOGLE_OAUTH_KEYCHAIN_ACCOUNT: &str = "web-client-id";

#[derive(Clone, PartialEq, Eq)]
pub struct GoogleOAuthClientId(String);

impl GoogleOAuthClientId {
    pub fn parse(value: impl Into<String>) -> Result<Self, GoogleOAuthCredentialError> {
        let value = value.into();
        let value = value.trim();
        if value.is_empty() {
            return Err(GoogleOAuthCredentialError::InvalidFormat(
                "client ID is empty".to_owned(),
            ));
        }
        if value.chars().any(char::is_whitespace) {
            return Err(GoogleOAuthCredentialError::InvalidFormat(
                "client ID must not contain whitespace".to_owned(),
            ));
        }
        if !value.ends_with(".apps.googleusercontent.com") {
            return Err(GoogleOAuthCredentialError::InvalidFormat(
                "expected a Google OAuth web client ID ending in `.apps.googleusercontent.com`"
                    .to_owned(),
            ));
        }
        Ok(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for GoogleOAuthClientId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_tuple("GoogleOAuthClientId")
            .field(&self.0)
            .finish()
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum GoogleOAuthCredentialError {
    #[error("invalid Google OAuth configuration: {0}")]
    InvalidFormat(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_google_web_client_id() {
        let id = GoogleOAuthClientId::parse("123-example.apps.googleusercontent.com")
            .expect("valid client id");
        assert_eq!(id.as_str(), "123-example.apps.googleusercontent.com");
    }

    #[test]
    fn rejects_non_google_or_whitespace_values() {
        assert!(GoogleOAuthClientId::parse("").is_err());
        assert!(GoogleOAuthClientId::parse("client id.apps.googleusercontent.com").is_err());
        assert!(GoogleOAuthClientId::parse("example.com").is_err());
    }
}
