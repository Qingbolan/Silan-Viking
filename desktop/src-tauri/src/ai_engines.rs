//! Device credential adapter for shared engine routing.
use crate::{
    credential_store, deepseek_credentials::DesktopDeepSeekCredentials,
    openai_credentials::DesktopOpenAiCredentials,
};
use serde::{Deserialize, Serialize};
use silan_viking_app::{
    ai_engine::{self, AiCapability, AiEngineProfile, AiEngineSettings, AiProvider},
    DeepSeekApiKey, OpenAiApiKey,
};
use std::sync::Mutex;
static CONFIG_WRITE: Mutex<()> = Mutex::new(());
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveAiEngineInput {
    pub capability: AiCapability,
    pub profile: Option<AiEngineProfile>,
    pub api_key: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AiEngineStatus {
    pub settings: AiEngineSettings,
    pub configured: bool,
}
pub(crate) fn status() -> Result<AiEngineStatus, String> {
    let settings = AiEngineSettings::load()?;
    Ok(AiEngineStatus {
        configured: settings.is_some(),
        settings: settings.unwrap_or_default(),
    })
}
fn profile_secret(profile: &AiEngineProfile) -> Result<String, String> {
    if let Some(id) = &profile.credential_id {
        credential_store::load_secret("AI engine", ai_engine::KEYCHAIN_SERVICE, id)?.ok_or_else(
            || "The configured API key is missing. Save it again in AI engine settings.".into(),
        )
    } else if profile.provider == AiProvider::Ollama {
        Ok("ollama".into())
    } else {
        Err("Enter an API key for this service.".into())
    }
}
pub(crate) fn save(mut input: SaveAiEngineInput) -> Result<AiEngineStatus, String> {
    let _guard = CONFIG_WRITE
        .lock()
        .map_err(|_| "AI settings lock unavailable")?;
    let mut settings = AiEngineSettings::load()?.unwrap_or_default();
    let previous = settings.profile(input.capability).cloned();
    let mut new_secret_id = None;
    if let Some(profile) = &mut input.profile {
        profile.base_url = profile.base_url.trim().trim_end_matches('/').into();
        profile.model = profile.model.trim().into();
        profile.validate(input.capability)?;
        // A key is bound to an endpoint. Editing the destination never forwards
        // an existing credential to a different server.
        profile.credential_id = previous
            .as_ref()
            .filter(|old| old.base_url == profile.base_url && old.provider == profile.provider)
            .and_then(|old| old.credential_id.clone());
        if let Some(secret) = input.api_key.filter(|s| !s.trim().is_empty()) {
            let secret = OpenAiApiKey::for_compatible_service(secret).map_err(|e| e.to_string())?;
            let id = format!(
                "{}-{}",
                input.capability.as_str(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos()
            );
            credential_store::store_secret(
                "AI engine",
                ai_engine::KEYCHAIN_SERVICE,
                &id,
                secret.expose_secret(),
            )?;
            profile.credential_id = Some(id.clone());
            new_secret_id = Some(id);
        }
        if profile.provider == AiProvider::OpenaiCompatible && profile.credential_id.is_none() {
            return Err("Enter an API key when configuring a new endpoint.".into());
        }
    }
    settings.set_profile(input.capability, input.profile.clone());
    if let Err(error) = settings.save() {
        if let Some(id) = new_secret_id {
            let _ = credential_store::remove_secret("AI engine", ai_engine::KEYCHAIN_SERVICE, &id);
        }
        return Err(error);
    }
    if let Some(id) = previous.and_then(|p| p.credential_id) {
        if input
            .profile
            .as_ref()
            .and_then(|p| p.credential_id.as_ref())
            != Some(&id)
        {
            let _ = credential_store::remove_secret("AI engine", ai_engine::KEYCHAIN_SERVICE, &id);
        }
    }
    status()
}
pub(crate) fn test(capability: AiCapability) -> Result<String, String> {
    let profile =
        ai_engine::configured_profile(capability)?.ok_or("Configure an AI engine first.")?;
    let secret = profile_secret(&profile)?;
    ai_engine::test_connection(&profile, &secret, capability)?;
    Ok("连接成功".into())
}
pub(crate) fn openai_key(capability: AiCapability) -> Result<OpenAiApiKey, String> {
    match ai_engine::configured_profile(capability)? {
        Some(profile) => {
            OpenAiApiKey::for_engine(profile_secret(&profile)?, profile).map_err(|e| e.to_string())
        }
        None => DesktopOpenAiCredentials::load_key(),
    }
}
pub(crate) fn text_key() -> Result<DeepSeekApiKey, String> {
    match ai_engine::configured_profile(AiCapability::Text)? {
        Some(profile) => DeepSeekApiKey::for_engine(profile_secret(&profile)?, profile)
            .map_err(|e| e.to_string()),
        None => DesktopDeepSeekCredentials::load_key(),
    }
}
