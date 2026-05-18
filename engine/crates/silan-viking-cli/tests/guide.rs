//! `silan-viking guide` integration tests — the stage-aware next-step hint.
//!
//! `guide` classifies the project (not-initialised / initialised-not-synced /
//! synced) and prints the matching next command. These tests drive the real
//! binary through each stage and assert the printed advice matches the stage.

use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// A fresh throwaway project root under the temp dir.
fn fixture(tag: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("silan-guide-{}-{tag}-{seq}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("root");
    root
}

/// Run the CLI against `root/content`; return (success, stdout+stderr).
fn cli(root: &std::path::Path, args: &[&str]) -> (bool, String) {
    let content = root.join("content");
    let mut full = vec!["--content", content.to_str().expect("path")];
    full.extend_from_slice(args);
    let out = Command::new(bin()).args(&full).output().expect("cli runs");
    let mut combined = String::from_utf8_lossy(&out.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&out.stderr));
    (out.status.success(), combined)
}

#[test]
fn guide_on_a_bare_dir_says_run_init() {
    let root = fixture("bare");
    let (ok, out) = cli(&root, &["guide"]);
    assert!(ok, "guide should succeed on a bare dir: {out}");
    assert!(out.contains("No silan-viking project"), "{out}");
    assert!(out.contains("silan-viking init"), "must point at init: {out}");
}

#[test]
fn init_ends_with_the_next_steps_block() {
    let root = fixture("init-tail");
    let (ok, out) = cli(&root, &["init"]);
    assert!(ok, "init should succeed: {out}");
    // init's tail is the guide block for a freshly created project.
    assert!(out.contains("Next steps"), "init must print Next steps: {out}");
    assert!(
        out.contains("silan-viking index sync"),
        "the first next step is index sync: {out}"
    );
}

#[test]
fn guide_after_init_points_at_index_sync() {
    let root = fixture("not-synced");
    assert!(cli(&root, &["init"]).0, "init");
    let (ok, out) = cli(&root, &["guide"]);
    assert!(ok, "{out}");
    assert!(
        out.contains("not yet synced"),
        "an initialised-but-unsynced project must be named as such: {out}"
    );
    assert!(out.contains("silan-viking index sync"), "{out}");
}

#[test]
fn guide_after_sync_points_at_preview_and_deploy() {
    let root = fixture("synced");
    assert!(cli(&root, &["init"]).0, "init");
    assert!(cli(&root, &["index", "sync"]).0, "index sync");
    let (ok, out) = cli(&root, &["guide"]);
    assert!(ok, "{out}");
    assert!(
        out.contains("initialised and synced"),
        "a synced project must be named as such: {out}"
    );
    assert!(out.contains("site preview"), "{out}");
    assert!(out.contains("site deploy"), "{out}");
}
