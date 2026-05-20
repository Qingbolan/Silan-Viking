//! The stdio MCP server — a JSON-RPC 2.0 loop over stdin/stdout (`03` §3.2,
//! `08` §8.6).
//!
//! The Model Context Protocol is line-delimited JSON-RPC. This module reads
//! one request object per line, dispatches it, and writes one response object
//! per line. It implements the methods an MCP host needs to drive the server:
//!
//! - `initialize` — handshake; returns the `08` §8.6 instructions.
//! - `tools/list` — the 17-tool surface (`03` §3.2).
//! - `tools/call` — dispatch a tool by name to its `tools` function.
//! - `resources/list` / `resources/read` — the three read-only resources.
//!
//! Transport is deliberately minimal: one JSON object per line, no batching.
//! It is enough for an MCP host and keeps the server testable by feeding it
//! lines and reading lines back ([`handle_line`]).

use crate::{advertised_tool_specs, McpError, ToolGate, ToolSpec};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

/// A running MCP server bound to one content workspace.
pub struct McpServer {
    /// The `content/` directory served.
    content_root: PathBuf,
    /// The local `portfolio.db` — backs the `stats` tools' local cache.
    db_path: PathBuf,
    /// The project name reported by `initialize`.
    project: String,
    /// Which gated tool tiers to advertise. Defaults to "none gated open",
    /// matching the M9 default surface of 17 tools (`17` §17.2).
    gate: ToolGate,
}

impl McpServer {
    /// Create a server for a content workspace and its local `portfolio.db`.
    pub fn new(
        content_root: impl AsRef<Path>,
        db_path: impl AsRef<Path>,
        project: impl Into<String>,
    ) -> Self {
        Self {
            content_root: content_root.as_ref().to_path_buf(),
            db_path: db_path.as_ref().to_path_buf(),
            project: project.into(),
            gate: ToolGate::default(),
        }
    }

    /// Replace the tool gate. The CLI passes `ToolGate { deploy: true, .. }`
    /// when launched with `--enable-deploy`, etc. The gate controls which
    /// tools `tools/list` exposes; the closed set itself is unchanged.
    pub fn with_gate(mut self, gate: ToolGate) -> Self {
        self.gate = gate;
        self
    }

    /// Run the stdio loop: read JSON-RPC requests from `input` line by line,
    /// write responses to `output`. Returns when `input` reaches EOF.
    ///
    /// Notifications (requests without an `id`) are processed but produce no
    /// response, per JSON-RPC 2.0.
    pub fn serve<R: BufRead, W: Write>(&self, input: R, mut output: W) -> std::io::Result<()> {
        for line in input.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }
            if let Some(response) = self.handle_line(&line) {
                writeln!(output, "{response}")?;
                output.flush()?;
            }
        }
        Ok(())
    }

    /// Handle one JSON-RPC line. Returns `Some(response_json)` for a request,
    /// `None` for a notification or an unparseable line that has no id to
    /// answer to.
    pub fn handle_line(&self, line: &str) -> Option<String> {
        let request: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(e) => {
                // Parse error — JSON-RPC code -32700. No id is recoverable.
                return Some(error_response(
                    Value::Null,
                    -32700,
                    &format!("parse error: {e}"),
                ));
            }
        };
        let id = request.get("id").cloned();
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        let params = request.get("params").cloned().unwrap_or(Value::Null);

        // A request with no `id` is a notification: act, do not answer.
        let is_notification = id.is_none();
        let result = self.dispatch(method, &params);

        if is_notification {
            return None;
        }
        let id = id.unwrap_or(Value::Null);
        Some(match result {
            Ok(value) => success_response(id, value),
            Err(e) => error_response(id, -32603, &e.to_string()),
        })
    }

    /// Route a JSON-RPC method to its handler.
    fn dispatch(&self, method: &str, params: &Value) -> Result<Value, McpError> {
        match method {
            "initialize" => Ok(self.initialize()),
            "tools/list" => Ok(self.tools_list()),
            "tools/call" => self.tools_call(params),
            "resources/list" => Ok(self.resources_list()),
            "resources/read" => self.resources_read(params),
            // `ping` and lifecycle notifications are accepted as no-ops.
            "ping" | "notifications/initialized" => Ok(json!({})),
            other => Err(McpError::UnknownTool(format!("method `{other}`"))),
        }
    }

    /// The `initialize` result — protocol info + the `08` §8.6 instructions.
    fn initialize(&self) -> Value {
        let instr = crate::server_instructions(&self.content_root, &self.project);
        let commit = instr.content_commit.as_deref().unwrap_or("unknown");
        let instructions = format!(
            "This MCP server exposes silan-viking, silan's personal context system.\n\
             First call context_brief(). Published resources are read/propose only.\n\
             Agent memory under silan://agent/ may be updated with ctx_write.\n\
             Never accept, publish, or deploy without an explicit owner CLI action.\n\
             Schema version: {}. Content commit: {commit}.\n\
             Useful resources: silan://schema, silan://overview, silan://agent/brief.",
            instr.schema_version
        );
        json!({
            "protocolVersion": "2024-11-05",
            "serverInfo": { "name": "silan-viking", "version": env!("CARGO_PKG_VERSION") },
            "capabilities": { "tools": {}, "resources": {} },
            "instructions": instructions
        })
    }

    /// The `tools/list` result — the advertised tool surface. Filtered
    /// by the server's gate so deploy / E-stage tools stay hidden until
    /// explicitly enabled (`17` §17.2).
    fn tools_list(&self) -> Value {
        let tools: Vec<Value> = advertised_tool_specs(self.gate)
            .iter()
            .map(tool_to_json)
            .collect();
        json!({ "tools": tools })
    }

    /// The `tools/call` handler — dispatch by tool name to the `tools` module.
    fn tools_call(&self, params: &Value) -> Result<Value, McpError> {
        let name = params
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| McpError::InvalidRequest("tools/call missing `name`".to_owned()))?;
        let args = params.get("arguments").cloned().unwrap_or(json!({}));
        let result = crate::call(
            &self.content_root,
            &self.db_path,
            &self.project,
            name,
            &args,
        )?;
        // MCP wraps tool output in a content array.
        Ok(json!({
            "content": [{ "type": "text", "text": result.to_string() }],
            "isError": false,
            "structuredContent": result
        }))
    }

    /// The `resources/list` result — the three read-only resources (`08` §8.6).
    fn resources_list(&self) -> Value {
        json!({
            "resources": [
                { "uri": "silan://schema",      "name": "SCHEMA.md",     "mimeType": "text/markdown" },
                { "uri": "silan://overview",    "name": "overview",      "mimeType": "text/markdown" },
                { "uri": "silan://agent/brief", "name": "agent brief",   "mimeType": "text/markdown" }
            ]
        })
    }

    /// The `resources/read` handler.
    fn resources_read(&self, params: &Value) -> Result<Value, McpError> {
        let uri = params
            .get("uri")
            .and_then(Value::as_str)
            .ok_or_else(|| McpError::InvalidRequest("resources/read missing `uri`".to_owned()))?;
        let text = crate::read_resource(&self.content_root, uri)?;
        Ok(json!({
            "contents": [{ "uri": uri, "mimeType": "text/markdown", "text": text }]
        }))
    }
}

/// Render a [`ToolSpec`] as an MCP tool descriptor.
fn tool_to_json(spec: &ToolSpec) -> Value {
    json!({
        "name": spec.name,
        "description": spec.description,
        "inputSchema": spec.input_schema,
    })
}

/// A JSON-RPC 2.0 success response line.
fn success_response(id: Value, result: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string()
}

/// A JSON-RPC 2.0 error response line.
fn error_response(id: Value, code: i32, message: &str) -> String {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_error_yields_minus_32700() {
        let server = McpServer::new("/tmp/nonexistent", "/tmp/nonexistent/portfolio.db", "test");
        let resp = server.handle_line("{not json").expect("response");
        assert!(resp.contains("-32700"));
    }

    #[test]
    fn notification_produces_no_response() {
        let server = McpServer::new("/tmp/nonexistent", "/tmp/nonexistent/portfolio.db", "test");
        // No `id` -> notification -> no response.
        let resp = server.handle_line(r#"{"jsonrpc":"2.0","method":"ping"}"#);
        assert!(resp.is_none());
    }
}
