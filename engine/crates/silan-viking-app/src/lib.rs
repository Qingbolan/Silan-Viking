//! `silan-viking-app` — L3 behaviour layer.
//!
//! This layer holds the **capabilities** of silan-viking: scanning the
//! `content/` tree, parsing Items into `Parsed` products, mapping those into
//! database rows, and writing them. It depends on L1 `base` and L2 `content`
//! (and, for row shapes, L2.5 `entities`); nothing here depends on an L4
//! adapter (`docs/silan-viking/01` §1.1).
//!
//! Module map:
//!
//! - [`schema`] — loads and models `content/SCHEMA.md` (the M0 contract).
//! - [`workspace`] — the `Workspace` aggregate root: `scan` (M5) and `sync`
//!   (M6).
//! - [`parser`] — the `Parser` trait, its 6 implementations, the closed
//!   `ParserRegistry`, and the read-only `Parsed` product (milestone M5).
//! - [`sync`] — the `Mapper` trait, its 6 implementations, the `RowSet` /
//!   `Sink` write path (milestone M6).
//!
//! Every public surface returns a typed error (`ParseError` / `SyncError`);
//! no non-test code uses `unwrap()` / `expect()` (`09` §9.1).

#![forbid(unsafe_code)]

pub mod capture;
pub mod editor;
pub mod parser;
pub mod proposal;
pub mod query;
pub mod schema;
mod source_lock;
pub mod stats;
pub mod sync;
pub mod workspace;

pub use capture::{CaptureError, CapturedContent, ContentCreator, IdeaCategory};
pub use editor::{
    ContentEditor, EditorError, ResumeProfileSource, SeriesMetadataSource, SourceDocument,
    TranslationLocator,
};
pub use proposal::store::ProposalKind;
pub use proposal::{
    canonicalize, AcceptOutcome, AcceptReport, GitRepo, ProposalError, ProposalId, ProposalLock,
    ProposalRecord, ProposalState, ProposalSummary, ProposalTarget,
};
pub use query::{EmbedderMode, QueryDocument, QueryError, QueryHit, QueryIndex};
pub use schema::{Schema, SchemaError};
pub use stats::{api_base_url, CountRow, ItemStats, StatsCache, StatsError, StatsSync, VisitorRow};
pub use workspace::{LintIssue, ScanError, ScannedAsset, Workspace};

// Re-export the content-layer types that appear across the app's public API.
pub use silan_viking_base::{Identified, SilanUri, Slug};
pub use silan_viking_content::{
    ContentKind, Item, Part, PartRole, PartShape, Relation, RelationType,
};
