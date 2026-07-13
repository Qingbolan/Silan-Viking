//! Thin Tauri command adapter.

use crate::application::DesktopWorkspace;
use crate::model::{DashboardData, EditorDocument};

#[tauri::command]
pub(crate) fn list_documents() -> Result<Vec<EditorDocument>, String> {
    DesktopWorkspace::from_environment()?.list_documents()
}

#[tauri::command]
pub(crate) fn get_dashboard() -> Result<DashboardData, String> {
    DesktopWorkspace::from_environment()?.dashboard()
}

#[tauri::command]
pub(crate) fn get_document(id: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.document(&id)
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
pub(crate) fn capture_idea(note: String, category: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_idea(&note, &category)
}

#[tauri::command]
pub(crate) fn capture_blog(draft: String, category: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.capture_blog(&draft, &category)
}

#[tauri::command]
pub(crate) fn create_project(title: String) -> Result<EditorDocument, String> {
    DesktopWorkspace::from_environment()?.create_project(&title)
}
