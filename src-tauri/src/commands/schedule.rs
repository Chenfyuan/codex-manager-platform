use chrono::{Datelike, Timelike};
use serde::Serialize;
use tauri::State;

use crate::db;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRule {
    pub id: i64,
    pub account_id: String,
    pub start_hour: i32,
    pub end_hour: i32,
    pub days: String,
    pub enabled: bool,
}

#[tauri::command]
pub fn get_schedule_rules(state: State<'_, AppState>) -> Result<Vec<ScheduleRule>, String> {
    let conn = state.db.lock().unwrap();
    let raw = db::get_schedule_rules(&conn)?;
    Ok(raw
        .into_iter()
        .map(
            |(id, account_id, start_hour, end_hour, days, enabled)| ScheduleRule {
                id,
                account_id,
                start_hour,
                end_hour,
                days,
                enabled,
            },
        )
        .collect())
}

#[tauri::command]
pub fn add_schedule_rule(
    state: State<'_, AppState>,
    account_id: String,
    start_hour: i32,
    end_hour: i32,
    days: Option<String>,
) -> Result<i64, String> {
    let d = days.unwrap_or_else(|| "0,1,2,3,4,5,6".into());
    let conn = state.db.lock().unwrap();
    db::insert_schedule_rule(&conn, &account_id, start_hour, end_hour, &d)
}

#[tauri::command]
pub fn remove_schedule_rule(state: State<'_, AppState>, rule_id: i64) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::delete_schedule_rule(&conn, rule_id)
}

#[tauri::command]
pub fn update_account_priority(
    state: State<'_, AppState>,
    account_id: String,
    priority: i32,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::update_priority(&conn, &account_id, priority)?;
    drop(conn);

    let mut accounts = state.accounts.lock().unwrap();
    if let Some(a) = accounts.iter_mut().find(|a| a.id == account_id) {
        a.priority = priority;
    }
    Ok(())
}

#[tauri::command]
pub fn get_recommended_account(
    state: State<'_, AppState>,
    strategy: String,
) -> Result<Option<String>, String> {
    let accounts = state.accounts.lock().unwrap().clone();
    let conn = state.db.lock().unwrap();

    if accounts.is_empty() {
        return Ok(None);
    }

    match strategy.as_str() {
        "time_based" => {
            let rules = db::get_schedule_rules(&conn)?;
            let now = chrono::Local::now();
            let current_hour = now.hour() as i32;
            let current_dow = now.weekday().num_days_from_sunday().to_string();

            for (_, account_id, start_hour, end_hour, days, enabled) in &rules {
                if !enabled {
                    continue;
                }
                let day_match = days.split(',').any(|d| d.trim() == current_dow);
                if !day_match {
                    continue;
                }
                let hour_match = if start_hour <= end_hour {
                    current_hour >= *start_hour && current_hour < *end_hour
                } else {
                    current_hour >= *start_hour || current_hour < *end_hour
                };
                if hour_match && accounts.iter().any(|a| a.id == *account_id) {
                    return Ok(Some(account_id.clone()));
                }
            }
            Ok(None)
        }
        "priority" => {
            let mut sorted: Vec<_> = accounts
                .iter()
                .map(|a| {
                    let p = db::get_priority(&conn, &a.id);
                    (a.id.clone(), p)
                })
                .collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));

            if let Some((id, _)) = sorted.first() {
                let latest = db::get_latest_quota(&conn, id);
                if latest.map_or(true, |used| used < 90.0) {
                    return Ok(Some(id.clone()));
                }
                for (id, _) in &sorted[1..] {
                    let q = db::get_latest_quota(&conn, id);
                    if q.map_or(true, |used| used < 90.0) {
                        return Ok(Some(id.clone()));
                    }
                }
            }
            Ok(None)
        }
        "balanced" => {
            let mut best_id: Option<String> = None;
            let mut best_used = f64::MAX;

            for a in &accounts {
                let used = db::get_latest_quota(&conn, &a.id).unwrap_or(0.0);
                if used < best_used {
                    best_used = used;
                    best_id = Some(a.id.clone());
                }
            }
            Ok(best_id)
        }
        _ => Ok(None),
    }
}
