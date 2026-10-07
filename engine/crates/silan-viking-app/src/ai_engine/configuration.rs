//! Device-wide AI routing. Source repositories never contain credentials.
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

pub const KEYCHAIN_SERVICE: &str = "silan-viking.ai-engines";
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiCapability {
    Text,
    Image,
    Speech,
}
impl AiCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Image => "image",
            Self::Speech => "speech",
        }
    }
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    OpenaiCompatible,
    Ollama,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEngineProfile {
    pub provider: AiProvider,
    pub base_url: String,
    pub model: String,
    /// Random immutable credential reference, assigned by the persistence adapter.
    #[serde(default)]
    pub credential_id: Option<String>,
}
impl AiEngineProfile {
    pub fn validate(&self, capability: AiCapability) -> Result<(), String> {
        let url = url::Url::parse(&self.base_url)
            .map_err(|_| "Enter a valid API base URL.".to_owned())?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("Use an HTTP(S) API URL without credentials, query or fragment.".into());
        }
        if self.model.trim().is_empty() {
            return Err("Enter a model name.".into());
        }
        if self.provider == AiProvider::Ollama && capability != AiCapability::Text {
            return Err("Ollama is available for text tasks; configure an OpenAI-compatible image or speech service separately.".into());
        }
        Ok(())
    }
    pub fn endpoint(&self, route: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            route.trim_start_matches('/')
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiEngineSettings {
    pub version: u32,
    pub text: Option<AiEngineProfile>,
    pub image: Option<AiEngineProfile>,
    pub speech: Option<AiEngineProfile>,
}
impl Default for AiEngineSettings {
    fn default() -> Self {
        Self {
            version: 1,
            text: None,
            image: None,
            speech: None,
        }
    }
}
impl AiEngineSettings {
    pub fn path() -> Result<PathBuf, String> {
        let root = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
            .ok_or("Cannot locate device configuration directory.")?;
        Ok(root.join("silan-viking/ai-engines.json"))
    }
    pub fn load() -> Result<Option<Self>, String> {
        let path = Self::path()?;
        match fs::read(&path) {
            Ok(bytes) => {
                let value: Self = serde_json::from_slice(&bytes)
                    .map_err(|e| format!("Invalid AI configuration: {e}"))?;
                value.validate()?;
                Ok(Some(value))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn profile(&self, capability: AiCapability) -> Option<&AiEngineProfile> {
        match capability {
            AiCapability::Text => self.text.as_ref(),
            AiCapability::Image => self.image.as_ref(),
            AiCapability::Speech => self.speech.as_ref(),
        }
    }
    pub fn set_profile(&mut self, capability: AiCapability, profile: Option<AiEngineProfile>) {
        *match capability {
            AiCapability::Text => &mut self.text,
            AiCapability::Image => &mut self.image,
            AiCapability::Speech => &mut self.speech,
        } = profile;
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("Unsupported AI configuration version.".into());
        }
        for capability in [
            AiCapability::Text,
            AiCapability::Image,
            AiCapability::Speech,
        ] {
            if let Some(p) = self.profile(capability) {
                p.validate(capability)?;
            }
        }
        Ok(())
    }
    pub fn save(&self) -> Result<(), String> {
        self.validate()?;
        let path = Self::path()?;
        let parent = path.parent().ok_or("Missing AI config directory")?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        let mut staged = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        use std::io::Write;
        staged
            .write_all(&serde_json::to_vec_pretty(self).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        staged.persist(path).map_err(|e| e.to_string())?;
        Ok(())
    }
}
/// Absence means the existing provider-specific public defaults have not been
/// migrated yet. Once saved, an absent capability is explicitly disabled.
pub fn configured_profile(capability: AiCapability) -> Result<Option<AiEngineProfile>, String> {
    match AiEngineSettings::load()? {
        None => Ok(None),
        Some(settings) => settings
            .profile(capability)
            .cloned()
            .map(Some)
            .ok_or_else(|| {
                format!(
                    "AI {} is not configured. Open AI engine settings.",
                    capability.as_str()
                )
            }),
    }
}
