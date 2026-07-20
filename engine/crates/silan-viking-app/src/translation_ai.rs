//! AI-backed Markdown translation.
//!
//! The generated text is only a draft. Source ownership and persistence stay
//! in [`crate::workspace_content`]; this module owns the OpenAI request and
//! response contract.

use crate::OpenAiApiKey;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.openai.com";
const DEFAULT_MODEL: &str = "gpt-5";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownTranslationRequest {
    pub source_language: String,
    pub target_language: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct GeneratedMarkdownTranslation {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Error)]
pub enum OpenAiTranslationError {
    #[error("cannot translate empty Markdown content")]
    EmptySource,
    #[error("OpenAI translation request failed ({status}): {message}")]
    Rejected { status: u16, message: String },
    #[error("could not reach OpenAI for translation: {0}")]
    Unavailable(String),
    #[error("OpenAI returned an invalid translation response: {0}")]
    InvalidResponse(String),
}

pub struct OpenAiMarkdownTranslator {
    api_base: String,
    model: String,
}

impl Default for OpenAiMarkdownTranslator {
    fn default() -> Self {
        Self::new(DEFAULT_API_BASE, DEFAULT_MODEL)
    }
}

impl OpenAiMarkdownTranslator {
    pub fn new(api_base: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_base: api_base.into().trim_end_matches('/').to_owned(),
            model: model.into(),
        }
    }

    pub fn translate(
        &self,
        api_key: &OpenAiApiKey,
        input: &MarkdownTranslationRequest,
    ) -> Result<GeneratedMarkdownTranslation, OpenAiTranslationError> {
        if input.body.trim().is_empty() {
            return Err(OpenAiTranslationError::EmptySource);
        }

        let url = format!("{}/v1/responses", self.api_base);
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(6))
            .timeout_read(Duration::from_secs(90))
            .timeout_write(Duration::from_secs(10))
            .build();
        let user_prompt = translation_user_prompt(input);
        let payload = ResponsesRequest {
            model: self.model.as_str(),
            input: vec![
                ResponseInputMessage {
                    role: "system",
                    content: TRANSLATION_SYSTEM_PROMPT,
                },
                ResponseInputMessage {
                    role: "user",
                    content: &user_prompt,
                },
            ],
        };

        let value: Value = match agent
            .post(&url)
            .set(
                "Authorization",
                &format!("Bearer {}", api_key.expose_secret()),
            )
            .send_json(
                serde_json::to_value(payload)
                    .map_err(|error| OpenAiTranslationError::InvalidResponse(error.to_string()))?,
            ) {
            Ok(response) => response
                .into_json()
                .map_err(|error| OpenAiTranslationError::InvalidResponse(error.to_string()))?,
            Err(ureq::Error::Status(status, response)) => {
                let message = response
                    .into_json::<ApiErrorEnvelope>()
                    .ok()
                    .map(|body| body.error.message)
                    .filter(|message| !message.trim().is_empty())
                    .unwrap_or_else(|| "translation request failed".to_owned());
                return Err(OpenAiTranslationError::Rejected { status, message });
            }
            Err(ureq::Error::Transport(error)) => {
                return Err(OpenAiTranslationError::Unavailable(error.to_string()));
            }
        };

        let output_text = extract_output_text(&value).ok_or_else(|| {
            OpenAiTranslationError::InvalidResponse("missing output text".to_owned())
        })?;
        let generated: GeneratedMarkdownTranslation =
            serde_json::from_str(&json_only(&output_text))
                .map_err(|error| OpenAiTranslationError::InvalidResponse(error.to_string()))?;
        if generated.title.trim().is_empty() || generated.body.trim().is_empty() {
            return Err(OpenAiTranslationError::InvalidResponse(
                "generated title or body was empty".to_owned(),
            ));
        }
        Ok(GeneratedMarkdownTranslation {
            title: generated.title.trim().to_owned(),
            body: generated.body.trim().to_owned(),
        })
    }
}

#[derive(Serialize)]
struct ResponsesRequest<'a> {
    model: &'a str,
    input: Vec<ResponseInputMessage<'a>>,
}

#[derive(Serialize)]
struct ResponseInputMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    message: String,
}

const TRANSLATION_SYSTEM_PROMPT: &str = r#"You translate personal website Markdown.
Return exactly one JSON object with string fields "title" and "body".
Do not include YAML frontmatter.
Preserve Markdown structure, headings, links, images, code fences, inline code, lists, and technical terms.
Translate natural language into the target language while keeping product names, protocol names, file paths, identifiers, and code unchanged.
Do not summarize, expand, remove, or add claims."#;

fn translation_user_prompt(input: &MarkdownTranslationRequest) -> String {
    format!(
        "Source language: {}\nTarget language: {}\nTitle:\n{}\n\nMarkdown body:\n```markdown\n{}\n```",
        input.source_language.trim(),
        input.target_language.trim(),
        input.title.trim(),
        input.body.trim()
    )
}

fn extract_output_text(value: &Value) -> Option<String> {
    value
        .get("output_text")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| {
            value
                .get("output")?
                .as_array()?
                .iter()
                .flat_map(|item| {
                    item.get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .find_map(|content| {
                    content
                        .get("text")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
        })
}

fn json_only(text: &str) -> String {
    let trimmed = text.trim();
    if let Some(stripped) = trimmed.strip_prefix("```json") {
        return stripped.trim().trim_end_matches("```").trim().to_owned();
    }
    if let Some(stripped) = trimmed.strip_prefix("```") {
        return stripped.trim().trim_end_matches("```").trim().to_owned();
    }
    trimmed.to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_responses_output_text() {
        let value = serde_json::json!({
            "output": [{
                "type": "message",
                "content": [{
                    "type": "output_text",
                    "text": "{\"title\":\"你好\",\"body\":\"正文\"}"
                }]
            }]
        });

        assert_eq!(
            extract_output_text(&value).as_deref(),
            Some("{\"title\":\"你好\",\"body\":\"正文\"}")
        );
    }
}
