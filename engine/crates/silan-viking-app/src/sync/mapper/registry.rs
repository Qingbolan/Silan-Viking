//! `MapperRegistry` — the closed, compile-time mapper dispatch.
//!
//! Per `docs/silan-viking/01` §1.5.0, the mapper registry is the structural
//! twin of `ParserRegistry`: a plain struct holding one mapper per content
//! type, with no runtime `register()`. The dispatch is an exhaustive `match`
//! on the closed `ContentKind` set.
//!
//! `ParserRegistry` and `MapperRegistry` are kept as two small registries
//! rather than one `PipelineRegistry` — parsing ("files → Parsed") and
//! mapping ("Parsed → RowSet") are distinct stages, orchestrated by the
//! `Workspace` (`01` §1.5.0).

use super::blog::BlogMapper;
use super::episode::EpisodeMapper;
use super::idea::IdeaMapper;
use super::project::ProjectMapper;
use super::resume::ResumeMapper;
use super::update::UpdateMapper;
use super::Mapper;
use crate::parser::Parsed;
use crate::sync::error::MapError;
use silan_viking_content::ContentKind;

/// The closed set of the 6 content mappers.
#[derive(Debug, Default)]
pub struct MapperRegistry {
    idea: IdeaMapper,
    blog: BlogMapper,
    project: ProjectMapper,
    episode: EpisodeMapper,
    resume: ResumeMapper,
    update: UpdateMapper,
}

impl MapperRegistry {
    /// Build the registry. Mappers are stateless, so this takes nothing.
    pub fn new() -> Self {
        Self::default()
    }

    /// The mapper for a content kind — total over the closed `ContentKind`
    /// set; the `Result` mirrors `ParserRegistry::get` for API symmetry.
    pub fn get(&self, kind: ContentKind) -> Result<&dyn Mapper, MapError> {
        Ok(match kind {
            ContentKind::Idea => &self.idea,
            ContentKind::Blog => &self.blog,
            ContentKind::Project => &self.project,
            ContentKind::Episode => &self.episode,
            ContentKind::Resume => &self.resume,
            ContentKind::Update => &self.update,
        })
    }

    /// The mapper for a parsed product, dispatched on its `kind`.
    pub fn mapper_for(&self, parsed: &Parsed) -> Result<&dyn Mapper, MapError> {
        self.get(parsed.kind())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_kind_dispatches_to_a_matching_mapper() {
        let registry = MapperRegistry::new();
        for kind in ContentKind::ALL {
            let mapper = registry.get(kind).expect("registry total over kinds");
            assert_eq!(mapper.content_type(), kind);
        }
    }
}
