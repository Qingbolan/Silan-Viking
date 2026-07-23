//! `EpisodeMapper` — the `Mapper` for the `episode` content type.
//!
//! `episode` is a prose type, so the mapper delegates to the shared
//! [`ProseMapper`](super::prose_mapper::ProseMapper).

use super::prose_mapper::ProseMapper;
use super::{Mapper, MediaCatalog};
use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// The mapper for `episode` Items.
#[derive(Debug, Default)]
pub struct EpisodeMapper;

impl Mapper for EpisodeMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Episode
    }

    fn map(
        &self,
        parsed: &Parsed,
        type_spec: &crate::schema::TypeSpec,
        media: &MediaCatalog,
    ) -> Result<RowSet, MapError> {
        ProseMapper::map(ContentKind::Episode, parsed, type_spec, media)
    }
}
