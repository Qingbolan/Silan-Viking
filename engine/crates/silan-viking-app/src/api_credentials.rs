//! Shared mechanics for Bearer-authenticated AI provider credentials.
//!
//! Provider modules own their public value objects and error vocabulary. This
//! module owns only the protocol mechanics that are identical across providers:
//! local secret normalization and the read-only `GET /models` verification.

use crate::ai_engine::transport::{AiClientFactory, TransportPolicy};
use serde::Deserialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ApiCredentialVerification {
    pub(crate) request_id: Option<String>,
}

#[derive(Debug)]
pub(crate) enum ApiCredentialVerificationError {
    Rejected { status: u16, message: String },
    Unavailable(String),
    InvalidResponse(String),
}

pub(crate) fn normalize_api_key(value: impl Into<String>) -> Result<String, String> {
    let value = value.into();
    let value = value.trim();
    if value.is_empty() {
        return Err("the API key is empty".to_owned());
    }
    Ok(value.to_owned())
}

pub(crate) fn validate_api_key_has_no_whitespace(value: &str) -> Result<(), String> {
    if value.chars().any(char::is_whitespace) {
        return Err("the API key must not contain whitespace".to_owned());
    }
    Ok(())
}

pub(crate) fn verify_bearer_credential(
    api_base: &str,
    models_path: &str,
    api_key: &str,
    rejected_message: &str,
) -> Result<ApiCredentialVerification, ApiCredentialVerificationError> {
    let url = format!("{}{}", api_base.trim_end_matches('/'), models_path);
    let agent = AiClientFactory::shared().agent(TransportPolicy::CredentialProbe);

    match agent
        .get(&url)
        .set("Authorization", &format!("Bearer {api_key}"))
        .call()
    {
        Ok(response) => {
            let request_id = response.header("x-request-id").map(str::to_owned);
            response.into_json::<ModelsResponse>().map_err(|error| {
                ApiCredentialVerificationError::InvalidResponse(error.to_string())
            })?;
            Ok(ApiCredentialVerification { request_id })
        }
        Err(ureq::Error::Status(status, response)) => {
            let message = response
                .into_json::<ApiErrorEnvelope>()
                .ok()
                .map(|body| body.error.message)
                .filter(|message| !message.trim().is_empty())
                .unwrap_or_else(|| rejected_message.to_owned());
            Err(ApiCredentialVerificationError::Rejected { status, message })
        }
        Err(ureq::Error::Transport(error)) => Err(ApiCredentialVerificationError::Unavailable(
            error.to_string(),
        )),
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
    fn normalizes_outer_whitespace_and_validates_inner_whitespace_separately() {
        assert_eq!(
            normalize_api_key("  secret-token  ").expect("valid secret"),
            "secret-token"
        );
        assert!(validate_api_key_has_no_whitespace("secret token").is_err());
    }
}
