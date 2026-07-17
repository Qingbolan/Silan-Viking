//! Class-B drift gate — implementation ↔ documentation contract tests.
//!
//! `docs/silan-viking/14` §14.3 names three classes of schema/behaviour
//! drift. Class A (mapper ↔ entities) is gated inside `sync` by the
//! `SchemaDrift` check. Class C (`11` ↔ Go ent) was verified once and is
//! ~aligned. **Class B — implementation ↔ documentation — had no gate**:
//! nothing kept `silan init` matching `06` §6.2.1, or the `--help` text
//! matching the actual command set, or scaffolded `meta.toml` matching
//! `01` §1.3.1 / §1.4.
//!
//! This file is that gate. Each test pins one documented contract as an
//! executable assertion, so a future drift fails CI instead of lurking
//! until an e2e run trips over it (which is exactly how the 11 drifts of
//! `14` §14.1 were found — too late).

use std::path::{Path, PathBuf};
use std::process::Command;

fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// Run the CLI with an explicit `--content` root; return (success, output).
fn cli(content: &Path, args: &[&str]) -> (bool, String) {
    let mut full = vec!["--content", content.to_str().expect("path")];
    full.extend_from_slice(args);
    let out = Command::new(bin()).args(&full).output().expect("cli runs");
    let mut combined = String::from_utf8_lossy(&out.stdout).into_owned();
    combined.push_str(&String::from_utf8_lossy(&out.stderr));
    (out.status.success(), combined)
}

/// A fresh, process-unique project root with `silan init` already run.
fn fresh_init() -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!("silan-doc-{}-{seq}", std::process::id()));
    let content = root.join("content");
    let (ok, out) = cli(&content, &["init"]);
    assert!(ok, "`silan init` must succeed: {out}");
    content
}

// ── Contract 1 — `silan init` output, against `06` §6.2.1 ──────────────────
//
// `06` §6.2.1 specifies: init scaffolds the six content-type directories,
// three seed Items (a welcome blog, one idea, one project), the resume
// Item, `SCHEMA.md`, `silan-viking.toml`, and a git repo.

#[test]
fn init_scaffolds_the_six_type_directories() {
    let c = fresh_init();
    // `06` §6.2.1: all six content-type collection directories exist.
    for type_dir in ["blog", "ideas", "projects", "episode", "resume", "moment"] {
        assert!(
            c.join("resources").join(type_dir).is_dir(),
            "`06` §6.2.1: init must scaffold resources/{type_dir}/"
        );
    }
}

#[test]
fn init_scaffolds_the_three_seed_items_and_resume() {
    let c = fresh_init();
    // `06` §6.2.1: three seed Items — a welcome blog, one idea, one project.
    assert!(
        c.join("resources/blog/welcome/parts/body/en.md").is_file(),
        "`06` §6.2.1: init must seed a welcome blog"
    );
    assert!(
        c.join("resources/ideas/first-idea/parts/overview/en.md")
            .is_file(),
        "`06` §6.2.1: init must seed one idea"
    );
    assert!(
        c.join("resources/projects/first-project/parts/overview/en.md")
            .is_file(),
        "`06` §6.2.1: init must seed one project"
    );
    // The single resume Item (`02` §一 — every project has exactly one).
    assert!(
        c.join("resources/resume/parts/summary/en.md").is_file(),
        "init must scaffold the resume Item"
    );
}

#[test]
fn init_scaffolds_schema_config_and_git() {
    let c = fresh_init();
    assert!(c.join("SCHEMA.md").is_file(), "init must write SCHEMA.md");
    assert!(
        c.parent()
            .expect("root")
            .join("silan-viking.toml")
            .is_file(),
        "init must write silan-viking.toml at the project root"
    );
    assert!(
        c.join(".git").is_dir(),
        "`06` §6.2: init must `git init` the content/ repo"
    );
}

// ── Contract 2 — scaffolded `meta.toml`, against `01` §1.3.1 / §1.4 ────────
//
// `01` §1.3.1 / §1.4: a Part's `meta.toml` carries `part_id` (the stable
// `p_<ulid>` identity, minted at scaffold time — §1.4), `type`, `shape`,
// `canonical_lang`.

#[test]
fn scaffolded_meta_toml_carries_a_stable_part_id() {
    let c = fresh_init();
    let meta =
        std::fs::read_to_string(c.join("resources/ideas/first-idea/parts/overview/meta.toml"))
            .expect("read meta.toml");
    // `01` §1.4: `part_id` is minted at scaffold time, not by sync.
    assert!(
        meta.contains("part_id"),
        "`01` §1.4: scaffolded meta.toml must carry a part_id"
    );
    let part_id = meta
        .lines()
        .find(|l| l.trim_start().starts_with("part_id"))
        .and_then(|l| l.split('"').nth(1))
        .expect("part_id value");
    assert!(
        part_id.starts_with("p_"),
        "`01` §1.3: a PartId is `p_<ulid>`, got `{part_id}`"
    );
    // §1.3.1: the meta also declares type / shape / canonical_lang.
    for field in ["type", "shape", "canonical_lang"] {
        assert!(
            meta.contains(field),
            "`01` §1.3.1: meta.toml must declare `{field}`"
        );
    }
}

#[test]
fn scaffolded_item_toml_carries_a_stable_item_id() {
    let c = fresh_init();
    let path = c.join("resources/projects/first-project/item.toml");
    let first = std::fs::read_to_string(&path).expect("read item.toml");
    let item_id = first
        .lines()
        .find(|line| line.trim_start().starts_with("item_id"))
        .and_then(|line| line.split('"').nth(1))
        .expect("item_id value");
    assert!(item_id.starts_with("i_"), "ItemId must use the i_ prefix");

    let (ok, output) = cli(&c, &["index", "sync"]);
    assert!(ok, "sync must succeed: {output}");
    let second = std::fs::read_to_string(&path).expect("re-read item.toml");
    assert_eq!(first, second, "sync must not rewrite Item identity");
}

#[test]
fn scaffolded_part_id_is_stable_across_a_re_read() {
    // `01` §1.4: `index sync` reads `part_id`, never rewrites it — so two
    // reads of a freshly scaffolded Part see the same id.
    let c = fresh_init();
    let path = c.join("resources/blog/welcome/parts/body/meta.toml");
    let first = std::fs::read_to_string(&path).expect("read 1");
    let (ok, _) = cli(&c, &["index", "sync"]);
    assert!(ok, "sync must succeed");
    let second = std::fs::read_to_string(&path).expect("read 2");
    assert_eq!(
        first, second,
        "`01` §1.4: `index sync` must not rewrite a Part's meta.toml"
    );
}

// ── Contract 3 — `--help` ↔ the actual command set, against `02` ──────────
//
// `02` documents the command groups. The `--help` text must list what the
// binary actually accepts — a `--help` that promises an unimplemented form
// (the `content tree|ls <uri>` drift of `14` §14.1 #11) is class-B drift.

#[test]
fn help_lists_all_six_type_command_groups() {
    let out = Command::new(bin()).arg("--help").output().expect("help");
    let help = String::from_utf8_lossy(&out.stdout);
    // `02`: six type-specific command groups.
    for group in ["idea", "blog", "project", "episode", "resume", "moment"] {
        assert!(
            help.contains(group),
            "`02`: --help must list the `{group}` command group"
        );
    }
}

#[test]
fn help_promised_content_uri_arg_actually_works() {
    // `14` §14.1 #11: `--help` said `content tree|ls <uri>` but the impl
    // ignored the arg. This pins that the promised form really runs.
    let c = fresh_init();
    let (ok_tree, _) = cli(&c, &["content", "tree", "silan://resources/blog/welcome"]);
    assert!(
        ok_tree,
        "`content tree <uri>` is in --help — it must actually accept the uri"
    );
    let (ok_ls, ls_out) = cli(&c, &["content", "ls", "silan://resources/ideas"]);
    assert!(
        ok_ls,
        "`content ls <uri>` is in --help — it must actually accept the uri"
    );
    // The uri is a subtree filter: `ls ideas` shows the idea, not the blog.
    assert!(
        ls_out.contains("first-idea") && !ls_out.contains("welcome"),
        "`content ls <uri>` must filter to the named subtree"
    );
}
