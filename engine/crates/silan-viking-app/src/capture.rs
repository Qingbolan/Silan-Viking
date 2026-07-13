//! Low-friction creation of source-backed content.
//!
//! Capture is an owner action, not a database insert: it creates a complete
//! source directory atomically and only then refreshes the SQLite projection.

use crate::source_lock;
use crate::workspace::Workspace;
use serde_yaml::{Mapping, Value};
use silan_viking_base::{ItemId, PartId};
use std::fs;
use std::path::Path;
use tempfile::Builder;
use thiserror::Error;

const LANGUAGE: &str = "en";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdeaCategory {
    Inspiration,
    Thought,
    Decision,
    State,
    Event,
}

impl IdeaCategory {
    pub fn parse(value: &str) -> Result<Self, CaptureError> {
        match value {
            "inspiration" => Ok(Self::Inspiration),
            "thought" => Ok(Self::Thought),
            "decision" => Ok(Self::Decision),
            "state" => Ok(Self::State),
            "event" => Ok(Self::Event),
            _ => Err(CaptureError::InvalidInput {
                detail: format!("unsupported idea category `{value}`"),
            }),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Inspiration => "inspiration",
            Self::Thought => "thought",
            Self::Decision => "decision",
            Self::State => "state",
            Self::Event => "event",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CapturedContent {
    pub slug: String,
    pub part_id: String,
}

#[derive(Debug, Error)]
pub enum CaptureError {
    #[error("cannot create content: {detail}")]
    InvalidInput { detail: String },

    #[error("cannot create content source at `{path}`: {detail}")]
    Io { path: String, detail: String },

    #[error("content source was restored after projection failed for `{path}`: {detail}")]
    Projection { path: String, detail: String },

    #[error(
        "projection failed for `{path}` ({projection}); source rollback was refused ({rollback})"
    )]
    Rollback {
        path: String,
        projection: String,
        rollback: String,
    },
}

#[derive(Debug, Clone, Copy)]
enum CaptureKind {
    Idea(IdeaCategory),
    Blog(IdeaCategory),
    Project,
}

impl CaptureKind {
    fn directory(self) -> &'static str {
        match self {
            Self::Idea(_) => "ideas",
            Self::Blog(_) => "blog",
            Self::Project => "projects",
        }
    }

    fn frontmatter_kind(self) -> &'static str {
        match self {
            Self::Idea(_) => "idea",
            Self::Blog(_) => "blog",
            Self::Project => "project",
        }
    }

    fn role(self) -> &'static str {
        match self {
            Self::Blog(_) => "body",
            Self::Idea(_) | Self::Project => "overview",
        }
    }

    fn initial_status(self) -> &'static str {
        match self {
            Self::Project => "active",
            Self::Idea(_) | Self::Blog(_) => "draft",
        }
    }

    fn staging_prefix(self) -> &'static str {
        match self {
            Self::Idea(_) => ".idea-capture-",
            Self::Blog(_) => ".blog-capture-",
            Self::Project => ".project-capture-",
        }
    }
}

struct SourceFiles {
    item: String,
    part: String,
    markdown: String,
}

pub struct ContentCreator {
    workspace: Workspace,
}

impl ContentCreator {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, CaptureError> {
        let workspace =
            Workspace::open(content_root.as_ref()).map_err(|error| CaptureError::Io {
                path: content_root.as_ref().display().to_string(),
                detail: error.to_string(),
            })?;
        Ok(Self { workspace })
    }

    pub fn capture_idea_and_sync(
        &self,
        note: &str,
        category: IdeaCategory,
        db_path: impl AsRef<Path>,
    ) -> Result<CapturedContent, CaptureError> {
        let note = required_text(note, "the captured thought is empty")?;
        self.create_and_sync(
            CaptureKind::Idea(category),
            &derive_title(note),
            note,
            db_path.as_ref(),
        )
    }

    pub fn capture_blog_and_sync(
        &self,
        draft: &str,
        category: IdeaCategory,
        db_path: impl AsRef<Path>,
    ) -> Result<CapturedContent, CaptureError> {
        let draft = required_text(draft, "the article draft is empty")?;
        self.create_and_sync(
            CaptureKind::Blog(category),
            &derive_title(draft),
            draft,
            db_path.as_ref(),
        )
    }

    pub fn capture_project_and_sync(
        &self,
        title: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<CapturedContent, CaptureError> {
        let title = required_text(title, "the project title is empty")?;
        let body = format!("# {title}\n\nDraft body - replace this.");
        self.create_and_sync(CaptureKind::Project, title, &body, db_path.as_ref())
    }

    fn create_and_sync(
        &self,
        kind: CaptureKind,
        title: &str,
        body: &str,
        db_path: &Path,
    ) -> Result<CapturedContent, CaptureError> {
        let _write_guard = source_lock::acquire().map_err(|detail| CaptureError::Io {
            path: self.workspace.content_root().display().to_string(),
            detail,
        })?;
        let item_id = ItemId::generate();
        let part_id = PartId::generate();
        let slug = derive_slug(title, kind.frontmatter_kind(), &item_id);
        let collection_root = self
            .workspace
            .content_root()
            .join("resources")
            .join(kind.directory());
        fs::create_dir_all(&collection_root).map_err(|error| io_error(&collection_root, error))?;
        let target = collection_root.join(&slug);
        if target.exists() {
            return Err(CaptureError::InvalidInput {
                detail: format!(
                    "generated {} slug `{slug}` already exists",
                    kind.frontmatter_kind()
                ),
            });
        }

        let files = build_files(kind, &item_id, &part_id, &slug, title, body)?;
        let staging = Builder::new()
            .prefix(kind.staging_prefix())
            .tempdir_in(&collection_root)
            .map_err(|error| io_error(&collection_root, error))?;
        write_source_files(staging.path(), kind.role(), &files)?;
        let staging_path = staging.keep();
        fs::rename(&staging_path, &target).map_err(|error| io_error(&target, error))?;

        if let Err(error) = self.workspace.sync(db_path) {
            let projection = error.to_string();
            if !matches_source_files(&target, kind.role(), &files) {
                return Err(CaptureError::Rollback {
                    path: relative_path(self.workspace.content_root(), &target),
                    projection,
                    rollback: "source changed after capture; refusing to remove external edits"
                        .to_owned(),
                });
            }
            fs::remove_dir_all(&target).map_err(|rollback| CaptureError::Rollback {
                path: relative_path(self.workspace.content_root(), &target),
                projection: projection.clone(),
                rollback: rollback.to_string(),
            })?;
            return Err(CaptureError::Projection {
                path: relative_path(self.workspace.content_root(), &target),
                detail: projection,
            });
        }

        Ok(CapturedContent {
            slug,
            part_id: part_id.to_string(),
        })
    }
}

fn required_text<'a>(value: &'a str, detail: &str) -> Result<&'a str, CaptureError> {
    let value = value.trim();
    if value.is_empty() {
        Err(CaptureError::InvalidInput {
            detail: detail.to_owned(),
        })
    } else {
        Ok(value)
    }
}

fn derive_title(note: &str) -> String {
    let first_line = note
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Untitled")
        .trim_start_matches('#')
        .trim();
    let mut title: String = first_line.chars().take(80).collect();
    if first_line.chars().count() > 80 {
        title.push('…');
    }
    if title.is_empty() {
        "Untitled".to_owned()
    } else {
        title
    }
}

fn derive_slug(title: &str, fallback: &str, item_id: &ItemId) -> String {
    let mut semantic = slugify(title);
    if semantic.is_empty() {
        semantic.push_str(fallback);
    }
    semantic.truncate(48);
    while semantic.ends_with('-') {
        semantic.pop();
    }
    let suffix = item_id
        .as_str()
        .trim_start_matches(ItemId::PREFIX)
        .chars()
        .rev()
        .take(8)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>()
        .to_ascii_lowercase();
    format!("{semantic}-{suffix}")
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut separated = true;
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character.to_ascii_lowercase());
            separated = false;
        } else if !separated {
            slug.push('-');
            separated = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    slug
}

fn build_files(
    kind: CaptureKind,
    item_id: &ItemId,
    part_id: &PartId,
    slug: &str,
    title: &str,
    body: &str,
) -> Result<SourceFiles, CaptureError> {
    let mut frontmatter = Mapping::new();
    insert(&mut frontmatter, "slug", slug);
    insert(&mut frontmatter, "title", title);
    insert(&mut frontmatter, "kind", kind.frontmatter_kind());
    if matches!(kind, CaptureKind::Blog(_)) {
        insert(&mut frontmatter, "content_type", "article");
    }
    insert(&mut frontmatter, "status", kind.initial_status());
    insert(&mut frontmatter, "visibility", "private");
    if let CaptureKind::Idea(category) | CaptureKind::Blog(category) = kind {
        insert(&mut frontmatter, "category", category.as_str());
    }
    let frontmatter =
        serde_yaml::to_string(&frontmatter).map_err(|error| CaptureError::InvalidInput {
            detail: format!("cannot encode content frontmatter: {error}"),
        })?;
    Ok(SourceFiles {
        item: format!("item_id = \"{item_id}\"\n"),
        part: format!(
            "part_id        = \"{part_id}\"\ntype           = \"{}\"\nshape          = \"prose\"\ncanonical_lang = \"{LANGUAGE}\"\n",
            kind.role()
        ),
        markdown: format!("---\n{frontmatter}---\n\n{}\n", body.trim()),
    })
}

fn insert(mapping: &mut Mapping, key: &str, value: &str) {
    mapping.insert(
        Value::String(key.to_owned()),
        Value::String(value.to_owned()),
    );
}

fn write_source_files(root: &Path, role: &str, files: &SourceFiles) -> Result<(), CaptureError> {
    let part_root = root.join("parts").join(role);
    fs::create_dir_all(&part_root).map_err(|error| io_error(&part_root, error))?;
    write_file(&root.join("item.toml"), &files.item)?;
    write_file(&part_root.join("meta.toml"), &files.part)?;
    write_file(&part_root.join(format!("{LANGUAGE}.md")), &files.markdown)
}

fn write_file(path: &Path, content: &str) -> Result<(), CaptureError> {
    fs::write(path, content).map_err(|error| io_error(path, error))
}

fn matches_source_files(root: &Path, role: &str, expected: &SourceFiles) -> bool {
    let part_root = root.join("parts").join(role);
    fs::read_to_string(root.join("item.toml")).ok().as_deref() == Some(expected.item.as_str())
        && fs::read_to_string(part_root.join("meta.toml"))
            .ok()
            .as_deref()
            == Some(expected.part.as_str())
        && fs::read_to_string(part_root.join(format!("{LANGUAGE}.md")))
            .ok()
            .as_deref()
            == Some(expected.markdown.as_str())
}

fn io_error(path: &Path, error: std::io::Error) -> CaptureError {
    CaptureError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    }
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chinese_notes_receive_a_valid_stable_slug() {
        let item_id = ItemId::generate();
        let slug = derive_slug("记录一个中文想法", "idea", &item_id);
        assert!(slug.starts_with("idea-"));
        assert!(slug.chars().all(|character| character.is_ascii_lowercase()
            || character.is_ascii_digit()
            || character == '-'));
    }

    #[test]
    fn category_parser_rejects_unowned_values() {
        assert!(matches!(
            IdeaCategory::parse("misc"),
            Err(CaptureError::InvalidInput { .. })
        ));
    }
}
