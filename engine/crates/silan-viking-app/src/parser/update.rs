//! `UpdateParser` — the `Parser` for the `update` content type.
//!
//! `update` is the 6th content type (`docs/silan-viking/10` §10.4.6 ruling
//! #3) and a prose type — its single Part `body` is `prose` — so the parser
//! delegates to the shared
//! [`ProseTypeParser`](super::prose_type::ProseTypeParser).

use super::error::{Issue, ParseError};
use super::parsed::Parsed;
use super::prose_type::{validate_prose, ProseTypeParser};
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item};
use std::sync::Arc;

/// The parser for `update` Items.
pub struct UpdateParser {
    schema: Arc<Schema>,
}

impl UpdateParser {
    /// Build the parser over the loaded schema.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self { schema }
    }
}

impl Parser for UpdateParser {
    fn content_type(&self) -> ContentKind {
        ContentKind::Update
    }

    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        ProseTypeParser::new(&self.schema).parse(ContentKind::Update, item)
    }

    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue> {
        validate_prose(&self.schema, item, parsed)
    }
}
