use serde::Serialize;
#[cfg(target_os = "windows")]
use serde::Deserialize;
use std::process::Command;
#[cfg(not(target_os = "macos"))]
use tauri::window::Color;
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
    match crate::codex::cli::resolve_codex_cli() {
        Ok(cli) => {
            let version = cli
                .std_command()
                .arg("--version")
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

            CodexCliInfo {
                found: true,
                path: Some(cli.path().to_string_lossy().into_owned()),
                version,
            }
        }
        Err(_) => CodexCliInfo {
            found: false,
            path: None,
            version: None,
        },
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
    #[cfg(target_os = "windows")]
    {
        get_codex_processes_windows()
    }

    #[cfg(not(target_os = "windows"))]
    {
        get_codex_processes_unix()
    }
}

#[cfg(not(target_os = "windows"))]
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

#[cfg(target_os = "windows")]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsProcessRecord {
    process_id: u32,
    command_line: Option<String>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum WindowsProcessRecords {
    One(WindowsProcessRecord),
    Many(Vec<WindowsProcessRecord>),
}

#[cfg(target_os = "windows")]
fn parse_windows_process_records(raw: &str) -> Vec<WindowsProcessRecord> {
    match serde_json::from_str::<WindowsProcessRecords>(raw) {
        Ok(WindowsProcessRecords::One(record)) => vec![record],
        Ok(WindowsProcessRecords::Many(records)) => records,
        Err(_) => Vec::new(),
    }
}

#[cfg(target_os = "windows")]
fn should_include_windows_codex_process(command_line: &str) -> bool {
    let command_line = command_line.trim();
    if command_line.is_empty() {
        return false;
    }

    let normalized = command_line.replace('/', "\\").to_ascii_lowercase();

    if normalized.contains("app-server") {
        return false;
    }

    if normalized.contains("--type=") || normalized.contains("crashpad-handler") {
        return false;
    }

    if normalized.contains("\\windowsapps\\openai.codex_")
        && normalized.contains("\\app\\codex.exe")
        && !normalized.contains("\\app\\resources\\codex.exe")
    {
        return false;
    }

    true
}

#[cfg(target_os = "windows")]
fn get_codex_processes_windows() -> Vec<CodexProcessInfo> {
    let script = r#"
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -ieq 'codex.exe' } |
  Select-Object ProcessId, CommandLine |
  ConvertTo-Json -Compress
"#;
    let mut powershell = Command::new("powershell");
    crate::codex::cli::configure_background_command(&mut powershell);
    let powershell = powershell
        .args(["-NoProfile", "-Command", script])
        .output();
    match powershell {
        Ok(o) if o.status.success() => {
            let out = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if out.is_empty() {
                return vec![];
            }

            parse_windows_process_records(&out)
                .into_iter()
                .filter_map(|record| {
                    let command_args = record.command_line?.trim().to_string();
                    if !should_include_windows_codex_process(&command_args) {
                        return None;
                    }

                    Some(CodexProcessInfo {
                        pid: record.process_id,
                        cwd: None,
                        elapsed_secs: 0,
                        command_args,
                    })
                })
                .collect()
        }
        _ => vec![],
    }
}

#[cfg(not(target_os = "windows"))]
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
        crate::codex::cli::shell_invocation()
    } else {
        crate::codex::cli::shell_command_with_env("CODEX_API_KEY", &cred)
    }
}

#[tauri::command]
pub async fn toggle_spotlight(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("spotlight") {
        #[cfg(not(target_os = "macos"))]
        let _ = win.set_decorations(false);

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
        let app_handle = app.clone();
        let win = tauri::async_runtime::spawn_blocking(move || {
            let url = WebviewUrl::App("index.html?spotlight=1".into());
            let builder = WebviewWindowBuilder::new(&app_handle, "spotlight", url)
                .title("")
                .inner_size(400.0, 480.0)
                .resizable(false)
                .always_on_top(true)
                .center()
                .skip_taskbar(true);

            #[cfg(target_os = "macos")]
            let builder = builder
                .decorations(true)
                .transparent(true)
                .effects(tauri::utils::config::WindowEffectsConfig {
                    effects: vec![tauri::window::Effect::Sidebar],
                    state: Some(tauri::window::EffectState::FollowsWindowActiveState),
                    radius: Some(10.0),
                    color: None,
                })
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition {
                    x: -20.0,
                    y: -20.0,
                }));

            #[cfg(not(target_os = "macos"))]
            let builder = builder
                .decorations(false)
                .transparent(false)
                .background_color(Color(17, 18, 30, 255));

            builder
                .build()
                .map_err(|e| format!("创建窗口失败: {}", e))
        })
        .await
        .map_err(|e| format!("创建窗口任务失败: {}", e))??;

        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
        let _ = win.show();
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
