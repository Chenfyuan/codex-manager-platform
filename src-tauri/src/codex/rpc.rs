use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub jsonrpc: String,
    pub id: u64,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub jsonrpc: String,
    pub id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl RpcRequest {
    pub fn new(id: u64, method: &str, params: Option<serde_json::Value>) -> Self {
        Self {
            jsonrpc: "2.0".into(),
            id,
            method: method.into(),
            params,
        }
    }
}

impl RpcResponse {
    pub fn is_notification(&self) -> bool {
        self.id.is_none() && self.method.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rpc_request_new_has_correct_fields() {
        let req = RpcRequest::new(42, "thread/start", Some(serde_json::json!({"key": "val"})));
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.id, 42);
        assert_eq!(req.method, "thread/start");
        assert!(req.params.is_some());
    }

    #[test]
    fn rpc_request_serializes_correctly() {
        let req = RpcRequest::new(1, "test/method", None);
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"method\":\"test/method\""));
        assert!(!json.contains("\"params\""));
    }

    #[test]
    fn rpc_request_with_params_includes_params() {
        let req = RpcRequest::new(1, "m", Some(serde_json::json!({"a": 1})));
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"params\""));
    }

    #[test]
    fn rpc_response_is_notification_true() {
        let resp = RpcResponse {
            jsonrpc: "2.0".into(),
            id: None,
            result: None,
            error: None,
            method: Some("turn/started".into()),
            params: None,
        };
        assert!(resp.is_notification());
    }

    #[test]
    fn rpc_response_is_notification_false_with_id() {
        let resp = RpcResponse {
            jsonrpc: "2.0".into(),
            id: Some(1),
            result: Some(serde_json::json!({})),
            error: None,
            method: None,
            params: None,
        };
        assert!(!resp.is_notification());
    }

    #[test]
    fn rpc_response_is_notification_false_no_method() {
        let resp = RpcResponse {
            jsonrpc: "2.0".into(),
            id: None,
            result: None,
            error: None,
            method: None,
            params: None,
        };
        assert!(!resp.is_notification());
    }

    #[test]
    fn rpc_error_roundtrip() {
        let err = RpcError {
            code: -32600,
            message: "Invalid Request".into(),
            data: Some(serde_json::json!({"detail": "missing field"})),
        };
        let json = serde_json::to_string(&err).unwrap();
        let parsed: RpcError = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code, -32600);
        assert_eq!(parsed.message, "Invalid Request");
        assert!(parsed.data.is_some());
    }

    #[test]
    fn rpc_error_without_data_skips_field() {
        let err = RpcError {
            code: -1,
            message: "err".into(),
            data: None,
        };
        let json = serde_json::to_string(&err).unwrap();
        assert!(!json.contains("\"data\""));
    }
}
