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

    Ok(batch)
}

/// Columns excluded from the content digest: these hold engine-minted
/// identities (`ItemId` ULIDs), not content. A fresh `ItemId` is generated
/// each scan until ids are persisted in the manifest, so including them
/// would make every incremental sync see a spurious change. `entity_id` is
/// the `content_tag` association's Item ULID — same reason. `tag_id` is *not*
/// here: it is the deterministic tag slug, real content the digest must see.
const IDENTITY_COLUMNS: [&str; 4] = ["id", "item_id", "from_id", "entity_id"];

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
fn sync_meta_row(content_hash: &str, items_total: usize) -> RowSet {
    let mut set = RowSet::new();
    set.push(
        Row::new("sync_meta")
            .with("content_hash", SqlValue::Text(content_hash.to_owned()))
            .with("items_total", SqlValue::Int(items_total as i64)),
    );
    set
}
