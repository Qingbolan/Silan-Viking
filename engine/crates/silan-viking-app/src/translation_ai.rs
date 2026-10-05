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
    pub previous_source_body: Option<String>,
    pub source_body: String,
    pub existing_target_body: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MarkdownSelectionEditAction {
    AgentEdit,
    OptimizeExpression,
    CommentIssue,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownSelectionEditRequest {
    pub language: String,
    pub title: String,
    pub selected_text: String,
    pub before_context: String,
    pub after_context: String,
    pub instruction: Option<String>,
    pub action: MarkdownSelectionEditAction,
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

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct MarkdownSelectionEdit {
    pub replacement: String,
    pub comment: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct MarkdownSyncPatch {
    edits: Vec<MarkdownSyncEdit>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
struct MarkdownSyncEdit {
    target_before: String,
    target_after: String,
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
    #[error(
        "OpenAI returned {actual_language} Markdown while `{expected_language}` was requested"
    )]
    LanguageMismatch {
        expected_language: String,
        actual_language: String,
    },
    #[error("translation patch could not be applied: {0}")]
    PatchMismatch(String),
}

pub struct OpenAiMarkdownTranslator {
    engine: Option<crate::ai_engine::AiEngineProfile>,
    api_base: String,
    model: String,
}

impl Default for OpenAiMarkdownTranslator {
    fn default() -> Self {
        Self::from_environment()
    }
}

impl OpenAiMarkdownTranslator {
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

    pub fn from_environment() -> Self {
        let model = env::var("SILAN_OPENAI_TRANSLATION_MODEL")
            .unwrap_or_else(|_| DEFAULT_OPENAI_TRANSLATION_MODEL.to_owned());
        Self::new(DEFAULT_API_BASE, model)
    }

    pub fn new(api_base: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            engine: None,
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
        validate_markdown_language(&input.target_language, &generated.body)?;
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
        let patch: MarkdownSyncPatch = self.request_structured(
            api_key,
            TRANSLATION_SYNC_SYSTEM_PROMPT,
            &user_prompt,
            structured_translation_sync_output(),
        )?;
        let body = apply_sync_edits(&input.existing_target_body, &patch.edits)?;
        if body.trim().is_empty() {
            return Err(OpenAiTranslationError::InvalidResponse(
                "patched body was empty".to_owned(),
            ));
        }
        validate_markdown_language(&input.target_language, &body)?;
        Ok(SyncedMarkdownTranslation { body })
    }

    pub fn edit_selection(
        &self,
        api_key: &OpenAiApiKey,
        input: &MarkdownSelectionEditRequest,
    ) -> Result<MarkdownSelectionEdit, OpenAiTranslationError> {
        if input.selected_text.trim().is_empty() {
            return Err(OpenAiTranslationError::EmptySource);
        }

        let user_prompt = selection_edit_user_prompt(input);
        let edit: MarkdownSelectionEdit = self.request_structured(
            api_key,
            SELECTION_EDIT_SYSTEM_PROMPT,
            &user_prompt,
            structured_selection_edit_output(),
        )?;
        match input.action {
            MarkdownSelectionEditAction::CommentIssue => {
                if edit.comment.trim().is_empty() {
                    return Err(OpenAiTranslationError::InvalidResponse(
                        "selection comment was empty".to_owned(),
                    ));
                }
            }
            MarkdownSelectionEditAction::AgentEdit
            | MarkdownSelectionEditAction::OptimizeExpression => {
                if edit.replacement.trim().is_empty() {
                    return Err(OpenAiTranslationError::InvalidResponse(
                        "selection replacement was empty".to_owned(),
                    ));
                }
            }
        }
        Ok(MarkdownSelectionEdit {
            replacement: edit.replacement.trim().to_owned(),
            comment: edit.comment.trim().to_owned(),
        })
    }

    fn request_structured<T: DeserializeOwned>(
        &self,
        api_key: &OpenAiApiKey,
        system_prompt: &str,
        user_prompt: &str,
        text: TextConfig<'static>,
    ) -> Result<T, OpenAiTranslationError> {
        if let Some(profile) = api_key.engine().or(self.engine.as_ref()) {
            let response = crate::ai_engine::chat_completion(
                profile,
                api_key.expose_secret(),
                system_prompt,
                user_prompt,
                Some(text.format.schema),
            )
            .map_err(OpenAiTranslationError::Unavailable)?;
            let output = crate::ai_engine::completion_text(&response)
                .map_err(OpenAiTranslationError::InvalidResponse)?;
            return serde_json::from_str(output.trim())
                .map_err(|e| OpenAiTranslationError::InvalidResponse(e.to_string()));
        }
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
Do not copy source-language natural-language prose into the returned target-language body.
Do not summarize, expand, remove, or add claims."#;

const TRANSLATION_SYNC_SYSTEM_PROMPT: &str = r#"You update an existing personal website Markdown translation.
The source Markdown is current. The target Markdown is an existing human-authored translation that may be stale.
Return local edit operations only. Do not return the complete target-language Markdown body.
When previous source Markdown is provided, first identify source blocks that changed from previous source to current source, then update only the corresponding target-language blocks.
Change only target-language sentences, headings, captions, list items, and paragraphs whose meaning is missing or stale relative to the current source.
Preserve unchanged target wording, Markdown structure, links, images, code fences, inline code, tables, frontmatter absence, and technical terms.
Every natural-language sentence in `target_after` must be in the target language unless it is a name, quoted term, file path, code, or URL.
Each edit must contain `target_before`, an exact contiguous substring copied from the existing target Markdown, and `target_after`, the replacement target-language Markdown. Use the smallest stable Markdown block that can be edited safely. If no update is needed, return an empty edits array.
Do not rewrite the whole article for style. Do not summarize, expand, remove, or add claims."#;

const SELECTION_EDIT_SYSTEM_PROMPT: &str = r#"You are a local Markdown selection editor.
You must operate only on the selected text. Never return the full document. Never edit text outside the selection.
Use the before/after context only to preserve local meaning, references, tense, terminology, and tone.
For `agent_edit`, follow the user's instruction while preserving meaning and Markdown inline structure.
For `optimize_expression`, improve clarity, flow, grammar, and precision without adding claims.
For `comment_issue`, do not rewrite. Return a concise issue comment explaining what should be checked or improved.
Return JSON only."#;

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
                    "edits": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "target_before": { "type": "string" },
                                "target_after": { "type": "string" }
                            },
                            "required": ["target_before", "target_after"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["edits"],
                "additionalProperties": false
            }),
        },
    }
}

fn structured_selection_edit_output() -> TextConfig<'static> {
    TextConfig {
        format: JsonSchemaFormat {
            r#type: "json_schema",
            name: "markdown_selection_edit",
            strict: true,
            schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "replacement": { "type": "string" },
                    "comment": { "type": "string" }
                },
                "required": ["replacement", "comment"],
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

fn selection_action_label(action: &MarkdownSelectionEditAction) -> &'static str {
    match action {
        MarkdownSelectionEditAction::AgentEdit => "agent_edit",
        MarkdownSelectionEditAction::OptimizeExpression => "optimize_expression",
        MarkdownSelectionEditAction::CommentIssue => "comment_issue",
    }
}

fn selection_edit_user_prompt(input: &MarkdownSelectionEditRequest) -> String {
    let instruction = input
        .instruction
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("(none)");
    format!(
        "Action: {}\nLanguage: {}\nDocument title:\n{}\n\nUser instruction:\n{}\n\nBefore context, read-only:\n```markdown\n{}\n```\n\nSelected text, the only editable range:\n```markdown\n{}\n```\n\nAfter context, read-only:\n```markdown\n{}\n```\n\nReturn JSON only. For rewrite actions, put the local replacement in `replacement` and leave `comment` empty. For comment_issue, put the issue note in `comment` and leave `replacement` empty.",
        selection_action_label(&input.action),
        input.language.trim(),
        input.title.trim(),
        instruction,
        input.before_context.trim(),
        input.selected_text.trim(),
        input.after_context.trim(),
    )
}

fn translation_sync_user_prompt(input: &MarkdownTranslationSyncRequest) -> String {
    let previous_source = input
        .previous_source_body
        .as_deref()
        .map(str::trim)
        .filter(|body| !body.is_empty())
        .unwrap_or("(not provided)");
    format!(
        "Source language: {}\nTarget language: {}\nDocument title:\n{}\n\nPrevious source Markdown before this sync:\n```markdown\n{}\n```\n\nCurrent source Markdown:\n```markdown\n{}\n```\n\nExisting target Markdown to update with exact local edits:\n```markdown\n{}\n```\n\nReturn JSON only. For each edit, copy `target_before` exactly from the existing target Markdown and write `target_after` as the replacement. The application will reject edits whose `target_before` does not match exactly once.",
        input.source_language.trim(),
        input.target_language.trim(),
        input.title.trim(),
        previous_source,
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

fn apply_sync_edits(
    existing_target_body: &str,
    edits: &[MarkdownSyncEdit],
) -> Result<String, OpenAiTranslationError> {
    let mut body = existing_target_body.to_owned();
    for (index, edit) in edits.iter().enumerate() {
        if edit.target_before.is_empty() {
            return Err(OpenAiTranslationError::PatchMismatch(format!(
                "edit {index} has empty target_before"
            )));
        }
        if edit.target_before == edit.target_after {
            continue;
        }
        let match_count = body.match_indices(&edit.target_before).count();
        match match_count {
            0 => {
                return Err(OpenAiTranslationError::PatchMismatch(format!(
                    "edit {index} target_before was not found"
                )));
            }
            1 => {
                body = body.replacen(&edit.target_before, &edit.target_after, 1);
            }
            _ => {
                return Err(OpenAiTranslationError::PatchMismatch(format!(
                    "edit {index} target_before matched {match_count} times"
                )));
            }
        }
    }
    Ok(body)
}

fn normalized_language(language: &str) -> &str {
    if language.trim().to_lowercase().starts_with("zh") {
        "zh"
    } else if language.trim().to_lowercase().starts_with("en") {
        "en"
    } else {
        ""
    }
}

fn markdown_language_signal(markdown: &str) -> (&'static str, usize, usize) {
    let cjk_count = markdown
        .chars()
        .filter(|ch| ('\u{3400}'..='\u{9fff}').contains(ch))
        .count();
    let latin_word_count = markdown
        .split(|ch: char| !ch.is_ascii_alphabetic() && ch != '\'' && ch != '-')
        .filter(|word| word.chars().any(|ch| ch.is_ascii_alphabetic()))
        .count();
    let actual = if cjk_count >= 8 && cjk_count.saturating_mul(2) >= latin_word_count {
        "zh"
    } else if latin_word_count >= 20 && latin_word_count > cjk_count.saturating_mul(3) {
        "en"
    } else {
        ""
    };
    (actual, cjk_count, latin_word_count)
}

fn validate_markdown_language(
    expected_language: &str,
    markdown: &str,
) -> Result<(), OpenAiTranslationError> {
    let expected = normalized_language(expected_language);
    if expected.is_empty() {
        return Ok(());
    }
    let (actual, cjk_count, latin_word_count) = markdown_language_signal(markdown);
    if actual.is_empty() || actual == expected {
        return Ok(());
    }
    Err(OpenAiTranslationError::LanguageMismatch {
        expected_language: expected.to_owned(),
        actual_language: format!("{actual} (cjk={cjk_count}, latin_words={latin_word_count})"),
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
    fn sync_output_returns_local_edit_schema() {
        let text = structured_translation_sync_output();
        assert_eq!(text.format.name, "markdown_translation_sync");
        assert_eq!(text.format.schema["required"], serde_json::json!(["edits"]));
        assert_eq!(
            text.format.schema["properties"].as_object().unwrap().len(),
            1
        );
        assert_eq!(
            text.format.schema["properties"]["edits"]["items"]["required"],
            serde_json::json!(["target_before", "target_after"])
        );
    }

    #[test]
    fn selection_output_returns_local_replacement_schema() {
        let text = structured_selection_edit_output();
        assert_eq!(text.format.name, "markdown_selection_edit");
        assert_eq!(
            text.format.schema["required"],
            serde_json::json!(["replacement", "comment"])
        );
        assert_eq!(
            text.format.schema["additionalProperties"],
            serde_json::json!(false)
        );
    }

    #[test]
    fn selection_prompt_marks_context_read_only_and_selection_only_editable() {
        let prompt = selection_edit_user_prompt(&MarkdownSelectionEditRequest {
            language: "en".to_owned(),
            title: "Local edits".to_owned(),
            selected_text: "This sentence is unclear.".to_owned(),
            before_context: "Before paragraph.".to_owned(),
            after_context: "After paragraph.".to_owned(),
            instruction: Some("Make it more direct.".to_owned()),
            action: MarkdownSelectionEditAction::AgentEdit,
        });

        assert!(prompt.contains("Before context, read-only"));
        assert!(prompt.contains("After context, read-only"));
        assert!(prompt.contains("Selected text, the only editable range"));
        assert!(prompt.contains("Make it more direct."));
        assert!(!prompt.contains("Current source Markdown"));
        assert!(!prompt.contains("Existing target Markdown"));
    }

    #[test]
    fn sync_prompt_includes_current_source_and_existing_target() {
        let prompt = translation_sync_user_prompt(&MarkdownTranslationSyncRequest {
            source_language: "en".to_owned(),
            target_language: "zh".to_owned(),
            title: "A title".to_owned(),
            previous_source_body: Some("# A title\n\nOld sentence.".to_owned()),
            source_body: "# A title\n\nChanged sentence.".to_owned(),
            existing_target_body: "# 一个标题\n\n旧句子。".to_owned(),
        });

        assert!(prompt.contains("Previous source Markdown"));
        assert!(prompt.contains("Current source Markdown"));
        assert!(prompt.contains("Existing target Markdown"));
        assert!(prompt.contains("target_before"));
        assert!(prompt.contains("target_after"));
        assert!(prompt.contains("Old sentence."));
        assert!(prompt.contains("Changed sentence."));
        assert!(prompt.contains("旧句子。"));
    }

    #[test]
    fn applies_exact_local_sync_edits() {
        let existing = "# 标题\n\n旧句子。\n\n保留句子。\n";
        let patched = apply_sync_edits(
            existing,
            &[MarkdownSyncEdit {
                target_before: "旧句子。".to_owned(),
                target_after: "新句子。".to_owned(),
            }],
        )
        .expect("patch applies");

        assert_eq!(patched, "# 标题\n\n新句子。\n\n保留句子。\n");
    }

    #[test]
    fn rejects_missing_sync_edit_target() {
        let error = apply_sync_edits(
            "# 标题\n\n旧句子。\n",
            &[MarkdownSyncEdit {
                target_before: "不存在。".to_owned(),
                target_after: "新句子。".to_owned(),
            }],
        )
        .expect_err("missing target");

        assert!(matches!(error, OpenAiTranslationError::PatchMismatch(_)));
    }

    #[test]
    fn rejects_ambiguous_sync_edit_target() {
        let error = apply_sync_edits(
            "# 标题\n\n重复句子。\n\n重复句子。\n",
            &[MarkdownSyncEdit {
                target_before: "重复句子。".to_owned(),
                target_after: "新句子。".to_owned(),
            }],
        )
        .expect_err("ambiguous target");

        assert!(matches!(error, OpenAiTranslationError::PatchMismatch(_)));
    }

    #[test]
    fn rejects_english_body_for_chinese_sync() {
        let body = "# Can an AI Answer Carry an Ad Without Becoming the Ad?\n\nThis is an English article with many English words and no real Chinese translation.";
        let error = validate_markdown_language("zh", body).expect_err("language mismatch");
        assert!(matches!(
            error,
            OpenAiTranslationError::LanguageMismatch { .. }
        ));
    }

    #[test]
    fn accepts_chinese_body_for_chinese_sync() {
        let body = "# AI 回答里加了广告，答案还可信吗？\n\n这是一段中文文章正文，用来确认同步结果不会被英文覆盖。";
        validate_markdown_language("zh", body).expect("valid Chinese body");
    }

    #[test]
    fn rejects_chinese_body_for_english_sync() {
        let body = "# AI 回答里加了广告，答案还可信吗？\n\n这是一段中文文章正文，用来确认英文同步不会被中文覆盖。";
        let error = validate_markdown_language("en", body).expect_err("language mismatch");
        assert!(matches!(
            error,
            OpenAiTranslationError::LanguageMismatch { .. }
        ));
    }

    #[test]
    fn accepts_english_body_for_english_sync() {
        let body = "# Can an AI Answer Carry an Ad Without Becoming the Ad?\n\nThis English paragraph confirms that bidirectional sync can safely update the English target.";
        validate_markdown_language("en", body).expect("valid English body");
    }
}
