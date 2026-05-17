//! `SyncError` and `MapError` — the sync layer's typed errors.
//!
//! Per `docs/silan-viking/09` §9.1. `MapError` is a pure-function failure
//! (a `Mapper` given a `Parsed` of the wrong kind); `SyncError` wraps the
//! whole pipeline — scan, parse, map, and the database write.

use crate::parser::ParseError;
use crate::workspace::ScanError;
use silan_viking_content::ContentKind;
use thiserror::Error;

/// A failure inside a `Mapper` — turning a `Parsed` into a `RowSet`.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum MapError {
    /// The `Parsed` handed to a mapper was of a different content type than
    /// the mapper handles.
    #[error("mapper kind mismatch: mapper handles `{expected}`, parsed is `{actual}`")]
    KindMismatch {
        expected: ContentKind,
        actual: ContentKind,
    },

    /// A required field was absent from the `Parsed` when a row column needed
    /// it — the parser's `validate` should have caught this; reaching the
    /// mapper means a fatal `Issue` was ignored.
    #[error("cannot map `{item}`: required field `{field}` is absent")]
    MissingField { item: String, field: String },
}

/// A failure of the whole `sync` pipeline.
#[derive(Debug, Error)]
pub enum SyncError {
    /// The disk scan failed.
    #[error("scan failed: {0}")]
    Scan(#[from] ScanError),

    /// An Item failed to parse.
    #[error("parse failed: {0}")]
    Parse(#[from] ParseError),

    /// An Item had a fatal validation `Issue`, so the sync aborts (`10`
    /// §10.6: a fatal Issue makes sync all-or-nothing).
    #[error("validation failed for `{item}`: {rule} — {message}")]
    Validation {
        item: String,
        rule: &'static str,
        message: String,
    },

    /// A `Mapper` failed.
    #[error("map failed: {0}")]
    Map(#[from] MapError),

    /// One or more `Mapper` row columns that the `silan-viking-entities`
    /// schema does not declare — the sink rejects the whole sync so a drift
    /// like `content_relation.from_uri` is caught at sync time, not in
    /// production (`docs/silan-viking/11` truth-source discipline). Every
    /// drift found in the batch is reported at once (`(table, column)`
    /// pairs), so a mapper can be realigned in one pass.
    #[error("schema drift — Mapper columns absent from silan-viking-entities: {}",
        .0.iter().map(|(t, c)| format!("{t}.{c}")).collect::<Vec<_>>().join(", "))]
    SchemaDrift(Vec<(String, String)>),

    /// The database could not be opened or written.
    #[error("database error: {detail}")]
    Db { detail: String },
}

impl SyncError {
    /// Build a [`SyncError::Db`] from any displayable cause.
    pub fn db(detail: impl std::fmt::Display) -> Self {
        SyncError::Db {
            detail: detail.to_string(),
        }
    }
}

impl From<rusqlite::Error> for SyncError {
    fn from(e: rusqlite::Error) -> Self {
        SyncError::db(e)
    }
}
