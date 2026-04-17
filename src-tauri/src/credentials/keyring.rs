use keyring::Entry;

const SERVICE_NAME: &str = "codex-manager";

fn entry_for(account_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, account_id).map_err(|e| format!("Keyring init error: {}", e))
}

pub fn store_credential(account_id: &str, credential: &str) -> Result<(), String> {
    entry_for(account_id)?
        .set_password(credential)
        .map_err(|e| format!("Failed to store credential: {}", e))
}

pub fn get_credential(account_id: &str) -> Result<String, String> {
    entry_for(account_id)?
        .get_password()
        .map_err(|e| format!("Failed to retrieve credential: {}", e))
}

pub fn delete_credential(account_id: &str) -> Result<(), String> {
    entry_for(account_id)?
        .delete_credential()
        .map_err(|e| format!("Failed to delete credential: {}", e))
}
