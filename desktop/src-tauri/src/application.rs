//! Thin Tauri-facing adapters over the public `silan-viking-app` use cases.

use crate::model::{
    CommitActivityDay, DailyContentTraffic, DailyTraffic, DashboardData, DashboardItem,
    DeliverySyncStatus, DeployRunStatus, DeployVerificationResult, DeployedStats, DeploymentPlan,
    DeploymentScopeStatus, DocumentStateInput, EditorDocument, EditorTranslation, EntityCount,
    EpisodeSeriesInput, EpisodeSeriesSource, GeoAction, GeoEvidence, GeoInsightReport, GeoMetric,
    ImportedMediaAsset, MomentsCover, MomentsProfile, MomentsSettings, RemoteContentVersion,
    ResumeEntryInput, ResumePartSource, ResumeProfile, ResumeProfileSource, ResumeSection,
    ResumeSocialLink, StatsSyncReport, TopContentItem, TrafficCountry, TrafficEvidence,
    TrafficSource, VersionChange, VersionCommit, VersionStatus, VisitorLocation,
};
use serde::Deserialize;
use silan_viking_app::{
    api_base_url, ContentCreator, ContentEditor, ContentKind, DeliveryControl, EditableDocument,
    EditablePart, EditableSection, GeoAdvisor, IdeaCategory, MediaLibrary, ReleaseScope,
    SaveLifecycleInput, SaveTranslationInput, WebsiteInsights, WorkspaceContent,
};
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
        Ok(self
            .workspace_content
            .editable_documents()
            .map_err(|error| error.to_string())?
            .into_iter()
            .flat_map(map_editable_document)
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
            .map(map_resume_sections)
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
        Ok(EpisodeSeriesSource {
            slug: source.slug,
            title: source.title,
            description: source.description,
            cover_url: source.cover_url,
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
        Ok(EpisodeSeriesSource {
            slug: saved.slug,
            title: saved.title,
            description: saved.description,
            cover_url: saved.cover_url,
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
            .map(map_resume_sections)
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
        map_editable_document(saved)
            .into_iter()
            .find(|part| {
                part.translations
                    .iter()
                    .any(|value| value.id == translation_id)
            })
            .ok_or_else(|| format!("saved translation `{translation_id}` was not returned"))
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
        Ok(ImportedMediaAsset {
            markdown: asset.markdown,
            uri: asset.uri,
            relative_path: asset.relative_path,
            file_name: asset.file_name,
            byte_count: asset.byte_count,
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
        map_editable_document(saved)
            .into_iter()
            .find(|part| {
                part.translations
                    .iter()
                    .any(|value| value.id == translation_id)
            })
            .ok_or_else(|| format!("saved translation `{translation_id}` was not returned"))
    }

    pub(crate) fn capture_idea(
        &self,
        note: &str,
        category: &str,
    ) -> Result<EditorDocument, String> {
        let category = IdeaCategory::parse(category).map_err(|error| error.to_string())?;
        let captured = self
            .creator
            .capture_idea_and_sync(note, category, &self.db_path)
            .map_err(|error| error.to_string())?;
        self.document_for_part(&captured.part_id)
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

    pub(crate) fn capture_update(&self, event: &str) -> Result<EditorDocument, String> {
        let captured = self
            .creator
            .capture_update_and_sync(event, &self.db_path)
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
        map_editable_document(document)
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

fn avatar_label(display_name: &str) -> String {
    display_name
        .split_whitespace()
        .find_map(|part| part.chars().next())
        .unwrap_or('P')
        .to_string()
}

fn map_editable_document(document: EditableDocument) -> Vec<EditorDocument> {
    let EditableDocument {
        item_id,
        content_type,
        slug,
        title,
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
                status: status.clone(),
                visibility: visibility.clone(),
                date: date.clone(),
                pinned,
                updated_at: updated_at.clone(),
                cover_url: cover_uri.clone(),
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

fn map_resume_sections(sections: Vec<EditableSection>) -> Vec<ResumeSection> {
    sections
        .into_iter()
        .map(|section| ResumeSection {
            role: section.role,
            shape: section.shape,
            canonical_language: section.canonical_language,
            entries: section
                .entries
                .into_iter()
                .map(|entry| crate::model::ResumeEntry {
                    entry_id: entry.id,
                    sort_order: entry.sort_order as i64,
                    shared: entry.shared,
                    localized: entry.localized,
                })
                .collect(),
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
/// `"Category" = [...]` map for `key_value_list` parts.
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
            let mut root = toml::map::Map::new();
            for entry in entries {
                let category = entry
                    .fields
                    .get("category")
                    .and_then(|value| value.as_str())
                    .unwrap_or(&entry.entry_id)
                    .to_owned();
                let items = entry
                    .fields
                    .get("items")
                    .map(|value| json_to_toml(value))
                    .transpose()?
                    .flatten()
                    .unwrap_or(toml::Value::Array(Vec::new()));
                root.insert(category, items);
            }
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
        "idea" => &[
            "draft",
            "hypothesis",
            "experimenting",
            "validating",
            "published",
            "concluded",
        ][..],
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
