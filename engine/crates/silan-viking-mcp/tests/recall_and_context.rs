//! MCP `recall` / `context_brief` end-to-end tests — the skill's *search*
//! and *context-load* surface (`03` §3.2).
//!
//! SKILL.md tells an agent its first action on connecting is `context_brief()`,
//! and to find whether a topic was written about with `recall`. Those two are
//! the most load-bearing read tools, yet the rest of the MCP test surface only
//! exercises `capture` / `propose`. These tests cover the search/context path
//! with strong assertions — a recall must return the *right* Item, a brief
//! must carry the real project shape — not just a well-typed shell.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Run `git <args>` in `cwd`, panicking with stderr on failure.
fn git(cwd: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("git runs");
    assert!(
        out.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
}

/// Recursively copy a directory tree.
fn copy_dir(src: &Path, dst: &Path) {
    std::fs::create_dir_all(dst).expect("mkdir");
    for entry in std::fs::read_dir(src).expect("read_dir") {
        let entry = entry.expect("entry");
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if from.is_dir() {
            copy_dir(&from, &to);
        } else {
            std::fs::copy(&from, &to).expect("copy");
        }
    }
}

/// Copy the shared fixture `content/` into a fresh temp dir and `git init` it,
/// so `context_brief` can report a content commit.
fn fresh_repo(tag: &str) -> PathBuf {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content");
    let root = std::env::temp_dir().join(format!(
        "silan-recall-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    copy_dir(&fixture, &root);
    git(&root, &["init", "-q", "-b", "main"]);
    git(&root, &["config", "user.email", "t@silan.dev"]);
    git(&root, &["config", "user.name", "t"]);
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-q", "-m", "fixture"]);
    root
}

#[test]
fn recall_finds_the_item_whose_content_matches() {
    // The skill's "has this topic been written about?" path. The fixture
    // carries a `blog/hello-world` Item; a recall for its subject must return
    // that Item — by URI — not merely a well-formed but empty result.
    let root = fresh_repo("recall-hit");

    let hits = silan_viking_mcp::recall(&root, "hello world", 10).expect("recall runs");

    assert!(
        !hits.is_empty(),
        "recall for a topic the fixture covers must return at least one hit"
    );
    assert!(
        hits.iter()
            .any(|h| h.document.uri.contains("blog/hello-world")),
        "recall must surface the blog/hello-world Item; got: {:?}",
        hits.iter().map(|h| &h.document.uri).collect::<Vec<_>>()
    );
    // Hits are ranked — score is finite and non-increasing down the list.
    for pair in hits.windows(2) {
        assert!(
            pair[0].score >= pair[1].score,
            "recall hits must be ranked best-first"
        );
    }

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn recall_respects_the_limit() {
    // The agent passes a `limit`; recall must never exceed it.
    let root = fresh_repo("recall-limit");

    let hits = silan_viking_mcp::recall(&root, "the", 2).expect("recall runs");
    assert!(
        hits.len() <= 2,
        "recall returned {} hits for limit=2",
        hits.len()
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn context_brief_carries_the_project_shape() {
    // The skill's mandated first call. The brief must be a real digest of the
    // project — its name, the SCHEMA version, the content commit, and the
    // most-recent Items as suggested next reads — not a hollow placeholder.
    // The `brief` *string* itself may be empty on a project with no agent
    // memory yet; `context_brief_loads_agent_memory` covers the non-empty case.
    let root = fresh_repo("context-brief");

    let brief = silan_viking_mcp::context_brief(&root, "silan-viking").expect("context_brief runs");

    assert_eq!(brief.project, "silan-viking");
    assert_eq!(
        brief.schema_version, 1,
        "the brief must report the SCHEMA.md version"
    );
    assert!(
        brief.content_commit.is_some(),
        "a git-initialised content repo must yield a content commit"
    );
    assert!(
        !brief.suggested_next_reads.is_empty(),
        "a project with content must suggest Items to read next"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn context_brief_loads_agent_memory() {
    // The actual context-load path: once agent memory exists under
    // `silan://agent/`, `context_brief` must fold it into the `brief`. This
    // is what makes the skill's "understand what silan is thinking first"
    // contract real — without it the brief is just project metadata.
    let root = fresh_repo("context-brief-memory");

    // Write a piece of agent context — `ctx_brief` folds `project/brief.md`
    // into the digest, so that is the path the memory must land at.
    silan_viking_mcp::ctx_write(
        &root,
        "silan://agent/project/brief.md",
        "Currently focused on the silan-viking content engine rewrite.",
    )
    .expect("ctx_write runs");

    let brief = silan_viking_mcp::context_brief(&root, "silan-viking").expect("context_brief runs");
    assert!(
        !brief.brief.trim().is_empty(),
        "context_brief must fold written agent memory into the brief"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn read_returns_a_part_body() {
    // An agent revising or continuing a Part must first read what the Part
    // currently says. `read` on a Part URI (`…/<slug>/<role>`) returns its
    // full prose body — an Item URI gives only a summary.
    let root = fresh_repo("read-part");

    // The fixture's blog Item carries a `body` Part with prose.
    let res = silan_viking_mcp::read(&root, "silan://resources/blog/hello-world/body")
        .expect("read runs")
        .expect("the blog body Part exists");
    let body = res.body.expect("a Part URI read must carry the prose body");
    assert!(
        !body.trim().is_empty(),
        "the Part body must be the actual prose, not empty"
    );

    // An Item-level read stays a summary — no body.
    let item = silan_viking_mcp::read(&root, "silan://resources/blog/hello-world")
        .expect("read runs")
        .expect("the blog Item exists");
    assert!(
        item.body.is_none(),
        "an Item read is a summary, it must not carry a Part body"
    );

    let _ = std::fs::remove_dir_all(&root);
}
