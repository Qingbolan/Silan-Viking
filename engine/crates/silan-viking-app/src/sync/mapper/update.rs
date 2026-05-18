//! `UpdateMapper` — the `Mapper` for the `update` content type.
//!
//! `update` is a prose type, so the mapper delegates to the shared
//! [`ProseMapper`](super::prose_mapper::ProseMapper).

use super::prose_mapper::ProseMapper;
use super::Mapper;
use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// The mapper for `update` Items.
#[derive(Debug, Default)]
pub struct UpdateMapper;

impl Mapper for UpdateMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Update
    }

    fn map(
        &self,
        parsed: &Parsed,
        type_spec: &crate::schema::TypeSpec,
    ) -> Result<RowSet, MapError> {
        ProseMapper::map(ContentKind::Update, parsed, type_spec)
    }
}
