use tauri::State;

use crate::codex::types::{Account, AuthMethod};
use crate::db;
use crate::state::AppState;

#[tauri::command]
pub fn get_accounts(state: State<'_, AppState>) -> Vec<Account> {
    state.accounts.lock().unwrap().clone()
}

#[tauri::command]
pub fn add_account(
    state: State<'_, AppState>,
    name: String,
    auth_method: String,
    credential: String,
    tag: Option<String>,
) -> Result<Account, String> {
    let method = match auth_method.as_str() {
        "api_key" => AuthMethod::ApiKey,
        "oauth" => AuthMethod::OAuth,
        _ => return Err("无效的认证方式".into()),
    };

    let mut account = Account::new(name, method);
    account.tag = tag.filter(|t| !t.is_empty());

    let conn = state.db.lock().unwrap();
    db::insert(&conn, &account, &credential)?;
    drop(conn);

    let result = account.clone();
    state.accounts.lock().unwrap().push(account);
    Ok(result)
}

#[tauri::command]
pub fn update_account_tag(
    state: State<'_, AppState>,
    account_id: String,
    tag: Option<String>,
) -> Result<(), String> {
    let tag_val = tag.as_deref().filter(|t| !t.is_empty());
    let conn = state.db.lock().unwrap();
    db::update_tag(&conn, &account_id, tag_val)?;
    drop(conn);

    let mut accounts = state.accounts.lock().unwrap();
    if let Some(account) = accounts.iter_mut().find(|a| a.id == account_id) {
        account.tag = tag_val.map(|s| s.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn get_all_tags(state: State<'_, AppState>) -> Vec<String> {
    let conn = state.db.lock().unwrap();
    db::get_all_tags(&conn)
}

#[tauri::command]
pub fn update_model_preference(
    state: State<'_, AppState>,
    account_id: String,
    model: Option<String>,
) -> Result<(), String> {
    let model_val = model.as_deref().filter(|m| !m.is_empty());
    let conn = state.db.lock().unwrap();
    db::update_model_preference(&conn, &account_id, model_val)?;
    drop(conn);

    let mut accounts = state.accounts.lock().unwrap();
    if let Some(a) = accounts.iter_mut().find(|a| a.id == account_id) {
        a.model_preference = model_val.map(|s| s.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn remove_account(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    let found = db::delete(&conn, &account_id)?;
    drop(conn);

    if !found {
        return Err("账号未找到".into());
    }

    state
        .accounts
        .lock()
        .unwrap()
        .retain(|a| a.id != account_id);
    Ok(())
}

#[tauri::command]
pub fn update_account_name(
    state: State<'_, AppState>,
    account_id: String,
    name: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::update_name(&conn, &account_id, &name)?;
    drop(conn);

    let mut accounts = state.accounts.lock().unwrap();
    if let Some(account) = accounts.iter_mut().find(|a| a.id == account_id) {
        account.name = name;
    }
    Ok(())
}

#[tauri::command]
pub fn update_account_credential(
    state: State<'_, AppState>,
    account_id: String,
    credential: String,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::update_credential(&conn, &account_id, &credential)
}

#[tauri::command]
pub fn import_account(
    state: State<'_, AppState>,
    name: String,
    auth_method: String,
    credential: String,
    source: String,
) -> Result<Account, String> {
    let method = match auth_method.as_str() {
        "api_key" => AuthMethod::ApiKey,
        "oauth" => AuthMethod::OAuth,
        _ => return Err("无效的认证方式".into()),
    };

    let existing = state.accounts.lock().unwrap();
    let duplicate = existing.iter().any(|a| {
        if source == "env" {
            matches!(a.auth_method, AuthMethod::ApiKey) && a.name == name
        } else {
            matches!(a.auth_method, AuthMethod::OAuth)
        }
    });
    drop(existing);

    if duplicate {
        return Err("该凭证来源已导入过".into());
    }

    let account = Account::new(name, method);

    let conn = state.db.lock().unwrap();
    db::insert(&conn, &account, &credential)?;
    drop(conn);

    let result = account.clone();
    state.accounts.lock().unwrap().push(account);
    Ok(result)
}

#[tauri::command]
pub fn reorder_accounts(
    state: State<'_, AppState>,
    ordered_ids: Vec<String>,
) -> Result<(), String> {
    let id_order: Vec<(String, i32)> = ordered_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.clone(), i as i32))
        .collect();
    let conn = state.db.lock().unwrap();
    db::update_sort_orders(&conn, &id_order)?;
    drop(conn);

    let mut accounts = state.accounts.lock().unwrap();
    accounts.sort_by(|a, b| {
        let pos_a = ordered_ids
            .iter()
            .position(|id| id == &a.id)
            .unwrap_or(usize::MAX);
        let pos_b = ordered_ids
            .iter()
            .position(|id| id == &b.id)
            .unwrap_or(usize::MAX);
        pos_a.cmp(&pos_b)
    });
    Ok(())
}
