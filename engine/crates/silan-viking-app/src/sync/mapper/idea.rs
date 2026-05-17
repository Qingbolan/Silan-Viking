//! `IdeaMapper` — the `Mapper` for the `idea` content type.
//!
//! `idea` is a prose type, so the mapper delegates to the shared
//! [`ProseMapper`](super::prose_mapper::ProseMapper).

use super::prose_mapper::ProseMapper;
use super::Mapper;
use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// The mapper for `idea` Items.
#[derive(Debug, Default)]
pub struct IdeaMapper;

impl Mapper for IdeaMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Idea
    }

    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError> {
        ProseMapper::map(ContentKind::Idea, parsed)
    }
}
