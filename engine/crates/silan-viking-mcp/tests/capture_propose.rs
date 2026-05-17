//! M9 MCP `capture` / `propose` end-to-end tests (`03` §3.1).
//!
//! Each test builds a real `content/` Git repo from the fixture and drives
//! the MCP capture path, asserting a `proposal/<id>` branch and a registered
//! record are produced — and that the agent never writes the main branch.

use std::path::{Path, PathBuf};
use std::process::Command;

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

fn fresh_repo(tag: &str) -> PathBuf {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content");
    let root = std::env::temp_dir().join(format!(
        "silan-mcp-{tag}-{}-{}",
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
fn capture_creates_a_proposal_branch_without_touching_main() {
    let root = fresh_repo("capture");
    let main_before = git(&root, &["rev-parse", "main"]);

    let created =
        silan_viking_mcp::capture(&root, "a quick idea worth keeping").expect("capture succeeds");

    // A proposal branch exists and main is unchanged (#10 invariant).
    let branches = git(&root, &["branch", "--list"]);
    assert!(
        branches.contains(&created.branch),
        "branch `{}` should exist: {branches}",
        created.branch
    );
    let main_after = git(&root, &["rev-parse", "main"]);
    assert_eq!(main_before, main_after, "capture must not move main");

    // The note is on the proposal branch, under agent/notes/.
    let note_path = format!("agent/notes/{}.md", created.id);
    let on_branch = git(&root, &["show", &format!("{}:{note_path}", created.branch)]);
    assert!(on_branch.contains("a quick idea worth keeping"));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_writes_the_part_path_on_a_branch() {
    let root = fresh_repo("propose");
    let main_before = git(&root, &["rev-parse", "main"]);

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/blog/hello-world/body",
        "# Revised body\n\nProposed via MCP.\n",
    )
    .expect("propose succeeds");

    let main_after = git(&root, &["rev-parse", "main"]);
    assert_eq!(main_before, main_after, "propose must not move main");

    // The draft landed at the Part path on the proposal branch.
    let part = "resources/blog/hello-world/parts/body/en.md";
    let body = git(&root, &["show", &format!("{}:{part}", created.branch)]);
    assert!(body.contains("Proposed via MCP."));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn handshake_instructions_carry_schema_and_resources() {
    let root = fresh_repo("handshake");
    let instructions = silan_viking_mcp::server_instructions(&root, "silan-viking");
    assert_eq!(instructions.schema_version, 1);
    assert!(instructions.content_commit.is_some(), "git repo has a HEAD");
    assert!(instructions.key_resources.contains(&"silan://schema"));

    // The three read-only resources resolve.
    let schema =
        silan_viking_mcp::read_resource(&root, "silan://schema").expect("schema resource resolves");
    assert!(!schema.is_empty());
    let overview =
        silan_viking_mcp::read_resource(&root, "silan://overview").expect("overview resolves");
    assert!(overview.contains("silan://resources/"));

    let _ = std::fs::remove_dir_all(&root);
}
