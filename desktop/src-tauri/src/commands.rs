//! Thin Tauri command adapter.

use crate::application::{DesktopWorkspace, GenerateCoverAssetInput};
use crate::credential_store::ApiCredentialStatus;
use crate::deepseek_credentials::DesktopDeepSeekCredentials;
use crate::model::{
    ContentMetadataInput, DashboardData, DeliverySyncStatus, DeployRunStatus,
    DeployVerificationResult, DeploymentPlan, DocumentStateInput, EditorDocument,
    EpisodeSeriesInput, EpisodeSeriesSource, GeoInsightReport, ImportedMediaAsset,
    InteractionDetails, MarkdownSelectionAssistInput, MarkdownSelectionAssistResult,
    MomentsSettings, ResumeEntryInput, ResumePartSource, ResumeProfile, ResumeProfileSource,
    ResumeSection, StatsSyncReport, VersionStatus, WorkspaceFileChange, WorkspacePreferences,
};
use crate::openai_credentials::DesktopOpenAiCredentials;
use crate::workspace_onboarding::{
    self, CompleteWorkspaceOnboardingInput, DeploymentKeyValidation, DesktopBootstrapStatus,
    DesktopJoinWorkspaceInput, DesktopJoinWorkspaceResult, RepositoryAccessInput,
    RepositoryAccessResult, WorkspaceSwitcherState,
};
use crate::workspace_runtime;
use silan_viking_app::{
    ArticleImageAttributionPlan, ArticleImageAttributionResult, AudioTranscriptionRequest,
    DeletedPrivateResource, LanguageAuditReport, OpenAiAudioTranscriber,
};
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[tauri::command]
pub(crate) fn get_workspace_bootstrap_status() -> DesktopBootstrapStatus {
    workspace_onboarding::bootstrap_status()
}

#[tauri::command]
pub(crate) fn get_workspace_switcher() -> Result<WorkspaceSwitcherState, String> {
    workspace_onboarding::workspace_switcher_state()
}

/// Activate a recently opened workspace. The webview reloads afterwards so
/// every view is rebuilt from the newly selected project.
#[tauri::command]
pub(crate) fn switch_workspace(
    app: tauri::AppHandle,
    project_root: String,
) -> Result<WorkspaceSwitcherState, String> {
    workspace_runtime::switch_to_recent(&PathBuf::from(project_root))?;
    let content_root = crate::application::desktop_content_root()?;
    app.asset_protocol_scope()
        .allow_directory(content_root.join("resources"), true)
        .map_err(|error| format!("cannot allow workspace media: {error}"))?;
    workspace_onboarding::workspace_switcher_state()
}

#[tauri::command]
pub(crate) async fn verify_workspace_repository(
    input: RepositoryAccessInput,
) -> Result<RepositoryAccessResult, String> {
    run_background("workspace repository access", move || {
        workspace_onboarding::verify_repository_access(input)
    })
    .await
}

#[tauri::command]
pub(crate) async fn join_workspace(
    app: tauri::AppHandle,
    input: DesktopJoinWorkspaceInput,
) -> Result<DesktopJoinWorkspaceResult, String> {
    let progress_app = app.clone();
    let joined = run_background("join workspace", move || {
        workspace_onboarding::join_workspace(input, |stage| {
            let _ = progress_app.emit("workspace-preparation", stage);
        })
    })
    .await?;
    app.asset_protocol_scope()
        .allow_directory(PathBuf::from(&joined.content_root).join("resources"), true)
        .map_err(|error| format!("cannot allow workspace media: {error}"))?;
    Ok(joined)
}

#[tauri::command]
pub(crate) async fn create_local_workspace(
    app: tauri::AppHandle,
    input: silan_viking_app::workspace_setup::CreateWorkspaceInput,
) -> Result<DesktopBootstrapStatus, String> {
    let progress_app = app.clone();
    let root = run_background("create local workspace", move || {
        silan_viking_app::workspace_setup::WorkspaceSetup::create(&input, |stage| {
            let _ = progress_app.emit("workspace-preparation", stage);
        })
    })
    .await?;
    activate_local_workspace(&app, root).await
}

#[tauri::command]
pub(crate) async fn open_local_workspace(
    app: tauri::AppHandle,
    path: String,
) -> Result<DesktopBootstrapStatus, String> {
    let _ = app.emit("workspace-preparation", "indexing");
    let local = run_background("open local workspace", move || {
        silan_viking_app::WorkspaceJoiner::open_local(&PathBuf::from(path))
            .map_err(|e| e.to_string())
    })
    .await?;
    activate_local_workspace(&app, local.project_root).await
}

async fn activate_local_workspace(
    app: &tauri::AppHandle,
    root: PathBuf,
) -> Result<DesktopBootstrapStatus, String> {
    let _ = app.emit("workspace-preparation", "activating");
    run_background("activate local workspace", move || {
        crate::workspace_runtime::activate_local_workspace(&root)
    })
    .await?;
    let content = crate::application::desktop_content_root()?;
    app.asset_protocol_scope()
        .allow_directory(content.join("resources"), true)
        .map_err(|e| e.to_string())?;
    Ok(workspace_onboarding::bootstrap_status())
}

#[tauri::command]
pub(crate) async fn validate_workspace_deployment_key(
    path: String,
) -> Result<DeploymentKeyValidation, String> {
    run_background("deployment key validation", move || {
        workspace_onboarding::validate_deployment_key(&path)
    })
    .await
}

#[tauri::command]
pub(crate) fn complete_workspace_onboarding(
    app: tauri::AppHandle,
    input: CompleteWorkspaceOnboardingInput,
) -> Result<DesktopBootstrapStatus, String> {
    let status = workspace_onboarding::complete_onboarding(input)?;
    if let Ok(content_root) = crate::application::desktop_content_root() {
        app.asset_protocol_scope()
            .allow_directory(content_root.join("resources"), true)
            .map_err(|error| format!("cannot allow workspace media: {error}"))?;
    }
    Ok(status)
}

#[tauri::command]
pub(crate) async fn list_documents() -> Result<Vec<EditorDocument>, String> {
    run_background("list documents", || {
        DesktopWorkspace::from_environment()?.list_documents()
    })
    .await
}

#[tauri::command]
pub(crate) fn get_dashboard() -> Result<DashboardData, String> {
    DesktopWorkspace::from_environment()?.dashboard()
}

#[tauri::command]
pub(crate) async fn get_openai_credentials() -> Result<ApiCredentialStatus, String> {
    run_background("OpenAI credential status", DesktopOpenAiCredentials::status).await
}

#[tauri::command]
pub(crate) async fn save_openai_credentials(
    api_key: String,
) -> Result<ApiCredentialStatus, String> {
    run_background("OpenAI credential verification", move || {
        DesktopOpenAiCredentials::verify_and_store(api_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn test_openai_credentials() -> Result<ApiCredentialStatus, String> {
    run_background(
        "OpenAI credential verification",
        DesktopOpenAiCredentials::verify_stored,
    )
    .await
}

#[tauri::command]
pub(crate) async fn remove_openai_credentials() -> Result<ApiCredentialStatus, String> {
    run_background(
        "OpenAI credential removal",
        DesktopOpenAiCredentials::remove,
    )
    .await
}

#[tauri::command]
pub(crate) async fn get_deepseek_credentials() -> Result<ApiCredentialStatus, String> {
    run_background(
        "DeepSeek credential status",
        DesktopDeepSeekCredentials::status,
    )
    .await
}

#[tauri::command]
pub(crate) async fn save_deepseek_credentials(
    api_key: String,
) -> Result<ApiCredentialStatus, String> {
    run_background("DeepSeek credential verification", move || {
        DesktopDeepSeekCredentials::verify_and_store(api_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn test_deepseek_credentials() -> Result<ApiCredentialStatus, String> {
    run_background(
        "DeepSeek credential verification",
        DesktopDeepSeekCredentials::verify_stored,
    )
    .await
}

#[tauri::command]
pub(crate) async fn remove_deepseek_credentials() -> Result<ApiCredentialStatus, String> {
    run_background(
        "DeepSeek credential removal",
        DesktopDeepSeekCredentials::remove,
    )
    .await
}

#[tauri::command]
pub(crate) async fn review_document_language(id: String) -> Result<LanguageAuditReport, String> {
    run_background("DeepSeek document language review", move || {
        let api_key = crate::ai_engines::text_key()?;
        DesktopWorkspace::from_environment()?.review_document_language(&id, &api_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn review_blog_language(slug: String) -> Result<LanguageAuditReport, String> {
    run_background("DeepSeek Blog language review", move || {
        let api_key = crate::ai_engines::text_key()?;
        DesktopWorkspace::from_environment()?.review_blog_language(&slug, &api_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn review_episode_series_language(
    series_slug: String,
) -> Result<LanguageAuditReport, String> {
    run_background("DeepSeek episode-series language review", move || {
        let api_key = crate::ai_engines::text_key()?;
        DesktopWorkspace::from_environment()?.review_episode_series_language(&series_slug, &api_key)
    })
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
pub(crate) async fn pull_remote_content() -> Result<DeliverySyncStatus, String> {
    run_background("pull remote content", || {
        DesktopWorkspace::from_environment()?.pull_remote_changes()
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
pub(crate) async fn generate_workspace_commit_message() -> Result<String, String> {
    run_background("DeepSeek commit message generation", move || {
        let api_key = crate::ai_engines::text_key()?;
        DesktopWorkspace::from_environment()?.generate_workspace_commit_message(&api_key)
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
pub(crate) async fn save_document(
    id: String,
    title: String,
    content: String,
    expected_revision: String,
) -> Result<EditorDocument, String> {
    run_background("save document", move || {
        DesktopWorkspace::from_environment()?.save_document(
            &id,
            &title,
            &content,
            &expected_revision,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn generate_missing_translation(
    id: String,
    target_language: String,
    source_language: Option<String>,
) -> Result<EditorDocument, String> {
    run_background("AI translation generation", move || {
        let api_key =
            crate::ai_engines::openai_key(silan_viking_app::ai_engine::AiCapability::Text)?;
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
    previous_source_body: Option<String>,
) -> Result<EditorDocument, String> {
    run_background("AI translation sync", move || {
        let api_key =
            crate::ai_engines::openai_key(silan_viking_app::ai_engine::AiCapability::Text)?;
        DesktopWorkspace::from_environment()?.sync_counterpart_translation(
            &id,
            &target_language,
            previous_source_body.as_deref(),
            &api_key,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn edit_markdown_selection(
    input: MarkdownSelectionAssistInput,
) -> Result<MarkdownSelectionAssistResult, String> {
    run_background("AI local Markdown selection edit", move || {
        let api_key =
            crate::ai_engines::openai_key(silan_viking_app::ai_engine::AiCapability::Text)?;
        DesktopWorkspace::from_environment()?.edit_markdown_selection(input, &api_key)
    })
    .await
}

#[tauri::command]
pub(crate) async fn generate_cover_asset(
    target_uri: String,
    language: String,
    headline: String,
    audience: String,
    value: String,
    visual_direction: Option<String>,
    size: Option<String>,
    quality: Option<String>,
    output_format: Option<String>,
) -> Result<ImportedMediaAsset, String> {
    run_background("AI cover generation", move || {
        let api_key =
            crate::ai_engines::openai_key(silan_viking_app::ai_engine::AiCapability::Image)?;
        DesktopWorkspace::from_environment()?.generate_cover_asset(
            &target_uri,
            GenerateCoverAssetInput {
                language,
                headline,
                audience,
                value,
                visual_direction: visual_direction.unwrap_or_default(),
                size: size.unwrap_or_else(|| "1536x1024".to_owned()),
                quality: quality.unwrap_or_else(|| "medium".to_owned()),
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
pub(crate) fn delete_private_resource(
    id: String,
    expected_revision: String,
    confirmation: String,
) -> Result<DeletedPrivateResource, String> {
    DesktopWorkspace::from_environment()?.delete_private_resource(
        &id,
        &expected_revision,
        &confirmation,
    )
}

#[tauri::command]
pub(crate) async fn save_content_settings(
    id: String,
    metadata: ContentMetadataInput,
    state: DocumentStateInput,
    expected_revision: String,
) -> Result<EditorDocument, String> {
    run_background("save content settings", move || {
        DesktopWorkspace::from_environment()?.save_content_settings(
            &id,
            metadata,
            state,
            &expected_revision,
        )
    })
    .await
}

#[tauri::command]
pub(crate) fn preview_article_image_attribution(
    target_uri: String,
) -> Result<ArticleImageAttributionPlan, String> {
    DesktopWorkspace::from_environment()?.preview_article_image_attribution(&target_uri)
}

#[tauri::command]
pub(crate) async fn apply_article_image_attribution(
    target_uri: String,
) -> Result<ArticleImageAttributionResult, String> {
    run_background("article image attribution", move || {
        DesktopWorkspace::from_environment()?.apply_article_image_attribution(&target_uri)
    })
    .await
}

#[tauri::command]
pub(crate) fn get_interaction_details(
    entity_type: String,
    entity_id: String,
) -> Result<InteractionDetails, String> {
    DesktopWorkspace::from_environment()?.interaction_details(&entity_type, &entity_id)
}

#[tauri::command]
pub(crate) async fn set_comment_visibility(
    entity_type: String,
    entity_id: String,
    comment_id: String,
    is_public: bool,
) -> Result<InteractionDetails, String> {
    run_background("comment visibility", move || {
        DesktopWorkspace::from_environment()?.set_comment_visibility(
            &entity_type,
            &entity_id,
            &comment_id,
            is_public,
        )
    })
    .await
}

#[tauri::command]
pub(crate) fn import_media_asset(
    id: String,
    source_path: String,
) -> Result<ImportedMediaAsset, String> {
    DesktopWorkspace::from_environment()?.import_media_asset(&id, &source_path)
}

// Native file drops arrive as paths; return bytes without JSON expansion.
#[tauri::command]
pub(crate) async fn read_capture_attachment(path: String) -> Result<tauri::ipc::Response, String> {
    run_background("read capture attachment", move || {
        std::fs::read(path)
            .map(tauri::ipc::Response::new)
            .map_err(|error| error.to_string())
    })
    .await
}

// Raw IPC avoids expanding a video into a JSON array of byte numbers.
#[tauri::command]
pub(crate) async fn import_media_asset_data(
    request: tauri::ipc::Request<'_>,
) -> Result<ImportedMediaAsset, String> {
    let id = request
        .headers()
        .get("x-media-document")
        .and_then(|value| value.to_str().ok())
        .ok_or("missing media document")?
        .to_owned();
    let name = request
        .headers()
        .get("x-media-name")
        .and_then(|value| value.to_str().ok())
        .ok_or("missing media file name")?;
    let file_name: String = serde_json::from_str(name).map_err(|error| error.to_string())?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("media import requires a binary body".to_owned()),
    };
    run_background("import media", move || {
        DesktopWorkspace::from_environment()?.import_media_asset_bytes(&id, &file_name, &bytes)
    })
    .await
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
pub(crate) fn convert_blog_to_moment(slug: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.convert_blog_to_moment(&slug)
}

#[tauri::command]
pub(crate) fn convert_moment_to_blog(slug: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.convert_moment_to_blog(&slug)
}

#[tauri::command]
pub(crate) fn create_blog_from_moment(slug: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.create_blog_from_moment(&slug)
}

#[tauri::command]
pub(crate) fn create_project_from_moment(slug: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.create_project_from_moment(&slug)
}

#[tauri::command]
pub(crate) fn link_moment_to_content(
    slug: String,
    target_kind: String,
    target_slug: String,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.link_moment_to_content(&slug, &target_kind, &target_slug)
}

#[tauri::command]
pub(crate) fn unlink_moment_from_content(
    slug: String,
    target_kind: String,
    target_slug: String,
) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.unlink_moment_from_content(
        &slug,
        &target_kind,
        &target_slug,
    )
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
        let api_key =
            crate::ai_engines::openai_key(silan_viking_app::ai_engine::AiCapability::Speech)?;
        OpenAiAudioTranscriber::configured()?
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
pub(crate) fn release_scope(scope: String, message: String) -> Result<VersionStatus, String> {
    DesktopWorkspace::from_environment()?.release_scope(&scope, &message)
}

#[tauri::command]
pub(crate) async fn get_release_file_diff(scope: String, path: String) -> Result<String, String> {
    run_background("section commit preview diff", move || {
        DesktopWorkspace::from_environment()?.release_file_diff(&scope, &path)
    })
    .await
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

#[tauri::command]
pub(crate) async fn get_ai_engines() -> Result<crate::ai_engines::AiEngineStatus, String> {
    run_background("AI engine settings", crate::ai_engines::status).await
}
#[tauri::command]
pub(crate) async fn save_ai_engine(
    input: crate::ai_engines::SaveAiEngineInput,
) -> Result<crate::ai_engines::AiEngineStatus, String> {
    run_background("save AI engine", move || crate::ai_engines::save(input)).await
}
#[tauri::command]
pub(crate) async fn test_ai_engine(
    capability: silan_viking_app::ai_engine::AiCapability,
) -> Result<String, String> {
    run_background("test AI engine", move || {
        crate::ai_engines::test(capability)
    })
    .await
}
