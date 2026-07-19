//! Source-backed workspace editing use cases.
//!
//! This is the application contract consumed by presentation adapters. It
//! deliberately exposes source identities and editable DTOs, never projection
//! rows or database schema details.

use crate::parser::EntryValue;
use crate::{ContentEditor, EditorError, TranslationLocator, Workspace};
use serde::{Deserialize, Serialize};
use silan_viking_base::HasMeta;
use silan_viking_content::{ContentKind, PartShape};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum WorkspaceContentError {
    #[error("workspace open failed: {0}")]
    Open(#[from] crate::workspace::OpenError),
    #[error("workspace scan failed: {0}")]
    Scan(#[from] crate::workspace::ScanError),
    #[error("content parse failed: {0}")]
    Parse(#[from] crate::parser::ParseError),
    #[error("content edit failed: {0}")]
    Edit(#[from] EditorError),
    #[error("editable document `{0}` was not found")]
    NotFound(String),
    #[error("invalid translation id `{0}`; expected `<part_id>:<language>`")]
    InvalidTranslationId(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditableWorkspace {
    pub documents: Vec<EditableDocument>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditableDocument {
    pub id: String,
    pub item_id: String,
    pub content_type: String,
    pub slug: String,
    pub title: String,
    pub series_slug: Option<String>,
    pub episode_number: Option<i64>,
    pub status: String,
    pub visibility: String,
    pub updated_at: String,
    pub cover_uri: Option<String>,
    pub date: Option<String>,
    pub pinned: bool,
    pub parts: Vec<EditablePart>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditablePart {
    pub id: String,
    pub role: String,
    pub shape: String,
    pub canonical_language: String,
    pub translations: Vec<EditableTranslation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditableTranslation {
    pub id: String,
    pub language: String,
    pub content: String,
    pub source_revision: SourceRevision,
    pub source_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceRevision(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveTranslationInput {
    pub translation_id: String,
    pub content: String,
    pub expected_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveLifecycleInput {
    pub translation_id: String,
    pub status: String,
    pub visibility: String,
    pub pinned: Option<bool>,
    pub expected_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveProjectFeaturedInput {
    pub translation_id: String,
    pub is_featured: bool,
    pub expected_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceEntityCount {
    pub content_type: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EditableSection {
    pub role: String,
    pub shape: String,
    pub canonical_language: String,
    pub entries: Vec<EditableEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EditableEntry {
    pub id: String,
    pub sort_order: usize,
    pub shared: serde_json::Value,
    pub localized: serde_json::Value,
}

/// Source-backed application service. The projection database is accepted
/// only by mutation methods that must synchronize after an atomic source save.
pub struct WorkspaceContent {
    content_root: PathBuf,
    workspace: Workspace,
    editor: ContentEditor,
}

impl WorkspaceContent {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, WorkspaceContentError> {
        let content_root = content_root.as_ref().to_path_buf();
        Ok(Self {
            workspace: Workspace::open(&content_root)?,
            editor: ContentEditor::open(&content_root)?,
            content_root,
        })
    }

    pub fn editable_workspace(&self) -> Result<EditableWorkspace, WorkspaceContentError> {
        Ok(EditableWorkspace {
            documents: self.editable_documents()?,
        })
    }

    pub fn editable_documents(&self) -> Result<Vec<EditableDocument>, WorkspaceContentError> {
        let scan = self.workspace.scan()?;
        let mut documents = Vec::with_capacity(scan.items().len());
        for item in scan.items() {
            let parsed = self.workspace.parsers().parser_for(item)?.parse(item)?;
            let canonical_language = item
                .parts()
                .first()
                .map(|part| part.canonical_lang().to_string())
                .unwrap_or_else(|| "en".to_owned());
            let title = parsed
                .langs()
                .iter()
                .find(|(language, _)| language.to_string() == canonical_language)
                .and_then(|(_, variant)| variant.text("title"))
                .or_else(|| {
                    parsed
                        .langs()
                        .values()
                        .find_map(|variant| variant.text("title"))
                })
                .unwrap_or_else(|| item.slug().as_str())
                .to_owned();
            let series_slug = (item.kind() == ContentKind::Episode)
                .then(|| parsed.main().text("series").map(str::to_owned))
                .flatten();
            let parts = item
                .parts()
                .iter()
                .map(|part| {
                    let translations = part
                        .files()
                        .iter()
                        .map(|file| EditableTranslation {
                            id: translation_id(part.id().as_str(), &file.lang().to_string()),
                            language: file.lang().to_string(),
                            content: source_body(part.shape(), file.body()),
                            source_revision: SourceRevision(file.hash().to_string()),
                            source_path: source_path(
                                item.kind(),
                                series_slug.as_deref(),
                                item.slug().as_str(),
                                part.role().as_str(),
                                &file.lang().to_string(),
                                part.shape(),
                            ),
                        })
                        .collect();
                    EditablePart {
                        id: part.id().to_string(),
                        role: part.role().to_string(),
                        shape: part.shape().schema_name().to_owned(),
                        canonical_language: part.canonical_lang().to_string(),
                        translations,
                    }
                })
                .collect();
            documents.push(EditableDocument {
                id: item.id().to_string(),
                item_id: item.id().to_string(),
                content_type: item.kind().frontmatter_value().to_owned(),
                slug: item.slug().to_string(),
                title,
                series_slug,
                episode_number: parsed.main().int("episode_number"),
                status: parsed.main().text("status").unwrap_or("draft").to_owned(),
                visibility: parsed
                    .main()
                    .text("visibility")
                    .unwrap_or("private")
                    .to_owned(),
                updated_at: item.meta().updated_at().to_string(),
                cover_uri: parsed
                    .main()
                    .text("cover_url")
                    .or_else(|| parsed.main().text("cover_image"))
                    .map(str::to_owned),
                date: parsed
                    .main()
                    .text("date")
                    .or_else(|| parsed.main().text("published_at"))
                    .map(str::to_owned),
                pinned: parsed.main().bool("pinned").unwrap_or(false),
                parts,
            });
        }
        Ok(documents)
    }

    pub fn editable_document(
        &self,
        document_id: &str,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        self.editable_documents()?
            .into_iter()
            .find(|document| document.id == document_id)
            .ok_or_else(|| WorkspaceContentError::NotFound(document_id.to_owned()))
    }

    pub fn translation(
        &self,
        id: &str,
    ) -> Result<(EditableDocument, EditablePart, EditableTranslation), WorkspaceContentError> {
        for document in self.editable_documents()? {
            for part in &document.parts {
                if let Some(translation) = part.translations.iter().find(|value| value.id == id) {
                    return Ok((document.clone(), part.clone(), translation.clone()));
                }
            }
        }
        Err(WorkspaceContentError::NotFound(id.to_owned()))
    }

    pub fn entity_counts(&self) -> Result<Vec<WorkspaceEntityCount>, WorkspaceContentError> {
        let mut counts = std::collections::BTreeMap::<String, usize>::new();
        for document in self.editable_documents()? {
            *counts.entry(document.content_type).or_default() += 1;
        }
        Ok(counts
            .into_iter()
            .map(|(content_type, count)| WorkspaceEntityCount {
                content_type,
                count,
            })
            .collect())
    }

    pub fn document_for_part(
        &self,
        part_id: &str,
    ) -> Result<(EditableDocument, EditablePart), WorkspaceContentError> {
        for document in self.editable_documents()? {
            if let Some(part) = document.parts.iter().find(|part| part.id == part_id) {
                return Ok((document.clone(), part.clone()));
            }
        }
        Err(WorkspaceContentError::NotFound(part_id.to_owned()))
    }

    pub fn editable_sections(
        &self,
        content_type: ContentKind,
        language: &str,
    ) -> Result<Vec<EditableSection>, WorkspaceContentError> {
        let scan = self.workspace.scan()?;
        let Some(item) = scan.items().iter().find(|item| item.kind() == content_type) else {
            return Ok(Vec::new());
        };
        let parsed = self.workspace.parsers().parser_for(item)?.parse(item)?;
        let requested = parsed
            .langs()
            .iter()
            .find(|(lang, _)| lang.to_string() == language)
            .map(|(_, variant)| variant)
            .or_else(|| parsed.langs().values().next());
        let Some(variant) = requested else {
            return Ok(Vec::new());
        };
        Ok(item
            .parts()
            .iter()
            .filter(|part| !part.shape().is_prose())
            .map(|part| EditableSection {
                role: part.role().to_string(),
                shape: part.shape().schema_name().to_owned(),
                canonical_language: part.canonical_lang().to_string(),
                entries: variant
                    .entries(part.role().as_str())
                    .iter()
                    .enumerate()
                    .map(|(index, entry)| EditableEntry {
                        id: entry.entry_id().to_owned(),
                        sort_order: index,
                        shared: entry_map_json(entry.shared()),
                        localized: entry_map_json(entry.localized()),
                    })
                    .collect(),
            })
            .collect())
    }

    pub fn save_translation(
        &self,
        input: &SaveTranslationInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        let (document, part, translation) = self.translation(&input.translation_id)?;
        if part.shape != PartShape::Prose.schema_name() {
            return Err(WorkspaceContentError::InvalidTranslationId(
                input.translation_id.clone(),
            ));
        }
        let locator = locator(&document, &part, &translation.language)?;
        self.editor.save_markdown_and_sync(
            &locator,
            &input.content,
            &input.expected_revision,
            db_path,
        )?;
        WorkspaceContent::open(&self.content_root)?.editable_document(&document.id)
    }

    pub fn save_lifecycle(
        &self,
        input: &SaveLifecycleInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        let (document, part, translation) = self.translation(&input.translation_id)?;
        let locator = locator(&document, &part, &translation.language)?;
        let pinned = input.pinned.map(|value| value.to_string());
        let mut fields = vec![
            ("status", input.status.as_str()),
            ("visibility", input.visibility.as_str()),
        ];
        if let Some(value) = pinned.as_deref() {
            fields.push(("pinned", value));
        }
        self.editor.save_frontmatter_fields_and_sync(
            &locator,
            &fields,
            &input.expected_revision,
            db_path,
        )?;
        WorkspaceContent::open(&self.content_root)?.editable_document(&document.id)
    }

    /// Change whether a project is selected for the website home page.
    ///
    /// The authored frontmatter remains the source of truth; the projection
    /// is refreshed atomically after the source mutation.
    pub fn save_project_featured(
        &self,
        input: &SaveProjectFeaturedInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        let (document, part, translation) = self.translation(&input.translation_id)?;
        if document.content_type != ContentKind::Project.frontmatter_value() {
            return Err(WorkspaceContentError::InvalidTranslationId(
                input.translation_id.clone(),
            ));
        }
        let locator = locator(&document, &part, &translation.language)?;
        let value = input.is_featured.to_string();
        self.editor.save_frontmatter_fields_and_sync(
            &locator,
            &[("is_featured", value.as_str())],
            &input.expected_revision,
            db_path,
        )?;
        WorkspaceContent::open(&self.content_root)?.editable_document(&document.id)
    }

    pub fn content_root(&self) -> &Path {
        &self.content_root
    }

    pub fn editor(&self) -> &ContentEditor {
        &self.editor
    }
}

pub fn translation_id(part_id: &str, language: &str) -> String {
    format!("{part_id}:{language}")
}

fn source_body(shape: PartShape, raw: &str) -> String {
    if !shape.is_prose() {
        return raw.to_owned();
    }
    crate::parser::frontmatter::split(raw).body
}

fn source_path(
    kind: ContentKind,
    series_slug: Option<&str>,
    slug: &str,
    role: &str,
    language: &str,
    shape: PartShape,
) -> String {
    let mut path = PathBuf::from("resources").join(kind.dir_name());
    if let Some(series_slug) = series_slug {
        path.push(series_slug);
    }
    path.push(slug);
    path.join("parts")
        .join(role)
        .join(format!("{language}.{}", shape.file_extension()))
        .to_string_lossy()
        .replace('\\', "/")
}

fn locator(
    document: &EditableDocument,
    part: &EditablePart,
    language: &str,
) -> Result<TranslationLocator, WorkspaceContentError> {
    let kind = ContentKind::from_frontmatter_value(&document.content_type)
        .map_err(|_| WorkspaceContentError::NotFound(document.id.clone()))?;
    TranslationLocator::new(
        kind,
        document.slug.clone(),
        document.series_slug.clone(),
        part.role.clone(),
        language,
    )
    .map_err(WorkspaceContentError::Edit)
}

fn entry_map_json(fields: &std::collections::BTreeMap<String, EntryValue>) -> serde_json::Value {
    serde_json::Value::Object(
        fields
            .iter()
            .map(|(name, value)| (name.clone(), entry_value_json(value)))
            .collect(),
    )
}

fn entry_value_json(value: &EntryValue) -> serde_json::Value {
    match value {
        EntryValue::Text(value) => serde_json::Value::String(value.clone()),
        EntryValue::Int(value) => serde_json::Value::from(*value),
        EntryValue::Float(value) => serde_json::Value::from(*value),
        EntryValue::Bool(value) => serde_json::Value::from(*value),
        EntryValue::List(values) => serde_json::Value::Array(
            values
                .iter()
                .cloned()
                .map(serde_json::Value::String)
                .collect(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository_content() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../content")
    }

    #[test]
    fn editable_workspace_uses_stable_source_identities() {
        let workspace = WorkspaceContent::open(repository_content()).expect("open content");
        let documents = workspace.editable_documents().expect("scan documents");
        assert!(!documents.is_empty());
        for document in documents {
            assert!(document.id.starts_with("i_"));
            for part in document.parts {
                assert!(part.id.starts_with("p_"));
                for translation in part.translations {
                    assert_eq!(
                        translation.id,
                        format!("{}:{}", part.id, translation.language)
                    );
                    assert!(!translation.source_path.contains("item_part"));
                }
            }
        }
    }

    #[test]
    fn episode_source_paths_include_the_series_container() {
        let workspace = WorkspaceContent::open(repository_content()).expect("open content");
        let episode = workspace
            .editable_documents()
            .expect("scan documents")
            .into_iter()
            .find(|document| document.content_type == "episode")
            .expect("episode fixture");
        let source = &episode.parts[0].translations[0].source_path;
        assert!(
            source.starts_with("resources/episode/using-silan-viking/"),
            "{source}"
        );
    }
}
