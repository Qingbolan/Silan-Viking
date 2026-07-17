//! Canonical media import and URI resolution use cases.

use crate::{WorkspaceContent, WorkspaceContentError};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

const URI_PREFIX: &str = "silan://resources/";
const MEDIA_ROUTE_PREFIX: &str = "/api/v1/media?f=";
const EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico"];

#[derive(Debug, Error)]
pub enum MediaLibraryError {
    #[error(transparent)]
    Workspace(#[from] WorkspaceContentError),
    #[error("media I/O failed for `{path}`: {detail}")]
    Io { path: String, detail: String },
    #[error("document `{0}` has no source directory")]
    DocumentNotFound(String),
    #[error("unsupported media extension `{0}`")]
    UnsupportedExtension(String),
    #[error("invalid media URI `{0}`")]
    InvalidUri(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MediaAssetRef {
    pub uri: String,
    pub relative_path: String,
    pub file_name: String,
    pub byte_count: u64,
    pub markdown: String,
    pub reference_status: MediaReferenceStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaReferenceStatus {
    Available,
    Missing,
}

pub struct MediaLibrary {
    content_root: PathBuf,
    resources_root: PathBuf,
}

impl MediaLibrary {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, MediaLibraryError> {
        let content_root = content_root.as_ref().to_path_buf();
        // Opening the source use case validates SCHEMA and the workspace root.
        WorkspaceContent::open(&content_root)?;
        let resources_root = content_root.join("resources");
        Ok(Self {
            content_root,
            resources_root,
        })
    }

    pub fn import_asset(
        &self,
        document_id: &str,
        source_path: impl AsRef<Path>,
    ) -> Result<MediaAssetRef, MediaLibraryError> {
        let source = canonical_file(source_path.as_ref())?;
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .ok_or_else(|| MediaLibraryError::UnsupportedExtension(String::new()))?;
        if !EXTENSIONS.contains(&extension.as_str()) {
            return Err(MediaLibraryError::UnsupportedExtension(extension));
        }
        let item_dir = self.find_item_dir(document_id)?;
        let assets = item_dir.join("assets");
        fs::create_dir_all(&assets).map_err(|error| io_error(&assets, error))?;
        let stem = sanitize_stem(
            source
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("asset"),
        );
        let target = allocate_target(&assets, &stem, &extension, &source)?;
        let same_file = target
            .canonicalize()
            .ok()
            .is_some_and(|path| path == source);
        if !same_file {
            fs::copy(&source, &target).map_err(|error| io_error(&target, error))?;
        }
        self.asset_ref(&target)
    }

    pub fn resolve_uri(&self, uri: &str) -> Result<MediaAssetRef, MediaLibraryError> {
        let tail = valid_uri_tail(uri)?;
        match self.resolve_existing_path(tail) {
            Ok(path) => self.asset_ref(&path),
            _ => Ok(missing_ref(uri, tail)),
        }
    }

    /// Resolve an existing canonical asset path for protocol adapters.
    pub fn resolve_local_path(&self, uri: &str) -> Result<PathBuf, MediaLibraryError> {
        let tail = valid_uri_tail(uri)?;
        self.resolve_existing_path(tail)
    }

    /// Resolve any source-supported local media reference without exposing
    /// workspace path rules to a UI adapter.
    pub fn resolve_local_reference(&self, reference: &str) -> Result<PathBuf, MediaLibraryError> {
        let reference = reference.trim();
        if reference.starts_with(URI_PREFIX) {
            return self.resolve_local_path(reference);
        }
        if let Some(tail) = reference.strip_prefix(MEDIA_ROUTE_PREFIX) {
            return self.resolve_existing_path(tail);
        }
        let root = canonical_dir(&self.content_root)?;
        let candidate = self.content_root.join(reference);
        let path = candidate
            .canonicalize()
            .map_err(|error| io_error(&candidate, error))?;
        if path.starts_with(root) && path.is_file() {
            Ok(path)
        } else {
            Err(MediaLibraryError::InvalidUri(reference.to_owned()))
        }
    }

    pub fn list_assets(&self, document_id: &str) -> Result<Vec<MediaAssetRef>, MediaLibraryError> {
        let assets = self.find_item_dir(document_id)?.join("assets");
        if !assets.is_dir() {
            return Ok(Vec::new());
        }
        let mut refs = fs::read_dir(&assets)
            .map_err(|error| io_error(&assets, error))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_file())
            .map(|path| self.asset_ref(&path))
            .collect::<Result<Vec<_>, _>>()?;
        refs.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
        Ok(refs)
    }

    fn find_item_dir(&self, document_id: &str) -> Result<PathBuf, MediaLibraryError> {
        let workspace = WorkspaceContent::open(&self.content_root)?;
        workspace.editable_document(document_id)?;
        find_manifest_dir(&self.resources_root, document_id)?
            .ok_or_else(|| MediaLibraryError::DocumentNotFound(document_id.to_owned()))
    }

    fn asset_ref(&self, path: &Path) -> Result<MediaAssetRef, MediaLibraryError> {
        let root = canonical_dir(&self.resources_root)?;
        let path = path.canonicalize().map_err(|error| io_error(path, error))?;
        if !path.starts_with(&root) {
            return Err(MediaLibraryError::InvalidUri(path.display().to_string()));
        }
        let relative_path = path
            .strip_prefix(&root)
            .map_err(|_| MediaLibraryError::InvalidUri(path.display().to_string()))?
            .to_string_lossy()
            .replace('\\', "/");
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("asset")
            .to_owned();
        let uri = format!("{URI_PREFIX}{relative_path}");
        Ok(MediaAssetRef {
            markdown: format!("![{}]({uri})", alt_text(&file_name)),
            uri,
            relative_path,
            file_name,
            byte_count: path
                .metadata()
                .map_err(|error| io_error(&path, error))?
                .len(),
            reference_status: MediaReferenceStatus::Available,
        })
    }

    fn resolve_existing_path(&self, tail: &str) -> Result<PathBuf, MediaLibraryError> {
        let root = canonical_dir(&self.resources_root)?;
        let candidate = self.resources_root.join(tail);
        let path = candidate
            .canonicalize()
            .map_err(|error| io_error(&candidate, error))?;
        if path.starts_with(root) && path.is_file() {
            Ok(path)
        } else {
            Err(MediaLibraryError::InvalidUri(format!("{URI_PREFIX}{tail}")))
        }
    }
}

fn valid_uri_tail(uri: &str) -> Result<&str, MediaLibraryError> {
    let tail = uri
        .strip_prefix(URI_PREFIX)
        .ok_or_else(|| MediaLibraryError::InvalidUri(uri.to_owned()))?;
    let segments = tail.split('/').collect::<Vec<_>>();
    let safe = !segments
        .iter()
        .any(|segment| segment.is_empty() || *segment == "." || *segment == "..");
    let is_asset = segments.iter().any(|segment| *segment == "assets");
    let supported = Path::new(tail)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str()));
    if safe && is_asset && supported {
        Ok(tail)
    } else {
        Err(MediaLibraryError::InvalidUri(uri.to_owned()))
    }
}

fn find_manifest_dir(dir: &Path, item_id: &str) -> Result<Option<PathBuf>, MediaLibraryError> {
    for entry in fs::read_dir(dir).map_err(|error| io_error(dir, error))? {
        let path = entry.map_err(|error| io_error(dir, error))?.path();
        if !path.is_dir() {
            continue;
        }
        let manifest = path.join("item.toml");
        if manifest.is_file() {
            let text = fs::read_to_string(&manifest).map_err(|error| io_error(&manifest, error))?;
            let value: toml::Value =
                toml::from_str(&text).map_err(|error| MediaLibraryError::Io {
                    path: manifest.display().to_string(),
                    detail: error.to_string(),
                })?;
            if value.get("item_id").and_then(toml::Value::as_str) == Some(item_id) {
                return Ok(Some(path));
            }
        }
        if let Some(found) = find_manifest_dir(&path, item_id)? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}

fn canonical_file(path: &Path) -> Result<PathBuf, MediaLibraryError> {
    let canonical = path.canonicalize().map_err(|error| io_error(path, error))?;
    if canonical.is_file() {
        Ok(canonical)
    } else {
        Err(MediaLibraryError::Io {
            path: path.display().to_string(),
            detail: "not a file".to_owned(),
        })
    }
}
fn canonical_dir(path: &Path) -> Result<PathBuf, MediaLibraryError> {
    path.canonicalize().map_err(|error| io_error(path, error))
}
fn io_error(path: &Path, error: impl std::fmt::Display) -> MediaLibraryError {
    MediaLibraryError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    }
}
fn sanitize_stem(raw: &str) -> String {
    let value = raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_') {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let value = value
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if value.is_empty() {
        "asset".to_owned()
    } else {
        value
    }
}
fn allocate_target(
    dir: &Path,
    stem: &str,
    extension: &str,
    source: &Path,
) -> Result<PathBuf, MediaLibraryError> {
    for index in 0..1000 {
        let name = if index == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{index}.{extension}")
        };
        let target = dir.join(name);
        if !target.exists()
            || target
                .canonicalize()
                .ok()
                .is_some_and(|path| path == source)
        {
            return Ok(target);
        }
    }
    Err(MediaLibraryError::Io {
        path: dir.display().to_string(),
        detail: "could not allocate a unique asset name".to_owned(),
    })
}
fn alt_text(file_name: &str) -> String {
    file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name)
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}
fn missing_ref(uri: &str, tail: &str) -> MediaAssetRef {
    let file_name = Path::new(tail)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("asset")
        .to_owned();
    MediaAssetRef {
        uri: uri.to_owned(),
        relative_path: tail.to_owned(),
        markdown: format!("![{}]({uri})", alt_text(&file_name)),
        file_name,
        byte_count: 0,
        reference_status: MediaReferenceStatus::Missing,
    }
}
