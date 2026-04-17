use tauri::State;

use crate::db;
use crate::state::AppState;

#[tauri::command]
pub fn get_operation_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.db.lock().unwrap();
    db::get_operation_logs(&conn, limit.unwrap_or(50))
}

#[tauri::command]
pub fn clear_operation_logs(state: State<'_, AppState>) -> Result<i64, String> {
    let conn = state.db.lock().unwrap();
    db::clear_operation_logs(&conn)
}

#[tauri::command]
pub fn log_operation(
    state: State<'_, AppState>,
    action: String,
    from_account: Option<String>,
    to_account: Option<String>,
    trigger_type: String,
    detail: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::insert_operation_log(
        &conn,
        &action,
        from_account.as_deref(),
        to_account.as_deref(),
        &trigger_type,
        detail.as_deref(),
    )
}
