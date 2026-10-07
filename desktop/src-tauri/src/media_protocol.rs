//! HTTP semantics for source-backed local media, including video seeking.
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};
use tauri::http::{self, header, Method, StatusCode};

const MAX_RANGE_BYTES: u64 = 8 * 1024 * 1024;

pub(crate) fn respond(path: &Path, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let result = (|| -> std::io::Result<http::Response<Vec<u8>>> {
        let mut file = File::open(path)?;
        let size = file.metadata()?.len();
        let mut builder = http::Response::builder()
            .header(header::CONTENT_TYPE, content_type_for(path))
            .header(header::ACCEPT_RANGES, "bytes")
            .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*");
        if request.method() != Method::GET && request.method() != Method::HEAD {
            return Ok(builder
                .status(StatusCode::METHOD_NOT_ALLOWED)
                .header(header::ALLOW, "GET, HEAD")
                .body(Vec::new())
                .unwrap());
        }
        // Range applies to GET only. HEAD reports the complete representation.
        let range = if request.method() == Method::GET {
            request
                .headers()
                .get(header::RANGE)
                .and_then(|value| value.to_str().ok())
        } else {
            None
        };
        let (start, length) = match range {
            Some(value) => match byte_range(value, size) {
                Some((start, end)) => {
                    builder = builder
                        .status(StatusCode::PARTIAL_CONTENT)
                        .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
                    (start, end - start + 1)
                }
                None => {
                    return Ok(builder
                        .status(StatusCode::RANGE_NOT_SATISFIABLE)
                        .header(header::CONTENT_RANGE, format!("bytes */{size}"))
                        .body(Vec::new())
                        .unwrap())
                }
            },
            None => (0, size),
        };
        let mut bytes = Vec::new();
        if request.method() != Method::HEAD {
            file.seek(SeekFrom::Start(start))?;
            file.take(length).read_to_end(&mut bytes)?;
        }
        Ok(builder
            .header(header::CONTENT_LENGTH, length)
            .body(bytes)
            .unwrap())
    })();
    result.unwrap_or_else(|_| {
        http::Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .body(Vec::new())
            .unwrap()
    })
}

fn byte_range(value: &str, size: u64) -> Option<(u64, u64)> {
    if size == 0 {
        return None;
    }
    let (start, end) = value.strip_prefix("bytes=")?.split_once('-')?;
    let (start, end) = if start.is_empty() {
        let suffix = end.parse::<u64>().ok()?;
        if suffix == 0 {
            return None;
        }
        (size.saturating_sub(suffix), size - 1)
    } else {
        let start = start.parse::<u64>().ok()?;
        let end = if end.is_empty() {
            size - 1
        } else {
            end.parse::<u64>().ok()?.min(size - 1)
        };
        (start, end)
    };
    if start >= size || end < start {
        return None;
    }
    Some((start, end.min(start.saturating_add(MAX_RANGE_BYTES - 1))))
}

fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("json") => "application/json",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("mp4" | "m4v") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn video_ranges_support_seek_suffix_and_bounded_reads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("clip.MP4");
        std::fs::write(&path, b"0123456789").unwrap();
        for (range, expected, content_range) in [
            ("bytes=2-5", b"2345".as_slice(), "bytes 2-5/10"),
            ("bytes=7-", b"789".as_slice(), "bytes 7-9/10"),
            ("bytes=-3", b"789".as_slice(), "bytes 7-9/10"),
        ] {
            let request = http::Request::builder()
                .header(header::RANGE, range)
                .body(vec![])
                .unwrap();
            let response = respond(&path, &request);
            assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
            assert_eq!(response.headers()[header::CONTENT_RANGE], content_range);
            assert_eq!(response.headers()[header::CONTENT_TYPE], "video/mp4");
            assert_eq!(response.body(), expected);
        }
        assert_eq!(
            byte_range("bytes=0-", u64::MAX),
            Some((0, MAX_RANGE_BYTES - 1))
        );
        for invalid in ["bytes=10-", "bytes=4-2", "bytes=-0", "bytes=0-1,3-4"] {
            let request = http::Request::builder()
                .header(header::RANGE, invalid)
                .body(vec![])
                .unwrap();
            assert_eq!(
                respond(&path, &request).status(),
                StatusCode::RANGE_NOT_SATISFIABLE
            );
        }
        let head = http::Request::builder()
            .method(Method::HEAD)
            .body(vec![])
            .unwrap();
        let response = respond(&path, &head);
        assert!(response.body().is_empty());
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "10");
        let get = http::Request::builder().body(vec![]).unwrap();
        assert_eq!(respond(&path, &get).body(), b"0123456789");
    }
}
