//! Source-backed cover discovery, generation, storage, and application.
//!
//! A Blog is an Item while an episode series is a directory-level aggregate.
//! This module gives adapters one target contract for both without erasing
//! that ownership distinction.

use crate::{
    ContentEditor, EditableDocument, GeneratedImageAsset, ImageGenerationRequest,
    ImageOutputFormat, ImageQuality, ImageSize, MediaAssetRef, MediaLibrary, MediaLibraryError,
    OpenAiApiKey, OpenAiImageGenerationError, OpenAiImageGenerator, SaveMetadataInput,
    SeriesMetadataSource, SilanUri, Slug, Workspace, WorkspaceContent, WorkspaceContentError,
};
use serde::Serialize;
use silan_viking_base::Namespace;
use std::path::Path;
use std::str::FromStr;
use thiserror::Error;

const DEFAULT_RESULT_LIMIT: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CoverTargetKind {
    Blog,
    EpisodeSeries,
}

impl CoverTargetKind {
    pub fn parse(value: &str) -> Result<Self, CoverError> {
        match value.trim() {
            "blog" => Ok(Self::Blog),
            "series" | "episode_series" | "episode-series" => Ok(Self::EpisodeSeries),
            other => Err(CoverError::InvalidTarget(format!(
                "unsupported cover target type `{other}`; expected `blog` or `series`"
            ))),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Blog => "blog",
            Self::EpisodeSeries => "series",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CoverTargetSummary {
    pub uri: String,
    pub kind: CoverTargetKind,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub current_cover_uri: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoverBrief {
    pub language: String,
    pub headline: String,
    pub audience: String,
    pub value: String,
    pub visual_direction: String,
}

impl CoverBrief {
    pub fn from_target(target: &CoverTargetSummary) -> Self {
        let chinese = contains_cjk(&format!("{} {}", target.title, target.description));
        let language = if chinese { "zh" } else { "en" };
        Self {
            language: language.to_owned(),
            headline: compact(&target.title),
            audience: default_audience(language, target.kind).to_owned(),
            value: compact(if target.description.trim().is_empty() {
                &target.title
            } else {
                &target.description
            }),
            visual_direction: String::new(),
        }
    }

    pub fn set_language(&mut self, target_kind: CoverTargetKind, language: impl Into<String>) {
        self.language = language.into();
        self.audience = default_audience(&self.language, target_kind).to_owned();
    }

    /// Build the XHS/RedNote editorial prompt shared by desktop and CLI.
    pub fn xhs_editorial_prompt(&self, target_kind: CoverTargetKind, size: ImageSize) -> String {
        let orientation = match size {
            ImageSize::Square1024 => "square 1:1",
            ImageSize::Portrait1024x1536 => "portrait 2:3",
            ImageSize::Landscape1536x1024 => "landscape 3:2",
        };
        let language = if self.language.trim().to_ascii_lowercase().starts_with("zh") {
            "Simplified Chinese"
        } else {
            "English"
        };
        let visual = if self.visual_direction.trim().is_empty() {
            "Show one real, specific work scene implied by the headline and value statement. Do not invent software interfaces.".to_owned()
        } else {
            compact(&self.visual_direction)
        };
        let headline =
            serde_json::to_string(&compact(&self.headline)).unwrap_or_else(|_| "\"\"".to_owned());
        [
            format!(
                "Create a {orientation} editorial cover for a {}.",
                match target_kind {
                    CoverTargetKind::Blog => "blog article",
                    CoverTargetKind::EpisodeSeries => "content series",
                }
            ),
            "Apply the Xiaohongshu/RedNote cover method to a website cover: one concrete pain point, one perceivable value, authentic creator-note energy, and phone-readable hierarchy.".to_owned(),
            format!("Target reader: {}.", compact(&self.audience)),
            format!("Core problem and value: {}.", compact(&self.value)),
            format!(
                "The only large headline must be exactly {headline}, rendered in {language}."
            ),
            format!("Concrete visual: {visual}"),
            "Composition: the headline is the first signal; use one dominant concrete scene or object; keep generous safe margins; make the result readable as a small cover thumbnail.".to_owned(),
            "Style: solid warm paper or clean light background, bold high-contrast type, restrained hand-made annotation, candid and useful rather than polished advertising.".to_owned(),
            "Do not add subtitles, labels, logos, watermarks, hashtags, fake UI, feature lists, gradients, sci-fi imagery, glossy 3D objects, or decorative filler.".to_owned(),
        ]
        .join("\n")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CoverGenerationInput {
    pub target_uri: String,
    pub brief: CoverBrief,
    pub prompt_override: Option<String>,
    pub size: ImageSize,
    pub quality: ImageQuality,
    pub output_format: ImageOutputFormat,
    pub apply: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CoverApplyState {
    Candidate,
    Applied,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CoverGenerationResult {
    pub target: CoverTargetSummary,
    pub asset: MediaAssetRef,
    pub state: CoverApplyState,
}

#[derive(Debug, Error)]
pub enum CoverError {
    #[error("invalid cover target: {0}")]
    InvalidTarget(String),
    #[error("cover target `{0}` was not found")]
    TargetNotFound(String),
    #[error("cover query failed: {0}")]
    Query(String),
    #[error(transparent)]
    Content(#[from] WorkspaceContentError),
    #[error(transparent)]
    Media(#[from] MediaLibraryError),
    #[error(transparent)]
    ImageGeneration(#[from] OpenAiImageGenerationError),
    #[error("cover asset was generated at `{asset_uri}` but could not be applied: {detail}")]
    ApplyFailed { asset_uri: String, detail: String },
}

pub struct CoverWorkspace {
    workspace: Workspace,
    content: WorkspaceContent,
    editor: ContentEditor,
    media: MediaLibrary,
}

impl CoverWorkspace {
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, CoverError> {
        let content_root = content_root.as_ref();
        Ok(Self {
            workspace: Workspace::open(content_root)
                .map_err(|error| CoverError::Query(error.to_string()))?,
            content: WorkspaceContent::open(content_root)?,
            editor: ContentEditor::open(content_root)
                .map_err(|error| CoverError::Query(error.to_string()))?,
            media: MediaLibrary::open(content_root)?,
        })
    }

    /// Find Blog and series targets by human title, slug, or description.
    ///
    /// This search intentionally supports Unicode substring matching because
    /// target selection must work for Chinese titles as well as ASCII slugs.
    pub fn find_targets(
        &self,
        query: &str,
        kind: Option<CoverTargetKind>,
        limit: Option<usize>,
    ) -> Result<Vec<CoverTargetSummary>, CoverError> {
        let mut ranked = Vec::new();
        if kind.is_none_or(|value| value == CoverTargetKind::Blog) {
            for document in self.content.editable_documents()? {
                if document.content_type != "blog" {
                    continue;
                }
                let target = blog_summary(&document);
                if let Some(score) = match_score(&target, query) {
                    ranked.push((score, target));
                }
            }
        }
        if kind.is_none_or(|value| value == CoverTargetKind::EpisodeSeries) {
            let scan = self
                .workspace
                .scan()
                .map_err(|error| CoverError::Query(error.to_string()))?;
            for series in scan.series() {
                let target = CoverTargetSummary {
                    uri: format!("silan://resources/episode/{}", series.slug),
                    kind: CoverTargetKind::EpisodeSeries,
                    slug: series.slug.clone(),
                    title: non_empty(&series.title, &series.slug),
                    description: series.description.clone(),
                    current_cover_uri: optional_text(&series.cover_url),
                };
                if let Some(score) = match_score(&target, query) {
                    ranked.push((score, target));
                }
            }
        }
        ranked.sort_by(|(left_score, left), (right_score, right)| {
            right_score
                .cmp(left_score)
                .then(left.title.cmp(&right.title))
                .then(left.uri.cmp(&right.uri))
        });
        ranked.truncate(limit.unwrap_or(DEFAULT_RESULT_LIMIT));
        Ok(ranked.into_iter().map(|(_, target)| target).collect())
    }

    pub fn target(&self, target_uri: &str) -> Result<CoverTargetSummary, CoverError> {
        Ok(self.resolve_target(target_uri)?.summary().clone())
    }

    /// Generate an image, store it under the target's own `assets/`
    /// directory, and optionally write its canonical URI into metadata.
    pub fn generate_cover(
        &self,
        api_key: &OpenAiApiKey,
        input: &CoverGenerationInput,
        db_path: impl AsRef<Path>,
    ) -> Result<CoverGenerationResult, CoverError> {
        let target = self.target(&input.target_uri)?;
        let prompt = input
            .prompt_override
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| input.brief.xhs_editorial_prompt(target.kind, input.size));
        let generated = OpenAiImageGenerator::default().generate(
            api_key,
            &ImageGenerationRequest {
                prompt,
                size: input.size,
                quality: input.quality,
                output_format: input.output_format,
            },
        )?;
        let named = GeneratedImageAsset {
            file_name: format!(
                "ai-cover-{}.{}",
                target.slug,
                input.output_format.extension()
            ),
            ..generated
        };
        let asset = self.store_cover_asset(&target.uri, &named)?;
        if input.apply {
            let target = self
                .apply_cover_asset(&target.uri, &asset.uri, db_path)
                .map_err(|error| CoverError::ApplyFailed {
                    asset_uri: asset.uri.clone(),
                    detail: error.to_string(),
                })?;
            Ok(CoverGenerationResult {
                target,
                asset,
                state: CoverApplyState::Applied,
            })
        } else {
            Ok(CoverGenerationResult {
                target,
                asset,
                state: CoverApplyState::Candidate,
            })
        }
    }

    /// Persist already-generated image bytes under the correct owner.
    pub fn store_cover_asset(
        &self,
        target_uri: &str,
        generated: &GeneratedImageAsset,
    ) -> Result<MediaAssetRef, CoverError> {
        match self.resolve_target(target_uri)? {
            ResolvedCoverTarget::Blog { document, .. } => Ok(self.media.import_asset_bytes(
                &document.id,
                &generated.file_name,
                &generated.bytes,
            )?),
            ResolvedCoverTarget::Series { source, .. } => {
                Ok(self.media.import_episode_series_asset_bytes(
                    &source.slug,
                    &generated.file_name,
                    &generated.bytes,
                )?)
            }
        }
    }

    /// Apply an existing target-owned `silan://` asset as the current cover.
    pub fn apply_cover_asset(
        &self,
        target_uri: &str,
        asset_uri: &str,
        db_path: impl AsRef<Path>,
    ) -> Result<CoverTargetSummary, CoverError> {
        let resolved = self.resolve_target(target_uri)?;
        validate_asset_owner(resolved.summary(), asset_uri)?;
        self.media.resolve_uri(asset_uri)?;
        match resolved {
            ResolvedCoverTarget::Blog { document, .. } => {
                let document = *document;
                let part = document
                    .parts
                    .iter()
                    .find(|part| part.role == "body")
                    .or_else(|| document.parts.first())
                    .ok_or_else(|| CoverError::TargetNotFound(target_uri.to_owned()))?;
                let translation = part
                    .translations
                    .iter()
                    .find(|translation| translation.language == part.canonical_language)
                    .or_else(|| part.translations.first())
                    .ok_or_else(|| CoverError::TargetNotFound(target_uri.to_owned()))?;
                self.content
                    .save_metadata(
                        &SaveMetadataInput {
                            translation_id: translation.id.clone(),
                            title: document.title,
                            description: document.description,
                            cover_url: Some(asset_uri.to_owned()),
                            cover_source_type: document.cover_source_type,
                            cover_website_url: document.cover_website_url,
                            github_url: document.github_url,
                            demo_url: document.demo_url,
                            article_attribution: document.article_attribution,
                            moment_type: None,
                            priority: None,
                            tags: None,
                            expected_revision: translation.source_revision.0.clone(),
                        },
                        db_path,
                    )
                    .map_err(CoverError::Content)?;
            }
            ResolvedCoverTarget::Series { source, .. } => {
                self.editor
                    .save_episode_series_metadata_and_sync(
                        &source.slug,
                        &source.title,
                        &source.description,
                        asset_uri,
                        &source.revision,
                        db_path,
                    )
                    .map_err(|error| CoverError::Query(error.to_string()))?;
            }
        }
        self.target(target_uri)
    }

    fn resolve_target(&self, target_uri: &str) -> Result<ResolvedCoverTarget, CoverError> {
        let uri = SilanUri::from_str(target_uri)
            .map_err(|error| CoverError::InvalidTarget(error.to_string()))?;
        if uri.namespace() != Namespace::Resources {
            return Err(CoverError::InvalidTarget(
                "cover target must be under silan://resources".to_owned(),
            ));
        }
        match uri.segments() {
            [kind, slug] if kind == "blog" => {
                Slug::new(slug.as_str())
                    .map_err(|error| CoverError::InvalidTarget(error.to_string()))?;
                let document = self
                    .content
                    .editable_documents()?
                    .into_iter()
                    .find(|document| {
                        document.content_type == "blog" && document.slug == slug.as_str()
                    })
                    .ok_or_else(|| CoverError::TargetNotFound(target_uri.to_owned()))?;
                Ok(ResolvedCoverTarget::Blog {
                    summary: blog_summary(&document),
                    document: Box::new(document),
                })
            }
            [kind, slug] if kind == "episode" => {
                Slug::new(slug.as_str())
                    .map_err(|error| CoverError::InvalidTarget(error.to_string()))?;
                let source = self
                    .editor
                    .read_episode_series_metadata(slug.as_str())
                    .map_err(|_| CoverError::TargetNotFound(target_uri.to_owned()))?;
                let summary = series_summary(&source);
                Ok(ResolvedCoverTarget::Series { summary, source })
            }
            _ => Err(CoverError::InvalidTarget(
                "expected silan://resources/blog/<slug> or silan://resources/episode/<series_slug>"
                    .to_owned(),
            )),
        }
    }
}

enum ResolvedCoverTarget {
    Blog {
        summary: CoverTargetSummary,
        document: Box<EditableDocument>,
    },
    Series {
        summary: CoverTargetSummary,
        source: SeriesMetadataSource,
    },
}

impl ResolvedCoverTarget {
    fn summary(&self) -> &CoverTargetSummary {
        match self {
            Self::Blog { summary, .. } | Self::Series { summary, .. } => summary,
        }
    }
}

fn blog_summary(document: &EditableDocument) -> CoverTargetSummary {
    CoverTargetSummary {
        uri: format!("silan://resources/blog/{}", document.slug),
        kind: CoverTargetKind::Blog,
        slug: document.slug.clone(),
        title: non_empty(&document.title, &document.slug),
        description: document.description.clone().unwrap_or_default(),
        current_cover_uri: document.cover_uri.clone(),
    }
}

fn series_summary(source: &SeriesMetadataSource) -> CoverTargetSummary {
    CoverTargetSummary {
        uri: format!("silan://resources/episode/{}", source.slug),
        kind: CoverTargetKind::EpisodeSeries,
        slug: source.slug.clone(),
        title: non_empty(&source.title, &source.slug),
        description: source.description.clone(),
        current_cover_uri: optional_text(&source.cover_url),
    }
}

fn validate_asset_owner(target: &CoverTargetSummary, asset_uri: &str) -> Result<(), CoverError> {
    let prefix = format!("{}/assets/", target.uri);
    if asset_uri.starts_with(&prefix) {
        Ok(())
    } else {
        Err(CoverError::InvalidTarget(format!(
            "asset `{asset_uri}` is not owned by `{}`",
            target.uri
        )))
    }
}

fn match_score(target: &CoverTargetSummary, query: &str) -> Option<u8> {
    let query = compact(query).to_lowercase();
    if query.is_empty() {
        return Some(1);
    }
    let slug = target.slug.to_lowercase();
    let title = target.title.to_lowercase();
    let description = target.description.to_lowercase();
    if slug == query || title == query {
        Some(100)
    } else if slug.starts_with(&query) || title.starts_with(&query) {
        Some(70)
    } else if slug.contains(&query) || title.contains(&query) {
        Some(50)
    } else if description.contains(&query) {
        Some(20)
    } else {
        None
    }
}

fn compact(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn contains_cjk(value: &str) -> bool {
    value
        .chars()
        .any(|character| matches!(character, '\u{3400}'..='\u{9fff}'))
}

fn default_audience(language: &str, target_kind: CoverTargetKind) -> &'static str {
    let chinese = language.trim().to_ascii_lowercase().starts_with("zh");
    match (chinese, target_kind) {
        (true, CoverTargetKind::EpisodeSeries) => "希望持续跟进这个主题的读者",
        (true, CoverTargetKind::Blog) => "正在解决同类问题、需要快速判断这篇内容是否值得读的人",
        (false, CoverTargetKind::EpisodeSeries) => "Readers deciding whether to follow this topic",
        (false, CoverTargetKind::Blog) => {
            "Readers deciding whether this article solves their current problem"
        }
    }
}

fn non_empty(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_owned()
    } else {
        value.to_owned()
    }
}

fn optional_text(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn fixture() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content")
    }

    fn copy_tree(source: &Path, destination: &Path) {
        fs::create_dir_all(destination).expect("create fixture destination");
        for entry in fs::read_dir(source).expect("read fixture directory") {
            let entry = entry.expect("fixture entry");
            let destination_path = destination.join(entry.file_name());
            if entry.path().is_dir() {
                copy_tree(&entry.path(), &destination_path);
            } else {
                fs::copy(entry.path(), destination_path).expect("copy fixture file");
            }
        }
    }

    #[test]
    fn finds_blog_and_series_with_stable_target_uris() {
        let workspace = CoverWorkspace::open(fixture()).expect("open cover workspace");
        let blogs = workspace
            .find_targets("hello", Some(CoverTargetKind::Blog), None)
            .expect("find blog");
        assert_eq!(blogs[0].uri, "silan://resources/blog/hello-world");

        let series = workspace
            .find_targets("Tutorial", Some(CoverTargetKind::EpisodeSeries), None)
            .expect("find series");
        assert_eq!(series[0].uri, "silan://resources/episode/tutorial-series");
    }

    #[test]
    fn xhs_prompt_keeps_the_single_requested_headline() {
        let brief = CoverBrief {
            language: "zh".to_owned(),
            headline: "Researcher 为论文做网站，能不能只更新一次？".to_owned(),
            audience: "需要持续发布研究进展的人".to_owned(),
            value: "几分钟完成一次更新，让进展被记录、理解和发现。".to_owned(),
            visual_direction: String::new(),
        };
        let prompt =
            brief.xhs_editorial_prompt(CoverTargetKind::Blog, ImageSize::Landscape1536x1024);
        assert!(prompt.contains("landscape 3:2"));
        assert!(prompt.contains("Simplified Chinese"));
        assert!(prompt.contains("phone-readable hierarchy"));
        assert!(prompt.contains("The only large headline"));
    }

    #[test]
    fn stores_and_applies_target_owned_silan_asset() {
        let temp = tempfile::tempdir().expect("temp workspace");
        let content_root = temp.path().join("content");
        copy_tree(&fixture(), &content_root);
        let workspace = CoverWorkspace::open(&content_root).expect("open cover workspace");
        let generated = GeneratedImageAsset {
            file_name: "ai-cover-hello-world.png".to_owned(),
            mime_type: "image/png".to_owned(),
            bytes: b"fake-png".to_vec(),
        };
        let asset = workspace
            .store_cover_asset("silan://resources/blog/hello-world", &generated)
            .expect("store cover");
        assert_eq!(
            asset.uri,
            "silan://resources/blog/hello-world/assets/ai-cover-hello-world.png"
        );
        assert!(content_root
            .join(format!("resources/{}", asset.relative_path))
            .is_file());

        let applied = workspace
            .apply_cover_asset(
                "silan://resources/blog/hello-world",
                &asset.uri,
                temp.path().join("portfolio.db"),
            )
            .expect("apply cover");
        assert_eq!(
            applied.current_cover_uri.as_deref(),
            Some(asset.uri.as_str())
        );
    }

    #[test]
    fn series_assets_are_stored_below_the_series_container() {
        let temp = tempfile::tempdir().expect("temp workspace");
        let content_root = temp.path().join("content");
        copy_tree(&fixture(), &content_root);
        let workspace = CoverWorkspace::open(&content_root).expect("open cover workspace");
        let asset = workspace
            .store_cover_asset(
                "silan://resources/episode/tutorial-series",
                &GeneratedImageAsset {
                    file_name: "ai-cover-tutorial-series.webp".to_owned(),
                    mime_type: "image/webp".to_owned(),
                    bytes: b"fake-webp".to_vec(),
                },
            )
            .expect("store series cover");
        assert_eq!(
            asset.uri,
            "silan://resources/episode/tutorial-series/assets/ai-cover-tutorial-series.webp"
        );
    }
}
