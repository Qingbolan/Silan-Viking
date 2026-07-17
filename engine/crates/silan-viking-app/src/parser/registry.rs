//! `ParserRegistry` — the closed, compile-time parser dispatch.
//!
//! Per `docs/silan-viking/01` §1.5.0, the registry is a plain struct holding
//! one parser per content type. It offers **no** runtime `register()`:
//! content types are a closed set, so dispatch is an exhaustive `match` and a
//! new `ContentKind` is a compile error here until handled.
//!
//! The registry owns the loaded [`Schema`] via an `Arc` shared with every
//! parser, so all six parsers read one contract.

use super::blog::BlogParser;
use super::episode::EpisodeParser;
use super::error::ParseError;
use super::idea::IdeaParser;
use super::moment::MomentParser;
use super::project::ProjectParser;
use super::resume::ResumeParser;
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item};
use std::sync::Arc;

/// The closed set of the 6 content parsers.
pub struct ParserRegistry {
    idea: IdeaParser,
    blog: BlogParser,
    project: ProjectParser,
    episode: EpisodeParser,
    resume: ResumeParser,
    moment: MomentParser,
}

impl ParserRegistry {
    /// Build the registry over a loaded schema. The `Schema` is shared by an
    /// `Arc` so all six parsers consult one contract.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self {
            idea: IdeaParser::new(Arc::clone(&schema)),
            blog: BlogParser::new(Arc::clone(&schema)),
            project: ProjectParser::new(Arc::clone(&schema)),
            episode: EpisodeParser::new(Arc::clone(&schema)),
            resume: ResumeParser::new(Arc::clone(&schema)),
            moment: MomentParser::new(schema),
        }
    }

    /// The parser for a content kind. Total over the closed `ContentKind`
    /// set — the `Result` is kept for API symmetry with `MapperRegistry` and
    /// for a future kind that might be unparsable, but today never errs.
    pub fn get(&self, kind: ContentKind) -> Result<&dyn Parser, ParseError> {
        Ok(match kind {
            ContentKind::Idea => &self.idea,
            ContentKind::Blog => &self.blog,
            ContentKind::Project => &self.project,
            ContentKind::Episode => &self.episode,
            ContentKind::Resume => &self.resume,
            ContentKind::Moment => &self.moment,
        })
    }

    /// The parser for an Item, dispatched on its scan-time `kind`.
    pub fn parser_for(&self, item: &Item) -> Result<&dyn Parser, ParseError> {
        self.get(item.kind())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> ParserRegistry {
        let schema = Schema::parse(include_str!("../../../../../content/SCHEMA.md"))
            .expect("repo SCHEMA.md parses");
        ParserRegistry::new(Arc::new(schema))
    }

    #[test]
    fn every_kind_dispatches_to_a_matching_parser() {
        let registry = registry();
        for kind in ContentKind::ALL {
            let parser = registry.get(kind).expect("registry total over kinds");
            assert_eq!(parser.content_type(), kind);
        }
    }
}
