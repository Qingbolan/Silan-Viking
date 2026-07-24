//! Desktop OpenAI credential lifecycle.
//!
//! This outward adapter is the sole owner of macOS Keychain access. OpenAI
//! use-cases receive a validated value object and never handle raw secrets.

use serde::Serialize;
use silan_viking_app::{
    OpenAiApiKey, OpenAiCredentialVerifier, OpenAiMarkdownTranslator, OPENAI_KEYCHAIN_ACCOUNT,
    OPENAI_KEYCHAIN_SERVICE,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OpenAiCredentialState {
    Missing,
    Ready,
    Invalid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub(crate) struct OpenAiCredentialStatus {
    pub(crate) state: OpenAiCredentialState,
    pub(crate) model: String,
    pub(crate) detail: Option<String>,
    pub(crate) request_id: Option<String>,
}

pub(crate) struct DesktopOpenAiCredentials;

impl DesktopOpenAiCredentials {
    pub(crate) fn status() -> Result<OpenAiCredentialStatus, String> {
        let secret = load_secret()?;
        Ok(status_from_secret(secret.as_deref()))
    }

    pub(crate) fn load_key() -> Result<OpenAiApiKey, String> {
        let secret = load_secret()?.ok_or_else(|| {
            "OpenAI is not configured. Open Workspace settings → OpenAI to add an API key."
                .to_owned()
        })?;
        OpenAiApiKey::parse(secret).map_err(|error| {
            format!("{error}. Open Workspace settings → OpenAI to replace the stored API key.")
        })
    }

    pub(crate) fn verify_and_store(secret: String) -> Result<OpenAiCredentialStatus, String> {
        let key = OpenAiApiKey::parse(secret).map_err(|error| error.to_string())?;
        let verification = OpenAiCredentialVerifier::default()
            .verify(&key)
            .map_err(|error| error.to_string())?;
        store_secret(key.expose_secret())?;
        Ok(ready_status(verification.request_id))
    }

    pub(crate) fn verify_stored() -> Result<OpenAiCredentialStatus, String> {
        let key = Self::load_key()?;
        let verification = OpenAiCredentialVerifier::default()
            .verify(&key)
            .map_err(|error| error.to_string())?;
        Ok(ready_status(verification.request_id))
    }

    pub(crate) fn remove() -> Result<OpenAiCredentialStatus, String> {
        remove_secret()?;
        Ok(missing_status())
    }
}

fn status_from_secret(secret: Option<&str>) -> OpenAiCredentialStatus {
    match secret {
        None => missing_status(),
        Some(secret) => match OpenAiApiKey::parse(secret.to_owned()) {
            Ok(_) => ready_status(None),
            Err(error) => OpenAiCredentialStatus {
                state: OpenAiCredentialState::Invalid,
                model: active_translation_model(),
                detail: Some(error.to_string()),
                request_id: None,
            },
        },
    }
}

fn missing_status() -> OpenAiCredentialStatus {
    OpenAiCredentialStatus {
        state: OpenAiCredentialState::Missing,
        model: active_translation_model(),
        detail: None,
        request_id: None,
    }
}

fn ready_status(request_id: Option<String>) -> OpenAiCredentialStatus {
    OpenAiCredentialStatus {
        state: OpenAiCredentialState::Ready,
        model: active_translation_model(),
        detail: None,
        request_id,
    }
}

fn active_translation_model() -> String {
    OpenAiMarkdownTranslator::from_environment()
        .model()
        .to_owned()
}

#[cfg(target_os = "macos")]
fn keychain_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(OPENAI_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT)
        .map_err(|error| format!("Could not access macOS Keychain: {error}"))
}

#[cfg(target_os = "macos")]
fn load_secret() -> Result<Option<String>, String> {
    match keychain_entry()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!(
            "Could not read OpenAI API key from Keychain: {error}"
        )),
    }
}

#[cfg(target_os = "macos")]
fn store_secret(secret: &str) -> Result<(), String> {
    keychain_entry()?
        .set_password(secret)
        .map_err(|error| format!("Could not store OpenAI API key in Keychain: {error}"))
}

#[cfg(target_os = "macos")]
fn remove_secret() -> Result<(), String> {
    match keychain_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Could not remove OpenAI API key from Keychain: {error}"
        )),
    }
}

#[cfg(not(target_os = "macos"))]
fn load_secret() -> Result<Option<String>, String> {
    Err("OpenAI credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(not(target_os = "macos"))]
fn store_secret(_secret: &str) -> Result<(), String> {
    Err("OpenAI credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(not(target_os = "macos"))]
fn remove_secret() -> Result<(), String> {
    Err("OpenAI credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_status_is_an_explicit_state_machine() {
        assert_eq!(
            status_from_secret(None).state,
            OpenAiCredentialState::Missing
        );
        assert_eq!(
            status_from_secret(Some("sk-test-secret")).state,
            OpenAiCredentialState::Ready
        );
        assert_eq!(
            status_from_secret(Some("invalid")).state,
            OpenAiCredentialState::Invalid
        );
    }

    #[test]
    #[ignore = "requires a configured macOS Keychain item and OpenAI network access"]
    fn live_desktop_keychain_credential_reaches_openai() {
        let status = DesktopOpenAiCredentials::verify_stored().expect("configured key must verify");
        assert_eq!(status.state, OpenAiCredentialState::Ready);
        assert!(status.request_id.is_some());
    }
}
