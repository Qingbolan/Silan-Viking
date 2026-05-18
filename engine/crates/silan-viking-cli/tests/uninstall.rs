//! `silan-viking uninstall` integration tests — the destructive command.
//!
//! Two scopes (default keeps `content/`, `--purge` deletes it) and a loud
//! confirmation gate. These tests assert the *safety* properties: the plain
//! scope never touches `content/`, `--dry-run` deletes nothing, and the
//! `--purge` gate rejects a bare `y` so only a typed `purge` can wipe
//! authored content.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// A fresh throwaway project under the temp dir: `<root>/content`, a derived
/// `<root>/_deploy`, and a `<root>/silan-viking.toml`. Returns the project
/// root; the content dir is `root/content`.
fn fixture(tag: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!(
        "silan-uninstall-{}-{tag}-{seq}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("content")).expect("content dir");
    fs::create_dir_all(root.join("_deploy")).expect("_deploy dir");
    fs::write(root.join("content/SCHEMA.md"), "schema").expect("schema");
    fs::write(root.join("_deploy/portfolio.db"), "db").expect("db");
    fs::write(root.join("silan-viking.toml"), "cfg").expect("config");
    root
}

/// Run `uninstall` against `root/content`, feeding `stdin` to the prompt.
/// Returns (success, stdout+stderr combined).
fn run(root: &Path, args: &[&str], stdin: &str) -> (bool, String) {
    let content = root.join("content");
    let mut full = vec!["--content", content.to_str().expect("path"), "uninstall"];
    full.extend_from_slice(args);
    let mut child = Command::new(bin())
        .args(&full)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn cli");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(stdin.as_bytes())
        .expect("write stdin");
    let out = child.wait_with_output().expect("wait cli");
    let mut combined = String::from_utf8_lossy(&out.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&out.stderr));
    (out.status.success(), combined)
}

#[test]
fn dry_run_lists_targets_and_deletes_nothing() {
    let root = fixture("dry");
    let (ok, out) = run(&root, &["--dry-run"], "");
    assert!(ok, "dry-run should succeed: {out}");
    assert!(out.contains("--dry-run: nothing deleted"), "{out}");
    assert!(out.contains("_deploy"), "should list the derived dir: {out}");
    // Nothing removed.
    assert!(root.join("_deploy").exists(), "_deploy must survive dry-run");
    assert!(root.join("content").exists(), "content must survive dry-run");
}

#[test]
fn default_scope_removes_derived_but_keeps_content() {
    let root = fixture("default");
    let (ok, out) = run(&root, &["--yes"], "");
    assert!(ok, "uninstall --yes should succeed: {out}");
    assert!(!root.join("_deploy").exists(), "_deploy must be removed");
    assert!(
        root.join("content").exists(),
        "content/ must be KEPT in the default scope"
    );
    assert!(
        root.join("silan-viking.toml").exists(),
        "config must be kept in the default scope"
    );
}

#[test]
fn typed_no_aborts_without_deleting() {
    let root = fixture("abort");
    let (ok, out) = run(&root, &[], "n\n");
    assert!(ok, "an aborted uninstall is still exit 0: {out}");
    assert!(out.contains("aborted"), "{out}");
    assert!(root.join("_deploy").exists(), "abort must delete nothing");
}

#[test]
fn purge_gate_rejects_a_bare_yes() {
    let root = fixture("purge-y");
    // `--purge` would delete content/, so a reflexive `y` must NOT suffice.
    let (ok, out) = run(&root, &["--purge"], "y\n");
    assert!(ok, "{out}");
    assert!(out.contains("aborted"), "bare `y` must not confirm purge: {out}");
    assert!(
        root.join("content").exists(),
        "content/ must survive a bare-`y` purge attempt"
    );
}

#[test]
fn purge_with_the_confirm_word_deletes_content() {
    let root = fixture("purge-word");
    let (ok, out) = run(&root, &["--purge"], "purge\n");
    assert!(ok, "{out}");
    assert!(
        !root.join("content").exists(),
        "typed `purge` must delete content/"
    );
    assert!(!root.join("_deploy").exists(), "_deploy also gone on purge");
    assert!(
        !root.join("silan-viking.toml").exists(),
        "config also gone on purge"
    );
}

#[test]
fn unknown_flag_reports_the_usage_hint() {
    let root = fixture("badflag");
    let (ok, out) = run(&root, &["--wat"], "");
    assert!(!ok, "an unknown flag must fail");
    assert!(out.contains("uninstall"), "{out}");
    assert!(
        out.contains("--purge") && out.contains("--dry-run"),
        "the hint must list the real flags: {out}"
    );
}
