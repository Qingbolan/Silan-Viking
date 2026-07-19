//! `run_sync` — the sync orchestration.
//!
//! Per `docs/silan-viking/01` §1.5.0, the sync main chain is:
//!
//! ```text
//!   scan -> parser_for -> parse -> validate -> mapper_for -> map -> sink
//! ```
//!
//! This module drives that chain over a [`ScanReport`], aborting on the
//! first `fatal` validation `Issue` (`10` §10.6 — a fatal Issue makes sync
//! all-or-nothing for that Item, and the whole batch is transactional in the
//! `Sink`). It records a `sync_meta` provenance row (`01` §1.10 revision B).
//!
//! The whole run is one `#[tracing::instrument]` span (`09` §9.2.2).

use super::error::SyncError;
use super::mapper::media_uri;
use super::mapper::MapperRegistry;
use super::rows::{Row, RowSet, RowSetBatch, SqlValue};
use super::sink::{Sink, SqliteSink};
use crate::parser::{IssuePolicy, ParserRegistry};
use crate::schema::Schema;
use crate::workspace::ScanReport;
use silan_viking_base::ContentHash;
use std::collections::BTreeSet;

/// The outcome of a sync run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncReport {
    /// How many Items the scan found.
    pub items_scanned: usize,
    /// How many Items were written (passed validation).
    pub items_written: usize,
    /// How many rows were written across all tables.
    pub rows_written: usize,
    /// The digest of the synced content — recorded in `sync_meta` and used by
    /// the next incremental sync to detect no-change.
    pub content_hash: String,
    /// Whether this run actually wrote (`false` when an incremental sync
    /// found nothing changed).
    pub wrote: bool,
}

/// Run a full sync: parse, validate, map, and write every scanned Item.
///
/// A `fatal` validation `Issue` aborts the whole run with
/// [`SyncError::Validation`] — nothing is written, honouring the
/// all-or-nothing rule.
#[tracing::instrument(name = "sync", skip_all, fields(mode = "full"))]
pub fn run_sync(
    parsers: &ParserRegistry,
    mappers: &MapperRegistry,
    schema: &Schema,
    scan: &ScanReport,
    sink: &mut SqliteSink,
) -> Result<SyncReport, SyncError> {
    let batch = build_batch(parsers, mappers, schema, scan)?;
    let content_hash = batch_digest(&batch);

    let mut full = batch;
    full.push(sync_meta_row(&content_hash, scan.len()));

    let rows_written = full.rows().len();
    sink.write_batch(&full)?;

    Ok(SyncReport {
        items_scanned: scan.len(),
        items_written: scan.len(),
        rows_written,
        content_hash,
        wrote: true,
    })
}

/// Run an incremental sync: if the content digest equals the digest recorded
/// by the last sync, skip the write entirely (`09` §9.4 — incremental sync is
/// fast because an unchanged tree does no work).
#[tracing::instrument(name = "sync", skip_all, fields(mode = "incremental"))]
pub fn run_incremental_sync(
    parsers: &ParserRegistry,
    mappers: &MapperRegistry,
    schema: &Schema,
    scan: &ScanReport,
    sink: &mut SqliteSink,
) -> Result<SyncReport, SyncError> {
    let batch = build_batch(parsers, mappers, schema, scan)?;
    let content_hash = batch_digest(&batch);

    if sink.last_sync_hash()?.as_deref() == Some(content_hash.as_str()) {
        // Nothing changed since the last sync — skip the write.
        return Ok(SyncReport {
            items_scanned: scan.len(),
            items_written: 0,
            rows_written: 0,
            content_hash,
            wrote: false,
        });
    }

    let mut full = batch;
    full.push(sync_meta_row(&content_hash, scan.len()));
    let rows_written = full.rows().len();
    sink.write_batch(&full)?;

    Ok(SyncReport {
        items_scanned: scan.len(),
        items_written: scan.len(),
        rows_written,
        content_hash,
        wrote: true,
    })
}

pub(crate) fn source_revision(
    parsers: &ParserRegistry,
    mappers: &MapperRegistry,
    schema: &Schema,
    scan: &ScanReport,
) -> Result<String, SyncError> {
    Ok(batch_digest(&build_batch(parsers, mappers, schema, scan)?))
}

/// Drive the parse → validate → map chain over every scanned Item, folding
/// the results into one batch. Does no IO.
fn build_batch(
    parsers: &ParserRegistry,
    mappers: &MapperRegistry,
    schema: &Schema,
    scan: &ScanReport,
) -> Result<RowSetBatch, SyncError> {
    let mut batch = RowSetBatch::new();

    for item in scan.items() {
        let span = tracing::debug_span!(
            "sync.item",
            uri = %item.slug(),
            kind = %item.kind()
        );
        let _enter = span.enter();

        let parser = parsers.parser_for(item)?;
        debug_assert_eq!(parser.content_type(), item.kind());

        let parsed = parser.parse(item)?;
        let issues = parser.validate(item, &parsed);
        if IssuePolicy::has_fatal(&issues) {
            let fatal = issues
                .iter()
                .find(|i| i.is_fatal())
                .expect("has_fatal guaranteed a fatal issue exists");
            return Err(SyncError::Validation {
                item: item.slug().to_string(),
                rule: fatal.rule(),
                message: fatal.message().to_owned(),
            });
        }

        let mapper = mappers.mapper_for(&parsed)?;
        debug_assert_eq!(mapper.content_type(), parsed.kind());
        // The mapper routes fields by the type's SCHEMA spec. Every one of
        // the 6 `ContentKind`s has a `TypeSpec` (the schema parser enforces
        // this at load), so a missing spec is an engine invariant violation.
        let type_spec = schema
            .type_spec(parsed.kind())
            .expect("every ContentKind has a TypeSpec");
        batch.push(mapper.map(&parsed, type_spec)?);
    }

    // One `episode_series` row per scanned series. This is a batch-level
    // concern, not a per-Item mapper one: the series is a parent shared by
    // many episode Items, so emitting it from the episode mapper would
    // duplicate the row once per episode and the sink (plain INSERT, no
    // upsert) would write a duplicate primary key. Every `episodes.series_id`
    // foreign key points at one of these rows — without them `promote` fails
    // the `episodes_episode_series_episodes` FK at COMMIT.
    if !scan.series().is_empty() {
        batch.push(episode_series_rows(scan));
    }

    // Language is a shared dictionary entity. Translation mappers emit the
    // referencing `language_code`, while this batch-level projection emits
    // each parent exactly once. Keeping ownership here prevents every mapper
    // from duplicating language rows and guarantees the derived snapshot is
    // referentially complete before it reaches PostgreSQL.
    let languages = language_rows(&batch);
    if !languages.is_empty() {
        batch.push(languages);
    }

    // `tag` is a cross-type entity table: every Item that uses a tag emits
    // its own `tag` row, so the same tag slug arrives once per Item. Fold
    // them to one row per `id` — otherwise the sink writes duplicate `tag`
    // rows and a `content_tag` JOIN fans out into repeated tags. The
    // `content_tag` association rows are NOT deduped: each is a distinct
    // (Item, tag) edge.
    batch.dedup_table_by("tag", "id");

    Ok(batch)
}

fn language_rows(batch: &RowSetBatch) -> RowSet {
    let codes: BTreeSet<&str> = batch
        .rows()
        .iter()
        .filter_map(|row| match row.columns().get("language_code") {
            Some(SqlValue::Text(code)) if !code.trim().is_empty() => Some(code.as_str()),
            _ => None,
        })
        .collect();

    let mut set = RowSet::new();
    for code in codes {
        let (name, native_name) = language_names(code);
        set.push(
            Row::new("languages")
                .with("code", SqlValue::Text(code.to_owned()))
                .with("name", SqlValue::Text(name.to_owned()))
                .with("native_name", SqlValue::Text(native_name.to_owned())),
        );
    }
    set
}

fn language_names(code: &str) -> (&str, &str) {
    match code {
        "en" => ("English", "English"),
        "zh" => ("Chinese", "中文"),
        _ => (code, code),
    }
}

/// Build the `episode_series` rows from the scan's container series.
///
/// `id` is the series slug — the value `episodes.series_id` references — so
/// the FK resolves. `title` / `description` / `status` come from the
/// `series.toml` the scan read; `status` defaults to `ongoing` upstream so it
/// is always a valid non-NULL value for the column's NOT NULL constraint.
fn episode_series_rows(scan: &ScanReport) -> RowSet {
    let mut set = RowSet::new();
    for series in scan.series() {
        set.push(
            Row::new("episode_series")
                .with("id", SqlValue::Text(series.slug.clone()))
                .with("slug", SqlValue::Text(series.slug.clone()))
                .with("title", SqlValue::Text(series.title.clone()))
                .with("description", SqlValue::Text(series.description.clone()))
                .with(
                    "cover_url",
                    SqlValue::Text(media_uri::rewrite_reference(&series.cover_url)),
                )
                .with("status", SqlValue::Text(series.status.clone())),
        );
    }
    set
}

/// Columns excluded from the content digest: these hold engine-minted
/// identities (`ItemId` ULIDs), not content. A fresh `ItemId` is generated
/// each scan until Item ids are persisted, so including them would make
/// every incremental sync see a spurious change.
///
/// This covers: the main-table / `content_tag` `id` & `entity_id`; and the
/// per-language translation tables' foreign keys (`blog_post_id`, …) — each
/// holds the owning Item's `ItemId`. `tag_id` is *not* here (it is the
/// deterministic tag slug — real content); nor are `part_id` / `entry_id` /
/// `item_part_id` / `part_entry_id` (stable, from `meta.toml` / TOML), nor
/// `from_id` / `to_id` (Item slugs — stable content).
const IDENTITY_COLUMNS: &[&str] = &[
    "id",
    "item_id",
    "entity_id",
    "blog_post_id",
    "idea_id",
    "project_id",
    "episode_id",
    "moment_id",
    "personal_info_id",
];

/// The digest of a batch: the FNV-1a hash of every row's table and its
/// content columns, concatenated in deterministic order. Engine-minted
/// identity columns are excluded, so two syncs of identical content produce
/// the same digest — which is what makes incremental sync work.
fn batch_digest(batch: &RowSetBatch) -> String {
    let mut source = String::new();
    for row in batch.rows() {
        source.push_str(row.table());
        for (column, value) in row.columns() {
            if IDENTITY_COLUMNS.contains(&column.as_str()) {
                continue;
            }
            source.push_str(column);
            source.push(':');
            match value {
                SqlValue::Text(s) => source.push_str(s),
                SqlValue::Int(i) => source.push_str(&i.to_string()),
                SqlValue::Float(f) => source.push_str(&f.to_string()),
                SqlValue::Bool(b) => source.push_str(if *b { "1" } else { "0" }),
                SqlValue::Null => source.push_str("<null>"),
            }
            source.push(';');
        }
    }
    ContentHash::of(source.as_bytes()).as_str().to_owned()
}

/// Build the `sync_meta` provenance row (`01` §1.10 revision B, `09` §9.2.3).
///
/// `content_commit` is left empty here: a local `index sync` does not know
/// which Git commit it will be deployed from. The deploy `promote` step
/// fills this column on the live DB as the "batch complete" marker
/// (`11` §11.11). Keeping the column in the synced schema means the live and
/// snapshot `sync_meta` tables share one shape, so `promote` can replace it.
fn sync_meta_row(content_hash: &str, items_total: usize) -> RowSet {
    let generated_at = time::OffsetDateTime::now_utc().to_string();
    let mut set = RowSet::new();
    set.push(
        Row::new("sync_meta")
            .with("content_hash", SqlValue::Text(content_hash.to_owned()))
            .with("items_total", SqlValue::Int(items_total as i64))
            .with("content_commit", SqlValue::Text(String::new()))
            .with("generated_at", SqlValue::Text(generated_at)),
    );
    set
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_rows_are_unique_and_named() {
        let mut batch = RowSetBatch::new();
        let mut translations = RowSet::new();
        for code in ["zh", "en", "zh"] {
            translations.push(
                Row::new("moment_translations")
                    .with("language_code", SqlValue::Text(code.to_owned())),
            );
        }
        batch.push(translations);

        let rows = language_rows(&batch);
        let projected: Vec<_> = rows
            .rows()
            .iter()
            .map(|row| {
                (
                    row.columns().get("code"),
                    row.columns().get("name"),
                    row.columns().get("native_name"),
                )
            })
            .collect();

        assert_eq!(projected.len(), 2);
        assert_eq!(
            projected[0],
            (
                Some(&SqlValue::Text("en".to_owned())),
                Some(&SqlValue::Text("English".to_owned())),
                Some(&SqlValue::Text("English".to_owned())),
            )
        );
        assert_eq!(
            projected[1],
            (
                Some(&SqlValue::Text("zh".to_owned())),
                Some(&SqlValue::Text("Chinese".to_owned())),
                Some(&SqlValue::Text("中文".to_owned())),
            )
        );
    }

    #[test]
    fn language_rows_ignore_empty_and_support_new_codes() {
        let mut batch = RowSetBatch::new();
        let mut translations = RowSet::new();
        for code in ["", "ja"] {
            translations.push(
                Row::new("project_translations")
                    .with("language_code", SqlValue::Text(code.to_owned())),
            );
        }
        batch.push(translations);

        let rows = language_rows(&batch);
        assert_eq!(rows.len(), 1);
        let row = &rows.rows()[0];
        assert_eq!(
            row.columns().get("code"),
            Some(&SqlValue::Text("ja".to_owned()))
        );
        assert_eq!(
            row.columns().get("native_name"),
            Some(&SqlValue::Text("ja".to_owned()))
        );
    }
}
