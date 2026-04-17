use tauri::State;

use crate::db;
use crate::state::AppState;

#[tauri::command]
pub fn get_prompt_templates(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.db.lock().unwrap();
    db::load_prompt_templates(&conn)
}

#[tauri::command]
pub fn add_prompt_template(
    state: State<'_, AppState>,
    title: String,
    content: String,
    category: String,
) -> Result<serde_json::Value, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = state.db.lock().unwrap();
    db::insert_prompt_template(&conn, &id, &title, &content, &category)?;
    let templates = db::load_prompt_templates(&conn)?;
    templates
        .into_iter()
        .find(|t| t["id"] == id)
        .ok_or_else(|| "插入后未找到模板".into())
}

#[tauri::command]
pub fn update_prompt_template(
    state: State<'_, AppState>,
    id: String,
    title: String,
    content: String,
    category: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::update_prompt_template(&conn, &id, &title, &content, &category)
}

#[tauri::command]
pub fn delete_prompt_template(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::delete_prompt_template(&conn, &id)
}

#[tauri::command]
pub fn toggle_prompt_favorite(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let conn = state.db.lock().unwrap();
    db::toggle_prompt_favorite(&conn, &id)
}

#[tauri::command]
pub fn increment_prompt_use_count(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::increment_prompt_use_count(&conn, &id)
}

#[tauri::command]
pub fn get_prompt_categories(state: State<'_, AppState>) -> Vec<String> {
    let conn = state.db.lock().unwrap();
    db::get_prompt_categories(&conn)
}
