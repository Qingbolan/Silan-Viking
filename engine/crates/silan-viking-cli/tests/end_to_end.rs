//! M8 end-to-end test — the full empty-project → content → skill chain.
//!
//! This is the M8-completion acceptance gate the milestone always should have
//! had: a fresh directory, `silan init`, then `new` for every content type,
//! `index sync`, read-back, and `skill emit` — every step asserted, no
//! pre-seeded fixture. If `silan init` ever writes an unparseable SCHEMA or a
//! scaffold writes to the wrong directory, this test fails.

use std::path::Path;
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// Run the CLI in `cwd`, returning (success, stdout, stderr).
fn run_in(cwd: &Path, args: &[&str]) -> (bool, String, String) {
    let out = Command::new(bin())
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("cli runs");
    (
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

/// Run the CLI in `cwd` and assert success, returning stdout.
fn ok_in(cwd: &Path, args: &[&str]) -> String {
    let (ok, stdout, stderr) = run_in(cwd, args);
    assert!(ok, "`silan {args:?}` failed: {stdout}{stderr}");
    stdout
}

#[test]
fn empty_project_to_skill_full_chain() {
    // A fresh, empty project root.
    let root = std::env::temp_dir().join(format!(
        "silan-e2e-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    std::fs::create_dir_all(&root).expect("mkdir project root");

    // 1. init — writes content/SCHEMA.md, silan-viking.toml, the resume Item.
    let init_out = ok_in(&root, &["init"]);
    assert!(init_out.contains("initialized"));
    assert!(
        root.join("silan-viking.toml").exists(),
        "init must write the default config file"
    );
    assert!(root.join("content/SCHEMA.md").exists());
    assert!(
        root.join("content/resources/resume/parts/summary/en.md")
            .exists(),
        "init must scaffold the single resume Item"
    );

    // The config has the required [project] and [database] sections.
    let config = std::fs::read_to_string(root.join("silan-viking.toml")).expect("read config");
    assert!(config.contains("[project]"));
    assert!(config.contains("[database]"));

    // 2. create every content type.
    ok_in(&root, &["idea", "new", "rust-context-engine"]);
    ok_in(&root, &["blog", "new", "hello-silan"]);
    ok_in(&root, &["project", "new", "viking-engine"]);
    ok_in(&root, &["update", "new", "q2-progress"]);
    ok_in(&root, &["episode", "series", "new", "rust-tales"]);
    ok_in(&root, &["episode", "new", "rust-tales", "episode-01"]);

    // 3. maintain an idea — add an optional Part and a language variant.
    ok_in(
        &root,
        &["idea", "add-part", "rust-context-engine", "progress"],
    );
    ok_in(&root, &["idea", "add-lang", "rust-context-engine", "zh"]);

    // 4. add a structured resume Part — shape is taken from SCHEMA.md.
    ok_in(&root, &["resume", "add-part", "education"]);
    assert!(
        root.join("content/resources/resume/parts/education/en.toml")
            .exists(),
        "an entry_list resume Part must scaffold a .toml file, not .md"
    );

    // 5. sync — parse + map + write the derived DB. Every Item must pass
    //    validation (this is what caught the missing `update.date` field).
    //    `init` scaffolds 4 Items (resume + 3 seed items, `06` §6.2.1) and
    //    this test creates 5 more (idea/blog/project/update/episode — the
    //    episode series is not an Item) → 9 Items in all.
    let sync_out = ok_in(&root, &["index", "sync"]);
    assert!(
        sync_out.contains("items=9"),
        "sync should see 9 Items (4 from init + 5 created here): {sync_out}"
    );

    // 6. read the content back.
    let ls = ok_in(&root, &["content", "ls"]);
    for uri in [
        "silan://resources/ideas/rust-context-engine",
        "silan://resources/blog/hello-silan",
        "silan://resources/projects/viking-engine",
        "silan://resources/update/q2-progress",
        "silan://resources/episode/episode-01",
        "silan://resources/resume/resume",
    ] {
        assert!(ls.contains(uri), "content ls must list {uri}: {ls}");
    }

    let idea_list = ok_in(&root, &["idea", "list"]);
    assert!(idea_list.contains("rust-context-engine"));

    let idea_show = ok_in(&root, &["idea", "show", "rust-context-engine"]);
    assert!(idea_show.contains("part=overview"));
    assert!(
        idea_show.contains("part=progress"),
        "the added Part must show"
    );

    // 7. archive — takes the Item off the site, file stays. idea has no
    //    `archived` status value, so archive sets visibility=unlisted
    //    (`10` rule 6: only visibility=public is projected).
    ok_in(&root, &["idea", "archive", "rust-context-engine"]);
    let archived = std::fs::read_to_string(
        root.join("content/resources/ideas/rust-context-engine/parts/overview/en.md"),
    )
    .expect("read");
    assert!(
        archived.contains("visibility: unlisted"),
        "archiving an idea must set visibility=unlisted: {archived}"
    );

    // 8. skill emit + status — the skill package round-trips.
    let skill_dir = root.join("skill-pkg");
    let emit = ok_in(
        &root,
        &["skill", "emit", "--path", skill_dir.to_str().expect("path")],
    );
    assert!(emit.contains("emitted"));
    // A freshly emitted package is up to date with the project.
    let status = ok_in(
        &root,
        &[
            "skill",
            "status",
            "--path",
            skill_dir.to_str().expect("path"),
        ],
    );
    assert!(
        status.contains("up to date"),
        "a just-emitted skill must be up to date: {status}"
    );

    // 9. doctor — the project is healthy end to end (9 Items: 4 from init
    //    + 5 created above).
    let doctor = ok_in(&root, &["doctor"]);
    assert!(doctor.contains("items=9"));

    let _ = std::fs::remove_dir_all(&root);
}
