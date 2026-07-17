//! Credential CLI adapter.
//!
//! OpenAI API keys are entered without terminal echo and persisted in the
//! current user's macOS Keychain. They never enter workspace files, SQLite,
//! command arguments, or CLI output.

use silan_viking_app::{
    OpenAiApiKey, OpenAiCredentialVerifier, OPENAI_KEYCHAIN_ACCOUNT, OPENAI_KEYCHAIN_SERVICE,
};

pub fn openai_set() -> Result<(), String> {
    let secret = rpassword::prompt_password("OpenAI API Key: ")
        .map_err(|error| format!("could not read API key: {error}"))?;
    let key = OpenAiApiKey::parse(secret).map_err(|error| error.to_string())?;

    println!("Verifying OpenAI API key...");
    let verification = OpenAiCredentialVerifier::default()
        .verify(&key)
        .map_err(|error| error.to_string())?;
    store_secret(key.expose_secret())?;

    println!("OpenAI API key verified and stored in macOS Keychain.");
    if let Some(request_id) = verification.request_id {
        println!("request_id={request_id}");
    }
    Ok(())
}

pub fn openai_status() -> Result<(), String> {
    match load_secret()? {
        Some(_) => println!("OpenAI API key: configured in macOS Keychain"),
        None => println!("OpenAI API key: not configured"),
    }
    Ok(())
}

pub fn openai_test() -> Result<(), String> {
    let secret = load_secret()?.ok_or_else(|| {
        "OpenAI API key is not configured; run `silan-viking credentials openai set`".to_owned()
    })?;
    let key = OpenAiApiKey::parse(secret).map_err(|error| error.to_string())?;
    let verification = OpenAiCredentialVerifier::default()
        .verify(&key)
        .map_err(|error| error.to_string())?;
    println!("OpenAI API key is valid.");
    if let Some(request_id) = verification.request_id {
        println!("request_id={request_id}");
    }
    Ok(())
}

pub fn openai_remove() -> Result<(), String> {
    if remove_secret()? {
        println!("OpenAI API key removed from macOS Keychain.");
    } else {
        println!("OpenAI API key was not configured.");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(OPENAI_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT)
        .map_err(|error| format!("could not access macOS Keychain: {error}"))
}

#[cfg(target_os = "macos")]
fn store_secret(secret: &str) -> Result<(), String> {
    entry()?
        .set_password(secret)
        .map_err(|error| format!("could not store API key in macOS Keychain: {error}"))
}

#[cfg(target_os = "macos")]
fn load_secret() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("could not read macOS Keychain: {error}")),
    }
}

#[cfg(target_os = "macos")]
fn remove_secret() -> Result<bool, String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("could not update macOS Keychain: {error}")),
    }
}

#[cfg(not(target_os = "macos"))]
fn store_secret(_secret: &str) -> Result<(), String> {
    Err("OpenAI credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(not(target_os = "macos"))]
fn load_secret() -> Result<Option<String>, String> {
    Err("OpenAI credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(not(target_os = "macos"))]
fn remove_secret() -> Result<bool, String> {
    Err("OpenAI credential storage currently requires macOS Keychain".to_owned())
}
