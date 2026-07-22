//! Thin Tauri command adapter.

use crate::application::DesktopWorkspace;
use crate::model::{
    ContentMetadataInput, DashboardData, DeliverySyncStatus, DeployRunStatus,
    DeployVerificationResult, DeploymentPlan, DocumentStateInput, EditorDocument, EngagementStats,
    EngagementStatsInput, EntityCount, EpisodeSeriesInput, EpisodeSeriesSource, GeoInsightReport,
    ImportedMediaAsset, MomentsSettings, ResumeEntryInput, ResumePartSource, ResumeProfile,
    ResumeProfileSource, ResumeSection, StatsSyncReport, VersionStatus, WorkspaceFileChange,
};
use silan_viking_app::{OPENAI_KEYCHAIN_ACCOUNT, OPENAI_KEYCHAIN_SERVICE};

const MAX_DICTATION_DURATION_MS: u64 = 60_000;
const MAX_DICTATION_BYTES: usize = 16 * 1024 * 1024;

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
        let api_key = openai_api_key()?;
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
pub(crate) fn capture_blog(draft: String, category: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_blog(&draft, &category)
}

#[tauri::command]
pub(crate) fn capture_moment(event: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_moment(&event)
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
        let api_key = openai_api_key()?;
        if audio.is_empty() {
            return Err("Recorded audio is empty".to_owned());
        }
        if duration_ms == 0 || duration_ms > MAX_DICTATION_DURATION_MS {
            return Err("Voice input must be between 1 and 60 seconds".to_owned());
        }
        if audio.len() > MAX_DICTATION_BYTES {
            return Err("Recorded audio exceeds the 16 MB safety limit".to_owned());
        }
        let mime_type = match mime_type.as_str() {
            value if value.starts_with("audio/webm") => "audio/webm",
            value if value.starts_with("audio/mp4") => "audio/mp4",
            _ => return Err("Unsupported recorded audio format".to_owned()),
        };
        let filename = if mime_type == "audio/mp4" {
            "dictation.mp4"
        } else {
            "dictation.webm"
        };
        let boundary = format!("silan-viking-{}", std::process::id());
        let mut body = Vec::with_capacity(audio.len() + 512);
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\ngpt-4o-mini-transcribe\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n\
                 Content-Type: {mime_type}\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(&audio);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let response = ureq::post("https://api.openai.com/v1/audio/transcriptions")
            .set("Authorization", &format!("Bearer {api_key}"))
            .set(
                "Content-Type",
                &format!("multipart/form-data; boundary={boundary}"),
            )
            .send_bytes(&body)
            .map_err(|error| format!("OpenAI transcription failed: {error}"))?;
        let value: serde_json::Value = response
            .into_json()
            .map_err(|error| format!("Invalid transcription response: {error}"))?;
        value
            .get("text")
            .and_then(|text| text.as_str())
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| "OpenAI returned an empty transcription".to_owned())
    })
    .await
}

#[cfg(target_os = "macos")]
fn openai_api_key() -> Result<String, String> {
    let entry = keyring::Entry::new(OPENAI_KEYCHAIN_SERVICE, OPENAI_KEYCHAIN_ACCOUNT)
        .map_err(|error| format!("Could not access macOS Keychain: {error}"))?;
    match entry.get_password() {
        Ok(secret) => Ok(secret),
        Err(keyring::Error::NoEntry) => Err(
            "OpenAI features need an API key; run `silan-viking credentials openai set`".to_owned(),
        ),
        Err(error) => Err(format!(
            "Could not read OpenAI API key from Keychain: {error}"
        )),
    }
}

#[cfg(not(target_os = "macos"))]
fn openai_api_key() -> Result<String, String> {
    Err("Voice input credential storage currently requires macOS Keychain".to_owned())
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
