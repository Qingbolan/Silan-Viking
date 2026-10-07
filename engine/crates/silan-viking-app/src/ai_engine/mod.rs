//! Device-wide AI configuration, client contracts and shared transport assembly.
//! No endpoint, model or credential is cached in the transport factory.
mod client;
mod configuration;
pub(crate) mod transport;

pub use client::{chat_completion, completion_text, test_connection};
pub use configuration::{
    configured_profile, AiCapability, AiEngineProfile, AiEngineSettings, AiProvider,
    KEYCHAIN_SERVICE,
};

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::time::Duration;

    fn profile(base_url: String) -> AiEngineProfile {
        AiEngineProfile {
            provider: AiProvider::OpenaiCompatible,
            base_url,
            model: "chosen-model".into(),
            credential_id: None,
        }
    }

    pub(crate) fn server(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
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
