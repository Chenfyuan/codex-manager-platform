use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::codex::types::{Account, AuthMethod};
use crate::db;
use crate::state::AppState;

#[derive(Serialize, Deserialize)]
struct ExportedAccount {
    name: String,
    auth_method: String,
    credential: String,
}

#[derive(Serialize, Deserialize)]
struct ExportData {
    version: u32,
    accounts: Vec<ExportedAccount>,
}

#[derive(Serialize, Deserialize)]
struct EncryptedBackup {
    version: u32,
    nonce: String,
    data: String,
}

fn derive_key(password: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"codex-manager-backup-v1:");
    hasher.update(password.as_bytes());
    hasher.finalize().into()
}

#[tauri::command]
pub fn export_accounts(state: State<'_, AppState>, password: String) -> Result<String, String> {
    let accounts = state.accounts.lock().unwrap().clone();
    let conn = state.db.lock().unwrap();

    let mut exported = Vec::new();
    for account in &accounts {
        let cred = db::get_credential(&conn, &account.id).unwrap_or_default();
        exported.push(ExportedAccount {
            name: account.name.clone(),
            auth_method: match account.auth_method {
                AuthMethod::ApiKey => "api_key".into(),
                AuthMethod::OAuth => "oauth".into(),
            },
            credential: cred,
        });
    }

    let payload = ExportData {
        version: 1,
        accounts: exported,
    };
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

    let key = derive_key(&password);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, json.as_bytes())
        .map_err(|_| "加密失败".to_string())?;

    let backup = EncryptedBackup {
        version: 1,
        nonce: B64.encode(nonce_bytes),
        data: B64.encode(ciphertext),
    };

    serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_accounts_from_backup(
    state: State<'_, AppState>,
    encrypted_json: String,
    password: String,
) -> Result<u32, String> {
    let backup: EncryptedBackup =
        serde_json::from_str(&encrypted_json).map_err(|_| "备份文件格式错误".to_string())?;

    let key = derive_key(&password);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;

    let nonce_bytes = B64
        .decode(&backup.nonce)
        .map_err(|_| "nonce 解码失败".to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = B64
        .decode(&backup.data)
        .map_err(|_| "数据解码失败".to_string())?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "密码错误或数据损坏".to_string())?;

    let data: ExportData =
        serde_json::from_slice(&plaintext).map_err(|_| "解密后数据格式错误".to_string())?;

    if data.version != 1 {
        return Err("不支持的备份版本".into());
    }

    let conn = state.db.lock().unwrap();
    let mut count = 0u32;

    for item in &data.accounts {
        let method = match item.auth_method.as_str() {
            "oauth" => AuthMethod::OAuth,
            _ => AuthMethod::ApiKey,
        };
        let account = Account::new(item.name.clone(), method);
        if db::insert(&conn, &account, &item.credential).is_ok() {
            count += 1;
        }
    }
    drop(conn);

    if count > 0 {
        let conn = state.db.lock().unwrap();
        let all = db::load_all(&conn).unwrap_or_default();
        drop(conn);
        *state.accounts.lock().unwrap() = all;
    }

    Ok(count)
}
