use rusqlite::Connection;
use silan_viking_app::{ContentEditor, ContentKind, EditorError, TranslationLocator, Workspace};
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

#[test]
fn save_updates_markdown_then_refreshes_the_projection() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);

    Workspace::open(&content_root)
        .expect("open copied fixture")
        .sync(&db_path)
        .expect("seed projection");

    let editor = ContentEditor::open(&content_root).expect("open source editor");
    let locator = TranslationLocator::new(
        ContentKind::Blog,
        "hello-world",
        None::<String>,
        "body",
        "en",
    )
    .expect("valid locator");
    let original = editor.read_markdown(&locator).expect("read source");
    let source_path = content_root.join(&original.relative_path);
    let source_before = fs::read_to_string(&source_path).expect("read source bytes");
    let frontmatter_end = source_before.find("\n---\n").expect("frontmatter fence") + 5;
    let replacement = "# Source-first edit\n\nWritten through ContentEditor.\n";

    let saved = editor
        .save_markdown_and_sync(&locator, replacement, &original.revision, &db_path)
        .expect("save and sync");

    let source_after = fs::read_to_string(source_path).expect("read updated source");
    assert_eq!(
        &source_after[..frontmatter_end],
        &source_before[..frontmatter_end],
        "frontmatter must remain byte-for-byte stable"
    );
    assert_eq!(saved.body, replacement);
    assert_ne!(saved.revision, original.revision);

    let conn = Connection::open(&db_path).expect("open refreshed projection");
    let projected: String = conn
        .query_row(
            "
            SELECT ipt.body
            FROM item_part_translation AS ipt
            INNER JOIN item_part AS ip ON ip.id = ipt.item_part_id
            WHERE ip.entity_type = 'blog' AND ip.role = 'body' AND ipt.language_code = 'en'
            ",
            [],
            |row| row.get(0),
        )
        .expect("projected body");
    assert_eq!(projected, replacement);

    let stale_write =
        editor.save_markdown_and_sync(&locator, "must not overwrite", &original.revision, &db_path);
    assert!(matches!(
        stale_write,
        Err(EditorError::RevisionConflict { .. })
    ));
}

#[test]
fn projection_failure_restores_the_original_markdown() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    copy_tree(&fixture_root(), &content_root);

    let editor = ContentEditor::open(&content_root).expect("open source editor");
    let locator = TranslationLocator::new(
        ContentKind::Blog,
        "hello-world",
        None::<String>,
        "body",
        "en",
    )
    .expect("valid locator");
    let original = editor.read_markdown(&locator).expect("read source");
    let source_path = content_root.join(&original.relative_path);
    let source_before = fs::read_to_string(&source_path).expect("read source bytes");
    let invalid_database_path = temporary.path().join("database-directory");
    fs::create_dir(&invalid_database_path).expect("create invalid database path");

    let result = editor.save_markdown_and_sync(
        &locator,
        "# This write must be rolled back\n",
        &original.revision,
        &invalid_database_path,
    );

    assert!(matches!(result, Err(EditorError::Projection { .. })));
    assert_eq!(
        fs::read_to_string(source_path).expect("read restored source"),
        source_before
    );
    assert_eq!(
        editor
            .read_markdown(&locator)
            .expect("read restored document")
            .revision,
        original.revision
    );
}
