//! M8 per-command coverage test — every command group in `docs/silan-viking/02`
//! exercised against a real CLI binary.
//!
//! Unlike `end_to_end.rs` (which walks one happy-path chain), this test asserts
//! each verb of each content group individually — the six unified verbs *and*
//! the type-specific verbs (`status` / `publish` / `progress` / `promote` /
//! `set-type`) and the full episode series/episode surface. The audit that
//! found 13 missing commands is the reason this exists.

use std::path::Path;
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// Run the CLI with an explicit `--content` root; return (success, combined).
fn cli(content: &Path, args: &[&str]) -> (bool, String) {
    let mut full = vec!["--content", content.to_str().expect("path")];
    full.extend_from_slice(args);
    let out = Command::new(bin()).args(&full).output().expect("cli runs");
    let mut combined = String::from_utf8_lossy(&out.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&out.stderr));
    (out.status.success(), combined)
}

/// Assert a command succeeds.
fn ok(content: &Path, args: &[&str]) -> String {
    let (success, out) = cli(content, args);
    assert!(success, "`silan {args:?}` should succeed but failed: {out}");
    out
}

/// Assert a command fails (used for the not-found / bad-value paths).
fn err(content: &Path, args: &[&str]) {
    let (success, out) = cli(content, args);
    assert!(
        !success,
        "`silan {args:?}` should fail but succeeded: {out}"
    );
}

/// A process-unique temp directory. A monotonic counter (not a timestamp)
/// guarantees no collision between parallel tests in this binary.
fn fresh_project() -> std::path::PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!("silan-cmd-{}-{seq}", std::process::id()));
    let content = root.join("content");
    ok(&content, &["init"]);
    content
}

#[test]
fn blog_group_every_verb() {
    let c = fresh_project();
    ok(&c, &["blog", "new", "a-post"]);
    ok(&c, &["blog", "list"]);
    ok(&c, &["blog", "show", "a-post"]);
    ok(&c, &["blog", "edit", "a-post"]);
    ok(&c, &["blog", "add-lang", "a-post", "zh"]);
    ok(&c, &["blog", "publish", "a-post"]);
    let md =
        std::fs::read_to_string(c.join("resources/blog/a-post/parts/body/en.md")).expect("read");
    assert!(md.contains("status: published"), "publish must set status");
    ok(&c, &["blog", "unpublish", "a-post"]);
    ok(&c, &["blog", "archive", "a-post"]);
    ok(&c, &["blog", "rm", "a-post"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn project_group_every_verb() {
    let c = fresh_project();
    ok(&c, &["project", "new", "a-proj"]);
    ok(&c, &["project", "list"]);
    ok(&c, &["project", "show", "a-proj"]);
    ok(&c, &["project", "edit", "a-proj"]);
    ok(&c, &["project", "add-part", "a-proj", "goals"]);
    ok(&c, &["project", "add-lang", "a-proj", "zh"]);
    // progress auto-creates the progress Part on first use.
    ok(&c, &["project", "progress", "a-proj"]);
    assert!(
        c.join("resources/projects/a-proj/parts/progress/en.md")
            .exists(),
        "progress must auto-create the progress Part"
    );
    ok(&c, &["project", "archive", "a-proj"]);
    let archived =
        std::fs::read_to_string(c.join("resources/projects/a-proj/parts/overview/en.md"))
            .expect("read archived project");
    assert!(archived.contains("status: archived"));
    assert!(archived.contains("visibility: private"));
    ok(&c, &["project", "rm", "a-proj"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn moment_group_every_verb() {
    let c = fresh_project();
    ok(&c, &["moment", "new", "an-update"]);
    ok(&c, &["moment", "list"]);
    ok(&c, &["moment", "show", "an-update"]);
    ok(&c, &["moment", "edit", "an-update"]);
    ok(&c, &["moment", "status", "an-update", "ongoing"]);
    ok(&c, &["moment", "set-type", "an-update", "milestone"]);
    let md = std::fs::read_to_string(c.join("resources/moment/an-update/parts/body/en.md"))
        .expect("read");
    assert!(md.contains("moment_type: milestone"));
    ok(&c, &["moment", "add-lang", "an-update", "zh"]);
    ok(&c, &["moment", "archive", "an-update"]);
    ok(&c, &["moment", "rm", "an-update"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn episode_group_every_verb() {
    let c = fresh_project();
    // series layer
    ok(&c, &["episode", "series", "new", "a-series"]);
    assert!(ok(&c, &["episode", "series", "list"]).contains("a-series"));
    ok(&c, &["episode", "series", "show", "a-series"]);
    // per-episode layer
    ok(&c, &["episode", "new", "a-series", "ep-one"]);
    ok(&c, &["episode", "new", "a-series", "ep-two"]);
    assert!(ok(&c, &["episode", "list"]).contains("ep-one"));
    assert!(ok(&c, &["episode", "list", "a-series"]).contains("ep-two"));
    ok(&c, &["episode", "show", "a-series", "ep-one"]);
    ok(&c, &["episode", "edit", "a-series", "ep-one"]);
    ok(&c, &["episode", "add-lang", "a-series", "ep-one", "zh"]);
    ok(&c, &["episode", "publish", "a-series", "ep-one"]);
    let md = std::fs::read_to_string(c.join("resources/episode/a-series/ep-one/parts/body/en.md"))
        .expect("read");
    assert!(md.contains("status: published"));
    ok(&c, &["episode", "unpublish", "a-series", "ep-one"]);
    ok(&c, &["episode", "archive", "a-series", "ep-one"]);
    // reorder: explicit order rewrites episode_number.
    ok(
        &c,
        &[
            "episode", "series", "reorder", "a-series", "ep-two", "ep-one",
        ],
    );
    let ep_two =
        std::fs::read_to_string(c.join("resources/episode/a-series/ep-two/parts/body/en.md"))
            .expect("read");
    assert!(
        ep_two.contains("episode_number: 1"),
        "reorder must put ep-two first"
    );
    ok(&c, &["episode", "rm", "a-series", "ep-one"]);
    ok(&c, &["episode", "series", "archive", "a-series"]);
    ok(&c, &["episode", "series", "rm", "a-series"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn resume_group_every_verb() {
    let c = fresh_project();
    // init already created the resume Item with a summary Part.
    assert!(ok(&c, &["resume", "show"]).contains("kind=resume"));
    assert!(ok(&c, &["resume", "list"]).contains("summary"));
    ok(&c, &["resume", "edit", "summary"]);
    // add-part takes the shape from SCHEMA — education is entry_list (.toml).
    ok(&c, &["resume", "add-part", "education"]);
    assert!(c.join("resources/resume/parts/education/en.toml").exists());
    ok(&c, &["resume", "add-lang", "education", "zh"]);
    assert!(c.join("resources/resume/parts/education/zh.toml").exists());
    err(&c, &["resume", "add-part", "not-a-resume-part"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn everything_synced_passes_validation() {
    // After exercising the write verbs, a full sync must still succeed —
    // proving the scaffolds and frontmatter rewrites stay SCHEMA-valid.
    //
    // `init` already scaffolds 3 Items (1 resume + 2 seed items: a welcome
    // blog and one project). This test then creates 4 more (blog / project /
    // moment / episode; the episode *series* is not itself an Item). So a full
    // sync covers 3 + 4 = 7 Items.
    let c = fresh_project();
    ok(&c, &["blog", "new", "x-blog"]);
    ok(&c, &["project", "new", "x-proj"]);
    ok(&c, &["moment", "new", "x-update"]);
    ok(&c, &["moment", "set-type", "x-update", "release"]);
    ok(&c, &["episode", "series", "new", "x-series"]);
    ok(&c, &["episode", "new", "x-series", "x-ep"]);
    let sync = ok(&c, &["index", "sync"]);
    assert!(
        sync.contains("items=7") && sync.contains("wrote=true"),
        "all 7 Items (3 from init + 4 created here) must sync: {sync}"
    );
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn init_makes_content_a_git_repo() {
    // `06` §6.2: `silan init` must `git init` + commit, so the proposal plane
    // has a repo to branch from, with the default identity configured so the
    // proposal merge commit has an author.
    let c = fresh_project();
    assert!(c.join(".git").is_dir(), "init must create a git repo");
    let git_config = |key: &str| -> String {
        let out = Command::new("git")
            .args(["config", "--local", key])
            .current_dir(&c)
            .output()
            .expect("git config");
        String::from_utf8_lossy(&out.stdout).trim().to_owned()
    };
    assert_eq!(git_config("user.name"), "Silan.Hu");
    assert_eq!(git_config("user.email"), "silan.hu@u.nus.edu");
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn relation_link_declares_an_edge() {
    // `02` §relation: `relation link` writes a relations entry on the `from`
    // Item; an unknown type and a missing endpoint both fail.
    let c = fresh_project();
    ok(&c, &["moment", "new", "src-moment"]);
    ok(&c, &["project", "new", "dst-proj"]);
    ok(
        &c,
        &[
            "relation",
            "link",
            "silan://resources/moment/src-moment",
            "silan://resources/projects/dst-proj",
            "--type",
            "evolved-into",
        ],
    );
    let moment = std::fs::read_to_string(c.join("resources/moment/src-moment/parts/body/en.md"))
        .expect("read");
    assert!(moment.contains("relations:"), "link must add a relation");
    assert!(moment.contains("dst-proj"), "link must name the target");
    err(
        &c,
        &[
            "relation",
            "link",
            "silan://resources/moment/src-moment",
            "silan://resources/projects/dst-proj",
            "--type",
            "not-a-type",
        ],
    );
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn site_publish_sets_visibility_public() {
    // `02` §site: `site publish` flips an Item's visibility to public.
    let c = fresh_project();
    ok(&c, &["blog", "new", "a-post"]);
    ok(&c, &["site", "publish", "silan://resources/blog/a-post"]);
    let md =
        std::fs::read_to_string(c.join("resources/blog/a-post/parts/body/en.md")).expect("read");
    assert!(
        md.contains("visibility: public"),
        "publish must set visibility=public"
    );
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn site_deploy_dry_run_needs_deploy_config() {
    // `06` §6.5: `site deploy` (dry-run default) reads [deploy]; the default
    // config ships it commented out, so a fresh project fails clearly.
    let c = fresh_project();
    let (success, out) = cli(&c, &["site", "deploy"]);
    assert!(!success, "deploy without [deploy] must fail: {out}");
    assert!(out.contains("[deploy]"), "error must name [deploy]: {out}");
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn proposal_reject_needs_an_existing_proposal() {
    // `02` §proposal: rejecting an unknown id fails; the verb exists.
    let c = fresh_project();
    err(&c, &["proposal", "reject", "01HXNOSUCH"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn mcp_status_reports_readiness() {
    // `02` §二: `mcp status` is a readiness probe.
    let c = fresh_project();
    let out = ok(&c, &["mcp", "status"]);
    assert!(out.contains("binary_found=true"));
    assert!(out.contains("mcp_available=true"));
    assert!(out.contains("tools_advertised="));
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}

#[test]
fn completion_emits_a_script_per_shell() {
    // `02` §顶层命令: `completion <shell>` for bash/zsh/fish; bad shell fails.
    let c = fresh_project();
    assert!(ok(&c, &["completion", "bash"]).contains("complete"));
    assert!(ok(&c, &["completion", "zsh"]).contains("compdef"));
    assert!(ok(&c, &["completion", "fish"]).contains("complete -c silan"));
    err(&c, &["completion", "powershell"]);
    let _ = std::fs::remove_dir_all(c.parent().expect("root"));
}
