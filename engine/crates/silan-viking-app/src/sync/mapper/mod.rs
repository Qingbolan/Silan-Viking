//! The mapper layer — `Mapper` trait, 6 implementations, closed registry.
//!
//! Per `docs/silan-viking/01` §1.8, a `Mapper` is the second strategy family
//! after `Parser`: it turns a read-only `Parsed` into a `RowSet` by pure
//! function — no IO. The `Sink` is the only thing that writes.
//!
//! Like the parsers, the 5 prose types share one engine
//! ([`prose_mapper::ProseMapper`]) and resume has its own
//! ([`resume::ResumeMapper`]). [`MapperRegistry`] is the closed, compile-time
//! dispatch twin of `ParserRegistry` (`01` §1.5.0).

mod blog;
mod episode;
mod idea;
mod project;
mod prose_mapper;
mod registry;
mod resume;
mod table_names;
mod update;

pub use registry::MapperRegistry;

use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// A content-type mapping strategy.
///
/// `map` is a pure function: a `Parsed` in, a `RowSet` out, no IO. All
/// implementations keep their per-table helper logic in private `fn`s; the
/// trait surface is just `content_type` and `map`.
pub trait Mapper {
    /// The content type this mapper handles.
    fn content_type(&self) -> ContentKind;

    /// Map a parsed Item into its full set of database rows.
    ///
    /// Returns [`MapError::KindMismatch`] if `parsed.kind()` does not match
    /// [`content_type`](Self::content_type).
    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError>;
}
