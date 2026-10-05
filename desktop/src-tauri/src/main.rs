#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai_engines;
mod application;
mod commands;
mod credential_store;
mod deepseek_credentials;
mod media_protocol;
mod model;
mod openai_credentials;
mod workspace_onboarding;
mod workspace_runtime;
use tauri::{http, Manager};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("silan", |_ctx, request| silan_protocol_response(request))
        .setup(|app| {
            workspace_runtime::initialize(app.path().app_config_dir()?)
                .map_err(std::io::Error::other)?;
            if let Ok(content_root) = application::desktop_content_root() {
                app.asset_protocol_scope()
                    .allow_directory(content_root.join("resources"), true)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture_blog,
            commands::capture_moment,
            commands::apply_article_image_attribution,
            commands::commit_workspace_changes,
            commands::convert_blog_to_moment,
            commands::convert_moment_to_blog,
            commands::create_blog_from_moment,
            commands::create_project,
            commands::create_project_from_moment,
            commands::deploy_content,
            commands::edit_markdown_selection,
            commands::complete_workspace_onboarding,
            commands::get_episode_series_source,
            commands::get_dashboard,
            commands::get_deepseek_credentials,
            commands::get_deployment_plan,
            commands::get_delivery_sync_status,
            commands::get_geo_insights,
            commands::get_moments_settings,
            commands::get_openai_credentials,
            commands::get_resume_part_source,
            commands::get_resume_profile,
            commands::get_resume_sections,
            commands::get_version_status,
            commands::get_workspace_changes,
            commands::get_ai_engines,
            commands::save_ai_engine,
            commands::test_ai_engine,
            commands::get_workspace_bootstrap_status,
            commands::get_workspace_switcher,
            commands::get_release_file_diff,
            commands::get_workspace_file_diff,
            commands::get_workspace_preferences,
            commands::generate_workspace_commit_message,
            commands::generate_missing_translation,
            commands::generate_cover_asset,
            commands::delete_private_resource,
            commands::import_episode_series_media_asset,
            commands::import_media_asset,
            commands::import_media_asset_bytes,
            commands::import_media_asset_data,
            commands::read_capture_attachment,
            commands::import_resume_media_asset,
            commands::join_workspace,
            commands::create_local_workspace,
            commands::open_local_workspace,
            commands::get_interaction_details,
            commands::link_moment_to_content,
            commands::list_documents,
            commands::preview_article_image_attribution,
            commands::pull_remote_content,
            commands::release_scope,
            commands::remove_deepseek_credentials,
            commands::remove_openai_credentials,
            commands::remove_workspace_avatar,
            commands::save_content_settings,
            commands::save_document,
            commands::save_document_state,
            commands::save_deepseek_credentials,
            commands::set_comment_visibility,
            commands::save_episode_series,
            commands::save_openai_credentials,
            commands::save_workspace_avatar,
            commands::save_workspace_default_language,
            commands::save_resume_entries,
            commands::save_resume_profile,
            commands::save_resume_summary,
            commands::review_blog_language,
            commands::review_document_language,
            commands::review_episode_series_language,
            commands::stage_workspace_paths,
            commands::sync_counterpart_translation,
            commands::switch_workspace,
            commands::sync_stats,
            commands::test_deepseek_credentials,
            commands::test_openai_credentials,
            commands::transcribe_audio,
            commands::unlink_moment_from_content,
            commands::unstage_workspace_paths,
            commands::validate_workspace_deployment_key,
            commands::verify_remote_content,
            commands::verify_workspace_repository
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Silan Context System");
}

fn silan_protocol_response(request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let Ok(content_root) = application::desktop_content_root() else {
        return text_response(
            http::StatusCode::SERVICE_UNAVAILABLE,
            "desktop workspace is not configured",
        );
    };
    let Ok(library) = silan_viking_app::MediaLibrary::open(content_root) else {
        return text_response(
            http::StatusCode::SERVICE_UNAVAILABLE,
            "workspace unavailable",
        );
    };
    let uri = request.uri().to_string();
    let Ok(path) = library.resolve_local_path(&uri) else {
        return text_response(http::StatusCode::NOT_FOUND, "asset not found");
    };
    media_protocol::respond(&path, &request)
}

fn text_response(status: http::StatusCode, message: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}
