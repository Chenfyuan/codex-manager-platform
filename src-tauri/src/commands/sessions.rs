use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

fn sessions_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".codex").join("sessions"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub file_path: String,
    pub timestamp: String,
    pub cwd: Option<String>,
    pub source: Option<String>,
    pub model_provider: Option<String>,
    pub cli_version: Option<String>,
    pub first_message: Option<String>,
    pub turn_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub role: String,
    pub content: String,
    pub timestamp: Option<String>,
}

#[tauri::command]
pub async fn list_codex_sessions() -> Vec<SessionSummary> {
    tokio::task::spawn_blocking(|| {
        let dir = match sessions_dir() {
            Some(d) if d.exists() => d,
            _ => return vec![],
        };

        let mut files: Vec<PathBuf> = Vec::new();
        collect_jsonl_files(&dir, &mut files);
        files.sort_by(|a, b| b.cmp(a));

        let mut summaries = Vec::new();
        for path in files.iter().take(200) {
            if let Some(s) = parse_session_summary(path) {
                summaries.push(s);
            }
        }
        summaries
    })
    .await
    .unwrap_or_default()
}

fn collect_jsonl_files(dir: &PathBuf, out: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                collect_jsonl_files(&p, out);
            } else if p.extension().is_some_and(|e| e == "jsonl") {
                out.push(p);
            }
        }
    }
}

fn parse_session_summary(path: &PathBuf) -> Option<SessionSummary> {
    let file = std::fs::File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut lines = reader.lines();

    let first_line = lines.next()?.ok()?;
    let meta: serde_json::Value = serde_json::from_str(&first_line).ok()?;

    if meta.get("type")?.as_str()? != "session_meta" {
        return None;
    }

    let payload = meta.get("payload")?;
    let id = payload.get("id")?.as_str()?.to_string();
    let timestamp = payload
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let cwd = payload
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let source = payload
        .get("source")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let model_provider = payload
        .get("model_provider")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let cli_version = payload
        .get("cli_version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let mut first_message = None;
    let mut turn_count: usize = 0;

    for line in lines {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if !line.contains("\"user_message\"") {
            continue;
        }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
            if val.get("type").and_then(|v| v.as_str()) == Some("event_msg")
                && val.pointer("/payload/type").and_then(|v| v.as_str()) == Some("user_message")
            {
                turn_count += 1;
                if first_message.is_none() {
                    first_message = val
                        .pointer("/payload/message")
                        .and_then(|v| v.as_str())
                        .map(|s| s.chars().take(120).collect::<String>());
                }
            }
        }
    }

    Some(SessionSummary {
        id,
        file_path: path.to_string_lossy().to_string(),
        timestamp,
        cwd,
        source,
        model_provider,
        cli_version,
        first_message,
        turn_count,
    })
}

#[tauri::command]
pub async fn read_codex_session(file_path: String) -> Result<Vec<SessionMessage>, String> {
    tokio::task::spawn_blocking(move || read_session_sync(&file_path))
        .await
        .map_err(|e| format!("任务失败: {}", e))?
}

fn read_session_sync(file_path: &str) -> Result<Vec<SessionMessage>, String> {
    let file = std::fs::File::open(file_path).map_err(|e| format!("读取失败: {}", e))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.contains("\"user_message\"") || line.contains("\"agent_message\"") || line.contains("\"response_item\"") {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                let line_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let ts = val.get("timestamp").and_then(|v| v.as_str()).map(|s| s.to_string());

                if line_type == "event_msg" {
                    let msg_type = val.pointer("/payload/type").and_then(|v| v.as_str()).unwrap_or("");
                    match msg_type {
                        "user_message" => {
                            if let Some(text) = val.pointer("/payload/message").and_then(|v| v.as_str()) {
                                messages.push(SessionMessage {
                                    role: "user".into(),
                                    content: text.to_string(),
                                    timestamp: ts,
                                });
                            }
                        }
                        "agent_message" => {
                            if let Some(text) = val.pointer("/payload/message").and_then(|v| v.as_str()) {
                                messages.push(SessionMessage {
                                    role: "assistant".into(),
                                    content: text.to_string(),
                                    timestamp: ts,
                                });
                            }
                        }
                        _ => {}
                    }
                } else if line_type == "response_item" {
                    let item_type = val.pointer("/payload/type").and_then(|v| v.as_str()).unwrap_or("");
                    if item_type == "message" {
                        let role = val.pointer("/payload/role").and_then(|v| v.as_str()).unwrap_or("assistant");
                        let text = val
                            .pointer("/payload/content")
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
                                    .collect::<Vec<_>>()
                                    .join("\n")
                            })
                            .unwrap_or_default();
                        if !text.is_empty() {
                            messages.push(SessionMessage {
                                role: role.to_string(),
                                content: text,
                                timestamp: ts,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(messages)
}
