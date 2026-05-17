//! M9 MCP server e2e test — drive `silan mcp serve --stdio` as a real
//! subprocess and speak JSON-RPC 2.0 to it.
//!
//! This is the acceptance gate for "the MCP server is real": it spawns the
//! actual binary, pipes `initialize` / `tools/list` / `tools/call` /
//! `resources/read` requests into its stdin, and asserts the JSON-RPC
//! responses on stdout. If the server stops being a real JSON-RPC loop, this
//! test fails.

use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// Initialise a fresh project and return its content root.
fn fresh_content() -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let root = std::env::temp_dir().join(format!(
        "silan-mcpsrv-{}-{}",
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let content = root.join("content");
    let status = Command::new(bin())
        .args(["--content", content.to_str().expect("path"), "init"])
        .status()
        .expect("init runs");
    assert!(status.success(), "init must succeed");
    content
}

/// Run the MCP server with `requests` (one JSON-RPC object per line) on stdin,
/// returning the response lines parsed as JSON.
fn drive_server(content: &Path, requests: &[&str]) -> Vec<serde_json::Value> {
    drive_server_with_db(content, None, requests)
}

/// Like [`drive_server`] but with an explicit `--db` (the stats cache lives
/// in `portfolio.db`).
fn drive_server_with_db(
    content: &Path,
    db: Option<&Path>,
    requests: &[&str],
) -> Vec<serde_json::Value> {
    let mut args: Vec<String> = vec!["--content".into(), content.to_str().expect("path").into()];
    if let Some(db) = db {
        args.push("--db".into());
        args.push(db.to_str().expect("db path").into());
    }
    args.extend(["mcp".into(), "serve".into(), "--stdio".into()]);
    let mut child = Command::new(bin())
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("server spawns");

    {
        let stdin = child.stdin.as_mut().expect("stdin");
        for req in requests {
            writeln!(stdin, "{req}").expect("write request");
        }
        // Dropping stdin (end of scope) signals EOF, ending the server loop.
    }

    let out = child.wait_with_output().expect("server exits");
    assert!(
        out.status.success(),
        "server should exit cleanly: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).expect("response is JSON"))
        .collect()
}

#[test]
fn initialize_returns_protocol_and_instructions() {
    let content = fresh_content();
    let responses = drive_server(
        &content,
        &[r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#],
    );
    assert_eq!(responses.len(), 1);
    let result = &responses[0]["result"];
    assert_eq!(result["protocolVersion"], "2024-11-05");
    assert_eq!(result["serverInfo"]["name"], "silan-viking");
    let instructions = result["instructions"].as_str().expect("instructions");
    assert!(instructions.contains("context_brief"));
    assert!(instructions.contains("silan://agent/"));
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn tools_list_advertises_all_seventeen_tools() {
    let content = fresh_content();
    let responses = drive_server(
        &content,
        &[r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}"#],
    );
    let tools = responses[0]["result"]["tools"]
        .as_array()
        .expect("tools array");
    assert_eq!(tools.len(), 17, "all 17 §3.2 tools must be advertised");
    let names: Vec<&str> = tools
        .iter()
        .map(|t| t["name"].as_str().expect("name"))
        .collect();
    for required in [
        "recall",
        "list",
        "browse",
        "read",
        "context_brief",
        "lint",
        "stats",
        "visitors",
        "crawler_breakdown",
        "source_breakdown",
        "capture",
        "ctx_read",
        "ctx_write",
        "ctx_brief",
        "reflect",
        "propose",
        "summarize_updates",
    ] {
        assert!(
            names.contains(&required),
            "tools/list must include `{required}`"
        );
    }
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn tools_call_recall_and_lint_run() {
    let content = fresh_content();
    // Seed one Item so recall/lint have something to work on.
    Command::new(bin())
        .args([
            "--content",
            content.to_str().expect("path"),
            "idea",
            "new",
            "rust-engine",
        ])
        .status()
        .expect("idea new");

    let responses = drive_server(
        &content,
        &[
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lint","arguments":{}}}"#,
            r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"browse","arguments":{"uri":"silan://resources"}}}"#,
            r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ctx_brief","arguments":{}}}"#,
        ],
    );
    assert_eq!(responses.len(), 3);
    // lint returns a structured issues list (possibly empty).
    assert!(responses[0]["result"]["structuredContent"]["issues"].is_array());
    // browse lists the collections.
    assert!(responses[1]["result"]["structuredContent"]["entries"].is_array());
    // ctx_brief returns a brief string.
    assert!(responses[2]["result"]["structuredContent"]["brief"].is_string());
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

/// Ensure `content/` is a Git repo — `capture`/`propose` write proposal
/// branches. `silan init` now does `git init` + a first commit itself, so when
/// `content/` is already a repo this is a no-op; it stays here so tests that
/// build `content/` without `silan init` are still covered.
fn git_init(content: &Path) {
    if content.join(".git").is_dir() {
        return; // `silan init` already established the repo
    }
    for args in [
        &["init", "-q", "-b", "main"][..],
        &["config", "user.email", "t@silan.dev"][..],
        &["config", "user.name", "t"][..],
        &["add", "-A"][..],
        &["commit", "-q", "-m", "init"][..],
    ] {
        let status = Command::new("git")
            .args(args)
            .current_dir(content)
            .status()
            .expect("git runs");
        assert!(status.success(), "git {args:?} must succeed");
    }
}

#[test]
fn tools_call_capture_creates_a_proposal() {
    let content = fresh_content();
    git_init(&content);
    let responses = drive_server(
        &content,
        &[
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"capture","arguments":{"note":"a thought worth keeping"}}}"#,
        ],
    );
    let structured = &responses[0]["result"]["structuredContent"];
    let proposal_id = structured["proposal_id"].as_str().expect("proposal_id");
    assert!(!proposal_id.is_empty());
    assert!(structured["branch"]
        .as_str()
        .expect("branch")
        .starts_with("proposal/"));
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn stats_tool_unresolvable_uri_is_a_clear_error() {
    // The #15 stats tools read the local cache. An item not in the local
    // content DB is a clear error pointing at `index sync`, not a crash.
    let content = fresh_content();
    let responses = drive_server(
        &content,
        &[
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"stats","arguments":{"uri":"silan://resources/ideas/no-such-idea"}}}"#,
        ],
    );
    let err = &responses[0]["error"];
    assert!(
        err.is_object(),
        "stats for an unknown item must be a JSON-RPC error"
    );
    let msg = err["message"].as_str().expect("message");
    assert!(
        msg.contains("index sync") || msg.contains("local DB") || msg.contains("stats sync"),
        "the error must point at sync, got: {msg}"
    );
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn ctx_write_rejects_resources_uri() {
    // The #10 invariant: agents cannot write published content via ctx_write.
    let content = fresh_content();
    let responses = drive_server(
        &content,
        &[
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"ctx_write","arguments":{"uri":"silan://resources/ideas/x","content":"no"}}}"#,
        ],
    );
    assert!(
        responses[0]["error"].is_object(),
        "ctx_write to silan://resources must be rejected"
    );
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn resources_read_returns_schema() {
    let content = fresh_content();
    let responses = drive_server(
        &content,
        &[
            r#"{"jsonrpc":"2.0","id":1,"method":"resources/list","params":{}}"#,
            r#"{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"silan://schema"}}"#,
        ],
    );
    let resources = responses[0]["result"]["resources"]
        .as_array()
        .expect("resources");
    assert_eq!(
        resources.len(),
        3,
        "the three §8.6 resources must be listed"
    );
    let schema_text = responses[1]["result"]["contents"][0]["text"]
        .as_str()
        .expect("schema text");
    assert!(
        schema_text.contains("```yaml"),
        "schema resource must be SCHEMA.md"
    );
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn stats_tool_serves_the_local_cache() {
    // Seed a content row + a synced stats_cache_item row, then call the MCP
    // `stats` tool — it must serve the cached counts.
    let content = fresh_content();
    let db = content.parent().expect("root").join("portfolio.db");
    let conn = rusqlite::Connection::open(&db).expect("open db");
    conn.execute_batch(
        "CREATE TABLE blog_posts (id TEXT PRIMARY KEY, slug TEXT UNIQUE);
         INSERT INTO blog_posts (id, slug) VALUES ('b1', 'cached-post');
         CREATE TABLE stats_cache_item (
           entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
           views INTEGER NOT NULL, likes INTEGER NOT NULL,
           comments INTEGER NOT NULL, synced_at TEXT NOT NULL,
           PRIMARY KEY (entity_type, entity_id));
         INSERT INTO stats_cache_item VALUES
           ('blog', 'b1', 99, 12, 4, '2026-05-17T00:00:00Z');",
    )
    .expect("seed db");
    drop(conn);

    let responses = drive_server_with_db(
        &content,
        Some(&db),
        &[
            r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"stats","arguments":{"uri":"silan://resources/blog/cached-post"}}}"#,
        ],
    );
    let structured = &responses[0]["result"]["structuredContent"];
    assert_eq!(structured["views"], 99, "MCP stats must serve the cache");
    assert_eq!(structured["likes"], 12);
    assert_eq!(structured["comments"], 4);
    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}
