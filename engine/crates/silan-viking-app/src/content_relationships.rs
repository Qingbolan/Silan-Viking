//! Source-backed relationship and kind-conversion use cases.
//!
//! These operations mutate item identity, directory ownership, and relation
//! frontmatter together. Keeping them in L3 prevents CLI and desktop adapters
//! from growing separate file-editing rules for the same content lifecycle.

use crate::parser::frontmatter;
use crate::source_lock;
use crate::workspace::Workspace;
use silan_viking_base::{ContentHash, Identified, ItemId, PartId, SilanUri};
use silan_viking_content::{ContentKind, Item, Part, RelationType};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tempfile::NamedTempFile;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelationshipTargetKind {
    Blog,
    Project,
}

impl RelationshipTargetKind {
    pub fn parse(value: &str) -> Result<Self, ContentRelationshipError> {
        match value.trim() {
            "blog" => Ok(Self::Blog),
            "project" | "projects" => Ok(Self::Project),
            other => Err(ContentRelationshipError::InvalidInput(format!(
                "unsupported relationship target kind `{other}`"
            ))),
        }
    }

    pub fn content_kind(self) -> ContentKind {
        match self {
            Self::Blog => ContentKind::Blog,
            Self::Project => ContentKind::Project,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelationshipMutation {
    pub item_uri: String,
    pub item_kind: String,
    pub item_slug: String,
    pub related_uri: Option<String>,
    pub related_kind: Option<String>,
    pub related_slug: Option<String>,
    pub relation_type: Option<String>,
}

#[derive(Debug, Error)]
pub enum ContentRelationshipError {
    #[error("workspace open failed: {0}")]
    Open(#[from] crate::workspace::OpenError),
    #[error("workspace scan failed: {0}")]
    Scan(#[from] crate::workspace::ScanError),
    #[error("content parse failed: {0}")]
    Parse(#[from] crate::parser::ParseError),
    #[error("invalid relationship operation: {0}")]
    InvalidInput(String),
    #[error("content item not found: {0}")]
    NotFound(String),
    #[error("cannot update `{path}`: {detail}")]
    Io { path: String, detail: String },
    #[error("content projection failed after updating `{path}`; source was restored: {detail}")]
    Projection { path: String, detail: String },
    #[error(
        "projection failed for `{path}` ({projection}); source rollback also failed ({rollback})"
    )]
    Rollback {
        path: String,
        projection: String,
        rollback: String,
    },
}

pub struct ContentRelationshipEditor {
    content_root: PathBuf,
    workspace: Workspace,
}

impl ContentRelationshipEditor {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, ContentRelationshipError> {
        let content_root = content_root.as_ref().to_path_buf();
        Ok(Self {
            workspace: Workspace::open(&content_root)?,
            content_root,
        })
    }

    pub fn convert_blog_to_moment_and_sync(
        &self,
        slug: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        self.convert_kind_and_sync(slug, ContentKind::Blog, ContentKind::Moment, db_path)
    }

    pub fn convert_moment_to_blog_and_sync(
        &self,
        slug: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        self.convert_kind_and_sync(slug, ContentKind::Moment, ContentKind::Blog, db_path)
    }

    pub fn create_from_moment_and_sync(
        &self,
        moment_slug: &str,
        target_kind: RelationshipTargetKind,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        let _guard = source_lock::acquire().map_err(|detail| ContentRelationshipError::Io {
            path: self.content_root.display().to_string(),
            detail,
        })?;
        let moment = self.item(ContentKind::Moment, moment_slug)?;
        let moment_dir = self.item_dir(moment.kind(), moment.slug().as_str());
        let body_part = primary_part(&moment)?;
        let target_kind = target_kind.content_kind();
        let target_slug = self.unique_slug(target_kind, moment.slug().as_str());
        let target_dir = self.item_dir(target_kind, &target_slug);
        let target_uri = item_uri(target_kind, &target_slug);

        let files = clone_primary_part_files(
            &moment_dir,
            body_part,
            target_kind,
            &target_slug,
            primary_role(target_kind),
        )?;
        write_created_item(&target_dir, target_kind, primary_role(target_kind), &files)?;

        let relation_file = primary_markdown_path(&self.content_root, &moment, body_part)?;
        let original_relation = read_source(&relation_file)?;
        let updated_relation = set_relation(
            &original_relation,
            RelationType::EvolvedInto,
            &target_uri,
            RelationEdit::Add,
            &self.relative_path(&relation_file),
        )?;
        if updated_relation != original_relation {
            atomic_replace(&relation_file, updated_relation.as_bytes())?;
        }

        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            rollback_created_dir(&target_dir, &self.relative_path(&target_dir), &projection)?;
            rollback_file(
                &relation_file,
                &updated_relation,
                &original_relation,
                &self.relative_path(&relation_file),
                &projection,
            )?;
            return Err(ContentRelationshipError::Projection {
                path: format!(
                    "{}, {}",
                    self.relative_path(&target_dir),
                    self.relative_path(&relation_file)
                ),
                detail: projection,
            });
        }

        Ok(RelationshipMutation {
            item_uri: moment.uri().to_string(),
            item_kind: ContentKind::Moment.frontmatter_value().to_owned(),
            item_slug: moment_slug.to_owned(),
            related_uri: Some(target_uri),
            related_kind: Some(target_kind.frontmatter_value().to_owned()),
            related_slug: Some(target_slug),
            relation_type: Some(RelationType::EvolvedInto.as_str().to_owned()),
        })
    }

    pub fn link_moment_to_existing_and_sync(
        &self,
        moment_slug: &str,
        target_kind: RelationshipTargetKind,
        target_slug: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        self.edit_moment_relation_and_sync(
            moment_slug,
            target_kind.content_kind(),
            target_slug,
            RelationType::References,
            RelationEdit::Add,
            db_path,
        )
    }

    pub fn unlink_moment_from_existing_and_sync(
        &self,
        moment_slug: &str,
        target_kind: RelationshipTargetKind,
        target_slug: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        self.edit_moment_relation_and_sync(
            moment_slug,
            target_kind.content_kind(),
            target_slug,
            RelationType::References,
            RelationEdit::Remove,
            db_path,
        )
    }

    pub fn link_and_sync(
        &self,
        from_uri: &str,
        to_uri: &str,
        relation_type: RelationType,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        let _guard = source_lock::acquire().map_err(|detail| ContentRelationshipError::Io {
            path: self.content_root.display().to_string(),
            detail,
        })?;
        let from = self.item_by_uri(from_uri)?;
        let to = self.item_by_uri(to_uri)?;
        let part = primary_part(&from)?;
        let relation_file = primary_markdown_path(&self.content_root, &from, part)?;
        let original = read_source(&relation_file)?;
        let updated = set_relation(
            &original,
            relation_type,
            &to.uri().to_string(),
            RelationEdit::Add,
            &self.relative_path(&relation_file),
        )?;
        if updated != original {
            atomic_replace(&relation_file, updated.as_bytes())?;
        }
        self.sync_or_rollback_file(db_path, &relation_file, &updated, &original)?;
        Ok(RelationshipMutation {
            item_uri: from.uri().to_string(),
            item_kind: from.kind().frontmatter_value().to_owned(),
            item_slug: from.slug().to_string(),
            related_uri: Some(to.uri().to_string()),
            related_kind: Some(to.kind().frontmatter_value().to_owned()),
            related_slug: Some(to.slug().to_string()),
            relation_type: Some(relation_type.as_str().to_owned()),
        })
    }

    fn convert_kind_and_sync(
        &self,
        slug: &str,
        from_kind: ContentKind,
        to_kind: ContentKind,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        if !matches!(
            (from_kind, to_kind),
            (ContentKind::Blog, ContentKind::Moment) | (ContentKind::Moment, ContentKind::Blog)
        ) {
            return Err(ContentRelationshipError::InvalidInput(
                "only blog <-> moment conversion is supported".to_owned(),
            ));
        }
        let _guard = source_lock::acquire().map_err(|detail| ContentRelationshipError::Io {
            path: self.content_root.display().to_string(),
            detail,
        })?;
        let item = self.item(from_kind, slug)?;
        let source_dir = self.item_dir(from_kind, item.slug().as_str());
        let target_dir = self.item_dir(to_kind, item.slug().as_str());
        if target_dir.exists() {
            return Err(ContentRelationshipError::InvalidInput(format!(
                "target {} `{slug}` already exists",
                to_kind.frontmatter_value()
            )));
        }

        let mut originals = Vec::new();
        for markdown in prose_markdown_files(&source_dir)? {
            let original = read_source(&markdown)?;
            let updated = convert_markdown_kind(
                &original,
                from_kind,
                to_kind,
                &self.relative_path(&markdown),
            )?;
            if updated != original {
                atomic_replace(&markdown, updated.as_bytes())?;
            }
            originals.push((markdown, original, updated));
        }
        fs::rename(&source_dir, &target_dir).map_err(|error| io_error(&target_dir, error))?;

        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            if let Err(rollback) = fs::rename(&target_dir, &source_dir) {
                return Err(ContentRelationshipError::Rollback {
                    path: self.relative_path(&target_dir),
                    projection,
                    rollback: rollback.to_string(),
                });
            }
            for (path, original, updated) in originals.iter().rev() {
                rollback_file(
                    path,
                    updated,
                    original,
                    &self.relative_path(path),
                    &projection,
                )?;
            }
            return Err(ContentRelationshipError::Projection {
                path: self.relative_path(&source_dir),
                detail: projection,
            });
        }

        Ok(RelationshipMutation {
            item_uri: item_uri(to_kind, slug),
            item_kind: to_kind.frontmatter_value().to_owned(),
            item_slug: slug.to_owned(),
            related_uri: None,
            related_kind: None,
            related_slug: None,
            relation_type: None,
        })
    }

    fn edit_moment_relation_and_sync(
        &self,
        moment_slug: &str,
        target_kind: ContentKind,
        target_slug: &str,
        relation_type: RelationType,
        edit: RelationEdit,
        db_path: impl AsRef<Path>,
    ) -> Result<RelationshipMutation, ContentRelationshipError> {
        let _guard = source_lock::acquire().map_err(|detail| ContentRelationshipError::Io {
            path: self.content_root.display().to_string(),
            detail,
        })?;
        let moment = self.item(ContentKind::Moment, moment_slug)?;
        let target = self.item(target_kind, target_slug)?;
        let part = primary_part(&moment)?;
        let relation_file = primary_markdown_path(&self.content_root, &moment, part)?;
        let original = read_source(&relation_file)?;
        let updated = set_relation(
            &original,
            relation_type,
            &target.uri().to_string(),
            edit,
            &self.relative_path(&relation_file),
        )?;
        if updated != original {
            atomic_replace(&relation_file, updated.as_bytes())?;
        }
        self.sync_or_rollback_file(db_path, &relation_file, &updated, &original)?;

        Ok(RelationshipMutation {
            item_uri: moment.uri().to_string(),
            item_kind: ContentKind::Moment.frontmatter_value().to_owned(),
            item_slug: moment_slug.to_owned(),
            related_uri: Some(target.uri().to_string()),
            related_kind: Some(target_kind.frontmatter_value().to_owned()),
            related_slug: Some(target_slug.to_owned()),
            relation_type: Some(relation_type.as_str().to_owned()),
        })
    }

    fn sync_or_rollback_file(
        &self,
        db_path: impl AsRef<Path>,
        path: &Path,
        updated: &str,
        original: &str,
    ) -> Result<(), ContentRelationshipError> {
        if let Err(error) = self.workspace.sync(db_path.as_ref()) {
            let projection = error.to_string();
            rollback_file(
                path,
                updated,
                original,
                &self.relative_path(path),
                &projection,
            )?;
            return Err(ContentRelationshipError::Projection {
                path: self.relative_path(path),
                detail: projection,
            });
        }
        Ok(())
    }

    fn item(&self, kind: ContentKind, slug: &str) -> Result<Item, ContentRelationshipError> {
        self.workspace
            .scan()?
            .items()
            .iter()
            .find(|item| item.kind() == kind && item.slug().as_str() == slug)
            .cloned()
            .ok_or_else(|| {
                ContentRelationshipError::NotFound(format!("{} `{slug}`", kind.frontmatter_value()))
            })
    }

    fn item_by_uri(&self, uri: &str) -> Result<Item, ContentRelationshipError> {
        let uri = uri
            .parse::<SilanUri>()
            .map_err(|error| ContentRelationshipError::InvalidInput(error.to_string()))?;
        self.workspace
            .scan()?
            .items()
            .iter()
            .find(|item| item.uri() == &uri)
            .cloned()
            .ok_or_else(|| ContentRelationshipError::NotFound(uri.to_string()))
    }

    fn unique_slug(&self, kind: ContentKind, preferred: &str) -> String {
        let base = slugify(preferred).unwrap_or_else(|| kind.frontmatter_value().to_owned());
        if !self.item_dir(kind, &base).exists() {
            return base;
        }
        for suffix in 2.. {
            let candidate = format!("{base}-{suffix}");
            if !self.item_dir(kind, &candidate).exists() {
                return candidate;
            }
        }
        unreachable!("unbounded suffix search must return")
    }

    fn item_dir(&self, kind: ContentKind, slug: &str) -> PathBuf {
        self.content_root
            .join("resources")
            .join(kind.dir_name())
            .join(slug)
    }

    fn relative_path(&self, path: &Path) -> String {
        path.strip_prefix(&self.content_root)
            .unwrap_or(path)
            .to_string_lossy()
            .replace('\\', "/")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RelationEdit {
    Add,
    Remove,
}

struct ClonedPartFiles {
    canonical_language: String,
    translations: Vec<(String, String)>,
}

fn primary_role(kind: ContentKind) -> &'static str {
    match kind {
        ContentKind::Project => "overview",
        ContentKind::Blog | ContentKind::Moment | ContentKind::Episode => "body",
        ContentKind::Resume => "summary",
        ContentKind::Idea => "body",
    }
}

fn primary_part(item: &Item) -> Result<&Part, ContentRelationshipError> {
    let role = primary_role(item.kind());
    item.parts()
        .iter()
        .find(|part| part.role().as_str() == role)
        .or_else(|| item.parts().first())
        .ok_or_else(|| {
            ContentRelationshipError::InvalidInput(format!(
                "{} `{}` has no parts",
                item.kind().frontmatter_value(),
                item.slug()
            ))
        })
}

fn item_uri(kind: ContentKind, slug: &str) -> String {
    format!("silan://resources/{}/{slug}", kind.dir_name())
}

fn primary_markdown_path(
    content_root: &Path,
    item: &Item,
    part: &Part,
) -> Result<PathBuf, ContentRelationshipError> {
    let language = part
        .canonical_file()
        .map(|file| file.lang().to_string())
        .unwrap_or_else(|| part.canonical_lang().to_string());
    let path = content_root
        .join("resources")
        .join(item.kind().dir_name())
        .join(item.slug().as_str())
        .join("parts")
        .join(part.role().as_str())
        .join(format!("{language}.md"));
    if !path.is_file() {
        return Err(ContentRelationshipError::NotFound(
            path.display().to_string(),
        ));
    }
    Ok(path)
}

fn clone_primary_part_files(
    source_item_dir: &Path,
    source_part: &Part,
    target_kind: ContentKind,
    target_slug: &str,
    _target_role: &str,
) -> Result<ClonedPartFiles, ContentRelationshipError> {
    let source_part_dir = source_item_dir
        .join("parts")
        .join(source_part.role().as_str());
    let mut translations = Vec::new();
    for entry in
        fs::read_dir(&source_part_dir).map_err(|error| io_error(&source_part_dir, error))?
    {
        let entry = entry.map_err(|error| io_error(&source_part_dir, error))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let Some(language) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let source = read_source(&path)?;
        let updated = convert_markdown_for_new_item(
            &source,
            target_kind,
            target_slug,
            &path.to_string_lossy(),
        )?;
        translations.push((language.to_owned(), updated));
    }
    if translations.is_empty() {
        return Err(ContentRelationshipError::InvalidInput(format!(
            "source part `{}` has no Markdown translations to clone",
            source_part.role()
        )));
    }
    let canonical_language = source_part.canonical_lang().to_string();
    Ok(ClonedPartFiles {
        canonical_language,
        translations,
    })
}

fn write_created_item(
    item_dir: &Path,
    kind: ContentKind,
    role: &str,
    files: &ClonedPartFiles,
) -> Result<(), ContentRelationshipError> {
    if item_dir.exists() {
        return Err(ContentRelationshipError::InvalidInput(format!(
            "target item already exists at `{}`",
            item_dir.display()
        )));
    }
    let part_dir = item_dir.join("parts").join(role);
    fs::create_dir_all(&part_dir).map_err(|error| io_error(&part_dir, error))?;
    write_file(
        &item_dir.join("item.toml"),
        &format!("item_id = \"{}\"\n", ItemId::generate()),
    )?;
    write_file(
        &part_dir.join("meta.toml"),
        &format!(
            "part_id        = \"{}\"\ntype           = \"{role}\"\nshape          = \"prose\"\ncanonical_lang = \"{}\"\n",
            PartId::generate(),
            files.canonical_language
        ),
    )?;
    for (language, source) in &files.translations {
        write_file(&part_dir.join(format!("{language}.md")), source)?;
    }
    if kind == ContentKind::Project {
        // The required project surface is the overview Part; no extra files.
    }
    Ok(())
}

fn convert_markdown_kind(
    source: &str,
    from_kind: ContentKind,
    to_kind: ContentKind,
    relative_path: &str,
) -> Result<String, ContentRelationshipError> {
    let doc = frontmatter::split(source);
    let mut map = parse_mapping(&doc.frontmatter, relative_path)?;
    normalize_frontmatter_for_kind(&mut map, from_kind, to_kind, None);
    render_markdown(map, &doc.body, relative_path)
}

fn convert_markdown_for_new_item(
    source: &str,
    target_kind: ContentKind,
    target_slug: &str,
    relative_path: &str,
) -> Result<String, ContentRelationshipError> {
    let doc = frontmatter::split(source);
    let mut map = parse_mapping(&doc.frontmatter, relative_path)?;
    let source_kind = map
        .get(serde_yaml::Value::String("kind".to_owned()))
        .and_then(serde_yaml::Value::as_str)
        .and_then(|value| ContentKind::from_frontmatter_value(value).ok())
        .unwrap_or(ContentKind::Moment);
    normalize_frontmatter_for_kind(&mut map, source_kind, target_kind, Some(target_slug));
    render_markdown(map, &doc.body, relative_path)
}

fn normalize_frontmatter_for_kind(
    map: &mut serde_yaml::Mapping,
    _from_kind: ContentKind,
    to_kind: ContentKind,
    slug: Option<&str>,
) {
    if let Some(slug) = slug {
        put_text(map, "slug", slug);
    }
    put_text(map, "kind", to_kind.frontmatter_value());
    match to_kind {
        ContentKind::Moment => {
            remove_keys(
                map,
                &[
                    "content_type",
                    "excerpt",
                    "is_featured",
                    "featured_image_url",
                    "published_at",
                    "category",
                    "series",
                    "series_order",
                    "project_name",
                    "publication_venue",
                    "project_url",
                    "external_resources",
                    "image_author",
                    "image_site_url",
                    "image_watermark_mode",
                    "image_watermark_position",
                ],
            );
            put_text(map, "moment_type", "progress");
            put_text(map, "priority", "medium");
            put_text(map, "date", &today_iso8601());
        }
        ContentKind::Blog => {
            remove_keys(map, &["moment_type", "priority", "pinned", "date"]);
            put_text(map, "content_type", "article");
        }
        ContentKind::Project => {
            remove_keys(map, &["moment_type", "priority", "pinned", "date"]);
            put_bool(map, "is_featured", false);
        }
        _ => {}
    }
}

fn set_relation(
    source: &str,
    relation_type: RelationType,
    to_uri: &str,
    edit: RelationEdit,
    relative_path: &str,
) -> Result<String, ContentRelationshipError> {
    let doc = frontmatter::split(source);
    let mut map = parse_mapping(&doc.frontmatter, relative_path)?;
    let key = serde_yaml::Value::String("relations".to_owned());
    let mut relations = map
        .get(&key)
        .and_then(serde_yaml::Value::as_sequence)
        .cloned()
        .unwrap_or_default();
    let matches = |value: &serde_yaml::Value| {
        let Some(record) = value.as_mapping() else {
            return false;
        };
        let rel = record
            .get(serde_yaml::Value::String("type".to_owned()))
            .and_then(serde_yaml::Value::as_str);
        let to = record
            .get(serde_yaml::Value::String("to".to_owned()))
            .and_then(serde_yaml::Value::as_str);
        rel == Some(relation_type.as_str()) && to == Some(to_uri)
    };

    match edit {
        RelationEdit::Add => {
            if !relations.iter().any(matches) {
                let mut record = serde_yaml::Mapping::new();
                put_text(&mut record, "type", relation_type.as_str());
                put_text(&mut record, "to", to_uri);
                relations.push(serde_yaml::Value::Mapping(record));
            }
        }
        RelationEdit::Remove => relations.retain(|value| !matches(value)),
    }

    if relations.is_empty() {
        map.remove(&key);
    } else {
        map.insert(key, serde_yaml::Value::Sequence(relations));
    }
    render_markdown(map, &doc.body, relative_path)
}

fn parse_mapping(
    frontmatter: &str,
    relative_path: &str,
) -> Result<serde_yaml::Mapping, ContentRelationshipError> {
    if frontmatter.trim().is_empty() {
        return Ok(serde_yaml::Mapping::new());
    }
    match serde_yaml::from_str::<serde_yaml::Value>(frontmatter).map_err(|error| {
        ContentRelationshipError::Io {
            path: relative_path.to_owned(),
            detail: format!("cannot parse frontmatter: {error}"),
        }
    })? {
        serde_yaml::Value::Mapping(map) => Ok(map),
        serde_yaml::Value::Null => Ok(serde_yaml::Mapping::new()),
        _ => Err(ContentRelationshipError::Io {
            path: relative_path.to_owned(),
            detail: "frontmatter is not a YAML mapping".to_owned(),
        }),
    }
}

fn render_markdown(
    map: serde_yaml::Mapping,
    body: &str,
    relative_path: &str,
) -> Result<String, ContentRelationshipError> {
    let yaml = serde_yaml::to_string(&serde_yaml::Value::Mapping(map)).map_err(|error| {
        ContentRelationshipError::Io {
            path: relative_path.to_owned(),
            detail: format!("cannot serialize frontmatter: {error}"),
        }
    })?;
    Ok(format!("---\n{}\n---\n{}", yaml.trim_end(), body))
}

fn put_text(map: &mut serde_yaml::Mapping, key: &str, value: &str) {
    map.insert(
        serde_yaml::Value::String(key.to_owned()),
        serde_yaml::Value::String(value.to_owned()),
    );
}

fn put_bool(map: &mut serde_yaml::Mapping, key: &str, value: bool) {
    map.insert(
        serde_yaml::Value::String(key.to_owned()),
        serde_yaml::Value::Bool(value),
    );
}

fn remove_keys(map: &mut serde_yaml::Mapping, keys: &[&str]) {
    for key in keys {
        map.remove(serde_yaml::Value::String((*key).to_owned()));
    }
}

fn prose_markdown_files(item_dir: &Path) -> Result<Vec<PathBuf>, ContentRelationshipError> {
    let parts_dir = item_dir.join("parts");
    let mut files = Vec::new();
    for part in fs::read_dir(&parts_dir).map_err(|error| io_error(&parts_dir, error))? {
        let part = part.map_err(|error| io_error(&parts_dir, error))?;
        let part_dir = part.path();
        if !part_dir.is_dir() {
            continue;
        }
        for entry in fs::read_dir(&part_dir).map_err(|error| io_error(&part_dir, error))? {
            let entry = entry.map_err(|error| io_error(&part_dir, error))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) == Some("md") {
                files.push(path);
            }
        }
    }
    Ok(files)
}

fn today_iso8601() -> String {
    let date = time::OffsetDateTime::now_utc().date();
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        u8::from(date.month()),
        date.day()
    )
}

fn slugify(value: &str) -> Option<String> {
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
    (!slug.is_empty()).then_some(slug)
}

fn write_file(path: &Path, source: &str) -> Result<(), ContentRelationshipError> {
    fs::write(path, source).map_err(|error| io_error(path, error))
}

fn read_source(path: &Path) -> Result<String, ContentRelationshipError> {
    fs::read_to_string(path).map_err(|error| io_error(path, error))
}

fn atomic_replace(path: &Path, bytes: &[u8]) -> Result<(), ContentRelationshipError> {
    let parent = path.parent().ok_or_else(|| ContentRelationshipError::Io {
        path: path.display().to_string(),
        detail: "source path has no parent directory".to_owned(),
    })?;
    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|error| ContentRelationshipError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?;
    temporary
        .write_all(bytes)
        .and_then(|_| temporary.as_file().sync_all())
        .map_err(|error| ContentRelationshipError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?;
    if let Ok(metadata) = fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| ContentRelationshipError::Io {
                path: path.display().to_string(),
                detail: error.to_string(),
            })?;
    }
    temporary
        .persist(path)
        .map_err(|error| ContentRelationshipError::Io {
            path: path.display().to_string(),
            detail: error.error.to_string(),
        })?;
    #[cfg(unix)]
    fs::File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| ContentRelationshipError::Io {
            path: parent.display().to_string(),
            detail: error.to_string(),
        })?;
    Ok(())
}

fn rollback_file(
    path: &Path,
    updated: &str,
    original: &str,
    relative_path: &str,
    projection: &str,
) -> Result<(), ContentRelationshipError> {
    let current = read_source(path).map_err(|error| ContentRelationshipError::Rollback {
        path: relative_path.to_owned(),
        projection: projection.to_owned(),
        rollback: format!("cannot verify current source before rollback: {error}"),
    })?;
    if ContentHash::of(current.as_bytes()) != ContentHash::of(updated.as_bytes()) {
        return Err(ContentRelationshipError::Rollback {
            path: relative_path.to_owned(),
            projection: projection.to_owned(),
            rollback: "source changed after edit; refusing to overwrite external changes"
                .to_owned(),
        });
    }
    atomic_replace(path, original.as_bytes()).map_err(|error| ContentRelationshipError::Rollback {
        path: relative_path.to_owned(),
        projection: projection.to_owned(),
        rollback: error.to_string(),
    })
}

fn rollback_created_dir(
    path: &Path,
    relative_path: &str,
    projection: &str,
) -> Result<(), ContentRelationshipError> {
    if !path.exists() {
        return Ok(());
    }
    fs::remove_dir_all(path).map_err(|error| ContentRelationshipError::Rollback {
        path: relative_path.to_owned(),
        projection: projection.to_owned(),
        rollback: error.to_string(),
    })
}

fn io_error(path: &Path, error: std::io::Error) -> ContentRelationshipError {
    ContentRelationshipError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn markdown(frontmatter: &str) -> String {
        format!("---\n{frontmatter}\n---\n# Body\n")
    }

    #[test]
    fn converts_blog_frontmatter_to_moment_contract() {
        let source = markdown(
            "slug: demo\ntitle: Demo\nkind: blog\ncontent_type: article\nvisibility: private\nexcerpt: Old",
        );
        let converted = convert_markdown_kind(
            &source,
            ContentKind::Blog,
            ContentKind::Moment,
            "resources/blog/demo/parts/body/en.md",
        )
        .expect("convert frontmatter");
        assert!(converted.contains("kind: moment"));
        assert!(converted.contains("moment_type: progress"));
        assert!(!converted.contains("status:"));
        assert!(!converted.contains("content_type:"));
        assert!(!converted.contains("excerpt:"));
    }

    #[test]
    fn relation_add_is_idempotent_and_remove_deletes_empty_block() {
        let source = markdown("slug: m\ntitle: M\nkind: moment");
        let linked = set_relation(
            &source,
            RelationType::References,
            "silan://resources/blog/b",
            RelationEdit::Add,
            "m.md",
        )
        .expect("link");
        let linked_again = set_relation(
            &linked,
            RelationType::References,
            "silan://resources/blog/b",
            RelationEdit::Add,
            "m.md",
        )
        .expect("link idempotently");
        assert_eq!(linked, linked_again);
        let count = linked_again.matches("type: references").count();
        assert_eq!(count, 1);
        let unlinked = set_relation(
            &linked_again,
            RelationType::References,
            "silan://resources/blog/b",
            RelationEdit::Remove,
            "m.md",
        )
        .expect("unlink");
        assert!(!unlinked.contains("relations:"));
    }
}
