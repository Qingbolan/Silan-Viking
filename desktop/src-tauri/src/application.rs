//! Desktop use cases. This composes the Markdown write model with the SQLite
//! read projection without leaking either persistence API into Tauri commands.

use crate::insights::RuntimeInsightsRepository;
use crate::model::{DashboardData, EditorDocument, EditorTranslation, RawPart};
use crate::projection::ProjectionRepository;
use silan_viking_app::{ContentEditor, ContentKind, TranslationLocator};
use std::env;
use std::path::PathBuf;

pub(crate) struct DesktopWorkspace {
    db_path: PathBuf,
    projection: ProjectionRepository,
    insights: RuntimeInsightsRepository,
    content: ContentEditor,
}

impl DesktopWorkspace {
    pub(crate) fn from_environment() -> Result<Self, String> {
        let db_path = env::var("SILAN_DESKTOP_DB")
            .map(PathBuf::from)
            .map_err(|_| {
                "SILAN_DESKTOP_DB is not set; launch through `silan-viking desktop`".to_owned()
            })?;
        let content_root = env::var("SILAN_DESKTOP_CONTENT").map_err(|_| {
            "SILAN_DESKTOP_CONTENT is not set; launch through `silan-viking desktop`".to_owned()
        })?;
        Ok(Self {
            projection: ProjectionRepository::open(&db_path)?,
            insights: RuntimeInsightsRepository::open(&db_path)?,
            content: ContentEditor::open(content_root).map_err(|error| error.to_string())?,
            db_path,
        })
    }

    pub(crate) fn dashboard(&self) -> Result<DashboardData, String> {
        let content = self.projection.content_metrics()?;
        let runtime = self.insights.snapshot()?;
        Ok(DashboardData {
            total_views: content.total_views,
            total_likes: content.total_likes,
            total_comments: runtime.total_comments,
            pending_comments: runtime.pending_comments,
            human_interactions: runtime.human_interactions,
            crawler_interactions: runtime.crawler_interactions,
            recent_items: content.recent_items,
        })
    }

    pub(crate) fn list_documents(&self) -> Result<Vec<EditorDocument>, String> {
        let mut documents = Vec::new();
        for part in self.projection.all_parts()? {
            let document = self.hydrate(part)?;
            if !document.translations.is_empty() {
                documents.push(document);
            }
        }
        Ok(documents)
    }

    pub(crate) fn document(&self, id: &str) -> Result<EditorDocument, String> {
        self.hydrate(self.projection.part(id)?)
    }

    pub(crate) fn save_document(
        &self,
        translation_id: &str,
        body: &str,
        expected_revision: &str,
    ) -> Result<EditorDocument, String> {
        let part = self.projection.part_for_translation(translation_id)?;
        let item_part_id = part.id.clone();
        let document = self.hydrate(part)?;
        let translation = document
            .translations
            .iter()
            .find(|translation| translation.id == translation_id)
            .ok_or_else(|| format!("translation `{translation_id}` has no Markdown source"))?;
        let locator = translation_locator(&document, &translation.language)?;
        self.content
            .save_markdown_and_sync(&locator, body, expected_revision, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.document(&item_part_id)
    }

    fn hydrate(&self, raw: RawPart) -> Result<EditorDocument, String> {
        let summary = self.projection.entity_summary(
            &raw.entity_type,
            &raw.entity_id,
            &raw.canonical_language,
        )?;
        let title = if summary.title.is_empty() {
            format!("{} {}", raw.entity_type, raw.entity_id)
        } else {
            summary.title.clone()
        };
        let mut document = EditorDocument {
            id: raw.id,
            part_id: raw.part_id,
            entity_type: raw.entity_type,
            entity_id: raw.entity_id,
            series_id: summary.series_id,
            series_slug: summary.series_slug,
            series_title: summary.series_title,
            episode_number: summary.episode_number,
            slug: summary.slug,
            role: raw.role,
            canonical_language: raw.canonical_language,
            title,
            status: summary.status,
            visibility: summary.visibility,
            updated_at: raw.updated_at,
            translations: Vec::new(),
        };

        for translation in raw.translations {
            let locator = translation_locator(&document, &translation.language)?;
            match self.content.read_markdown(&locator) {
                Ok(source) => document.translations.push(EditorTranslation {
                    id: translation.id,
                    language: translation.language,
                    content: source.body,
                    revision: source.revision,
                    source_path: source.relative_path,
                }),
                Err(error) if error.is_source_not_found() => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(document)
    }
}

fn translation_locator(
    document: &EditorDocument,
    language: &str,
) -> Result<TranslationLocator, String> {
    let kind = ContentKind::from_frontmatter_value(&document.entity_type)
        .map_err(|error| error.to_string())?;
    TranslationLocator::new(
        kind,
        document.slug.clone(),
        document.series_slug.clone(),
        document.role.clone(),
        language,
    )
    .map_err(|error| error.to_string())
}
