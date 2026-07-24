//! OpenAI audio transcription use-case.
//!
//! Tauri and other outward adapters provide bytes and a typed API key. This
//! module owns validation, multipart encoding, the HTTP request, and the
//! OpenAI response contract.

use crate::OpenAiApiKey;
use serde::Deserialize;
use std::time::Duration;
use thiserror::Error;

const DEFAULT_API_BASE: &str = "https://api.openai.com";
const DEFAULT_MODEL: &str = "gpt-4o-mini-transcribe";
const MAX_DURATION_MS: u64 = 60_000;
const MAX_AUDIO_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AudioTranscriptionRequest {
    pub audio: Vec<u8>,
    pub mime_type: String,
    pub duration_ms: u64,
}

#[derive(Debug, Error)]
pub enum OpenAiTranscriptionError {
    #[error("invalid audio transcription request: {0}")]
    InvalidRequest(String),
    #[error("OpenAI transcription request failed ({status}): {message}")]
    Rejected { status: u16, message: String },
    #[error("could not reach OpenAI for transcription: {0}")]
    Unavailable(String),
    #[error("OpenAI returned an invalid transcription response: {0}")]
    InvalidResponse(String),
}

pub struct OpenAiAudioTranscriber {
    api_base: String,
    model: String,
}

impl Default for OpenAiAudioTranscriber {
    fn default() -> Self {
        Self::new(DEFAULT_API_BASE, DEFAULT_MODEL)
    }
}

impl OpenAiAudioTranscriber {
    pub fn new(api_base: impl Into<String>, model: impl Into<String>) -> Self {
        Self {
            api_base: api_base.into().trim_end_matches('/').to_owned(),
            model: model.into(),
        }
    }

    pub fn transcribe(
        &self,
        api_key: &OpenAiApiKey,
        request: AudioTranscriptionRequest,
    ) -> Result<String, OpenAiTranscriptionError> {
        let audio_format = AudioFormat::parse(&request)?;
        let boundary = format!("silan-viking-{}", std::process::id());
        let body = multipart_body(&boundary, &self.model, audio_format, &request.audio);
        let url = format!("{}/v1/audio/transcriptions", self.api_base);
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(6))
            .timeout_read(Duration::from_secs(90))
            .timeout_write(Duration::from_secs(20))
            .build();

        let response = match agent
            .post(&url)
            .set(
                "Authorization",
                &format!("Bearer {}", api_key.expose_secret()),
            )
            .set(
                "Content-Type",
                &format!("multipart/form-data; boundary={boundary}"),
            )
            .send_bytes(&body)
        {
            Ok(response) => response,
            Err(ureq::Error::Status(status, response)) => {
                let message = response
                    .into_json::<ApiErrorEnvelope>()
                    .ok()
                    .map(|body| body.error.message)
                    .filter(|message| !message.trim().is_empty())
                    .unwrap_or_else(|| "transcription request failed".to_owned());
                return Err(OpenAiTranscriptionError::Rejected { status, message });
            }
            Err(ureq::Error::Transport(error)) => {
                return Err(OpenAiTranscriptionError::Unavailable(error.to_string()));
            }
        };

        let body = response
            .into_json::<TranscriptionResponse>()
            .map_err(|error| OpenAiTranscriptionError::InvalidResponse(error.to_string()))?;
        let text = body.text.trim();
        if text.is_empty() {
            return Err(OpenAiTranscriptionError::InvalidResponse(
                "transcription text was empty".to_owned(),
            ));
        }
        Ok(text.to_owned())
    }
}

#[derive(Clone, Copy)]
enum AudioFormat {
    WebM,
    Mp4,
}

impl AudioFormat {
    fn parse(request: &AudioTranscriptionRequest) -> Result<Self, OpenAiTranscriptionError> {
        if request.audio.is_empty() {
            return Err(OpenAiTranscriptionError::InvalidRequest(
                "recorded audio is empty".to_owned(),
            ));
        }
        if request.duration_ms == 0 || request.duration_ms > MAX_DURATION_MS {
            return Err(OpenAiTranscriptionError::InvalidRequest(
                "voice input must be between 1 and 60 seconds".to_owned(),
            ));
        }
        if request.audio.len() > MAX_AUDIO_BYTES {
            return Err(OpenAiTranscriptionError::InvalidRequest(
                "recorded audio exceeds the 16 MB safety limit".to_owned(),
            ));
        }
        match request.mime_type.as_str() {
            value if value.starts_with("audio/webm") => Ok(Self::WebM),
            value if value.starts_with("audio/mp4") => Ok(Self::Mp4),
            _ => Err(OpenAiTranscriptionError::InvalidRequest(
                "unsupported recorded audio format".to_owned(),
            )),
        }
    }

    fn mime_type(self) -> &'static str {
        match self {
            Self::WebM => "audio/webm",
            Self::Mp4 => "audio/mp4",
        }
    }

    fn file_name(self) -> &'static str {
        match self {
            Self::WebM => "dictation.webm",
            Self::Mp4 => "dictation.mp4",
        }
    }
}

fn multipart_body(boundary: &str, model: &str, format: AudioFormat, audio: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(audio.len() + 512);
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n{model}\r\n\
             --{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{}\"\r\n\
             Content-Type: {}\r\n\r\n",
            format.file_name(),
            format.mime_type(),
        )
        .as_bytes(),
    );
    body.extend_from_slice(audio);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
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

    fn request(mime_type: &str) -> AudioTranscriptionRequest {
        AudioTranscriptionRequest {
            audio: vec![1, 2, 3],
            mime_type: mime_type.to_owned(),
            duration_ms: 1_000,
        }
    }

    #[test]
    fn validates_supported_audio_formats() {
        assert!(matches!(
            AudioFormat::parse(&request("audio/webm;codecs=opus")),
            Ok(AudioFormat::WebM)
        ));
        assert!(matches!(
            AudioFormat::parse(&request("audio/mp4")),
            Ok(AudioFormat::Mp4)
        ));
        assert!(matches!(
            AudioFormat::parse(&request("audio/wav")),
            Err(OpenAiTranscriptionError::InvalidRequest(_))
        ));
    }

    #[test]
    fn multipart_body_contains_model_and_audio_without_mutation() {
        let audio = [0, 1, 2, 255];
        let body = multipart_body("boundary", DEFAULT_MODEL, AudioFormat::WebM, &audio);

        assert!(body
            .windows(DEFAULT_MODEL.len())
            .any(|window| window == DEFAULT_MODEL.as_bytes()));
        assert!(body
            .windows(audio.len())
            .any(|window| window == audio.as_slice()));
        assert!(body.ends_with(b"\r\n--boundary--\r\n"));
    }
}
