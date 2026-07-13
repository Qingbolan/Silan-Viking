#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod application;
mod commands;
mod insights;
mod model;
mod projection;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_dashboard,
            commands::list_documents,
            commands::get_document,
            commands::save_document
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Silan Desktop");
}
