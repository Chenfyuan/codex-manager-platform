use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthDotJson {
    #[serde(rename = "OPENAI_API_KEY", skip_serializing_if = "Option::is_none")]
    pub openai_api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<serde_json::Value>,
}

fn codex_home() -> Result<PathBuf, String> {
    if let Ok(home) = std::env::var("CODEX_HOME") {
        return Ok(PathBuf::from(home));
    }
    dirs::home_dir()
        .map(|h| h.join(".codex"))
        .ok_or_else(|| "无法获取 home 目录".into())
}

fn auth_json_path() -> Result<PathBuf, String> {
    codex_home().map(|h| h.join("auth.json"))
}

pub fn read_active_credential() -> Result<Option<String>, String> {
    let path = auth_json_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let auth: AuthDotJson = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(auth.openai_api_key)
}

pub fn write_active_credential(api_key: &str) -> Result<(), String> {
    let path = auth_json_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let auth = AuthDotJson {
        openai_api_key: Some(api_key.to_string()),
        auth_mode: Some("ApiKey".to_string()),
        tokens: None,
    };
    let content = serde_json::to_string_pretty(&auth).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Write raw auth.json content (used for OAuth credentials).
pub fn write_active_credential_raw(raw_json: &str) -> Result<(), String> {
    let path = auth_json_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, raw_json).map_err(|e| e.to_string())
}

/// Determine if a stored credential is OAuth (raw auth.json) vs API Key.
pub fn is_oauth_credential(credential: &str) -> bool {
    credential.starts_with('{') && credential.contains("auth_mode")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaInfo {
    pub email: Option<String>,
    pub plan_type: String,
    pub primary_used_percent: Option<f64>,
    pub primary_resets_at: Option<i64>,
    pub primary_window_mins: Option<i64>,
    pub secondary_used_percent: Option<f64>,
    pub secondary_resets_at: Option<i64>,
    pub secondary_window_mins: Option<i64>,
    pub credits_balance: Option<String>,
    pub error: Option<String>,
}

impl QuotaInfo {
    pub fn error(msg: String) -> Self {
        Self {
            email: None,
            plan_type: "unknown".into(),
            primary_used_percent: None,
            primary_resets_at: None,
            primary_window_mins: None,
            secondary_used_percent: None,
            secondary_resets_at: None,
            secondary_window_mins: None,
            credits_balance: None,
            error: Some(msg),
        }
    }

    pub fn credential_missing() -> Self {
        Self::error("未找到凭证，请编辑账号重新填入 API Key".into())
    }
}

pub fn check_quota_sync(credential: &str) -> QuotaInfo {
    let mut cmd = match crate::codex::cli::resolve_codex_cli() {
        Ok(cli) => cli.std_command(),
        Err(msg) => return QuotaInfo::error(msg),
    };
    cmd.args(["app-server"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    if is_oauth_credential(credential) {
        let tmp_dir = match tempfile::tempdir() {
            Ok(d) => d,
            Err(e) => return QuotaInfo::error(format!("创建临时目录失败: {}", e)),
        };
        let tmp_auth = tmp_dir.path().join("auth.json");
        if let Err(e) = std::fs::write(&tmp_auth, credential) {
            return QuotaInfo::error(format!("写入临时凭证失败: {}", e));
        }
        cmd.env("CODEX_HOME", tmp_dir.path());
        let result = run_quota_rpc(cmd);
        drop(tmp_dir);
        result
    } else {
        cmd.env("CODEX_API_KEY", credential);
        run_quota_rpc(cmd)
    }
}

fn run_quota_rpc(mut cmd: Command) -> QuotaInfo {
    let child = cmd.spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => return QuotaInfo::error(format!("启动 codex 失败: {}", e)),
    };

    let mut stdin = match child.stdin.take() {
        Some(s) => s,
        None => return QuotaInfo::error("无法获取 stdin".into()),
    };
    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => return QuotaInfo::error("无法获取 stdout".into()),
    };

    let init_msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 0,
        "method": "initialize",
        "params": {
            "clientInfo": { "name": "codex-manager", "version": "0.1.0" }
        }
    });
    let account_msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "account/read",
        "params": { "refreshToken": false }
    });
    let rate_msg = serde_json::json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "account/rateLimits/read",
        "params": {}
    });

    let write_result = (|| -> Result<(), std::io::Error> {
        writeln!(stdin, "{}", serde_json::to_string(&init_msg).unwrap())?;
        stdin.flush()?;
        writeln!(stdin, "{}", serde_json::to_string(&account_msg).unwrap())?;
        stdin.flush()?;
        writeln!(stdin, "{}", serde_json::to_string(&rate_msg).unwrap())?;
        stdin.flush()?;
        Ok(())
    })();

    if let Err(e) = write_result {
        let _ = child.kill();
        return QuotaInfo::error(format!("写入失败: {}", e));
    }

    let reader = BufReader::new(stdout);
    let mut account_resp: Option<serde_json::Value> = None;
    let mut rate_resp: Option<serde_json::Value> = None;

    let deadline = std::time::Instant::now() + Duration::from_secs(10);

    for line in reader.lines() {
        if std::time::Instant::now() > deadline {
            break;
        }
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
            match val.get("id").and_then(|v| v.as_u64()) {
                Some(1) => account_resp = Some(val),
                Some(2) => rate_resp = Some(val),
                _ => {}
            }
        }
        if account_resp.is_some() && rate_resp.is_some() {
            break;
        }
    }

    let _ = child.kill();
    let _ = child.wait();

    let mut info = QuotaInfo {
        email: None,
        plan_type: "unknown".into(),
        primary_used_percent: None,
        primary_resets_at: None,
        primary_window_mins: None,
        secondary_used_percent: None,
        secondary_resets_at: None,
        secondary_window_mins: None,
        credits_balance: None,
        error: None,
    };

    if let Some(resp) = account_resp {
        if let Some(result) = resp.get("result") {
            let account = result.get("account");
            info.email = account
                .and_then(|a| a.get("email"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            info.plan_type = account
                .and_then(|a| a.get("planType"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
        }
    }

    if let Some(resp) = rate_resp {
        if let Some(rl) = resp.pointer("/result/rateLimits") {
            if let Some(p) = rl.get("primary") {
                info.primary_used_percent = p.get("usedPercent").and_then(|v| v.as_f64());
                info.primary_resets_at = p.get("resetsAt").and_then(|v| v.as_i64());
                info.primary_window_mins = p.get("windowDurationMins").and_then(|v| v.as_i64());
            }
            if let Some(s) = rl.get("secondary") {
                info.secondary_used_percent = s.get("usedPercent").and_then(|v| v.as_f64());
                info.secondary_resets_at = s.get("resetsAt").and_then(|v| v.as_i64());
                info.secondary_window_mins = s.get("windowDurationMins").and_then(|v| v.as_i64());
            }
            if let Some(c) = rl.get("credits") {
                info.credits_balance = c
                    .get("balance")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
        }
    }

    info
}

pub fn write_model_preference(model: &str) -> Result<(), String> {
    let config_path = dirs::home_dir()
        .ok_or("Cannot find home dir")?
        .join(".codex")
        .join("config.toml");

    let content = std::fs::read_to_string(&config_path).unwrap_or_default();

    let mut new_lines: Vec<String> = Vec::new();
    let mut found_model = false;

    for line in content.lines() {
        if line.starts_with("model ") || line.starts_with("model=") {
            new_lines.push(format!("model = \"{}\"", model));
            found_model = true;
        } else {
            new_lines.push(line.to_string());
        }
    }

    if !found_model {
        new_lines.insert(0, format!("model = \"{}\"", model));
    }

    std::fs::write(&config_path, new_lines.join("\n") + "\n")
        .map_err(|e| format!("写入 config.toml 失败: {}", e))?;

    Ok(())
}
