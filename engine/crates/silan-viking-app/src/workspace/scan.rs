//! `scan` — walk `content/resources/` into `Item`s.
//!
//! Per `docs/silan-viking/01` §1.5.0, the scan is where a `ContentKind` is
//! decided — from the `content/resources/{type}/` directory name, never
//! guessed by a parser. The on-disk layout (`10` §10.4, `06` §6.2):
//!
//! ```text
//!   content/resources/{type}/{item}/{item.toml, parts/{role}/{meta.toml, <lang>.<ext>}}
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

    /// An episode series' `series.toml` was not valid TOML.
    #[error("malformed `series.toml` for episode series `{slug}`: {detail}")]
    MalformedSeries { slug: String, detail: String },

    /// Every Item owns a persisted identity; sync never mints one.
    #[error("missing `item.toml` for `{location}` — create it with `item_id = \"i_<ulid>\"`")]
    MissingItemMeta { location: String },

    /// `item.toml` exists but cannot supply a valid ItemId.
    #[error("malformed `item.toml` for `{location}`: {detail}")]
    MalformedItemMeta { location: String, detail: String },
}

/// A container series discovered on disk — the `series.toml` of one
/// `content/resources/episode/<series>/` directory (`10` §10.4.4).
///
/// The scan surfaces this so the sync can write the `episode_series` parent
/// row that every `episodes.series_id` foreign key points at. Without it, the
/// `episodes` rows reference a series that does not exist and `promote` fails
/// the `episodes_episode_series_episodes` FK at COMMIT.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedSeries {
    /// The series slug — the `episode_series.id` value `episodes.series_id`
    /// references. Taken from the directory name (the structural identity),
    /// not the `series.toml` `slug` field, so the FK target is always the
    /// same string the episode scan derives.
    pub slug: String,
    /// The series title, from `series.toml` (`""` if the file omits it).
    pub title: String,
    /// The series description, from `series.toml` (`""` if absent).
    pub description: String,
    /// The series cover image URL/reference, from `series.toml` (`""` if absent).
    pub cover_url: String,
    /// The series status, from `series.toml` (defaults to `"ongoing"`).
    pub status: String,
}

/// A binary resource file discovered inside an Item's `assets/` directory.
///
/// Content authors reference these by a `silan://resources/<type>/<slug>/
/// assets/<file>` URI in a frontmatter field or a prose `![](…)`; `sync`
/// rewrites that URI to the `/api/v1/media/…` path the Go backend serves, and
/// `deploy` copies the file itself into the backend's media volume. The scan
/// only records the file's location and digest — it never reads the bytes
/// into memory (an image can be large; deploy streams it file-to-file).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedAsset {
    /// The path *relative to* `content/resources/`, e.g.
    /// `blog/my-post/assets/figure.png`. This is both the tail of the
    /// `silan://` URI and the path under the backend's media root, so the
    /// reference and the file always agree.
    pub rel_path: String,
    /// The absolute on-disk path — what `deploy` copies from.
    pub abs_path: PathBuf,
    /// The file's content digest — lets an incremental deploy skip an
    /// unchanged asset.
    pub hash: ContentHash,
}

/// The result of a scan: the Items found, the episode container series, and
/// the binary resource files, in deterministic order.
#[derive(Debug, Default)]
pub struct ScanReport {
    items: Vec<Item>,
    series: Vec<ScannedSeries>,
    assets: Vec<ScannedAsset>,
}

impl ScanReport {
    /// The scanned Items.
    pub fn items(&self) -> &[Item] {
        &self.items
    }

    /// The episode container series found, one per `series.toml`.
    pub fn series(&self) -> &[ScannedSeries] {
        &self.series
    }

    /// The binary resource files found under every Item's `assets/`.
    pub fn assets(&self) -> &[ScannedAsset] {
        &self.assets
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

/// File extensions the scan treats as binary resources (lower-cased, no dot).
/// A deliberately closed list — an unrecognised extension under `assets/` is
/// ignored rather than shipped, so a stray file cannot bloat the deploy.
const ASSET_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico"];

/// Scan `content_root/resources/` and build every `Item`.
pub fn scan_resources(content_root: &Path) -> Result<ScanReport, ScanError> {
    let resources = content_root.join("resources");
    let mut items = Vec::new();
    let mut series = Vec::new();
    let mut assets = Vec::new();

    // `ContentKind::ALL` gives a deterministic type order.
    for kind in ContentKind::ALL {
        let type_dir = resources.join(kind.dir_name());
        if !type_dir.is_dir() {
            continue;
        }
        match kind {
            // `episode` items live one level deeper, under a series directory.
            ContentKind::Episode => {
                scan_episode_type(&type_dir, &resources, &mut items, &mut series, &mut assets)?
            }
            // `resume` is a single Item: `content/resources/resume/` IS the
            // Item directory — its `parts/` are directly inside it, there is
            // no `{item}` subdirectory level (`10` §10.4.5).
            ContentKind::Resume => {
                items.push(build_item(ContentKind::Resume, "resume", &type_dir)?);
                collect_assets(&type_dir, &resources, &mut assets)?;
            }
            // Every other type has one subdirectory per Item.
            _ => scan_flat_type(kind, &type_dir, &resources, &mut items, &mut assets)?,
        }
    }

    // Deterministic order so an incremental deploy's diff is stable.
    assets.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(ScanReport {
        items,
        series,
        assets,
    })
}

/// Scan a flat content type (`blog` / `ideas` / `projects` / `update` /
/// `resume`): each immediate subdirectory is one Item.
fn scan_flat_type(
    kind: ContentKind,
    type_dir: &Path,
    resources_root: &Path,
    out: &mut Vec<Item>,
    assets_out: &mut Vec<ScannedAsset>,
) -> Result<(), ScanError> {
    for item_dir in sorted_subdirs(type_dir)? {
        let slug_name = dir_name(&item_dir);
        out.push(build_item(kind, &slug_name, &item_dir)?);
        collect_assets(&item_dir, resources_root, assets_out)?;
    }
    Ok(())
}

/// Scan the `episode` type: each subdirectory is a *series*, and each
/// subdirectory of a series is one episode Item.
///
/// The series directory's `series.toml` (`10` §10.4.4) is read into a
/// [`ScannedSeries`] — the sync needs it to write the `episode_series` parent
/// row that every `episodes.series_id` foreign key references.
fn scan_episode_type(
    type_dir: &Path,
    resources_root: &Path,
    out: &mut Vec<Item>,
    series_out: &mut Vec<ScannedSeries>,
    assets_out: &mut Vec<ScannedAsset>,
) -> Result<(), ScanError> {
    for series_dir in sorted_subdirs(type_dir)? {
        series_out.push(read_series(&series_dir)?);
        collect_assets(&series_dir, resources_root, assets_out)?;
        // `sorted_subdirs` returns directories only, so the series' own
        // `series.toml` file is naturally excluded — each remaining entry is
        // one episode Item directory.
        for episode_dir in sorted_subdirs(&series_dir)? {
            if dir_name(&episode_dir) == "assets" {
                continue;
            }
            let slug_name = dir_name(&episode_dir);
            out.push(build_item(ContentKind::Episode, &slug_name, &episode_dir)?);
            collect_assets(&episode_dir, resources_root, assets_out)?;
        }
    }
    Ok(())
}

/// Collect the binary resources under an Item directory's `assets/` folder.
///
/// `item_dir` is one Item's directory (e.g. `…/resources/blog/my-post`);
/// `resources_root` is `content/resources` — the prefix stripped to form the
/// `rel_path` an asset is addressed by. An Item with no `assets/` folder
/// contributes nothing. The walk recurses, so `assets/diagrams/a.svg` is
/// found, but only [`ASSET_EXTENSIONS`] files are recorded.
fn collect_assets(
    item_dir: &Path,
    resources_root: &Path,
    out: &mut Vec<ScannedAsset>,
) -> Result<(), ScanError> {
    let assets_dir = item_dir.join("assets");
    if !assets_dir.is_dir() {
        return Ok(());
    }
    collect_assets_recursive(&assets_dir, resources_root, out)
}

/// Recurse a directory, recording every [`ASSET_EXTENSIONS`] file in `out`.
fn collect_assets_recursive(
    dir: &Path,
    resources_root: &Path,
    out: &mut Vec<ScannedAsset>,
) -> Result<(), ScanError> {
    for entry in read_dir_entries(dir)? {
        if entry.is_dir() {
            collect_assets_recursive(&entry, resources_root, out)?;
            continue;
        }
        let is_asset = entry
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| ASSET_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
            .unwrap_or(false);
        if !is_asset {
            continue; // a non-image file under `assets/` — not shipped
        }
        // The `rel_path` is the file's path below `content/resources/`. A
        // file outside that root (impossible for a real scan, but defended)
        // is skipped rather than recorded with a misleading path.
        let Ok(rel) = entry.strip_prefix(resources_root) else {
            continue;
        };
        let rel_path = rel.to_string_lossy().replace('\\', "/");
        let bytes = std::fs::read(&entry).map_err(|e| ScanError::Io {
            path: entry.display().to_string(),
            detail: e.to_string(),
        })?;
        out.push(ScannedAsset {
            rel_path,
            abs_path: entry.clone(),
            hash: ContentHash::of(&bytes),
        });
    }
    Ok(())
}

/// Read a series directory's `series.toml` into a [`ScannedSeries`].
///
/// The series `slug` is always the directory name — the structural identity
/// the episode scan also derives `series_id` from — so the FK target matches
/// regardless of what the `series.toml` `slug` field says. A missing
/// `series.toml`, or a missing field within it, is tolerated: `title` /
/// `description` fall back to empty and `status` to `"ongoing"`, so an author
/// who only made the directory still gets a valid `episode_series` row.
fn read_series(series_dir: &Path) -> Result<ScannedSeries, ScanError> {
    let slug = dir_name(series_dir);
    let toml_path = series_dir.join("series.toml");
    let doc: toml::Value = if toml_path.is_file() {
        read_file(&toml_path)?
            .parse()
            .map_err(|e: toml::de::Error| ScanError::MalformedSeries {
                slug: slug.clone(),
                detail: e.to_string(),
            })?
    } else {
        toml::Value::Table(Default::default())
    };
    let field = |key: &str| {
        doc.get(key)
            .and_then(toml::Value::as_str)
            .unwrap_or_default()
            .to_owned()
    };
    let status = doc
        .get("status")
        .and_then(toml::Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or("ongoing")
        .to_owned();
    Ok(ScannedSeries {
        slug,
        title: field("title"),
        description: field("description"),
        cover_url: field("cover_url"),
        status,
    })
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

    // Identity participates in the digest: migrating or deliberately
    // repairing an item_id must force a projection rewrite even when the
    // prose itself did not change.
    let item_id = read_item_id(item_dir, kind, slug_name)?;
    let mut digest_source = item_id.as_str().to_owned();
    for part in &parts {
        for file in part.files() {
            digest_source.push_str(file.hash().as_str());
        }
    }
    let meta = Meta::new(
        ContentHash::of(digest_source.as_bytes()),
        scan_timestamp(item_dir),
    );
    Ok(Item::new(item_id, kind, slug, uri, meta, parts))
}

/// Read the Item's stable identity from its root `item.toml`.
///
/// Identity is source data, exactly like each Part's `part_id`. Generating a
/// new ULID during every scan disconnects runtime comments/views from their
/// content after a rebuild, so missing or invalid metadata is a hard error.
fn read_item_id(item_dir: &Path, kind: ContentKind, slug: &str) -> Result<ItemId, ScanError> {
    let location = format!("{}/{slug}", kind.dir_name());
    let path = item_dir.join("item.toml");
    if !path.is_file() {
        return Err(ScanError::MissingItemMeta { location });
    }
    let doc: toml::Value = read_file(&path)?
        .parse()
        .map_err(|error: toml::de::Error| ScanError::MalformedItemMeta {
            location: location.clone(),
            detail: error.to_string(),
        })?;
    let raw = doc
        .get("item_id")
        .and_then(toml::Value::as_str)
        .ok_or_else(|| ScanError::MalformedItemMeta {
            location: location.clone(),
            detail: "missing string field `item_id`".to_owned(),
        })?;
    ItemId::parse(raw).map_err(|error| ScanError::MalformedItemMeta {
        location,
        detail: error.to_string(),
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh temp directory unique to this test process.
    fn tmp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("silan-scan-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");
        dir
    }

    #[test]
    fn read_series_takes_fields_from_series_toml() {
        let dir = tmp_dir("with-toml").join("building-easynet");
        std::fs::create_dir_all(&dir).expect("mkdir");
        std::fs::write(
            dir.join("series.toml"),
            "title = \"Building EasyNet\"\ndescription = \"A journal.\"\ncover_url = \"silan://resources/episode/building-easynet/assets/cover.png\"\nstatus = \"completed\"\n",
        )
        .expect("write series.toml");

        let series = read_series(&dir).expect("read series");
        // `slug` is the directory name — the FK target — not a toml field.
        assert_eq!(series.slug, "building-easynet");
        assert_eq!(series.title, "Building EasyNet");
        assert_eq!(series.description, "A journal.");
        assert_eq!(
            series.cover_url,
            "silan://resources/episode/building-easynet/assets/cover.png"
        );
        assert_eq!(series.status, "completed");
        let _ = std::fs::remove_dir_all(dir.parent().expect("parent"));
    }

    #[test]
    fn read_series_tolerates_a_missing_series_toml() {
        // An author who only made the directory still gets a valid
        // `episode_series` row: empty text fields, `status` defaulting to
        // `ongoing` so the column's NOT NULL constraint is satisfied.
        let dir = tmp_dir("no-toml").join("orphan-series");
        std::fs::create_dir_all(&dir).expect("mkdir");

        let series = read_series(&dir).expect("read series");
        assert_eq!(series.slug, "orphan-series");
        assert_eq!(series.title, "");
        assert_eq!(series.description, "");
        assert_eq!(series.cover_url, "");
        assert_eq!(series.status, "ongoing");
        let _ = std::fs::remove_dir_all(dir.parent().expect("parent"));
    }

    #[test]
    fn read_series_rejects_malformed_toml() {
        let dir = tmp_dir("bad-toml").join("broken-series");
        std::fs::create_dir_all(&dir).expect("mkdir");
        std::fs::write(dir.join("series.toml"), "title = \n").expect("write");

        let err = read_series(&dir).expect_err("malformed toml is an error");
        assert!(matches!(err, ScanError::MalformedSeries { .. }));
        let _ = std::fs::remove_dir_all(dir.parent().expect("parent"));
    }

    #[test]
    fn collect_assets_finds_images_recursively_and_skips_non_images() {
        // Layout: resources/blog/my-post/assets/{cover.png, diagrams/flow.svg,
        // notes.txt}. Only the two images are recorded; `notes.txt` is not.
        let root = tmp_dir("assets");
        let assets = root.join("blog/my-post/assets");
        std::fs::create_dir_all(assets.join("diagrams")).expect("mkdir");
        std::fs::write(assets.join("cover.png"), b"\x89PNG fake").expect("write png");
        std::fs::write(assets.join("diagrams/flow.svg"), b"<svg/>").expect("write svg");
        std::fs::write(assets.join("notes.txt"), b"not an image").expect("write txt");

        let mut out = Vec::new();
        collect_assets(&root.join("blog/my-post"), &root, &mut out).expect("collect");
        out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));

        let paths: Vec<&str> = out.iter().map(|a| a.rel_path.as_str()).collect();
        assert_eq!(
            paths,
            [
                "blog/my-post/assets/cover.png",
                "blog/my-post/assets/diagrams/flow.svg"
            ],
            "only the two images, addressed by their path below resources/"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn collect_assets_tolerates_an_item_with_no_assets_dir() {
        let root = tmp_dir("no-assets");
        std::fs::create_dir_all(root.join("blog/bare-post")).expect("mkdir");
        let mut out = Vec::new();
        collect_assets(&root.join("blog/bare-post"), &root, &mut out).expect("collect");
        assert!(out.is_empty());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn item_identity_is_persisted_and_stable_across_scans() {
        let root = tmp_dir("stable-item-id");
        let item = root.join("blog/stable-post");
        std::fs::create_dir_all(&item).expect("mkdir");
        std::fs::write(
            item.join("item.toml"),
            "item_id = \"i_01ARZ3NDEKTSV4RRFFQ69G5FAV\"\n",
        )
        .expect("write item metadata");

        let first = read_item_id(&item, ContentKind::Blog, "stable-post").expect("first read");
        let second = read_item_id(&item, ContentKind::Blog, "stable-post").expect("second read");
        assert_eq!(first, second);
        assert_eq!(first.as_str(), "i_01ARZ3NDEKTSV4RRFFQ69G5FAV");
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn missing_item_identity_is_rejected_instead_of_regenerated() {
        let root = tmp_dir("missing-item-id");
        let err = read_item_id(&root, ContentKind::Blog, "unstable")
            .expect_err("missing item.toml must fail");
        assert!(matches!(err, ScanError::MissingItemMeta { .. }));
        let _ = std::fs::remove_dir_all(&root);
    }
}
