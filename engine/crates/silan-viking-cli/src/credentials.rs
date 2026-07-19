//! Credential CLI adapter.
//!
//! Secrets are entered without terminal echo and persisted in the
//! current user's macOS Keychain. They never enter workspace files, SQLite,
//! command arguments, or CLI output.

use silan_viking_app::{
    CredentialProfile, GitHubOAuthCredentials, GoogleOAuthClientId, OpenAiApiKey,
    OpenAiCredentialVerifier, GITHUB_OAUTH_KEYCHAIN_ACCOUNT, GITHUB_OAUTH_KEYCHAIN_SERVICE,
    GOOGLE_OAUTH_KEYCHAIN_ACCOUNT, GOOGLE_OAUTH_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT,
    OPENAI_KEYCHAIN_SERVICE,
};

pub fn openai_set() -> Result<(), String> {
    let secret = rpassword::prompt_password("OpenAI API Key: ")
        .map_err(|error| format!("could not read API key: {error}"))?;
    let key = OpenAiApiKey::parse(secret).map_err(|error| error.to_string())?;

    println!("Verifying OpenAI API key...");
    let verification = OpenAiCredentialVerifier::default()
        .verify(&key)
        .map_err(|error| error.to_string())?;
    store_secret(
        OPENAI_KEYCHAIN_SERVICE,
        OPENAI_KEYCHAIN_ACCOUNT,
        key.expose_secret(),
    )?;

    println!("OpenAI API key verified and stored in macOS Keychain.");
    if let Some(request_id) = verification.request_id {
        println!("request_id={request_id}");
    }
    Ok(())
}

pub fn openai_status() -> Result<(), String> {
    match load_secret(OPENAI_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT)? {
        Some(_) => println!("OpenAI API key: configured in macOS Keychain"),
        None => println!("OpenAI API key: not configured"),
    }
    Ok(())
}

pub fn openai_test() -> Result<(), String> {
    let secret =
        load_secret(OPENAI_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT)?.ok_or_else(|| {
            "OpenAI API key is not configured; run `silan credentials openai set`".to_owned()
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
    if remove_secret(OPENAI_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT)? {
        println!("OpenAI API key removed from macOS Keychain.");
    } else {
        println!("OpenAI API key was not configured.");
    }
    Ok(())
}

pub fn github_set(profile: &CredentialProfile) -> Result<(), String> {
    let client_id = rpassword::prompt_password("GitHub OAuth Client ID: ")
        .map_err(|error| format!("could not read GitHub OAuth client ID: {error}"))?;
    let client_secret = rpassword::prompt_password("GitHub OAuth Client Secret: ")
        .map_err(|error| format!("could not read GitHub OAuth client secret: {error}"))?;
    let credentials = GitHubOAuthCredentials::parse(client_id, client_secret)
        .map_err(|error| error.to_string())?;

    let record = format!(
        "{}\n{}",
        credentials.client_id(),
        credentials.expose_client_secret()
    );
    store_secret(
        GITHUB_OAUTH_KEYCHAIN_SERVICE,
        &profile.keychain_account(GITHUB_OAUTH_KEYCHAIN_ACCOUNT),
        &record,
    )?;
    println!(
        "GitHub OAuth credentials stored for profile `{}`.",
        profile.as_str()
    );
    Ok(())
}

pub fn github_status(profile: &CredentialProfile) -> Result<(), String> {
    match github_credentials(profile)? {
        Some(_) => println!(
            "GitHub OAuth credentials [{}]: configured",
            profile.as_str()
        ),
        None => println!(
            "GitHub OAuth credentials [{}]: not configured",
            profile.as_str()
        ),
    }
    Ok(())
}

pub fn github_remove(profile: &CredentialProfile) -> Result<(), String> {
    let removed = remove_secret(
        GITHUB_OAUTH_KEYCHAIN_SERVICE,
        &profile.keychain_account(GITHUB_OAUTH_KEYCHAIN_ACCOUNT),
    )?;
    if removed {
        println!(
            "GitHub OAuth credentials removed for profile `{}`.",
            profile.as_str()
        );
    } else {
        println!("GitHub OAuth credentials were not configured.");
    }
    Ok(())
}

pub fn github_credentials(
    profile: &CredentialProfile,
) -> Result<Option<GitHubOAuthCredentials>, String> {
    let Some(record) = load_secret(
        GITHUB_OAUTH_KEYCHAIN_SERVICE,
        &profile.keychain_account(GITHUB_OAUTH_KEYCHAIN_ACCOUNT),
    )?
    else {
        return Ok(None);
    };
    let (client_id, client_secret) = record.split_once('\n').ok_or_else(|| {
        "GitHub OAuth credential is invalid; run `silan credentials github set`".to_owned()
    })?;
    GitHubOAuthCredentials::parse(client_id, client_secret)
        .map(Some)
        .map_err(|error| error.to_string())
}

pub fn google_set(profile: &CredentialProfile) -> Result<(), String> {
    let client_id = rpassword::prompt_password("Google OAuth Web Client ID: ")
        .map_err(|error| format!("could not read Google OAuth client ID: {error}"))?;
    let client_id = GoogleOAuthClientId::parse(client_id).map_err(|error| error.to_string())?;
    store_secret(
        GOOGLE_OAUTH_KEYCHAIN_SERVICE,
        &profile.keychain_account(GOOGLE_OAUTH_KEYCHAIN_ACCOUNT),
        client_id.as_str(),
    )?;
    println!(
        "Google OAuth web client ID stored for profile `{}`.",
        profile.as_str()
    );
    Ok(())
}

pub fn google_status(profile: &CredentialProfile) -> Result<(), String> {
    match google_client_id(profile)? {
        Some(client_id) => println!(
            "Google OAuth web client ID [{}]: configured ({client_id:?})",
            profile.as_str()
        ),
        None => println!(
            "Google OAuth web client ID [{}]: not configured",
            profile.as_str()
        ),
    }
    Ok(())
}

pub fn google_remove(profile: &CredentialProfile) -> Result<(), String> {
    if remove_secret(
        GOOGLE_OAUTH_KEYCHAIN_SERVICE,
        &profile.keychain_account(GOOGLE_OAUTH_KEYCHAIN_ACCOUNT),
    )? {
        println!(
            "Google OAuth web client ID removed for profile `{}`.",
            profile.as_str()
        );
    } else {
        println!("Google OAuth web client ID was not configured.");
    }
    Ok(())
}

pub fn google_client_id(
    profile: &CredentialProfile,
) -> Result<Option<GoogleOAuthClientId>, String> {
    let Some(client_id) = load_secret(
        GOOGLE_OAUTH_KEYCHAIN_SERVICE,
        &profile.keychain_account(GOOGLE_OAUTH_KEYCHAIN_ACCOUNT),
    )?
    else {
        return Ok(None);
    };
    GoogleOAuthClientId::parse(client_id)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn entry(service: &str, account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(service, account)
        .map_err(|error| format!("could not access macOS Keychain: {error}"))
}

#[cfg(target_os = "macos")]
fn store_secret(service: &str, account: &str, secret: &str) -> Result<(), String> {
    entry(service, account)?
        .set_password(secret)
        .map_err(|error| format!("could not store credential in macOS Keychain: {error}"))
}

#[cfg(target_os = "macos")]
fn load_secret(service: &str, account: &str) -> Result<Option<String>, String> {
    match entry(service, account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("could not read macOS Keychain: {error}")),
    }
}

#[cfg(target_os = "macos")]
fn remove_secret(service: &str, account: &str) -> Result<bool, String> {
    match entry(service, account)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(error) => Err(format!("could not update macOS Keychain: {error}")),
    }
}

#[cfg(not(target_os = "macos"))]
fn store_secret(_service: &str, _account: &str, _secret: &str) -> Result<(), String> {
    Err("credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(not(target_os = "macos"))]
fn load_secret(_service: &str, _account: &str) -> Result<Option<String>, String> {
    Err("credential storage currently requires macOS Keychain".to_owned())
}

#[cfg(not(target_os = "macos"))]
fn remove_secret(_service: &str, _account: &str) -> Result<bool, String> {
    Err("credential storage currently requires macOS Keychain".to_owned())
}
