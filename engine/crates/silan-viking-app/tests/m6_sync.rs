//! M6 acceptance — sync-layer scenario tests.
//!
//! Per `docs/silan-viking/04` (M6 acceptance), these drive the full sync
//! main chain over the fixture content repo:
//! `Parsed.kind -> MapperRegistry::mapper_for -> map -> Sink`. They verify
//! rows land in `portfolio.db`, that `sync_meta` is written, and that an
//! incremental re-sync of unchanged content does no write.

use silan_viking_app::sync::{run_incremental_sync, run_sync, SqliteSink};
use silan_viking_app::Workspace;

fn fixture_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
}

fn workspace() -> Workspace {
    Workspace::open(fixture_root()).expect("fixture workspace opens")
}

#[test]
fn sync_writes_every_content_main_table() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    let report = ws.sync_into(&mut sink).expect("sync succeeds");

    assert_eq!(report.items_scanned, 6);
    assert!(report.wrote, "a first sync writes");

    // Every content type's main table received its single fixture row.
    for table in [
        "ideas",
        "blog_posts",
        "projects",
        "episodes",
        "personal_info",
        "moments",
    ] {
        let count: i64 = sink
            .connection()
            .query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |r| {
                r.get(0)
            })
            .unwrap_or_else(|e| panic!("table {table} should exist: {e}"));
        assert_eq!(count, 1, "table {table} has one row");
    }
}

#[test]
fn sync_writes_translation_rows_for_bilingual_items() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    ws.sync_into(&mut sink).expect("sync succeeds");

    // `hello-world` blog has en + zh, so two translation rows.
    let count: i64 = sink
        .connection()
        .query_row("SELECT COUNT(*) FROM blog_post_translations", [], |r| {
            r.get(0)
        })
        .expect("blog_post_translations exists");
    assert_eq!(count, 2, "the bilingual blog has en + zh translation rows");
}

#[test]
fn sync_records_sync_meta_provenance() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    ws.sync_into(&mut sink).expect("sync succeeds");

    let (hash, total): (String, i64) = sink
        .connection()
        .query_row("SELECT content_hash, items_total FROM sync_meta", [], |r| {
            Ok((r.get(0)?, r.get(1)?))
        })
        .expect("sync_meta row written");
    assert!(!hash.is_empty(), "sync_meta records a content digest");
    assert_eq!(total, 6, "sync_meta records the item count");
}

#[test]
fn sync_writes_resume_part_entries() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    ws.sync_into(&mut sink).expect("sync succeeds");

    // The resume's structured Parts land in the generic part_entry table,
    // not per-Part ent tables (ruling #2). education ×1 + skills ×2.
    let count: i64 = sink
        .connection()
        .query_row("SELECT COUNT(*) FROM part_entry", [], |r| r.get(0))
        .expect("part_entry exists");
    assert_eq!(count, 3, "education entry + 2 skills categories");
}

#[test]
fn sync_writes_schema_routed_side_table_fields() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    ws.sync_into(&mut sink).expect("sync succeeds");
    let conn = sink.connection();

    let (license, version): (String, String) = conn
        .query_row(
            "SELECT license, version FROM project_details LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("authored project detail row exists");
    assert_eq!(license, "Apache-2.0");
    assert_eq!(version, "0.8.4");

    let priority: String = conn
        .query_row("SELECT priority FROM idea_details LIMIT 1", [], |row| {
            row.get(0)
        })
        .expect("authored idea detail row exists");
    assert_eq!(priority, "high");
}

#[test]
fn incremental_sync_of_unchanged_content_does_not_rewrite() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");

    // First full sync.
    let first = run_sync(
        ws.parsers(),
        ws.mappers(),
        ws.schema(),
        &ws.scan().expect("scan"),
        &mut sink,
    )
    .expect("first sync");
    assert!(first.wrote);

    // Second sync, incremental: nothing changed, so no write.
    let second = run_incremental_sync(
        ws.parsers(),
        ws.mappers(),
        ws.schema(),
        &ws.scan().expect("scan"),
        &mut sink,
    )
    .expect("incremental sync");
    assert!(
        !second.wrote,
        "an incremental sync of unchanged content must not rewrite"
    );
    assert_eq!(second.content_hash, first.content_hash);
}

#[test]
fn sync_writes_content_relation_rows() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    ws.sync_into(&mut sink).expect("sync succeeds");

    // The blog declares one `documents` relation; the project declares one
    // `evolved_from` (which canonicalises to `evolved_into`).
    let count: i64 = sink
        .connection()
        .query_row("SELECT COUNT(*) FROM content_relation", [], |r| r.get(0))
        .expect("content_relation exists");
    assert_eq!(count, 2, "two declared relations across the fixture");

    // The `evolved_from` declaration is stored canonicalised.
    let has_evolved_into: bool = sink
        .connection()
        .query_row(
            "SELECT 1 FROM content_relation WHERE relation_type = 'evolved_into'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);
    assert!(
        has_evolved_into,
        "evolved_from is canonicalised to evolved_into before the sink"
    );
}

#[test]
fn sync_writes_tag_and_content_tag_rows() {
    let ws = workspace();
    let mut sink = SqliteSink::open_in_memory().expect("in-memory sink");
    ws.sync_into(&mut sink).expect("sync succeeds");
    let conn = sink.connection();

    // The fixture blog `hello-world` declares `tags: [intro, meta]`. Each
    // distinct tag becomes a `tag` entity row + a `content_tag` association.
    let tag_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM tag", [], |r| r.get(0))
        .expect("tag table exists");
    assert!(tag_count >= 2, "intro + meta must be tag entities");

    // The association carries the entity_type and the stable slug.
    let intro_on_blog: bool = conn
        .query_row(
            "SELECT 1 FROM content_tag WHERE tag_id='intro' AND entity_type='blog' \
             AND entity_slug='hello-world'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);
    assert!(
        intro_on_blog,
        "content_tag must link the `intro` tag to the blog by stable slug"
    );

    // `tags` must NOT have been flattened into a `blog_posts.tags` column.
    let blog_cols: Vec<String> = conn
        .prepare("SELECT name FROM pragma_table_info('blog_posts')")
        .and_then(|mut s| {
            s.query_map([], |r| r.get::<_, String>(0))
                .map(|rows| rows.flatten().collect())
        })
        .expect("blog_posts columns");
    assert!(
        !blog_cols.contains(&"tags".to_owned()),
        "tags is a join-table field — it must not land as a blog_posts column"
    );
}
