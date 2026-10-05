//! OpenAI credential validation use-case.
//!
//! Secret persistence belongs to an outward adapter (macOS Keychain in the
//! CLI). This module owns only the credential value object and the bounded
//! verification request, keeping OS concerns out of the application layer.

use crate::api_credentials::{
    normalize_api_key, validate_api_key_has_no_whitespace, verify_bearer_credential,
    ApiCredentialVerificationError,
};
use std::fmt;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.openai.com";

/// Stable service identifier shared by silan-viking credential adapters.
pub const OPENAI_KEYCHAIN_SERVICE: &str = "silan-viking.openai";
/// Stable account identifier shared by silan-viking credential adapters.
pub const OPENAI_KEYCHAIN_ACCOUNT: &str = "api-key";

/// A validated API key value. Its debug representation is always redacted.
pub struct OpenAiApiKey(String, Option<crate::ai_engine::AiEngineProfile>);

impl OpenAiApiKey {
    /// Validate the local shape without making a network request.
    pub fn parse(value: impl Into<String>) -> Result<Self, OpenAiCredentialError> {
        let value = normalize_api_key(value).map_err(OpenAiCredentialError::InvalidFormat)?;
        if !value.starts_with("sk-") {
            return Err(OpenAiCredentialError::InvalidFormat(
                "an OpenAI API key must start with `sk-`".to_owned(),
            ));
        }
        validate_api_key_has_no_whitespace(&value).map_err(OpenAiCredentialError::InvalidFormat)?;
        Ok(Self(value, None))
    }

    pub fn for_compatible_service(value: impl Into<String>) -> Result<Self, OpenAiCredentialError> {
        let value = normalize_api_key(value).map_err(OpenAiCredentialError::InvalidFormat)?;
        validate_api_key_has_no_whitespace(&value).map_err(OpenAiCredentialError::InvalidFormat)?;
        Ok(Self(value, None))
    }

    pub fn for_engine(
        secret: String,
        profile: crate::ai_engine::AiEngineProfile,
    ) -> Result<Self, OpenAiCredentialError> {
        let mut key = Self::for_compatible_service(secret)?;
        key.1 = Some(profile);
        Ok(key)
    }
    pub fn engine(&self) -> Option<&crate::ai_engine::AiEngineProfile> {
        self.1.as_ref()
    }

    /// Expose the key only to a credential adapter or authenticated request.
    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for OpenAiApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("OpenAiApiKey([REDACTED])")
    }
}

/// Successful remote verification metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenAiVerification {
    /// API request identifier, useful for OpenAI support without exposing the key.
    pub request_id: Option<String>,
}

/// Credential validation failure.
#[derive(Debug, Error)]
pub enum OpenAiCredentialError {
    #[error("invalid OpenAI API key: {0}")]
    InvalidFormat(String),
    #[error("OpenAI rejected the API key ({status}): {message}")]
    Rejected { status: u16, message: String },
    #[error("could not reach OpenAI: {0}")]
    Unavailable(String),
    #[error("OpenAI returned an invalid verification response: {0}")]
    InvalidResponse(String),
}

/// Performs a bounded, read-only API request to verify a Platform API key.
pub struct OpenAiCredentialVerifier {
    api_base: String,
}

impl Default for OpenAiCredentialVerifier {
    fn default() -> Self {
        Self::new(DEFAULT_API_BASE)
    }
}

impl OpenAiCredentialVerifier {
    pub fn new(api_base: impl Into<String>) -> Self {
        Self {
            api_base: api_base.into().trim_end_matches('/').to_owned(),
        }
    }

    /// Verify authentication with `GET /v1/models`; no mutable API resource is created.
    pub fn verify(
        &self,
        api_key: &OpenAiApiKey,
    ) -> Result<OpenAiVerification, OpenAiCredentialError> {
        verify_bearer_credential(
            &self.api_base,
            "/v1/models",
            api_key.expose_secret(),
            "authentication or project access failed",
        )
        .map(|verification| OpenAiVerification {
            request_id: verification.request_id,
        })
        .map_err(map_verification_error)
    }
}

fn map_verification_error(error: ApiCredentialVerificationError) -> OpenAiCredentialError {
    match error {
        ApiCredentialVerificationError::Rejected { status, message } => {
            OpenAiCredentialError::Rejected { status, message }
        }
        ApiCredentialVerificationError::Unavailable(message) => {
            OpenAiCredentialError::Unavailable(message)
        }
        ApiCredentialVerificationError::InvalidResponse(message) => {
            OpenAiCredentialError::InvalidResponse(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_key_debug_output_is_redacted() {
        let key = OpenAiApiKey::parse("sk-test-secret").expect("valid key");
        let debug = format!("{key:?}");
        assert!(!debug.contains("test-secret"));
        assert_eq!(debug, "OpenAiApiKey([REDACTED])");
    }

    #[test]
    fn api_key_rejects_non_platform_tokens() {
        let error = OpenAiApiKey::parse("not-an-api-key").expect_err("must reject");
        assert!(matches!(error, OpenAiCredentialError::InvalidFormat(_)));
    }
}
