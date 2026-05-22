use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use crate::proxy::server::ProxyServer;
use crate::proxy::types::*;
use crate::state::AppState;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteModel {
    pub id: String,
    pub display_name: String,
}

pub struct ProxyState {
    pub server: Arc<Mutex<ProxyServer>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            server: Arc::new(Mutex::new(ProxyServer::new())),
        }
    }
}

#[tauri::command]
pub async fn proxy_start(
    port: u16,
    proxy_state: State<'_, ProxyState>,
    app_state: State<'_, AppState>,
) -> Result<u16, String> {
    let providers = load_providers_from_db(&app_state)?;
    let mut server = proxy_state.server.lock().await;
    server.update_providers(providers).await;
    server.start(port).await
}

#[tauri::command]
pub async fn proxy_stop(proxy_state: State<'_, ProxyState>) -> Result<(), String> {
    let mut server = proxy_state.server.lock().await;
    server.stop();
    Ok(())
}

#[tauri::command]
pub async fn proxy_get_status(proxy_state: State<'_, ProxyState>) -> Result<ProxyStatus, String> {
    let server = proxy_state.server.lock().await;
    Ok(server.get_status().await)
}

#[tauri::command]
pub async fn proxy_get_logs(
    limit: Option<usize>,
    proxy_state: State<'_, ProxyState>,
) -> Result<Vec<ProxyLog>, String> {
    let server = proxy_state.server.lock().await;
    Ok(server.get_logs(limit.unwrap_or(50)).await)
}

#[tauri::command]
pub fn proxy_get_providers(app_state: State<'_, AppState>) -> Result<Vec<ProxyProvider>, String> {
    load_providers_from_db(&app_state)
}

#[tauri::command]
pub fn proxy_add_provider(
    name: String,
    provider_type: String,
    api_key: String,
    base_url: String,
    models_json: String,
    app_state: State<'_, AppState>,
) -> Result<ProxyProvider, String> {
    let models: Vec<ModelMapping> =
        serde_json::from_str(&models_json).map_err(|e| format!("Invalid models JSON: {}", e))?;
    let id = uuid::Uuid::new_v4().to_string();
    let conn = app_state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO proxy_providers (id, name, provider_type, api_key, base_url, models_json, enabled) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
        rusqlite::params![id, name, provider_type, api_key, base_url, models_json],
    )
    .map_err(|e| format!("DB insert failed: {}", e))?;

    Ok(ProxyProvider {
        id,
        name,
        provider_type,
        api_key,
        base_url,
        models,
        enabled: true,
    })
}

#[tauri::command]
pub fn proxy_update_provider(
    id: String,
    name: String,
    api_key: String,
    base_url: String,
    models_json: String,
    enabled: bool,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = app_state.db.lock().unwrap();
    conn.execute(
        "UPDATE proxy_providers SET name=?1, api_key=?2, base_url=?3, models_json=?4, enabled=?5 WHERE id=?6",
        rusqlite::params![name, api_key, base_url, models_json, enabled, id],
    )
    .map_err(|e| format!("DB update failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn proxy_remove_provider(id: String, app_state: State<'_, AppState>) -> Result<(), String> {
    let conn = app_state.db.lock().unwrap();
    conn.execute("DELETE FROM proxy_providers WHERE id=?1", rusqlite::params![id])
        .map_err(|e| format!("DB delete failed: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn proxy_reload_providers(
    proxy_state: State<'_, ProxyState>,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    let providers = load_providers_from_db(&app_state)?;
    let server = proxy_state.server.lock().await;
    server.update_providers(providers).await;
    Ok(())
}

fn load_providers_from_db(app_state: &State<'_, AppState>) -> Result<Vec<ProxyProvider>, String> {
    let conn = app_state.db.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT id, name, provider_type, api_key, base_url, models_json, enabled FROM proxy_providers")
        .map_err(|e| format!("DB query failed: {}", e))?;

    let rows = stmt
        .query_map([], |row| {
            let models_json: String = row.get(5)?;
            let models: Vec<ModelMapping> =
                serde_json::from_str(&models_json).unwrap_or_default();
            Ok(ProxyProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                provider_type: row.get(2)?,
                api_key: row.get(3)?,
                base_url: row.get(4)?,
                models,
                enabled: row.get(6)?,
            })
        })
        .map_err(|e| format!("DB query failed: {}", e))?;

    let mut providers = Vec::new();
    for row in rows {
        if let Ok(p) = row {
            providers.push(p);
        }
    }
    Ok(providers)
}

#[tauri::command]
pub async fn proxy_fetch_remote_models(
    provider_type: String,
    api_key: String,
    base_url: String,
) -> Result<Vec<RemoteModel>, String> {
    let client = reqwest::Client::new();
    match provider_type.as_str() {
        "anthropic" => fetch_anthropic_models(&client, &api_key, &base_url).await,
        "openai" => fetch_openai_models(&client, &api_key, &base_url).await,
        _ => Err(format!("Unsupported provider type: {}", provider_type)),
    }
}

#[tauri::command]
pub async fn proxy_write_codex_config(
    port: u16,
    model: String,
) -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".codex").join("config.toml");

    // Ensure directory exists
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create .codex dir: {}", e))?;
    }

    // Backup existing config before modifying
    let content = std::fs::read_to_string(&config_path).unwrap_or_default();
    if !content.is_empty() {
        let backup_path = home.join(".codex").join("config.toml.bak");
        std::fs::write(&backup_path, &content)
            .map_err(|e| format!("Failed to backup config: {}", e))?;
    }

    let mut doc = content.parse::<toml_edit::DocumentMut>().map_err(|e| format!("Failed to parse config.toml: {}", e))?;

    // Set top-level fields
    doc["model_provider"] = toml_edit::value("custom");
    doc["model"] = toml_edit::value(model.as_str());

    // Set [model_providers.custom] section
    if !doc.contains_table("model_providers") {
        doc["model_providers"] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    let providers = doc["model_providers"].as_table_mut().unwrap();
    if !providers.contains_key("custom") {
        providers["custom"] = toml_edit::Item::Table(toml_edit::Table::new());
    }
    let custom = providers["custom"].as_table_mut().unwrap();
    custom["name"] = toml_edit::value("custom");
    custom["wire_api"] = toml_edit::value("responses");
    custom["requires_openai_auth"] = toml_edit::value(true);
    custom["base_url"] = toml_edit::value(format!("http://127.0.0.1:{}", port));

    std::fs::write(&config_path, doc.to_string())
        .map_err(|e| format!("Failed to write config.toml: {}", e))?;

    Ok(config_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn proxy_restore_codex_config() -> Result<(), String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".codex").join("config.toml");
    let backup_path = home.join(".codex").join("config.toml.bak");

    if !backup_path.exists() {
        return Err("没有找到备份文件".to_string());
    }

    std::fs::copy(&backup_path, &config_path)
        .map_err(|e| format!("还原失败: {}", e))?;
    std::fs::remove_file(&backup_path).ok();
    Ok(())
}

#[tauri::command]
pub async fn proxy_has_codex_backup() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(home.join(".codex").join("config.toml.bak").exists())
}

async fn fetch_anthropic_models(
    client: &reqwest::Client,
    api_key: &str,
    base_url: &str,
) -> Result<Vec<RemoteModel>, String> {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API 返回 {}: {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let mut models = Vec::new();
    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
        for item in data {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let display_name = item
                .get("display_name")
                .and_then(|v| v.as_str())
                .unwrap_or(id);
            if !id.is_empty() {
                models.push(RemoteModel {
                    id: id.to_string(),
                    display_name: display_name.to_string(),
                });
            }
        }
    }

    models.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(models)
}

async fn fetch_openai_models(
    client: &reqwest::Client,
    api_key: &str,
    base_url: &str,
) -> Result<Vec<RemoteModel>, String> {
    let url = format!("{}/v1/models", base_url.trim_end_matches('/'));
    let mut req = client.get(&url);
    if !api_key.is_empty() {
        req = req.header("authorization", format!("Bearer {}", api_key));
    }
    let resp = req
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("API 返回 {}: {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let mut models = Vec::new();
    if let Some(data) = body.get("data").and_then(|d| d.as_array()) {
        for item in data {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                models.push(RemoteModel {
                    id: id.to_string(),
                    display_name: id.to_string(),
                });
            }
        }
    }

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}
