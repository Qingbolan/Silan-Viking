//! Common configured AI wire contracts. Provider-specific payloads stay in their use cases.
use super::transport::{AiClientFactory, TransportPolicy};
use super::{AiCapability, AiEngineProfile};

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
    let agent = AiClientFactory::shared().agent(TransportPolicy::Chat);
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
        let response = AiClientFactory::shared()
            .agent(TransportPolicy::ModelProbe)
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
