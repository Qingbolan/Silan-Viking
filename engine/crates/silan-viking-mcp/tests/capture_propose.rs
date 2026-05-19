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
        Some("# Revised body\n\nProposed via MCP.\n"),
        "en",
        &[],
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
fn propose_lang_targets_the_language_variant() {
    // An agent proposing a `zh` variant — e.g. a Chinese resume summary —
    // must land at `<role>/zh.md`, not the default `en.md`.
    let root = fresh_repo("propose-lang");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/blog/hello-world/body",
        Some("# 修订正文\n\n经 MCP 提案。\n"),
        "zh",
        &[],
    )
    .expect("propose succeeds");

    let part = "resources/blog/hello-world/parts/body/zh.md";
    let body = git(&root, &["show", &format!("{}:{part}", created.branch)]);
    assert!(body.contains("经 MCP 提案。"));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_accepts_a_part_role_the_type_does_not_declare() {
    // The SCHEMA `parts` list is a *recommended* set, not a closed whitelist:
    // an agent may extend an Item with a Part whose role the SCHEMA does not
    // predeclare. Proposing into such a role must succeed — the Part lands at
    // `parts/<role>/` with the default `prose` shape (`.md`), on its own
    // branch — so the content model can grow new sections without a SCHEMA
    // edit. An ill-formed role (not a lowercase identifier) is still rejected.
    let root = fresh_repo("propose-open-part");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/sample-project/benchmark",
        Some("a benchmark section the SCHEMA never declared"),
        "en",
        &[],
    )
    .expect("propose into an undeclared role must succeed (open-set Parts)");

    // The undeclared role lands at `parts/benchmark/` as prose (`.md`).
    let part = "resources/projects/sample-project/parts/benchmark/en.md";
    let body = git(&root, &["show", &format!("{}:{part}", created.branch)]);
    assert!(
        body.contains("a benchmark section the SCHEMA never declared"),
        "the undeclared Part must carry the proposed prose: {body}"
    );

    // An ill-formed role is still rejected before any branch is created.
    let main_before = git(&root, &["rev-parse", "main"]);
    let err = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/sample-project/BadRole",
        Some("bad"),
        "en",
        &[],
    )
    .expect_err("an ill-formed Part role must still be rejected");
    assert!(
        err.to_string().contains("valid")
            || err.to_string().contains("slug")
            || err.to_string().contains("role"),
        "error should explain the role is malformed: {err}"
    );
    assert_eq!(main_before, git(&root, &["rev-parse", "main"]));

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_to_an_item_uri_resolves_the_types_primary_part() {
    // An Item URI (no explicit Part) resolves to the type's primary Part —
    // the lowest-`order` Part the SCHEMA declares. For resume that is
    // `summary`, not the blog-only `body`.
    let root = fresh_repo("propose-item");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/resume/resume",
        Some("A short professional summary, proposed via MCP."),
        "en",
        &[],
    )
    .expect("propose to a resume Item succeeds");

    // resume is a single Item — `resources/resume/parts/`, no slug level.
    let part = "resources/resume/parts/summary/en.md";
    let body = git(&root, &["show", &format!("{}:{part}", created.branch)]);
    assert!(
        body.contains("proposed via MCP"),
        "the draft must land at the resume's primary `summary` Part"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_to_a_structured_part_lands_as_toml() {
    // Regression for P7: a Part whose SCHEMA `shape` is `entry_list` /
    // `key_value_list` is stored as `<lang>.toml`, not `.md`. A draft written
    // to `education/en.md` would be ignored by `index sync`. The extension
    // must come from the resolved Part's shape.
    let root = fresh_repo("propose-toml");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/resume/resume/education",
        Some("[[entries]]\ninstitution = \"NUS\"\ndegree = \"PhD\"\n"),
        "en",
        &[],
    )
    .expect("propose to an entry_list Part succeeds");

    // The draft landed at the .toml path — the .md path must not exist.
    // resume is a single Item: `resources/resume/parts/`, no slug level.
    let toml = "resources/resume/parts/education/en.toml";
    let body = git(&root, &["show", &format!("{}:{toml}", created.branch)]);
    assert!(body.contains("institution = \"NUS\""));

    let tree = git(&root, &["ls-tree", "-r", "--name-only", &created.branch]);
    assert!(
        !tree.contains("parts/education/en.md"),
        "an entry_list Part must not be drafted as .md: {tree}"
    );
    assert!(
        !tree.contains("resume/resume/parts"),
        "a resume draft must not be one directory too deep: {tree}"
    );

    // Regression for P15: a newly created Part must come with a `meta.toml`,
    // or `index sync` skips the whole directory. The manifest must name the
    // role and the shape that the SCHEMA declares for it.
    let meta = git(
        &root,
        &[
            "show",
            &format!(
                "{}:resources/resume/parts/education/meta.toml",
                created.branch
            ),
        ],
    );
    assert!(
        meta.contains("type           = \"education\""),
        "the new Part's meta.toml must record its role: {meta}"
    );
    assert!(
        meta.contains("shape          = \"entry_list\""),
        "the new Part's meta.toml must record its SCHEMA shape: {meta}"
    );
    assert!(
        meta.contains("part_id        = \"p_"),
        "the new Part's meta.toml must carry a generated part_id: {meta}"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_creates_a_multi_part_item_as_one_proposal() {
    // Regression for P19b: a new multi-Part Item must land as ONE proposal,
    // not one branch per Part. Per-Part branches cannot be accepted in
    // isolation — post-merge validation sees an Item missing its required
    // Parts. `extra_parts` carries the sibling Parts into the same branch.
    let root = fresh_repo("propose-multipart");

    let overview = "---\nslug: multi-demo\ntitle: Multi Demo\nkind: project\n\
                    status: active\nvisibility: private\n---\n\n# Multi Demo\n\noverview body.\n";
    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/multi-demo",
        Some(overview),
        "en",
        &[
            silan_viking_mcp::PartDraft {
                role: "goals".to_owned(),
                content: "# Goals\n\nthe goals.\n".to_owned(),
            },
            silan_viking_mcp::PartDraft {
                role: "quick_start".to_owned(),
                content: "# Quick Start\n\nrun it.\n".to_owned(),
            },
        ],
    )
    .expect("multi-part propose succeeds");

    // All three Parts — and their meta.toml — are on the ONE proposal branch.
    let tree = git(&root, &["ls-tree", "-r", "--name-only", &created.branch]);
    for part in ["overview", "goals", "quick_start"] {
        assert!(
            tree.contains(&format!("projects/multi-demo/parts/{part}/en.md")),
            "Part `{part}` must be on the proposal branch: {tree}"
        );
        assert!(
            tree.contains(&format!("projects/multi-demo/parts/{part}/meta.toml")),
            "Part `{part}` must carry a meta.toml: {tree}"
        );
    }

    // The frontmatter rides the primary (overview) Part.
    let body = git(
        &root,
        &[
            "show",
            &format!(
                "{}:resources/projects/multi-demo/parts/overview/en.md",
                created.branch
            ),
        ],
    );
    assert!(body.contains("kind: project") && body.contains("the goals") == false);

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_rejects_extra_parts_with_a_part_uri() {
    // `extra_parts` names sibling Parts of an Item, so it is meaningless with
    // a Part URI — that must be rejected, not silently mis-resolved.
    let root = fresh_repo("propose-extra-on-part");
    let err = silan_viking_mcp::propose(
        &root,
        "silan://resources/blog/hello-world/body",
        Some("# body\n"),
        "en",
        &[silan_viking_mcp::PartDraft {
            role: "goals".to_owned(),
            content: "x".to_owned(),
        }],
    )
    .expect_err("extra_parts with a Part URI must be rejected");
    assert!(err.to_string().contains("Item URI"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_rejects_an_ill_formed_slug() {
    // An agent that invents a pseudo-slug like `my-project#goals` (cramming a
    // Part role into the slug) must hit a clear error, not produce a stray
    // off-tree `projects/my-project#goals/` directory. A slug is validated
    // against `^[a-z0-9][a-z0-9-]*$`.
    let root = fresh_repo("propose-bad-slug");
    let err = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/silan-viking#goals",
        Some("---\nslug: x\nkind: project\n---\n\n# x\n"),
        "en",
        &[],
    )
    .expect_err("an ill-formed slug must be rejected");
    assert!(
        err.to_string().contains("not a valid slug"),
        "error should name the bad slug: {err}"
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_creates_an_episode_in_a_new_series() {
    // Regression for P21: `episode` is a container type — its Item URI is
    // 3-segment (`episode/<series>/<episode>`), one deeper than a flat type.
    // `propose` must (a) read that URI as an Item, not mis-read it as a flat
    // Part, and (b) lay down the container series' `series.toml`, or the
    // scanner has no series to attach the episode to.
    let root = fresh_repo("propose-episode");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/episode/how-to-series/getting-started",
        Some(
            "---\nslug: getting-started\ntitle: Getting Started\nkind: episode\n\
         series: how-to-series\nepisode_number: 1\nstatus: draft\n\
         visibility: private\n---\n\n# Getting Started\n\nepisode body.\n",
        ),
        "en",
        &[],
    )
    .expect("propose to an episode Item URI succeeds");

    let tree = git(&root, &["ls-tree", "-r", "--name-only", &created.branch]);
    // The episode's body Part landed at the 3-deep episode path.
    assert!(
        tree.contains("resources/episode/how-to-series/getting-started/parts/body/en.md"),
        "the episode body must land at the episode path: {tree}"
    );
    // The container series' `series.toml` was created.
    assert!(
        tree.contains("resources/episode/how-to-series/series.toml"),
        "a new series must get its series.toml: {tree}"
    );
    let series = git(
        &root,
        &[
            "show",
            &format!(
                "{}:resources/episode/how-to-series/series.toml",
                created.branch
            ),
        ],
    );
    assert!(
        series.contains("slug        = \"how-to-series\"")
            && series.contains("status      = \"ongoing\""),
        "series.toml must carry the series identity: {series}"
    );

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

#[test]
fn propose_returns_a_next_step_hint() {
    // A `propose` result carries a state-aware `hint`. Creating only the
    // primary Part of a multi-Part type (project) must hint at the sibling
    // Parts still unwritten — the call-site nudge that keeps an agent from
    // leaving a project a one-paragraph stub.
    let root = fresh_repo("propose-hint");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/hint-demo",
        Some(
            "---\nslug: hint-demo\ntitle: Hint Demo\nkind: project\n\
         status: active\nvisibility: private\n---\n\n# Hint Demo\n\noverview.\n",
        ),
        "en",
        &[],
    )
    .expect("propose succeeds");

    let hint = created.hint.expect("propose must return a hint");
    assert!(
        hint.contains("goals") && hint.contains("challenges"),
        "the hint must name the project's unwritten sibling Parts: {hint}"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_hints_at_an_entry_image_field() {
    // A structured Part whose entry schema carries an image/logo field — a
    // resume `experience` entry can have `company_logo_url` — must surface
    // that in the hint, so an agent fills the cover instead of leaving the
    // card a blank image.
    let root = fresh_repo("propose-img-hint");

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/resume/resume/experience",
        Some("[[entry]]\norganization = \"NUS\"\nrole = \"Researcher\"\n"),
        "en",
        &[],
    )
    .expect("propose to experience succeeds");

    let hint = created.hint.expect("propose must return a hint");
    assert!(
        hint.contains("logo") || hint.contains("image"),
        "the hint must mention the entry's image field: {hint}"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_with_only_parts_leaves_the_primary_part_untouched() {
    // Adding sibling Parts to an existing Item must not require — and must not
    // touch — the primary Part. Omitting `draft` and giving only `parts` adds
    // the siblings; the Item's existing `overview` is left exactly as it was.
    let root = fresh_repo("propose-parts-only");

    // The fixture's `projects/sample-project` already has an `overview`.
    let before = git(
        &root,
        &[
            "show",
            "HEAD:resources/projects/sample-project/parts/overview/en.md",
        ],
    );

    let created = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/sample-project",
        None,
        "en",
        &[silan_viking_mcp::PartDraft {
            role: "goals".to_owned(),
            content: "# Goals\n\nthe goals.\n".to_owned(),
        }],
    )
    .expect("propose with only parts succeeds");

    let tree = git(&root, &["ls-tree", "-r", "--name-only", &created.branch]);
    assert!(
        tree.contains("projects/sample-project/parts/goals/en.md"),
        "the new sibling Part must be on the branch: {tree}"
    );
    // The overview on the proposal branch is byte-identical to before.
    let after = git(
        &root,
        &[
            "show",
            &format!(
                "{}:resources/projects/sample-project/parts/overview/en.md",
                created.branch
            ),
        ],
    );
    assert_eq!(
        before, after,
        "propose with only `parts` must not rewrite the primary Part"
    );

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn propose_with_neither_draft_nor_parts_is_rejected() {
    // A `propose` that writes nothing is a mistake — it must be rejected.
    let root = fresh_repo("propose-empty");
    let err = silan_viking_mcp::propose(
        &root,
        "silan://resources/projects/sample-project",
        None,
        "en",
        &[],
    )
    .expect_err("propose with neither draft nor parts must be rejected");
    assert!(err.to_string().contains("cannot write nothing"));
    let _ = std::fs::remove_dir_all(&root);
}
