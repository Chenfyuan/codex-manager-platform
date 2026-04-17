use tauri::{AppHandle, State};

use crate::codex::switcher;
use crate::db;
use crate::state::AppState;

#[tauri::command]
pub fn refresh_tray_menu(app: AppHandle) {
    crate::rebuild_tray_menu(&app);
    crate::rebuild_app_menu(&app);
}

#[tauri::command]
pub fn get_today_switch_count(state: State<'_, AppState>) -> i32 {
    let conn = state.db.lock().unwrap();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let key = format!("switch_count_{}", today);
    db::get_setting(&conn, &key)
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}

#[tauri::command]
pub fn activate_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let credential = db::get_credential(&conn, &account_id)
        .map_err(|_| "未找到该账号的凭证，请重新编辑账号并填入 API Key".to_string())?;
    drop(conn);

    if credential.is_empty() {
        return Err("未找到该账号的凭证，请重新编辑账号并填入 API Key".into());
    }

    if switcher::is_oauth_credential(&credential) {
        switcher::write_active_credential_raw(&credential)?;
    } else {
        switcher::write_active_credential(&credential)?;
    }

    {
        let accounts = state.accounts.lock().unwrap();
        if let Some(acct) = accounts.iter().find(|a| a.id == account_id) {
            if let Some(ref model) = acct.model_preference {
                let _ = switcher::write_model_preference(model);
            }
        }
    }

    let mut accounts = state.accounts.lock().unwrap();
    if !accounts.iter().any(|a| a.id == account_id) {
        return Err("账号未找到".into());
    }

    let conn = state.db.lock().unwrap();
    let now = chrono::Utc::now().to_rfc3339();
    let _ = crate::db::update_last_active(&conn, &account_id);

    let to_name = accounts.iter().find(|a| a.id == account_id).map(|a| a.name.as_str());
    let _ = db::insert_operation_log(
        &conn,
        "switch_account",
        None,
        to_name,
        "manual",
        None,
    );

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let key = format!("switch_count_{}", today);
    let count: i32 = db::get_setting(&conn, &key)
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let _ = db::set_setting(&conn, &key, &(count + 1).to_string());

    drop(conn);

    for a in accounts.iter_mut() {
        if a.id == account_id {
            a.last_active_at = Some(now.clone());
        }
    }

    Ok(())
}

#[tauri::command]
pub fn get_active_credential() -> Result<Option<String>, String> {
    switcher::read_active_credential()
}

#[tauri::command]
pub fn get_active_account_id(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let current = std::fs::read_to_string(
        dirs::home_dir()
            .ok_or("无法获取 home 目录")?
            .join(".codex")
            .join("auth.json"),
    );
    let current_content = match current {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };

    let accounts = state.accounts.lock().unwrap().clone();
    let conn = state.db.lock().unwrap();

    for account in &accounts {
        if let Ok(cred) = db::get_credential(&conn, &account.id) {
            if cred.is_empty() {
                continue;
            }
            if switcher::is_oauth_credential(&cred) {
                if cred.trim() == current_content.trim() {
                    return Ok(Some(account.id.clone()));
                }
            } else if current_content.contains(&cred) {
                return Ok(Some(account.id.clone()));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn check_quota(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<switcher::QuotaInfo, String> {
    let credential = {
        let conn = state.db.lock().unwrap();
        match db::get_credential(&conn, &account_id) {
            Ok(c) if !c.is_empty() => c,
            _ => return Ok(switcher::QuotaInfo::credential_missing()),
        }
    };
    let info = tokio::task::spawn_blocking(move || {
        switcher::check_quota_sync(&credential)
    })
    .await
    .map_err(|e| format!("查询失败: {}", e))?;
    Ok(info)
}

#[tauri::command]
pub async fn check_all_quotas(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<(String, switcher::QuotaInfo)>, String> {
    let accounts = state.accounts.lock().unwrap().clone();
    let mut creds_to_check = Vec::new();
    let mut missing = Vec::new();

    {
        let conn = state.db.lock().unwrap();
        for account in &accounts {
            match db::get_credential(&conn, &account.id) {
                Ok(cred) if !cred.is_empty() => {
                    creds_to_check.push((account.id.clone(), cred));
                }
                _ => {
                    missing.push((account.id.clone(), switcher::QuotaInfo::credential_missing()));
                }
            }
        }
    }

    let mut tasks = Vec::new();
    for (id, cred) in creds_to_check {
        tasks.push(tokio::task::spawn_blocking(move || {
            let info = switcher::check_quota_sync(&cred);
            (id, info)
        }));
    }

    let mut results = missing;
    for task in tasks {
        match task.await {
            Ok(result) => results.push(result),
            Err(_) => {}
        }
    }

    {
        let conn = state.db.lock().unwrap();
        for (id, q) in &results {
            if q.error.is_none() {
                let _ = db::insert_quota_history(&conn, id, q.primary_used_percent, q.secondary_used_percent);
            }
        }
    }

    crate::rebuild_tray_menu(&app);

    Ok(results)
}

#[tauri::command]
pub fn get_quota_history(
    state: State<'_, AppState>,
    account_id: String,
    limit: Option<i64>,
) -> Result<Vec<(f64, f64, String)>, String> {
    let conn = state.db.lock().unwrap();
    db::get_quota_history(&conn, &account_id, limit.unwrap_or(24))
}

#[tauri::command]
pub fn get_daily_stats(
    state: State<'_, AppState>,
    days: Option<i64>,
) -> Result<Vec<(String, String, f64)>, String> {
    let conn = state.db.lock().unwrap();
    db::get_daily_stats(&conn, days.unwrap_or(7))
}

#[tauri::command]
pub fn get_account_usage_summary(
    state: State<'_, AppState>,
) -> Result<Vec<(String, f64)>, String> {
    let conn = state.db.lock().unwrap();
    db::get_account_usage_summary(&conn)
}

#[tauri::command]
pub fn get_hourly_activity(
    state: State<'_, AppState>,
    days: Option<i64>,
) -> Result<Vec<(i32, i64)>, String> {
    let conn = state.db.lock().unwrap();
    db::get_hourly_activity(&conn, days.unwrap_or(7))
}

#[tauri::command]
pub fn get_consumption_rates(
    state: State<'_, AppState>,
) -> Result<Vec<(String, String, f64, Option<f64>)>, String> {
    let conn = state.db.lock().unwrap();
    db::get_consumption_rates(&conn)
}
