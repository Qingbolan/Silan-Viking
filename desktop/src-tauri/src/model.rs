use serde::Serialize;

#[derive(Debug, Serialize)]
pub(crate) struct EditorDocument {
    pub(crate) id: String,
    pub(crate) part_id: String,
    pub(crate) entity_type: String,
    pub(crate) entity_id: String,
    pub(crate) series_id: Option<String>,
    pub(crate) series_slug: Option<String>,
    pub(crate) series_title: Option<String>,
    pub(crate) episode_number: Option<i64>,
    pub(crate) slug: String,
    pub(crate) role: String,
    pub(crate) canonical_language: String,
    pub(crate) title: String,
    pub(crate) status: String,
    pub(crate) visibility: String,
    pub(crate) updated_at: String,
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
    pub(crate) recent_items: Vec<DashboardItem>,
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
    pub(crate) episode_number: Option<i64>,
}
