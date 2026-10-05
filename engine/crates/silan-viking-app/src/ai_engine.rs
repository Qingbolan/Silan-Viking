//! Device-wide AI routing. Source repositories never contain credentials.
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::Duration};

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
/// Minimal common Chat Completions contract; no provider-specific thinking fields.
pub fn chat_completion(
    profile: &AiEngineProfile,
    secret: &str,
    system: &str,
    user: &str,
    schema: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let mut payload = serde_json::json!({"model":profile.model,"messages":[{"role":"system","content":system},{"role":"user","content":user}],"stream":false});
    if let Some(schema) = schema {
        payload["response_format"] = serde_json::json!({"type":"json_schema","json_schema":{"name":"result","strict":true,"schema":schema}});
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(8))
        .timeout_read(Duration::from_secs(180))
        .timeout_write(Duration::from_secs(30))
        .redirects(0)
        .build();
    let mut request = agent.post(&profile.endpoint("chat/completions"));
    if !secret.is_empty() {
        request = request.set("Authorization", &format!("Bearer {secret}"));
    }
    match request.send_json(payload) {
        Ok(r) => r
            .into_json()
            .map_err(|_| "AI returned invalid JSON.".into()),
        Err(ureq::Error::Status(status, _)) => Err(format!(
            "AI request rejected (HTTP {status}). Check endpoint, model and access."
        )),
        Err(ureq::Error::Transport(_)) => {
            Err("Could not connect to the configured AI service.".into())
        }
    }
}
pub fn completion_text(response: &serde_json::Value) -> Result<&str, String> {
    let choice = &response["choices"][0];
    if choice["finish_reason"].as_str() != Some("stop") {
        return Err("AI response was incomplete.".into());
    }
    choice["message"]["content"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| "AI response contained no text.".into())
}

pub fn test_connection(
    profile: &AiEngineProfile,
    secret: &str,
    capability: AiCapability,
) -> Result<(), String> {
    if capability == AiCapability::Text {
        let response = chat_completion(profile, secret, "Reply with OK.", "Connection test", None)?;
        completion_text(&response)?;
    } else {
        let response = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(20))
            .redirects(0)
            .build()
            .get(&profile.endpoint("models"))
            .set("Authorization", &format!("Bearer {secret}"))
            .call()
            .map_err(|_| "Could not access model list. Check the API URL and key.")?;
        let body: serde_json::Value = response.into_json().map_err(|_| "Invalid model list")?;
        if !body["data"].as_array().is_some_and(|models| {
            models
                .iter()
                .any(|m| m["id"].as_str() == Some(profile.model.as_str()))
        }) {
            return Err("The selected model is not in the provider's model list.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    fn profile(base_url: String) -> AiEngineProfile {
        AiEngineProfile {
            provider: AiProvider::OpenaiCompatible,
            base_url,
            model: "chosen-model".into(),
            credential_id: None,
        }
    }

    fn server(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}/v1", listener.local_addr().unwrap());
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        let task = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let n = stream.read(&mut buffer).unwrap();
                if n == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]);
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if bytes.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            stream.write_all(response.as_bytes()).unwrap();
            String::from_utf8(bytes).unwrap()
        });
        (address, task)
    }

    #[test]
    fn routes_chat_with_selected_model_and_schema() {
        let (url, request) = server(
            "200 OK",
            r#"{"choices":[{"finish_reason":"stop","message":{"content":"OK"}}]}"#,
        );
        let result = chat_completion(
            &profile(url),
            "test-secret",
            "system",
            "hello",
            Some(serde_json::json!({"type":"object"})),
        )
        .unwrap();
        assert_eq!(completion_text(&result).unwrap(), "OK");
        let request = request.join().unwrap();
        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(request.contains("Bearer test-secret"));
        let payload: serde_json::Value =
            serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(payload["model"], "chosen-model");
        assert_eq!(payload["response_format"]["type"], "json_schema");
        assert!(payload.get("thinking").is_none());
    }

    #[test]
    fn rejects_invalid_config_and_unsupported_capabilities() {
        for url in [
            "file:///tmp/model",
            "https://secret@example.com/v1",
            "https://example.com/v1?key=secret",
        ] {
            assert!(profile(url.into()).validate(AiCapability::Text).is_err());
        }
        let mut local = profile("http://localhost:11434/v1".into());
        local.provider = AiProvider::Ollama;
        assert!(local.validate(AiCapability::Text).is_ok());
        assert!(local.validate(AiCapability::Image).is_err());
        assert!(AiEngineSettings {
            version: 99,
            ..Default::default()
        }
        .validate()
        .is_err());
    }

    #[test]
    fn rejects_truncated_output_and_does_not_echo_remote_secrets() {
        assert!(completion_text(&serde_json::json!({"choices":[{"finish_reason":"length","message":{"content":"partial"}}]})).is_err());
        let (url, request) = server("401 Unauthorized", "test-secret private provider detail");
        let error =
            chat_completion(&profile(url), "test-secret", "system", "hello", None).unwrap_err();
        request.join().unwrap();
        assert!(error.contains("401"));
        assert!(!error.contains("test-secret"));
        assert!(!error.contains("private provider detail"));
    }

    #[test]
    fn verifies_media_model_without_generating_content() {
        let (url, request) = server("200 OK", r#"{"data":[{"id":"chosen-model"}]}"#);
        test_connection(&profile(url), "test-secret", AiCapability::Image).unwrap();
        assert!(request
            .join()
            .unwrap()
            .starts_with("GET /v1/models HTTP/1.1"));
    }
}
