//! `IdeaParser` — the `Parser` for the `idea` content type.
//!
//! `idea` is a prose type (`docs/silan-viking/01` §1.3): every Part is
//! `prose`. The parser therefore delegates to the shared
//! [`ProseTypeParser`](super::prose_type::ProseTypeParser) — it carries no
//! idea-specific extraction logic of its own; the idea's fields and Parts
//! are entirely described by `SCHEMA.md`.

use super::error::{Issue, ParseError};
use super::parsed::Parsed;
use super::prose_type::{validate_prose, ProseTypeParser};
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item};
use std::sync::Arc;

/// The parser for `idea` Items.
pub struct IdeaParser {
    schema: Arc<Schema>,
}

impl IdeaParser {
    /// Build the parser over the loaded schema.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self { schema }
    }
}

impl Parser for IdeaParser {
    fn content_type(&self) -> ContentKind {
        ContentKind::Idea
    }

    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        ProseTypeParser::new(&self.schema).parse(ContentKind::Idea, item)
    }

    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue> {
        validate_prose(&self.schema, item, parsed)
    }
}
