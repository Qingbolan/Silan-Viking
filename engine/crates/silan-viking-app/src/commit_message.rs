//! DeepSeek-backed commit message generation for staged workspace changes.
//!
//! This use-case owns the LLM request contract only. Git state ownership stays
//! in `delivery_control`, so generated text is always derived from the same
//! staged index that `commit_workspace` later commits.

use crate::DeepSeekApiKey;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.deepseek.com";
pub const DEFAULT_DEEPSEEK_COMMIT_MESSAGE_MODEL: &str = "deepseek-chat";
pub const DEEPSEEK_COMMIT_MESSAGE_MODEL_ENV: &str = "SILAN_DEEPSEEK_COMMIT_MESSAGE_MODEL";

const COMMIT_MESSAGE_SYSTEM_PROMPT: &str = "\
You write concise Git commit messages for Silan's personal website/content system.
Return one message only.
Use imperative mood.
Prefer a single subject line under 72 characters.
Add a short body only when the staged diff has multiple independent concerns.
Do not use Markdown fences, bullets, quotes, prefixes like 'Commit message:', or explanations.";

#[derive(Debug, Error)]
pub enum DeepSeekCommitMessageError {
    #[error("no staged diff is available for commit message generation")]
    EmptyDiff,
    #[error("DeepSeek commit message request failed ({status}): {message}")]
    Rejected { status: u16, message: String },
    #[error("could not reach DeepSeek for commit message generation: {0}")]
    Unavailable(String),
    #[error("DeepSeek returned an invalid commit message response: {0}")]
    InvalidResponse(String),
}

pub struct DeepSeekCommitMessageGenerator {
    engine: Option<crate::ai_engine::AiEngineProfile>,
    api_base: String,
    model: String,
}

impl Default for DeepSeekCommitMessageGenerator {
    fn default() -> Self {
        Self::for_model(
            std::env::var(DEEPSEEK_COMMIT_MESSAGE_MODEL_ENV)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_DEEPSEEK_COMMIT_MESSAGE_MODEL.to_owned()),
        )
    }
}

impl DeepSeekCommitMessageGenerator {
    pub fn configured() -> Result<Self, String> {
        let mut client = Self {
            engine: crate::ai_engine::configured_profile(crate::ai_engine::AiCapability::Text)?,
            ..Self::default()
        };
        if let Some(profile) = &client.engine {
            client.model = profile.model.clone();
        }
        Ok(client)
    }
    pub fn with_model(mut self, model: String) -> Self {
        self.model = model.clone();
        if let Some(profile) = &mut self.engine {
            profile.model = model;
        }
        self
    }

    pub fn for_model(model: impl Into<String>) -> Self {
        Self::new(DEFAULT_API_BASE, model)
    }

    pub fn new(api_base: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            engine: None,
            api_base: api_base.into().trim_end_matches('/').to_owned(),
            model: model.into(),
        }
    }

    pub fn generate(
        &self,
        api_key: &DeepSeekApiKey,
        staged_diff: &str,
    ) -> Result<String, DeepSeekCommitMessageError> {
        let staged_diff = staged_diff.trim();
        if staged_diff.is_empty() {
            return Err(DeepSeekCommitMessageError::EmptyDiff);
        }
        self.request_once(api_key, staged_diff)
            .and_then(validate_commit_message)
    }

    fn request_once(
        &self,
        api_key: &DeepSeekApiKey,
        staged_diff: &str,
    ) -> Result<String, DeepSeekCommitMessageError> {
        if let Some(profile) = api_key.engine().or(self.engine.as_ref()) {
            let response = crate::ai_engine::chat_completion(
                profile,
                api_key.expose_secret(),
                COMMIT_MESSAGE_SYSTEM_PROMPT,
                &commit_message_user_prompt(staged_diff),
                None,
            )
            .map_err(DeepSeekCommitMessageError::Unavailable)?;
            return crate::ai_engine::completion_text(&response)
                .map(str::to_owned)
                .map_err(DeepSeekCommitMessageError::InvalidResponse);
        }
        let url = format!("{}/chat/completions", self.api_base);
        let user_prompt = commit_message_user_prompt(staged_diff);
        let payload = ChatCompletionRequest {
            model: self.model.as_str(),
            messages: [
                ChatMessage {
                    role: "system",
                    content: COMMIT_MESSAGE_SYSTEM_PROMPT,
                },
                ChatMessage {
                    role: "user",
                    content: &user_prompt,
                },
            ],
            temperature: 0.2,
            max_tokens: 220,
            stream: false,
        };
        let payload = serde_json::to_value(payload)
            .map_err(|error| DeepSeekCommitMessageError::InvalidResponse(error.to_string()))?;
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(6))
            .timeout_read(Duration::from_secs(45))
            .timeout_write(Duration::from_secs(15))
            .build();

        let response: ChatCompletionResponse = match agent
            .post(&url)
            .set(
                "Authorization",
                &format!("Bearer {}", api_key.expose_secret()),
            )
            .send_json(payload)
        {
            Ok(response) => response
                .into_json()
                .map_err(|error| DeepSeekCommitMessageError::InvalidResponse(error.to_string()))?,
            Err(ureq::Error::Status(status, response)) => {
                let message = response
                    .into_json::<ApiErrorEnvelope>()
                    .ok()
                    .map(|body| body.error.message)
                    .filter(|message| !message.trim().is_empty())
                    .unwrap_or_else(|| "commit message generation failed".to_owned());
                return Err(DeepSeekCommitMessageError::Rejected { status, message });
            }
            Err(ureq::Error::Transport(error)) => {
                return Err(DeepSeekCommitMessageError::Unavailable(error.to_string()));
            }
        };

        let choice = response.choices.into_iter().next().ok_or_else(|| {
            DeepSeekCommitMessageError::InvalidResponse("missing completion choice".to_owned())
        })?;
        if choice.finish_reason != "stop" {
            return Err(DeepSeekCommitMessageError::InvalidResponse(format!(
                "completion stopped with `{}`",
                choice.finish_reason
            )));
        }
        choice
            .message
            .content
            .filter(|content| !content.trim().is_empty())
            .ok_or_else(|| {
                DeepSeekCommitMessageError::InvalidResponse(
                    "completion content was empty".to_owned(),
                )
            })
    }
}

fn commit_message_user_prompt(staged_diff: &str) -> String {
    format!(
        "Write the Git commit message for this staged diff.\n\
         The first line must be the subject used with `git commit -m`.\n\
         Include only user-authored changes represented in the diff.\n\
         <staged-diff>\n{staged_diff}\n</staged-diff>"
    )
}

fn validate_commit_message(raw: String) -> Result<String, DeepSeekCommitMessageError> {
    let message = raw
        .trim()
        .trim_matches('"')
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n");
    let message = message.trim();
    if message.is_empty() {
        return Err(DeepSeekCommitMessageError::InvalidResponse(
            "generated commit message was empty".to_owned(),
        ));
    }
    if message.starts_with("```") || message.contains("\n```") {
        return Err(DeepSeekCommitMessageError::InvalidResponse(
            "generated commit message contained Markdown fences".to_owned(),
        ));
    }
    Ok(message.to_owned())
}

#[derive(Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: [ChatMessage<'a>; 2],
    temperature: f64,
    max_tokens: u32,
    stream: bool,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    finish_reason: String,
    message: AssistantMessage,
}

#[derive(Deserialize)]
struct AssistantMessage {
    content: Option<String>,
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
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn rejects_empty_staged_diff() {
        let key = DeepSeekApiKey::parse("provider-token").expect("valid key");
        let error = DeepSeekCommitMessageGenerator::new("http://127.0.0.1:1", "deepseek-chat")
            .generate(&key, "  ")
            .expect_err("empty diff rejected");
        assert!(matches!(error, DeepSeekCommitMessageError::EmptyDiff));
    }

    #[test]
    fn sends_staged_diff_to_chat_completions() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock server");
        let address = listener.local_addr().expect("mock server address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept request");
            let mut request = Vec::new();
            let mut chunk = [0_u8; 512];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let read = stream.read(&mut chunk).expect("read request");
                assert_ne!(read, 0, "request ended before headers");
                request.extend_from_slice(&chunk[..read]);
            }
            let headers = String::from_utf8_lossy(&request);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length: ")
                        .and_then(|value| value.trim().parse::<usize>().ok())
                })
                .expect("content length");
            let header_end = request
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .expect("header end")
                + 4;
            while request.len() - header_end < content_length {
                let read = stream.read(&mut chunk).expect("read body");
                assert_ne!(read, 0, "request ended before body");
                request.extend_from_slice(&chunk[..read]);
            }
            let request_text = String::from_utf8_lossy(&request);
            assert!(request_text.starts_with("POST /chat/completions HTTP/1.1\r\n"));
            assert!(
                request_text
                    .to_ascii_lowercase()
                    .contains("authorization: bearer provider-token\r\n"),
                "{request_text}"
            );
            assert!(request_text.contains("diff --git a/desktop/src/App.tsx"));

            let body = r#"{"choices":[{"finish_reason":"stop","message":{"content":"Add generated commit messages"}}]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
        });

        let key = DeepSeekApiKey::parse("provider-token").expect("valid key");
        let message =
            DeepSeekCommitMessageGenerator::new(format!("http://{address}"), "deepseek-chat")
                .generate(
                    &key,
                    "diff --git a/desktop/src/App.tsx b/desktop/src/App.tsx",
                )
                .expect("generated message");
        server.join().expect("mock server completed");
        assert_eq!(message, "Add generated commit messages");
    }
}
