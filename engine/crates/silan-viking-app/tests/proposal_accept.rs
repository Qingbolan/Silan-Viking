//! M7 `accept` atomicity tests (`04` M7 acceptance: "accept 原子性测试 ——
//! 陈旧 / 冲突 / 重校验").
//!
//! Each test builds a real `content/` Git repo from the shared fixture, makes
//! a `proposal/<id>` branch, and exercises `Workspace::accept_proposal`. The
//! invariant under test: every failure mode leaves the main branch exactly
//! where it was; only a merged-and-validated commit advances it.

use silan_viking_app::{ProposalId, ProposalKind, Workspace};
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
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
}

/// Copy the fixture `content/` tree into a fresh temp dir and `git init` it as
/// the proposal repo. Returns the content root.
fn fresh_content_repo(tag: &str) -> PathBuf {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content");
    let root = std::env::temp_dir().join(format!(
        "silan-accept-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    copy_dir(&fixture, &root);

    git(&root, &["init", "-q", "-b", "main"]);
    git(&root, &["config", "user.email", "test@silan.dev"]);
    git(&root, &["config", "user.name", "silan-test"]);
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-q", "-m", "fixture content"]);
    root
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
            std::fs::copy(&from, &to).expect("copy file");
        }
    }
}

/// Create a `proposal/<id>` branch that edits one Part file, then return to
/// `main`. `edit` is applied to the file at `rel_path` while on the branch.
fn make_proposal_branch(root: &Path, id: &str, rel_path: &str, edit: &str) {
    let branch = format!("proposal/{id}");
    git(root, &["checkout", "-q", "-b", &branch]);
    let file = root.join(rel_path);
    let original = std::fs::read_to_string(&file).expect("read part file");
    std::fs::write(&file, format!("{original}\n{edit}\n")).expect("write part file");
    git(root, &["add", "-A"]);
    git(root, &["commit", "-q", "-m", &format!("proposal {id}")]);
    git(root, &["checkout", "-q", "main"]);
}

#[test]
fn accept_advances_main_to_validated_merge() {
    let root = fresh_content_repo("ok");
    let ws = Workspace::open(&root).expect("workspace opens");

    let id = ProposalId::new("01HACCEPTOK").expect("valid id");
    ws.register_proposal(
        &id,
        ProposalKind::Modify,
        vec!["silan://resources/blog/hello-world/body".to_owned()],
    )
    .expect("register proposal");
    make_proposal_branch(
        &root,
        "01HACCEPTOK",
        "resources/blog/hello-world/parts/body/en.md",
        "An extra paragraph from the proposal.",
    );

    let main_before = git(&root, &["rev-parse", "refs/heads/main"]);
    let report = ws.accept_proposal(&id).expect("accept succeeds");
    let main_after = git(&root, &["rev-parse", "refs/heads/main"]);

    assert_eq!(report.previous_main, main_before);
    assert_eq!(report.new_main, main_after);
    assert_ne!(main_before, main_after, "main must advance on accept");

    // The accepted change is on the main branch.
    let body = git(
        &root,
        &["show", "main:resources/blog/hello-world/parts/body/en.md"],
    );
    assert!(
        body.contains("An extra paragraph from the proposal."),
        "the accepted body must be on the main branch"
    );

    // Regression for P14: `accept` must also sync the working tree, so the
    // accepted content is actually on disk for `index sync` to scan. After a
    // clean accept the working tree equals HEAD and the file holds the edit.
    let status = git(&root, &["status", "--porcelain"]);
    assert!(
        status.is_empty(),
        "accept must leave a clean working tree, got: {status}"
    );
    let on_disk = std::fs::read_to_string(root.join("resources/blog/hello-world/parts/body/en.md"))
        .expect("the accepted Part file must exist in the working tree");
    assert!(
        on_disk.contains("An extra paragraph from the proposal."),
        "the working-tree file must hold the accepted edit"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn accept_refuses_a_dirty_working_tree() {
    // Regression for P14: `accept` ends by `reset --hard`-ing the working
    // tree onto the merge commit. If the tree has uncommitted edits, that
    // would silently discard them — so `accept` must refuse up front and
    // leave `main` untouched.
    let root = fresh_content_repo("dirty");
    let ws = Workspace::open(&root).expect("workspace opens");

    let id = ProposalId::new("01HDIRTYTREE").expect("valid id");
    ws.register_proposal(&id, ProposalKind::Modify, vec![])
        .expect("register");
    make_proposal_branch(
        &root,
        "01HDIRTYTREE",
        "resources/blog/hello-world/parts/body/en.md",
        "A proposal edit.",
    );

    // Dirty the working tree with an uncommitted edit to a different file.
    let dirtied = root.join("SCHEMA.md");
    let original = std::fs::read_to_string(&dirtied).expect("read SCHEMA.md");
    std::fs::write(&dirtied, format!("{original}\n<!-- uncommitted -->\n"))
        .expect("dirty the tree");

    let main_before = git(&root, &["rev-parse", "refs/heads/main"]);
    let result = ws.accept_proposal(&id);
    let main_after = git(&root, &["rev-parse", "refs/heads/main"]);

    assert!(result.is_err(), "accept must refuse a dirty working tree");
    assert_eq!(main_before, main_after, "main must not move when refused");
    // The uncommitted edit survives untouched.
    let preserved = std::fs::read_to_string(&dirtied).expect("read SCHEMA.md");
    assert!(
        preserved.contains("<!-- uncommitted -->"),
        "the uncommitted edit must be preserved"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn accept_with_merge_conflict_leaves_main_untouched() {
    let root = fresh_content_repo("conflict");
    let ws = Workspace::open(&root).expect("workspace opens");

    let id = ProposalId::new("01HCONFLICT").expect("valid id");
    ws.register_proposal(&id, ProposalKind::Modify, vec![])
        .expect("register");

    let rel = "resources/blog/hello-world/parts/body/en.md";
    make_proposal_branch(&root, "01HCONFLICT", rel, "PROPOSAL EDIT at the tail.");

    // Advance main with a conflicting edit to the same tail region.
    let file = root.join(rel);
    let original = std::fs::read_to_string(&file).expect("read");
    std::fs::write(&file, format!("{original}\nMAIN EDIT at the tail.\n")).expect("write");
    git(&root, &["add", "-A"]);
    git(&root, &["commit", "-q", "-m", "conflicting main edit"]);

    let main_before = git(&root, &["rev-parse", "refs/heads/main"]);
    let result = ws.accept_proposal(&id);
    let main_after = git(&root, &["rev-parse", "refs/heads/main"]);

    assert!(result.is_err(), "conflicting accept must fail");
    assert_eq!(main_before, main_after, "main must not move on conflict");

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn accept_of_unknown_proposal_is_rejected() {
    let root = fresh_content_repo("unknown");
    let ws = Workspace::open(&root).expect("workspace opens");
    let id = ProposalId::new("01HNOSUCH").expect("valid id");
    let result = ws.accept_proposal(&id);
    assert!(
        result.is_err(),
        "accepting a non-existent proposal must fail"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn list_proposals_returns_registered_records() {
    let root = fresh_content_repo("list");
    let ws = Workspace::open(&root).expect("workspace opens");

    for raw in ["01HONE", "01HTWO"] {
        let id = ProposalId::new(raw).expect("valid id");
        ws.register_proposal(&id, ProposalKind::Modify, vec![])
            .expect("register");
    }
    let listed = ws.list_proposals().expect("list");
    let ids: Vec<_> = listed.iter().map(|r| r.id.clone()).collect();
    assert_eq!(ids, vec!["01HONE".to_owned(), "01HTWO".to_owned()]);

    let _ = std::fs::remove_dir_all(&root);
}
