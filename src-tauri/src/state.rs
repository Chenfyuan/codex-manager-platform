use std::sync::Mutex;

use rusqlite::Connection;

use crate::codex::process::ProcessManager;
use crate::codex::types::Account;

pub struct AppState {
    pub accounts: Mutex<Vec<Account>>,
    pub process_manager: ProcessManager,
    pub db: Mutex<Connection>,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            accounts: Mutex::new(Vec::new()),
            process_manager: ProcessManager::new(),
            db: Mutex::new(db),
        }
    }
}
