//! `scan` — walk `content/resources/` into `Item`s.
//!
//! Per `docs/silan-viking/01` §1.5.0, the scan is where a `ContentKind` is
//! decided — from the `content/resources/{type}/` directory name, never
//! guessed by a parser. The on-disk layout (`10` §10.4, `06` §6.2):
//!
//! ```text
//!   content/resources/{type}/{item}/parts/{role}/{meta.toml, <lang>.<ext>}
//!   content/resources/episode/{series}/{item}/parts/{role}/...   (episodes)
//! ```
//!
//! `episode` is special: its Items live one level deeper, under a
//! `{series}/` directory holding `series.toml` (`10` §10.4.4). The scan
//! flattens episodes into the `episode` Collection; the series structure is
//! a `Workspace` concern handled elsewhere.
//!
//! The scan only builds the content tree — it does no schema validation
//! (that is the parser's job) and no IO beyond reading files.

use silan_viking_base::{ContentHash, ItemId, Lang, Meta, Namespace, PartId, SilanUri, Slug};
use silan_viking_content::{ContentError, ContentKind, File, Item, Part, PartRole, PartShape};
use std::path::{Path, PathBuf};
use thiserror::Error;
use time::OffsetDateTime;

/// All ways the disk scan can fail.
#[derive(Debug, Error)]
pub enum ScanError {
    /// A directory or file could not be read.
    #[error("cannot read `{path}`: {detail}")]
    Io { path: String, detail: String },

    /// A `content/resources/` subdirectory was not a known content type.
    #[error("unknown content type directory `{name}`")]
    UnknownContentKind { name: String },

    /// An Item directory name was not a valid slug.
    #[error("invalid item slug `{name}` in `{kind}`: {detail}")]
    InvalidSlug {
        kind: String,
        name: String,
        detail: String,
    },

    /// A content-layer construction failed.
    #[error("content error during scan of `{location}`: {source}")]
    Content {
        location: String,
        #[source]
        source: ContentError,
    },
}

/// The result of a scan: the Items found, in deterministic order.
#[derive(Debug, Default)]
pub struct ScanReport {
    items: Vec<Item>,
}

impl ScanReport {
    /// The scanned Items.
    pub fn items(&self) -> &[Item] {
        &self.items
    }

    /// The number of Items found.
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Whether the scan found no Items.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

/// Scan `content_root/resources/` and build every `Item`.
pub fn scan_resources(content_root: &Path) -> Result<ScanReport, ScanError> {
    let resources = content_root.join("resources");
    let mut items = Vec::new();

    // `ContentKind::ALL` gives a deterministic type order.
    for kind in ContentKind::ALL {
        let type_dir = resources.join(kind.dir_name());
        if !type_dir.is_dir() {
            continue;
        }
        match kind {
            // `episode` items live one level deeper, under a series directory.
            ContentKind::Episode => scan_episode_type(&type_dir, &mut items)?,
            // `resume` is a single Item: `content/resources/resume/` IS the
            // Item directory — its `parts/` are directly inside it, there is
            // no `{item}` subdirectory level (`10` §10.4.5).
            ContentKind::Resume => {
                items.push(build_item(ContentKind::Resume, "resume", &type_dir)?);
            }
            // Every other type has one subdirectory per Item.
            _ => scan_flat_type(kind, &type_dir, &mut items)?,
        }
    }

    Ok(ScanReport { items })
}

/// Scan a flat content type (`blog` / `ideas` / `projects` / `update` /
/// `resume`): each immediate subdirectory is one Item.
fn scan_flat_type(
    kind: ContentKind,
    type_dir: &Path,
    out: &mut Vec<Item>,
) -> Result<(), ScanError> {
    for item_dir in sorted_subdirs(type_dir)? {
        let slug_name = dir_name(&item_dir);
        out.push(build_item(kind, &slug_name, &item_dir)?);
    }
    Ok(())
}

/// Scan the `episode` type: each subdirectory is a *series*, and each
/// subdirectory of a series is one episode Item.
fn scan_episode_type(type_dir: &Path, out: &mut Vec<Item>) -> Result<(), ScanError> {
    for series_dir in sorted_subdirs(type_dir)? {
        for episode_dir in sorted_subdirs(&series_dir)? {
            let slug_name = dir_name(&episode_dir);
            out.push(build_item(ContentKind::Episode, &slug_name, &episode_dir)?);
        }
    }
    Ok(())
}

/// Build one `Item` from its directory: read every Part under `parts/`.
fn build_item(kind: ContentKind, slug_name: &str, item_dir: &Path) -> Result<Item, ScanError> {
    let slug = Slug::new(slug_name).map_err(|e| ScanError::InvalidSlug {
        kind: kind.dir_name().to_owned(),
        name: slug_name.to_owned(),
        detail: e.to_string(),
    })?;

    let uri = SilanUri::new(
        Namespace::Resources,
        [kind.dir_name().to_owned(), slug_name.to_owned()],
    )
    .map_err(|e| ScanError::Content {
        location: format!("{}/{slug_name}", kind.dir_name()),
        source: ContentError::Base(e),
    })?;

    let parts_dir = item_dir.join("parts");
    let mut parts = Vec::new();
    if parts_dir.is_dir() {
        for part_dir in sorted_subdirs(&parts_dir)? {
            parts.push(build_part(kind, slug_name, &part_dir)?);
        }
    }

    // The Item's content hash is the digest of its Parts' canonical bytes,
    // joined in a stable order — enough for change detection.
    let mut digest_source = String::new();
    for part in &parts {
        for file in part.files() {
            digest_source.push_str(file.hash().as_str());
        }
    }
    let meta = Meta::new(
        ContentHash::of(digest_source.as_bytes()),
        scan_timestamp(item_dir),
    );

    Ok(Item::new(ItemId::generate(), kind, slug, uri, meta, parts))
}

/// The optional declarations a Part `meta.toml` may carry. Each field is
/// `None` when the file is absent or omits that key.
#[derive(Debug, Default)]
struct PartMetaDecl {
    /// The declared `part_id`, if a valid `p_<ulid>` was present.
    part_id: Option<PartId>,
    /// The declared `shape`, if present.
    shape: Option<PartShape>,
    /// The declared `canonical_lang`, if present.
    canonical_lang: Option<Lang>,
}

/// Build one `Part` from its `parts/{role}/` directory.
fn build_part(kind: ContentKind, item_slug: &str, part_dir: &Path) -> Result<Part, ScanError> {
    let role_name = dir_name(part_dir);
    let role = PartRole::new(role_name.clone());

    // Read `meta.toml` for the Part's identity and shape, if present.
    let meta_path = part_dir.join("meta.toml");
    let meta = read_part_meta(&meta_path)?;
    let PartMetaDecl {
        part_id,
        shape: declared_shape,
        canonical_lang: declared_canonical,
    } = meta;

    // The shape decides the language-file extension. If `meta.toml` did not
    // declare one, infer it from which extension the directory actually has.
    let shape = declared_shape.unwrap_or_else(|| infer_shape(part_dir));
    let extension = shape.file_extension();

    let mut files = Vec::new();
    for entry in sorted_files(part_dir)? {
        let name = dir_name(&entry);
        let Some(stem) = name.strip_suffix(&format!(".{extension}")) else {
            continue;
        };
        if stem == "meta" {
            continue;
        }
        let lang = Lang::new(stem).map_err(|e| ScanError::InvalidSlug {
            kind: kind.dir_name().to_owned(),
            name: format!("{item_slug}/parts/{role_name}/{name}"),
            detail: e.to_string(),
        })?;
        let body = read_file(&entry)?;
        let hash = ContentHash::of(body.as_bytes());
        files.push(File::new(lang, body, hash));
    }

    // The canonical language: `meta.toml`'s declaration, else the first file.
    let canonical_lang = declared_canonical
        .or_else(|| files.first().map(|f| f.lang().clone()))
        .unwrap_or_else(|| Lang::new("en").unwrap_or_else(|_| unreachable!("`en` is a valid tag")));

    let id = part_id.unwrap_or_else(PartId::generate);
    Ok(Part::new(id, role, shape, canonical_lang, files))
}

/// Parse a Part `meta.toml` into a [`PartMetaDecl`]. An absent file yields a
/// default (all-`None`) declaration.
fn read_part_meta(meta_path: &Path) -> Result<PartMetaDecl, ScanError> {
    if !meta_path.is_file() {
        return Ok(PartMetaDecl::default());
    }
    let text = read_file(meta_path)?;
    let value: toml::Value = text.parse().map_err(|e: toml::de::Error| ScanError::Io {
        path: meta_path.display().to_string(),
        detail: e.to_string(),
    })?;

    let part_id = value
        .get("part_id")
        .and_then(toml::Value::as_str)
        .and_then(|s| PartId::parse(s).ok());

    let shape = value
        .get("shape")
        .and_then(toml::Value::as_str)
        .and_then(|s| match s {
            "prose" => Some(PartShape::Prose),
            "entry_list" => Some(PartShape::EntryList),
            "key_value_list" => Some(PartShape::KeyValueList),
            _ => None,
        });

    let canonical_lang = value
        .get("canonical_lang")
        .and_then(toml::Value::as_str)
        .and_then(|s| Lang::new(s).ok());

    Ok(PartMetaDecl {
        part_id,
        shape,
        canonical_lang,
    })
}

/// Infer a Part's shape from the file extensions present in its directory:
/// a `.toml` language file (other than `meta.toml`) means a structured Part,
/// otherwise prose.
fn infer_shape(part_dir: &Path) -> PartShape {
    if let Ok(entries) = std::fs::read_dir(part_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            if name != "meta.toml" && name.ends_with(".toml") {
                return PartShape::EntryList;
            }
        }
    }
    PartShape::Prose
}

/// The immediate subdirectories of `dir`, sorted by name for determinism.
fn sorted_subdirs(dir: &Path) -> Result<Vec<PathBuf>, ScanError> {
    let mut dirs: Vec<PathBuf> = read_dir_entries(dir)?
        .into_iter()
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    Ok(dirs)
}

/// The immediate files of `dir`, sorted by name for determinism.
fn sorted_files(dir: &Path) -> Result<Vec<PathBuf>, ScanError> {
    let mut files: Vec<PathBuf> = read_dir_entries(dir)?
        .into_iter()
        .filter(|p| p.is_file())
        .collect();
    files.sort();
    Ok(files)
}

/// Read the entries of a directory, mapping IO failure to [`ScanError::Io`].
fn read_dir_entries(dir: &Path) -> Result<Vec<PathBuf>, ScanError> {
    let read = std::fs::read_dir(dir).map_err(|e| ScanError::Io {
        path: dir.display().to_string(),
        detail: e.to_string(),
    })?;
    let mut out = Vec::new();
    for entry in read {
        let entry = entry.map_err(|e| ScanError::Io {
            path: dir.display().to_string(),
            detail: e.to_string(),
        })?;
        out.push(entry.path());
    }
    Ok(out)
}

/// Read a file to a string, mapping IO failure to [`ScanError::Io`].
fn read_file(path: &Path) -> Result<String, ScanError> {
    std::fs::read_to_string(path).map_err(|e| ScanError::Io {
        path: path.display().to_string(),
        detail: e.to_string(),
    })
}

/// The last path component of `path` as an owned string.
fn dir_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// The modification time of `path`, falling back to the Unix epoch when the
/// filesystem does not report one — the scan must not fail over a missing
/// mtime.
fn scan_timestamp(path: &Path) -> OffsetDateTime {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(OffsetDateTime::from)
        .unwrap_or(OffsetDateTime::UNIX_EPOCH)
}
