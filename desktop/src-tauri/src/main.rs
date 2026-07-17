#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod application;
mod commands;
mod model;
use std::path::{Path, PathBuf};
use tauri::{http, Manager};

fn main() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("silan", |_ctx, request| silan_protocol_response(request))
        .setup(|app| {
            if let Ok(content_root) = std::env::var("SILAN_DESKTOP_CONTENT") {
                app.asset_protocol_scope()
                    .allow_directory(PathBuf::from(content_root).join("resources"), true)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::capture_blog,
            commands::capture_idea,
            commands::capture_update,
            commands::create_project,
            commands::deploy_content,
            commands::get_episode_series_source,
            commands::get_dashboard,
            commands::get_deployment_plan,
            commands::get_entity_counts,
            commands::get_geo_insights,
            commands::get_moments_settings,
            commands::get_resume_part_source,
            commands::get_resume_profile,
            commands::get_resume_sections,
            commands::get_version_status,
            commands::import_media_asset,
            commands::list_documents,
            commands::release_scope,
            commands::save_document,
            commands::save_document_state,
            commands::save_episode_series,
            commands::save_resume_entries,
            commands::save_resume_profile,
            commands::sync_stats,
            commands::verify_remote_content
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Silan Desktop");
}

fn silan_protocol_response(request: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let Ok(content_root) = std::env::var("SILAN_DESKTOP_CONTENT") else {
        return text_response(
            http::StatusCode::SERVICE_UNAVAILABLE,
            "SILAN_DESKTOP_CONTENT is not configured",
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
    match std::fs::read(&path) {
        Ok(bytes) => http::Response::builder()
            .header(http::header::CONTENT_TYPE, content_type_for(&path))
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes)
            .unwrap(),
        Err(_) => text_response(http::StatusCode::INTERNAL_SERVER_ERROR, "cannot read asset"),
    }
}

fn content_type_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

fn text_response(status: http::StatusCode, message: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}
