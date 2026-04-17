use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex, oneshot};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use super::rpc::{RpcRequest, RpcResponse};

const WS_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_CONNECT_RETRIES: u32 = 5;
const RPC_RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessState {
    Idle,
    Starting,
    Connected,
    Disconnected,
    Error,
}

struct PendingCall {
    tx: oneshot::Sender<Result<serde_json::Value, String>>,
}

pub struct CodexProcess {
    account_id: String,
    port: u16,
    child: Option<Child>,
    state: ProcessState,
    request_id: AtomicU64,
    write_tx: Option<mpsc::UnboundedSender<Message>>,
    pending: Arc<Mutex<HashMap<u64, PendingCall>>>,
}

impl CodexProcess {
    pub fn new(account_id: String) -> Self {
        Self {
            account_id,
            port: 0,
            child: None,
            state: ProcessState::Idle,
            request_id: AtomicU64::new(1),
            write_tx: None,
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn state(&self) -> ProcessState {
        self.state
    }

    pub async fn start(
        &mut self,
        api_key: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        self.state = ProcessState::Starting;
        self.emit_status(&app_handle);

        self.port = portpicker::pick_unused_port().ok_or("没有可用的端口")?;
        let addr = format!("127.0.0.1:{}", self.port);

        let child = Command::new("codex")
            .args(["app-server", "--listen", &format!("ws://{}", addr)])
            .env("CODEX_API_KEY", api_key)
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("启动 codex app-server 失败: {}", e))?;

        self.child = Some(child);

        let ws_url = format!("ws://{}", addr);
        let mut last_err = String::from("连接超时");

        for attempt in 0..MAX_CONNECT_RETRIES {
            let delay = Duration::from_millis(500 * 2u64.pow(attempt));
            tokio::time::sleep(delay).await;

            if let Some(ref mut child) = self.child {
                if let Ok(Some(exit)) = child.try_wait() {
                    self.state = ProcessState::Error;
                    self.emit_status(&app_handle);
                    return Err(format!("codex app-server 进程已退出 (code: {:?})", exit.code()));
                }
            }

            match tokio::time::timeout(WS_CONNECT_TIMEOUT, connect_async(&ws_url)).await {
                Ok(Ok((ws_stream, _))) => {
                    self.spawn_ws_loops(ws_stream, app_handle.clone());
                    self.state = ProcessState::Connected;
                    self.emit_status(&app_handle);
                    return Ok(());
                }
                Ok(Err(e)) => {
                    last_err = format!("WebSocket 连接失败: {}", e);
                }
                Err(_) => {
                    last_err = "WebSocket 连接超时".into();
                }
            }
        }

        self.state = ProcessState::Error;
        self.emit_status(&app_handle);
        self.stop().await;
        Err(format!("连接失败 ({}次重试后): {}", MAX_CONNECT_RETRIES, last_err))
    }

    fn spawn_ws_loops(
        &mut self,
        ws_stream: WebSocketStream<MaybeTlsStream<TcpStream>>,
        app_handle: AppHandle,
    ) {
        let (mut ws_write, mut ws_read) = ws_stream.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
        self.write_tx = Some(tx);

        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_write.send(msg).await.is_err() {
                    break;
                }
            }
        });

        let pending = self.pending.clone();
        let account_id = self.account_id.clone();

        tokio::spawn(async move {
            while let Some(Ok(msg)) = ws_read.next().await {
                if let Message::Text(text) = msg {
                    if let Ok(resp) = serde_json::from_str::<RpcResponse>(&text) {
                        if resp.is_notification() {
                            let method = resp.method.as_deref().unwrap_or("");
                            let _ = app_handle.emit("codex://stream", json!({
                                "accountId": account_id,
                                "method": method,
                                "params": resp.params,
                            }));
                        } else if let Some(id) = resp.id {
                            let mut map = pending.lock().await;
                            if let Some(call) = map.remove(&id) {
                                let result = match resp.error {
                                    Some(err) => Err(err.message),
                                    None => Ok(resp.result.unwrap_or(serde_json::Value::Null)),
                                };
                                let _ = call.tx.send(result);
                            }
                        }
                    }
                }
            }
        });
    }

    pub async fn send_rpc(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        let tx = self.write_tx.as_ref().ok_or("未连接")?;
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let req = RpcRequest::new(id, method, params);
        let payload = serde_json::to_string(&req).map_err(|e| e.to_string())?;

        let (resp_tx, resp_rx) = oneshot::channel();
        self.pending.lock().await.insert(id, PendingCall { tx: resp_tx });

        tx.send(Message::Text(payload.into()))
            .map_err(|e| format!("发送失败: {}", e))?;

        match tokio::time::timeout(RPC_RESPONSE_TIMEOUT, resp_rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("响应通道已关闭".into()),
            Err(_) => Err("RPC 请求超时 (30秒)".into()),
        }
    }

    pub async fn stop(&mut self) {
        self.write_tx.take();
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
        }
        self.state = ProcessState::Disconnected;
    }

    fn emit_status(&self, app_handle: &AppHandle) {
        let status = match self.state {
            ProcessState::Idle | ProcessState::Disconnected => "disconnected",
            ProcessState::Starting => "connecting",
            ProcessState::Connected => "connected",
            ProcessState::Error => "error",
        };
        let _ = app_handle.emit("codex://account-status", json!({
            "accountId": self.account_id,
            "status": status,
        }));
    }
}

pub struct ProcessManager {
    processes: Mutex<HashMap<String, CodexProcess>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }

    pub async fn start_process(
        &self,
        account_id: &str,
        api_key: &str,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let mut map = self.processes.lock().await;
        let process = map
            .entry(account_id.to_string())
            .or_insert_with(|| CodexProcess::new(account_id.to_string()));
        process.start(api_key, app_handle).await
    }

    pub async fn stop_process(&self, account_id: &str) {
        let mut map = self.processes.lock().await;
        if let Some(process) = map.get_mut(account_id) {
            process.stop().await;
        }
    }

    pub async fn send_rpc(
        &self,
        account_id: &str,
        method: &str,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, String> {
        let map = self.processes.lock().await;
        let process = map.get(account_id).ok_or("账号未连接")?;
        if process.state() != ProcessState::Connected {
            return Err("账号未连接".into());
        }
        process.send_rpc(method, params).await
    }
}
