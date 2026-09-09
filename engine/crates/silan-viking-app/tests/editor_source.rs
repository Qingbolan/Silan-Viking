use rusqlite::Connection;
use silan_viking_app::{
    workspace_content::{DeletePrivateResourceInput, WorkspaceContent, WorkspaceContentError},
    ContentEditor, ContentKind, EditorError, ResumeProfileUpdate, TranslationLocator, Workspace,
};
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

fn replace_fixture_text(path: &Path, before: &str, after: &str) {
    let source = fs::read_to_string(path).expect("read fixture source");
    assert!(source.contains(before), "missing fixture text `{before}`");
    fs::write(path, source.replacen(before, after, 1)).expect("write fixture source");
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
fn save_document_updates_localized_title_and_body_atomically() {
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
    let replacement = "# Edited title\n\nEdited body.\n";
    let saved = editor
        .save_markdown_with_frontmatter_values_and_sync(
            &locator,
            replacement,
            &[(
                "title".to_owned(),
                serde_yaml::Value::String("Edited title".to_owned()),
            )],
            &original.revision,
            &db_path,
        )
        .expect("save title and body");

    let source = fs::read_to_string(content_root.join(saved.relative_path)).expect("read source");
    assert!(source.contains("title: Edited title"));
    assert!(source.ends_with(replacement));

    let connection = Connection::open(&db_path).expect("open refreshed projection");
    let projected_title: String = connection
        .query_row(
            "SELECT title FROM blog_post_translations WHERE language_code = 'en' AND title = 'Edited title'",
            [],
            |row| row.get(0),
        )
        .expect("projected localized title");
    let projected_body: String = connection
        .query_row(
            "SELECT body FROM item_part_translation WHERE language_code = 'en' AND body = ?1",
            [replacement],
            |row| row.get(0),
        )
        .expect("projected body");
    assert_eq!(projected_title, "Edited title");
    assert_eq!(projected_body, replacement);
}

#[test]
fn create_markdown_translation_syncs_without_overwriting_existing_source() {
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
        "fr",
    )
    .expect("valid locator");
    let source = "---\ntitle: Bonjour le monde\n---\n# Bonjour le monde\n\nCorps en francais.\n";

    let created = editor
        .create_markdown_and_sync(&locator, source, &db_path)
        .expect("create and sync translation");

    assert_eq!(created.body, "# Bonjour le monde\n\nCorps en francais.\n");
    let conn = Connection::open(&db_path).expect("open refreshed projection");
    let projected: String = conn
        .query_row(
            "
            SELECT ipt.body
            FROM item_part_translation AS ipt
            INNER JOIN item_part AS ip ON ip.id = ipt.item_part_id
            WHERE ip.entity_type = 'blog' AND ip.role = 'body' AND ipt.language_code = 'fr'
            ",
            [],
            |row| row.get(0),
        )
        .expect("projected generated body");
    assert_eq!(projected, created.body);

    let duplicate = editor.create_markdown_and_sync(&locator, source, &db_path);
    assert!(matches!(
        duplicate,
        Err(EditorError::SourceAlreadyExists { .. })
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

#[test]
fn save_frontmatter_fields_updates_source_then_refreshes_the_projection() {
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

    let saved = editor
        .save_frontmatter_fields_and_sync(
            &locator,
            &[("visibility", "public")],
            &original.revision,
            &db_path,
        )
        .expect("save frontmatter and sync");

    let source_after = fs::read_to_string(source_path).expect("read updated source");
    assert!(!source_after.contains("status:"));
    assert!(source_after.contains("visibility: public"));
    assert_eq!(saved.body, original.body);
    assert_ne!(saved.revision, original.revision);
    assert_ne!(source_after, source_before);

    let conn = Connection::open(&db_path).expect("open refreshed projection");
    let projected: String = conn
        .query_row(
            "SELECT visibility FROM blog_posts WHERE slug = 'hello-world'",
            [],
            |row| row.get(0),
        )
        .expect("projected state");
    assert_eq!(projected, "public");
}

#[test]
fn save_frontmatter_fields_preserves_boolean_types() {
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
        ContentKind::Project,
        "sample-project",
        None::<String>,
        "overview",
        "en",
    )
    .expect("valid locator");
    let original = editor.read_markdown(&locator).expect("read source");
    let saved = editor
        .save_frontmatter_fields_and_sync(
            &locator,
            &[("is_featured", "true")],
            &original.revision,
            &db_path,
        )
        .expect("save featured state and sync");

    let source = fs::read_to_string(content_root.join(saved.relative_path)).expect("read source");
    assert!(source.contains("is_featured: true"));
    assert!(!source.contains("is_featured: 'true'"));

    let conn = Connection::open(&db_path).expect("open refreshed projection");
    let projected: bool = conn
        .query_row(
            "SELECT is_featured FROM projects WHERE slug = 'sample-project'",
            [],
            |row| row.get(0),
        )
        .expect("projected featured state");
    assert!(projected);
}

#[test]
fn save_resume_part_rewrites_toml_then_refreshes_the_projection() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);

    Workspace::open(&content_root)
        .expect("open copied fixture")
        .sync(&db_path)
        .expect("seed projection");

    let editor = ContentEditor::open(&content_root).expect("open source editor");
    let original = editor
        .read_resume_part("education", "en")
        .expect("read resume part");

    let replacement = "\
# education entry_list — TOML array-of-tables (per 10 §10.4.5).

[[entry]]
entry_id    = \"e_education_nus\"
institution = \"National University of Singapore\"
degree      = \"PhD Computer Science\"
start_date  = \"2026-01-01\"
gpa         = \"4.8/5.0\"
details     = [\"Edited through ContentEditor\"]
";
    // A stale revision must never overwrite disk.
    let conflict =
        editor.save_resume_part_and_sync("education", "en", replacement, "stale", &db_path);
    assert!(matches!(
        conflict,
        Err(EditorError::RevisionConflict { .. })
    ));

    let saved = editor
        .save_resume_part_and_sync("education", "en", replacement, &original.revision, &db_path)
        .expect("save resume part and sync");
    assert_ne!(saved.revision, original.revision);
    assert_eq!(
        fs::read_to_string(content_root.join(&saved.relative_path)).expect("read updated TOML"),
        replacement
    );

    let connection = Connection::open(&db_path).expect("open projection");
    let localized: String = connection
        .query_row(
            "
            SELECT t.localized_payload
            FROM part_entry AS pe
            INNER JOIN item_part AS ip ON ip.id = pe.item_part_id
            INNER JOIN part_entry_translation AS t
                ON t.part_entry_id = pe.id AND t.language_code = 'en'
            WHERE ip.entity_type = 'resume' AND ip.role = 'education'
              AND pe.entry_id = 'e_education_nus'
            ",
            [],
            |row| row.get(0),
        )
        .expect("read projected entry");
    assert!(localized.contains("PhD Computer Science"));
}

#[test]
fn save_resume_profiles_updates_all_languages_after_validating_every_revision() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);

    Workspace::open(&content_root)
        .expect("open copied fixture")
        .sync(&db_path)
        .expect("seed projection");

    let editor = ContentEditor::open(&content_root).expect("open source editor");
    let english = editor
        .read_resume_profile("en")
        .expect("read English profile");
    let chinese = editor
        .read_resume_profile("zh")
        .expect("read Chinese profile");
    let updates = vec![
        ResumeProfileUpdate {
            language: "en".to_owned(),
            frontmatter: format!(
                "{}\navatar_url: silan://resources/resume/assets/avatar.png",
                english.frontmatter.trim_end()
            ),
            body: english.body.clone(),
            expected_revision: english.revision.clone(),
        },
        ResumeProfileUpdate {
            language: "zh".to_owned(),
            frontmatter: format!(
                "{}\navatar_url: silan://resources/resume/assets/avatar.png",
                chinese.frontmatter.trim_end()
            ),
            body: chinese.body.clone(),
            expected_revision: chinese.revision.clone(),
        },
    ];

    let mut stale_updates = updates.clone();
    stale_updates[1].expected_revision = "stale".to_owned();
    let conflict = editor.save_resume_profiles_and_sync(&stale_updates, &db_path);
    assert!(matches!(
        conflict,
        Err(EditorError::RevisionConflict { .. })
    ));
    assert_eq!(
        editor
            .read_resume_profile("en")
            .expect("English source remains unchanged")
            .revision,
        english.revision
    );

    let saved = editor
        .save_resume_profiles_and_sync(&updates, &db_path)
        .expect("save localized profiles");
    assert_eq!(saved.len(), 2);
    assert!(saved
        .iter()
        .all(|profile| profile.frontmatter.contains("avatar_url: silan://")));
    assert_ne!(saved[0].revision, english.revision);
    assert_ne!(saved[1].revision, chinese.revision);
}

#[test]
fn resume_profile_batch_restores_every_language_when_projection_fails() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    copy_tree(&fixture_root(), &content_root);

    let editor = ContentEditor::open(&content_root).expect("open source editor");
    let english = editor
        .read_resume_profile("en")
        .expect("read English profile");
    let chinese = editor
        .read_resume_profile("zh")
        .expect("read Chinese profile");
    let updates = [
        ResumeProfileUpdate {
            language: "en".to_owned(),
            frontmatter: format!(
                "{}\navatar_url: replacement.png",
                english.frontmatter.trim_end()
            ),
            body: english.body.clone(),
            expected_revision: english.revision.clone(),
        },
        ResumeProfileUpdate {
            language: "zh".to_owned(),
            frontmatter: format!(
                "{}\navatar_url: replacement.png",
                chinese.frontmatter.trim_end()
            ),
            body: chinese.body.clone(),
            expected_revision: chinese.revision.clone(),
        },
    ];
    let invalid_database_path = temporary.path().join("database-directory");
    fs::create_dir(&invalid_database_path).expect("create invalid database path");

    let result = editor.save_resume_profiles_and_sync(&updates, &invalid_database_path);

    assert!(matches!(result, Err(EditorError::Projection { .. })));
    assert_eq!(
        editor
            .read_resume_profile("en")
            .expect("read restored English profile")
            .revision,
        english.revision
    );
    assert_eq!(
        editor
            .read_resume_profile("zh")
            .expect("read restored Chinese profile")
            .revision,
        chinese.revision
    );
}

#[test]
fn save_episode_series_metadata_rewrites_series_toml_then_refreshes_projection() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);

    Workspace::open(&content_root)
        .expect("open copied fixture")
        .sync(&db_path)
        .expect("seed projection");

    let editor = ContentEditor::open(&content_root).expect("open source editor");
    let original = editor
        .read_episode_series_metadata("tutorial-series")
        .expect("read series metadata");
    assert_eq!(original.title, "Tutorial Series");
    assert_eq!(original.description, "A walkthrough series.");
    assert_eq!(
        original.cover_url,
        "silan://resources/episode/tutorial-series/assets/cover.png"
    );

    let conflict = editor.save_episode_series_metadata_and_sync(
        "tutorial-series",
        "Updated Series",
        "Edited through ContentEditor.",
        "https://example.com/cover.png",
        "stale",
        &db_path,
    );
    assert!(matches!(
        conflict,
        Err(EditorError::RevisionConflict { .. })
    ));

    let saved = editor
        .save_episode_series_metadata_and_sync(
            "tutorial-series",
            "Updated Series",
            "Edited through ContentEditor.",
            "https://example.com/cover.png",
            &original.revision,
            &db_path,
        )
        .expect("save series metadata and sync");
    assert_eq!(saved.title, "Updated Series");
    assert_eq!(saved.description, "Edited through ContentEditor.");
    assert_eq!(saved.cover_url, "https://example.com/cover.png");
    assert_ne!(saved.revision, original.revision);

    let source = fs::read_to_string(content_root.join(&saved.relative_path))
        .expect("read updated series.toml");
    assert!(source.contains("title = \"Updated Series\""));
    assert!(source.contains("description = \"Edited through ContentEditor.\""));
    assert!(source.contains("cover_url = \"https://example.com/cover.png\""));
    assert!(!source.contains("status ="));

    let connection = Connection::open(&db_path).expect("open projection");
    let projected: (String, String, String) = connection
        .query_row(
            "SELECT title, description, cover_url FROM episode_series WHERE slug = 'tutorial-series'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("projected series metadata");
    assert_eq!(
        projected,
        (
            "Updated Series".to_owned(),
            "Edited through ContentEditor.".to_owned(),
            "https://example.com/cover.png".to_owned(),
        )
    );
}

#[test]
fn permanent_deletion_removes_only_an_archived_resource_and_refreshes_projection() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);
    let source = content_root.join("resources/blog/hello-world/parts/body/en.md");
    replace_fixture_text(&source, "visibility: public", "visibility: private");

    Workspace::open(&content_root)
        .expect("open copied fixture")
        .sync(&db_path)
        .expect("seed projection");
    let workspace = WorkspaceContent::open(&content_root).expect("open workspace content");
    let document = workspace
        .editable_documents()
        .expect("list documents")
        .into_iter()
        .find(|document| document.content_type == "blog" && document.slug == "hello-world")
        .expect("archived blog");
    let translation = &document.parts[0].translations[0];

    let deleted = workspace
        .delete_private_resource(
            &DeletePrivateResourceInput {
                translation_id: translation.id.clone(),
                expected_revision: translation.source_revision.0.clone(),
                confirmation: "hello-world".to_owned(),
            },
            &db_path,
        )
        .expect("delete archived blog");

    assert_eq!(deleted.document_id, document.id);
    assert!(!content_root.join("resources/blog/hello-world").exists());
    let connection = Connection::open(&db_path).expect("open projection");
    let projected: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM item_part WHERE entity_type = 'blog'",
            [],
            |row| row.get(0),
        )
        .expect("count projected blog parts");
    assert_eq!(projected, 0);
}

#[test]
fn permanent_deletion_rejects_active_or_referenced_resources() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    let db_path = temporary.path().join("portfolio.db");
    copy_tree(&fixture_root(), &content_root);
    Workspace::open(&content_root)
        .expect("open copied fixture")
        .sync(&db_path)
        .expect("seed projection");

    let workspace = WorkspaceContent::open(&content_root).expect("open workspace content");
    let active_blog = workspace
        .editable_documents()
        .expect("list documents")
        .into_iter()
        .find(|document| document.content_type == "blog")
        .expect("active blog");
    let blog_translation = &active_blog.parts[0].translations[0];
    let active_error = workspace
        .delete_private_resource(
            &DeletePrivateResourceInput {
                translation_id: blog_translation.id.clone(),
                expected_revision: blog_translation.source_revision.0.clone(),
                confirmation: active_blog.slug.clone(),
            },
            &db_path,
        )
        .expect_err("active resource must not be deleted");
    assert!(matches!(
        active_error,
        WorkspaceContentError::DeleteRequiresPrivate(_)
    ));

    let project_source =
        content_root.join("resources/projects/sample-project/parts/overview/en.md");
    replace_fixture_text(&project_source, "visibility: public", "visibility: private");
    let workspace = WorkspaceContent::open(&content_root).expect("reopen workspace content");
    let project = workspace
        .editable_documents()
        .expect("list documents")
        .into_iter()
        .find(|document| document.content_type == "project")
        .expect("archived project");
    let project_translation = &project.parts[0].translations[0];
    let relation_error = workspace
        .delete_private_resource(
            &DeletePrivateResourceInput {
                translation_id: project_translation.id.clone(),
                expected_revision: project_translation.source_revision.0.clone(),
                confirmation: project.slug.clone(),
            },
            &db_path,
        )
        .expect_err("referenced project must not be deleted");
    assert!(matches!(
        relation_error,
        WorkspaceContentError::DeleteHasIncomingRelations { .. }
    ));
    assert!(content_root
        .join("resources/projects/sample-project")
        .is_dir());
}

#[test]
fn permanent_deletion_restores_source_when_projection_fails() {
    let temporary = tempfile::tempdir().expect("temporary workspace");
    let content_root = temporary.path().join("content");
    copy_tree(&fixture_root(), &content_root);
    let source = content_root.join("resources/blog/hello-world/parts/body/en.md");
    replace_fixture_text(&source, "visibility: public", "visibility: private");

    let invalid_database_path = temporary.path().join("database-directory");
    fs::create_dir(&invalid_database_path).expect("create invalid database path");
    let workspace = WorkspaceContent::open(&content_root).expect("open workspace content");
    let document = workspace
        .editable_documents()
        .expect("list documents")
        .into_iter()
        .find(|document| document.content_type == "blog")
        .expect("archived blog");
    let translation = &document.parts[0].translations[0];

    let error = workspace
        .delete_private_resource(
            &DeletePrivateResourceInput {
                translation_id: translation.id.clone(),
                expected_revision: translation.source_revision.0.clone(),
                confirmation: document.slug.clone(),
            },
            &invalid_database_path,
        )
        .expect_err("projection failure must abort deletion");

    assert!(matches!(
        error,
        WorkspaceContentError::DeleteProjection { .. }
    ));
    assert!(content_root.join("resources/blog/hello-world").is_dir());
}
