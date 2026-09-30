//! Source-backed workspace editing use cases.
//!
//! This is the application contract consumed by presentation adapters. It
//! deliberately exposes source identities and editable DTOs, never projection
//! rows or database schema details.

use crate::parser::{EntryValue, Parsed};
use crate::{source_lock, ContentEditor, EditorError, TranslationLocator, Workspace};
use serde::{Deserialize, Serialize};
use silan_viking_base::HasMeta;
use silan_viking_content::{ContentKind, PartShape};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
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
    #[error("invalid content metadata: {0}")]
    InvalidMetadata(String),
    #[error("resource `{0}` must be private before it can be permanently deleted")]
    DeleteRequiresPrivate(String),
    #[error("permanent deletion confirmation must exactly match `{0}`")]
    DeleteConfirmation(String),
    #[error("resource `{resource}` has incoming relations:\n{relations}")]
    DeleteHasIncomingRelations { resource: String, relations: String },
    #[error("cannot permanently delete `{path}`: {detail}")]
    Delete { path: String, detail: String },
    #[error("content projection failed after deleting `{path}`; source was restored: {detail}")]
    DeleteProjection { path: String, detail: String },
    #[error("content projection failed after deleting `{path}` ({projection}); source rollback also failed ({rollback})")]
    DeleteRollback {
        path: String,
        projection: String,
        rollback: String,
    },
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
    pub description: Option<String>,
    pub series_slug: Option<String>,
    pub episode_number: Option<i64>,
    pub visibility: String,
    pub updated_at: String,
    pub cover_uri: Option<String>,
    pub cover_source_type: Option<String>,
    pub cover_website_url: Option<String>,
    pub is_featured: Option<bool>,
    pub github_url: Option<String>,
    pub demo_url: Option<String>,
    pub article_attribution: Option<ArticleAttribution>,
    pub moment_type: Option<String>,
    pub priority: Option<String>,
    pub tags: Vec<String>,
    pub relations: Vec<EditableRelation>,
    pub date: Option<String>,
    pub pinned: bool,
    pub parts: Vec<EditablePart>,
}

/// One typed, source-declared outgoing relation for content management UIs.
///
/// The target coordinates are projected from the canonical `SilanUri` so
/// adapters never need to reverse-engineer URI directory naming rules.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct EditableRelation {
    pub relation_type: String,
    pub target_uri: String,
    pub target_kind: String,
    pub target_slug: String,
}

/// One external destination surfaced with a Blog as a compact attachment.
///
/// `kind` is a stable semantic key (`website`, `github`, `paper`, `doi`, …);
/// presentation adapters localize the visible kind label while `label`
/// preserves an optional author override.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArticleResource {
    pub kind: String,
    pub label: String,
    pub url: String,
}

/// Blog-level project identity and image attribution authored in frontmatter.
///
/// This data stays independent from the Markdown body so the desktop editor,
/// CLI watermark workflow, website resource strip, and SEO renderer consume
/// one source contract.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArticleAttribution {
    pub project_name: String,
    pub publication_venue: String,
    pub project_url: String,
    pub external_resources: Vec<ArticleResource>,
    pub image_author: String,
    pub image_site_url: String,
    pub image_watermark_mode: String,
    pub image_watermark_position: String,
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
    pub title: String,
    pub content: String,
    pub source_revision: SourceRevision,
    pub source_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceRevision(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveTranslationInput {
    pub translation_id: String,
    pub title: String,
    pub content: String,
    pub expected_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveVisibilityInput {
    pub translation_id: String,
    pub visibility: String,
    pub pinned: Option<bool>,
    pub expected_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveMetadataInput {
    pub translation_id: String,
    pub title: String,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub cover_source_type: Option<String>,
    pub cover_website_url: Option<String>,
    pub is_featured: Option<bool>,
    pub github_url: Option<String>,
    pub demo_url: Option<String>,
    pub article_attribution: Option<ArticleAttribution>,
    pub moment_type: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<Vec<String>>,
    pub expected_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct SaveProjectFeaturedInput {
    pub translation_id: String,
    pub is_featured: bool,
    pub expected_revision: String,
}

/// Explicit, concurrency-safe request to erase one private resource.
///
/// The confirmation is a human-entered source coordinate (`slug`, or
/// `series/slug` for an episode). Keeping it inside the application contract
/// prevents presentation adapters from bypassing the destructive-action
/// guard.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DeletePrivateResourceInput {
    pub translation_id: String,
    pub expected_revision: String,
    pub confirmation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeletedPrivateResource {
    pub document_id: String,
    pub content_type: String,
    pub slug: String,
    pub confirmation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateTranslationInput {
    pub part_id: String,
    pub language: String,
    pub title: String,
    pub body: String,
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
            let description = parsed
                .main()
                .text("excerpt")
                .or_else(|| parsed.main().text("abstract"))
                .or_else(|| parsed.main().text("description"))
                .or_else(|| {
                    parsed
                        .langs()
                        .iter()
                        .find(|(language, _)| language.to_string() == canonical_language)
                        .and_then(|(_, variant)| {
                            variant
                                .text("excerpt")
                                .or_else(|| variant.text("abstract"))
                                .or_else(|| variant.text("description"))
                        })
                })
                .map(str::to_owned);
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
                        .map(|file| {
                            let language = file.lang().to_string();
                            let translation_title = parsed
                                .langs()
                                .iter()
                                .find(|(candidate, _)| candidate.to_string() == language)
                                .and_then(|(_, variant)| variant.text("title"))
                                .unwrap_or(title.as_str())
                                .to_owned();
                            EditableTranslation {
                                id: translation_id(part.id().as_str(), &language),
                                language: language.clone(),
                                title: translation_title,
                                content: source_body(part.shape(), file.body()),
                                source_revision: SourceRevision(file.hash().to_string()),
                                source_path: source_path(
                                    item.kind(),
                                    series_slug.as_deref(),
                                    item.slug().as_str(),
                                    part.role().as_str(),
                                    &language,
                                    part.shape(),
                                ),
                            }
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
            let relations = parsed
                .relations()
                .iter()
                .filter_map(|relation| {
                    let [target_directory, target_slug] = relation.to().segments() else {
                        return None;
                    };
                    let target_kind = ContentKind::from_dir_name(target_directory).ok()?;
                    Some(EditableRelation {
                        relation_type: relation.relation_type().as_str().to_owned(),
                        target_uri: relation.to().to_string(),
                        target_kind: target_kind.frontmatter_value().to_owned(),
                        target_slug: target_slug.clone(),
                    })
                })
                .collect();
            documents.push(EditableDocument {
                id: item.id().to_string(),
                item_id: item.id().to_string(),
                content_type: item.kind().frontmatter_value().to_owned(),
                slug: item.slug().to_string(),
                title,
                description,
                series_slug,
                episode_number: parsed.main().int("episode_number"),
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
                    .or_else(|| parsed.main().text("featured_image_url"))
                    .or_else(|| parsed.main().text("thumbnail_url"))
                    .or_else(|| {
                        parsed
                            .langs()
                            .iter()
                            .find(|(language, _)| language.to_string() == canonical_language)
                            .and_then(|(_, variant)| variant.text("featured_image_url"))
                    })
                    .map(str::to_owned),
                cover_source_type: match item.kind() {
                    ContentKind::Project => Some(normalize_cover_source_type(
                        parsed.main().text("cover_source_type"),
                    )),
                    _ => None,
                },
                cover_website_url: match item.kind() {
                    ContentKind::Project => {
                        parsed.main().text("cover_website_url").map(str::to_owned)
                    }
                    _ => None,
                },
                is_featured: Some(parsed.main().bool("is_featured").unwrap_or(false)),
                github_url: match item.kind() {
                    ContentKind::Project => parsed.main().text("github_url").map(str::to_owned),
                    _ => None,
                },
                demo_url: match item.kind() {
                    ContentKind::Project => parsed.main().text("demo_url").map(str::to_owned),
                    _ => None,
                },
                article_attribution: (item.kind() == ContentKind::Blog)
                    .then(|| article_attribution(&parsed)),
                moment_type: (item.kind() == ContentKind::Moment)
                    .then(|| parsed.main().text("moment_type").map(str::to_owned))
                    .flatten(),
                priority: (item.kind() == ContentKind::Moment)
                    .then(|| parsed.main().text("priority").map(str::to_owned))
                    .flatten(),
                tags: parsed
                    .main()
                    .get("tags")
                    .and_then(|value| value.as_list())
                    .unwrap_or_default()
                    .to_vec(),
                relations,
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
        let title = input.title.trim();
        if title.is_empty() {
            return Err(WorkspaceContentError::InvalidMetadata(
                "content title is required".to_owned(),
            ));
        }
        let locator = locator(&document, &part, &translation.language)?;
        self.editor.save_markdown_with_frontmatter_values_and_sync(
            &locator,
            &input.content,
            &[(
                "title".to_owned(),
                serde_yaml::Value::String(title.to_owned()),
            )],
            &input.expected_revision,
            db_path,
        )?;
        WorkspaceContent::open(&self.content_root)?.editable_document(&document.id)
    }

    pub fn create_translation(
        &self,
        input: &CreateTranslationInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        let (document, part) = self.document_for_part(&input.part_id)?;
        if part.shape != PartShape::Prose.schema_name() {
            return Err(WorkspaceContentError::InvalidTranslationId(format!(
                "{}:{}",
                input.part_id, input.language
            )));
        }
        if part
            .translations
            .iter()
            .any(|translation| translation.language == input.language)
        {
            return Err(WorkspaceContentError::InvalidTranslationId(format!(
                "{}:{} already exists",
                input.part_id, input.language
            )));
        }
        let locator = locator(&document, &part, &input.language)?;
        let source = markdown_source(&input.title, &input.body)?;
        self.editor
            .create_markdown_and_sync(&locator, &source, db_path)?;
        WorkspaceContent::open(&self.content_root)?.editable_document(&document.id)
    }

    pub fn save_visibility(
        &self,
        input: &SaveVisibilityInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        let (document, part, translation) = self.translation(&input.translation_id)?;
        let locator = locator(&document, &part, &translation.language)?;
        let pinned = input.pinned.map(|value| value.to_string());
        let mut fields = vec![("visibility", input.visibility.as_str())];
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

    pub fn save_metadata(
        &self,
        input: &SaveMetadataInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        let (document, part, translation) = self.translation(&input.translation_id)?;
        let kind = ContentKind::from_frontmatter_value(&document.content_type)
            .map_err(|_| WorkspaceContentError::NotFound(document.id.clone()))?;
        let locator = locator(&document, &part, &translation.language)?;
        let fields = content_metadata_fields(kind, input)?;
        self.editor.save_frontmatter_values_and_sync(
            &locator,
            &fields,
            &input.expected_revision,
            db_path,
        )?;
        WorkspaceContent::open(&self.content_root)?.editable_document(&document.id)
    }

    /// Save the complete desktop settings form as one source mutation.
    /// Lifecycle and metadata share a revision, so this boundary prevents
    /// partial saves and optimistic-concurrency conflicts.
    pub fn save_settings(
        &self,
        lifecycle: &SaveVisibilityInput,
        metadata: &SaveMetadataInput,
        db_path: impl AsRef<Path>,
    ) -> Result<EditableDocument, WorkspaceContentError> {
        if lifecycle.translation_id != metadata.translation_id
            || lifecycle.expected_revision != metadata.expected_revision
        {
            return Err(WorkspaceContentError::InvalidMetadata(
                "lifecycle and metadata must target the same source revision".to_owned(),
            ));
        }
        let (document, part, translation) = self.translation(&metadata.translation_id)?;
        let kind = ContentKind::from_frontmatter_value(&document.content_type)
            .map_err(|_| WorkspaceContentError::NotFound(document.id.clone()))?;
        let locator = locator(&document, &part, &translation.language)?;
        let fields = content_settings_fields(kind, lifecycle, metadata)?;
        self.editor.save_frontmatter_values_and_sync(
            &locator,
            &fields,
            &metadata.expected_revision,
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

    /// Permanently remove one archived source resource and refresh its
    /// projection as one recoverable transaction.
    ///
    /// The source directory is first moved out of `resources/`, then the
    /// projection is rebuilt. A projection failure moves the exact directory
    /// back before returning. Incoming relations are rejected so deletion
    /// cannot silently leave dangling authored links.
    pub fn delete_private_resource(
        &self,
        input: &DeletePrivateResourceInput,
        db_path: impl AsRef<Path>,
    ) -> Result<DeletedPrivateResource, WorkspaceContentError> {
        let (document, _, translation) = self.translation(&input.translation_id)?;
        if !document.visibility.trim().eq_ignore_ascii_case("private") {
            return Err(WorkspaceContentError::DeleteRequiresPrivate(
                document.slug.clone(),
            ));
        }

        let confirmation = deletion_confirmation(&document)?;
        if input.confirmation.trim() != confirmation {
            return Err(WorkspaceContentError::DeleteConfirmation(confirmation));
        }
        if translation.source_revision.0 != input.expected_revision {
            return Err(WorkspaceContentError::Edit(EditorError::RevisionConflict {
                path: translation.source_path,
            }));
        }

        let kind = deletable_kind(&document)?;
        let target_uri = format!("silan://resources/{}/{}", kind.dir_name(), document.slug);
        let mut incoming = Vec::new();
        for candidate in self.editable_documents()? {
            if candidate.id == document.id {
                continue;
            }
            let source_directory = ContentKind::from_frontmatter_value(&candidate.content_type)
                .map(|value| value.dir_name())
                .unwrap_or(candidate.content_type.as_str());
            for relation in candidate
                .relations
                .iter()
                .filter(|relation| relation.target_uri == target_uri)
            {
                incoming.push(format!(
                    "  silan://resources/{}/{} --{}--> {target_uri}",
                    source_directory, candidate.slug, relation.relation_type,
                ));
            }
        }
        if !incoming.is_empty() {
            return Err(WorkspaceContentError::DeleteHasIncomingRelations {
                resource: confirmation,
                relations: incoming.join("\n"),
            });
        }

        let source_path = resource_source_path(&self.content_root, kind, &document)?;
        let relative_path = source_path
            .strip_prefix(&self.content_root)
            .unwrap_or(&source_path)
            .to_string_lossy()
            .replace('\\', "/");
        let _save_guard =
            source_lock::acquire().map_err(|detail| WorkspaceContentError::Delete {
                path: relative_path.clone(),
                detail,
            })?;
        if !source_path.is_dir() {
            return Err(WorkspaceContentError::NotFound(document.id));
        }

        let transaction_root = self.content_root.join(".viking/transactions");
        fs::create_dir_all(&transaction_root).map_err(|error| WorkspaceContentError::Delete {
            path: relative_path.clone(),
            detail: format!("create deletion transaction: {error}"),
        })?;
        let staged_path = transaction_root.join(deletion_transaction_name(&document.id));
        fs::rename(&source_path, &staged_path).map_err(|error| WorkspaceContentError::Delete {
            path: relative_path.clone(),
            detail: format!("stage source directory: {error}"),
        })?;

        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            if let Err(rollback) = fs::rename(&staged_path, &source_path) {
                return Err(WorkspaceContentError::DeleteRollback {
                    path: relative_path,
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(WorkspaceContentError::DeleteProjection {
                path: relative_path,
                detail: projection,
            });
        }

        fs::remove_dir_all(&staged_path).map_err(|error| WorkspaceContentError::Delete {
            path: relative_path,
            detail: format!(
                "source was removed from the workspace, but transaction cleanup failed at {}: {error}",
                staged_path.display()
            ),
        })?;

        Ok(DeletedPrivateResource {
            document_id: document.id,
            content_type: document.content_type,
            slug: document.slug,
            confirmation,
        })
    }

    pub fn content_root(&self) -> &Path {
        &self.content_root
    }

    pub fn editor(&self) -> &ContentEditor {
        &self.editor
    }
}

fn deletable_kind(document: &EditableDocument) -> Result<ContentKind, WorkspaceContentError> {
    let kind = ContentKind::from_frontmatter_value(&document.content_type)
        .map_err(|_| WorkspaceContentError::NotFound(document.id.clone()))?;
    if matches!(
        kind,
        ContentKind::Blog | ContentKind::Episode | ContentKind::Project
    ) {
        Ok(kind)
    } else {
        Err(WorkspaceContentError::InvalidMetadata(format!(
            "permanent deletion is not supported for `{}`",
            document.content_type
        )))
    }
}

fn deletion_confirmation(document: &EditableDocument) -> Result<String, WorkspaceContentError> {
    let kind = deletable_kind(document)?;
    if kind == ContentKind::Episode {
        let series = document
            .series_slug
            .as_deref()
            .ok_or_else(|| WorkspaceContentError::NotFound(document.id.clone()))?;
        Ok(format!("{series}/{}", document.slug))
    } else {
        Ok(document.slug.clone())
    }
}

fn resource_source_path(
    content_root: &Path,
    kind: ContentKind,
    document: &EditableDocument,
) -> Result<PathBuf, WorkspaceContentError> {
    let mut path = content_root.join("resources").join(kind.dir_name());
    if kind == ContentKind::Episode {
        path.push(
            document
                .series_slug
                .as_deref()
                .ok_or_else(|| WorkspaceContentError::NotFound(document.id.clone()))?,
        );
    }
    Ok(path.join(&document.slug))
}

fn deletion_transaction_name(document_id: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("delete-{document_id}-{}-{timestamp}", std::process::id())
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

fn summary_field_for(kind: ContentKind) -> Option<&'static str> {
    match kind {
        ContentKind::Blog => Some("excerpt"),
        ContentKind::Idea => Some("abstract"),
        ContentKind::Project => Some("description"),
        _ => None,
    }
}

fn cover_field_for(kind: ContentKind) -> Option<&'static str> {
    match kind {
        ContentKind::Blog => Some("featured_image_url"),
        ContentKind::Project => Some("thumbnail_url"),
        _ => None,
    }
}

fn normalize_cover_source_type(value: Option<&str>) -> String {
    match value.map(str::trim) {
        Some("website") => "website".to_owned(),
        _ => "image".to_owned(),
    }
}

fn article_attribution(parsed: &Parsed) -> ArticleAttribution {
    let resources = parsed
        .main()
        .get("external_resources")
        .and_then(|value| value.as_records())
        .unwrap_or_default()
        .iter()
        .filter_map(|record| {
            let url = record_text(record, "url");
            (!url.is_empty()).then(|| ArticleResource {
                kind: record_text(record, "kind"),
                label: record_text(record, "label"),
                url,
            })
        })
        .collect();
    ArticleAttribution {
        project_name: parsed
            .main()
            .text("project_name")
            .unwrap_or_default()
            .to_owned(),
        publication_venue: parsed
            .main()
            .text("publication_venue")
            .unwrap_or_default()
            .to_owned(),
        project_url: parsed
            .main()
            .text("project_url")
            .unwrap_or_default()
            .to_owned(),
        external_resources: resources,
        image_author: parsed
            .main()
            .text("image_author")
            .unwrap_or_default()
            .to_owned(),
        image_site_url: parsed
            .main()
            .text("image_site_url")
            .unwrap_or_default()
            .to_owned(),
        image_watermark_mode: parsed
            .main()
            .text("image_watermark_mode")
            .unwrap_or("off")
            .to_owned(),
        image_watermark_position: parsed
            .main()
            .text("image_watermark_position")
            .unwrap_or("bottom-right")
            .to_owned(),
    }
}

fn record_text(record: &BTreeMap<String, String>, key: &str) -> String {
    record
        .get(key)
        .map(|value| value.trim().to_owned())
        .unwrap_or_default()
}

fn normalize_article_attribution(
    attribution: ArticleAttribution,
) -> Result<ArticleAttribution, WorkspaceContentError> {
    let mode = attribution.image_watermark_mode.trim();
    if !matches!(mode, "" | "off" | "metadata" | "visible" | "both") {
        return Err(WorkspaceContentError::InvalidMetadata(format!(
            "unsupported image watermark mode `{mode}`"
        )));
    }
    let position = attribution.image_watermark_position.trim();
    if !matches!(position, "" | "bottom-left" | "bottom-right") {
        return Err(WorkspaceContentError::InvalidMetadata(format!(
            "unsupported image watermark position `{position}`"
        )));
    }

    let mut resources = Vec::new();
    let mut seen_urls = std::collections::BTreeSet::new();
    for resource in attribution.external_resources {
        let url = normalize_external_url("external resource URL", &resource.url)?;
        if url.is_empty() || !seen_urls.insert(url.clone()) {
            continue;
        }
        let kind = normalize_resource_kind(&resource.kind);
        if kind.is_empty() {
            return Err(WorkspaceContentError::InvalidMetadata(
                "every external resource requires a kind".to_owned(),
            ));
        }
        resources.push(ArticleResource {
            kind,
            label: resource.label.trim().to_owned(),
            url,
        });
    }

    let image_author = attribution.image_author.trim().to_owned();
    let image_site_url = normalize_external_url("image site URL", &attribution.image_site_url)?;
    let resolved_mode = if mode.is_empty() { "off" } else { mode };
    if !matches!(resolved_mode, "off") && (image_author.is_empty() || image_site_url.is_empty()) {
        return Err(WorkspaceContentError::InvalidMetadata(
            "visible or metadata watermarks require both image_author and image_site_url"
                .to_owned(),
        ));
    }

    Ok(ArticleAttribution {
        project_name: attribution.project_name.trim().to_owned(),
        publication_venue: attribution.publication_venue.trim().to_owned(),
        project_url: normalize_external_url("project URL", &attribution.project_url)?,
        external_resources: resources,
        image_author,
        image_site_url,
        image_watermark_mode: resolved_mode.to_owned(),
        image_watermark_position: if position.is_empty() {
            "bottom-right".to_owned()
        } else {
            position.to_owned()
        },
    })
}

fn normalize_external_url(field: &str, value: &str) -> Result<String, WorkspaceContentError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    let parsed = url::Url::parse(value).map_err(|error| {
        WorkspaceContentError::InvalidMetadata(format!("{field} `{value}` is invalid: {error}"))
    })?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(WorkspaceContentError::InvalidMetadata(format!(
            "{field} must use http or https"
        )));
    }
    Ok(parsed.to_string())
}

fn normalize_resource_kind(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    let mut separator = true;
    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            normalized.push(ch.to_ascii_lowercase());
            separator = false;
        } else if !separator {
            normalized.push('-');
            separator = true;
        }
    }
    while normalized.ends_with('-') {
        normalized.pop();
    }
    normalized
}

fn content_metadata_fields(
    kind: ContentKind,
    input: &SaveMetadataInput,
) -> Result<Vec<(String, serde_yaml::Value)>, WorkspaceContentError> {
    let mut fields = vec![yaml_text("title", input.title.trim())];
    if let Some(field) = summary_field_for(kind) {
        fields.push(yaml_text(
            field,
            input.description.as_deref().unwrap_or_default().trim(),
        ));
    }
    if let Some(field) = cover_field_for(kind) {
        fields.push(yaml_text(
            field,
            input.cover_url.as_deref().unwrap_or_default().trim(),
        ));
    }
    if kind == ContentKind::Project {
        if let Some(featured) = input.is_featured {
            fields.push(("is_featured".to_owned(), serde_yaml::Value::Bool(featured)));
        }
        fields.push(yaml_text(
            "cover_source_type",
            &normalize_cover_source_type(input.cover_source_type.as_deref()),
        ));
        fields.push(yaml_text(
            "cover_website_url",
            input
                .cover_website_url
                .as_deref()
                .unwrap_or_default()
                .trim(),
        ));
        fields.push(yaml_text(
            "github_url",
            input.github_url.as_deref().unwrap_or_default().trim(),
        ));
        fields.push(yaml_text(
            "demo_url",
            input.demo_url.as_deref().unwrap_or_default().trim(),
        ));
    }
    if kind == ContentKind::Blog {
        if let Some(attribution) = input.article_attribution.clone() {
            let attribution = normalize_article_attribution(attribution)?;
            fields.extend(article_attribution_yaml(&attribution));
        }
    }
    if kind == ContentKind::Moment {
        if let Some(moment_type) = input.moment_type.as_deref() {
            fields.push(yaml_text(
                "moment_type",
                validate_metadata_enum(
                    "moment_type",
                    moment_type,
                    &[
                        "milestone",
                        "achievement",
                        "progress",
                        "release",
                        "announcement",
                        "insight",
                        "learning",
                        "reflection",
                    ],
                )?,
            ));
        }
        if let Some(priority) = input.priority.as_deref() {
            fields.push(yaml_text(
                "priority",
                validate_metadata_enum("priority", priority, &["high", "medium", "low"])?,
            ));
        }
        if let Some(tags) = input.tags.as_ref() {
            fields.push((
                "tags".to_owned(),
                serde_yaml::Value::Sequence(
                    normalize_metadata_tags(tags)?
                        .into_iter()
                        .map(serde_yaml::Value::String)
                        .collect(),
                ),
            ));
        }
    }
    Ok(fields)
}

fn content_settings_fields(
    kind: ContentKind,
    lifecycle: &SaveVisibilityInput,
    metadata: &SaveMetadataInput,
) -> Result<Vec<(String, serde_yaml::Value)>, WorkspaceContentError> {
    let mut fields = content_metadata_fields(kind, metadata)?;
    fields.push(yaml_text("visibility", lifecycle.visibility.trim()));
    if let Some(pinned) = lifecycle.pinned {
        fields.push(("pinned".to_owned(), serde_yaml::Value::Bool(pinned)));
    }
    Ok(fields)
}

fn yaml_text(key: &str, value: &str) -> (String, serde_yaml::Value) {
    (key.to_owned(), serde_yaml::Value::String(value.to_owned()))
}

fn validate_metadata_enum<'a>(
    field: &str,
    value: &'a str,
    allowed: &[&str],
) -> Result<&'a str, WorkspaceContentError> {
    let value = value.trim();
    if allowed.contains(&value) {
        return Ok(value);
    }
    Err(WorkspaceContentError::InvalidMetadata(format!(
        "`{value}` is not a valid {field}; expected one of {}",
        allowed.join(", ")
    )))
}

fn normalize_metadata_tags(tags: &[String]) -> Result<Vec<String>, WorkspaceContentError> {
    let mut normalized = Vec::new();
    for tag in tags {
        let tag = tag.trim().trim_start_matches('#');
        if tag.is_empty() || normalized.iter().any(|existing| existing == tag) {
            continue;
        }
        if tag.chars().count() > 48 {
            return Err(WorkspaceContentError::InvalidMetadata(format!(
                "tag `{tag}` exceeds 48 characters"
            )));
        }
        normalized.push(tag.to_owned());
    }
    if normalized.len() > 12 {
        return Err(WorkspaceContentError::InvalidMetadata(
            "moments support at most 12 tags".to_owned(),
        ));
    }
    Ok(normalized)
}

fn article_attribution_yaml(attribution: &ArticleAttribution) -> Vec<(String, serde_yaml::Value)> {
    let resources = attribution
        .external_resources
        .iter()
        .map(|resource| {
            let mut record = serde_yaml::Mapping::new();
            for (key, value) in [
                ("kind", resource.kind.as_str()),
                ("label", resource.label.as_str()),
                ("url", resource.url.as_str()),
            ] {
                record.insert(
                    serde_yaml::Value::String(key.to_owned()),
                    serde_yaml::Value::String(value.to_owned()),
                );
            }
            serde_yaml::Value::Mapping(record)
        })
        .collect();
    vec![
        yaml_text("project_name", &attribution.project_name),
        yaml_text("publication_venue", &attribution.publication_venue),
        yaml_text("project_url", &attribution.project_url),
        (
            "external_resources".to_owned(),
            serde_yaml::Value::Sequence(resources),
        ),
        yaml_text("image_author", &attribution.image_author),
        yaml_text("image_site_url", &attribution.image_site_url),
        yaml_text("image_watermark_mode", &attribution.image_watermark_mode),
        yaml_text(
            "image_watermark_position",
            &attribution.image_watermark_position,
        ),
    ]
}

fn entry_map_json(fields: &BTreeMap<String, EntryValue>) -> serde_json::Value {
    serde_json::Value::Object(
        fields
            .iter()
            .map(|(name, value)| (name.clone(), entry_value_json(value)))
            .collect(),
    )
}

fn markdown_source(title: &str, body: &str) -> Result<String, WorkspaceContentError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(WorkspaceContentError::InvalidTranslationId(
            "generated translation title is empty".to_owned(),
        ));
    }
    let body = body.trim();
    if body.is_empty() {
        return Err(WorkspaceContentError::InvalidTranslationId(
            "generated translation body is empty".to_owned(),
        ));
    }
    let mut frontmatter = serde_yaml::Mapping::new();
    frontmatter.insert(
        serde_yaml::Value::String("title".to_owned()),
        serde_yaml::Value::String(title.to_owned()),
    );
    let yaml =
        serde_yaml::to_string(&serde_yaml::Value::Mapping(frontmatter)).map_err(|error| {
            WorkspaceContentError::Edit(EditorError::Io {
                path: "generated translation".to_owned(),
                detail: format!("cannot serialize generated frontmatter: {error}"),
            })
        })?;
    Ok(format!("---\n{}\n---\n{}\n", yaml.trim_end(), body))
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

    fn fixture_content() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
    }

    #[test]
    fn editable_workspace_uses_stable_source_identities() {
        let workspace = WorkspaceContent::open(fixture_content()).expect("open content");
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
                    assert!(!translation.title.trim().is_empty());
                    assert!(!translation.source_path.contains("item_part"));
                }
            }
        }
    }

    #[test]
    fn episode_source_paths_include_the_series_container() {
        let workspace = WorkspaceContent::open(fixture_content()).expect("open content");
        let episode = workspace
            .editable_documents()
            .expect("scan documents")
            .into_iter()
            .find(|document| document.content_type == "episode")
            .expect("episode fixture");
        let source = &episode.parts[0].translations[0].source_path;
        assert!(
            source.starts_with("resources/episode/tutorial-series/"),
            "{source}"
        );
    }

    #[test]
    fn moment_editor_projection_exposes_semantic_metadata_and_relations() {
        let workspace = WorkspaceContent::open(fixture_content()).expect("open content");
        let moment = workspace
            .editable_documents()
            .expect("scan documents")
            .into_iter()
            .find(|document| {
                document.content_type == "moment" && document.slug == "changelog-2026-q2"
            })
            .expect("moment fixture");

        assert_eq!(moment.moment_type.as_deref(), Some("release"));
        assert_eq!(moment.priority.as_deref(), Some("medium"));
        assert_eq!(moment.tags, ["release"]);
        assert!(moment.relations.is_empty());
    }

    #[test]
    fn moment_metadata_validation_uses_the_declared_schema() {
        assert_eq!(
            validate_metadata_enum("moment_type", " insight ", &["progress", "insight"])
                .expect("valid moment type"),
            "insight"
        );
        assert!(validate_metadata_enum("priority", "urgent", &["high", "medium", "low"]).is_err());
        assert_eq!(
            normalize_metadata_tags(&[
                " #research ".to_owned(),
                "research".to_owned(),
                "systems".to_owned(),
            ])
            .expect("valid tags"),
            ["research", "systems"]
        );
    }

    #[test]
    fn settings_field_set_combines_metadata_lifecycle_visibility_and_pin() {
        let metadata = SaveMetadataInput {
            translation_id: "part:en".to_owned(),
            title: "Field note".to_owned(),
            description: None,
            cover_url: None,
            cover_source_type: None,
            cover_website_url: None,
            is_featured: None,
            github_url: None,
            demo_url: None,
            article_attribution: None,
            moment_type: Some("insight".to_owned()),
            priority: Some("high".to_owned()),
            tags: Some(vec!["research".to_owned()]),
            expected_revision: "revision".to_owned(),
        };
        let lifecycle = SaveVisibilityInput {
            translation_id: "part:en".to_owned(),
            visibility: "private".to_owned(),
            pinned: Some(true),
            expected_revision: "revision".to_owned(),
        };

        // Featured selection is a typed project field; omitted updates preserve it.
        for featured in [None, Some(true), Some(false)] {
            let project_metadata = SaveMetadataInput {
                is_featured: featured,
                ..metadata.clone()
            };
            let fields =
                content_settings_fields(ContentKind::Project, &lifecycle, &project_metadata)
                    .expect("valid project settings");
            let values = fields.into_iter().collect::<BTreeMap<_, _>>();
            assert_eq!(
                values
                    .get("is_featured")
                    .and_then(serde_yaml::Value::as_bool),
                featured
            );
            let fields =
                content_settings_fields(ContentKind::Moment, &lifecycle, &project_metadata)
                    .expect("valid moment settings");
            assert!(!fields.iter().any(|(key, _)| key == "is_featured"));
        }

        let fields = content_settings_fields(ContentKind::Moment, &lifecycle, &metadata)
            .expect("valid settings fields");
        let values = fields.into_iter().collect::<BTreeMap<_, _>>();
        assert_eq!(
            values.get("title").and_then(serde_yaml::Value::as_str),
            Some("Field note")
        );
        assert_eq!(
            values.get("status").and_then(serde_yaml::Value::as_str),
            None
        );
        assert_eq!(
            values.get("visibility").and_then(serde_yaml::Value::as_str),
            Some("private")
        );
        assert_eq!(
            values.get("pinned").and_then(serde_yaml::Value::as_bool),
            Some(true)
        );
        assert!(values
            .get("tags")
            .and_then(serde_yaml::Value::as_sequence)
            .is_some());
    }
}
