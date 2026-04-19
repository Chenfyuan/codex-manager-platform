use std::sync::Mutex;

use rusqlite::Connection;
use tokio::sync::Mutex as AsyncMutex;

use crate::codex::process::ProcessManager;
use crate::codex::types::Account;

pub struct AppState {
    pub accounts: Mutex<Vec<Account>>,
    pub process_manager: ProcessManager,
    pub db: Mutex<Connection>,
    pub oauth_login: AsyncMutex<Option<tokio::process::Child>>,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            accounts: Mutex::new(Vec::new()),
            process_manager: ProcessManager::new(),
            db: Mutex::new(db),
            oauth_login: AsyncMutex::new(None),
        }
    }
}
