#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod application;
mod commands;
mod insights;
mod model;
mod projection;

use std::path::PathBuf;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
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
            commands::get_episode_series_source,
            commands::get_dashboard,
            commands::get_entity_counts,
            commands::get_moments_settings,
            commands::get_resume_part_source,
            commands::get_resume_profile,
            commands::get_resume_sections,
            commands::get_version_status,
            commands::list_documents,
            commands::release_scope,
            commands::get_document,
            commands::save_document,
            commands::save_document_state,
            commands::save_episode_series,
            commands::save_resume_entries,
            commands::save_resume_profile,
            commands::sync_stats
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Silan Desktop");
}
