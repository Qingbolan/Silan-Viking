//! Credential CLI adapter.
//!
//! Secrets are entered without terminal echo and persisted in the
//! current user's macOS Keychain. They never enter workspace files, SQLite,
//! command arguments, or CLI output.

use silan_viking_app::{
    CredentialProfile, DeepSeekApiKey, DeepSeekCredentialVerifier, GitHubOAuthCredentials,
    GoogleOAuthClientId, OpenAiApiKey, OpenAiCredentialVerifier, DEEPSEEK_KEYCHAIN_ACCOUNT,
    DEEPSEEK_KEYCHAIN_SERVICE, GITHUB_OAUTH_KEYCHAIN_ACCOUNT, GITHUB_OAUTH_KEYCHAIN_SERVICE,
    GOOGLE_OAUTH_KEYCHAIN_ACCOUNT, GOOGLE_OAUTH_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT,
    OPENAI_KEYCHAIN_SERVICE,
};
use std::env;

trait ApiCredentialProvider {
    type Key;

    const SLUG: &'static str;
    const DISPLAY_NAME: &'static str;
    const ENVIRONMENT_VARIABLE: &'static str;
    const KEYCHAIN_SERVICE: &'static str;
    const KEYCHAIN_ACCOUNT: &'static str;

    fn parse(secret: String) -> Result<Self::Key, String>;
    fn expose_secret(key: &Self::Key) -> &str;
    fn verify(key: &Self::Key) -> Result<Option<String>, String>;
}

struct OpenAiProvider;

impl ApiCredentialProvider for OpenAiProvider {
    type Key = OpenAiApiKey;

    const SLUG: &'static str = "openai";
    const DISPLAY_NAME: &'static str = "OpenAI";
    const ENVIRONMENT_VARIABLE: &'static str = "OPENAI_API_KEY";
    const KEYCHAIN_SERVICE: &'static str = OPENAI_KEYCHAIN_SERVICE;
    const KEYCHAIN_ACCOUNT: &'static str = OPENAI_KEYCHAIN_ACCOUNT;

    fn parse(secret: String) -> Result<Self::Key, String> {
        OpenAiApiKey::parse(secret).map_err(|error| error.to_string())
    }

    fn expose_secret(key: &Self::Key) -> &str {
        key.expose_secret()
    }

    fn verify(key: &Self::Key) -> Result<Option<String>, String> {
        OpenAiCredentialVerifier::default()
            .verify(key)
            .map(|verification| verification.request_id)
            .map_err(|error| error.to_string())
    }
}

struct DeepSeekProvider;

impl ApiCredentialProvider for DeepSeekProvider {
    type Key = DeepSeekApiKey;

    const SLUG: &'static str = "deepseek";
    const DISPLAY_NAME: &'static str = "DeepSeek";
    const ENVIRONMENT_VARIABLE: &'static str = "DEEPSEEK_API_KEY";
    const KEYCHAIN_SERVICE: &'static str = DEEPSEEK_KEYCHAIN_SERVICE;
    const KEYCHAIN_ACCOUNT: &'static str = DEEPSEEK_KEYCHAIN_ACCOUNT;

    fn parse(secret: String) -> Result<Self::Key, String> {
        DeepSeekApiKey::parse(secret).map_err(|error| error.to_string())
    }

    fn expose_secret(key: &Self::Key) -> &str {
        key.expose_secret()
    }

    fn verify(key: &Self::Key) -> Result<Option<String>, String> {
        DeepSeekCredentialVerifier::default()
            .verify(key)
            .map(|verification| verification.request_id)
            .map_err(|error| error.to_string())
    }
}

fn api_key<P: ApiCredentialProvider>() -> Result<P::Key, String> {
    if let Ok(secret) = env::var(P::ENVIRONMENT_VARIABLE) {
        return P::parse(secret);
    }
    let secret = load_secret(P::KEYCHAIN_SERVICE, P::KEYCHAIN_ACCOUNT)?.ok_or_else(|| {
        format!(
            "{} API key is not configured; set {} or run `silan credentials {} set`",
            P::DISPLAY_NAME,
            P::ENVIRONMENT_VARIABLE,
            P::SLUG,
        )
    })?;
    P::parse(secret)
}

fn set<P: ApiCredentialProvider>() -> Result<(), String> {
    let secret = rpassword::prompt_password(format!("{} API Key: ", P::DISPLAY_NAME))
        .map_err(|error| format!("could not read API key: {error}"))?;
    let key = P::parse(secret)?;

    println!("Verifying {} API key...", P::DISPLAY_NAME);
    let request_id = P::verify(&key)?;
    store_secret(
        P::KEYCHAIN_SERVICE,
        P::KEYCHAIN_ACCOUNT,
        P::expose_secret(&key),
    )?;

    println!(
        "{} API key verified and stored in macOS Keychain.",
        P::DISPLAY_NAME
    );
    if let Some(request_id) = request_id {
        println!("request_id={request_id}");
    }
    Ok(())
}

fn status<P: ApiCredentialProvider>() -> Result<(), String> {
    if env::var(P::ENVIRONMENT_VARIABLE).is_ok() {
        println!(
            "{} API key: configured in {}",
            P::DISPLAY_NAME,
            P::ENVIRONMENT_VARIABLE
        );
        return Ok(());
    }
    match load_secret(P::KEYCHAIN_SERVICE, P::KEYCHAIN_ACCOUNT)? {
        Some(_) => println!("{} API key: configured in macOS Keychain", P::DISPLAY_NAME),
        None => println!("{} API key: not configured", P::DISPLAY_NAME),
    }
    Ok(())
}

fn test<P: ApiCredentialProvider>() -> Result<(), String> {
    let key = api_key::<P>()?;
    let request_id = P::verify(&key)?;
    println!("{} API key is valid.", P::DISPLAY_NAME);
    if let Some(request_id) = request_id {
        println!("request_id={request_id}");
    }
    Ok(())
}

fn remove<P: ApiCredentialProvider>() -> Result<(), String> {
    if remove_secret(P::KEYCHAIN_SERVICE, P::KEYCHAIN_ACCOUNT)? {
        println!("{} API key removed from macOS Keychain.", P::DISPLAY_NAME);
    } else {
        println!("{} API key was not configured.", P::DISPLAY_NAME);
    }
    Ok(())
}

pub fn openai_api_key() -> Result<OpenAiApiKey, String> {
    use silan_viking_app::ai_engine::{
        configured_profile, AiCapability, AiProvider, KEYCHAIN_SERVICE,
    };
    if let Some(profile) = configured_profile(AiCapability::Image)? {
        let key = if let Some(id) = &profile.credential_id {
            load_secret(KEYCHAIN_SERVICE, id)?.ok_or("AI API key is missing")?
        } else if profile.provider == AiProvider::Ollama {
            "ollama".into()
        } else {
            return Err("AI API key is missing".into());
        };
        return OpenAiApiKey::for_engine(key, profile).map_err(|e| e.to_string());
    }
    api_key::<OpenAiProvider>()
}

pub fn openai_set() -> Result<(), String> {
    set::<OpenAiProvider>()
}

pub fn openai_status() -> Result<(), String> {
    status::<OpenAiProvider>()
}

pub fn openai_test() -> Result<(), String> {
    test::<OpenAiProvider>()
}

pub fn openai_remove() -> Result<(), String> {
    remove::<OpenAiProvider>()
}

pub fn deepseek_set() -> Result<(), String> {
    set::<DeepSeekProvider>()
}

pub fn deepseek_api_key() -> Result<DeepSeekApiKey, String> {
    use silan_viking_app::ai_engine::{
        configured_profile, AiCapability, AiProvider, KEYCHAIN_SERVICE,
    };
    if let Some(profile) = configured_profile(AiCapability::Text)? {
        let key = if let Some(id) = &profile.credential_id {
            load_secret(KEYCHAIN_SERVICE, id)?.ok_or("AI API key is missing")?
        } else if profile.provider == AiProvider::Ollama {
            "ollama".into()
        } else {
            return Err("AI API key is missing".into());
        };
        return DeepSeekApiKey::for_engine(key, profile).map_err(|e| e.to_string());
    }
    api_key::<DeepSeekProvider>()
}

pub fn deepseek_status() -> Result<(), String> {
    status::<DeepSeekProvider>()
}

pub fn deepseek_test() -> Result<(), String> {
    test::<DeepSeekProvider>()
}

pub fn deepseek_remove() -> Result<(), String> {
    remove::<DeepSeekProvider>()
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
