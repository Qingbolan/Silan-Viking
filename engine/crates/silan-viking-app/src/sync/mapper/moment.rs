//! `MomentMapper` — the `Mapper` for the `moment` content type.
//!
//! `moment` is a prose type, so the mapper delegates to the shared
//! [`ProseMapper`](super::prose_mapper::ProseMapper).

use super::prose_mapper::ProseMapper;
use super::{Mapper, MediaCatalog};
use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// The mapper for `moment` Items.
#[derive(Debug, Default)]
pub struct MomentMapper;

impl Mapper for MomentMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Moment
    }

    fn map(
        &self,
        parsed: &Parsed,
        type_spec: &crate::schema::TypeSpec,
        media: &MediaCatalog,
    ) -> Result<RowSet, MapError> {
        ProseMapper::map(ContentKind::Moment, parsed, type_spec, media)
    }
}
