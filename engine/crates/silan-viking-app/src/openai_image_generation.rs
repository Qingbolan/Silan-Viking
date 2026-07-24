//! OpenAI image generation use-case.
//!
//! Outward adapters provide a validated API key and persistence destination.
//! This module owns prompt validation, OpenAI request/response parsing, and
//! decoding the generated image bytes.

use crate::OpenAiApiKey;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::env;
use std::time::Duration;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.openai.com";
pub const DEFAULT_OPENAI_IMAGE_MODEL: &str = "gpt-image-1.5";
const MAX_PROMPT_CHARS: usize = 4_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageGenerationRequest {
    pub prompt: String,
    pub size: ImageSize,
    pub quality: ImageQuality,
    pub output_format: ImageOutputFormat,
}

impl ImageGenerationRequest {
    pub fn new(prompt: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            size: ImageSize::Square1024,
            quality: ImageQuality::Auto,
            output_format: ImageOutputFormat::Png,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageSize {
    Square1024,
    Portrait1024x1536,
    Landscape1536x1024,
}

impl ImageSize {
    pub fn parse(value: &str) -> Result<Self, OpenAiImageGenerationError> {
        match value.trim() {
            "1024x1024" => Ok(Self::Square1024),
            "1024x1536" => Ok(Self::Portrait1024x1536),
            "1536x1024" => Ok(Self::Landscape1536x1024),
            other => Err(OpenAiImageGenerationError::InvalidRequest(format!(
                "unsupported image size `{other}`"
            ))),
        }
    }

    fn as_api_value(self) -> &'static str {
        match self {
            Self::Square1024 => "1024x1024",
            Self::Portrait1024x1536 => "1024x1536",
            Self::Landscape1536x1024 => "1536x1024",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageQuality {
    Auto,
    Low,
    Medium,
    High,
}

impl ImageQuality {
    pub fn parse(value: &str) -> Result<Self, OpenAiImageGenerationError> {
        match value.trim() {
            "" | "auto" => Ok(Self::Auto),
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            other => Err(OpenAiImageGenerationError::InvalidRequest(format!(
                "unsupported image quality `{other}`"
            ))),
        }
    }

    fn as_api_value(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageOutputFormat {
    Png,
    Webp,
    Jpeg,
}

impl ImageOutputFormat {
    pub fn parse(value: &str) -> Result<Self, OpenAiImageGenerationError> {
        match value.trim() {
            "" | "png" => Ok(Self::Png),
            "webp" => Ok(Self::Webp),
            "jpeg" | "jpg" => Ok(Self::Jpeg),
            other => Err(OpenAiImageGenerationError::InvalidRequest(format!(
                "unsupported image output format `{other}`"
            ))),
        }
    }

    fn as_api_value(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Webp => "webp",
            Self::Jpeg => "jpeg",
        }
    }

    fn extension(self) -> &'static str {
        self.as_api_value()
    }

    fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Webp => "image/webp",
            Self::Jpeg => "image/jpeg",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GeneratedImageAsset {
    pub file_name: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Error)]
pub enum OpenAiImageGenerationError {
    #[error("invalid image generation request: {0}")]
    InvalidRequest(String),
    #[error("OpenAI image generation request failed ({status}): {message}")]
    Rejected { status: u16, message: String },
    #[error("could not reach OpenAI for image generation: {0}")]
    Unavailable(String),
    #[error("OpenAI returned an invalid image generation response: {0}")]
    InvalidResponse(String),
}

pub struct OpenAiImageGenerator {
    api_base: String,
    model: String,
}

impl Default for OpenAiImageGenerator {
    fn default() -> Self {
        Self::from_environment()
    }
}

impl OpenAiImageGenerator {
    pub fn from_environment() -> Self {
        let model = env::var("SILAN_OPENAI_IMAGE_MODEL")
            .unwrap_or_else(|_| DEFAULT_OPENAI_IMAGE_MODEL.to_owned());
        Self::new(DEFAULT_API_BASE, model)
    }

    pub fn new(api_base: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_base: api_base.into().trim_end_matches('/').to_owned(),
            model: model.into(),
        }
    }

    pub fn generate(
        &self,
        api_key: &OpenAiApiKey,
        request: &ImageGenerationRequest,
    ) -> Result<GeneratedImageAsset, OpenAiImageGenerationError> {
        validate_prompt(&request.prompt)?;
        let url = format!("{}/v1/images/generations", self.api_base);
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(6))
            .timeout_read(Duration::from_secs(180))
            .timeout_write(Duration::from_secs(10))
            .build();
        let payload = ImageGenerationPayload {
            model: self.model.as_str(),
            prompt: request.prompt.trim(),
            n: 1,
            size: request.size.as_api_value(),
            quality: request.quality.as_api_value(),
            output_format: request.output_format.as_api_value(),
        };

        let response =
            match agent
                .post(&url)
                .set(
                    "Authorization",
                    &format!("Bearer {}", api_key.expose_secret()),
                )
                .send_json(serde_json::to_value(payload).map_err(|error| {
                    OpenAiImageGenerationError::InvalidResponse(error.to_string())
                })?) {
                Ok(response) => response,
                Err(ureq::Error::Status(status, response)) => {
                    let message = response
                        .into_json::<ApiErrorEnvelope>()
                        .ok()
                        .map(|body| body.error.message)
                        .filter(|message| !message.trim().is_empty())
                        .unwrap_or_else(|| "image generation request failed".to_owned());
                    return Err(OpenAiImageGenerationError::Rejected { status, message });
                }
                Err(ureq::Error::Transport(error)) => {
                    return Err(OpenAiImageGenerationError::Unavailable(error.to_string()));
                }
            };

        let body = response
            .into_json::<ImageGenerationResponse>()
            .map_err(|error| OpenAiImageGenerationError::InvalidResponse(error.to_string()))?;
        let b64 = body
            .data
            .first()
            .and_then(|image| image.b64_json.as_deref())
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| {
                OpenAiImageGenerationError::InvalidResponse(
                    "missing generated image bytes".to_owned(),
                )
            })?;
        let bytes = decode_image_base64(b64)?;
        Ok(GeneratedImageAsset {
            file_name: generated_file_name(&request.prompt, request.output_format),
            mime_type: request.output_format.mime_type().to_owned(),
            bytes,
        })
    }
}

#[derive(Serialize)]
struct ImageGenerationPayload<'a> {
    model: &'a str,
    prompt: &'a str,
    n: u8,
    size: &'a str,
    quality: &'a str,
    output_format: &'a str,
}

#[derive(Deserialize)]
struct ImageGenerationResponse {
    data: Vec<ImageGenerationData>,
}

#[derive(Deserialize)]
struct ImageGenerationData {
    b64_json: Option<String>,
}

#[derive(Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    message: String,
}

fn validate_prompt(prompt: &str) -> Result<(), OpenAiImageGenerationError> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err(OpenAiImageGenerationError::InvalidRequest(
            "prompt is empty".to_owned(),
        ));
    }
    if prompt.chars().count() > MAX_PROMPT_CHARS {
        return Err(OpenAiImageGenerationError::InvalidRequest(format!(
            "prompt exceeds {MAX_PROMPT_CHARS} characters"
        )));
    }
    Ok(())
}

fn decode_image_base64(value: &str) -> Result<Vec<u8>, OpenAiImageGenerationError> {
    let payload = value
        .trim()
        .rsplit_once(',')
        .map(|(_, tail)| tail)
        .unwrap_or_else(|| value.trim());
    base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|error| OpenAiImageGenerationError::InvalidResponse(error.to_string()))
}

fn generated_file_name(prompt: &str, format: ImageOutputFormat) -> String {
    let stem = prompt_slug(prompt);
    format!("{stem}.{}", format.extension())
}

fn prompt_slug(prompt: &str) -> String {
    let value = prompt
        .chars()
        .take(64)
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if value.is_empty() {
        "ai-image".to_owned()
    } else {
        format!("ai-{value}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_size_quality_and_format() {
        assert_eq!(
            ImageSize::parse("1536x1024").unwrap(),
            ImageSize::Landscape1536x1024
        );
        assert_eq!(ImageQuality::parse("high").unwrap(), ImageQuality::High);
        assert_eq!(
            ImageOutputFormat::parse("jpg").unwrap(),
            ImageOutputFormat::Jpeg
        );
    }

    #[test]
    fn decodes_raw_or_data_url_base64() {
        assert_eq!(decode_image_base64("aGk=").unwrap(), b"hi");
        assert_eq!(
            decode_image_base64("data:image/png;base64,aGk=").unwrap(),
            b"hi"
        );
    }

    #[test]
    fn builds_stable_file_name_from_prompt() {
        assert_eq!(
            generated_file_name("Editorial robot at work", ImageOutputFormat::Png),
            "ai-editorial-robot-at-work.png"
        );
        assert_eq!(
            generated_file_name("图文记录", ImageOutputFormat::Webp),
            "ai-image.webp"
        );
    }

    #[test]
    fn serializes_generation_payload_shape() {
        let payload = ImageGenerationPayload {
            model: DEFAULT_OPENAI_IMAGE_MODEL,
            prompt: "A test image",
            n: 1,
            size: ImageSize::Square1024.as_api_value(),
            quality: ImageQuality::Auto.as_api_value(),
            output_format: ImageOutputFormat::Png.as_api_value(),
        };
        let value = serde_json::to_value(payload).expect("serializable payload");
        assert_eq!(value["model"], serde_json::json!("gpt-image-1.5"));
        assert_eq!(value["n"], serde_json::json!(1));
        assert_eq!(value["output_format"], serde_json::json!("png"));
    }
}
