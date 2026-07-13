use rusqlite::Connection;
use silan_viking_app::{CaptureError, ContentCreator, IdeaCategory};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
}

fn copy_tree(source: &Path, destination: &Path) {
    fs::create_dir_all(destination).expect("create fixture destination");
    for entry in fs::read_dir(source).expect("read fixture directory") {
        let entry = entry.expect("fixture entry");
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_tree(&source_path, &destination_path);
        } else {
            fs::copy(source_path, destination_path).expect("copy fixture file");
        }
    }
}

fn idea_directories(root: &Path) -> BTreeSet<String> {
    fs::read_dir(root.join("resources/ideas"))
        .expect("read ideas")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

fn project_directories(root: &Path) -> BTreeSet<String> {
    fs::read_dir(root.join("resources/projects"))
        .expect("read projects")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .collect()
}

#[test]
fn capture_creates_markdown_source_then_projects_it() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);
    let creator = ContentCreator::open(&content_root).expect("open creator");

    let captured = creator
        .capture_idea_and_sync(
            "记录真正的本地 Markdown 想法。\n\n后续可以继续发展。",
            IdeaCategory::Inspiration,
            &db_path,
        )
        .expect("capture idea");

    let item_root = content_root.join("resources/ideas").join(&captured.slug);
    assert!(item_root.join("item.toml").is_file());
    assert!(item_root.join("parts/overview/meta.toml").is_file());
    let markdown =
        fs::read_to_string(item_root.join("parts/overview/en.md")).expect("read captured Markdown");
    assert!(markdown.contains("category: inspiration"));
    assert!(markdown.contains("记录真正的本地 Markdown 想法。"));

    let connection = Connection::open(db_path).expect("open projection");
    let projected: (String, String, String) = connection
        .query_row(
            "
            SELECT i.slug, i.category, t.body
            FROM ideas AS i
            INNER JOIN item_part AS p ON p.entity_id = i.id AND p.role = 'overview'
            INNER JOIN item_part_translation AS t ON t.item_part_id = p.id AND t.language_code = 'en'
            WHERE p.part_id = ?1
            ",
            [&captured.part_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("read captured projection");
    assert_eq!(projected.0, captured.slug);
    assert_eq!(projected.1, "inspiration");
    assert!(projected.2.contains("后续可以继续发展。"));
}

#[test]
fn failed_projection_removes_the_new_idea_directory() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    copy_tree(&fixture_root(), &content_root);
    let creator = ContentCreator::open(&content_root).expect("open creator");
    let before = idea_directories(&content_root);
    let invalid_db_path = temporary.path().join("database-directory");
    fs::create_dir(&invalid_db_path).expect("create invalid database path");

    let result = creator.capture_idea_and_sync(
        "This source must not remain after sync fails.",
        IdeaCategory::Thought,
        invalid_db_path,
    );

    assert!(matches!(result, Err(CaptureError::Projection { .. })));
    assert_eq!(idea_directories(&content_root), before);
}

#[test]
fn capture_blog_creates_a_real_article_draft() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);
    let creator = ContentCreator::open(&content_root).expect("open creator");

    let captured = creator
        .capture_blog_and_sync(
            "A fast article draft\n\nThe complete thought stays in Markdown.",
            IdeaCategory::Thought,
            &db_path,
        )
        .expect("capture blog");

    let markdown = fs::read_to_string(
        content_root
            .join("resources/blog")
            .join(&captured.slug)
            .join("parts/body/en.md"),
    )
    .expect("read captured article");
    assert!(markdown.contains("content_type: article"));
    assert!(markdown.contains("The complete thought stays in Markdown."));

    let connection = Connection::open(db_path).expect("open projection");
    let projected: String = connection
        .query_row(
            "
            SELECT t.body
            FROM item_part AS p
            INNER JOIN item_part_translation AS t ON t.item_part_id = p.id
            WHERE p.part_id = ?1 AND p.entity_type = 'blog' AND p.role = 'body'
            ",
            [&captured.part_id],
            |row| row.get(0),
        )
        .expect("read projected article");
    assert!(projected.contains("A fast article draft"));
}

#[test]
fn create_project_creates_markdown_source_then_projects_it() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);
    let creator = ContentCreator::open(&content_root).expect("open creator");

    let captured = creator
        .capture_project_and_sync("A Brand New Project", &db_path)
        .expect("capture project");

    let item_root = content_root.join("resources/projects").join(&captured.slug);
    assert!(item_root.join("item.toml").is_file());
    assert!(item_root.join("parts/overview/meta.toml").is_file());
    let markdown =
        fs::read_to_string(item_root.join("parts/overview/en.md")).expect("read captured Markdown");
    assert!(markdown.contains("title: A Brand New Project"));
    assert!(markdown.contains("kind: project"));

    let connection = Connection::open(db_path).expect("open projection");
    let projected: (String, String) = connection
        .query_row(
            "
            SELECT i.slug, t.body
            FROM projects AS i
            INNER JOIN item_part AS p ON p.entity_id = i.id AND p.role = 'overview'
            INNER JOIN item_part_translation AS t ON t.item_part_id = p.id AND t.language_code = 'en'
            WHERE p.part_id = ?1
            ",
            [&captured.part_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("read captured projection");
    assert_eq!(projected.0, captured.slug);
    assert!(projected.1.contains("A Brand New Project"));
}

#[test]
fn failed_projection_removes_the_new_project_directory() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    copy_tree(&fixture_root(), &content_root);
    let creator = ContentCreator::open(&content_root).expect("open creator");
    let before = project_directories(&content_root);
    let invalid_db_path = temporary.path().join("database-directory");
    fs::create_dir(&invalid_db_path).expect("create invalid database path");

    let result = creator.capture_project_and_sync("Doomed Project", invalid_db_path);

    assert!(matches!(result, Err(CaptureError::Projection { .. })));
    assert_eq!(project_directories(&content_root), before);
}
