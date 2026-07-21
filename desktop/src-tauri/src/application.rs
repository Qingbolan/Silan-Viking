//! Thin Tauri-facing adapters over the public `silan-viking-app` use cases.

use crate::model::{
    ContentMetadataInput,
    CommitActivityDay, DailyContentTraffic, DailyTraffic, DashboardData, DashboardItem,
    DeliverySyncStatus, DeployRunStatus, DeployVerificationResult, DeployedStats, DeploymentPlan,
    DeploymentScopeStatus, DocumentStateInput, EditorDocument, EditorTranslation, EngagementStats,
    EngagementStatsInput, EntityCount, EpisodeSeriesInput, EpisodeSeriesSource, GeoAction,
    GeoEvidence, GeoInsightReport, GeoMetric, ImportedMediaAsset, MomentsCover, MomentsProfile, MomentsSettings,
    RemoteContentVersion, ResumeEntryInput, ResumePartSource, ResumeProfile, ResumeProfileSource,
    ResumeSection, ResumeSocialLink, StatsSyncReport, TopContentItem, TrafficCountry,
    TrafficEvidence, TrafficSource, VersionChange, VersionCommit, VersionStatus, VisitorLocation,
    WorkspaceFileChange,
};
use serde::Deserialize;
use silan_viking_app::{
    api_base_url, ContentCreator, ContentEditor, ContentKind, CreateTranslationInput, DeliveryControl, EditableDocument,
    EditablePart, EditableSection, GeoAdvisor, IdeaCategory, MediaLibrary, ReleaseScope,
    MarkdownTranslationRequest, OpenAiApiKey, OpenAiMarkdownTranslator, SaveLifecycleInput,
    SaveMetadataInput, SaveTranslationInput, StatsCache, StatsError, WebsiteInsights,
    WorkspaceContent,
};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_MOMENTS_BACKGROUND_POSITION: &str = "center 42%";
const DEFAULT_MOMENTS_COVER_HEIGHT_PX: u16 = 420;

#[derive(Debug, Clone)]
struct MomentsUiConfig {
    profile_alignment: String,
    background_image: Option<String>,
    background_position: String,
    cover_height_px: u16,
}

impl Default for MomentsUiConfig {
    fn default() -> Self {
        Self {
            profile_alignment: "right".to_owned(),
            background_image: None,
            background_position: DEFAULT_MOMENTS_BACKGROUND_POSITION.to_owned(),
            cover_height_px: DEFAULT_MOMENTS_COVER_HEIGHT_PX,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct ProjectConfig {
    project: Option<ProjectSection>,
    database: Option<DatabaseConfig>,
    desktop: Option<DesktopConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct ProjectSection {
    content_dir: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct DatabaseConfig {
    path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct DesktopConfig {
    moments: Option<MomentsConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct MomentsConfig {
    profile_alignment: Option<String>,
    background_image: Option<String>,
    background_position: Option<String>,
    cover_height_px: Option<u16>,
}

pub(crate) struct DesktopWorkspace {
    db_path: PathBuf,
    content_root: PathBuf,
    /// Deployed API base URL, when `[deploy]` is configured — used to
    /// absolutize server-relative media paths (`/api/v1/media?f=…`) so the
    /// Tauri webview can load cover images. `None` degrades to no covers.
    media_base: Option<String>,
    website_insights: WebsiteInsights,
    content: ContentEditor,
    creator: ContentCreator,
    workspace_content: WorkspaceContent,
    media_library: MediaLibrary,
    geo_advisor: GeoAdvisor,
    delivery_control: DeliveryControl,
}

impl DesktopWorkspace {
    pub(crate) fn from_environment() -> Result<Self, String> {
        let workspace = DesktopWorkspacePaths::resolve()?;
        let db_path = workspace.db_path;
        let content_root = workspace.content_root;
        Ok(Self {
            website_insights: WebsiteInsights::open(&content_root, &db_path)
                .map_err(|error| error.to_string())?,
            content: ContentEditor::open(&content_root).map_err(|error| error.to_string())?,
            creator: ContentCreator::open(&content_root).map_err(|error| error.to_string())?,
            workspace_content: WorkspaceContent::open(&content_root)
                .map_err(|error| error.to_string())?,
            media_library: MediaLibrary::open(&content_root).map_err(|error| error.to_string())?,
            geo_advisor: GeoAdvisor::open(&content_root, &db_path)
                .map_err(|error| error.to_string())?,
            delivery_control: DeliveryControl::open(
                &content_root,
                &db_path,
                content_root.parent().unwrap_or(&content_root),
            )
            .map_err(|error| error.to_string())?,
            media_base: api_base_url(&content_root).ok(),
            db_path,
            content_root,
        })
    }

    pub(crate) fn dashboard(&self) -> Result<DashboardData, String> {
        let snapshot = self
            .website_insights
            .dashboard_snapshot()
            .map_err(|error| error.to_string())?;
        Ok(DashboardData {
            total_views: snapshot.stats.views,
            total_likes: snapshot.stats.likes,
            total_comments: snapshot.comments.total,
            pending_comments: snapshot.comments.pending,
            human_interactions: snapshot.stats.human_interactions,
            crawler_interactions: snapshot.crawlers.total,
            ai_crawler_interactions: snapshot.crawlers.ai,
            search_crawler_interactions: snapshot.crawlers.search,
            recent_items: snapshot
                .recent_content
                .into_iter()
                .map(|item| DashboardItem {
                    entity_type: item.content_type,
                    title: item.title,
                    slug: item.slug,
                    status: item.status,
                    visibility: item.visibility,
                    updated_at: item.updated_at,
                })
                .collect(),
            deployed_views: snapshot.stats.views,
            deployed_likes: snapshot.stats.likes,
            deployed_comments: snapshot.stats.comments,
            deployed_human_interactions: snapshot.stats.human_interactions,
            deployed_ai_crawler_interactions: snapshot.crawlers.ai,
            deployed_search_crawler_interactions: snapshot.crawlers.search,
            deployed_ai_chat_referrals: snapshot.ai_referrals.visits,
            stats_synced_at: snapshot.freshness.synced_at,
            today_visits: snapshot.traffic.today_visits,
            daily_visits: map_daily_traffic(snapshot.traffic.daily_visits),
            daily_seo_visits: map_daily_traffic(snapshot.traffic.daily_seo_visits),
            daily_geo_visits: map_daily_traffic(snapshot.traffic.daily_geo_visits),
            top_content: snapshot
                .traffic
                .top_content
                .into_iter()
                .map(|item| TopContentItem {
                    content_type: item.content_type,
                    title: item.title,
                    views: item.views,
                })
                .collect(),
            top_sources: snapshot
                .traffic
                .top_sources
                .into_iter()
                .map(|source| TrafficSource {
                    source: source.source,
                    visits: source.visits,
                })
                .collect(),
            top_countries: snapshot
                .traffic
                .top_countries
                .into_iter()
                .map(|country| TrafficCountry {
                    country_code: country.country_code,
                    city: country.city,
                    latitude: country.latitude,
                    longitude: country.longitude,
                    ip_addresses: country.ip_addresses,
                    visits: country.visits,
                })
                .collect(),
        })
    }

    pub(crate) fn moments_settings(&self) -> Result<MomentsSettings, String> {
        let config = self.read_moments_config()?;
        let profile = self.resume_profile("en")?.profile;
        let display_name = non_empty_or(&profile.full_name, "Profile");
        let avatar_url = self.resolve_media_reference(&profile.avatar_url);
        let background_image_url = config
            .background_image
            .as_deref()
            .and_then(|reference| self.resolve_media_reference(reference));

        Ok(MomentsSettings {
            profile: MomentsProfile {
                avatar_label: avatar_label(&display_name),
                avatar_url,
                display_name,
                alignment: config.profile_alignment,
            },
            cover: MomentsCover {
                background_image_url,
                background_position: config.background_position,
                cover_height_px: config.cover_height_px,
            },
        })
    }

    /// Pull one coherent full-site snapshot from the deployed server.
    pub(crate) fn sync_stats(&self) -> Result<StatsSyncReport, String> {
        let result = self
            .website_insights
            .sync_remote_stats()
            .map_err(|error| error.to_string())?;
        let snapshot = self
            .website_insights
            .dashboard_snapshot()
            .map_err(|error| error.to_string())?;
        Ok(StatsSyncReport {
            synced: result.item_count as i64,
            failed: 0,
            stats: DeployedStats {
                views: snapshot.stats.views,
                likes: snapshot.stats.likes,
                comments: snapshot.stats.comments,
                human_interactions: snapshot.stats.human_interactions,
                ai_crawler_interactions: snapshot.crawlers.ai,
                search_crawler_interactions: snapshot.crawlers.search,
                ai_chat_referrals: snapshot.ai_referrals.visits,
                synced_at: snapshot.freshness.synced_at,
            },
        })
    }

    pub(crate) fn version_status(&self, scope: &str) -> Result<VersionStatus, String> {
        let status = self
            .delivery_control
            .scope_status(ReleaseScope::parse(scope).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        Ok(map_version_status(status))
    }

    pub(crate) fn release_scope(&self, scope: &str) -> Result<VersionStatus, String> {
        let status = self
            .delivery_control
            .release_scope(ReleaseScope::parse(scope).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        Ok(map_version_status(status))
    }

    pub(crate) fn deployment_plan(&self) -> Result<DeploymentPlan, String> {
        let plan = self
            .delivery_control
            .deployment_plan()
            .map_err(|error| error.to_string())?;
        Ok(DeploymentPlan {
            branch: plan.branch,
            head: plan.head,
            deploy_target: plan
                .deploy_target
                .unwrap_or_else(|| "No deployed API target configured".to_owned()),
            dirty_count: plan.dirty_count,
            media_asset_count: plan.media_asset_count,
            next_action: plan.next_action,
            commit_activity: plan
                .commit_activity
                .into_iter()
                .map(|day| CommitActivityDay {
                    date: day.date,
                    commit_count: day.commit_count,
                    scopes: day
                        .scopes
                        .into_iter()
                        .map(|scope| scope.id().to_owned())
                        .collect(),
                })
                .collect(),
            scopes: plan
                .scopes
                .into_iter()
                .map(|scope| DeploymentScopeStatus {
                    scope: scope.scope.id().to_owned(),
                    scope_label: scope.scope_label,
                    dirty_count: scope.dirty_count,
                    clean: scope.dirty_count == 0,
                })
                .collect(),
        })
    }

    pub(crate) fn delivery_sync_status(&self) -> Result<DeliverySyncStatus, String> {
        let status = self
            .delivery_control
            .sync_status()
            .map_err(|error| error.to_string())?;
        Ok(DeliverySyncStatus {
            local_head: status.local_head,
            remote_head: status.remote_head,
            local_commits: status.local_commits,
            remote_commits: status.remote_commits,
            workspace_changes: status.workspace_changes,
            state: status.state,
        })
    }

    pub(crate) fn workspace_changes(&self) -> Result<Vec<WorkspaceFileChange>, String> {
        self.delivery_control
            .workspace_changes()
            .map(|changes| {
                changes
                    .into_iter()
                    .map(|change| WorkspaceFileChange {
                        path: change.path,
                        status: change.status,
                        staged: change.staged,
                        unstaged: change.unstaged,
                    })
                    .collect()
            })
            .map_err(|error| error.to_string())
    }

    pub(crate) fn workspace_file_diff(&self, path: &str, staged: bool) -> Result<String, String> {
        self.delivery_control
            .file_diff(path, staged)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn stage_workspace_paths(&self, paths: &[String]) -> Result<(), String> {
        self.delivery_control
            .stage_paths(paths)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn unstage_workspace_paths(&self, paths: &[String]) -> Result<(), String> {
        self.delivery_control
            .unstage_paths(paths)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn commit_workspace(&self, message: &str) -> Result<DeliverySyncStatus, String> {
        self.delivery_control
            .commit_workspace(message)
            .map_err(|error| error.to_string())?;
        self.delivery_sync_status()
    }

    pub(crate) fn deploy_content(&self) -> Result<DeployRunStatus, String> {
        let status = self
            .delivery_control
            .deploy_content()
            .map_err(|error| error.to_string())?;
        Ok(DeployRunStatus {
            success: status.success,
            content_commit: status.content_commit,
            stdout: status.stdout,
            stderr: status.stderr,
        })
    }

    pub(crate) fn verify_remote(&self) -> Result<DeployVerificationResult, String> {
        let result = self
            .delivery_control
            .verify_remote()
            .map_err(|error| error.to_string())?;
        Ok(DeployVerificationResult {
            verified: result.verified,
            expected_content_commit: result.expected_content_commit,
            remote: RemoteContentVersion {
                health: result.remote.health,
                content_hash: result.remote.content_hash,
                content_commit: result.remote.content_commit,
                generated_at: result.remote.generated_at,
                media_root_ok: result.remote.media_root_ok,
            },
            mismatch_reason: result.mismatch_reason,
        })
    }

    pub(crate) fn list_documents(&self) -> Result<Vec<EditorDocument>, String> {
        let stats = ContentEngagementSnapshot::read(&self.db_path);
        Ok(self
            .workspace_content
            .editable_documents()
            .map_err(|error| error.to_string())?
            .into_iter()
            .flat_map(|document| map_editable_document(document, &stats))
            .collect())
    }

    pub(crate) fn entity_counts(&self) -> Result<Vec<EntityCount>, String> {
        Ok(self
            .workspace_content
            .entity_counts()
            .map_err(|error| error.to_string())?
            .into_iter()
            .map(|count| EntityCount {
                entity_type: count.content_type,
                count: count.count as i64,
            })
            .collect())
    }

    pub(crate) fn resume_sections(&self, language: &str) -> Result<Vec<ResumeSection>, String> {
        self.workspace_content
            .editable_sections(ContentKind::Resume, language)
            .map(|sections| self.map_resume_sections(sections))
            .map_err(|error| error.to_string())
    }

    pub(crate) fn episode_series_source(
        &self,
        series_slug: &str,
    ) -> Result<EpisodeSeriesSource, String> {
        let source = self
            .content
            .read_episode_series_metadata(series_slug)
            .map_err(|error| error.to_string())?;
        let cover_media = self.resolve_media_reference(&source.cover_url);
        Ok(EpisodeSeriesSource {
            slug: source.slug,
            title: source.title,
            description: source.description,
            cover_url: source.cover_url,
            cover_media,
            status: source.status,
            revision: source.revision,
            relative_path: source.relative_path,
        })
    }

    pub(crate) fn save_episode_series(
        &self,
        series_slug: &str,
        input: &EpisodeSeriesInput,
        expected_revision: &str,
    ) -> Result<EpisodeSeriesSource, String> {
        let saved = self
            .content
            .save_episode_series_metadata_and_sync(
                series_slug,
                input.title.trim(),
                input.description.trim(),
                input.cover_url.trim(),
                input.status.trim(),
                expected_revision,
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        let cover_media = self.resolve_media_reference(&saved.cover_url);
        Ok(EpisodeSeriesSource {
            slug: saved.slug,
            title: saved.title,
            description: saved.description,
            cover_url: saved.cover_url,
            cover_media,
            status: saved.status,
            revision: saved.revision,
            relative_path: saved.relative_path,
        })
    }

    pub(crate) fn resume_part_source(
        &self,
        role: &str,
        language: &str,
    ) -> Result<ResumePartSource, String> {
        let source = self
            .content
            .read_resume_part(role, language)
            .map_err(|error| error.to_string())?;
        Ok(ResumePartSource {
            role: role.to_owned(),
            language: language.to_owned(),
            revision: source.revision,
            relative_path: source.relative_path,
        })
    }

    pub(crate) fn resume_profile(&self, language: &str) -> Result<ResumeProfileSource, String> {
        let source = self
            .content
            .read_resume_profile(language)
            .map_err(|error| error.to_string())?;
        Ok(ResumeProfileSource {
            language: language.to_owned(),
            revision: source.revision,
            relative_path: source.relative_path,
            profile: parse_resume_profile(&source.frontmatter)?,
            summary: source.body,
        })
    }

    pub(crate) fn save_resume_profile(
        &self,
        language: &str,
        profile: &ResumeProfile,
        expected_revision: &str,
    ) -> Result<ResumeProfileSource, String> {
        let current = self
            .content
            .read_resume_profile(language)
            .map_err(|error| error.to_string())?;
        let frontmatter = serialize_resume_profile(&current.frontmatter, profile)?;
        let saved = self
            .content
            .save_resume_profile_and_sync(
                language,
                &frontmatter,
                &current.body,
                expected_revision,
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        Ok(ResumeProfileSource {
            language: language.to_owned(),
            revision: saved.revision,
            relative_path: saved.relative_path,
            profile: parse_resume_profile(&saved.frontmatter)?,
            summary: saved.body,
        })
    }

    pub(crate) fn save_resume_summary(
        &self,
        language: &str,
        summary: &str,
        expected_revision: &str,
    ) -> Result<ResumeProfileSource, String> {
        let current = self
            .content
            .read_resume_profile(language)
            .map_err(|error| error.to_string())?;
        let saved = self
            .content
            .save_resume_profile_and_sync(
                language,
                &current.frontmatter,
                summary,
                expected_revision,
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        Ok(ResumeProfileSource {
            language: language.to_owned(),
            revision: saved.revision,
            relative_path: saved.relative_path,
            profile: parse_resume_profile(&saved.frontmatter)?,
            summary: saved.body,
        })
    }

    /// Replace one structured Resume part (a section's blocks) for one
    /// language: serialize the submitted entries back to the part's TOML
    /// shape, save atomically with the engine's sync/rollback discipline,
    /// then return the refreshed sections for the same language.
    pub(crate) fn save_resume_entries(
        &self,
        role: &str,
        language: &str,
        shape: &str,
        entries: &[ResumeEntryInput],
        expected_revision: &str,
    ) -> Result<Vec<ResumeSection>, String> {
        let content = serialize_resume_part(role, shape, entries)?;
        self.content
            .save_resume_part_and_sync(role, language, &content, expected_revision, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.workspace_content
            .editable_sections(ContentKind::Resume, language)
            .map(|sections| self.map_resume_sections(sections))
            .map_err(|error| error.to_string())
    }

    pub(crate) fn save_document(
        &self,
        translation_id: &str,
        body: &str,
        expected_revision: &str,
    ) -> Result<EditorDocument, String> {
        let saved = self
            .workspace_content
            .save_translation(
                &SaveTranslationInput {
                    translation_id: translation_id.to_owned(),
                    content: body.to_owned(),
                    expected_revision: expected_revision.to_owned(),
                },
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        let engagement = ContentEngagementSnapshot::read(&self.db_path);
        map_editable_document(saved, &engagement)
            .into_iter()
            .find(|part| {
                part.translations
                    .iter()
                    .any(|value| value.id == translation_id)
            })
            .ok_or_else(|| format!("saved translation `{translation_id}` was not returned"))
    }

    pub(crate) fn generate_missing_translation(
        &self,
        part_id: &str,
        target_language: &str,
        source_language: Option<&str>,
        api_key: &str,
    ) -> Result<EditorDocument, String> {
        let target_language = target_language.trim();
        if target_language.is_empty() {
            return Err("Target language is required.".to_owned());
        }
        let (document, part) = self
            .workspace_content
            .document_for_part(part_id)
            .map_err(|error| error.to_string())?;
        if part
            .translations
            .iter()
            .any(|translation| translation.language == target_language)
        {
            return Err(format!("`{target_language}` already exists for this Part."));
        }
        let source = source_language
            .and_then(|language| {
                part.translations
                    .iter()
                    .find(|translation| translation.language == language)
            })
            .or_else(|| {
                part.translations
                    .iter()
                    .find(|translation| translation.language == part.canonical_language)
            })
            .or_else(|| part.translations.first())
            .ok_or_else(|| "This Part has no source language to translate from.".to_owned())?;
        if source.content.trim().is_empty() {
            return Err(format!(
                "`{}` is empty; write source content before generating `{target_language}`.",
                source.language
            ));
        }

        let api_key = OpenAiApiKey::parse(api_key.to_owned()).map_err(|error| error.to_string())?;
        let model = env::var("SILAN_OPENAI_TRANSLATION_MODEL").unwrap_or_else(|_| "gpt-5".to_owned());
        let translator = OpenAiMarkdownTranslator::new("https://api.openai.com", model);
        let generated = translator
            .translate(
                &api_key,
                &MarkdownTranslationRequest {
                    source_language: source.language.clone(),
                    target_language: target_language.to_owned(),
                    title: document.title.clone(),
                    body: source.content.clone(),
                },
            )
            .map_err(|error| error.to_string())?;

        let saved = self
            .workspace_content
            .create_translation(
                &CreateTranslationInput {
                    part_id: part_id.to_owned(),
                    language: target_language.to_owned(),
                    title: generated.title,
                    body: generated.body,
                },
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        let engagement = ContentEngagementSnapshot::read(&self.db_path);
        map_editable_document(saved, &engagement)
            .into_iter()
            .find(|part| part.part_id == part_id)
            .ok_or_else(|| format!("generated translation for `{part_id}` was not returned"))
    }

    pub(crate) fn import_media_asset(
        &self,
        translation_id: &str,
        source_path: &str,
    ) -> Result<ImportedMediaAsset, String> {
        let (document, _, _) = self
            .workspace_content
            .translation(translation_id)
            .map_err(|error| error.to_string())?;
        let asset = self
            .media_library
            .import_asset(&document.id, source_path)
            .map_err(|error| error.to_string())?;
        let local_path = self
            .media_library
            .resolve_local_reference(&asset.uri)
            .ok()
            .map(|path| path.to_string_lossy().to_string());
        Ok(ImportedMediaAsset {
            markdown: asset.markdown,
            uri: asset.uri,
            relative_path: asset.relative_path,
            file_name: asset.file_name,
            byte_count: asset.byte_count,
            local_path,
        })
    }

    pub(crate) fn import_resume_media_asset(
        &self,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<ImportedMediaAsset, String> {
        self.import_asset_into("resume/assets", file_name, bytes)
    }

    pub(crate) fn import_episode_series_media_asset(
        &self,
        series_slug: &str,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<ImportedMediaAsset, String> {
        self.import_asset_into(&format!("episode/{series_slug}/assets"), file_name, bytes)
    }

    fn import_asset_into(
        &self,
        relative_dir: &str,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<ImportedMediaAsset, String> {
        let extension = Path::new(file_name)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .ok_or_else(|| "media file must have an extension".to_owned())?;
        const SUPPORTED_EXTENSIONS: &[&str] = &[
            "png", "jpg", "jpeg", "gif", "svg", "webp", "avif", "ico",
        ];
        if !SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
            return Err(format!("unsupported media extension `{extension}`"));
        }

        let stem = sanitize_asset_stem(
            Path::new(file_name)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("asset"),
        );
        let assets_dir = self.content_root.join("resources").join(relative_dir);
        fs::create_dir_all(&assets_dir)
            .map_err(|error| format!("cannot create `{}`: {error}", assets_dir.display()))?;

        let mut target = assets_dir.join(format!("{stem}.{extension}"));
        let mut suffix = 2usize;
        while target.exists() {
            target = assets_dir.join(format!("{stem}-{suffix}.{extension}"));
            suffix += 1;
        }
        fs::write(&target, bytes)
            .map_err(|error| format!("cannot write `{}`: {error}", target.display()))?;

        let file_name = target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("asset")
            .to_owned();
        let relative_path = format!("{relative_dir}/{file_name}");
        let uri = format!("silan://resources/{relative_path}");
        Ok(ImportedMediaAsset {
            markdown: format!("![{}]({uri})", alt_text_for_asset(&file_name)),
            uri,
            relative_path,
            file_name,
            byte_count: bytes.len() as u64,
            local_path: Some(target.to_string_lossy().to_string()),
        })
    }

    pub(crate) fn geo_insights(&self, translation_id: &str) -> Result<GeoInsightReport, String> {
        let report = self
            .geo_advisor
            .analyze_translation(translation_id)
            .map_err(|error| error.to_string())?;
        Ok(GeoInsightReport {
            document_id: report.document_id,
            translation_id: report.translation_id,
            title: report.title,
            language: report.language,
            score: report.score,
            grade: report.grade,
            summary: report.summary,
            metrics: report
                .metrics
                .into_iter()
                .map(|metric| GeoMetric {
                    label: metric.label,
                    value: metric.value,
                    detail: metric.detail,
                    evidence: metric.evidence.into_iter().map(map_geo_evidence).collect(),
                })
                .collect(),
            actions: report
                .actions
                .into_iter()
                .map(|action| GeoAction {
                    priority: action.priority,
                    label: action.label,
                    detail: action.detail,
                    evidence: action.evidence.into_iter().map(map_geo_evidence).collect(),
                })
                .collect(),
        })
    }

    pub(crate) fn save_document_state(
        &self,
        translation_id: &str,
        state: DocumentStateInput,
        expected_revision: &str,
    ) -> Result<EditorDocument, String> {
        let (current, _, _) = self
            .workspace_content
            .translation(translation_id)
            .map_err(|error| error.to_string())?;
        validate_document_state(&current.content_type, &state)?;
        let saved = self
            .workspace_content
            .save_lifecycle(
                &SaveLifecycleInput {
                    translation_id: translation_id.to_owned(),
                    status: state.status,
                    visibility: state.visibility,
                    pinned: state.pinned,
                    expected_revision: expected_revision.to_owned(),
                },
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        let engagement = ContentEngagementSnapshot::read(&self.db_path);
        map_editable_document(saved, &engagement)
            .into_iter()
            .find(|part| {
                part.translations
                    .iter()
                    .any(|value| value.id == translation_id)
            })
            .ok_or_else(|| format!("saved translation `{translation_id}` was not returned"))
    }

    pub(crate) fn save_content_metadata(
        &self,
        translation_id: &str,
        metadata: ContentMetadataInput,
        expected_revision: &str,
    ) -> Result<EditorDocument, String> {
        if metadata.title.trim().is_empty() {
            return Err("Content title is required.".to_owned());
        }
        let saved = self
            .workspace_content
            .save_metadata(
                &SaveMetadataInput {
                    translation_id: translation_id.to_owned(),
                    title: metadata.title,
                    description: metadata.description,
                    cover_url: metadata.cover_url,
                    expected_revision: expected_revision.to_owned(),
                },
                &self.db_path,
            )
            .map_err(|error| error.to_string())?;
        let engagement = ContentEngagementSnapshot::read(&self.db_path);
        map_editable_document(saved, &engagement)
            .into_iter()
            .find(|part| {
                part.translations
                    .iter()
                    .any(|value| value.id == translation_id)
            })
            .ok_or_else(|| format!("saved metadata `{translation_id}` was not returned"))
    }

    pub(crate) fn save_engagement_stats(
        &self,
        entity_type: &str,
        entity_id: &str,
        stats: EngagementStatsInput,
    ) -> Result<EngagementStats, String> {
        if stats.likes < 0 || stats.comments < 0 {
            return Err("Reaction counters cannot be negative.".to_owned());
        }
        let saved = StatsCache::open(&self.db_path)
            .save_item_engagement(entity_type, entity_id, stats.likes, stats.comments)
            .map_err(|error| error.to_string())?;
        Ok(EngagementStats {
            likes: saved.likes,
            comments: saved.comments,
        })
    }

    pub(crate) fn capture_blog(
        &self,
        draft: &str,
        category: &str,
    ) -> Result<EditorDocument, String> {
        let category = IdeaCategory::parse(category).map_err(|error| error.to_string())?;
        let captured = self
            .creator
            .capture_blog_and_sync(draft, category, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.document_for_part(&captured.part_id)
    }

    pub(crate) fn capture_moment(&self, event: &str) -> Result<EditorDocument, String> {
        let captured = self
            .creator
            .capture_moment_and_sync(event, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.document_for_part(&captured.part_id)
    }

    pub(crate) fn create_project(&self, title: &str) -> Result<EditorDocument, String> {
        let captured = self
            .creator
            .capture_project_and_sync(title, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.document_for_part(&captured.part_id)
    }

    fn document_for_part(&self, part_id: &str) -> Result<EditorDocument, String> {
        let (document, _) = WorkspaceContent::open(&self.content_root)
            .map_err(|error| error.to_string())?
            .document_for_part(part_id)
            .map_err(|error| error.to_string())?;
        let engagement = ContentEngagementSnapshot::read(&self.db_path);
        map_editable_document(document, &engagement)
            .into_iter()
            .find(|part| part.part_id == part_id)
            .ok_or_else(|| format!("captured part `{part_id}` was not returned"))
    }

    fn resolve_media_reference(&self, reference: &str) -> Option<String> {
        let reference = reference.trim();
        if reference.is_empty() {
            return None;
        }
        if reference.starts_with("http://") || reference.starts_with("https://") {
            return Some(reference.to_owned());
        }
        if reference.starts_with("/api/v1/media?f=") {
            if let Ok(local) = self.media_library.resolve_local_reference(reference) {
                return Some(local.to_string_lossy().to_string());
            }
            return self
                .media_base
                .as_ref()
                .map(|base| format!("{base}{reference}"));
        }
        if reference.starts_with('/') {
            return self
                .media_base
                .as_ref()
                .map(|base| format!("{base}{reference}"));
        }

        self.media_library
            .resolve_local_reference(reference)
            .ok()
            .map(|path| path.to_string_lossy().to_string())
    }

    fn map_resume_sections(&self, sections: Vec<EditableSection>) -> Vec<ResumeSection> {
        sections
            .into_iter()
            .map(|section| ResumeSection {
                role: section.role,
                shape: section.shape,
                canonical_language: section.canonical_language,
                entries: section
                    .entries
                    .into_iter()
                    .map(|entry| {
                        let media = self.resume_entry_media(&entry.shared, &entry.localized);
                        crate::model::ResumeEntry {
                            entry_id: entry.id,
                            sort_order: entry.sort_order as i64,
                            shared: entry.shared,
                            localized: entry.localized,
                            media,
                        }
                    })
                    .collect(),
            })
            .collect()
    }

    fn resume_entry_media(
        &self,
        shared: &serde_json::Value,
        localized: &serde_json::Value,
    ) -> BTreeMap<String, String> {
        const MEDIA_FIELDS: &[&str] = &[
            "institution_logo_url",
            "company_logo_url",
            "image_url",
            "cover_url",
        ];
        let mut media = BTreeMap::new();
        for field in MEDIA_FIELDS {
            let value = json_text(shared, field).or_else(|| json_text(localized, field));
            if let Some(resolved) = value.and_then(|reference| self.resolve_media_reference(reference)) {
                media.insert((*field).to_owned(), resolved);
            }
        }
        media
    }

    fn read_moments_config(&self) -> Result<MomentsUiConfig, String> {
        let config_path = project_config_path(&self.content_root);
        if !config_path.is_file() {
            return Ok(MomentsUiConfig::default());
        }

        let project_root = self.content_root.parent().unwrap_or(&self.content_root);
        let project = read_project_config(project_root)?;
        let Some(moments) = project.desktop.and_then(|desktop| desktop.moments) else {
            return Ok(MomentsUiConfig::default());
        };

        let mut config = MomentsUiConfig::default();
        if let Some(alignment) = moments.profile_alignment {
            let alignment = alignment.trim().to_owned();
            if alignment != "left" && alignment != "right" {
                return Err(format!(
                    "`desktop.moments.profile_alignment` must be `left` or `right`, got `{alignment}`",
                ));
            }
            config.profile_alignment = alignment;
        }
        if let Some(background_image) = moments.background_image {
            let background_image = background_image.trim().to_owned();
            if !background_image.is_empty() {
                config.background_image = Some(background_image);
            }
        }
        if let Some(background_position) = moments.background_position {
            let background_position = background_position.trim().to_owned();
            if !background_position.is_empty() {
                config.background_position = background_position;
            }
        }
        if let Some(cover_height_px) = moments.cover_height_px {
            if !(240..=720).contains(&cover_height_px) {
                return Err(format!(
                    "`desktop.moments.cover_height_px` must be between 240 and 720, got {cover_height_px}",
                ));
            }
            config.cover_height_px = cover_height_px;
        }
        Ok(config)
    }
}

#[derive(Debug, Clone)]
struct DesktopWorkspacePaths {
    content_root: PathBuf,
    db_path: PathBuf,
}

impl DesktopWorkspacePaths {
    fn resolve() -> Result<Self, String> {
        let project_root = env::var("SILAN_DESKTOP_PROJECT")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                env::var("SILAN_DESKTOP_CONTENT")
                    .ok()
                    .map(PathBuf::from)
                    .and_then(|content| content.parent().map(Path::to_path_buf))
            })
            .or_else(|| find_project_root_from_current_dir().ok())
            .ok_or_else(|| {
                "Desktop workspace is not configured; set SILAN_DESKTOP_CONTENT/SILAN_DESKTOP_DB or run from a silan-viking project".to_owned()
            })?;
        let config = read_project_config(&project_root)?;
        let content_root = env::var("SILAN_DESKTOP_CONTENT")
            .ok()
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                let content_dir = config
                    .project
                    .as_ref()
                    .and_then(|section| section.content_dir.as_deref())
                    .unwrap_or("content");
                project_root.join(content_dir)
            });
        let db_path = env::var("SILAN_DESKTOP_DB")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                config
                    .database
                    .as_ref()
                    .and_then(|database| database.path.as_deref())
                    .map(|path| project_root.join(path))
            })
            .ok_or_else(|| {
                format!(
                    "Desktop database is not configured; add [database].path to {} or set SILAN_DESKTOP_DB",
                    project_root.join("silan-viking.toml").display()
                )
            })?;
        Ok(Self {
            content_root,
            db_path,
        })
    }
}

pub(crate) fn desktop_content_root() -> Result<PathBuf, String> {
    DesktopWorkspacePaths::resolve().map(|workspace| workspace.content_root)
}

fn map_daily_traffic(days: Vec<silan_viking_app::DailyTraffic>) -> Vec<DailyTraffic> {
    days.into_iter()
        .map(|day| DailyTraffic {
            date: day.date,
            visits: day.visits,
            content: day
                .content
                .into_iter()
                .map(|item| DailyContentTraffic {
                    content_type: item.content_type,
                    title: item.title,
                    visits: item.visits,
                    comments: item.comments,
                    evidence: item
                        .evidence
                        .into_iter()
                        .map(|evidence| TrafficEvidence {
                            agent: evidence.agent,
                            event: evidence.event,
                            subject_kind: evidence.subject_kind,
                            subject: evidence.subject,
                            visits: evidence.visits,
                        })
                        .collect(),
                    visitors: item
                        .visitors
                        .into_iter()
                        .map(|visitor| VisitorLocation {
                            country_code: visitor.country_code,
                            city: visitor.city,
                            latitude: visitor.latitude,
                            longitude: visitor.longitude,
                            ip_addresses: visitor.ip_addresses,
                            visits: visitor.visits,
                        })
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

fn project_config_path(content_root: &Path) -> PathBuf {
    content_root
        .parent()
        .map(|project_root| project_root.join("silan-viking.toml"))
        .unwrap_or_else(|| content_root.join("silan-viking.toml"))
}

fn read_project_config(project_root: &Path) -> Result<ProjectConfig, String> {
    let config_path = project_root.join("silan-viking.toml");
    let text = fs::read_to_string(&config_path)
        .map_err(|error| format!("cannot read `{}`: {error}", config_path.display()))?;
    toml::from_str(&text)
        .map_err(|error| format!("cannot parse `{}`: {error}", config_path.display()))
}

fn find_project_root_from_current_dir() -> Result<PathBuf, String> {
    let mut cursor =
        env::current_dir().map_err(|error| format!("cannot read current directory: {error}"))?;
    loop {
        if cursor.join("silan-viking.toml").is_file() {
            return Ok(cursor);
        }
        if !cursor.pop() {
            return Err("no silan-viking.toml found above current directory".to_owned());
        }
    }
}

fn non_empty_or(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_owned()
    } else {
        value.to_owned()
    }
}

fn json_text<'a>(value: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    value
        .as_object()
        .and_then(|map| map.get(key))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

fn sanitize_asset_stem(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if matches!(ch, '-' | '_' | '.') {
            out.push(ch);
        } else if ch.is_whitespace() {
            out.push('-');
        }
    }
    let out = out.trim_matches(['-', '_', '.']).to_owned();
    if out.is_empty() {
        "asset".to_owned()
    } else {
        out
    }
}

fn alt_text_for_asset(file_name: &str) -> String {
    Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asset")
        .replace(['-', '_'], " ")
}

fn avatar_label(display_name: &str) -> String {
    display_name
        .split_whitespace()
        .find_map(|part| part.chars().next())
        .unwrap_or('P')
        .to_string()
}

struct ContentEngagementSnapshot {
    cache: StatsCache,
}

impl ContentEngagementSnapshot {
    fn read(db_path: &Path) -> Self {
        Self {
            cache: StatsCache::open(db_path),
        }
    }

    fn item(&self, entity_type: &str, entity_id: &str) -> EngagementStats {
        match self.cache.item(entity_type, entity_id) {
            Ok(stats) => EngagementStats {
                likes: stats.likes,
                comments: stats.comments,
            },
            Err(StatsError::NotSynced(_)) => EngagementStats::default(),
            Err(_) => EngagementStats::default(),
        }
    }
}

fn map_editable_document(
    document: EditableDocument,
    engagement: &ContentEngagementSnapshot,
) -> Vec<EditorDocument> {
    let EditableDocument {
        item_id,
        content_type,
        slug,
        title,
        description,
        series_slug,
        episode_number,
        status,
        visibility,
        updated_at,
        cover_uri,
        date,
        pinned,
        parts,
        ..
    } = document;
    let item_engagement = engagement.item(&content_type, &item_id);
    parts
        .into_iter()
        .map(|part| {
            let EditablePart {
                id,
                role,
                canonical_language,
                translations,
                ..
            } = part;
            EditorDocument {
                id: id.clone(),
                part_id: id,
                entity_type: content_type.clone(),
                entity_id: item_id.clone(),
                series_id: series_slug.clone(),
                series_slug: series_slug.clone(),
                series_title: None,
                series_description: None,
                series_cover_url: None,
                episode_number,
                slug: slug.clone(),
                role,
                canonical_language,
                title: title.clone(),
                description: description.clone(),
                status: status.clone(),
                visibility: visibility.clone(),
                date: date.clone(),
                pinned,
                updated_at: updated_at.clone(),
                cover_url: cover_uri.clone(),
                engagement: item_engagement.clone(),
                translations: translations
                    .into_iter()
                    .map(|translation| EditorTranslation {
                        id: translation.id,
                        language: translation.language,
                        content: translation.content,
                        revision: translation.source_revision.0,
                        source_path: translation.source_path,
                    })
                    .collect(),
            }
        })
        .collect()
}

fn map_geo_evidence(evidence: silan_viking_app::GeoEvidence) -> GeoEvidence {
    let source = match evidence.source {
        silan_viking_app::GeoEvidenceSource::SourceContent => "source_content",
        silan_viking_app::GeoEvidenceSource::RemoteStats => "remote_stats",
        silan_viking_app::GeoEvidenceSource::AiCrawler => "ai_crawler",
        silan_viking_app::GeoEvidenceSource::AiReferral => "ai_referral",
        silan_viking_app::GeoEvidenceSource::LlmInference => "llm_inference",
    };
    GeoEvidence {
        source: source.to_owned(),
        detail: evidence.detail,
    }
}

fn map_version_status(status: silan_viking_app::ScopeReleaseStatus) -> VersionStatus {
    VersionStatus {
        scope: status.scope.id().to_owned(),
        scope_label: status.scope_label,
        branch: status.branch,
        head: status.head,
        dirty_count: status.dirty_count,
        changes: status
            .changes
            .into_iter()
            .map(|change| VersionChange {
                status: change.status,
                path: change.path,
            })
            .collect(),
        recent_commits: status
            .recent_commits
            .into_iter()
            .map(|commit| VersionCommit {
                hash: commit.hash,
                subject: commit.subject,
                relative_time: commit.relative_time,
            })
            .collect(),
    }
}

/// Serialize block-editor entries back into the on-disk TOML shape:
/// `[[entry]]` array-of-tables for `entry_list` parts, a top-level
/// identity-bearing `[[entry]]` tables for `key_value_list` parts.
fn serialize_resume_part(
    role: &str,
    shape: &str,
    entries: &[ResumeEntryInput],
) -> Result<String, String> {
    let header = format!("# Resume — {role} ({shape}). Managed by Silan Context System.\n\n");
    match shape {
        "entry_list" => {
            let mut list = toml::value::Array::new();
            for entry in entries {
                let mut table = toml::map::Map::new();
                table.insert(
                    "entry_id".to_owned(),
                    toml::Value::String(entry.entry_id.clone()),
                );
                for (key, value) in &entry.fields {
                    if key == "entry_id" {
                        continue;
                    }
                    if let Some(converted) = json_to_toml(value)? {
                        table.insert(key.clone(), converted);
                    }
                }
                list.push(toml::Value::Table(table));
            }
            let mut root = toml::map::Map::new();
            root.insert("entry".to_owned(), toml::Value::Array(list));
            let body = toml::to_string(&toml::Value::Table(root))
                .map_err(|error| format!("cannot serialize `{role}` entries: {error}"))?;
            Ok(format!("{header}{body}"))
        }
        "key_value_list" => {
            let mut list = toml::value::Array::new();
            for entry in entries {
                let mut table = toml::map::Map::new();
                table.insert(
                    "entry_id".to_owned(),
                    toml::Value::String(entry.entry_id.clone()),
                );
                let category = entry
                    .fields
                    .get("category")
                    .and_then(|value| value.as_str())
                    .unwrap_or(&entry.entry_id)
                    .to_owned();
                table.insert("category".to_owned(), toml::Value::String(category));
                let items = entry
                    .fields
                    .get("items")
                    .map(|value| json_to_toml(value))
                    .transpose()?
                    .flatten()
                    .unwrap_or(toml::Value::Array(Vec::new()));
                table.insert("items".to_owned(), items);
                list.push(toml::Value::Table(table));
            }
            let mut root = toml::map::Map::new();
            root.insert("entry".to_owned(), toml::Value::Array(list));
            let body = toml::to_string(&toml::Value::Table(root))
                .map_err(|error| format!("cannot serialize `{role}` categories: {error}"))?;
            Ok(format!("{header}{body}"))
        }
        other => Err(format!("unsupported Resume part shape `{other}`")),
    }
}

/// Convert one block-editor field value to TOML. `null` fields are
/// omitted rather than serialized.
fn json_to_toml(value: &serde_json::Value) -> Result<Option<toml::Value>, String> {
    Ok(match value {
        serde_json::Value::Null => None,
        serde_json::Value::Bool(flag) => Some(toml::Value::Boolean(*flag)),
        serde_json::Value::Number(number) => {
            if let Some(integer) = number.as_i64() {
                Some(toml::Value::Integer(integer))
            } else if let Some(float) = number.as_f64() {
                Some(toml::Value::Float(float))
            } else {
                return Err(format!("unsupported number `{number}`"));
            }
        }
        serde_json::Value::String(text) => Some(toml::Value::String(text.clone())),
        serde_json::Value::Array(items) => {
            let mut list = toml::value::Array::new();
            for item in items {
                if let Some(converted) = json_to_toml(item)? {
                    list.push(converted);
                }
            }
            Some(toml::Value::Array(list))
        }
        serde_json::Value::Object(_) => {
            return Err("nested tables are not supported in Resume entries".to_owned());
        }
    })
}

fn parse_resume_profile(frontmatter: &str) -> Result<ResumeProfile, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(frontmatter)
        .map_err(|error| format!("cannot parse Resume profile frontmatter: {error}"))?;
    let map = value
        .as_mapping()
        .ok_or_else(|| "Resume profile frontmatter is not a YAML mapping".to_owned())?;
    Ok(ResumeProfile {
        full_name: yaml_text(map, "full_name"),
        title: yaml_text(map, "title"),
        current_status: yaml_text(map, "current_status"),
        email: yaml_text(map, "email"),
        phone: yaml_text(map, "phone"),
        location: yaml_text(map, "location"),
        website: yaml_text(map, "website"),
        avatar_url: yaml_text(map, "avatar_url"),
        social_links: yaml_social_links(map),
    })
}

fn serialize_resume_profile(
    existing_frontmatter: &str,
    profile: &ResumeProfile,
) -> Result<String, String> {
    let value: serde_yaml::Value = serde_yaml::from_str(existing_frontmatter)
        .map_err(|error| format!("cannot parse existing Resume profile frontmatter: {error}"))?;
    let mut map = match value {
        serde_yaml::Value::Mapping(map) => map,
        serde_yaml::Value::Null => serde_yaml::Mapping::new(),
        _ => return Err("Resume profile frontmatter is not a YAML mapping".to_owned()),
    };

    put_yaml_text(&mut map, "full_name", &profile.full_name);
    put_yaml_text(&mut map, "title", &profile.title);
    put_yaml_text(&mut map, "current_status", &profile.current_status);
    put_yaml_text(&mut map, "email", &profile.email);
    put_yaml_text(&mut map, "phone", &profile.phone);
    put_yaml_text(&mut map, "location", &profile.location);
    put_yaml_text(&mut map, "website", &profile.website);
    put_yaml_text(&mut map, "avatar_url", &profile.avatar_url);
    put_yaml_social_links(&mut map, &profile.social_links);

    serde_yaml::to_string(&serde_yaml::Value::Mapping(map))
        .map_err(|error| format!("cannot serialize Resume profile frontmatter: {error}"))
}

fn yaml_text(map: &serde_yaml::Mapping, key: &str) -> String {
    map.get(serde_yaml::Value::String(key.to_owned()))
        .and_then(serde_yaml::Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn yaml_social_links(map: &serde_yaml::Mapping) -> Vec<ResumeSocialLink> {
    map.get(serde_yaml::Value::String("social_links".to_owned()))
        .and_then(serde_yaml::Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|value| {
            let map = value.as_mapping()?;
            Some(ResumeSocialLink {
                platform: yaml_text(map, "platform"),
                url: yaml_text(map, "url"),
                display_name: yaml_text(map, "display_name"),
            })
        })
        .collect()
}

fn put_yaml_text(map: &mut serde_yaml::Mapping, key: &str, value: &str) {
    map.insert(
        serde_yaml::Value::String(key.to_owned()),
        serde_yaml::Value::String(value.to_owned()),
    );
}

fn put_yaml_social_links(map: &mut serde_yaml::Mapping, links: &[ResumeSocialLink]) {
    let values = links
        .iter()
        .filter(|link| {
            !link.platform.trim().is_empty()
                || !link.url.trim().is_empty()
                || !link.display_name.trim().is_empty()
        })
        .map(|link| {
            let mut link_map = serde_yaml::Mapping::new();
            put_yaml_text(&mut link_map, "platform", &link.platform);
            put_yaml_text(&mut link_map, "url", &link.url);
            put_yaml_text(&mut link_map, "display_name", &link.display_name);
            serde_yaml::Value::Mapping(link_map)
        })
        .collect();
    map.insert(
        serde_yaml::Value::String("social_links".to_owned()),
        serde_yaml::Value::Sequence(values),
    );
}

fn validate_document_state(kind: &str, state: &DocumentStateInput) -> Result<(), String> {
    let allowed_status = match kind {
        "blog" | "episode" => &["draft", "published", "archived"][..],
        "project" => &["active", "completed", "paused", "cancelled"][..],
        "moment" => &["active", "ongoing", "completed"][..],
        other => return Err(format!("state controls are not supported for `{other}`")),
    };
    if !allowed_status.contains(&state.status.as_str()) {
        return Err(format!(
            "`{}` is not a valid status for `{kind}`",
            state.status
        ));
    }
    if !["private", "unlisted", "public"].contains(&state.visibility.as_str()) {
        return Err(format!("`{}` is not a valid visibility", state.visibility));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_value_writer_preserves_stable_entry_identity() {
        let entries = vec![ResumeEntryInput {
            entry_id: "skill-languages".to_owned(),
            fields: serde_json::Map::from_iter([
                (
                    "category".to_owned(),
                    serde_json::Value::String("编程语言".to_owned()),
                ),
                (
                    "items".to_owned(),
                    serde_json::json!(["Rust", "Go", "Python"]),
                ),
            ]),
        }];

        let source =
            serialize_resume_part("skills", "key_value_list", &entries).expect("serialize skills");
        assert!(source.contains("entry_id = \"skill-languages\""));
        assert!(source.contains("category = \"编程语言\""));
        assert!(!source.contains("\"kv:编程语言\""));
    }
}
