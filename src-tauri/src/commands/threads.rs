use serde_json::json;
use tauri::{AppHandle, State};

use crate::db;
use crate::state::AppState;

#[tauri::command]
pub async fn connect_account(
    state: State<'_, AppState>,
    app_handle: AppHandle,
    account_id: String,
) -> Result<(), String> {
    {
        let accounts = state.accounts.lock().unwrap();
        accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or("账号未找到")?;
    }

    let api_key = {
        let conn = state.db.lock().unwrap();
        db::get_credential(&conn, &account_id)?
    };

    state
        .process_manager
        .start_process(&account_id, &api_key, app_handle)
        .await
}

#[tauri::command]
pub async fn disconnect_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<(), String> {
    state.process_manager.stop_process(&account_id).await;
    Ok(())
}

#[tauri::command]
pub async fn create_thread(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    let result = state
        .process_manager
        .send_rpc(&account_id, "thread/start", Some(json!({})))
        .await?;

    if let Some(thread_id) = result.get("thread_id").and_then(|v| v.as_str()) {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = state.db.lock().unwrap();
        let _ = db::save_thread(&conn, thread_id, &account_id, "", "active", &now, &now, 0);
    }

    Ok(result)
}

#[tauri::command]
pub async fn get_threads(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    let rpc_result = state
        .process_manager
        .send_rpc(&account_id, "thread/list", Some(json!({})))
        .await;

    match rpc_result {
        Ok(val) => Ok(val),
        Err(_) => {
            let conn = state.db.lock().unwrap();
            let threads = db::load_threads(&conn, &account_id)?;
            Ok(serde_json::Value::Array(threads))
        }
    }
}

#[tauri::command]
pub fn get_thread_history(
    state: State<'_, AppState>,
    thread_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.db.lock().unwrap();
    db::load_turn_items(&conn, &thread_id)
}

#[tauri::command]
pub fn save_stream_item(
    state: State<'_, AppState>,
    id: String,
    thread_id: String,
    turn_id: String,
    kind: String,
    content: String,
    timestamp: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::save_turn_item(&conn, &id, &thread_id, &turn_id, &kind, &content, &timestamp)
}

#[tauri::command]
pub async fn start_turn(
    state: State<'_, AppState>,
    account_id: String,
    thread_id: String,
    prompt: String,
) -> Result<serde_json::Value, String> {
    let result = state
        .process_manager
        .send_rpc(
            &account_id,
            "turn/start",
            Some(json!({
                "thread_id": thread_id,
                "message": prompt,
            })),
        )
        .await?;

    let now = chrono::Utc::now().to_rfc3339();
    let turn_id = result
        .get("turn_id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    let item_id = format!("user-{}", turn_id);
    let conn = state.db.lock().unwrap();
    let _ = db::save_turn_item(&conn, &item_id, &thread_id, turn_id, "text", &prompt, &now);

    Ok(result)
}

#[tauri::command]
pub async fn interrupt_turn(
    state: State<'_, AppState>,
    account_id: String,
    thread_id: String,
    turn_id: String,
) -> Result<serde_json::Value, String> {
    state
        .process_manager
        .send_rpc(
            &account_id,
            "turn/interrupt",
            Some(json!({
                "thread_id": thread_id,
                "turn_id": turn_id,
            })),
        )
        .await
}

#[tauri::command]
pub async fn fetch_account_info(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    state
        .process_manager
        .send_rpc(&account_id, "account/read", Some(json!({ "refreshToken": false })))
        .await
}

#[tauri::command]
pub async fn fetch_rate_limits(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    state
        .process_manager
        .send_rpc(&account_id, "account/rateLimits/read", None)
        .await
}

#[tauri::command]
pub async fn fetch_model_list(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<serde_json::Value, String> {
    state
        .process_manager
        .send_rpc(&account_id, "model/list", Some(json!({ "includeHidden": false })))
        .await
}
