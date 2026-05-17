//! `EpisodeParser` — the `Parser` for the `episode` content type.
//!
//! `episode` is a prose type (its single Part `body` is `prose`), so the
//! parser delegates to the shared
//! [`ProseTypeParser`](super::prose_type::ProseTypeParser).
//!
//! An episode's container series (`series.toml`) is a directory-level
//! concern handled by `Workspace::scan`, not by this per-Item parser
//! (`docs/silan-viking/10` §10.4.4).

use super::error::{Issue, ParseError};
use super::parsed::Parsed;
use super::prose_type::{validate_prose, ProseTypeParser};
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item};
use std::sync::Arc;

/// The parser for `episode` Items.
pub struct EpisodeParser {
    schema: Arc<Schema>,
}

impl EpisodeParser {
    /// Build the parser over the loaded schema.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self { schema }
    }
}

impl Parser for EpisodeParser {
    fn content_type(&self) -> ContentKind {
        ContentKind::Episode
    }

    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        ProseTypeParser::new(&self.schema).parse(ContentKind::Episode, item)
    }

    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue> {
        validate_prose(&self.schema, item, parsed)
    }
}
