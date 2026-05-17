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
use super::mapper::MapperRegistry;
use super::rows::{Row, RowSet, RowSetBatch, SqlValue};
use super::sink::{Sink, SqliteSink};
use crate::parser::{IssuePolicy, ParserRegistry};
use crate::workspace::ScanReport;
use silan_viking_base::ContentHash;

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
    scan: &ScanReport,
    sink: &mut SqliteSink,
) -> Result<SyncReport, SyncError> {
    let batch = build_batch(parsers, mappers, scan)?;
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
    scan: &ScanReport,
    sink: &mut SqliteSink,
) -> Result<SyncReport, SyncError> {
    let batch = build_batch(parsers, mappers, scan)?;
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

/// Drive the parse → validate → map chain over every scanned Item, folding
/// the results into one batch. Does no IO.
fn build_batch(
    parsers: &ParserRegistry,
    mappers: &MapperRegistry,
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
        batch.push(mapper.map(&parsed)?);
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

    // `tag` is a cross-type entity table: every Item that uses a tag emits
    // its own `tag` row, so the same tag slug arrives once per Item. Fold
    // them to one row per `id` — otherwise the sink writes duplicate `tag`
    // rows and a `content_tag` JOIN fans out into repeated tags. The
    // `content_tag` association rows are NOT deduped: each is a distinct
    // (Item, tag) edge.
    batch.dedup_table_by("tag", "id");

    Ok(batch)
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
    "recent_update_id",
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
    let mut set = RowSet::new();
    set.push(
        Row::new("sync_meta")
            .with("content_hash", SqlValue::Text(content_hash.to_owned()))
            .with("items_total", SqlValue::Int(items_total as i64))
            .with("content_commit", SqlValue::Text(String::new())),
    );
    set
}
