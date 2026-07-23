//! `ProjectMapper` — the `Mapper` for the `project` content type.
//!
//! `project` is a prose type, so the mapper delegates to the shared
//! [`ProseMapper`](super::prose_mapper::ProseMapper).

use super::prose_mapper::ProseMapper;
use super::{Mapper, MediaCatalog};
use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// The mapper for `project` Items.
#[derive(Debug, Default)]
pub struct ProjectMapper;

impl Mapper for ProjectMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Project
    }

    fn map(
        &self,
        parsed: &Parsed,
        type_spec: &crate::schema::TypeSpec,
        media: &MediaCatalog,
    ) -> Result<RowSet, MapError> {
        ProseMapper::map(ContentKind::Project, parsed, type_spec, media)
    }
}
