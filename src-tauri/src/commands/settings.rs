use serde::Serialize;
use std::process::Command;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::db;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexCliInfo {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[tauri::command]
pub fn detect_codex_cli() -> CodexCliInfo {
    let which_result = if cfg!(target_os = "windows") {
        Command::new("where").arg("codex").output()
    } else {
        Command::new("which").arg("codex").output()
    };

    let path = match which_result {
        Ok(output) if output.status.success() => {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        }
        _ => None,
    };

    if path.is_none() {
        return CodexCliInfo {
            found: false,
            path: None,
            version: None,
        };
    }

    let version = Command::new("codex")
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    CodexCliInfo {
        found: true,
        path,
        version,
    }
}

#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.db.lock().unwrap();
    Ok(db::get_setting(&conn, &key))
}

#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::set_setting(&conn, &key, &value)
}

#[tauri::command]
pub fn cleanup_old_data(state: State<'_, AppState>, days: i64) -> Result<u64, String> {
    let conn = state.db.lock().unwrap();
    let offset = format!("-{} days", days);
    let count = conn
        .execute(
            "DELETE FROM quota_history WHERE recorded_at < datetime('now', ?1)",
            rusqlite::params![offset],
        )
        .map_err(|e| format!("清理失败: {}", e))?;
    let _ = conn.execute_batch("VACUUM");
    Ok(count as u64)
}

#[tauri::command]
pub fn get_db_size(app: tauri::AppHandle) -> Result<u64, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("codex-manager.db");
    let meta = std::fs::metadata(&db_path).map_err(|e| format!("读取失败: {}", e))?;
    Ok(meta.len())
}

#[tauri::command]
pub fn get_quota_history_count(state: State<'_, AppState>) -> Result<u64, String> {
    let conn = state.db.lock().unwrap();
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM quota_history", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count as u64)
}

#[tauri::command]
pub fn is_codex_running() -> bool {
    let procs = get_codex_processes();
    !procs.is_empty()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexProcessInfo {
    pub pid: u32,
    pub cwd: Option<String>,
    pub elapsed_secs: u64,
    pub command_args: String,
}

#[tauri::command]
pub fn get_codex_processes() -> Vec<CodexProcessInfo> {
    if cfg!(target_os = "windows") {
        return get_codex_processes_windows();
    }
    get_codex_processes_unix()
}

fn get_codex_processes_unix() -> Vec<CodexProcessInfo> {
    let pgrep = Command::new("pgrep").arg("-x").arg("codex").output();
    let pids: Vec<u32> = match pgrep {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .lines()
            .filter_map(|l| l.trim().parse().ok())
            .collect(),
        _ => return vec![],
    };

    let mut results = Vec::new();
    for pid in pids {
        let ps = Command::new("ps")
            .args(["-o", "etime=,args=", "-p", &pid.to_string()])
            .output();
        let (elapsed_secs, command_args) = match ps {
            Ok(o) if o.status.success() => {
                let line = String::from_utf8_lossy(&o.stdout).trim().to_string();
                let parts: Vec<&str> = line
                    .splitn(2, |c: char| c.is_ascii_alphabetic() || c == '/' || c == '.')
                    .collect();
                let etime = parts.first().unwrap_or(&"").trim();
                let args_start = line.len() - line.trim_start().len() + etime.len();
                let args = line.get(args_start..).unwrap_or("").trim().to_string();
                (parse_etime(etime), args)
            }
            _ => (0, String::new()),
        };

        let cwd = Command::new("lsof")
            .args(["-p", &pid.to_string(), "-Fn", "-d", "cwd"])
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8_lossy(&o.stdout)
                        .lines()
                        .find(|l| l.starts_with('n') && !l.starts_with("n/dev"))
                        .map(|l| l[1..].to_string())
                } else {
                    None
                }
            });

        results.push(CodexProcessInfo {
            pid,
            cwd,
            elapsed_secs,
            command_args,
        });
    }
    results.retain(|p| !p.command_args.contains("app-server"));
    results
}

fn get_codex_processes_windows() -> Vec<CodexProcessInfo> {
    let wmic = Command::new("wmic")
        .args([
            "process",
            "where",
            "name='codex.exe'",
            "get",
            "ProcessId,CommandLine,CreationDate",
            "/format:csv",
        ])
        .output();
    let mut procs = match wmic {
        Ok(o) if o.status.success() => {
            let out = String::from_utf8_lossy(&o.stdout);
            out.lines()
                .skip(1)
                .filter(|l| !l.trim().is_empty())
                .filter_map(|line| {
                    let cols: Vec<&str> = line.split(',').collect();
                    if cols.len() >= 4 {
                        let pid: u32 = cols.last()?.trim().parse().ok()?;
                        let cmd = cols[1].trim().to_string();
                        Some(CodexProcessInfo {
                            pid,
                            cwd: None,
                            elapsed_secs: 0,
                            command_args: cmd,
                        })
                    } else {
                        None
                    }
                })
                .collect()
        }
        _ => vec![],
    };
    procs.retain(|p| !p.command_args.contains("app-server"));
    procs
}

fn parse_etime(s: &str) -> u64 {
    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        3 => {
            let hm: Vec<&str> = parts[0].split('-').collect();
            let (days, hours) = if hm.len() == 2 {
                (
                    hm[0].parse::<u64>().unwrap_or(0),
                    hm[1].parse::<u64>().unwrap_or(0),
                )
            } else {
                (0, hm[0].parse::<u64>().unwrap_or(0))
            };
            let mins = parts[1].parse::<u64>().unwrap_or(0);
            let secs = parts[2].parse::<u64>().unwrap_or(0);
            days * 86400 + hours * 3600 + mins * 60 + secs
        }
        2 => {
            let mins = parts[0].parse::<u64>().unwrap_or(0);
            let secs = parts[1].parse::<u64>().unwrap_or(0);
            mins * 60 + secs
        }
        1 => parts[0].parse::<u64>().unwrap_or(0),
        _ => 0,
    }
}

#[tauri::command]
pub fn get_account_launch_command(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    let cred =
        crate::db::get_credential(&conn, &account_id).map_err(|_| "未找到凭证".to_string())?;
    if cred.is_empty() {
        return Err("凭证为空".into());
    }
    if crate::codex::switcher::is_oauth_credential(&cred) {
        Ok("codex".to_string())
    } else {
        Ok(format!("CODEX_API_KEY={} codex", cred))
    }
}

#[tauri::command]
pub fn toggle_spotlight(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("spotlight") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            win.hide().map_err(|e| e.to_string())?;
            let app_clone = app.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(80));
                if let Some(main) = app_clone.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            });
        } else {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
            }
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    } else {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
        let url = WebviewUrl::App("index.html?spotlight=1".into());
        let builder = WebviewWindowBuilder::new(&app, "spotlight", url)
            .title("")
            .inner_size(400.0, 480.0)
            .resizable(false)
            .decorations(true)
            .transparent(true)
            .always_on_top(true)
            .center()
            .skip_taskbar(true)
            .effects(tauri::utils::config::WindowEffectsConfig {
                effects: vec![tauri::window::Effect::Sidebar],
                state: Some(tauri::window::EffectState::FollowsWindowActiveState),
                radius: Some(10.0),
                color: None,
            });

        #[cfg(target_os = "macos")]
        let builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition {
                x: -20.0,
                y: -20.0,
            }));

        let win = builder
            .build()
            .map_err(|e| format!("创建窗口失败: {}", e))?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn hide_spotlight(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("spotlight") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
