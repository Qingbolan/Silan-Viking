//! Article image attribution shared by the SDK, CLI, and desktop editor.
//!
//! The source Blog owns project identity and watermark policy. This module
//! resolves that policy into a deterministic preview plan, then applies two
//! independent representations:
//!
//! - a visible, compact signature that survives screenshots and image search;
//! - embedded machine-readable metadata that survives direct asset download.
//!
//! Website JSON-LD remains a separate presentation concern. Embedded metadata
//! is useful provenance, but callers must not treat it as a substitute for
//! HTML semantics because crawlers are not required to inspect image chunks.
//! A private state sidecar retains the clean bottom strip so repeated applies
//! replace or remove the signature instead of painting over an earlier render.

use crate::{
    EditableDocument, MediaLibrary, MediaLibraryError, SilanUri, WorkspaceContent,
    WorkspaceContentError,
};
use crc32fast::Hasher as Crc32;
use font8x8::{UnicodeFonts, BASIC_FONTS};
use image::{DynamicImage, ImageFormat, ImageReader, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use silan_viking_base::Namespace;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use tempfile::NamedTempFile;
use thiserror::Error;

const ATTRIBUTION_KEYWORD: &str = "silan.attribution";
const JPEG_ATTRIBUTION_PREFIX: &[u8] = b"SILAN_ATTRIBUTION\0";
const XMP_PREFIX: &[u8] = b"http://ns.adobe.com/xap/1.0/\0";
const ATTRIBUTION_SOFTWARE: &str = "Silan Viking";
const ATTRIBUTION_STATE_DIRECTORY: &str = ".silan-attribution";
const ATTRIBUTION_STATE_MAGIC: &[u8] = b"SILAN_IMAGE_ATTRIBUTION_STATE_V1\0";
const ATTRIBUTION_BASE_STRIP_HEIGHT: u32 = 96;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImageWatermarkMode {
    Off,
    Metadata,
    Visible,
    Both,
}

impl ImageWatermarkMode {
    pub fn parse(value: &str) -> Result<Self, ImageAttributionError> {
        match value.trim() {
            "" | "off" => Ok(Self::Off),
            "metadata" | "invisible" => Ok(Self::Metadata),
            "visible" => Ok(Self::Visible),
            "both" => Ok(Self::Both),
            other => Err(ImageAttributionError::InvalidPolicy(format!(
                "unsupported watermark mode `{other}`"
            ))),
        }
    }

    fn includes_visible(self) -> bool {
        matches!(self, Self::Visible | Self::Both)
    }

    fn includes_metadata(self) -> bool {
        matches!(self, Self::Metadata | Self::Both)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ImageWatermarkPosition {
    BottomLeft,
    BottomRight,
}

impl ImageWatermarkPosition {
    pub fn parse(value: &str) -> Result<Self, ImageAttributionError> {
        match value.trim() {
            "" | "bottom-right" => Ok(Self::BottomRight),
            "bottom-left" => Ok(Self::BottomLeft),
            other => Err(ImageAttributionError::InvalidPolicy(format!(
                "unsupported watermark position `{other}`"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ArticleImageAssetPlan {
    pub uri: String,
    pub local_path: String,
    pub file_name: String,
    pub supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ArticleImageAttributionPlan {
    pub target_uri: String,
    pub project_name: String,
    pub publication_venue: String,
    pub author: String,
    pub site_url: String,
    pub article_url: String,
    pub project_url: String,
    pub mode: ImageWatermarkMode,
    pub position: ImageWatermarkPosition,
    pub visible_lines: Vec<String>,
    pub assets: Vec<ArticleImageAssetPlan>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ImageAttributionApplyState {
    Applied,
    Unchanged,
    SkippedUnsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ImageAttributionAssetResult {
    pub uri: String,
    pub local_path: String,
    pub state: ImageAttributionApplyState,
    pub byte_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ArticleImageAttributionResult {
    pub plan: ArticleImageAttributionPlan,
    pub assets: Vec<ImageAttributionAssetResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbeddedImageAttribution {
    pub schema: String,
    pub fingerprint: String,
    pub title: String,
    pub publication_venue: String,
    pub author: String,
    pub site_url: String,
    pub article_url: String,
    pub project_url: String,
    pub asset_uri: String,
    pub software: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct AssetAttributionStateHeader {
    schema: String,
    width: u32,
    height: u32,
    strip_height: u32,
    rendered_sha256: String,
    rendered_mode: ImageWatermarkMode,
}

struct AssetAttributionState {
    header: AssetAttributionStateHeader,
    clean_strip: RgbaImage,
}

#[derive(Debug, Error)]
pub enum ImageAttributionError {
    #[error("invalid image attribution target: {0}")]
    InvalidTarget(String),
    #[error("invalid image attribution policy: {0}")]
    InvalidPolicy(String),
    #[error("article image attribution target `{0}` was not found")]
    TargetNotFound(String),
    #[error("image attribution requires `image_author` and `image_site_url`")]
    MissingIdentity,
    #[error("image attribution I/O failed for `{path}`: {detail}")]
    Io { path: String, detail: String },
    #[error("cannot decode image `{path}`: {detail}")]
    Decode { path: String, detail: String },
    #[error("unsupported image format for `{0}`")]
    UnsupportedFormat(String),
    #[error("embedded image metadata is malformed: {0}")]
    MalformedMetadata(String),
    #[error("image attribution state is malformed for `{path}`: {detail}")]
    MalformedState { path: String, detail: String },
    #[error(transparent)]
    Content(#[from] WorkspaceContentError),
    #[error(transparent)]
    Media(#[from] MediaLibraryError),
}

pub struct ArticleImageAttributionWorkspace {
    content: WorkspaceContent,
    media: MediaLibrary,
}

impl ArticleImageAttributionWorkspace {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, ImageAttributionError> {
        let workspace =
            crate::Workspace::open(content_root).map_err(WorkspaceContentError::from)?;
        Ok(Self::from_workspace(std::sync::Arc::new(workspace)))
    }

    pub(crate) fn from_workspace(workspace: std::sync::Arc<crate::Workspace>) -> Self {
        Self {
            media: MediaLibrary::from_workspace(&workspace),
            content: WorkspaceContent::from_workspace(workspace),
        }
    }

    /// Resolve the persisted Blog policy without touching image bytes.
    pub fn plan(
        &self,
        target_uri: &str,
        mode_override: Option<ImageWatermarkMode>,
        position_override: Option<ImageWatermarkPosition>,
    ) -> Result<ArticleImageAttributionPlan, ImageAttributionError> {
        let document = self.resolve_blog(target_uri)?;
        let attribution = document.article_attribution.clone().unwrap_or_default();
        let mode = mode_override.unwrap_or(ImageWatermarkMode::parse(
            &attribution.image_watermark_mode,
        )?);
        let position = position_override.unwrap_or(ImageWatermarkPosition::parse(
            &attribution.image_watermark_position,
        )?);
        if mode != ImageWatermarkMode::Off
            && (attribution.image_author.trim().is_empty()
                || attribution.image_site_url.trim().is_empty())
        {
            return Err(ImageAttributionError::MissingIdentity);
        }

        let project_name = non_empty(&attribution.project_name, &document.title);
        let site_url = canonical_url(&attribution.image_site_url);
        let article_url = if site_url.is_empty() {
            String::new()
        } else {
            format!("{}/blog/{}/", site_url.trim_end_matches('/'), document.slug)
        };
        let project_url = canonical_url(&attribution.project_url);
        let visible_lines = visible_lines(
            &project_name,
            &attribution.publication_venue,
            &attribution.image_author,
            &site_url,
            &article_url,
            &project_url,
        );
        let assets = self
            .media
            .list_assets(&document.id)?
            .into_iter()
            .map(|asset| {
                let local = self.media.resolve_local_path(&asset.uri)?;
                Ok(ArticleImageAssetPlan {
                    supported: supported_image_format(&local).is_some(),
                    local_path: local.to_string_lossy().to_string(),
                    uri: asset.uri,
                    file_name: asset.file_name,
                })
            })
            .collect::<Result<Vec<_>, ImageAttributionError>>()?;

        Ok(ArticleImageAttributionPlan {
            target_uri: target_uri.to_owned(),
            project_name,
            publication_venue: attribution.publication_venue.trim().to_owned(),
            author: attribution.image_author.trim().to_owned(),
            site_url,
            article_url,
            project_url,
            mode,
            position,
            visible_lines,
            assets,
        })
    }

    /// Apply one persisted policy to every supported image owned by a Blog.
    ///
    /// Every output is prepared before the first source file is replaced.
    /// If a later atomic write fails, already-written files are restored from
    /// their in-memory originals so an article never ends in a mixed state.
    pub fn apply(
        &self,
        target_uri: &str,
        mode_override: Option<ImageWatermarkMode>,
        position_override: Option<ImageWatermarkPosition>,
    ) -> Result<ArticleImageAttributionResult, ImageAttributionError> {
        let plan = self.plan(target_uri, mode_override, position_override)?;

        struct PreparedAsset {
            uri: String,
            path: PathBuf,
            original: Vec<u8>,
            updated: Vec<u8>,
            state_path: Option<PathBuf>,
            original_state: Option<Vec<u8>>,
            updated_state: Option<Vec<u8>>,
            state: ImageAttributionApplyState,
        }

        let mut prepared = Vec::with_capacity(plan.assets.len());
        for asset in &plan.assets {
            let path = PathBuf::from(&asset.local_path);
            let original = read_bytes(&path)?;
            let Some(format) = supported_image_format(&path) else {
                prepared.push(PreparedAsset {
                    uri: asset.uri.clone(),
                    path,
                    original: original.clone(),
                    updated: original,
                    state_path: None,
                    original_state: None,
                    updated_state: None,
                    state: ImageAttributionApplyState::SkippedUnsupported,
                });
                continue;
            };

            let state_path = attribution_state_path(&path)?;
            let original_state = read_optional_bytes(&state_path)?;
            let stored_state = original_state
                .as_deref()
                .map(|bytes| decode_attribution_state(&state_path, bytes))
                .transpose()?;
            let (clean, clean_strip) =
                resolve_clean_source(&path, &original, format, stored_state.as_ref())?;
            let payload = embedded_payload(&plan, &asset.uri)?;
            let updated = apply_to_bytes(
                &path,
                &clean,
                format,
                &payload,
                plan.mode,
                plan.position,
                &plan.visible_lines,
            )?;
            let image = decode_rgba(&path, &clean)?;
            let updated_state = encode_attribution_state(
                &state_path,
                AssetAttributionStateHeader {
                    schema: "https://silan.tech/schemas/image-attribution-state/v1".to_owned(),
                    width: image.width(),
                    height: image.height(),
                    strip_height: clean_strip.height(),
                    rendered_sha256: sha256_hex(&updated),
                    rendered_mode: plan.mode,
                },
                &clean_strip,
            )?;
            let state = if updated == original {
                ImageAttributionApplyState::Unchanged
            } else {
                ImageAttributionApplyState::Applied
            };
            prepared.push(PreparedAsset {
                uri: asset.uri.clone(),
                path,
                original,
                updated,
                state_path: Some(state_path),
                original_state,
                updated_state: Some(updated_state),
                state,
            });
        }

        struct PreparedWrite {
            path: PathBuf,
            original: Option<Vec<u8>>,
            updated: Vec<u8>,
        }

        let mut writes = Vec::new();
        for asset in &prepared {
            if asset.updated != asset.original {
                writes.push(PreparedWrite {
                    path: asset.path.clone(),
                    original: Some(asset.original.clone()),
                    updated: asset.updated.clone(),
                });
            }
            if let (Some(path), Some(updated)) = (&asset.state_path, &asset.updated_state) {
                if asset.original_state.as_ref() != Some(updated) {
                    writes.push(PreparedWrite {
                        path: path.clone(),
                        original: asset.original_state.clone(),
                        updated: updated.clone(),
                    });
                }
            }
        }
        for write in &writes {
            ensure_parent_directory(&write.path)?;
        }

        let mut written = Vec::new();
        for (index, write) in writes.iter().enumerate() {
            if let Err(error) = atomic_write(&write.path, &write.updated) {
                for written_index in written.into_iter().rev() {
                    let written_write: &PreparedWrite = &writes[written_index];
                    restore_optional_file(&written_write.path, written_write.original.as_deref());
                }
                return Err(error);
            }
            written.push(index);
        }

        Ok(ArticleImageAttributionResult {
            assets: prepared
                .into_iter()
                .map(|asset| ImageAttributionAssetResult {
                    uri: asset.uri,
                    local_path: asset.path.to_string_lossy().to_string(),
                    state: asset.state,
                    byte_count: asset.updated.len() as u64,
                })
                .collect(),
            plan,
        })
    }

    pub fn inspect_asset(
        &self,
        asset_uri: &str,
    ) -> Result<Option<EmbeddedImageAttribution>, ImageAttributionError> {
        let path = self.media.resolve_local_path(asset_uri)?;
        inspect_image_attribution(&path)
    }

    fn resolve_blog(&self, target_uri: &str) -> Result<EditableDocument, ImageAttributionError> {
        let uri = SilanUri::from_str(target_uri)
            .map_err(|error| ImageAttributionError::InvalidTarget(error.to_string()))?;
        if uri.namespace() != Namespace::Resources {
            return Err(ImageAttributionError::InvalidTarget(
                "target must be under silan://resources".to_owned(),
            ));
        }
        let [kind, slug] = uri.segments() else {
            return Err(ImageAttributionError::InvalidTarget(
                "expected silan://resources/blog/<slug>".to_owned(),
            ));
        };
        if kind != "blog" {
            return Err(ImageAttributionError::InvalidTarget(
                "image attribution currently targets Blog items".to_owned(),
            ));
        }
        self.content
            .editable_documents()?
            .into_iter()
            .find(|document| document.content_type == "blog" && document.slug == slug.as_str())
            .ok_or_else(|| ImageAttributionError::TargetNotFound(target_uri.to_owned()))
    }
}

pub fn inspect_image_attribution(
    path: impl AsRef<Path>,
) -> Result<Option<EmbeddedImageAttribution>, ImageAttributionError> {
    let path = path.as_ref();
    let bytes = read_bytes(path)?;
    let Some(format) = supported_image_format(path) else {
        return Err(ImageAttributionError::UnsupportedFormat(
            path.display().to_string(),
        ));
    };
    let payload = match format {
        ImageFormat::Png => png_text_value(&bytes, ATTRIBUTION_KEYWORD)?,
        ImageFormat::Jpeg => jpeg_attribution_value(&bytes)?,
        ImageFormat::WebP => webp_attribution_value(&bytes)?,
        _ => None,
    };
    payload
        .map(|value| {
            serde_json::from_str(&value)
                .map_err(|error| ImageAttributionError::MalformedMetadata(error.to_string()))
        })
        .transpose()
}

fn attribution_state_path(path: &Path) -> Result<PathBuf, ImageAttributionError> {
    let parent = path.parent().ok_or_else(|| ImageAttributionError::Io {
        path: path.display().to_string(),
        detail: "image has no parent directory".to_owned(),
    })?;
    let file_name = path.file_name().ok_or_else(|| ImageAttributionError::Io {
        path: path.display().to_string(),
        detail: "image has no file name".to_owned(),
    })?;
    Ok(parent
        .join(ATTRIBUTION_STATE_DIRECTORY)
        .join(format!("{}.state", file_name.to_string_lossy())))
}

fn resolve_clean_source(
    path: &Path,
    current: &[u8],
    format: ImageFormat,
    stored: Option<&AssetAttributionState>,
) -> Result<(Vec<u8>, RgbaImage), ImageAttributionError> {
    if let Some(stored) = stored {
        if stored.header.rendered_sha256 == sha256_hex(current) {
            let clean = if stored.header.rendered_mode.includes_visible() {
                let mut image = decode_rgba(path, current)?;
                restore_clean_strip(path, &mut image, stored)?;
                encode_image(path, DynamicImage::ImageRgba8(image), format)?
            } else if stored.header.rendered_mode.includes_metadata() {
                strip_owned_metadata(current, format)?
            } else {
                current.to_vec()
            };
            return Ok((clean, stored.clean_strip.clone()));
        }
    }

    let image = decode_rgba(path, current)?;
    let clean_strip = capture_clean_strip(&image);
    Ok((current.to_vec(), clean_strip))
}

fn capture_clean_strip(image: &RgbaImage) -> RgbaImage {
    let strip_height = image.height().min(ATTRIBUTION_BASE_STRIP_HEIGHT);
    image::imageops::crop_imm(
        image,
        0,
        image.height().saturating_sub(strip_height),
        image.width(),
        strip_height,
    )
    .to_image()
}

fn restore_clean_strip(
    path: &Path,
    image: &mut RgbaImage,
    stored: &AssetAttributionState,
) -> Result<(), ImageAttributionError> {
    if image.width() != stored.header.width
        || image.height() != stored.header.height
        || stored.clean_strip.width() != stored.header.width
        || stored.clean_strip.height() != stored.header.strip_height
    {
        return Err(ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "stored clean strip does not match current image dimensions".to_owned(),
        });
    }
    image::imageops::replace(
        image,
        &stored.clean_strip,
        0,
        i64::from(image.height().saturating_sub(stored.header.strip_height)),
    );
    Ok(())
}

fn encode_attribution_state(
    path: &Path,
    header: AssetAttributionStateHeader,
    clean_strip: &RgbaImage,
) -> Result<Vec<u8>, ImageAttributionError> {
    let header_bytes =
        serde_json::to_vec(&header).map_err(|error| ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?;
    let header_length =
        u32::try_from(header_bytes.len()).map_err(|_| ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "state header is too large".to_owned(),
        })?;
    let strip_bytes = encode_image(
        path,
        DynamicImage::ImageRgba8(clean_strip.clone()),
        ImageFormat::Png,
    )?;
    let mut output = Vec::with_capacity(
        ATTRIBUTION_STATE_MAGIC.len() + 4 + header_bytes.len() + strip_bytes.len(),
    );
    output.extend_from_slice(ATTRIBUTION_STATE_MAGIC);
    output.extend_from_slice(&header_length.to_be_bytes());
    output.extend_from_slice(&header_bytes);
    output.extend_from_slice(&strip_bytes);
    Ok(output)
}

fn decode_attribution_state(
    path: &Path,
    bytes: &[u8],
) -> Result<AssetAttributionState, ImageAttributionError> {
    if !bytes.starts_with(ATTRIBUTION_STATE_MAGIC) {
        return Err(ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "invalid state signature".to_owned(),
        });
    }
    let length_offset = ATTRIBUTION_STATE_MAGIC.len();
    let header_offset = length_offset + 4;
    let header_length = bytes
        .get(length_offset..header_offset)
        .and_then(|slice| slice.try_into().ok())
        .map(u32::from_be_bytes)
        .map(|length| length as usize)
        .ok_or_else(|| ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "missing state header length".to_owned(),
        })?;
    let strip_offset = header_offset.checked_add(header_length).ok_or_else(|| {
        ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "state header length overflow".to_owned(),
        }
    })?;
    let header_bytes = bytes.get(header_offset..strip_offset).ok_or_else(|| {
        ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "state header extends past file".to_owned(),
        }
    })?;
    let header: AssetAttributionStateHeader =
        serde_json::from_slice(header_bytes).map_err(|error| {
            ImageAttributionError::MalformedState {
                path: path.display().to_string(),
                detail: error.to_string(),
            }
        })?;
    let strip_bytes =
        bytes
            .get(strip_offset..)
            .ok_or_else(|| ImageAttributionError::MalformedState {
                path: path.display().to_string(),
                detail: "state does not contain a clean strip".to_owned(),
            })?;
    let clean_strip = decode_rgba(path, strip_bytes)?;
    if header.strip_height == 0
        || header.strip_height > header.height
        || clean_strip.width() != header.width
        || clean_strip.height() != header.strip_height
    {
        return Err(ImageAttributionError::MalformedState {
            path: path.display().to_string(),
            detail: "clean strip dimensions do not match the state header".to_owned(),
        });
    }
    Ok(AssetAttributionState {
        header,
        clean_strip,
    })
}

fn decode_rgba(path: &Path, bytes: &[u8]) -> Result<RgbaImage, ImageAttributionError> {
    ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| decode_error(path, error))?
        .decode()
        .map(|image| image.to_rgba8())
        .map_err(|error| decode_error(path, error))
}

fn apply_to_bytes(
    path: &Path,
    clean: &[u8],
    format: ImageFormat,
    payload: &EmbeddedImageAttribution,
    mode: ImageWatermarkMode,
    position: ImageWatermarkPosition,
    visible_lines: &[String],
) -> Result<Vec<u8>, ImageAttributionError> {
    let mut bytes = if mode.includes_visible() {
        let image = decode_rgba(path, clean)?;
        encode_image(
            path,
            DynamicImage::ImageRgba8(draw_visible_watermark(image, visible_lines, position)),
            format,
        )?
    } else if mode == ImageWatermarkMode::Off && contains_owned_metadata(clean, format)? {
        strip_owned_metadata(clean, format)?
    } else {
        clean.to_vec()
    };
    if mode.includes_metadata() {
        bytes = embed_metadata(bytes, format, payload)?;
    }
    Ok(bytes)
}

fn contains_owned_metadata(
    bytes: &[u8],
    format: ImageFormat,
) -> Result<bool, ImageAttributionError> {
    Ok(match format {
        ImageFormat::Png => png_text_value(bytes, ATTRIBUTION_KEYWORD)?.is_some(),
        ImageFormat::Jpeg => jpeg_attribution_value(bytes)?.is_some(),
        ImageFormat::WebP => webp_attribution_value(bytes)?.is_some(),
        _ => false,
    })
}

fn draw_visible_watermark(
    mut image: RgbaImage,
    lines: &[String],
    position: ImageWatermarkPosition,
) -> RgbaImage {
    if lines.is_empty() || image.width() < 160 || image.height() < 100 {
        return image;
    }
    let width = image.width();
    let height = image.height();
    let margin = (width / 100).clamp(10, 18);
    let max_chars = lines
        .iter()
        .map(|line| line.chars().count())
        .max()
        .unwrap_or(1) as u32;
    let fit_scale = (width.saturating_sub(margin * 2) / (max_chars * 8)).max(1);
    let scale = fit_scale.min(1);
    let glyph_height = 8 * scale;
    let line_gap = 3;
    let text_height =
        lines.len() as u32 * glyph_height + lines.len().saturating_sub(1) as u32 * line_gap;
    let top = height.saturating_sub(margin + text_height);

    for (index, line) in lines.iter().enumerate() {
        let line = ascii_visual(line);
        let line_width = line.chars().count() as u32 * 8 * scale;
        let x = match position {
            ImageWatermarkPosition::BottomLeft => margin,
            ImageWatermarkPosition::BottomRight => width.saturating_sub(margin + line_width),
        };
        let y = top + index as u32 * (glyph_height + line_gap);
        draw_text_with_halo(
            &mut image,
            &line,
            x,
            y,
            scale,
            Rgba([242, 242, 242, 255]),
            Rgba([118, 118, 118, 255]),
        );
    }
    image
}

fn draw_text_with_halo(
    image: &mut RgbaImage,
    text: &str,
    origin_x: u32,
    origin_y: u32,
    scale: u32,
    halo: Rgba<u8>,
    foreground: Rgba<u8>,
) {
    for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
        draw_bitmap_text(
            image,
            text,
            origin_x.saturating_add_signed(dx),
            origin_y.saturating_add_signed(dy),
            scale,
            halo,
        );
    }
    draw_bitmap_text(image, text, origin_x, origin_y, scale, foreground);
}

fn draw_bitmap_text(
    image: &mut RgbaImage,
    text: &str,
    origin_x: u32,
    origin_y: u32,
    scale: u32,
    color: Rgba<u8>,
) {
    let mut cursor_x = origin_x;
    for character in text.chars() {
        let glyph = BASIC_FONTS
            .get(character)
            .or_else(|| BASIC_FONTS.get('?'))
            .unwrap_or([0; 8]);
        for (row, bits) in glyph.iter().enumerate() {
            for column in 0..8u32 {
                if bits & (1u8 << column) == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let x = cursor_x + column * scale + dx;
                        let y = origin_y + row as u32 * scale + dy;
                        if x < image.width() && y < image.height() {
                            image.put_pixel(x, y, color);
                        }
                    }
                }
            }
        }
        cursor_x = cursor_x.saturating_add(8 * scale);
    }
}

fn encode_image(
    path: &Path,
    image: DynamicImage,
    format: ImageFormat,
) -> Result<Vec<u8>, ImageAttributionError> {
    let mut cursor = Cursor::new(Vec::new());
    image
        .write_to(&mut cursor, format)
        .map_err(|error| ImageAttributionError::Decode {
            path: path.display().to_string(),
            detail: format!("cannot encode {format:?}: {error}"),
        })?;
    Ok(cursor.into_inner())
}

fn embed_metadata(
    bytes: Vec<u8>,
    format: ImageFormat,
    payload: &EmbeddedImageAttribution,
) -> Result<Vec<u8>, ImageAttributionError> {
    let json = serde_json::to_string(payload)
        .map_err(|error| ImageAttributionError::MalformedMetadata(error.to_string()))?;
    let xmp = xmp_packet(payload);
    match format {
        ImageFormat::Png => embed_png_metadata(&bytes, &json, &xmp),
        ImageFormat::Jpeg => embed_jpeg_metadata(&bytes, &json, &xmp),
        ImageFormat::WebP => embed_webp_metadata(&bytes, &json, &xmp),
        _ => Err(ImageAttributionError::UnsupportedFormat(format!(
            "{format:?}"
        ))),
    }
}

fn strip_owned_metadata(
    bytes: &[u8],
    format: ImageFormat,
) -> Result<Vec<u8>, ImageAttributionError> {
    match format {
        ImageFormat::Png => strip_png_owned_metadata(bytes),
        ImageFormat::Jpeg => strip_jpeg_owned_metadata(bytes),
        ImageFormat::WebP => strip_webp_owned_metadata(bytes),
        _ => Err(ImageAttributionError::UnsupportedFormat(format!(
            "{format:?}"
        ))),
    }
}

fn strip_png_owned_metadata(bytes: &[u8]) -> Result<Vec<u8>, ImageAttributionError> {
    const SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
    if !bytes.starts_with(SIGNATURE) {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid PNG signature".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(bytes.len());
    output.extend_from_slice(SIGNATURE);
    let mut cursor = SIGNATURE.len();
    while cursor + 12 <= bytes.len() {
        let length = u32::from_be_bytes(
            bytes[cursor..cursor + 4]
                .try_into()
                .map_err(|_| ImageAttributionError::MalformedMetadata("PNG length".to_owned()))?,
        ) as usize;
        let end = cursor + 12 + length;
        if end > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "PNG chunk extends past file".to_owned(),
            ));
        }
        let kind = &bytes[cursor + 4..cursor + 8];
        let data = &bytes[cursor + 8..cursor + 8 + length];
        let owned_chunk = (kind == b"tEXt" && owned_png_text(data))
            || (kind == b"iTXt" && data.starts_with(b"XML:com.adobe.xmp\0"));
        if !owned_chunk {
            output.extend_from_slice(&bytes[cursor..end]);
        }
        cursor = end;
        if kind == b"IEND" {
            break;
        }
    }
    Ok(output)
}

fn strip_jpeg_owned_metadata(bytes: &[u8]) -> Result<Vec<u8>, ImageAttributionError> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid JPEG signature".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(bytes.len());
    output.extend_from_slice(&bytes[..2]);
    let mut cursor = 2usize;
    while cursor + 4 <= bytes.len() && bytes[cursor] == 0xff {
        let marker = bytes[cursor + 1];
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if matches!(marker, 0x01 | 0xd0..=0xd7) {
            output.extend_from_slice(&bytes[cursor..cursor + 2]);
            cursor += 2;
            continue;
        }
        let length = u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
        if length < 2 || cursor + 2 + length > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "JPEG segment extends past file".to_owned(),
            ));
        }
        let data = &bytes[cursor + 4..cursor + 2 + length];
        let owned = (marker == 0xed && data.starts_with(JPEG_ATTRIBUTION_PREFIX))
            || (marker == 0xe1
                && data.starts_with(XMP_PREFIX)
                && data
                    .windows(ATTRIBUTION_SOFTWARE.len())
                    .any(|window| window == ATTRIBUTION_SOFTWARE.as_bytes()));
        if !owned {
            output.extend_from_slice(&bytes[cursor..cursor + 2 + length]);
        }
        cursor += 2 + length;
    }
    output.extend_from_slice(&bytes[cursor..]);
    Ok(output)
}

fn strip_webp_owned_metadata(bytes: &[u8]) -> Result<Vec<u8>, ImageAttributionError> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid WebP signature".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(bytes.len());
    output.extend_from_slice(&bytes[..12]);
    let mut cursor = 12usize;
    while cursor + 8 <= bytes.len() {
        let kind = &bytes[cursor..cursor + 4];
        let length = u32::from_le_bytes(
            bytes[cursor + 4..cursor + 8]
                .try_into()
                .map_err(|_| ImageAttributionError::MalformedMetadata("WebP length".to_owned()))?,
        ) as usize;
        let padded = length + (length % 2);
        let end = cursor + 8 + padded;
        if end > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "WebP chunk extends past file".to_owned(),
            ));
        }
        if kind != b"SILN" && kind != b"XMP " {
            output.extend_from_slice(&bytes[cursor..end]);
        }
        cursor = end;
    }
    let riff_size = (output.len() - 8) as u32;
    output[4..8].copy_from_slice(&riff_size.to_le_bytes());
    Ok(output)
}

fn embed_png_metadata(
    bytes: &[u8],
    json: &str,
    xmp: &str,
) -> Result<Vec<u8>, ImageAttributionError> {
    const SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
    if !bytes.starts_with(SIGNATURE) {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid PNG signature".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(bytes.len() + json.len() + xmp.len() + 512);
    output.extend_from_slice(SIGNATURE);
    let mut cursor = SIGNATURE.len();
    while cursor + 12 <= bytes.len() {
        let length = u32::from_be_bytes(
            bytes[cursor..cursor + 4]
                .try_into()
                .map_err(|_| ImageAttributionError::MalformedMetadata("PNG length".to_owned()))?,
        ) as usize;
        let end = cursor + 12 + length;
        if end > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "PNG chunk extends past file".to_owned(),
            ));
        }
        let kind = &bytes[cursor + 4..cursor + 8];
        let data = &bytes[cursor + 8..cursor + 8 + length];
        let owned_chunk = (kind == b"tEXt" && owned_png_text(data))
            || (kind == b"iTXt" && data.starts_with(b"XML:com.adobe.xmp\0"));
        if kind == b"IEND" {
            for (keyword, value) in [
                ("Title", payload_title(json)),
                ("Author", payload_field(json, "author")),
                ("Description", payload_description(json)),
                ("Copyright", payload_copyright(json)),
                ("Source", payload_field(json, "article_url")),
                ("Software", ATTRIBUTION_SOFTWARE.to_owned()),
                (ATTRIBUTION_KEYWORD, json.to_owned()),
            ] {
                write_png_chunk(
                    &mut output,
                    b"tEXt",
                    format!("{keyword}\0{value}").as_bytes(),
                );
            }
            let mut itxt = b"XML:com.adobe.xmp\0\0\0\0\0".to_vec();
            itxt.extend_from_slice(xmp.as_bytes());
            write_png_chunk(&mut output, b"iTXt", &itxt);
        }
        if !owned_chunk {
            output.extend_from_slice(&bytes[cursor..end]);
        }
        cursor = end;
        if kind == b"IEND" {
            break;
        }
    }
    Ok(output)
}

fn owned_png_text(data: &[u8]) -> bool {
    let keyword = data.split(|byte| *byte == 0).next().unwrap_or_default();
    [
        b"Title".as_slice(),
        b"Author".as_slice(),
        b"Description".as_slice(),
        b"Copyright".as_slice(),
        b"Source".as_slice(),
        b"Software".as_slice(),
        ATTRIBUTION_KEYWORD.as_bytes(),
    ]
    .contains(&keyword)
}

fn write_png_chunk(output: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    output.extend_from_slice(&(data.len() as u32).to_be_bytes());
    output.extend_from_slice(kind);
    output.extend_from_slice(data);
    let mut crc = Crc32::new();
    crc.update(kind);
    crc.update(data);
    output.extend_from_slice(&crc.finalize().to_be_bytes());
}

fn png_text_value(bytes: &[u8], keyword: &str) -> Result<Option<String>, ImageAttributionError> {
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid PNG signature".to_owned(),
        ));
    }
    let mut cursor = 8usize;
    while cursor + 12 <= bytes.len() {
        let length = u32::from_be_bytes(
            bytes[cursor..cursor + 4]
                .try_into()
                .map_err(|_| ImageAttributionError::MalformedMetadata("PNG length".to_owned()))?,
        ) as usize;
        let end = cursor + 12 + length;
        if end > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "PNG chunk extends past file".to_owned(),
            ));
        }
        let kind = &bytes[cursor + 4..cursor + 8];
        let data = &bytes[cursor + 8..cursor + 8 + length];
        if kind == b"tEXt" {
            if let Some(split) = data.iter().position(|byte| *byte == 0) {
                if &data[..split] == keyword.as_bytes() {
                    return Ok(Some(
                        String::from_utf8_lossy(&data[split + 1..]).to_string(),
                    ));
                }
            }
        }
        cursor = end;
    }
    Ok(None)
}

fn embed_jpeg_metadata(
    bytes: &[u8],
    json: &str,
    xmp: &str,
) -> Result<Vec<u8>, ImageAttributionError> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid JPEG signature".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(bytes.len() + json.len() + xmp.len() + 128);
    output.extend_from_slice(&bytes[..2]);
    write_jpeg_segment(
        &mut output,
        0xed,
        &[JPEG_ATTRIBUTION_PREFIX, json.as_bytes()].concat(),
    )?;
    write_jpeg_segment(&mut output, 0xe1, &[XMP_PREFIX, xmp.as_bytes()].concat())?;
    let mut cursor = 2usize;
    while cursor + 4 <= bytes.len() && bytes[cursor] == 0xff {
        let marker = bytes[cursor + 1];
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if matches!(marker, 0x01 | 0xd0..=0xd7) {
            output.extend_from_slice(&bytes[cursor..cursor + 2]);
            cursor += 2;
            continue;
        }
        let length = u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
        if length < 2 || cursor + 2 + length > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "JPEG segment extends past file".to_owned(),
            ));
        }
        let data = &bytes[cursor + 4..cursor + 2 + length];
        let owned = (marker == 0xed && data.starts_with(JPEG_ATTRIBUTION_PREFIX))
            || (marker == 0xe1
                && data.starts_with(XMP_PREFIX)
                && data
                    .windows(ATTRIBUTION_SOFTWARE.len())
                    .any(|window| window == ATTRIBUTION_SOFTWARE.as_bytes()));
        if !owned {
            output.extend_from_slice(&bytes[cursor..cursor + 2 + length]);
        }
        cursor += 2 + length;
    }
    output.extend_from_slice(&bytes[cursor..]);
    Ok(output)
}

fn write_jpeg_segment(
    output: &mut Vec<u8>,
    marker: u8,
    data: &[u8],
) -> Result<(), ImageAttributionError> {
    let length = data.len() + 2;
    if length > u16::MAX as usize {
        return Err(ImageAttributionError::MalformedMetadata(
            "JPEG attribution segment is too large".to_owned(),
        ));
    }
    output.extend_from_slice(&[0xff, marker]);
    output.extend_from_slice(&(length as u16).to_be_bytes());
    output.extend_from_slice(data);
    Ok(())
}

fn jpeg_attribution_value(bytes: &[u8]) -> Result<Option<String>, ImageAttributionError> {
    if !bytes.starts_with(&[0xff, 0xd8]) {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid JPEG signature".to_owned(),
        ));
    }
    let mut cursor = 2usize;
    while cursor + 4 <= bytes.len() && bytes[cursor] == 0xff {
        let marker = bytes[cursor + 1];
        if marker == 0xda || marker == 0xd9 {
            break;
        }
        if matches!(marker, 0x01 | 0xd0..=0xd7) {
            cursor += 2;
            continue;
        }
        let length = u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
        if length < 2 || cursor + 2 + length > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "JPEG segment extends past file".to_owned(),
            ));
        }
        let data = &bytes[cursor + 4..cursor + 2 + length];
        if marker == 0xed && data.starts_with(JPEG_ATTRIBUTION_PREFIX) {
            return Ok(Some(
                String::from_utf8_lossy(&data[JPEG_ATTRIBUTION_PREFIX.len()..]).to_string(),
            ));
        }
        cursor += 2 + length;
    }
    Ok(None)
}

fn embed_webp_metadata(
    bytes: &[u8],
    json: &str,
    xmp: &str,
) -> Result<Vec<u8>, ImageAttributionError> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid WebP signature".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(bytes.len() + json.len() + xmp.len() + 32);
    output.extend_from_slice(&bytes[..12]);
    let mut cursor = 12usize;
    while cursor + 8 <= bytes.len() {
        let kind = &bytes[cursor..cursor + 4];
        let length = u32::from_le_bytes(
            bytes[cursor + 4..cursor + 8]
                .try_into()
                .map_err(|_| ImageAttributionError::MalformedMetadata("WebP length".to_owned()))?,
        ) as usize;
        let padded = length + (length % 2);
        let end = cursor + 8 + padded;
        if end > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "WebP chunk extends past file".to_owned(),
            ));
        }
        if kind != b"SILN" && kind != b"XMP " {
            output.extend_from_slice(&bytes[cursor..end]);
        }
        cursor = end;
    }
    write_webp_chunk(&mut output, b"SILN", json.as_bytes());
    write_webp_chunk(&mut output, b"XMP ", xmp.as_bytes());
    let riff_size = (output.len() - 8) as u32;
    output[4..8].copy_from_slice(&riff_size.to_le_bytes());
    Ok(output)
}

fn write_webp_chunk(output: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    output.extend_from_slice(kind);
    output.extend_from_slice(&(data.len() as u32).to_le_bytes());
    output.extend_from_slice(data);
    if data.len() % 2 == 1 {
        output.push(0);
    }
}

fn webp_attribution_value(bytes: &[u8]) -> Result<Option<String>, ImageAttributionError> {
    if bytes.len() < 12 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(ImageAttributionError::MalformedMetadata(
            "invalid WebP signature".to_owned(),
        ));
    }
    let mut cursor = 12usize;
    while cursor + 8 <= bytes.len() {
        let kind = &bytes[cursor..cursor + 4];
        let length = u32::from_le_bytes(
            bytes[cursor + 4..cursor + 8]
                .try_into()
                .map_err(|_| ImageAttributionError::MalformedMetadata("WebP length".to_owned()))?,
        ) as usize;
        let data_start = cursor + 8;
        let end = data_start + length;
        if end > bytes.len() {
            return Err(ImageAttributionError::MalformedMetadata(
                "WebP chunk extends past file".to_owned(),
            ));
        }
        if kind == b"SILN" {
            return Ok(Some(
                String::from_utf8_lossy(&bytes[data_start..end]).to_string(),
            ));
        }
        cursor = end + (length % 2);
    }
    Ok(None)
}

fn embedded_payload(
    plan: &ArticleImageAttributionPlan,
    asset_uri: &str,
) -> Result<EmbeddedImageAttribution, ImageAttributionError> {
    let fingerprint_source = serde_json::json!({
        "title": plan.project_name,
        "publication_venue": plan.publication_venue,
        "author": plan.author,
        "site_url": plan.site_url,
        "article_url": plan.article_url,
        "project_url": plan.project_url,
        "asset_uri": asset_uri,
    });
    let bytes = serde_json::to_vec(&fingerprint_source)
        .map_err(|error| ImageAttributionError::MalformedMetadata(error.to_string()))?;
    let fingerprint = format!("{:x}", Sha256::digest(bytes));
    Ok(EmbeddedImageAttribution {
        schema: "https://silan.tech/schemas/image-attribution/v1".to_owned(),
        fingerprint,
        title: plan.project_name.clone(),
        publication_venue: plan.publication_venue.clone(),
        author: plan.author.clone(),
        site_url: plan.site_url.clone(),
        article_url: plan.article_url.clone(),
        project_url: plan.project_url.clone(),
        asset_uri: asset_uri.to_owned(),
        software: ATTRIBUTION_SOFTWARE.to_owned(),
    })
}

fn visible_lines(
    project_name: &str,
    venue: &str,
    author: &str,
    site_url: &str,
    article_url: &str,
    project_url: &str,
) -> Vec<String> {
    let mut primary_parts = vec![project_name.trim()];
    if !venue.trim().is_empty() {
        primary_parts.push(venue.trim());
    }
    if !author.trim().is_empty() {
        primary_parts.push(author.trim());
    }
    let primary = primary_parts.join(" / ");
    let secondary = [display_url(site_url)]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" / ");
    let mut destinations = Vec::new();
    let article = display_url(article_url);
    if !article.is_empty() {
        destinations.push(format!("Article: {article}"));
    }
    let project = display_url(project_url);
    if !project.is_empty() {
        destinations.push(format!("Project: {project}"));
    }
    [
        primary,
        [secondary, destinations.join(" / ")]
            .into_iter()
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" / "),
    ]
    .into_iter()
    .filter(|line| !line.trim().is_empty())
    .collect()
}

fn xmp_packet(payload: &EmbeddedImageAttribution) -> String {
    format!(
        r#"<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
      xmlns:silan="https://silan.tech/schemas/image-attribution/v1#"
      dc:title="{title}"
      dc:creator="{author}"
      dc:source="{article_url}"
      xmpRights:Marked="True"
      xmpRights:WebStatement="{site_url}"
      photoshop:Credit="{author}"
      silan:ProjectUrl="{project_url}"
      silan:AssetUri="{asset_uri}"
      silan:Fingerprint="{fingerprint}"
      silan:Software="{software}" />
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>"#,
        title = xml_escape(&payload.title),
        author = xml_escape(&payload.author),
        article_url = xml_escape(&payload.article_url),
        site_url = xml_escape(&payload.site_url),
        project_url = xml_escape(&payload.project_url),
        asset_uri = xml_escape(&payload.asset_uri),
        fingerprint = payload.fingerprint,
        software = ATTRIBUTION_SOFTWARE,
    )
}

fn payload_field(json: &str, field: &str) -> String {
    serde_json::from_str::<serde_json::Value>(json)
        .ok()
        .and_then(|value| {
            value
                .get(field)
                .and_then(|field| field.as_str())
                .map(str::to_owned)
        })
        .unwrap_or_default()
}

fn payload_title(json: &str) -> String {
    let title = payload_field(json, "title");
    let venue = payload_field(json, "publication_venue");
    match (title.is_empty(), venue.is_empty()) {
        (false, false) => format!("{title} — {venue}"),
        (false, true) => title,
        (true, false) => venue,
        (true, true) => String::new(),
    }
}

fn payload_description(json: &str) -> String {
    let article = payload_field(json, "article_url");
    let project = payload_field(json, "project_url");
    format!(
        "{}. Article: {}. Project: {}.",
        payload_title(json),
        article,
        project
    )
}

fn payload_copyright(json: &str) -> String {
    let author = payload_field(json, "author");
    let site = payload_field(json, "site_url");
    format!("© {author} · {site}")
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn ascii_visual(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_graphic() || character == ' ' {
                character
            } else {
                '?'
            }
        })
        .collect()
}

fn display_url(value: &str) -> &str {
    value
        .trim()
        .strip_prefix("https://")
        .or_else(|| value.trim().strip_prefix("http://"))
        .unwrap_or(value.trim())
        .trim_end_matches('/')
}

fn canonical_url(value: &str) -> String {
    value.trim().trim_end_matches('/').to_owned()
}

fn non_empty(value: &str, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.trim().to_owned()
    } else {
        value.trim().to_owned()
    }
}

fn supported_image_format(path: &Path) -> Option<ImageFormat> {
    match path
        .extension()
        .and_then(|extension| extension.to_str())?
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        _ => None,
    }
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, ImageAttributionError> {
    fs::read(path).map_err(|error| ImageAttributionError::Io {
        path: path.display().to_string(),
        detail: error.to_string(),
    })
}

fn read_optional_bytes(path: &Path) -> Result<Option<Vec<u8>>, ImageAttributionError> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(ImageAttributionError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        }),
    }
}

fn ensure_parent_directory(path: &Path) -> Result<(), ImageAttributionError> {
    let parent = path.parent().ok_or_else(|| ImageAttributionError::Io {
        path: path.display().to_string(),
        detail: "file has no parent directory".to_owned(),
    })?;
    fs::create_dir_all(parent).map_err(|error| ImageAttributionError::Io {
        path: parent.display().to_string(),
        detail: error.to_string(),
    })
}

fn restore_optional_file(path: &Path, original: Option<&[u8]>) {
    if let Some(original) = original {
        let _ = atomic_write(path, original);
    } else {
        let _ = fs::remove_file(path);
    }
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), ImageAttributionError> {
    let parent = path.parent().ok_or_else(|| ImageAttributionError::Io {
        path: path.display().to_string(),
        detail: "image has no parent directory".to_owned(),
    })?;
    let permissions = fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|error| ImageAttributionError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?;
    temporary
        .write_all(bytes)
        .map_err(|error| ImageAttributionError::Io {
            path: path.display().to_string(),
            detail: error.to_string(),
        })?;
    if let Some(permissions) = permissions {
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|error| ImageAttributionError::Io {
                path: path.display().to_string(),
                detail: error.to_string(),
            })?;
    }
    temporary
        .persist(path)
        .map_err(|error| ImageAttributionError::Io {
            path: path.display().to_string(),
            detail: error.error.to_string(),
        })?;
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn decode_error(path: &Path, error: impl std::fmt::Display) -> ImageAttributionError {
    ImageAttributionError::Decode {
        path: path.display().to_string(),
        detail: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    fn payload() -> EmbeddedImageAttribution {
        EmbeddedImageAttribution {
            schema: "https://silan.tech/schemas/image-attribution/v1".to_owned(),
            fingerprint: "abc".to_owned(),
            title: "GEM-Bench".to_owned(),
            publication_venue: "KDD 2026".to_owned(),
            author: "Silan Hu".to_owned(),
            site_url: "https://silan.tech".to_owned(),
            article_url: "https://silan.tech/blog/gem-bench/".to_owned(),
            project_url: "https://gem-bench.org".to_owned(),
            asset_uri: "silan://resources/blog/gem-bench/assets/cover.png".to_owned(),
            software: ATTRIBUTION_SOFTWARE.to_owned(),
        }
    }

    #[test]
    fn png_metadata_round_trips_and_replaces_owned_chunks() {
        let image = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(
            320,
            180,
            Rgba([240, 240, 240, 255]),
        ));
        let bytes =
            encode_image(Path::new("test.png"), image, ImageFormat::Png).expect("encode png");
        let first = embed_metadata(bytes, ImageFormat::Png, &payload()).expect("embed metadata");
        let second = embed_metadata(first, ImageFormat::Png, &payload()).expect("replace metadata");
        let raw = png_text_value(&second, ATTRIBUTION_KEYWORD)
            .expect("read PNG")
            .expect("attribution payload");
        let observed: EmbeddedImageAttribution =
            serde_json::from_str(&raw).expect("decode attribution");
        assert_eq!(observed.author, "Silan Hu");
        assert_eq!(
            second
                .windows(ATTRIBUTION_KEYWORD.len())
                .filter(|window| *window == ATTRIBUTION_KEYWORD.as_bytes())
                .count(),
            1
        );
    }

    #[test]
    fn visible_watermark_preserves_dimensions_and_uses_footer() {
        let image = ImageBuffer::from_pixel(800, 450, Rgba([245, 240, 230, 255]));
        let watermarked = draw_visible_watermark(
            image,
            &[
                "GEM-Bench / KDD 2026".to_owned(),
                "Silan Hu / silan.tech".to_owned(),
            ],
            ImageWatermarkPosition::BottomRight,
        );
        assert_eq!(watermarked.dimensions(), (800, 450));
        assert_eq!(watermarked.get_pixel(400, 449), &Rgba([245, 240, 230, 255]));
        assert!(watermarked
            .pixels()
            .any(|pixel| pixel != &Rgba([245, 240, 230, 255])));
    }

    #[test]
    fn attribution_state_restores_clean_pixels_before_moving_watermark() {
        let path = Path::new("cover.png");
        let clean_image = ImageBuffer::from_fn(800, 450, |x, y| {
            Rgba([(x % 251) as u8, (y % 241) as u8, ((x + y) % 239) as u8, 255])
        });
        let clean_bytes = encode_image(
            path,
            DynamicImage::ImageRgba8(clean_image.clone()),
            ImageFormat::Png,
        )
        .expect("encode clean image");
        let clean_strip = capture_clean_strip(&clean_image);
        let right_bytes = apply_to_bytes(
            path,
            &clean_bytes,
            ImageFormat::Png,
            &payload(),
            ImageWatermarkMode::Visible,
            ImageWatermarkPosition::BottomRight,
            &["GEM-Bench / Silan Hu".to_owned(), "silan.tech".to_owned()],
        )
        .expect("draw right watermark");
        let state_path = Path::new("cover.png.state");
        let state_bytes = encode_attribution_state(
            state_path,
            AssetAttributionStateHeader {
                schema: "https://silan.tech/schemas/image-attribution-state/v1".to_owned(),
                width: clean_image.width(),
                height: clean_image.height(),
                strip_height: clean_strip.height(),
                rendered_sha256: sha256_hex(&right_bytes),
                rendered_mode: ImageWatermarkMode::Visible,
            },
            &clean_strip,
        )
        .expect("encode state");
        let stored = decode_attribution_state(state_path, &state_bytes).expect("decode state");
        let (restored_bytes, restored_strip) =
            resolve_clean_source(path, &right_bytes, ImageFormat::Png, Some(&stored))
                .expect("restore clean image");
        assert_eq!(decode_rgba(path, &restored_bytes).unwrap(), clean_image);
        assert_eq!(restored_strip, clean_strip);

        let left_bytes = apply_to_bytes(
            path,
            &restored_bytes,
            ImageFormat::Png,
            &payload(),
            ImageWatermarkMode::Visible,
            ImageWatermarkPosition::BottomLeft,
            &["GEM-Bench / Silan Hu".to_owned(), "silan.tech".to_owned()],
        )
        .expect("draw left watermark");
        let left_image = decode_rgba(path, &left_bytes).unwrap();
        assert_eq!(
            left_image.get_pixel(790, 430),
            clean_image.get_pixel(790, 430)
        );
        assert_ne!(left_image, clean_image);
    }

    #[test]
    fn off_mode_removes_owned_metadata_without_changing_pixels() {
        let path = Path::new("cover.png");
        let image = ImageBuffer::from_pixel(320, 180, Rgba([210, 220, 230, 255]));
        let clean = encode_image(
            path,
            DynamicImage::ImageRgba8(image.clone()),
            ImageFormat::Png,
        )
        .expect("encode png");
        let attributed =
            embed_metadata(clean, ImageFormat::Png, &payload()).expect("embed metadata");
        let restored = apply_to_bytes(
            path,
            &attributed,
            ImageFormat::Png,
            &payload(),
            ImageWatermarkMode::Off,
            ImageWatermarkPosition::BottomRight,
            &[],
        )
        .expect("remove attribution");
        assert_eq!(decode_rgba(path, &restored).unwrap(), image);
        assert!(!contains_owned_metadata(&restored, ImageFormat::Png).unwrap());
    }
}
