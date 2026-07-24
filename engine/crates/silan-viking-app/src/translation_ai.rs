//! AI-backed Markdown translation.
//!
//! The generated text is only a draft. Source ownership and persistence stay
//! in [`crate::workspace_content`]; this module owns the OpenAI request and
//! response contract.

use crate::OpenAiApiKey;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::time::Duration;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.openai.com";
pub const DEFAULT_OPENAI_TRANSLATION_MODEL: &str = "gpt-5-nano";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownTranslationRequest {
    pub source_language: String,
    pub target_language: String,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownTranslationSyncRequest {
    pub source_language: String,
    pub target_language: String,
    pub title: String,
    pub source_body: String,
    pub existing_target_body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct GeneratedMarkdownTranslation {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SyncedMarkdownTranslation {
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
        Self::from_environment()
    }
}

impl OpenAiMarkdownTranslator {
    pub fn from_environment() -> Self {
        let model = env::var("SILAN_OPENAI_TRANSLATION_MODEL")
            .unwrap_or_else(|_| DEFAULT_OPENAI_TRANSLATION_MODEL.to_owned());
        Self::new(DEFAULT_API_BASE, model)
    }

    pub fn new(api_base: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_base: api_base.into().trim_end_matches('/').to_owned(),
            model: model.into(),
        }
    }

    pub fn model(&self) -> &str {
        &self.model
    }

    pub fn translate(
        &self,
        api_key: &OpenAiApiKey,
        input: &MarkdownTranslationRequest,
    ) -> Result<GeneratedMarkdownTranslation, OpenAiTranslationError> {
        if input.body.trim().is_empty() {
            return Err(OpenAiTranslationError::EmptySource);
        }

        let user_prompt = translation_user_prompt(input);
        let generated: GeneratedMarkdownTranslation = self.request_structured(
            api_key,
            TRANSLATION_SYSTEM_PROMPT,
            &user_prompt,
            structured_translation_output(),
        )?;
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

    pub fn sync_existing(
        &self,
        api_key: &OpenAiApiKey,
        input: &MarkdownTranslationSyncRequest,
    ) -> Result<SyncedMarkdownTranslation, OpenAiTranslationError> {
        if input.source_body.trim().is_empty() || input.existing_target_body.trim().is_empty() {
            return Err(OpenAiTranslationError::EmptySource);
        }

        let user_prompt = translation_sync_user_prompt(input);
        let generated: SyncedMarkdownTranslation = self.request_structured(
            api_key,
            TRANSLATION_SYNC_SYSTEM_PROMPT,
            &user_prompt,
            structured_translation_sync_output(),
        )?;
        if generated.body.trim().is_empty() {
            return Err(OpenAiTranslationError::InvalidResponse(
                "synced body was empty".to_owned(),
            ));
        }
        Ok(SyncedMarkdownTranslation {
            body: generated.body.trim().to_owned(),
        })
    }

    fn request_structured<T: DeserializeOwned>(
        &self,
        api_key: &OpenAiApiKey,
        system_prompt: &str,
        user_prompt: &str,
        text: TextConfig<'static>,
    ) -> Result<T, OpenAiTranslationError> {
        let url = format!("{}/v1/responses", self.api_base);
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(6))
            .timeout_read(Duration::from_secs(90))
            .timeout_write(Duration::from_secs(10))
            .build();
        let payload = ResponsesRequest {
            model: self.model.as_str(),
            reasoning: ReasoningConfig { effort: "minimal" },
            text,
            input: vec![
                ResponseInputMessage {
                    role: "system",
                    content: system_prompt,
                },
                ResponseInputMessage {
                    role: "user",
                    content: user_prompt,
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
        serde_json::from_str(output_text.trim())
            .map_err(|error| OpenAiTranslationError::InvalidResponse(error.to_string()))
    }
}

#[derive(Serialize)]
struct ResponsesRequest<'a> {
    model: &'a str,
    reasoning: ReasoningConfig<'a>,
    text: TextConfig<'a>,
    input: Vec<ResponseInputMessage<'a>>,
}

#[derive(Serialize)]
struct ReasoningConfig<'a> {
    effort: &'a str,
}

#[derive(Serialize)]
struct TextConfig<'a> {
    format: JsonSchemaFormat<'a>,
}

#[derive(Serialize)]
struct JsonSchemaFormat<'a> {
    r#type: &'a str,
    name: &'a str,
    strict: bool,
    schema: Value,
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
Do not include YAML frontmatter.
Preserve Markdown structure, headings, links, images, code fences, inline code, lists, and technical terms.
Translate natural language into the target language while keeping product names, protocol names, file paths, identifiers, and code unchanged.
Do not summarize, expand, remove, or add claims."#;

const TRANSLATION_SYNC_SYSTEM_PROMPT: &str = r#"You update an existing personal website Markdown translation.
The source Markdown is current. The target Markdown is an existing human-authored translation that may be stale.
Return the complete target-language Markdown body.
Change only target-language sentences, headings, captions, list items, and paragraphs whose meaning is missing or stale relative to the current source.
Preserve unchanged target wording, Markdown structure, links, images, code fences, inline code, tables, frontmatter absence, and technical terms.
Do not rewrite the whole article for style. Do not summarize, expand, remove, or add claims."#;

fn structured_translation_output() -> TextConfig<'static> {
    TextConfig {
        format: JsonSchemaFormat {
            r#type: "json_schema",
            name: "markdown_translation",
            strict: true,
            schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "body": { "type": "string" }
                },
                "required": ["title", "body"],
                "additionalProperties": false
            }),
        },
    }
}

fn structured_translation_sync_output() -> TextConfig<'static> {
    TextConfig {
        format: JsonSchemaFormat {
            r#type: "json_schema",
            name: "markdown_translation_sync",
            strict: true,
            schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "body": { "type": "string" }
                },
                "required": ["body"],
                "additionalProperties": false
            }),
        },
    }
}

fn translation_user_prompt(input: &MarkdownTranslationRequest) -> String {
    format!(
        "Source language: {}\nTarget language: {}\nTitle:\n{}\n\nMarkdown body:\n```markdown\n{}\n```",
        input.source_language.trim(),
        input.target_language.trim(),
        input.title.trim(),
        input.body.trim()
    )
}

fn translation_sync_user_prompt(input: &MarkdownTranslationSyncRequest) -> String {
    format!(
        "Source language: {}\nTarget language: {}\nDocument title:\n{}\n\nCurrent source Markdown:\n```markdown\n{}\n```\n\nExisting target Markdown to update in place:\n```markdown\n{}\n```",
        input.source_language.trim(),
        input.target_language.trim(),
        input.title.trim(),
        input.source_body.trim(),
        input.existing_target_body.trim(),
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

    #[test]
    fn requests_strict_structured_translation_output() {
        let payload = ResponsesRequest {
            model: DEFAULT_OPENAI_TRANSLATION_MODEL,
            reasoning: ReasoningConfig { effort: "minimal" },
            text: structured_translation_output(),
            input: vec![ResponseInputMessage {
                role: "user",
                content: "translate",
            }],
        };
        let value = serde_json::to_value(payload).expect("serializable request");

        assert_eq!(
            value["text"]["format"]["type"],
            serde_json::json!("json_schema")
        );
        assert_eq!(value["text"]["format"]["strict"], serde_json::json!(true));
        assert_eq!(
            value["text"]["format"]["schema"]["additionalProperties"],
            serde_json::json!(false)
        );
        assert_eq!(value["reasoning"]["effort"], serde_json::json!("minimal"));
    }

    #[test]
    fn sync_output_returns_body_only() {
        let text = structured_translation_sync_output();
        assert_eq!(text.format.name, "markdown_translation_sync");
        assert_eq!(text.format.schema["required"], serde_json::json!(["body"]));
        assert_eq!(
            text.format.schema["properties"].as_object().unwrap().len(),
            1
        );
    }

    #[test]
    fn sync_prompt_includes_current_source_and_existing_target() {
        let prompt = translation_sync_user_prompt(&MarkdownTranslationSyncRequest {
            source_language: "en".to_owned(),
            target_language: "zh".to_owned(),
            title: "A title".to_owned(),
            source_body: "# A title\n\nChanged sentence.".to_owned(),
            existing_target_body: "# 一个标题\n\n旧句子。".to_owned(),
        });

        assert!(prompt.contains("Current source Markdown"));
        assert!(prompt.contains("Existing target Markdown"));
        assert!(prompt.contains("Changed sentence."));
        assert!(prompt.contains("旧句子。"));
    }
}
