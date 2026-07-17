//! Stats sync-then-query e2e test (`docs/silan-viking/03` §3.2 #15).
//!
//! A tiny in-process HTTP server stands in for the deployed Go API: it serves
//! the four `/api/v1/stats` JSON endpoints. The test drives the real
//! `StatsSync` (ureq HTTP client) against it, then asserts the local
//! `StatsCache` answers from the synced rows — proving the whole
//! fetch → cache → query chain offline.

use silan_viking_app::{StatsCache, StatsSync};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;

/// JSON body for a request path. The mock returns these four payloads.
fn body_for(path: &str) -> &'static str {
    if path.starts_with("/api/v1/stats/visitors") {
        r#"{"entity_type":"blog","entity_id":"abc","visitors":[
            {"fingerprint":"fp1","ip_masked":"1.2.3.x","visitor_kind":"human","referrer_kind":"search","last_seen_at":"2026-05-17T10:00:00Z"}
        ]}"#
    } else if path.starts_with("/api/v1/stats/crawlers") {
        r#"{"items":[{"visitor_kind":"human","count":5},{"visitor_kind":"ai_crawler","count":2}]}"#
    } else if path.starts_with("/api/v1/stats/sources") {
        r#"{"items":[{"source":"search","count":4},{"source":"direct","count":3}]}"#
    } else {
        // /api/v1/stats — the aggregate counts.
        r#"{"entity_type":"blog","entity_id":"abc","views":42,"likes":7,"comments":3}"#
    }
}

/// Serve one HTTP request on `stream` from the mock stats API.
fn serve_one(stream: TcpStream) {
    let mut reader = BufReader::new(stream.try_clone().expect("clone"));
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() || request_line.is_empty() {
        return;
    }
    // "GET /api/v1/stats/... HTTP/1.1"
    let path = request_line.split_whitespace().nth(1).unwrap_or("/");
    // Drain the rest of the headers.
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 || line == "\r\n" {
            break;
        }
    }
    let body = body_for(path);
    let mut stream = stream;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

/// Start the mock API on an ephemeral port; return its base URL and a handle.
/// It serves `request_count` requests then exits.
fn start_mock(request_count: usize) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let port = listener.local_addr().expect("addr").port();
    let (ready_tx, ready_rx) = mpsc::channel();
    let handle = thread::spawn(move || {
        ready_tx.send(()).expect("ready");
        for _ in 0..request_count {
            match listener.accept() {
                Ok((stream, _)) => serve_one(stream),
                Err(_) => break,
            }
        }
    });
    ready_rx.recv().expect("server ready");
    (format!("http://127.0.0.1:{port}"), handle)
}

#[test]
fn sync_pulls_remote_stats_then_cache_serves_them_offline() {
    // sync_item makes 4 GETs (stats / visitors / crawlers / sources).
    let (base_url, server) = start_mock(4);

    let dir = std::env::temp_dir().join(format!("silan-statssync-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("mkdir");
    let db = dir.join("portfolio.db");

    // Sync — the real ureq client against the mock API.
    let sync = StatsSync::new(&base_url, &db).with_bearer_token("stats-integration-token");
    sync.sync_item("blog", "abc").expect("sync succeeds");
    server.join().expect("mock server joins");

    // Query — entirely from the local cache, no network.
    let cache = StatsCache::open(&db);

    let item = cache.item("blog", "abc").expect("item cached");
    assert_eq!(item.views, 42);
    assert_eq!(item.likes, 7);
    assert_eq!(item.comments, 3);

    let visitors = cache.visitors("blog", "abc").expect("visitors cached");
    assert_eq!(visitors.len(), 1);
    assert_eq!(visitors[0].visitor_kind, "human");
    assert_eq!(visitors[0].ip_masked, "1.2.3.x");

    let crawlers = cache.crawlers("blog", "abc").expect("crawlers cached");
    assert_eq!(crawlers.len(), 2);
    // Ordered by count DESC — human (5) before ai_crawler (2).
    assert_eq!(crawlers[0].label, "human");
    assert_eq!(crawlers[0].count, 5);

    let sources = cache.sources("blog", "abc").expect("sources cached");
    assert_eq!(sources[0].label, "search");
    assert_eq!(sources[0].count, 4);

    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn re_sync_replaces_the_previous_snapshot() {
    // Two syncs of the same item: the cache must mirror the latest, not
    // accumulate. 8 requests total (4 per sync).
    let (base_url, server) = start_mock(8);
    let dir = std::env::temp_dir().join(format!("silan-statsresync-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("mkdir");
    let db = dir.join("portfolio.db");

    let sync = StatsSync::new(&base_url, &db).with_bearer_token("stats-integration-token");
    sync.sync_item("blog", "abc").expect("first sync");
    sync.sync_item("blog", "abc").expect("second sync");
    server.join().expect("mock joins");

    let cache = StatsCache::open(&db);
    // Visitors must be 1, not 2 — the second sync replaced, not appended.
    assert_eq!(cache.visitors("blog", "abc").expect("visitors").len(), 1);
    let _ = std::fs::remove_dir_all(&dir);
}
