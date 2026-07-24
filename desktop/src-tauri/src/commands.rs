//! Thin Tauri command adapter.

use crate::application::{DesktopWorkspace, GenerateImageAssetInput};
use crate::model::{
    ContentMetadataInput, DashboardData, DeliverySyncStatus, DeployRunStatus,
    DeployVerificationResult, DeploymentPlan, DocumentStateInput, EditorDocument, EngagementStats,
    EngagementStatsInput, EpisodeSeriesInput, EpisodeSeriesSource, GeoInsightReport,
    ImportedMediaAsset, MomentsSettings, ResumeEntryInput, ResumePartSource, ResumeProfile,
    ResumeProfileSource, ResumeSection, StatsSyncReport, VersionStatus, WorkspaceFileChange,
    WorkspacePreferences,
};
use crate::openai_credentials::{DesktopOpenAiCredentials, OpenAiCredentialStatus};
use silan_viking_app::{AudioTranscriptionRequest, OpenAiAudioTranscriber};

#[tauri::command]
pub(crate) fn list_documents() -> Result<Vec<EditorDocument>, String> {
    DesktopWorkspace::from_environment()?.list_documents()
}

#[tauri::command]
pub(crate) fn get_dashboard() -> Result<DashboardData, String> {
    DesktopWorkspace::from_environment()?.dashboard()
}

#[tauri::command]
pub(crate) async fn get_openai_credentials() -> Result<OpenAiCredentialStatus, String> {
    run_background("OpenAI credential status", DesktopOpenAiCredentials::status).await
}

#[tauri::command]
pub(crate) async fn save_openai_credentials(
    api_key: String,
) -> Result<OpenAiCredentialStatus, String> {
    run_background("OpenAI credential verification", move || {
        DesktopOpenAiCredentials::verify_and_store(api_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn test_openai_credentials() -> Result<OpenAiCredentialStatus, String> {
    run_background(
        "OpenAI credential verification",
        DesktopOpenAiCredentials::verify_stored,
    )
    .await
}

#[tauri::command]
pub(crate) async fn remove_openai_credentials() -> Result<OpenAiCredentialStatus, String> {
    run_background(
        "OpenAI credential removal",
        DesktopOpenAiCredentials::remove,
    )
    .await
}

#[tauri::command]
pub(crate) fn get_deployment_plan() -> Result<DeploymentPlan, String> {
    DesktopWorkspace::from_environment()?.deployment_plan()
}

#[tauri::command]
pub(crate) async fn get_delivery_sync_status() -> Result<DeliverySyncStatus, String> {
    run_background("delivery sync status", || {
        DesktopWorkspace::from_environment()?.delivery_sync_status()
    })
    .await
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
pub(crate) fn get_workspace_preferences() -> Result<WorkspacePreferences, String> {
    DesktopWorkspace::from_environment()?.workspace_preferences()
}

#[tauri::command]
pub(crate) fn save_workspace_default_language(
    language: String,
) -> Result<WorkspacePreferences, String> {
    DesktopWorkspace::from_environment()?.save_workspace_default_language(&language)
}

#[tauri::command]
pub(crate) fn save_workspace_avatar(
    file_name: String,
    bytes: Vec<u8>,
) -> Result<WorkspacePreferences, String> {
    DesktopWorkspace::from_environment()?.save_workspace_avatar(&file_name, &bytes)
}

#[tauri::command]
pub(crate) fn remove_workspace_avatar() -> Result<WorkspacePreferences, String> {
    DesktopWorkspace::from_environment()?.remove_workspace_avatar()
}

#[tauri::command]
pub(crate) async fn get_workspace_changes() -> Result<Vec<WorkspaceFileChange>, String> {
    run_background("workspace changes", || {
        DesktopWorkspace::from_environment()?.workspace_changes()
    })
    .await
}

#[tauri::command]
pub(crate) async fn get_workspace_file_diff(path: String, staged: bool) -> Result<String, String> {
    run_background("workspace file diff", move || {
        DesktopWorkspace::from_environment()?.workspace_file_diff(&path, staged)
    })
    .await
}

#[tauri::command]
pub(crate) async fn stage_workspace_paths(paths: Vec<String>) -> Result<(), String> {
    run_background("stage workspace paths", move || {
        DesktopWorkspace::from_environment()?.stage_workspace_paths(&paths)
    })
    .await
}

#[tauri::command]
pub(crate) async fn unstage_workspace_paths(paths: Vec<String>) -> Result<(), String> {
    run_background("unstage workspace paths", move || {
        DesktopWorkspace::from_environment()?.unstage_workspace_paths(&paths)
    })
    .await
}

#[tauri::command]
pub(crate) async fn commit_workspace_changes(
    message: String,
) -> Result<DeliverySyncStatus, String> {
    run_background("commit workspace changes", move || {
        DesktopWorkspace::from_environment()?.commit_workspace(&message)
    })
    .await
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
pub(crate) async fn generate_missing_translation(
    id: String,
    target_language: String,
    source_language: Option<String>,
) -> Result<EditorDocument, String> {
    run_background("AI translation generation", move || {
        let api_key = DesktopOpenAiCredentials::load_key()?;
        DesktopWorkspace::from_environment()?.generate_missing_translation(
            &id,
            &target_language,
            source_language.as_deref(),
            &api_key,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn sync_counterpart_translation(
    id: String,
    target_language: String,
) -> Result<EditorDocument, String> {
    run_background("AI translation sync", move || {
        let api_key = DesktopOpenAiCredentials::load_key()?;
        DesktopWorkspace::from_environment()?.sync_counterpart_translation(
            &id,
            &target_language,
            &api_key,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn generate_image_asset(
    id: String,
    prompt: String,
    size: Option<String>,
    quality: Option<String>,
    output_format: Option<String>,
) -> Result<ImportedMediaAsset, String> {
    run_background("AI image generation", move || {
        let api_key = DesktopOpenAiCredentials::load_key()?;
        DesktopWorkspace::from_environment()?.generate_image_asset(
            &id,
            GenerateImageAssetInput {
                prompt,
                size: size.unwrap_or_else(|| "1024x1024".to_owned()),
                quality: quality.unwrap_or_else(|| "auto".to_owned()),
                output_format: output_format.unwrap_or_else(|| "png".to_owned()),
            },
            &api_key,
        )
    })
    .await
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
pub(crate) fn save_content_metadata(
    id: String,
    metadata: ContentMetadataInput,
    expected_revision: String,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.save_content_metadata(&id, metadata, &expected_revision)
}

#[tauri::command]
pub(crate) fn save_engagement_stats(
    entity_type: String,
    entity_id: String,
    stats: EngagementStatsInput,
) -> Result<EngagementStats, String> {
    DesktopWorkspace::from_environment()?.save_engagement_stats(&entity_type, &entity_id, stats)
}

#[tauri::command]
pub(crate) fn import_media_asset(
    id: String,
    source_path: String,
) -> Result<ImportedMediaAsset, String> {
    DesktopWorkspace::from_environment()?.import_media_asset(&id, &source_path)
}

#[tauri::command]
pub(crate) fn import_media_asset_bytes(
    id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ImportedMediaAsset, String> {
    DesktopWorkspace::from_environment()?.import_media_asset_bytes(&id, &file_name, &bytes)
}

#[tauri::command]
pub(crate) fn import_resume_media_asset(
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ImportedMediaAsset, String> {
    DesktopWorkspace::from_environment()?.import_resume_media_asset(&file_name, &bytes)
}

#[tauri::command]
pub(crate) fn import_episode_series_media_asset(
    series_slug: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ImportedMediaAsset, String> {
    DesktopWorkspace::from_environment()?.import_episode_series_media_asset(
        &series_slug,
        &file_name,
        &bytes,
    )
}

#[tauri::command]
pub(crate) fn get_geo_insights(id: String) -> Result<GeoInsightReport, String> {
    DesktopWorkspace::from_environment()?.geo_insights(&id)
}

#[tauri::command]
pub(crate) fn capture_blog(
    draft: String,
    category: String,
    language: Option<String>,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_blog(&draft, &category, language.as_deref())
}

#[tauri::command]
pub(crate) fn capture_moment(
    event: String,
    language: Option<String>,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_moment(&event, language.as_deref())
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

#[tauri::command]
pub(crate) async fn transcribe_audio(
    audio: Vec<u8>,
    mime_type: String,
    duration_ms: u64,
) -> Result<String, String> {
    run_background("audio transcription", move || {
        let api_key = DesktopOpenAiCredentials::load_key()?;
        OpenAiAudioTranscriber::default()
            .transcribe(
                &api_key,
                AudioTranscriptionRequest {
                    audio,
                    mime_type,
                    duration_ms,
                },
            )
            .map_err(|error| error.to_string())
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
    expected_revision: String,
) -> Result<ResumeProfileSource, String> {
    DesktopWorkspace::from_environment()?.save_resume_profile(
        &language,
        &profile,
        &expected_revision,
    )
}

#[tauri::command]
pub(crate) fn save_resume_summary(
    language: String,
    summary: String,
    expected_revision: String,
) -> Result<ResumeProfileSource, String> {
    DesktopWorkspace::from_environment()?.save_resume_summary(
        &language,
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
