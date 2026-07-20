//! Source-first editing for local authoring surfaces.
//!
//! `content/` is the system of record. Adapters call [`ContentEditor`] to
//! update one prose representation, then the editor refreshes the SQLite
//! projection through [`Workspace::sync`]. No adapter writes projection rows.

use crate::parser::frontmatter;
use crate::source_lock;
use crate::workspace::Workspace;
use silan_viking_base::{ContentHash, Lang, Slug};
use silan_viking_content::ContentKind;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use thiserror::Error;

/// The stable source coordinates of one Markdown language representation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranslationLocator {
    kind: ContentKind,
    slug: Slug,
    series_slug: Option<Slug>,
    role: String,
    language: Lang,
}

impl TranslationLocator {
    /// Build and validate source coordinates. `series_slug` is required only
    /// for episodes because they live below a series directory.
    pub fn new(
        kind: ContentKind,
        slug: impl Into<String>,
        series_slug: Option<impl Into<String>>,
        role: impl Into<String>,
        language: impl AsRef<str>,
    ) -> Result<Self, EditorError> {
        let slug = Slug::new(slug.into()).map_err(|error| EditorError::InvalidLocator {
            detail: error.to_string(),
        })?;
        let series_slug = series_slug
            .map(|value| Slug::new(value.into()))
            .transpose()
            .map_err(|error| EditorError::InvalidLocator {
                detail: error.to_string(),
            })?;
        let role = role.into();
        if !is_safe_component(&role) {
            return Err(EditorError::InvalidLocator {
                detail: format!("invalid Part role `{role}`"),
            });
        }
        let language = Lang::new(language).map_err(|error| EditorError::InvalidLocator {
            detail: error.to_string(),
        })?;

        match (kind, series_slug.is_some()) {
            (ContentKind::Episode, false) => {
                return Err(EditorError::InvalidLocator {
                    detail: "an episode translation requires a series slug".to_owned(),
                });
            }
            (ContentKind::Episode, true) | (_, false) => {}
            (_, true) => {
                return Err(EditorError::InvalidLocator {
                    detail: "only episode translations may have a series slug".to_owned(),
                });
            }
        }

        Ok(Self {
            kind,
            slug,
            series_slug,
            role,
            language,
        })
    }
}

/// One Markdown source representation as presented to an editor.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceDocument {
    /// Markdown body without YAML frontmatter.
    pub body: String,
    /// Hash of the complete source file, used for optimistic concurrency.
    pub revision: String,
    /// Source path relative to `content/` for user-facing context.
    pub relative_path: String,
}

/// The editable Resume profile source: YAML frontmatter plus Markdown bio
/// from `resume/parts/summary/<lang>.md`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResumeProfileSource {
    /// YAML frontmatter without fences.
    pub frontmatter: String,
    /// Markdown body after the frontmatter.
    pub body: String,
    /// Hash of the complete source file, used for optimistic concurrency.
    pub revision: String,
    /// Source path relative to `content/` for user-facing context.
    pub relative_path: String,
}

/// Editable source for one episode series' `series.toml`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesMetadataSource {
    /// Directory slug under `content/resources/episode/`.
    pub slug: String,
    /// Series title stored in `series.toml`.
    pub title: String,
    /// Series description stored in `series.toml`.
    pub description: String,
    /// Series cover image URL/reference stored in `series.toml`.
    pub cover_url: String,
    /// Series status stored in `series.toml`.
    pub status: String,
    /// Hash of the complete `series.toml`, used for optimistic concurrency.
    pub revision: String,
    /// Source path relative to `content/` for user-facing context.
    pub relative_path: String,
}

/// Source editing failures with an operator-actionable cause.
#[derive(Debug, Error)]
pub enum EditorError {
    /// Source coordinates were malformed or structurally inconsistent.
    #[error("invalid translation locator: {detail}")]
    InvalidLocator { detail: String },

    /// The selected Markdown representation does not exist on disk.
    #[error("Markdown source not found: {path}")]
    SourceNotFound { path: String },

    /// A create-only write targeted an existing Markdown representation.
    #[error("Markdown source already exists: {path}")]
    SourceAlreadyExists { path: String },

    /// The source changed after the editor loaded it.
    #[error("source changed on disk; reload before saving `{path}`")]
    RevisionConflict { path: String },

    /// A file that begins a YAML frontmatter block never closes it. Saving
    /// would otherwise destroy source metadata, so the edit is rejected.
    #[error("Markdown source has an unclosed frontmatter fence: {path}")]
    MalformedSource { path: String },

    /// A source file operation failed.
    #[error("cannot update `{path}`: {detail}")]
    Io { path: String, detail: String },

    /// The source write succeeded but projection failed; the source was
    /// restored to keep disk and database consistent.
    #[error("content projection failed after saving `{path}`; source was restored: {detail}")]
    Projection { path: String, detail: String },

    /// Projection and source rollback both failed. This requires manual
    /// repair and therefore reports both errors explicitly.
    #[error("content projection failed for `{path}` ({projection}); source rollback also failed ({rollback})")]
    Rollback {
        path: String,
        projection: String,
        rollback: String,
    },
}

impl EditorError {
    /// Whether the selected Part is not represented by a Markdown file.
    pub fn is_source_not_found(&self) -> bool {
        matches!(self, Self::SourceNotFound { .. })
    }
}

/// Application service for source-first local editing.
pub struct ContentEditor {
    workspace: Workspace,
}

impl ContentEditor {
    /// Open the authoritative `content/` workspace.
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, EditorError> {
        let workspace =
            Workspace::open(content_root.as_ref()).map_err(|error| EditorError::Io {
                path: content_root.as_ref().display().to_string(),
                detail: error.to_string(),
            })?;
        Ok(Self { workspace })
    }

    /// Read the current Markdown body and complete-file revision.
    pub fn read_markdown(
        &self,
        locator: &TranslationLocator,
    ) -> Result<SourceDocument, EditorError> {
        let path = self.source_path(locator);
        let source = read_source(&path)?;
        Ok(self.source_document(&path, &source))
    }

    /// Save one Markdown body and refresh the SQLite projection as one
    /// recoverable operation. A stale revision never overwrites disk.
    pub fn save_markdown_and_sync(
        &self,
        locator: &TranslationLocator,
        body: &str,
        expected_revision: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<SourceDocument, EditorError> {
        let path = self.source_path(locator);
        let relative_path = self.relative_path(&path);
        let _save_guard = source_lock::acquire().map_err(|detail| EditorError::Io {
            path: relative_path.clone(),
            detail,
        })?;
        let original = read_source(&path)?;
        let actual_revision = ContentHash::of(original.as_bytes());
        if actual_revision.as_str() != expected_revision {
            return Err(EditorError::RevisionConflict {
                path: relative_path,
            });
        }

        let updated = frontmatter::replace_body(&original, body).ok_or_else(|| {
            EditorError::MalformedSource {
                path: relative_path.clone(),
            }
        })?;
        if updated == original {
            return Ok(self.source_document(&path, &original));
        }

        atomic_replace(&path, updated.as_bytes())?;
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            let current = read_source(&path).map_err(|error| EditorError::Rollback {
                path: relative_path.clone(),
                projection: projection.clone(),
                rollback: format!("cannot verify the source before rollback: {error}"),
            })?;
            if ContentHash::of(current.as_bytes()) != ContentHash::of(updated.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: "source changed after save; refusing to overwrite the external edit"
                        .to_owned(),
                });
            }
            if let Err(rollback) = atomic_replace(&path, original.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(EditorError::Projection {
                path: relative_path,
                detail: projection,
            });
        }

        let persisted = read_source(&path)?;
        Ok(self.source_document(&path, &persisted))
    }

    /// Create one missing Markdown representation and refresh the SQLite
    /// projection. This is intentionally create-only so generated
    /// translations never overwrite human-authored language files.
    pub fn create_markdown_and_sync(
        &self,
        locator: &TranslationLocator,
        source: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<SourceDocument, EditorError> {
        let path = self.source_path(locator);
        let relative_path = self.relative_path(&path);
        let _save_guard = source_lock::acquire().map_err(|detail| EditorError::Io {
            path: relative_path.clone(),
            detail,
        })?;
        if path.exists() {
            return Err(EditorError::SourceAlreadyExists {
                path: relative_path,
            });
        }

        atomic_replace(&path, source.as_bytes())?;
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            let current = read_source(&path).map_err(|error| EditorError::Rollback {
                path: relative_path.clone(),
                projection: projection.clone(),
                rollback: format!("cannot verify the source before rollback: {error}"),
            })?;
            if ContentHash::of(current.as_bytes()) != ContentHash::of(source.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: "source changed after create; refusing to delete the external edit"
                        .to_owned(),
                });
            }
            if let Err(rollback) = fs::remove_file(&path) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(EditorError::Projection {
                path: relative_path,
                detail: projection,
            });
        }

        let persisted = read_source(&path)?;
        Ok(self.source_document(&path, &persisted))
    }

    /// Update selected YAML frontmatter scalar fields and refresh the
    /// projection. This is the metadata counterpart to body editing:
    /// lifecycle controls (`status`, `visibility`) mutate the source file
    /// that owns item-level frontmatter, never the SQLite projection.
    pub fn save_frontmatter_fields_and_sync(
        &self,
        locator: &TranslationLocator,
        fields: &[(&str, &str)],
        expected_revision: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<SourceDocument, EditorError> {
        let path = self.source_path(locator);
        let relative_path = self.relative_path(&path);
        let _save_guard = source_lock::acquire().map_err(|detail| EditorError::Io {
            path: relative_path.clone(),
            detail,
        })?;
        let original = read_source(&path)?;
        let actual_revision = ContentHash::of(original.as_bytes());
        if actual_revision.as_str() != expected_revision {
            return Err(EditorError::RevisionConflict {
                path: relative_path,
            });
        }

        let doc = frontmatter::split(&original);
        let mut map = parse_frontmatter_mapping(&doc.frontmatter, &relative_path)?;
        for (key, value) in fields {
            let value = match *value {
                "true" => serde_yaml::Value::Bool(true),
                "false" => serde_yaml::Value::Bool(false),
                value => serde_yaml::Value::String(value.to_owned()),
            };
            map.insert(serde_yaml::Value::String((*key).to_owned()), value);
        }
        let frontmatter =
            serde_yaml::to_string(&serde_yaml::Value::Mapping(map)).map_err(|error| {
                EditorError::Io {
                    path: relative_path.clone(),
                    detail: format!("cannot serialize frontmatter: {error}"),
                }
            })?;
        let updated = format!("---\n{}\n---\n{}", frontmatter.trim_end(), doc.body);
        if updated == original {
            return Ok(self.source_document(&path, &original));
        }

        atomic_replace(&path, updated.as_bytes())?;
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            let current = read_source(&path).map_err(|error| EditorError::Rollback {
                path: relative_path.clone(),
                projection: projection.clone(),
                rollback: format!("cannot verify the source before rollback: {error}"),
            })?;
            if ContentHash::of(current.as_bytes()) != ContentHash::of(updated.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: "source changed after save; refusing to overwrite the external edit"
                        .to_owned(),
                });
            }
            if let Err(rollback) = atomic_replace(&path, original.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(EditorError::Projection {
                path: relative_path,
                detail: projection,
            });
        }

        let persisted = read_source(&path)?;
        Ok(self.source_document(&path, &persisted))
    }

    /// Read one structured Resume part file (`entry_list` /
    /// `key_value_list` TOML) for a language. Unlike Markdown parts there
    /// is no frontmatter: `body` is the complete file content.
    pub fn read_resume_part(
        &self,
        role: &str,
        language: &str,
    ) -> Result<SourceDocument, EditorError> {
        let path = self.resume_part_path(role, language)?;
        let source = read_source(&path)?;
        Ok(SourceDocument {
            body: source.clone(),
            revision: ContentHash::of(source.as_bytes()).to_string(),
            relative_path: self.relative_path(&path),
        })
    }

    /// Save one structured Resume part file and refresh the SQLite
    /// projection as one recoverable operation, with the same optimistic
    /// concurrency and rollback discipline as [`Self::save_markdown_and_sync`].
    pub fn save_resume_part_and_sync(
        &self,
        role: &str,
        language: &str,
        content: &str,
        expected_revision: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<SourceDocument, EditorError> {
        let path = self.resume_part_path(role, language)?;
        let relative_path = self.relative_path(&path);
        let _save_guard = source_lock::acquire().map_err(|detail| EditorError::Io {
            path: relative_path.clone(),
            detail,
        })?;
        let original = read_source(&path)?;
        let actual_revision = ContentHash::of(original.as_bytes());
        if actual_revision.as_str() != expected_revision {
            return Err(EditorError::RevisionConflict {
                path: relative_path,
            });
        }
        if content == original {
            return self.read_resume_part(role, language);
        }

        atomic_replace(&path, content.as_bytes())?;
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            let current = read_source(&path).map_err(|error| EditorError::Rollback {
                path: relative_path.clone(),
                projection: projection.clone(),
                rollback: format!("cannot verify the source before rollback: {error}"),
            })?;
            if ContentHash::of(current.as_bytes()) != ContentHash::of(content.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: "source changed after save; refusing to overwrite the external edit"
                        .to_owned(),
                });
            }
            if let Err(rollback) = atomic_replace(&path, original.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(EditorError::Projection {
                path: relative_path,
                detail: projection,
            });
        }

        self.read_resume_part(role, language)
    }

    /// Read the resume profile header — the YAML frontmatter of
    /// `summary/<lang>.md` (name, title, contact, social links).
    pub fn read_resume_profile(&self, language: &str) -> Result<ResumeProfileSource, EditorError> {
        let path = self.resume_summary_path(language)?;
        let source = read_source(&path)?;
        let doc = frontmatter::split(&source);
        Ok(ResumeProfileSource {
            frontmatter: doc.frontmatter,
            body: doc.body,
            revision: ContentHash::of(source.as_bytes()).to_string(),
            relative_path: self.relative_path(&path),
        })
    }

    /// Save the resume profile header and refresh the SQLite projection as
    /// one recoverable operation. The Markdown body is preserved
    /// byte-for-byte — this is the frontmatter counterpart of
    /// [`Self::save_markdown_and_sync`].
    pub fn save_resume_profile_and_sync(
        &self,
        language: &str,
        frontmatter_text: &str,
        body: &str,
        expected_revision: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<ResumeProfileSource, EditorError> {
        let path = self.resume_summary_path(language)?;
        let relative_path = self.relative_path(&path);
        let _save_guard = source_lock::acquire().map_err(|detail| EditorError::Io {
            path: relative_path.clone(),
            detail,
        })?;
        let original = read_source(&path)?;
        let actual_revision = ContentHash::of(original.as_bytes());
        if actual_revision.as_str() != expected_revision {
            return Err(EditorError::RevisionConflict {
                path: relative_path,
            });
        }

        let updated = format!(
            "---\n{}\n---\n{body}",
            frontmatter_text.trim_end_matches('\n'),
        );
        if updated == original {
            return self.read_resume_profile(language);
        }

        atomic_replace(&path, updated.as_bytes())?;
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            let current = read_source(&path).map_err(|error| EditorError::Rollback {
                path: relative_path.clone(),
                projection: projection.clone(),
                rollback: format!("cannot verify the source before rollback: {error}"),
            })?;
            if ContentHash::of(current.as_bytes()) != ContentHash::of(updated.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: "source changed after save; refusing to overwrite the external edit"
                        .to_owned(),
                });
            }
            if let Err(rollback) = atomic_replace(&path, original.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: relative_path,
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(EditorError::Projection {
                path: relative_path,
                detail: projection,
            });
        }

        self.read_resume_profile(language)
    }

    /// Read an episode series' directory-level metadata (`series.toml`).
    pub fn read_episode_series_metadata(
        &self,
        series_slug: &str,
    ) -> Result<SeriesMetadataSource, EditorError> {
        let path = self.episode_series_path(series_slug)?;
        let source = read_source(&path)?;
        self.series_metadata_source(series_slug, &path, &source)
    }

    /// Save an episode series' metadata and refresh the SQLite projection as
    /// one recoverable operation. This edits `series.toml`, not any episode
    /// Item, so episode publication state remains owned by episode files.
    pub fn save_episode_series_metadata_and_sync(
        &self,
        series_slug: &str,
        title: &str,
        description: &str,
        cover_url: &str,
        status: &str,
        expected_revision: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<SeriesMetadataSource, EditorError> {
        let path = self.episode_series_path(series_slug)?;
        let relative_path = self.relative_path(&path);
        let _save_guard = source_lock::acquire().map_err(|detail| EditorError::Io {
            path: relative_path.clone(),
            detail,
        })?;
        let original = read_source(&path)?;
        let actual_revision = ContentHash::of(original.as_bytes());
        if actual_revision.as_str() != expected_revision {
            return Err(EditorError::RevisionConflict {
                path: relative_path,
            });
        }

        let mut table = parse_toml_table(&original, &self.relative_path(&path))?;
        table.insert("title".to_owned(), toml::Value::String(title.to_owned()));
        table.insert(
            "slug".to_owned(),
            toml::Value::String(series_slug.to_owned()),
        );
        table.insert(
            "description".to_owned(),
            toml::Value::String(description.to_owned()),
        );
        table.insert(
            "cover_url".to_owned(),
            toml::Value::String(cover_url.to_owned()),
        );
        table.insert("status".to_owned(), toml::Value::String(status.to_owned()));
        let updated = toml::to_string_pretty(&toml::Value::Table(table)).map_err(|error| {
            EditorError::Io {
                path: self.relative_path(&path),
                detail: format!("cannot serialize series metadata: {error}"),
            }
        })?;
        if updated == original {
            return self.read_episode_series_metadata(series_slug);
        }

        atomic_replace(&path, updated.as_bytes())?;
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            let current = read_source(&path).map_err(|error| EditorError::Rollback {
                path: self.relative_path(&path),
                projection: projection.clone(),
                rollback: format!("cannot verify the source before rollback: {error}"),
            })?;
            if ContentHash::of(current.as_bytes()) != ContentHash::of(updated.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: self.relative_path(&path),
                    projection,
                    rollback: "source changed after save; refusing to overwrite the external edit"
                        .to_owned(),
                });
            }
            if let Err(rollback) = atomic_replace(&path, original.as_bytes()) {
                return Err(EditorError::Rollback {
                    path: self.relative_path(&path),
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            return Err(EditorError::Projection {
                path: self.relative_path(&path),
                detail: projection,
            });
        }

        self.read_episode_series_metadata(series_slug)
    }

    fn episode_series_path(&self, series_slug: &str) -> Result<PathBuf, EditorError> {
        let series_slug = Slug::new(series_slug).map_err(|error| EditorError::InvalidLocator {
            detail: error.to_string(),
        })?;
        Ok(self
            .workspace
            .content_root()
            .join("resources")
            .join(ContentKind::Episode.dir_name())
            .join(series_slug.as_str())
            .join("series.toml"))
    }

    fn resume_summary_path(&self, language: &str) -> Result<PathBuf, EditorError> {
        let language = Lang::new(language).map_err(|error| EditorError::InvalidLocator {
            detail: error.to_string(),
        })?;
        Ok(self
            .workspace
            .content_root()
            .join("resources")
            .join(ContentKind::Resume.dir_name())
            .join("parts")
            .join("summary")
            .join(format!("{}.md", language.as_str())))
    }

    fn resume_part_path(&self, role: &str, language: &str) -> Result<PathBuf, EditorError> {
        if !is_safe_component(role) {
            return Err(EditorError::InvalidLocator {
                detail: format!("invalid Part role `{role}`"),
            });
        }
        let language = Lang::new(language).map_err(|error| EditorError::InvalidLocator {
            detail: error.to_string(),
        })?;
        Ok(self
            .workspace
            .content_root()
            .join("resources")
            .join(ContentKind::Resume.dir_name())
            .join("parts")
            .join(role)
            .join(format!("{}.toml", language.as_str())))
    }

    fn source_path(&self, locator: &TranslationLocator) -> PathBuf {
        let mut path = self
            .workspace
            .content_root()
            .join("resources")
            .join(locator.kind.dir_name());
        match locator.kind {
            ContentKind::Resume => {}
            ContentKind::Episode => {
                if let Some(series_slug) = &locator.series_slug {
                    path.push(series_slug.as_str());
                }
                path.push(locator.slug.as_str());
            }
            _ => path.push(locator.slug.as_str()),
        }
        path.join("parts")
            .join(&locator.role)
            .join(format!("{}.md", locator.language.as_str()))
    }

    fn source_document(&self, path: &Path, source: &str) -> SourceDocument {
        SourceDocument {
            body: frontmatter::split(source).body,
            revision: ContentHash::of(source.as_bytes()).to_string(),
            relative_path: self.relative_path(path),
        }
    }

    fn series_metadata_source(
        &self,
        series_slug: &str,
        path: &Path,
        source: &str,
    ) -> Result<SeriesMetadataSource, EditorError> {
        let table = parse_toml_table(source, &self.relative_path(path))?;
        let text = |key: &str| {
            table
                .get(key)
                .and_then(toml::Value::as_str)
                .unwrap_or_default()
                .to_owned()
        };
        Ok(SeriesMetadataSource {
            slug: series_slug.to_owned(),
            title: text("title"),
            description: text("description"),
            cover_url: text("cover_url"),
            status: table
                .get("status")
                .and_then(toml::Value::as_str)
                .filter(|value| !value.is_empty())
                .unwrap_or("ongoing")
                .to_owned(),
            revision: ContentHash::of(source.as_bytes()).to_string(),
            relative_path: self.relative_path(path),
        })
    }

    fn relative_path(&self, path: &Path) -> String {
        path.strip_prefix(self.workspace.content_root())
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
    }
}

fn is_safe_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn read_source(path: &Path) -> Result<String, EditorError> {
    if !path.is_file() {
        return Err(EditorError::SourceNotFound {
            path: path.display().to_string(),
        });
    }
    fs::read_to_string(path).map_err(|error| EditorError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    })
}

fn parse_frontmatter_mapping(
    frontmatter: &str,
    relative_path: &str,
) -> Result<serde_yaml::Mapping, EditorError> {
    if frontmatter.trim().is_empty() {
        return Ok(serde_yaml::Mapping::new());
    }
    let value: serde_yaml::Value =
        serde_yaml::from_str(frontmatter).map_err(|error| EditorError::Io {
            path: relative_path.to_owned(),
            detail: format!("cannot parse frontmatter: {error}"),
        })?;
    match value {
        serde_yaml::Value::Mapping(map) => Ok(map),
        serde_yaml::Value::Null => Ok(serde_yaml::Mapping::new()),
        _ => Err(EditorError::Io {
            path: relative_path.to_owned(),
            detail: "frontmatter is not a YAML mapping".to_owned(),
        }),
    }
}

fn parse_toml_table(
    source: &str,
    relative_path: &str,
) -> Result<toml::map::Map<String, toml::Value>, EditorError> {
    match source
        .parse::<toml::Value>()
        .map_err(|error| EditorError::Io {
            path: relative_path.to_owned(),
            detail: format!("cannot parse TOML: {error}"),
        })? {
        toml::Value::Table(table) => Ok(table),
        _ => Err(EditorError::Io {
            path: relative_path.to_owned(),
            detail: "series metadata is not a TOML table".to_owned(),
        }),
    }
}

fn atomic_replace(path: &Path, bytes: &[u8]) -> Result<(), EditorError> {
    let parent = path.parent().ok_or_else(|| EditorError::Io {
        path: path.display().to_string(),
        detail: "source path has no parent directory".to_owned(),
    })?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(|error| EditorError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    })?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| EditorError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?;
    if let Ok(metadata) = fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| EditorError::Io {
                path: path.display().to_string(),
                detail: error.to_string(),
            })?;
    }
    temporary.persist(path).map_err(|error| EditorError::Io {
        path: path.display().to_string(),
        detail: error.error.to_string(),
    })?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| EditorError::Io {
            path: parent.display().to_string(),
            detail: error.to_string(),
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locator_rejects_path_traversal() {
        let result =
            TranslationLocator::new(ContentKind::Blog, "hello", None::<String>, "../body", "en");
        assert!(matches!(result, Err(EditorError::InvalidLocator { .. })));
    }

    #[test]
    fn episode_locator_requires_a_series() {
        let result = TranslationLocator::new(
            ContentKind::Episode,
            "episode-one",
            None::<String>,
            "body",
            "en",
        );
        assert!(matches!(result, Err(EditorError::InvalidLocator { .. })));
    }

    #[test]
    fn atomic_replace_overwrites_without_leaving_a_partial_file() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("en.md");
        fs::write(&path, "old").expect("seed source");
        atomic_replace(&path, b"new").expect("replace source");
        assert_eq!(fs::read_to_string(path).expect("read source"), "new");
    }
}
