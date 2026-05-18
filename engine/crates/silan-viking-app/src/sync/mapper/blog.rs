//! `BlogMapper` — the `Mapper` for the `blog` content type.
//!
//! `blog` is a prose type, so the mapper delegates to the shared
//! [`ProseMapper`](super::prose_mapper::ProseMapper).

use super::prose_mapper::ProseMapper;
use super::Mapper;
use crate::parser::Parsed;
use crate::sync::error::MapError;
use crate::sync::rows::RowSet;
use silan_viking_content::ContentKind;

/// The mapper for `blog` Items.
#[derive(Debug, Default)]
pub struct BlogMapper;

impl Mapper for BlogMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Blog
    }

    fn map(
        &self,
        parsed: &Parsed,
        type_spec: &crate::schema::TypeSpec,
    ) -> Result<RowSet, MapError> {
        ProseMapper::map(ContentKind::Blog, parsed, type_spec)
    }
}
