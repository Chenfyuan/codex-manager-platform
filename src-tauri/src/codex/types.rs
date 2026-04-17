use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuthMethod {
    #[serde(rename = "api_key")]
    ApiKey,
    #[serde(rename = "oauth")]
    OAuth,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AccountStatus {
    #[serde(rename = "disconnected")]
    Disconnected,
    #[serde(rename = "connecting")]
    Connecting,
    #[serde(rename = "connected")]
    Connected,
    #[serde(rename = "error")]
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub name: String,
    pub auth_method: AuthMethod,
    pub status: AccountStatus,
    pub max_threads: u32,
    pub active_threads: u32,
    pub created_at: String,
    pub last_active_at: Option<String>,
    pub tag: Option<String>,
    pub priority: i32,
    pub model_preference: Option<String>,
}

impl Account {
    pub fn new(name: String, auth_method: AuthMethod) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            auth_method,
            status: AccountStatus::Disconnected,
            max_threads: 6,
            active_threads: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
            last_active_at: None,
            tag: None,
            priority: 0,
            model_preference: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_account_has_uuid_id() {
        let acc = Account::new("test".into(), AuthMethod::ApiKey);
        assert_eq!(acc.id.len(), 36);
        assert!(acc.id.contains('-'));
    }

    #[test]
    fn new_account_defaults() {
        let acc = Account::new("my-account".into(), AuthMethod::OAuth);
        assert_eq!(acc.name, "my-account");
        assert!(matches!(acc.auth_method, AuthMethod::OAuth));
        assert!(matches!(acc.status, AccountStatus::Disconnected));
        assert_eq!(acc.max_threads, 6);
        assert_eq!(acc.active_threads, 0);
        assert!(acc.last_active_at.is_none());
        assert!(!acc.created_at.is_empty());
    }

    #[test]
    fn account_serializes_to_camel_case() {
        let acc = Account::new("test".into(), AuthMethod::ApiKey);
        let json = serde_json::to_string(&acc).unwrap();
        assert!(json.contains("\"authMethod\""));
        assert!(json.contains("\"maxThreads\""));
        assert!(json.contains("\"createdAt\""));
        assert!(json.contains("\"api_key\""));
    }

    #[test]
    fn auth_method_roundtrip() {
        let json = serde_json::to_string(&AuthMethod::ApiKey).unwrap();
        assert_eq!(json, "\"api_key\"");
        let parsed: AuthMethod = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, AuthMethod::ApiKey));

        let json = serde_json::to_string(&AuthMethod::OAuth).unwrap();
        assert_eq!(json, "\"oauth\"");
    }

    #[test]
    fn two_accounts_have_different_ids() {
        let a = Account::new("a".into(), AuthMethod::ApiKey);
        let b = Account::new("b".into(), AuthMethod::ApiKey);
        assert_ne!(a.id, b.id);
    }
}
