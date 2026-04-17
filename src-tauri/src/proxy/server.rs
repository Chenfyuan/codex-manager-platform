use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::RwLock;
use tokio_stream::wrappers::ReceiverStream;

use super::translate;
use super::types::*;

pub struct ProxyState {
    pub providers: RwLock<Vec<ProxyProvider>>,
    pub request_count: AtomicU64,
    pub provider_stats: RwLock<HashMap<String, (u64, u64)>>,
    pub logs: RwLock<Vec<ProxyLog>>,
    pub http_client: reqwest::Client,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            providers: RwLock::new(Vec::new()),
            request_count: AtomicU64::new(0),
            provider_stats: RwLock::new(HashMap::new()),
            logs: RwLock::new(Vec::new()),
            http_client: reqwest::Client::new(),
        }
    }
}

type SharedState = Arc<ProxyState>;

fn find_provider_for_model(
    providers: &[ProxyProvider],
    model: &str,
) -> Option<(ProxyProvider, String)> {
    for provider in providers {
        if !provider.enabled {
            continue;
        }
        for mapping in &provider.models {
            if mapping.from == model || mapping.from == "*" {
                return Some((provider.clone(), mapping.to.clone()));
            }
        }
    }
    None
}

fn find_all_providers_for_model(
    providers: &[ProxyProvider],
    model: &str,
) -> Vec<(ProxyProvider, String)> {
    let mut results = Vec::new();
    for provider in providers {
        if !provider.enabled {
            continue;
        }
        for mapping in &provider.models {
            if mapping.from == model || mapping.from == "*" {
                results.push((provider.clone(), mapping.to.clone()));
                break;
            }
        }
    }
    results
}

async fn handle_chat_completions(
    State(state): State<SharedState>,
    Json(req): Json<OpenAIRequest>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    state.request_count.fetch_add(1, Ordering::Relaxed);
    let start = std::time::Instant::now();

    let providers = state.providers.read().await;
    let (provider, target_model) =
        find_provider_for_model(&providers, &req.model).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({
                    "error": {
                        "message": format!("No provider configured for model '{}'", req.model),
                        "type": "model_not_found",
                        "code": "model_not_found"
                    }
                })),
            )
        })?;
    drop(providers);

    match provider.provider_type.as_str() {
        "anthropic" => {
            handle_anthropic(&state, &req, &provider, &target_model, start).await
        }
        _ => Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": {
                    "message": format!("Unsupported provider type: {}", provider.provider_type),
                    "type": "invalid_request",
                    "code": "unsupported_provider"
                }
            })),
        )),
    }
}

async fn handle_anthropic(
    state: &SharedState,
    req: &OpenAIRequest,
    provider: &ProxyProvider,
    target_model: &str,
    start: std::time::Instant,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let claude_req = translate::openai_to_claude(req, target_model);

    let api_url = format!(
        "{}/v1/messages",
        provider.base_url.trim_end_matches('/')
    );

    let http_req = state
        .http_client
        .post(&api_url)
        .header("x-api-key", &provider.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&claude_req);

    if req.stream {
        handle_anthropic_stream(state, http_req, req, provider, target_model, start).await
    } else {
        handle_anthropic_sync(state, http_req, req, provider, target_model, start).await
    }
}

async fn handle_anthropic_sync(
    state: &SharedState,
    http_req: reqwest::RequestBuilder,
    req: &OpenAIRequest,
    provider: &ProxyProvider,
    target_model: &str,
    start: std::time::Instant,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let resp = http_req.send().await.map_err(|e| {
        record_error(state, provider);
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": {"message": format!("Upstream error: {}", e), "type": "upstream_error"}
            })),
        )
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        record_error(state, provider);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(serde_json::json!({
                "error": {"message": format!("Upstream {} error: {}", status, body), "type": "upstream_error"}
            })),
        ));
    }

    let claude_resp: ClaudeResponse = resp.json().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": {"message": format!("Failed to parse response: {}", e), "type": "parse_error"}
            })),
        )
    })?;

    let openai_resp = translate::claude_to_openai(&claude_resp, &req.model);
    let latency = start.elapsed().as_millis() as u64;

    record_success(state, provider, &req.model, target_model, &openai_resp.usage, latency).await;

    Ok(Json(openai_resp).into_response())
}

async fn handle_anthropic_stream(
    state: &SharedState,
    http_req: reqwest::RequestBuilder,
    req: &OpenAIRequest,
    provider: &ProxyProvider,
    target_model: &str,
    start: std::time::Instant,
) -> Result<axum::response::Response, (StatusCode, Json<serde_json::Value>)> {
    let resp = http_req.send().await.map_err(|e| {
        record_error(state, provider);
        (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({
                "error": {"message": format!("Upstream error: {}", e), "type": "upstream_error"}
            })),
        )
    })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        record_error(state, provider);
        return Err((
            StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::BAD_GATEWAY),
            Json(serde_json::json!({
                "error": {"message": format!("Upstream {} error: {}", status, body), "type": "upstream_error"}
            })),
        ));
    }

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, std::convert::Infallible>>(128);
    let chunk_id = format!("chatcmpl-{}", uuid::Uuid::new_v4());
    let model_name = req.model.clone();
    let provider_clone = provider.clone();
    let target_model_owned = target_model.to_string();
    let state_clone = Arc::clone(state);

    tokio::spawn(async move {
        let mut byte_stream = resp.bytes_stream();
        let mut buffer = String::new();
        let mut input_tokens: u32 = 0;
        let mut output_tokens: u32 = 0;

        let first_chunk = translate::make_stream_chunk(&chunk_id, &model_name, None, None);
        let _ = tx
            .send(Ok(Event::default().data(
                serde_json::to_string(&first_chunk).unwrap_or_default(),
            )))
            .await;

        while let Some(chunk_result) = byte_stream.next().await {
            let bytes = match chunk_result {
                Ok(b) => b,
                Err(_) => break,
            };
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                let data_line = event_block
                    .lines()
                    .find(|l| l.starts_with("data: "))
                    .map(|l| &l[6..]);

                if let Some(data) = data_line {
                    if let Ok(evt) = serde_json::from_str::<ClaudeStreamEvent>(data) {
                        match evt.event_type.as_str() {
                            "message_start" => {
                                if let Some(msg) = &evt.message {
                                    if let Some(usage) = msg.get("usage") {
                                        input_tokens = usage
                                            .get("input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0) as u32;
                                    }
                                }
                            }
                            "content_block_delta" => {
                                if let Some(delta) = &evt.delta {
                                    if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                                        let chunk = translate::make_stream_chunk(
                                            &chunk_id,
                                            &model_name,
                                            Some(text),
                                            None,
                                        );
                                        let _ = tx
                                            .send(Ok(Event::default().data(
                                                serde_json::to_string(&chunk).unwrap_or_default(),
                                            )))
                                            .await;
                                    }
                                }
                            }
                            "message_delta" => {
                                if let Some(delta) = &evt.delta {
                                    let stop_reason =
                                        delta.get("stop_reason").and_then(|v| v.as_str());
                                    if let Some(usage) = delta.get("usage").or(evt.message.as_ref().and_then(|m| m.get("usage"))) {
                                        output_tokens = usage
                                            .get("output_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0) as u32;
                                    }
                                    if let Some(reason) = stop_reason {
                                        let chunk = translate::make_stream_chunk(
                                            &chunk_id,
                                            &model_name,
                                            None,
                                            Some(reason),
                                        );
                                        let _ = tx
                                            .send(Ok(Event::default().data(
                                                serde_json::to_string(&chunk).unwrap_or_default(),
                                            )))
                                            .await;
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        let _ = tx.send(Ok(Event::default().data("[DONE]"))).await;

        let latency = start.elapsed().as_millis() as u64;
        let usage = OpenAIUsage {
            prompt_tokens: input_tokens,
            completion_tokens: output_tokens,
            total_tokens: input_tokens + output_tokens,
        };
        record_success(
            &state_clone,
            &provider_clone,
            &model_name,
            &target_model_owned,
            &usage,
            latency,
        )
        .await;
    });

    let stream = ReceiverStream::new(rx);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()).into_response())
}

fn record_error(state: &SharedState, provider: &ProxyProvider) {
    let state = Arc::clone(state);
    let pid = provider.id.clone();
    tokio::spawn(async move {
        let mut stats = state.provider_stats.write().await;
        let entry = stats.entry(pid).or_insert((0, 0));
        entry.1 += 1;
    });
}

async fn call_upstream(
    state: &SharedState,
    provider: &ProxyProvider,
    target_model: &str,
    req: &ResponsesCreateRequest,
) -> Result<reqwest::Response, String> {
    match provider.provider_type.as_str() {
        "anthropic" => {
            let claude_req = translate::responses_to_claude_request(req, target_model);
            let api_url = format!("{}/v1/messages", provider.base_url.trim_end_matches('/'));
            let resp = state
                .http_client
                .post(&api_url)
                .header("x-api-key", &provider.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&claude_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("上游 {} 错误: {}", status, body));
            }
            Ok(resp)
        }
        "openai" | _ => {
            let openai_req = translate::responses_to_openai_chat(req, target_model);
            let api_url = format!("{}/v1/chat/completions", provider.base_url.trim_end_matches('/'));
            let mut http_req = state
                .http_client
                .post(&api_url)
                .header("content-type", "application/json");
            if !provider.api_key.is_empty() {
                http_req = http_req.header("authorization", format!("Bearer {}", provider.api_key));
            }
            let resp = http_req
                .json(&openai_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("上游 {} 错误: {}", status, body));
            }
            Ok(resp)
        }
    }
}

async fn call_upstream_with_failover(
    state: &SharedState,
    candidates: &[(ProxyProvider, String)],
    req: &ResponsesCreateRequest,
) -> Result<(reqwest::Response, ProxyProvider, String), String> {
    let mut last_err = String::from("No providers available");
    for (provider, target_model) in candidates {
        match call_upstream(state, provider, target_model, req).await {
            Ok(resp) => return Ok((resp, provider.clone(), target_model.clone())),
            Err(e) => {
                log::warn!("Provider {} failed: {}, trying next...", provider.name, e);
                record_error(state, provider);
                last_err = e;
            }
        }
    }
    Err(last_err)
}

async fn record_success(
    state: &SharedState,
    provider: &ProxyProvider,
    model_requested: &str,
    model_actual: &str,
    usage: &OpenAIUsage,
    latency_ms: u64,
) {
    let mut stats = state.provider_stats.write().await;
    let entry = stats.entry(provider.id.clone()).or_insert((0, 0));
    entry.0 += 1;
    drop(stats);

    let log = ProxyLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        model_requested: model_requested.to_string(),
        model_actual: model_actual.to_string(),
        provider: provider.name.clone(),
        tokens_in: usage.prompt_tokens,
        tokens_out: usage.completion_tokens,
        latency_ms,
        status: "ok".to_string(),
    };

    let mut logs = state.logs.write().await;
    if logs.len() >= 500 {
        logs.drain(..100);
    }
    logs.push(log);
}

async fn handle_models(State(state): State<SharedState>) -> Json<OpenAIModelList> {
    let providers = state.providers.read().await;
    let mut models = Vec::new();

    for provider in providers.iter() {
        if !provider.enabled {
            continue;
        }
        for mapping in &provider.models {
            models.push(OpenAIModelEntry {
                id: mapping.from.clone(),
                object: "model".to_string(),
                created: 1700000000,
                owned_by: provider.name.clone(),
            });
        }
    }

    Json(OpenAIModelList {
        object: "list".to_string(),
        data: models,
    })
}

async fn handle_responses_ws_upgrade(
    State(state): State<SharedState>,
    ws: WebSocketUpgrade,
) -> axum::response::Response {
    ws.on_upgrade(move |socket| handle_responses_ws(socket, state)).into_response()
}

async fn handle_responses_http(
    State(state): State<SharedState>,
    body: axum::body::Bytes,
) -> axum::response::Response {

    let req: ResponsesCreateRequest = match serde_json::from_slice(&body) {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": {"message": format!("Invalid request: {}", e)}})),
            ).into_response();
        }
    };

    if req.generate == Some(false) {
        let response_id = format!("resp-{}", uuid::Uuid::new_v4());
        return Json(serde_json::json!({
            "id": response_id,
            "status": "completed",
            "output": []
        })).into_response();
    }

    state.request_count.fetch_add(1, Ordering::Relaxed);
    let start = std::time::Instant::now();

    let providers = state.providers.read().await;
    let candidates = find_all_providers_for_model(&providers, &req.model);
    drop(providers);

    if candidates.is_empty() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": {"message": format!("No provider for model '{}'", req.model)}})),
        ).into_response();
    }

    let result = call_upstream_with_failover(&state, &candidates, &req).await;

    let (resp, provider, target_model) = match result {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": {"message": e}}))).into_response();
        }
    };

    if req.stream {
        let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, std::convert::Infallible>>(128);
        let response_id = format!("resp-{}", uuid::Uuid::new_v4());
        let item_id = format!("item-{}", uuid::Uuid::new_v4());
        let model_name = req.model.clone();
        let provider_clone = provider.clone();
        let target_model_owned = target_model.to_string();
        let state_clone = Arc::clone(&state);

        let created_event = serde_json::json!({
            "type": "response.created",
            "response": {"id": &response_id, "status": "in_progress", "model": &model_name, "output": []}
        });
        let _ = tx.send(Ok(Event::default().data(serde_json::to_string(&created_event).unwrap_or_default()))).await;

        tokio::spawn(async move {
            let mut byte_stream = resp.bytes_stream();
            let mut buffer = String::new();
            let mut full_text = String::new();
            let mut input_tokens: u32 = 0;
            let mut output_tokens: u32 = 0;
            let is_anthropic = provider_clone.provider_type == "anthropic";

            while let Some(chunk_result) = byte_stream.next().await {
                let bytes = match chunk_result { Ok(b) => b, Err(_) => break };
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(pos) = buffer.find("\n\n") {
                    let event_block = buffer[..pos].to_string();
                    buffer = buffer[pos + 2..].to_string();
                    let data_line = event_block.lines().find(|l| l.starts_with("data: ")).map(|l| &l[6..]);
                    if let Some(data) = data_line {
                        let delta = if is_anthropic {
                            translate::parse_sse_event_anthropic(data)
                        } else {
                            translate::parse_sse_event_openai(data)
                        };
                        match delta {
                            translate::StreamDelta::Text(text) => {
                                full_text.push_str(&text);
                                let evt = serde_json::json!({"type": "response.output_text.delta", "item_id": &item_id, "output_index": 0, "content_index": 0, "delta": &text});
                                let _ = tx.send(Ok(Event::default().data(serde_json::to_string(&evt).unwrap_or_default()))).await;
                            }
                            translate::StreamDelta::InputTokens(t) => input_tokens = t,
                            translate::StreamDelta::OutputTokens(t) => output_tokens = t,
                            translate::StreamDelta::Done | translate::StreamDelta::Skip => {}
                        }
                    }
                }
            }

            let completed = serde_json::json!({
                "type": "response.completed",
                "response": {
                    "id": &response_id, "status": "completed", "model": &model_name,
                    "output": [{"id": &item_id, "type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": &full_text}]}],
                    "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": input_tokens + output_tokens}
                }
            });
            let _ = tx.send(Ok(Event::default().data(serde_json::to_string(&completed).unwrap_or_default()))).await;

            let latency = start.elapsed().as_millis() as u64;
            let usage = OpenAIUsage { prompt_tokens: input_tokens, completion_tokens: output_tokens, total_tokens: input_tokens + output_tokens };
            record_success(&state_clone, &provider_clone, &model_name, &target_model_owned, &usage, latency).await;
        });

        return Sse::new(ReceiverStream::new(rx)).keep_alive(KeepAlive::default()).into_response();
    }

    let claude_resp: ClaudeResponse = match resp.json().await {
        Ok(r) => r,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, Json(serde_json::json!({"error": {"message": format!("Parse error: {}", e)}}))).into_response();
        }
    };

    let full_text = claude_resp.content.iter().filter(|b| b.block_type == "text").map(|b| b.text.as_str()).collect::<Vec<_>>().join("");
    let response_id = format!("resp-{}", uuid::Uuid::new_v4());
    let item_id = format!("item-{}", uuid::Uuid::new_v4());
    let latency = start.elapsed().as_millis() as u64;
    let usage = OpenAIUsage { prompt_tokens: claude_resp.usage.input_tokens, completion_tokens: claude_resp.usage.output_tokens, total_tokens: claude_resp.usage.input_tokens + claude_resp.usage.output_tokens };
    record_success(&state, &provider, &req.model, &target_model, &usage, latency).await;

    Json(serde_json::json!({
        "id": response_id, "status": "completed", "model": &req.model,
        "output": [{"id": item_id, "type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": full_text}]}],
        "usage": {"input_tokens": claude_resp.usage.input_tokens, "output_tokens": claude_resp.usage.output_tokens, "total_tokens": claude_resp.usage.input_tokens + claude_resp.usage.output_tokens}
    })).into_response()
}

async fn handle_responses_ws(socket: WebSocket, state: SharedState) {
    let (mut ws_tx, mut ws_rx): (futures_util::stream::SplitSink<WebSocket, Message>, futures_util::stream::SplitStream<WebSocket>) = socket.split();

    while let Some(msg_result) = ws_rx.next().await {
        let msg = match msg_result {
            Ok(m) => m,
            Err(_) => break,
        };
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };

        let parsed: serde_json::Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let event_type = parsed.get("type").and_then(|v| v.as_str()).unwrap_or("");

        if event_type != "response.create" {
            continue;
        }

        let req: ResponsesCreateRequest = match serde_json::from_value(parsed) {
            Ok(r) => r,
            Err(e) => {
                let err_event = serde_json::json!({
                    "type": "error",
                    "error": {"message": format!("Invalid request: {}", e), "code": "invalid_request"}
                });
                let _ = ws_tx.send(Message::Text(serde_json::to_string(&err_event).unwrap_or_default().into())).await;
                continue;
            }
        };

        if req.generate == Some(false) {
            let response_id = format!("resp-{}", uuid::Uuid::new_v4());
            let prewarm_resp = serde_json::json!({
                "type": "response.completed",
                "response": {
                    "id": response_id,
                    "status": "completed",
                    "output": []
                }
            });
            let _ = ws_tx.send(Message::Text(serde_json::to_string(&prewarm_resp).unwrap_or_default().into())).await;
            continue;
        }

        state.request_count.fetch_add(1, Ordering::Relaxed);
        let start = std::time::Instant::now();

        let providers = state.providers.read().await;
        let candidates = find_all_providers_for_model(&providers, &req.model);
        drop(providers);

        if candidates.is_empty() {
            let err_event = serde_json::json!({
                "type": "error",
                "error": {"message": format!("No provider for model '{}'", req.model), "code": "model_not_found"}
            });
            let _ = ws_tx.send(Message::Text(serde_json::to_string(&err_event).unwrap_or_default().into())).await;
            continue;
        }

        let result = call_upstream_with_failover(&state, &candidates, &req).await;

        let (resp, provider, target_model) = match result {
            Err(e) => {
                let err_event = serde_json::json!({
                    "type": "error",
                    "error": {"message": e, "code": "upstream_error"}
                });
                let _ = ws_tx.send(Message::Text(serde_json::to_string(&err_event).unwrap_or_default().into())).await;
                continue;
            }
            Ok(r) => r,
        };

        let response_id = format!("resp-{}", uuid::Uuid::new_v4());

        let created_event = serde_json::json!({
            "type": "response.created",
            "response": {
                "id": &response_id,
                "status": "in_progress",
                "model": &req.model,
                "output": []
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&created_event).unwrap_or_default().into())).await;

        let in_progress_event = serde_json::json!({
            "type": "response.in_progress",
            "response": {
                "id": &response_id,
                "status": "in_progress"
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&in_progress_event).unwrap_or_default().into())).await;

        let item_id = format!("item-{}", uuid::Uuid::new_v4());
        let output_item_added = serde_json::json!({
            "type": "response.output_item.added",
            "output_index": 0,
            "item": {
                "id": &item_id,
                "type": "message",
                "role": "assistant",
                "status": "in_progress",
                "content": []
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&output_item_added).unwrap_or_default().into())).await;

        let content_part_added = serde_json::json!({
            "type": "response.content_part.added",
            "item_id": &item_id,
            "output_index": 0,
            "content_index": 0,
            "part": {
                "type": "output_text",
                "text": ""
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&content_part_added).unwrap_or_default().into())).await;

        let mut byte_stream = resp.bytes_stream();
        let mut buffer = String::new();
        let mut full_text = String::new();
        let mut input_tokens: u32 = 0;
        let mut output_tokens: u32 = 0;
        let is_anthropic = provider.provider_type == "anthropic";

        while let Some(chunk_result) = byte_stream.next().await {
            let bytes = match chunk_result {
                Ok(b) => b,
                Err(_) => break,
            };
            buffer.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                let data_line = event_block
                    .lines()
                    .find(|l| l.starts_with("data: "))
                    .map(|l| &l[6..]);

                if let Some(data) = data_line {
                    let delta = if is_anthropic {
                        translate::parse_sse_event_anthropic(data)
                    } else {
                        translate::parse_sse_event_openai(data)
                    };
                    match delta {
                        translate::StreamDelta::Text(text) => {
                            full_text.push_str(&text);
                            let text_delta = serde_json::json!({
                                "type": "response.output_text.delta",
                                "item_id": &item_id,
                                "output_index": 0,
                                "content_index": 0,
                                "delta": &text
                            });
                            let _ = ws_tx.send(Message::Text(serde_json::to_string(&text_delta).unwrap_or_default().into())).await;
                        }
                        translate::StreamDelta::InputTokens(t) => input_tokens = t,
                        translate::StreamDelta::OutputTokens(t) => output_tokens = t,
                        translate::StreamDelta::Done | translate::StreamDelta::Skip => {}
                    }
                }
            }
        }

        let text_done = serde_json::json!({
            "type": "response.output_text.done",
            "item_id": &item_id,
            "output_index": 0,
            "content_index": 0,
            "text": &full_text
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&text_done).unwrap_or_default().into())).await;

        let content_part_done = serde_json::json!({
            "type": "response.content_part.done",
            "item_id": &item_id,
            "output_index": 0,
            "content_index": 0,
            "part": {
                "type": "output_text",
                "text": &full_text
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&content_part_done).unwrap_or_default().into())).await;

        let output_item_done = serde_json::json!({
            "type": "response.output_item.done",
            "output_index": 0,
            "item": {
                "id": &item_id,
                "type": "message",
                "role": "assistant",
                "status": "completed",
                "content": [{
                    "type": "output_text",
                    "text": &full_text
                }]
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&output_item_done).unwrap_or_default().into())).await;

        let completed = serde_json::json!({
            "type": "response.completed",
            "response": {
                "id": &response_id,
                "status": "completed",
                "model": &req.model,
                "output": [{
                    "id": &item_id,
                    "type": "message",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{
                        "type": "output_text",
                        "text": &full_text
                    }]
                }],
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens
                }
            }
        });
        let _ = ws_tx.send(Message::Text(serde_json::to_string(&completed).unwrap_or_default().into())).await;

        let latency = start.elapsed().as_millis() as u64;
        let usage = OpenAIUsage {
            prompt_tokens: input_tokens,
            completion_tokens: output_tokens,
            total_tokens: input_tokens + output_tokens,
        };
        record_success(&state, &provider, &req.model, &target_model, &usage, latency).await;
    }
}

pub fn create_router(state: SharedState) -> Router {
    Router::new()
        .route("/v1/responses", get(handle_responses_ws_upgrade).post(handle_responses_http))
        .route("/responses", get(handle_responses_ws_upgrade).post(handle_responses_http))
        .route("/v1/chat/completions", post(handle_chat_completions))
        .route("/v1/models", get(handle_models))
        .with_state(state)
}

pub struct ProxyServer {
    state: SharedState,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    port: u16,
}

impl ProxyServer {
    pub fn new() -> Self {
        Self {
            state: Arc::new(ProxyState::new()),
            shutdown_tx: None,
            port: 0,
        }
    }

    pub fn state(&self) -> SharedState {
        Arc::clone(&self.state)
    }

    pub fn is_running(&self) -> bool {
        self.shutdown_tx.is_some()
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn start(&mut self, port: u16) -> Result<u16, String> {
        if self.is_running() {
            return Err("Proxy server is already running".to_string());
        }

        let actual_port = if port == 0 {
            portpicker::pick_unused_port().ok_or("No available port")?
        } else {
            port
        };

        let router = create_router(Arc::clone(&self.state));
        let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", actual_port))
            .await
            .map_err(|e| format!("Failed to bind port {}: {}", actual_port, e))?;

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = rx.await;
                })
                .await
                .ok();
        });

        self.shutdown_tx = Some(tx);
        self.port = actual_port;
        log::info!("Proxy server started on port {}", actual_port);
        Ok(actual_port)
    }

    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
            self.port = 0;
            log::info!("Proxy server stopped");
        }
    }

    pub async fn update_providers(&self, providers: Vec<ProxyProvider>) {
        let mut current = self.state.providers.write().await;
        *current = providers;
    }

    pub async fn get_status(&self) -> ProxyStatus {
        let providers = self.state.providers.read().await;
        let stats = self.state.provider_stats.read().await;

        let provider_statuses = providers
            .iter()
            .map(|p| {
                let (req_count, err_count) = stats.get(&p.id).copied().unwrap_or((0, 0));
                ProviderStatus {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    enabled: p.enabled,
                    request_count: req_count,
                    error_count: err_count,
                }
            })
            .collect();

        ProxyStatus {
            running: self.is_running(),
            port: self.port,
            request_count: self.state.request_count.load(Ordering::Relaxed),
            providers: provider_statuses,
        }
    }

    pub async fn get_logs(&self, limit: usize) -> Vec<ProxyLog> {
        let logs = self.state.logs.read().await;
        let start = if logs.len() > limit { logs.len() - limit } else { 0 };
        logs[start..].to_vec()
    }
}
