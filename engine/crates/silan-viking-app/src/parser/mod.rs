//! The parser layer — `Parser` trait, 6 implementations, closed registry.
//!
//! Per `docs/silan-viking/01` §1.5, a `Parser` exposes exactly three public
//! contract methods (`content_type` / `parse` / `validate`); every
//! extraction detail is a private `fn` on the concrete parser struct, not on
//! the trait (a Rust trait has no private methods).
//!
//! The 6 content types divide into two families:
//!
//! - **prose types** — idea / blog / project / episode / update. All five are
//!   structurally identical, so they share [`prose_type::ProseTypeParser`]
//!   and each `Parser` impl is a thin delegator.
//! - **resume** — has `entry_list` / `key_value_list` Parts, so it has its
//!   own [`resume::ResumeParser`].
//!
//! [`ParserRegistry`] is a closed, compile-time dispatch struct (`01`
//! §1.5.0): no runtime `register()`, so a new `ContentKind` is a compile
//! error until every dispatch site is updated.

mod blog;
mod entry;
mod episode;
mod error;
pub(crate) mod frontmatter;
mod idea;
mod parsed;
mod project;
mod prose_type;
mod registry;
mod relations;
mod resume;
mod toml_entries;
mod update;

pub use entry::{EntryValue, PartEntry};
pub use error::{Issue, IssuePolicy, ParseError, Severity};
pub use parsed::{FieldValue, LangNeutral, LangVariant, Parsed};
pub use registry::ParserRegistry;

use silan_viking_content::{ContentKind, Item};

/// A content-type parsing strategy.
///
/// The trait is the stable public contract; concrete parsers keep their
/// extraction logic in private `impl` `fn`s (`01` §1.5). `parse` is the
/// single entry point — it produces a read-only [`Parsed`]; `validate`
/// inspects a `Parsed` and returns graded [`Issue`]s.
pub trait Parser {
    /// The content type this parser handles. A registry uses it to assert
    /// dispatch consistency.
    fn content_type(&self) -> ContentKind;

    /// Parse an Item into its read-only [`Parsed`] product.
    ///
    /// Returns [`ParseError`] for a hard failure (kind mismatch, malformed
    /// frontmatter / TOML). Content that parses but violates the SCHEMA
    /// contract is reported by [`validate`](Self::validate), not here.
    fn parse(&self, item: &Item) -> Result<Parsed, ParseError>;

    /// Validate a parsed product against the SCHEMA contract, returning
    /// graded diagnostics. A `fatal` [`Issue`] keeps the Item out of the
    /// `RowSet` (`10` §10.6).
    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue>;
}
