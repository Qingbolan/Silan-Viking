//! `BlogParser` — the `Parser` for the `blog` content type.
//!
//! `blog` is a prose type (its single Part `body` is `prose`), so the parser
//! delegates to the shared [`ProseTypeParser`](super::prose_type::ProseTypeParser).

use super::error::{Issue, ParseError};
use super::parsed::Parsed;
use super::prose_type::{validate_prose, ProseTypeParser};
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item};
use std::sync::Arc;

/// The parser for `blog` Items.
pub struct BlogParser {
    schema: Arc<Schema>,
}

impl BlogParser {
    /// Build the parser over the loaded schema.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self { schema }
    }
}

impl Parser for BlogParser {
    fn content_type(&self) -> ContentKind {
        ContentKind::Blog
    }

    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        ProseTypeParser::new(&self.schema).parse(ContentKind::Blog, item)
    }

    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue> {
        validate_prose(&self.schema, item, parsed)
    }
}
