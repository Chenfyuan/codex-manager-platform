use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostBucket {
    pub start_time: i64,
    pub end_time: i64,
    pub total_usd: f64,
    pub line_items: Vec<CostLineItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostLineItem {
    pub name: String,
    pub usd: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostsSummary {
    pub buckets: Vec<CostBucket>,
    pub total_usd: f64,
    pub days: i32,
}

#[derive(Deserialize)]
struct ApiCostsResponse {
    data: Vec<ApiBucket>,
    has_more: bool,
    next_page: Option<String>,
}

#[derive(Deserialize)]
struct ApiBucket {
    start_time: i64,
    end_time: i64,
    results: Vec<ApiCostResult>,
}

#[derive(Deserialize)]
struct ApiCostResult {
    amount: ApiAmount,
    line_item: Option<String>,
}

#[derive(Deserialize)]
struct ApiAmount {
    value: f64,
}

#[tauri::command]
pub async fn fetch_openai_costs(
    state: State<'_, AppState>,
    days: Option<i32>,
) -> Result<CostsSummary, String> {
    let admin_key = {
        let conn = state.db.lock().unwrap();
        db::get_setting(&conn, "openai_admin_key")
    };

    let admin_key = admin_key.ok_or("未配置 OpenAI Admin Key，请在设置中配置")?;
    if admin_key.is_empty() {
        return Err("Admin Key 为空".into());
    }

    let days = days.unwrap_or(7);
    let start_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
        - (days as i64) * 86400;

    let client = reqwest::Client::new();
    let mut all_buckets: Vec<CostBucket> = Vec::new();
    let mut page: Option<String> = None;

    loop {
        let mut req = client
            .get("https://api.openai.com/v1/organization/costs")
            .header("Authorization", format!("Bearer {}", admin_key))
            .query(&[
                ("start_time", start_time.to_string()),
                ("bucket_width", "1d".to_string()),
                ("limit", "31".to_string()),
                ("group_by[]", "line_item".to_string()),
            ]);

        if let Some(ref cursor) = page {
            req = req.query(&[("page", cursor.as_str())]);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| format!("请求失败: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("API 错误 {}: {}", status, body));
        }

        let data: ApiCostsResponse = resp
            .json()
            .await
            .map_err(|e| format!("解析失败: {}", e))?;

        for bucket in &data.data {
            let mut line_items = Vec::new();
            let mut bucket_total = 0.0;
            for r in &bucket.results {
                bucket_total += r.amount.value;
                line_items.push(CostLineItem {
                    name: r.line_item.clone().unwrap_or_else(|| "other".into()),
                    usd: r.amount.value,
                });
            }
            all_buckets.push(CostBucket {
                start_time: bucket.start_time,
                end_time: bucket.end_time,
                total_usd: bucket_total,
                line_items,
            });
        }

        if data.has_more {
            page = data.next_page;
        } else {
            break;
        }
    }

    let total_usd: f64 = all_buckets.iter().map(|b| b.total_usd).sum();

    Ok(CostsSummary {
        buckets: all_buckets,
        total_usd,
        days,
    })
}
