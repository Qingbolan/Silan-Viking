//! DeepSeek credential validation use-case.
//!
//! Secret persistence belongs to an outward adapter (macOS Keychain in the
//! CLI). This module owns the credential value object and the bounded,
//! read-only verification request.

use crate::api_credentials::{
    normalize_api_key, validate_api_key_has_no_whitespace, verify_bearer_credential,
    ApiCredentialVerificationError,
};
use std::fmt;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.deepseek.com";

/// Stable service identifier shared by silan-viking credential adapters.
pub const DEEPSEEK_KEYCHAIN_SERVICE: &str = "silan-viking.deepseek";
/// Stable account identifier shared by silan-viking credential adapters.
pub const DEEPSEEK_KEYCHAIN_ACCOUNT: &str = "api-key";

/// A validated DeepSeek API key value. Its debug representation is redacted.
pub struct DeepSeekApiKey(String, Option<crate::ai_engine::AiEngineProfile>);

impl DeepSeekApiKey {
    /// Validate the local shape without making a network request.
    ///
    /// DeepSeek documents Bearer authentication without promising a stable
    /// textual prefix, so validation intentionally rejects only empty keys and
    /// embedded whitespace.
    pub fn parse(value: impl Into<String>) -> Result<Self, DeepSeekCredentialError> {
        let value = normalize_api_key(value).map_err(DeepSeekCredentialError::InvalidFormat)?;
        validate_api_key_has_no_whitespace(&value)
            .map_err(DeepSeekCredentialError::InvalidFormat)?;
        Ok(Self(value, None))
    }

    pub fn for_engine(
        secret: String,
        profile: crate::ai_engine::AiEngineProfile,
    ) -> Result<Self, DeepSeekCredentialError> {
        let mut key = Self::parse(secret)?;
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

impl fmt::Debug for DeepSeekApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("DeepSeekApiKey([REDACTED])")
    }
}

/// Successful remote verification metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeepSeekVerification {
    /// API request identifier, useful for support without exposing the key.
    pub request_id: Option<String>,
}

/// Credential validation failure.
#[derive(Debug, Error)]
pub enum DeepSeekCredentialError {
    #[error("invalid DeepSeek API key: {0}")]
    InvalidFormat(String),
    #[error("DeepSeek rejected the API key ({status}): {message}")]
    Rejected { status: u16, message: String },
    #[error("could not reach DeepSeek: {0}")]
    Unavailable(String),
    #[error("DeepSeek returned an invalid verification response: {0}")]
    InvalidResponse(String),
}

/// Performs a bounded `GET /models` request to verify a DeepSeek API key.
pub struct DeepSeekCredentialVerifier {
    api_base: String,
}

impl Default for DeepSeekCredentialVerifier {
    fn default() -> Self {
        Self::new(DEFAULT_API_BASE)
    }
}

impl DeepSeekCredentialVerifier {
    pub fn new(api_base: impl Into<String>) -> Self {
        Self {
            api_base: api_base.into().trim_end_matches('/').to_owned(),
        }
    }

    pub fn verify(
        &self,
        api_key: &DeepSeekApiKey,
    ) -> Result<DeepSeekVerification, DeepSeekCredentialError> {
        verify_bearer_credential(
            &self.api_base,
            "/models",
            api_key.expose_secret(),
            "authentication or account access failed",
        )
        .map(|verification| DeepSeekVerification {
            request_id: verification.request_id,
        })
        .map_err(map_verification_error)
    }
}

fn map_verification_error(error: ApiCredentialVerificationError) -> DeepSeekCredentialError {
    match error {
        ApiCredentialVerificationError::Rejected { status, message } => {
            DeepSeekCredentialError::Rejected { status, message }
        }
        ApiCredentialVerificationError::Unavailable(message) => {
            DeepSeekCredentialError::Unavailable(message)
        }
        ApiCredentialVerificationError::InvalidResponse(message) => {
            DeepSeekCredentialError::InvalidResponse(message)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn api_key_debug_output_is_redacted() {
        let key = DeepSeekApiKey::parse("deepseek-test-secret").expect("valid key");
        let debug = format!("{key:?}");
        assert!(!debug.contains("test-secret"));
        assert_eq!(debug, "DeepSeekApiKey([REDACTED])");
    }

    #[test]
    fn api_key_accepts_provider_tokens_without_assuming_a_prefix() {
        assert!(DeepSeekApiKey::parse("provider-token").is_ok());
        assert!(DeepSeekApiKey::parse("provider token").is_err());
    }

    #[test]
    fn verifier_uses_the_read_only_models_endpoint_with_bearer_auth() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        let address = listener.local_addr().expect("mock server address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept verifier request");
            let mut request = Vec::new();
            let mut chunk = [0_u8; 512];
            while !request.ends_with(b"\r\n\r\n") {
                let bytes_read = stream.read(&mut chunk).expect("read verifier request");
                assert_ne!(bytes_read, 0, "request ended before its headers");
                request.extend_from_slice(&chunk[..bytes_read]);
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request.starts_with("GET /models HTTP/1.1\r\n"), "{request}");
            assert!(
                request
                    .to_ascii_lowercase()
                    .contains("authorization: bearer provider-token\r\n"),
                "{request}"
            );

            let body = r#"{"object":"list","data":[]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\
                 Content-Length: {}\r\nx-request-id: deepseek-request-id\r\n\
                 Connection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write verifier response");
        });

        let key = DeepSeekApiKey::parse("provider-token").expect("valid key");
        let verification = DeepSeekCredentialVerifier::new(format!("http://{address}"))
            .verify(&key)
            .expect("verified key");
        server.join().expect("mock server completed");

        assert_eq!(
            verification.request_id.as_deref(),
            Some("deepseek-request-id")
        );
    }
}
