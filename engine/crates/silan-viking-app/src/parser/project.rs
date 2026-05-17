//! `ProjectParser` — the `Parser` for the `project` content type.
//!
//! `project` is a prose type (overview / goals / challenges / … are all
//! `prose`), so the parser delegates to the shared
//! [`ProseTypeParser`](super::prose_type::ProseTypeParser).

use super::error::{Issue, ParseError};
use super::parsed::Parsed;
use super::prose_type::{validate_prose, ProseTypeParser};
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item};
use std::sync::Arc;

/// The parser for `project` Items.
pub struct ProjectParser {
    schema: Arc<Schema>,
}

impl ProjectParser {
    /// Build the parser over the loaded schema.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self { schema }
    }
}

impl Parser for ProjectParser {
    fn content_type(&self) -> ContentKind {
        ContentKind::Project
    }

    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        ProseTypeParser::new(&self.schema).parse(ContentKind::Project, item)
    }

    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue> {
        validate_prose(&self.schema, item, parsed)
    }
}
