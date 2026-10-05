//! M5 acceptance — parser-layer scenario tests.
//!
//! Per `docs/silan-viking/05` §5.3, these drive the parser main chain over
//! the fixture content repo:
//! `Workspace::scan -> Item.kind -> ParserRegistry::parser_for -> parse ->
//! validate`. They verify the closed registry dispatches by `Item.kind()`,
//! that the Part / Lang dimensions stay distinct, and that config-driven
//! Parts work without a Rust change.

use silan_viking_app::{ContentKind, Workspace};

/// The fixture content repo. Path is relative to this crate's manifest dir;
/// the fixtures live at `engine/tests/fixtures/content/`.
fn fixture_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
}

fn workspace() -> Workspace {
    Workspace::open(fixture_root()).expect("fixture workspace opens")
}

#[test]
fn scan_finds_every_fixture_item() {
    let report = workspace().scan().expect("scan succeeds");
    // blog ×1, project ×1, episode ×1, moment ×1, resume ×1. Ideas are a
    // legacy source shape and deliberately absent from ContentKind::ALL.
    assert_eq!(report.len(), 5, "one item per active content type");
}

#[test]
fn parser_registry_dispatches_by_item_kind() {
    let ws = workspace();
    let report = ws.scan().expect("scan succeeds");
    for item in report.items() {
        let parser = ws.parsers().parser_for(item).expect("parser found");
        assert_eq!(
            parser.content_type(),
            item.kind(),
            "the registry must dispatch to a parser of the item's own kind"
        );
    }
}

#[test]
fn legacy_idea_fixture_is_not_projected_as_active_content() {
    let report = workspace().scan().expect("scan succeeds");
    assert!(
        report
            .items()
            .iter()
            .all(|item| item.kind() != ContentKind::Idea),
        "legacy ideas must not silently re-enter the active projection"
    );
}

#[test]
fn the_full_parse_chain_runs_for_every_item() {
    let ws = workspace();
    let report = ws.scan().expect("scan succeeds");
    for item in report.items() {
        let parser = ws.parsers().parser_for(item).expect("parser found");
        let parsed = parser.parse(item).expect("item parses");
        assert_eq!(parsed.kind(), item.kind());
        // No item in the fixture has a fatal validation issue.
        let issues = parser.validate(item, &parsed);
        let fatal: Vec<_> = issues.iter().filter(|i| i.is_fatal()).collect();
        assert!(
            fatal.is_empty(),
            "fixture item `{}` has fatal issues: {fatal:?}",
            item.slug()
        );
    }
}

#[test]
fn resume_parses_entries_and_personal_info() {
    let ws = workspace();
    let report = ws.scan().expect("scan succeeds");
    let resume = report
        .items()
        .iter()
        .find(|i| i.kind() == ContentKind::Resume)
        .expect("the resume item");

    let parser = ws.parsers().parser_for(resume).expect("resume parser");
    let parsed = parser.parse(resume).expect("resume parses");

    // Personal info: `full_name` is translatable, so it lands per language.
    let has_full_name = parsed
        .langs()
        .values()
        .any(|v| v.get("full_name").is_some());
    assert!(has_full_name, "resume carries full_name per language");

    // education is an entry_list Part: its TOML entries are parsed.
    let education = parsed.entries_of(&silan_viking_app::PartRole::new("education"));
    assert!(
        !education.is_empty(),
        "the education entry_list yields at least one entry"
    );
    assert_eq!(education[0].entry_id(), "e_education_nus");
}

#[test]
fn relations_are_parsed_from_frontmatter() {
    let ws = workspace();
    let report = ws.scan().expect("scan succeeds");
    let project = report
        .items()
        .iter()
        .find(|i| i.kind() == ContentKind::Project)
        .expect("the sample project");

    let parser = ws.parsers().parser_for(project).expect("project parser");
    let parsed = parser.parse(project).expect("project parses");
    assert_eq!(
        parsed.relations().len(),
        1,
        "the project declares one evolved_from relation"
    );
}

/// Lay down one single-language blog Item; `extra` is appended to its
/// frontmatter.
fn write_blog(content: &std::path::Path, slug: &str, id: &str, extra: &str) {
    let dir = content.join("resources/blog").join(slug);
    std::fs::create_dir_all(dir.join("parts/body")).expect("mkdir");
    std::fs::write(dir.join("item.toml"), format!("item_id = \"i_{id}\"\n")).expect("item");
    std::fs::write(
        dir.join("parts/body/meta.toml"),
        format!(
            "part_id = \"p_{id}\"\ntype = \"body\"\nshape = \"prose\"\ncanonical_lang = \"en\"\n"
        ),
    )
    .expect("meta");
    std::fs::write(
        dir.join("parts/body/en.md"),
        format!(
            "---\nslug: {slug}\ntitle: T\nkind: blog\ncontent_type: article\nvisibility: private\n{extra}---\n\nBody.\n"
        ),
    )
    .expect("md");
}

#[test]
fn seeded_samples_are_not_asked_for_translations() {
    let root = tempfile::tempdir().expect("temp");
    let content = root.path().join("content");
    std::fs::create_dir_all(&content).expect("content");
    std::fs::copy(fixture_root().join("SCHEMA.md"), content.join("SCHEMA.md")).expect("schema");
    write_blog(
        &content,
        "welcome",
        "01ARZ3NDEKTSV4RRFFQ69G5FA1",
        "sample: true\n",
    );
    write_blog(&content, "real-post", "01ARZ3NDEKTSV4RRFFQ69G5FA2", "");

    let issues = Workspace::open(&content)
        .expect("open")
        .lint(None)
        .expect("lint");

    let untranslated = issues
        .iter()
        .filter(|issue| issue.message.contains("has no translation"))
        .map(|issue| issue.uri.as_str())
        .collect::<Vec<_>>();
    assert_eq!(untranslated, ["silan://resources/blog/real-post"]);
}
