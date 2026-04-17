use super::types::*;

pub fn openai_to_claude(req: &OpenAIRequest, model_map: &str) -> ClaudeRequest {
    let mut system_prompt: Option<String> = None;
    let mut messages: Vec<ClaudeMessage> = Vec::new();

    for msg in &req.messages {
        if msg.role == "system" {
            let text = msg.content.as_text();
            system_prompt = Some(match system_prompt {
                Some(existing) => format!("{}\n{}", existing, text),
                None => text,
            });
        } else {
            messages.push(ClaudeMessage {
                role: msg.role.clone(),
                content: msg.content.as_text(),
            });
        }
    }

    let stop_sequences = req.stop.as_ref().and_then(|s| match s {
        serde_json::Value::String(st) => Some(vec![st.clone()]),
        serde_json::Value::Array(arr) => Some(
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect(),
        ),
        _ => None,
    });

    ClaudeRequest {
        model: model_map.to_string(),
        max_tokens: req.max_tokens.unwrap_or(8192),
        messages,
        system: system_prompt,
        stream: req.stream,
        temperature: req.temperature,
        top_p: req.top_p,
        stop_sequences,
    }
}

pub fn claude_to_openai(resp: &ClaudeResponse, requested_model: &str) -> OpenAIResponse {
    let content = resp
        .content
        .iter()
        .filter(|b| b.block_type == "text")
        .map(|b| b.text.as_str())
        .collect::<Vec<_>>()
        .join("");

    let finish_reason = resp.stop_reason.as_deref().map(translate_stop_reason);

    OpenAIResponse {
        id: format!("chatcmpl-{}", &resp.id),
        object: "chat.completion".to_string(),
        created: chrono::Utc::now().timestamp(),
        model: requested_model.to_string(),
        choices: vec![OpenAIChoice {
            index: 0,
            message: OpenAIMessage {
                role: "assistant".to_string(),
                content: MessageContent::Text(content),
            },
            finish_reason,
        }],
        usage: OpenAIUsage {
            prompt_tokens: resp.usage.input_tokens,
            completion_tokens: resp.usage.output_tokens,
            total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
        },
    }
}

pub fn translate_stop_reason(reason: &str) -> String {
    match reason {
        "end_turn" => "stop",
        "max_tokens" => "length",
        "stop_sequence" => "stop",
        "tool_use" => "tool_calls",
        _ => "stop",
    }
    .to_string()
}

pub fn make_stream_chunk(
    id: &str,
    model: &str,
    content: Option<&str>,
    finish_reason: Option<&str>,
) -> OpenAIStreamChunk {
    OpenAIStreamChunk {
        id: id.to_string(),
        object: "chat.completion.chunk".to_string(),
        created: chrono::Utc::now().timestamp(),
        model: model.to_string(),
        choices: vec![OpenAIStreamChoice {
            index: 0,
            delta: OpenAIDelta {
                role: if content.is_some() && finish_reason.is_none() {
                    None
                } else if finish_reason.is_none() {
                    Some("assistant".to_string())
                } else {
                    None
                },
                content: content.map(String::from),
            },
            finish_reason: finish_reason.map(|r| translate_stop_reason(r)),
        }],
    }
}

pub fn responses_input_to_claude_messages(
    input: &[serde_json::Value],
) -> (Option<String>, Vec<ClaudeMessage>) {
    let mut system_prompt: Option<String> = None;
    let mut messages: Vec<ClaudeMessage> = Vec::new();

    for item in input {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let role = item.get("role").and_then(|v| v.as_str()).unwrap_or("user");

        match item_type {
            "message" => {
                let content = extract_content_text(item);
                if role == "system" {
                    system_prompt = Some(match system_prompt {
                        Some(existing) => format!("{}\n{}", existing, content),
                        None => content,
                    });
                } else {
                    let claude_role = if role == "assistant" {
                        "assistant"
                    } else {
                        "user"
                    };
                    messages.push(ClaudeMessage {
                        role: claude_role.to_string(),
                        content,
                    });
                }
            }
            "function_call_output" | "tool_result" => {
                let output = item.get("output").and_then(|v| v.as_str()).unwrap_or("");
                messages.push(ClaudeMessage {
                    role: "user".to_string(),
                    content: format!("[Tool Result]: {}", output),
                });
            }
            _ => {
                let content = extract_content_text(item);
                if !content.is_empty() {
                    let claude_role = if role == "assistant" {
                        "assistant"
                    } else {
                        "user"
                    };
                    messages.push(ClaudeMessage {
                        role: claude_role.to_string(),
                        content,
                    });
                }
            }
        }
    }

    if messages.is_empty() {
        messages.push(ClaudeMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        });
    }

    (system_prompt, messages)
}

fn extract_content_text(item: &serde_json::Value) -> String {
    if let Some(content) = item.get("content") {
        match content {
            serde_json::Value::String(s) => return s.clone(),
            serde_json::Value::Array(arr) => {
                let texts: Vec<&str> = arr
                    .iter()
                    .filter_map(|part| {
                        let t = part.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if t == "input_text" || t == "output_text" || t == "text" {
                            part.get("text").and_then(|v| v.as_str())
                        } else {
                            None
                        }
                    })
                    .collect();
                if !texts.is_empty() {
                    return texts.join("");
                }
            }
            _ => {}
        }
    }
    String::new()
}

pub fn responses_to_claude_request(
    req: &super::types::ResponsesCreateRequest,
    target_model: &str,
) -> ClaudeRequest {
    let (system, messages) = responses_input_to_claude_messages(&req.input);
    let max_tokens = req.max_output_tokens.or(req.max_tokens).unwrap_or(16384);

    ClaudeRequest {
        model: target_model.to_string(),
        max_tokens,
        messages,
        system,
        stream: true,
        temperature: req.temperature,
        top_p: None,
        stop_sequences: None,
    }
}

pub fn make_responses_event(event_type: &str, data: serde_json::Value) -> String {
    let mut event = data;
    event.as_object_mut().map(|obj| {
        obj.insert(
            "type".to_string(),
            serde_json::Value::String(event_type.to_string()),
        );
    });
    serde_json::to_string(&event).unwrap_or_default()
}

pub fn responses_to_openai_chat(
    req: &super::types::ResponsesCreateRequest,
    target_model: &str,
) -> OpenAIRequest {
    let (system, claude_messages) = responses_input_to_claude_messages(&req.input);

    let mut messages: Vec<OpenAIMessage> = Vec::new();
    if let Some(sys) = system {
        messages.push(OpenAIMessage {
            role: "system".to_string(),
            content: MessageContent::Text(sys),
        });
    }
    for m in claude_messages {
        messages.push(OpenAIMessage {
            role: m.role,
            content: MessageContent::Text(m.content),
        });
    }

    OpenAIRequest {
        model: target_model.to_string(),
        messages,
        stream: true,
        temperature: req.temperature,
        max_tokens: req.max_output_tokens.or(req.max_tokens),
        top_p: None,
        stop: None,
    }
}

pub enum StreamDelta {
    Text(String),
    InputTokens(u32),
    OutputTokens(u32),
    Done,
    Skip,
}

pub fn parse_sse_event_anthropic(data: &str) -> StreamDelta {
    if let Ok(evt) = serde_json::from_str::<ClaudeStreamEvent>(data) {
        match evt.event_type.as_str() {
            "message_start" => {
                if let Some(msg) = &evt.message {
                    if let Some(usage) = msg.get("usage") {
                        let tokens = usage
                            .get("input_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        return StreamDelta::InputTokens(tokens);
                    }
                }
                StreamDelta::Skip
            }
            "content_block_delta" => {
                if let Some(delta) = &evt.delta {
                    if let Some(text) = delta.get("text").and_then(|v| v.as_str()) {
                        return StreamDelta::Text(text.to_string());
                    }
                }
                StreamDelta::Skip
            }
            "message_delta" => {
                if let Some(delta) = &evt.delta {
                    if let Some(usage) = delta.get("usage") {
                        let tokens = usage
                            .get("output_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        return StreamDelta::OutputTokens(tokens);
                    }
                }
                StreamDelta::Skip
            }
            "message_stop" => StreamDelta::Done,
            _ => StreamDelta::Skip,
        }
    } else {
        StreamDelta::Skip
    }
}

pub fn parse_sse_event_openai(data: &str) -> StreamDelta {
    if data == "[DONE]" {
        return StreamDelta::Done;
    }
    if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(data) {
        if let Some(choices) = chunk.get("choices").and_then(|c| c.as_array()) {
            if let Some(choice) = choices.first() {
                if choice
                    .get("finish_reason")
                    .and_then(|v| v.as_str())
                    .is_some()
                {
                    if let Some(usage) = chunk.get("usage") {
                        let out = usage
                            .get("completion_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        return StreamDelta::OutputTokens(out);
                    }
                    return StreamDelta::Done;
                }
                if let Some(delta) = choice.get("delta") {
                    if let Some(text) = delta.get("content").and_then(|v| v.as_str()) {
                        return StreamDelta::Text(text.to_string());
                    }
                }
            }
        }
        if let Some(usage) = chunk.get("usage") {
            let inp = usage
                .get("prompt_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            let out = usage
                .get("completion_tokens")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
            if inp > 0 {
                return StreamDelta::InputTokens(inp);
            }
            if out > 0 {
                return StreamDelta::OutputTokens(out);
            }
        }
    }
    StreamDelta::Skip
}
