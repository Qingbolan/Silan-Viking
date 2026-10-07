//! Typed HTTP assembly. Pools contain connections, never account configuration.
//! Each request still binds its own endpoint, model and credential snapshot.
use std::sync::OnceLock;
use std::time::Duration;

#[derive(Clone, Copy)]
pub(crate) enum TransportPolicy {
    Chat,
    Image,
    Speech,
    ModelProbe,
    Translation,
    LanguageReview,
    CommitMessage,
    CredentialProbe,
}

pub(crate) struct AiClientFactory {
    agents: [OnceLock<ureq::Agent>; 8],
}

impl AiClientFactory {
    pub(crate) fn shared() -> &'static Self {
        static FACTORY: OnceLock<AiClientFactory> = OnceLock::new();
        FACTORY.get_or_init(|| Self {
            agents: std::array::from_fn(|_| OnceLock::new()),
        })
    }

    pub(crate) fn agent(&self, policy: TransportPolicy) -> &ureq::Agent {
        self.agents[policy as usize].get_or_init(|| {
            // Keep the existing operation-specific timeout and redirect contracts.
            // Configured endpoints and media requests never follow redirects.
            let (connect, read, write, redirects) = match policy {
                TransportPolicy::Chat => (8, 180, 30, 0),
                TransportPolicy::Image => (6, 180, 10, 0),
                TransportPolicy::Speech => (6, 90, 20, 0),
                TransportPolicy::Translation => (6, 90, 10, 5),
                TransportPolicy::LanguageReview => (6, 120, 15, 5),
                TransportPolicy::CommitMessage => (6, 45, 15, 5),
                TransportPolicy::CredentialProbe => (4, 10, 4, 5),
                TransportPolicy::ModelProbe => {
                    return ureq::AgentBuilder::new()
                        .timeout(Duration::from_secs(20))
                        .redirects(0)
                        .build()
                }
            };
            ureq::AgentBuilder::new()
                .timeout_connect(Duration::from_secs(connect))
                .timeout_read(Duration::from_secs(read))
                .timeout_write(Duration::from_secs(write))
                .redirects(redirects)
                .build()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};

    fn request(reader: &mut BufReader<TcpStream>) -> String {
        let mut headers = String::new();
        let mut length = 0;
        loop {
            let mut line = String::new();
            assert!(reader.read_line(&mut line).unwrap() > 0);
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse::<usize>().unwrap();
            }
            headers.push_str(&line);
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        headers + "\r\n" + &String::from_utf8(body).unwrap()
    }

    #[test]
    fn pooled_calls_reuse_one_connection_without_reusing_authorization() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!(
            "http://{}/v1/chat/completions",
            listener.local_addr().unwrap()
        );
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let mut reader = BufReader::new(stream);
            let mut requests = Vec::new();
            // Both requests must arrive on the single accepted connection.
            for _ in 0..2 {
                requests.push(request(&mut reader));
                reader.get_mut().write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: application/json\r\nConnection: keep-alive\r\n\r\n{}").unwrap();
                reader.get_mut().flush().unwrap();
            }
            requests
        });
        let first = AiClientFactory::shared()
            .agent(TransportPolicy::Chat)
            .post(&endpoint)
            .timeout(Duration::from_secs(3))
            .set("Authorization", "Bearer synthetic-first")
            .send_json(serde_json::json!({"model":"first"}))
            .unwrap();
        first.into_json::<serde_json::Value>().unwrap();
        let second = AiClientFactory::shared()
            .agent(TransportPolicy::Chat)
            .post(&endpoint)
            .timeout(Duration::from_secs(3))
            .send_json(serde_json::json!({"model":"second"}))
            .unwrap();
        second.into_json::<serde_json::Value>().unwrap();
        let requests = server.join().unwrap();
        assert!(requests[0].contains("Bearer synthetic-first"));
        assert!(!requests[1].to_ascii_lowercase().contains("authorization:"));
        assert!(requests[1].contains("second"));
        assert!(!requests[1].contains("synthetic-first"));
    }

    #[test]
    fn configured_transport_does_not_follow_redirects() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}", listener.local_addr().unwrap());
        let target_address = target.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream);
            request(&mut reader);
            write!(reader.get_mut(), "HTTP/1.1 302 Found\r\nLocation: http://{target_address}/elsewhere\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        let response = AiClientFactory::shared()
            .agent(TransportPolicy::Chat)
            .get(&endpoint)
            .timeout(Duration::from_secs(3))
            .set("Authorization", "Bearer synthetic-secret")
            .call()
            .unwrap();
        assert_eq!(response.status(), 302);
        server.join().unwrap();
        assert_eq!(
            target.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }
}
