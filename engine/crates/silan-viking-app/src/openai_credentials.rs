//! OpenAI credential validation use-case.
//!
//! Secret persistence belongs to an outward adapter (macOS Keychain in the
//! CLI). This module owns only the credential value object and the bounded
//! verification request, keeping OS concerns out of the application layer.

use serde::Deserialize;
use std::fmt;
use std::time::Duration;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.openai.com";

/// Stable service identifier shared by silan-viking credential adapters.
pub const OPENAI_KEYCHAIN_SERVICE: &str = "silan-viking.openai";
/// Stable account identifier shared by silan-viking credential adapters.
pub const OPENAI_KEYCHAIN_ACCOUNT: &str = "api-key";

/// A validated API key value. Its debug representation is always redacted.
pub struct OpenAiApiKey(String);

impl OpenAiApiKey {
    /// Validate the local shape without making a network request.
    pub fn parse(value: impl Into<String>) -> Result<Self, OpenAiCredentialError> {
        let value = value.into();
        let value = value.trim();
        if value.is_empty() {
            return Err(OpenAiCredentialError::InvalidFormat(
                "the API key is empty".to_owned(),
            ));
        }
        if !value.starts_with("sk-") {
            return Err(OpenAiCredentialError::InvalidFormat(
                "an OpenAI API key must start with `sk-`".to_owned(),
            ));
        }
        if value.chars().any(char::is_whitespace) {
            return Err(OpenAiCredentialError::InvalidFormat(
                "the API key must not contain whitespace".to_owned(),
            ));
        }
        Ok(Self(value.to_owned()))
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
        let url = format!("{}/v1/models", self.api_base);
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(4))
            .timeout_read(Duration::from_secs(10))
            .timeout_write(Duration::from_secs(4))
            .build();
        match agent
            .get(&url)
            .set(
                "Authorization",
                &format!("Bearer {}", api_key.expose_secret()),
            )
            .call()
        {
            Ok(response) => {
                let request_id = response.header("x-request-id").map(str::to_owned);
                response
                    .into_json::<ModelsResponse>()
                    .map_err(|error| OpenAiCredentialError::InvalidResponse(error.to_string()))?;
                Ok(OpenAiVerification { request_id })
            }
            Err(ureq::Error::Status(status, response)) => {
                let message = response
                    .into_json::<ApiErrorEnvelope>()
                    .ok()
                    .map(|body| body.error.message)
                    .filter(|message| !message.trim().is_empty())
                    .unwrap_or_else(|| "authentication or project access failed".to_owned());
                Err(OpenAiCredentialError::Rejected { status, message })
            }
            Err(ureq::Error::Transport(error)) => {
                Err(OpenAiCredentialError::Unavailable(error.to_string()))
            }
        }
    }
}

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(rename = "object")]
    _object: String,
}

#[derive(Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    message: String,
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
