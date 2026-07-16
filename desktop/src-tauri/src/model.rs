use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub(crate) struct EditorDocument {
    pub(crate) id: String,
    pub(crate) part_id: String,
    pub(crate) entity_type: String,
    pub(crate) entity_id: String,
    pub(crate) series_id: Option<String>,
    pub(crate) series_slug: Option<String>,
    pub(crate) series_title: Option<String>,
    pub(crate) series_description: Option<String>,
    pub(crate) series_cover_url: Option<String>,
    pub(crate) episode_number: Option<i64>,
    pub(crate) slug: String,
    pub(crate) role: String,
    pub(crate) canonical_language: String,
    pub(crate) title: String,
    pub(crate) status: String,
    pub(crate) visibility: String,
    pub(crate) date: Option<String>,
    pub(crate) pinned: bool,
    pub(crate) updated_at: String,
    pub(crate) cover_url: Option<String>,
    pub(crate) translations: Vec<EditorTranslation>,
}

#[derive(Debug, Serialize)]
pub(crate) struct EditorTranslation {
    pub(crate) id: String,
    pub(crate) language: String,
    pub(crate) content: String,
    pub(crate) revision: String,
    pub(crate) source_path: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct DashboardData {
    pub(crate) total_views: i64,
    pub(crate) total_likes: i64,
    pub(crate) total_comments: i64,
    pub(crate) pending_comments: i64,
    pub(crate) human_interactions: i64,
    pub(crate) crawler_interactions: i64,
    pub(crate) ai_crawler_interactions: i64,
    pub(crate) search_crawler_interactions: i64,
    pub(crate) recent_items: Vec<DashboardItem>,
    pub(crate) deployed_views: i64,
    pub(crate) deployed_likes: i64,
    pub(crate) deployed_comments: i64,
    pub(crate) deployed_human_interactions: i64,
    pub(crate) deployed_ai_crawler_interactions: i64,
    pub(crate) deployed_search_crawler_interactions: i64,
    pub(crate) deployed_ai_chat_referrals: i64,
    pub(crate) stats_synced_at: Option<String>,
}

#[derive(Debug, Default, Serialize)]
pub(crate) struct DeployedStats {
    pub(crate) views: i64,
    pub(crate) likes: i64,
    pub(crate) comments: i64,
    pub(crate) human_interactions: i64,
    pub(crate) ai_crawler_interactions: i64,
    pub(crate) search_crawler_interactions: i64,
    pub(crate) ai_chat_referrals: i64,
    pub(crate) synced_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct StatsSyncReport {
    pub(crate) synced: i64,
    pub(crate) failed: i64,
    pub(crate) stats: DeployedStats,
}

#[derive(Debug, Serialize)]
pub(crate) struct VersionStatus {
    pub(crate) scope: String,
    pub(crate) scope_label: String,
    pub(crate) branch: String,
    pub(crate) head: String,
    pub(crate) dirty_count: usize,
    pub(crate) changes: Vec<VersionChange>,
    pub(crate) recent_commits: Vec<VersionCommit>,
}

#[derive(Debug, Serialize)]
pub(crate) struct VersionChange {
    pub(crate) status: String,
    pub(crate) path: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct VersionCommit {
    pub(crate) hash: String,
    pub(crate) subject: String,
    pub(crate) relative_time: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct DashboardItem {
    pub(crate) entity_type: String,
    pub(crate) title: String,
    pub(crate) slug: String,
    pub(crate) status: String,
    pub(crate) visibility: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct EntityCount {
    pub(crate) entity_type: String,
    pub(crate) count: i64,
}

#[derive(Debug)]
pub(crate) struct ContentMetrics {
    pub(crate) total_views: i64,
    pub(crate) total_likes: i64,
    pub(crate) recent_items: Vec<DashboardItem>,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct RuntimeInsights {
    pub(crate) total_comments: i64,
    pub(crate) pending_comments: i64,
    pub(crate) human_interactions: i64,
    pub(crate) crawler_interactions: i64,
    pub(crate) ai_crawler_interactions: i64,
    pub(crate) search_crawler_interactions: i64,
}

#[derive(Debug)]
pub(crate) struct RawPart {
    pub(crate) id: String,
    pub(crate) part_id: String,
    pub(crate) entity_type: String,
    pub(crate) entity_id: String,
    pub(crate) role: String,
    pub(crate) canonical_language: String,
    pub(crate) updated_at: String,
    pub(crate) translations: Vec<RawTranslation>,
}

#[derive(Debug)]
pub(crate) struct RawTranslation {
    pub(crate) id: String,
    pub(crate) language: String,
}

#[derive(Debug, Default)]
pub(crate) struct EntitySummary {
    pub(crate) title: String,
    pub(crate) slug: String,
    pub(crate) status: String,
    pub(crate) visibility: String,
    pub(crate) series_id: Option<String>,
    pub(crate) series_slug: Option<String>,
    pub(crate) series_title: Option<String>,
    pub(crate) series_description: Option<String>,
    pub(crate) series_cover_url: Option<String>,
    pub(crate) episode_number: Option<i64>,
    pub(crate) date: Option<String>,
    pub(crate) pinned: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct ResumeEntry {
    pub(crate) entry_id: String,
    pub(crate) sort_order: i64,
    pub(crate) shared: serde_json::Value,
    pub(crate) localized: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub(crate) struct ResumeSection {
    pub(crate) role: String,
    pub(crate) shape: String,
    pub(crate) canonical_language: String,
    pub(crate) entries: Vec<ResumeEntry>,
}

/// The revision handle for one Resume part's TOML source file.
#[derive(Debug, Serialize)]
pub(crate) struct ResumePartSource {
    pub(crate) role: String,
    pub(crate) language: String,
    pub(crate) revision: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ResumeSocialLink {
    pub(crate) platform: String,
    pub(crate) url: String,
    pub(crate) display_name: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(crate) struct ResumeProfile {
    pub(crate) full_name: String,
    pub(crate) title: String,
    pub(crate) current_status: String,
    pub(crate) email: String,
    pub(crate) phone: String,
    pub(crate) location: String,
    pub(crate) website: String,
    pub(crate) avatar_url: String,
    pub(crate) social_links: Vec<ResumeSocialLink>,
}

#[derive(Debug, Serialize)]
pub(crate) struct ResumeProfileSource {
    pub(crate) language: String,
    pub(crate) revision: String,
    pub(crate) relative_path: String,
    pub(crate) profile: ResumeProfile,
    pub(crate) summary: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct MomentsProfile {
    pub(crate) display_name: String,
    pub(crate) avatar_url: Option<String>,
    pub(crate) avatar_label: String,
    pub(crate) alignment: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct MomentsCover {
    pub(crate) background_image_url: Option<String>,
    pub(crate) background_position: String,
    pub(crate) cover_height_px: u16,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct MomentsSettings {
    pub(crate) profile: MomentsProfile,
    pub(crate) cover: MomentsCover,
}

#[derive(Debug, Serialize)]
pub(crate) struct EpisodeSeriesSource {
    pub(crate) slug: String,
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) cover_url: String,
    pub(crate) status: String,
    pub(crate) revision: String,
    pub(crate) relative_path: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct EpisodeSeriesInput {
    pub(crate) title: String,
    pub(crate) description: String,
    pub(crate) cover_url: String,
    pub(crate) status: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DocumentStateInput {
    pub(crate) status: String,
    pub(crate) visibility: String,
}

/// One edited Resume entry as submitted by the block editor: the flat
/// field map mirrors the on-disk TOML shape (shared and localized fields
/// merged, exactly as each language file stores them).
#[derive(Debug, Deserialize)]
pub(crate) struct ResumeEntryInput {
    pub(crate) entry_id: String,
    pub(crate) fields: serde_json::Map<String, serde_json::Value>,
}
