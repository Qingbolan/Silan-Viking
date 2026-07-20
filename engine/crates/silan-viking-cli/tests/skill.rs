//! M8 skill package e2e test (`docs/silan-viking/13`).
//!
//! Drives `silan skill emit / status / rm` against the real binary and
//! asserts the generated `SKILL.md` + `reference/mcp-tools.md` match the
//! `13` contract: frontmatter, the four body sections, the natural-language
//! translation table, and the relative MCP start convention.

use std::path::{Path, PathBuf};
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// A fresh initialised project; returns its content root.
fn fresh_content() -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let root = std::env::temp_dir().join(format!(
        "silan-skill-{}-{}",
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let content = root.join("content");
    let ok = Command::new(bin())
        .args(["--content", content.to_str().expect("path"), "init"])
        .status()
        .expect("init runs")
        .success();
    assert!(ok, "init must succeed");
    content
}

/// Run the CLI; return (success, stdout, stderr).
fn run(content: &Path, args: &[&str]) -> (bool, String, String) {
    let mut full = vec!["--content", content.to_str().expect("path")];
    full.extend_from_slice(args);
    let out = Command::new(bin()).args(&full).output().expect("cli runs");
    (
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

#[test]
fn emit_renders_the_full_skill_package() {
    let content = fresh_content();
    let pkg = content.parent().expect("root").join("skillpkg");

    let (ok, _, stderr) = run(
        &content,
        &["skill", "emit", "--path", pkg.to_str().expect("path")],
    );
    assert!(ok, "skill emit failed: {stderr}");

    // SKILL.md — frontmatter + the four §13.4 body sections.
    let skill_md = std::fs::read_to_string(pkg.join("SKILL.md")).expect("SKILL.md");
    assert!(
        skill_md.starts_with("---\nname: silan-viking\n"),
        "SKILL.md must open with frontmatter"
    );
    assert!(skill_md.contains("description: silan's personal context system"));
    for section in [
        "## What this is",
        "## Connecting",
        "## When to do what",
        "## Three lines that must not be crossed",
        "## Reference",
    ] {
        assert!(skill_md.contains(section), "SKILL.md must have `{section}`");
    }
    // The translation table is keyed on natural language, not tool names.
    assert!(skill_md.contains("silan seems to be"));
    assert!(skill_md.contains("context_brief()"));
    // The type list is interpolated from SCHEMA.
    assert!(skill_md.contains("blog / project / episode / resume / moment"));

    // reference/mcp-tools.md — relative start convention, all 17 tools.
    let tools_md =
        std::fs::read_to_string(pkg.join("reference/mcp-tools.md")).expect("mcp-tools.md");
    assert!(tools_md.contains("silan mcp serve --stdio"));
    assert!(
        !tools_md.contains("127.0.0.1"),
        "must not bake in a host/port"
    );
    for tool in ["recall", "capture", "ctx_write", "propose", "stats"] {
        assert!(
            tools_md.contains(&format!("`{tool}`")),
            "must list `{tool}`"
        );
    }

    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn status_detects_install_state() {
    let content = fresh_content();
    let pkg = content.parent().expect("root").join("skillpkg");
    let pkg_str = pkg.to_str().expect("path");

    // Not installed yet.
    let (ok, stdout, _) = run(&content, &["skill", "status", "--path", pkg_str]);
    assert!(ok);
    assert!(stdout.contains("not installed"), "{stdout}");

    // After emit — up to date.
    run(&content, &["skill", "emit", "--path", pkg_str]);
    let (ok, stdout, _) = run(&content, &["skill", "status", "--path", pkg_str]);
    assert!(ok);
    assert!(stdout.contains("up to date"), "{stdout}");

    // Tamper with the package — status reports stale.
    let skill_md = pkg.join("SKILL.md");
    let mut text = std::fs::read_to_string(&skill_md).expect("read");
    text.push_str("\nedited by hand\n");
    std::fs::write(&skill_md, text).expect("tamper");
    let (ok, stdout, _) = run(&content, &["skill", "status", "--path", pkg_str]);
    assert!(ok);
    assert!(stdout.contains("stale"), "{stdout}");

    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn rm_removes_the_package() {
    let content = fresh_content();
    let pkg = content.parent().expect("root").join("skillpkg");
    let pkg_str = pkg.to_str().expect("path");

    run(&content, &["skill", "emit", "--path", pkg_str]);
    assert!(pkg.join("SKILL.md").exists());

    let (ok, stdout, _) = run(&content, &["skill", "rm", "--path", pkg_str]);
    assert!(ok);
    assert!(stdout.contains("removed"), "{stdout}");
    assert!(!pkg.exists(), "the package directory must be gone");

    // rm of an absent package is a clean no-op, not an error.
    let (ok, stdout, _) = run(&content, &["skill", "rm", "--path", pkg_str]);
    assert!(ok);
    assert!(stdout.contains("nothing to remove"), "{stdout}");

    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}

#[test]
fn emit_then_status_round_trips_for_a_real_install_location() {
    // emit is idempotent: emit, emit again, status must still be up-to-date.
    let content = fresh_content();
    let pkg = content.parent().expect("root").join("skillpkg");
    let pkg_str = pkg.to_str().expect("path");

    run(&content, &["skill", "emit", "--path", pkg_str]);
    run(&content, &["skill", "emit", "--path", pkg_str]);
    let (ok, stdout, _) = run(&content, &["skill", "status", "--path", pkg_str]);
    assert!(ok && stdout.contains("up to date"), "{stdout}");

    let _ = std::fs::remove_dir_all(content.parent().expect("root"));
}
