//! Thin Tauri command adapter.

use crate::application::DesktopWorkspace;
use crate::model::{
    DashboardData, DeployRunStatus, DeployVerificationResult, DeploymentPlan, DocumentStateInput,
    EditorDocument, EntityCount, EpisodeSeriesInput, EpisodeSeriesSource, GeoInsightReport,
    ImportedMediaAsset, MomentsSettings, ResumeEntryInput, ResumePartSource, ResumeProfile,
    ResumeProfileSource, ResumeSection, StatsSyncReport, VersionStatus,
};

#[tauri::command]
pub(crate) fn list_documents() -> Result<Vec<EditorDocument>, String> {
    DesktopWorkspace::from_environment()?.list_documents()
}

#[tauri::command]
pub(crate) fn get_entity_counts() -> Result<Vec<EntityCount>, String> {
    DesktopWorkspace::from_environment()?.entity_counts()
}

#[tauri::command]
pub(crate) fn get_dashboard() -> Result<DashboardData, String> {
    DesktopWorkspace::from_environment()?.dashboard()
}

#[tauri::command]
pub(crate) fn get_deployment_plan() -> Result<DeploymentPlan, String> {
    DesktopWorkspace::from_environment()?.deployment_plan()
}

#[tauri::command]
pub(crate) async fn deploy_content() -> Result<DeployRunStatus, String> {
    run_background("content deploy", || {
        DesktopWorkspace::from_environment()?.deploy_content()
    })
    .await
}

#[tauri::command]
pub(crate) async fn verify_remote_content() -> Result<DeployVerificationResult, String> {
    run_background("remote verification", || {
        DesktopWorkspace::from_environment()?.verify_remote()
    })
    .await
}

#[tauri::command]
pub(crate) fn get_moments_settings() -> Result<MomentsSettings, String> {
    DesktopWorkspace::from_environment()?.moments_settings()
}

#[tauri::command]
pub(crate) fn save_document(
    id: String,
    content: String,
    expected_revision: String,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.save_document(&id, &content, &expected_revision)
}

#[tauri::command]
pub(crate) fn save_document_state(
    id: String,
    state: DocumentStateInput,
    expected_revision: String,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.save_document_state(&id, state, &expected_revision)
}

#[tauri::command]
pub(crate) fn import_media_asset(
    id: String,
    source_path: String,
) -> Result<ImportedMediaAsset, String> {
    DesktopWorkspace::from_environment()?.import_media_asset(&id, &source_path)
}

#[tauri::command]
pub(crate) fn get_geo_insights(id: String) -> Result<GeoInsightReport, String> {
    DesktopWorkspace::from_environment()?.geo_insights(&id)
}

#[tauri::command]
pub(crate) fn capture_idea(note: String, category: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_idea(&note, &category)
}

#[tauri::command]
pub(crate) fn capture_blog(draft: String, category: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_blog(&draft, &category)
}

#[tauri::command]
pub(crate) fn capture_update(event: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_update(&event)
}

#[tauri::command]
pub(crate) fn create_project(title: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.create_project(&title)
}

#[tauri::command]
pub(crate) async fn sync_stats() -> Result<StatsSyncReport, String> {
    // Network and cache persistence are intentionally blocking SDK
    // boundaries. Keep both off Tauri's command executor so a slow response
    // cannot stall window events, painting, or the loading-state animation.
    run_background("stats sync", || {
        DesktopWorkspace::from_environment()?.sync_stats()
    })
    .await
}

async fn run_background<T, F>(operation: &str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{operation} worker failed: {error}"))?
}

#[tauri::command]
pub(crate) fn get_version_status(scope: String) -> Result<VersionStatus, String> {
    DesktopWorkspace::from_environment()?.version_status(&scope)
}

#[tauri::command]
pub(crate) fn release_scope(scope: String) -> Result<VersionStatus, String> {
    DesktopWorkspace::from_environment()?.release_scope(&scope)
}

#[tauri::command]
pub(crate) fn get_episode_series_source(slug: String) -> Result<EpisodeSeriesSource, String> {
    DesktopWorkspace::from_environment()?.episode_series_source(&slug)
}

#[tauri::command]
pub(crate) fn save_episode_series(
    slug: String,
    series: EpisodeSeriesInput,
    expected_revision: String,
) -> Result<EpisodeSeriesSource, String> {
    DesktopWorkspace::from_environment()?.save_episode_series(&slug, &series, &expected_revision)
}

#[tauri::command]
pub(crate) fn get_resume_sections(language: String) -> Result<Vec<ResumeSection>, String> {
    DesktopWorkspace::from_environment()?.resume_sections(&language)
}

#[tauri::command]
pub(crate) fn get_resume_part_source(
    role: String,
    language: String,
) -> Result<ResumePartSource, String> {
    DesktopWorkspace::from_environment()?.resume_part_source(&role, &language)
}

#[tauri::command]
pub(crate) fn get_resume_profile(language: String) -> Result<ResumeProfileSource, String> {
    DesktopWorkspace::from_environment()?.resume_profile(&language)
}

#[tauri::command]
pub(crate) fn save_resume_profile(
    language: String,
    profile: ResumeProfile,
    summary: String,
    expected_revision: String,
) -> Result<ResumeProfileSource, String> {
    DesktopWorkspace::from_environment()?.save_resume_profile(
        &language,
        &profile,
        &summary,
        &expected_revision,
    )
}

#[tauri::command]
pub(crate) fn save_resume_entries(
    role: String,
    language: String,
    shape: String,
    entries: Vec<ResumeEntryInput>,
    expected_revision: String,
) -> Result<Vec<ResumeSection>, String> {
    DesktopWorkspace::from_environment()?.save_resume_entries(
        &role,
        &language,
        &shape,
        &entries,
        &expected_revision,
    )
}
