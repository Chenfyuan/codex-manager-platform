use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

fn auth_file_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".codex").join("auth.json")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedCredential {
    pub source: String,
    pub auth_method: String,
    pub display_name: String,
    pub credential_preview: String,
    pub credential_value: String,
}

#[tauri::command]
pub fn detect_existing_credentials() -> Vec<DetectedCredential> {
    let mut results = Vec::new();

    if let Ok(key) = std::env::var("CODEX_API_KEY") {
        if !key.is_empty() {
            let preview = if key.len() > 8 {
                format!("{}...{}", &key[..6], &key[key.len() - 4..])
            } else {
                "sk-***".into()
            };
            results.push(DetectedCredential {
                source: "env".into(),
                auth_method: "api_key".into(),
                display_name: "环境变量 CODEX_API_KEY".into(),
                credential_preview: preview,
                credential_value: key,
            });
        }
    }

    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.is_empty() {
            let preview = if key.len() > 8 {
                format!("{}...{}", &key[..6], &key[key.len() - 4..])
            } else {
                "sk-***".into()
            };
            results.push(DetectedCredential {
                source: "env".into(),
                auth_method: "api_key".into(),
                display_name: "环境变量 OPENAI_API_KEY".into(),
                credential_preview: preview,
                credential_value: key,
            });
        }
    }

    let auth_path = auth_file_path();
    if auth_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            let preview = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(token) = parsed.get("token").and_then(|v| v.as_str()) {
                    if token.len() > 10 {
                        format!("{}...{}", &token[..6], &token[token.len() - 4..])
                    } else {
                        "***".into()
                    }
                } else {
                    "OAuth 凭证已缓存".into()
                }
            } else {
                "auth.json 存在".into()
            };

            results.push(DetectedCredential {
                source: "auth_file".into(),
                auth_method: "oauth".into(),
                display_name: "~/.codex/auth.json (ChatGPT OAuth)".into(),
                credential_preview: preview,
                credential_value: content,
            });
        }
    }

    results
}

#[tauri::command]
pub async fn start_oauth_login() -> Result<String, String> {
    let auth_path = auth_file_path();
    let existed_before = auth_path.exists();
    let mtime_before = std::fs::metadata(&auth_path)
        .ok()
        .and_then(|m| m.modified().ok());

    let mut command = crate::codex::cli::resolve_codex_cli()
        .map(|cli| cli.tokio_command())
        .map_err(|e| format!("启动 OAuth 登录失败: {}", e))?;
    let output = command
        .args(["auth", "login"])
        .output()
        .await
        .map_err(|e| format!("启动 OAuth 登录失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OAuth 登录失败: {}", stderr));
    }

    for _ in 0..60 {
        tokio::time::sleep(Duration::from_secs(1)).await;

        if let Ok(meta) = std::fs::metadata(&auth_path) {
            let mtime_after = meta.modified().ok();
            let is_new = !existed_before;
            let is_updated = mtime_before != mtime_after;

            if is_new || is_updated {
                let content = std::fs::read_to_string(&auth_path)
                    .map_err(|e| format!("读取 auth.json 失败: {}", e))?;
                return Ok(content);
            }
        }
    }

    Err("OAuth 登录超时 (60秒)".into())
}

#[tauri::command]
pub fn check_oauth_status() -> Result<bool, String> {
    let auth_path = auth_file_path();
    Ok(auth_path.exists())
}

#[tauri::command]
pub async fn refresh_oauth_token(
    state: tauri::State<'_, crate::state::AppState>,
    account_id: String,
) -> Result<String, String> {
    let old_cred = {
        let conn = state.db.lock().unwrap();
        crate::db::get_credential(&conn, &account_id)
            .map_err(|_| "账号未找到".to_string())?
    };

    if !crate::codex::switcher::is_oauth_credential(&old_cred) {
        return Err("该账号不是 OAuth 认证，无需刷新".into());
    }

    let auth_path = auth_file_path();
    let backup = std::fs::read_to_string(&auth_path).ok();
    let _ = std::fs::write(&auth_path, &old_cred);

    let mut command = crate::codex::cli::resolve_codex_cli()
        .map(|cli| cli.tokio_command())
        .map_err(|e| format!("刷新 token 失败: {}", e))?;
    let output = command
        .args(["auth", "login"])
        .output()
        .await
        .map_err(|e| format!("刷新 token 失败: {}", e))?;

    if !output.status.success() {
        if let Some(b) = backup {
            let _ = std::fs::write(&auth_path, b);
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("刷新失败: {}", stderr));
    }

    for _ in 0..30 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if let Ok(content) = std::fs::read_to_string(&auth_path) {
            if content != old_cred {
                let conn = state.db.lock().unwrap();
                let _ = crate::db::update_credential(&conn, &account_id, &content);
                return Ok(content);
            }
        }
    }

    if let Some(b) = backup {
        let _ = std::fs::write(&auth_path, b);
    }
    Err("刷新超时".into())
}
