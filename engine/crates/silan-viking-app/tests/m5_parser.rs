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
    // blog ×1, idea ×1, project ×1, episode ×1, update ×1, resume ×1.
    assert_eq!(report.len(), 6, "one item per content type in the fixture");
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
fn idea_parses_four_parts_with_progress_bilingual() {
    let ws = workspace();
    let report = ws.scan().expect("scan succeeds");
    let idea = report
        .items()
        .iter()
        .find(|i| i.kind() == ContentKind::Idea)
        .expect("the multi-tab idea");

    // The Part dimension: 4 roles.
    assert_eq!(idea.parts().len(), 4, "overview/progress/reference/result");

    // The Lang dimension is distinct from the Part dimension: `progress`
    // alone has two language files; the other parts have one.
    let parser = ws.parsers().parser_for(idea).expect("idea parser");
    let parsed = parser.parse(idea).expect("idea parses");
    assert_eq!(
        parsed.languages().count(),
        2,
        "the idea has en + zh across its parts"
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
