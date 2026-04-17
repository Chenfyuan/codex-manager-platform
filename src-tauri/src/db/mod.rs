use rusqlite::{params, Connection};

use crate::codex::types::{Account, AccountStatus, AuthMethod};

pub fn init(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            auth_method TEXT NOT NULL,
            max_threads INTEGER NOT NULL DEFAULT 6,
            created_at TEXT NOT NULL,
            last_active_at TEXT,
            credential TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS threads (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            turn_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS turn_items (
            id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            turn_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_threads_account ON threads(account_id);
        CREATE INDEX IF NOT EXISTS idx_items_thread ON turn_items(thread_id);
        CREATE INDEX IF NOT EXISTS idx_items_turn ON turn_items(turn_id);
        ",
    )
    .map_err(|e| format!("DB init failed: {}", e))?;

    migrate_add_credential(conn)?;
    migrate_add_quota_history(conn)?;
    migrate_add_settings(conn)?;
    migrate_add_tag(conn)?;
    migrate_add_schedule(conn)?;
    migrate_add_model_preference(conn)?;
    migrate_add_prompt_templates(conn)?;
    migrate_add_proxy_providers(conn)?;
    migrate_add_operation_log(conn)?;
    migrate_add_sort_order(conn)?;
    Ok(())
}

fn migrate_add_credential(conn: &Connection) -> Result<(), String> {
    let has_col: bool = conn
        .prepare("SELECT credential FROM accounts LIMIT 0")
        .is_ok();
    if !has_col {
        conn.execute_batch("ALTER TABLE accounts ADD COLUMN credential TEXT NOT NULL DEFAULT ''")
            .map_err(|e| format!("Migration failed: {}", e))?;
    }
    Ok(())
}

fn migrate_add_quota_history(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS quota_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            primary_used_percent REAL,
            secondary_used_percent REAL,
            recorded_at TEXT NOT NULL,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_quota_history_account ON quota_history(account_id, recorded_at);"
    ).map_err(|e| format!("Quota history migration failed: {}", e))?;
    Ok(())
}

fn migrate_add_settings(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .map_err(|e| format!("Settings migration failed: {}", e))?;
    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .ok()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| format!("Set setting failed: {}", e))?;
    Ok(())
}

fn migrate_add_tag(conn: &Connection) -> Result<(), String> {
    let has_col: bool = conn.prepare("SELECT tag FROM accounts LIMIT 0").is_ok();
    if !has_col {
        conn.execute_batch("ALTER TABLE accounts ADD COLUMN tag TEXT")
            .map_err(|e| format!("Tag migration failed: {}", e))?;
    }
    Ok(())
}

pub fn update_tag(conn: &Connection, account_id: &str, tag: Option<&str>) -> Result<(), String> {
    let count = conn
        .execute(
            "UPDATE accounts SET tag = ?1 WHERE id = ?2",
            params![tag, account_id],
        )
        .map_err(|e| format!("Update tag failed: {}", e))?;
    if count == 0 {
        return Err("账号未找到".into());
    }
    Ok(())
}

pub fn get_all_tags(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT tag FROM accounts WHERE tag IS NOT NULL AND tag != '' ORDER BY tag",
        )
        .unwrap();
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

pub fn get_daily_stats(conn: &Connection, days: i64) -> Result<Vec<(String, String, f64)>, String> {
    let offset = format!("-{} days", days);
    let mut stmt = conn
        .prepare(
            "SELECT a.name, DATE(q.recorded_at) as day, AVG(q.primary_used_percent) as avg_used
             FROM quota_history q
             JOIN accounts a ON a.id = q.account_id
             WHERE q.recorded_at >= datetime('now', ?1)
             AND q.primary_used_percent IS NOT NULL
             GROUP BY a.name, day
             ORDER BY day, a.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![offset], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn get_account_usage_summary(conn: &Connection) -> Result<Vec<(String, f64)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.name, COALESCE(AVG(q.primary_used_percent), 0)
             FROM accounts a
             LEFT JOIN quota_history q ON a.id = q.account_id
             AND q.recorded_at >= datetime('now', '-7 days')
             AND q.primary_used_percent IS NOT NULL
             GROUP BY a.id, a.name
             ORDER BY a.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn get_hourly_activity(conn: &Connection, days: i64) -> Result<Vec<(i32, i64)>, String> {
    let offset = format!("-{} days", days);
    let mut stmt = conn
        .prepare(
            "SELECT CAST(strftime('%H', recorded_at) AS INTEGER) as hour, COUNT(*) as cnt
             FROM quota_history
             WHERE recorded_at >= datetime('now', ?1)
             GROUP BY hour
             ORDER BY hour",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![offset], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn get_consumption_rates(
    conn: &Connection,
) -> Result<Vec<(String, String, f64, Option<f64>)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.name,
                    COALESCE((
                        SELECT q2.primary_used_percent
                        FROM quota_history q2
                        WHERE q2.account_id = a.id
                        ORDER BY q2.recorded_at DESC LIMIT 1
                    ), 0) as latest_used,
                    (
                        SELECT (MAX(q3.primary_used_percent) - MIN(q3.primary_used_percent))
                               / (MAX(CAST(julianday(q3.recorded_at) AS REAL)) - MIN(CAST(julianday(q3.recorded_at) AS REAL)))
                               / 24.0
                        FROM quota_history q3
                        WHERE q3.account_id = a.id
                        AND q3.recorded_at >= datetime('now', '-24 hours')
                        AND q3.primary_used_percent IS NOT NULL
                        HAVING COUNT(*) >= 2
                    ) as rate_per_hour
             FROM accounts a
             ORDER BY a.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, Option<f64>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

fn migrate_add_schedule(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schedule_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            start_hour INTEGER NOT NULL,
            end_hour INTEGER NOT NULL,
            days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
            enabled INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_schedule_account ON schedule_rules(account_id);",
    )
    .map_err(|e| format!("Schedule migration failed: {}", e))?;

    let has_priority: bool = conn
        .prepare("SELECT priority FROM accounts LIMIT 0")
        .is_ok();
    if !has_priority {
        conn.execute_batch("ALTER TABLE accounts ADD COLUMN priority INTEGER NOT NULL DEFAULT 0")
            .map_err(|e| format!("Priority migration failed: {}", e))?;
    }
    Ok(())
}

pub fn update_priority(conn: &Connection, account_id: &str, priority: i32) -> Result<(), String> {
    let count = conn
        .execute(
            "UPDATE accounts SET priority = ?1 WHERE id = ?2",
            params![priority, account_id],
        )
        .map_err(|e| format!("Update priority failed: {}", e))?;
    if count == 0 {
        return Err("账号未找到".into());
    }
    Ok(())
}

pub fn get_priority(conn: &Connection, account_id: &str) -> i32 {
    conn.query_row(
        "SELECT priority FROM accounts WHERE id = ?1",
        params![account_id],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

pub fn insert_schedule_rule(
    conn: &Connection,
    account_id: &str,
    start_hour: i32,
    end_hour: i32,
    days: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO schedule_rules (account_id, start_hour, end_hour, days) VALUES (?1, ?2, ?3, ?4)",
        params![account_id, start_hour, end_hour, days],
    )
    .map_err(|e| format!("Insert schedule rule failed: {}", e))?;
    Ok(conn.last_insert_rowid())
}

pub fn delete_schedule_rule(conn: &Connection, rule_id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM schedule_rules WHERE id = ?1", params![rule_id])
        .map_err(|e| format!("Delete schedule rule failed: {}", e))?;
    Ok(())
}

pub fn get_schedule_rules(
    conn: &Connection,
) -> Result<Vec<(i64, String, i32, i32, String, bool)>, String> {
    let mut stmt = conn
        .prepare("SELECT r.id, r.account_id, r.start_hour, r.end_hour, r.days, r.enabled FROM schedule_rules r ORDER BY r.start_hour")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, bool>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

fn migrate_add_model_preference(conn: &Connection) -> Result<(), String> {
    let has_col: bool = conn
        .prepare("SELECT model_preference FROM accounts LIMIT 0")
        .is_ok();
    if !has_col {
        conn.execute_batch("ALTER TABLE accounts ADD COLUMN model_preference TEXT")
            .map_err(|e| format!("Model preference migration failed: {}", e))?;
    }
    Ok(())
}

pub fn update_model_preference(
    conn: &Connection,
    account_id: &str,
    model: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "UPDATE accounts SET model_preference = ?1 WHERE id = ?2",
        params![model, account_id],
    )
    .map_err(|e| format!("Update model preference failed: {}", e))?;
    Ok(())
}

pub fn load_all(conn: &Connection) -> Result<Vec<Account>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, auth_method, max_threads, created_at, last_active_at, tag, priority, model_preference FROM accounts ORDER BY sort_order, created_at")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let auth_str: String = row.get(2)?;
            let auth_method = match auth_str.as_str() {
                "oauth" => AuthMethod::OAuth,
                _ => AuthMethod::ApiKey,
            };
            Ok(Account {
                id: row.get(0)?,
                name: row.get(1)?,
                auth_method,
                status: AccountStatus::Disconnected,
                max_threads: row.get(3)?,
                active_threads: 0,
                created_at: row.get(4)?,
                last_active_at: row.get(5)?,
                tag: row.get(6)?,
                priority: row.get(7)?,
                model_preference: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row.map_err(|e| e.to_string())?);
    }
    Ok(accounts)
}

pub fn insert(conn: &Connection, account: &Account, credential: &str) -> Result<(), String> {
    let auth_str = match account.auth_method {
        AuthMethod::ApiKey => "api_key",
        AuthMethod::OAuth => "oauth",
    };
    conn.execute(
        "INSERT INTO accounts (id, name, auth_method, max_threads, created_at, last_active_at, credential, tag) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![account.id, account.name, auth_str, account.max_threads, account.created_at, account.last_active_at, credential, account.tag],
    ).map_err(|e| format!("Insert failed: {}", e))?;
    Ok(())
}

pub fn get_credential(conn: &Connection, account_id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT credential FROM accounts WHERE id = ?1",
        params![account_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("Credential not found: {}", e))
}

pub fn update_credential(
    conn: &Connection,
    account_id: &str,
    credential: &str,
) -> Result<(), String> {
    let count = conn
        .execute(
            "UPDATE accounts SET credential = ?1 WHERE id = ?2",
            params![credential, account_id],
        )
        .map_err(|e| format!("Update failed: {}", e))?;
    if count == 0 {
        return Err("账号未找到".into());
    }
    Ok(())
}

pub fn insert_quota_history(
    conn: &Connection,
    account_id: &str,
    primary_used: Option<f64>,
    secondary_used: Option<f64>,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO quota_history (account_id, primary_used_percent, secondary_used_percent, recorded_at) VALUES (?1, ?2, ?3, ?4)",
        params![account_id, primary_used, secondary_used, now],
    ).map_err(|e| format!("Insert quota history failed: {}", e))?;
    Ok(())
}

pub fn get_quota_history(
    conn: &Connection,
    account_id: &str,
    limit: i64,
) -> Result<Vec<(f64, f64, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(primary_used_percent, 0), COALESCE(secondary_used_percent, 0), recorded_at
             FROM quota_history WHERE account_id = ?1
             ORDER BY recorded_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![account_id, limit], |row| {
            Ok((
                row.get::<_, f64>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    results.reverse();
    Ok(results)
}

pub fn get_latest_quota(conn: &Connection, account_id: &str) -> Option<f64> {
    conn.query_row(
        "SELECT primary_used_percent FROM quota_history WHERE account_id = ?1 ORDER BY recorded_at DESC LIMIT 1",
        params![account_id],
        |row| row.get::<_, Option<f64>>(0),
    )
    .ok()
    .flatten()
}

pub fn delete(conn: &Connection, account_id: &str) -> Result<bool, String> {
    let count = conn
        .execute("DELETE FROM accounts WHERE id = ?1", params![account_id])
        .map_err(|e| format!("Delete failed: {}", e))?;
    Ok(count > 0)
}

pub fn update_last_active(conn: &Connection, account_id: &str) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE accounts SET last_active_at = ?1 WHERE id = ?2",
        params![now, account_id],
    )
    .map_err(|e| format!("Update failed: {}", e))?;
    Ok(())
}

pub fn update_name(conn: &Connection, account_id: &str, name: &str) -> Result<(), String> {
    let count = conn
        .execute(
            "UPDATE accounts SET name = ?1 WHERE id = ?2",
            params![name, account_id],
        )
        .map_err(|e| format!("Update failed: {}", e))?;
    if count == 0 {
        return Err("账号未找到".into());
    }
    Ok(())
}

pub fn save_thread(
    conn: &Connection,
    id: &str,
    account_id: &str,
    title: &str,
    status: &str,
    created_at: &str,
    updated_at: &str,
    turn_count: i64,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO threads (id, account_id, title, status, created_at, updated_at, turn_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, account_id, title, status, created_at, updated_at, turn_count],
    )
    .map_err(|e| format!("Save thread failed: {}", e))?;
    Ok(())
}

pub fn load_threads(conn: &Connection, account_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, account_id, title, status, created_at, updated_at, turn_count
             FROM threads WHERE account_id = ?1 ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![account_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "accountId": row.get::<_, String>(1)?,
                "title": row.get::<_, String>(2)?,
                "status": row.get::<_, String>(3)?,
                "createdAt": row.get::<_, String>(4)?,
                "updatedAt": row.get::<_, String>(5)?,
                "turnCount": row.get::<_, i64>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut threads = Vec::new();
    for row in rows {
        threads.push(row.map_err(|e| e.to_string())?);
    }
    Ok(threads)
}

pub fn save_turn_item(
    conn: &Connection,
    id: &str,
    thread_id: &str,
    turn_id: &str,
    kind: &str,
    content: &str,
    timestamp: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO turn_items (id, thread_id, turn_id, kind, content, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, thread_id, turn_id, kind, content, timestamp],
    )
    .map_err(|e| format!("Save turn item failed: {}", e))?;
    Ok(())
}

pub fn load_turn_items(
    conn: &Connection,
    thread_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, thread_id, turn_id, kind, content, timestamp
             FROM turn_items WHERE thread_id = ?1 ORDER BY timestamp",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![thread_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "threadId": row.get::<_, String>(1)?,
                "turnId": row.get::<_, String>(2)?,
                "kind": row.get::<_, String>(3)?,
                "content": row.get::<_, String>(4)?,
                "timestamp": row.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(|e| e.to_string())?);
    }
    Ok(items)
}

pub fn delete_thread(conn: &Connection, thread_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM turn_items WHERE thread_id = ?1",
        params![thread_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM threads WHERE id = ?1", params![thread_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate_add_prompt_templates(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            is_favorite INTEGER NOT NULL DEFAULT 0,
            use_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_prompt_category ON prompt_templates(category);",
    )
    .map_err(|e| format!("Prompt templates migration failed: {}", e))?;
    Ok(())
}

fn migrate_add_proxy_providers(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS proxy_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            provider_type TEXT NOT NULL,
            api_key TEXT NOT NULL,
            base_url TEXT NOT NULL,
            models_json TEXT NOT NULL DEFAULT '[]',
            enabled INTEGER NOT NULL DEFAULT 1
        );",
    )
    .map_err(|e| format!("Proxy providers migration failed: {}", e))?;
    Ok(())
}

pub fn insert_prompt_template(
    conn: &Connection,
    id: &str,
    title: &str,
    content: &str,
    category: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO prompt_templates (id, title, content, category, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, title, content, category, now],
    )
    .map_err(|e| format!("Insert prompt failed: {}", e))?;
    Ok(())
}

pub fn update_prompt_template(
    conn: &Connection,
    id: &str,
    title: &str,
    content: &str,
    category: &str,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    let count = conn
        .execute(
            "UPDATE prompt_templates SET title = ?1, content = ?2, category = ?3, updated_at = ?4 WHERE id = ?5",
            params![title, content, category, now, id],
        )
        .map_err(|e| format!("Update prompt failed: {}", e))?;
    if count == 0 {
        return Err("模板未找到".into());
    }
    Ok(())
}

pub fn delete_prompt_template(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM prompt_templates WHERE id = ?1", params![id])
        .map_err(|e| format!("Delete prompt failed: {}", e))?;
    Ok(())
}

pub fn toggle_prompt_favorite(conn: &Connection, id: &str) -> Result<bool, String> {
    let current: bool = conn
        .query_row(
            "SELECT is_favorite FROM prompt_templates WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Prompt not found: {}", e))?;
    let next = !current;
    conn.execute(
        "UPDATE prompt_templates SET is_favorite = ?1 WHERE id = ?2",
        params![next, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(next)
}

pub fn increment_prompt_use_count(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE prompt_templates SET use_count = use_count + 1 WHERE id = ?1",
        params![id],
    )
    .map_err(|e| format!("Increment use count failed: {}", e))?;
    Ok(())
}

pub fn load_prompt_templates(conn: &Connection) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, category, is_favorite, use_count, created_at, updated_at
             FROM prompt_templates ORDER BY is_favorite DESC, use_count DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, String>(1)?,
                "content": row.get::<_, String>(2)?,
                "category": row.get::<_, String>(3)?,
                "isFavorite": row.get::<_, bool>(4)?,
                "useCount": row.get::<_, i64>(5)?,
                "createdAt": row.get::<_, String>(6)?,
                "updatedAt": row.get::<_, String>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn get_prompt_categories(conn: &Connection) -> Vec<String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT category FROM prompt_templates WHERE category != '' ORDER BY category",
        )
        .unwrap();
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).unwrap();
    rows.filter_map(|r| r.ok()).collect()
}

fn migrate_add_operation_log(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS operation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            from_account TEXT,
            to_account TEXT,
            trigger_type TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_oplog_created ON operation_log(created_at);",
    )
    .map_err(|e| format!("Operation log migration failed: {}", e))?;
    Ok(())
}

pub fn insert_operation_log(
    conn: &Connection,
    action: &str,
    from_account: Option<&str>,
    to_account: Option<&str>,
    trigger_type: &str,
    detail: Option<&str>,
) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO operation_log (action, from_account, to_account, trigger_type, detail, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![action, from_account, to_account, trigger_type, detail, now],
    )
    .map_err(|e| format!("Insert operation log failed: {}", e))?;
    Ok(())
}

pub fn get_operation_logs(conn: &Connection, limit: i64) -> Result<Vec<serde_json::Value>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, action, from_account, to_account, trigger_type, detail, created_at
             FROM operation_log ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "action": row.get::<_, String>(1)?,
                "fromAccount": row.get::<_, Option<String>>(2)?,
                "toAccount": row.get::<_, Option<String>>(3)?,
                "triggerType": row.get::<_, String>(4)?,
                "detail": row.get::<_, Option<String>>(5)?,
                "createdAt": row.get::<_, String>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for row in rows {
        results.push(row.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

pub fn clear_operation_logs(conn: &Connection) -> Result<i64, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM operation_log", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM operation_log", [])
        .map_err(|e| format!("Clear operation log failed: {}", e))?;
    Ok(count)
}

fn migrate_add_sort_order(conn: &Connection) -> Result<(), String> {
    let has_col: bool = conn
        .prepare("SELECT sort_order FROM accounts LIMIT 0")
        .is_ok();
    if !has_col {
        conn.execute_batch("ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
            .map_err(|e| format!("Sort order migration failed: {}", e))?;
    }
    Ok(())
}

pub fn update_sort_orders(conn: &Connection, id_order: &[(String, i32)]) -> Result<(), String> {
    let mut stmt = conn
        .prepare("UPDATE accounts SET sort_order = ?1 WHERE id = ?2")
        .map_err(|e| e.to_string())?;
    for (id, order) in id_order {
        stmt.execute(params![order, id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init(&conn).unwrap();
        conn
    }

    fn make_account(id: &str, name: &str, method: AuthMethod) -> Account {
        Account {
            id: id.into(),
            name: name.into(),
            auth_method: method,
            status: AccountStatus::Disconnected,
            max_threads: 6,
            active_threads: 0,
            created_at: "2025-01-01T00:00:00Z".into(),
            last_active_at: None,
            tag: None,
            priority: 0,
            model_preference: None,
        }
    }

    #[test]
    fn init_creates_tables() {
        let conn = setup();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('accounts','threads','turn_items')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn insert_and_load_roundtrip() {
        let conn = setup();
        let acc = make_account("a1", "Alice", AuthMethod::ApiKey);
        insert(&conn, &acc, "sk-test-key").unwrap();

        let loaded = load_all(&conn).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "a1");
        assert_eq!(loaded[0].name, "Alice");
        assert!(matches!(loaded[0].auth_method, AuthMethod::ApiKey));
        assert!(matches!(loaded[0].status, AccountStatus::Disconnected));
    }

    #[test]
    fn insert_duplicate_fails() {
        let conn = setup();
        let acc = make_account("a1", "Alice", AuthMethod::ApiKey);
        insert(&conn, &acc, "sk-key").unwrap();
        assert!(insert(&conn, &acc, "sk-key").is_err());
    }

    #[test]
    fn delete_existing_returns_true() {
        let conn = setup();
        insert(
            &conn,
            &make_account("a1", "A", AuthMethod::ApiKey),
            "sk-key",
        )
        .unwrap();
        assert!(delete(&conn, "a1").unwrap());
        assert!(load_all(&conn).unwrap().is_empty());
    }

    #[test]
    fn delete_nonexisting_returns_false() {
        let conn = setup();
        assert!(!delete(&conn, "nonexistent").unwrap());
    }

    #[test]
    fn update_name_works() {
        let conn = setup();
        insert(
            &conn,
            &make_account("a1", "Old", AuthMethod::ApiKey),
            "sk-test",
        )
        .unwrap();
        update_name(&conn, "a1", "New").unwrap();
        let loaded = load_all(&conn).unwrap();
        assert_eq!(loaded[0].name, "New");
    }

    #[test]
    fn update_name_missing_fails() {
        let conn = setup();
        assert!(update_name(&conn, "missing", "X").is_err());
    }

    #[test]
    fn update_last_active_sets_timestamp() {
        let conn = setup();
        insert(
            &conn,
            &make_account("a1", "A", AuthMethod::ApiKey),
            "sk-test",
        )
        .unwrap();
        update_last_active(&conn, "a1").unwrap();
        let loaded = load_all(&conn).unwrap();
        assert!(loaded[0].last_active_at.is_some());
    }

    #[test]
    fn save_and_load_threads() {
        let conn = setup();
        insert(
            &conn,
            &make_account("a1", "A", AuthMethod::ApiKey),
            "sk-test",
        )
        .unwrap();
        save_thread(
            &conn,
            "t1",
            "a1",
            "My Thread",
            "active",
            "2025-01-01",
            "2025-01-01",
            0,
        )
        .unwrap();

        let threads = load_threads(&conn, "a1").unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0]["id"], "t1");
        assert_eq!(threads[0]["title"], "My Thread");
    }

    #[test]
    fn save_and_load_turn_items() {
        let conn = setup();
        insert(
            &conn,
            &make_account("a1", "A", AuthMethod::ApiKey),
            "sk-test",
        )
        .unwrap();
        save_thread(
            &conn,
            "t1",
            "a1",
            "",
            "active",
            "2025-01-01",
            "2025-01-01",
            0,
        )
        .unwrap();
        save_turn_item(
            &conn,
            "i1",
            "t1",
            "turn1",
            "text",
            "hello",
            "2025-01-01T00:00:00Z",
        )
        .unwrap();

        let items = load_turn_items(&conn, "t1").unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["content"], "hello");
        assert_eq!(items[0]["kind"], "text");
    }

    #[test]
    fn delete_thread_cascades_items() {
        let conn = setup();
        insert(
            &conn,
            &make_account("a1", "A", AuthMethod::ApiKey),
            "sk-test",
        )
        .unwrap();
        save_thread(
            &conn,
            "t1",
            "a1",
            "",
            "active",
            "2025-01-01",
            "2025-01-01",
            0,
        )
        .unwrap();
        save_turn_item(&conn, "i1", "t1", "turn1", "text", "hello", "2025-01-01").unwrap();

        delete_thread(&conn, "t1").unwrap();
        assert!(load_threads(&conn, "a1").unwrap().is_empty());
        assert!(load_turn_items(&conn, "t1").unwrap().is_empty());
    }

    #[test]
    fn load_all_orders_by_created_at() {
        let conn = setup();
        let mut a = make_account("a2", "B", AuthMethod::OAuth);
        a.created_at = "2025-02-01T00:00:00Z".into();
        let mut b = make_account("a1", "A", AuthMethod::ApiKey);
        b.created_at = "2025-01-01T00:00:00Z".into();
        insert(&conn, &a, "sk-test").unwrap();
        insert(&conn, &b, "sk-test").unwrap();

        let loaded = load_all(&conn).unwrap();
        assert_eq!(loaded[0].id, "a1");
        assert_eq!(loaded[1].id, "a2");
    }
}
