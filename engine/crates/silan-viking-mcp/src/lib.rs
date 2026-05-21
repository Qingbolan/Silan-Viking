//! `silan-viking-mcp` — M9 MCP adapter surface.
//!
//! This crate has two layers:
//! - the **tool functions** in this file — the 17 tools of `03` §3.2, each a
//!   plain function over a content workspace;
//! - the **stdio server** in [`server`] — a JSON-RPC 2.0 loop that an MCP
//!   host drives, dispatching `tools/call` to [`call`].
//!
//! Keeping the tools as transport-free functions lets both the server and
//! tests call them directly.

pub mod server;

pub use server::McpServer;

use serde::Serialize;
use silan_viking_app::{
    ContentKind, Identified, ProposalId, ProposalKind, ProposalTarget, QueryHit, StatsCache,
    Workspace,
};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;
use ulid::Ulid;

/// MCP tool mutability class.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ToolTier {
    /// Read-only workspace understanding.
    ReadOnly,
    /// Capture ideas as proposals.
    Capture,
    /// Direct `silan://agent` memory tools.
    AgentContext,
    /// Content proposal tools.
    Proposal,
    /// Deploy-class tools — gated; only advertised when the server is
    /// launched with `--enable-deploy` (`03` §3.2 / GOAL §5.2).
    Deploy,
    /// E-stage self-evolution tools (`15` §15.2 / §15.5.1). E1 ships
    /// `suggest_{relations,parts,lifecycle}`; E2 adds `propose_schema`.
    /// Listed in the closed set so they participate in dispatch coverage,
    /// gated at advertise time the same way as Deploy.
    Evolve,
}

/// One advertised MCP tool.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ToolSpec {
    /// Tool name.
    pub name: &'static str,
    /// Mutability tier.
    pub tier: ToolTier,
    /// Short contract description.
    pub description: &'static str,
    /// The tool's JSON-Schema `inputSchema` — the parameter contract an MCP
    /// client reads to know what arguments the tool accepts. Without it the
    /// client cannot pass through anything but guessed scalar args (an empty
    /// `{ "type": "object" }` drops structured params like `parts`).
    pub input_schema: serde_json::Value,
}

/// Initial handshake payload: schema version plus tool surface.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Handshake {
    /// `content/SCHEMA.md` version.
    pub schema_version: u32,
    /// All MCP tools exposed by M9.
    pub tools: Vec<ToolSpec>,
}

/// Read result for an item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ReadResult {
    /// Canonical URI.
    pub uri: String,
    /// Matching title.
    pub title: String,
    /// Languages available.
    pub languages: Vec<String>,
    /// The Part's prose body — `Some` when the URI addresses a single Part
    /// (`…/<slug>/<role>`), so an agent can read back what a Part currently
    /// says before revising it. `None` for an Item-level read (a summary).
    pub body: Option<String>,
}

/// MCP adapter errors.
#[derive(Debug, Error)]
pub enum McpError {
    /// Workspace open/scan/query failed.
    #[error("{0}")]
    Workspace(String),
    /// Context URI is outside `silan://agent`.
    #[error("agent context writes must target silan://agent")]
    InvalidAgentUri,
    /// File IO failed.
    #[error("{0}")]
    Io(String),
    /// A proposal operation (`capture` / `propose`) failed.
    #[error("proposal: {0}")]
    Proposal(String),
    /// A remote-only tool (stats family) was called without a deployed
    /// backend (`03` §3.2 `backend_unavailable`).
    #[error("{0}")]
    BackendUnavailable(String),
    /// A tool was called with a malformed or missing argument.
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    /// A tool name not in the advertised set was called.
    #[error("unknown tool `{0}`")]
    UnknownTool(String),
}

/// All tools required by M9's four-tier contract.
pub fn tool_specs() -> Vec<ToolSpec> {
    use ToolTier::*;
    vec![
        ToolSpec {
            name: "recall",
            tier: ReadOnly,
            description: "local lexical recall over content",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"query": {"type":"string","description":"the search query"},"limit": {"type":"integer","description":"max hits, default 10"}},
                "required": ["query"],
            }),
        },
        ToolSpec {
            name: "list",
            tier: ReadOnly,
            description: "structured list by content type and status",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"type": {"type":"string","description":"content type: idea/blog/project/episode/update/resume"},"filter": {"type":"object","description":"optional {status, tag} filter","properties":{"status":{"type":"string"},"tag":{"type":"string"}}}},
                "required": [],
            }),
        },
        ToolSpec {
            name: "list_tags",
            tier: ReadOnly,
            description: "enumerate every tag used across the workspace, with the number of Items each tag appears on. Optional `type` scopes to one content kind. Answer for the owner / agent question \"what tags am I using\".",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"type": {"type":"string","description":"optional content type: idea/blog/project/episode/update"}},
                "required": [],
            }),
        },
        ToolSpec {
            name: "browse",
            tier: ReadOnly,
            description: "browse content tree",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"silan:// node to browse, default silan://resources"}},
                "required": [],
            }),
        },
        ToolSpec {
            name: "read",
            tier: ReadOnly,
            description: "read content at a silan:// URI — an Item URI gives a \
                          summary; a Part URI (…/<slug>/<role>) gives that \
                          Part's full prose body, so you can read a Part back \
                          before revising or continuing it",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI to read"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "context_brief",
            tier: ReadOnly,
            description: "brief owner/project context",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": [],
            }),
        },
        ToolSpec {
            name: "lint",
            tier: ReadOnly,
            description: "parser and schema health check",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"optional silan:// URI to lint; omit for everything"}},
                "required": [],
            }),
        },
        ToolSpec {
            name: "stats",
            tier: ReadOnly,
            description: "view/like/comment counts (local stats cache)",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "visitors",
            tier: ReadOnly,
            description: "de-identified visitor list (local stats cache)",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "crawler_breakdown",
            tier: ReadOnly,
            description: "visitor-kind breakdown (local stats cache)",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "source_breakdown",
            tier: ReadOnly,
            description: "referrer-source breakdown (local stats cache)",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "capture",
            tier: Capture,
            description: "capture a thought into a proposal. With no `type` (or `type=note`) the note lands in agent/notes/ for the agent's scratch space. With `type=idea|blog|project|episode|update` it opens a new Item under silan://resources/<type>/<slug>/ scaffolded with the note as the primary Part's body — this is the path the owner uses to grow a half-formed thought into a real content Item.",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "note": {"type":"string","description":"the free-text note to capture"},
                    "type": {"type":"string","description":"optional content type: note (default) / idea / blog / project / episode / update. note → agent/notes/; the others scaffold a real Item under resources/"},
                    "slug": {"type":"string","description":"optional explicit slug; if omitted, derived from the first sentence of the note. Only used when type is a content kind."},
                    "title": {"type":"string","description":"optional explicit title; if omitted, derived from the first sentence of the note."}
                },
                "required": ["note"],
            }),
        },
        ToolSpec {
            name: "ctx_read",
            tier: AgentContext,
            description: "read silan://agent context",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"a silan://agent/... URI"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "ctx_write",
            tier: AgentContext,
            description: "write silan://agent context",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"a silan://agent/... URI"},"content": {"type":"string","description":"the content to write"}},
                "required": ["uri","content"],
            }),
        },
        ToolSpec {
            name: "ctx_brief",
            tier: AgentContext,
            description: "brief agent memory",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": [],
            }),
        },
        ToolSpec {
            name: "reflect",
            tier: AgentContext,
            description: "append session memory",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"session": {"type":"string","description":"the session summary to settle into agent memory"}},
                "required": ["session"],
            }),
        },
        ToolSpec {
            name: "propose",
            tier: Proposal,
            description: "draft a content proposal — targets a silan:// Item or Part. A URI whose Item does not exist yet is created; an existing one is modified. Give `draft` to write the anchored Part, and/or `parts` (a {role: content} object) to write sibling Parts. Omit `draft` and give only `parts` to ADD sibling Parts while leaving the primary Part (e.g. an Item's overview) untouched — at least one of draft/parts is required. `lang` picks the language variant (default en).",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item or Part URI to propose against"},"draft": {"type":"string","description":"the draft body for the anchored Part — omit to add only sibling Parts via `parts`"},"lang": {"type":"string","description":"language variant, default en"},"parts": {"type":"object","description":"additional Parts of the same Item, as a {role: content} object","additionalProperties":{"type":"string"}}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "summarize_updates",
            tier: Proposal,
            description: "draft update summary proposal",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"summary": {"type":"string","description":"the update summary text"}},
                "required": [],
            }),
        },
        // Deploy tool — the 18th member of the M9 closed set (GOAL §5 /
        // 17 §17.2). The server filters it out of `tools/list` unless
        // started with `--enable-deploy`; dispatch refuses it for the
        // same reason. Keeping it in `tool_specs()` means the closed-set
        // count matches the documented 18.
        ToolSpec {
            name: "deploy",
            tier: Deploy,
            description: "deploy the site via the bundled Docker pipeline — \
                          gated, only callable when the server runs with \
                          `--enable-deploy`",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "confirm": {"type":"boolean","description":"must be true to actually run the pipeline"}
                },
                "required": [],
            }),
        },
        // ── E1 stubs (`15` §15.2 / §15.5.1) ────────────────────────────
        // These three lift the closed set to 21. They are advertised only
        // when the server runs with `--enable-evolve` (`15` §15.5.1 gates
        // them the same way deploy is gated). The current implementation
        // returns an empty suggestion list — a legal output per the JSON
        // schema, plus a stable hook for the full algorithm to drop in
        // without changing the wire shape.
        ToolSpec {
            name: "suggest_relations",
            tier: Evolve,
            description: "scan the workspace for missing evolution edges \
                          (E1, `15` §15.2). Returns candidate \
                          `content_relation` rows the owner can accept.",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "scope": {"type":"array","items":{"type":"string"},"description":"optional URIs to restrict the scan"},
                    "limit": {"type":"integer","description":"max suggestions, default 20"}
                },
                "required": [],
            }),
        },
        ToolSpec {
            name: "suggest_parts",
            tier: Evolve,
            description: "propose missing Parts for an Item — e.g. an \
                          `experimenting` idea with no `progress` Part \
                          (E1, `15` §15.2).",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI to inspect"}},
                "required": ["uri"],
            }),
        },
        ToolSpec {
            name: "suggest_lifecycle",
            tier: Evolve,
            description: "propose a status transition based on content \
                          maturity (E1, `15` §15.2). For idea: \
                          draft→hypothesis→experimenting→validating→published.",
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"uri": {"type":"string","description":"the silan:// Item URI to assess"}},
                "required": ["uri"],
            }),
        },
    ]
}

/// The MCP server's advertise-time gating policy. Controls which tools
/// from the closed [`tool_specs`] set are surfaced through `tools/list`.
/// Dispatch still refuses gated tools that aren't enabled — the gate
/// applies to both surfaces so an agent that calls a hidden tool gets
/// the same `BackendUnavailable` either way.
#[derive(Debug, Clone, Copy, Default)]
pub struct ToolGate {
    /// Surface the `deploy` tool. Off by default; `--enable-deploy`.
    pub deploy: bool,
    /// Surface the E-stage `suggest_*` / `propose_schema` tools.
    /// Off by default; `--enable-evolve`.
    pub evolve: bool,
}

impl ToolGate {
    /// Build a gate that surfaces every tool — used by tests and by
    /// callers that need to enumerate the full closed set.
    pub fn all() -> Self {
        Self { deploy: true, evolve: true }
    }

    /// Decide whether a tool tier is advertised under this gate.
    fn allows(&self, tier: ToolTier) -> bool {
        match tier {
            ToolTier::Deploy => self.deploy,
            ToolTier::Evolve => self.evolve,
            _ => true,
        }
    }
}

/// Filter [`tool_specs`] to the subset the server should advertise under
/// the supplied gate. The closed set itself never changes.
pub fn advertised_tool_specs(gate: ToolGate) -> Vec<ToolSpec> {
    tool_specs()
        .into_iter()
        .filter(|t| gate.allows(t.tier))
        .collect()
}

/// Build the MCP handshake.
pub fn handshake() -> Handshake {
    Handshake {
        schema_version: 1,
        tools: tool_specs(),
    }
}

/// Serialize the handshake for a transport layer.
pub fn handshake_json() -> Result<String, serde_json::Error> {
    serde_json::to_string_pretty(&handshake())
}

/// Recall tool implementation.
pub fn recall(content_root: &Path, query: &str, limit: usize) -> Result<Vec<QueryHit>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
    ws.query(query, limit)
        .map_err(|e| McpError::Workspace(e.to_string()))
}

/// Structured list tool implementation. `tag` backs the `filter.tag` key of
/// `03` §3.2 — narrows to Items carrying that tag.
pub fn list(
    content_root: &Path,
    kind: Option<ContentKind>,
    status: Option<&str>,
    tag: Option<&str>,
) -> Result<Vec<silan_viking_app::QueryDocument>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
    let index = ws
        .query_index()
        .map_err(|e| McpError::Workspace(e.to_string()))?;
    Ok(index.list(kind, status, tag))
}

/// Enumerate every tag used in the workspace with a count of Items per tag.
/// Optional `kind` scopes to one content type. Returns `(tag, count)` pairs
/// sorted by count desc, then alpha — the order the owner usually wants.
pub fn list_tags(
    content_root: &Path,
    kind: Option<ContentKind>,
) -> Result<Vec<(String, usize)>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
    let index = ws
        .query_index()
        .map_err(|e| McpError::Workspace(e.to_string()))?;
    let mut counts: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    for doc in index.documents() {
        if let Some(k) = kind {
            if doc.kind != k {
                continue;
            }
        }
        for tag in &doc.tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }
    let mut rows: Vec<(String, usize)> = counts.into_iter().collect();
    rows.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    Ok(rows)
}

/// Read one URI by using the query index metadata.
pub fn read(content_root: &Path, uri: &str) -> Result<Option<ReadResult>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;

    // A Part URI (`…/<slug>/<role>`) reads back that Part's prose body — what
    // an agent needs before revising or continuing a Part. Anything else is
    // an Item-level summary read from the query index.
    if let Ok(target @ ProposalTarget::Part { .. }) = ProposalTarget::parse(uri) {
        let loc = resolve_draft_location(&ws, &target, "en")?;
        let path = content_root.join(&loc.draft_file);
        let body = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(_) => return Ok(None),
        };
        return Ok(Some(ReadResult {
            uri: uri.to_owned(),
            title: loc.role.clone(),
            languages: vec!["en".to_owned()],
            body: Some(body),
        }));
    }

    let index = ws
        .query_index()
        .map_err(|e| McpError::Workspace(e.to_string()))?;
    Ok(index
        .documents()
        .iter()
        .find(|doc| doc.uri == uri)
        .map(|doc| ReadResult {
            uri: doc.uri.clone(),
            title: doc.title.clone(),
            languages: doc.languages.clone(),
            body: None,
        }))
}

/// Read a file under `content/agent`.
pub fn ctx_read(content_root: &Path, uri: &str) -> Result<String, McpError> {
    let path = agent_path(content_root, uri)?;
    fs::read_to_string(path).map_err(|e| McpError::Io(e.to_string()))
}

/// Write a file under `content/agent`.
pub fn ctx_write(content_root: &Path, uri: &str, content: &str) -> Result<PathBuf, McpError> {
    let path = agent_path(content_root, uri)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| McpError::Io(e.to_string()))?;
    }
    fs::write(&path, content).map_err(|e| McpError::Io(e.to_string()))?;
    Ok(path)
}

/// Build a compact agent-context brief from stable memory files.
pub fn ctx_brief(content_root: &Path) -> Result<String, McpError> {
    let mut brief = String::new();
    for rel in [
        "owner/profile.md",
        "owner/preferences.md",
        "project/brief.md",
        "project/open-threads.md",
    ] {
        let path = content_root.join("agent").join(rel);
        if let Ok(text) = fs::read_to_string(path) {
            brief.push_str(&text);
            brief.push_str("\n\n");
        }
    }
    if brief.len() > 2000 {
        brief.truncate(2000);
    }
    Ok(brief)
}

// ── §8.6 handshake instructions & read-only resources ──────────────────────

/// The MCP `initialize` instructions payload (`08` §8.6): what an agent needs
/// to know on connect even if the host does not surface resources.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServerInstructions {
    /// The project name.
    pub project: String,
    /// `content/SCHEMA.md` version.
    pub schema_version: u32,
    /// The latest `content/` Git commit, if the content dir is a repo.
    pub content_commit: Option<String>,
    /// Read-only resource URIs the agent should read first.
    pub key_resources: Vec<&'static str>,
}

/// Build the `08` §8.6 server instructions for a content workspace.
pub fn server_instructions(content_root: &Path, project: &str) -> ServerInstructions {
    // The content commit is best-effort — content/ may not be a Git repo yet.
    let content_commit = Workspace::open(content_root)
        .ok()
        .and_then(|ws| ws.content_repo().ok())
        .and_then(|repo| repo.rev_parse("HEAD").ok());
    ServerInstructions {
        project: project.to_owned(),
        schema_version: 1,
        content_commit,
        key_resources: vec!["silan://schema", "silan://overview", "silan://agent/brief"],
    }
}

/// Resolve one of the three read-only handshake resources (`08` §8.6):
/// `silan://schema`, `silan://overview`, `silan://agent/brief`.
pub fn read_resource(content_root: &Path, uri: &str) -> Result<String, McpError> {
    match uri {
        "silan://schema" => fs::read_to_string(content_root.join("SCHEMA.md"))
            .map_err(|e| McpError::Io(e.to_string())),
        "silan://overview" => {
            // A compact, generated overview: every Item URI by kind.
            let ws =
                Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
            let scan = ws.scan().map_err(|e| McpError::Workspace(e.to_string()))?;
            let mut out = String::new();
            for item in scan.items() {
                out.push_str(&format!("{}\n", item.uri()));
            }
            Ok(out)
        }
        "silan://agent/brief" => ctx_brief(content_root),
        other => Err(McpError::Proposal(format!("unknown resource `{other}`"))),
    }
}

// ── capture / propose — the agent update path (`03` §3.1) ───────────────────

/// The result of a `capture` or `propose` — a registered proposal branch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProposalCreated {
    /// The minted proposal id (also the `proposal/<id>` branch name).
    pub id: String,
    /// The branch the draft was written to.
    pub branch: String,
    /// A state-aware next-step hint — what the agent should consider given
    /// what this call actually changed (a missing language variant, sibling
    /// Parts not yet written, …). `None` when nothing is worth flagging.
    pub hint: Option<String>,
    /// The canonical `silan://` URI of the resource this proposal created or
    /// touched (the Item URI for type-routed `capture`, the touched URI for
    /// `propose`). `None` only when the proposal is a free-form scratch
    /// note that has no Item identity (`type=note` capture).
    pub created_uri: Option<String>,
}

/// One Part of a `propose` call: the Part `role`, and its draft `content`.
pub struct PartDraft {
    /// The Part role — must be a role the target type's SCHEMA declares.
    pub role: String,
    /// The draft body: markdown for a `prose` Part, TOML for a structured one.
    pub content: String,
}

/// `propose(uri, draft, lang, extra_parts)` — write an agent draft onto a
/// fresh `proposal/<id>` Git branch and register it (`03` §3.1). `accept`
/// (CLI, human-only) merges it.
///
/// `uri` may anchor an Item or a Part. A URI whose Item does not exist yet
/// *creates* it; an existing Item is modified.
///
/// `draft` writes the URI's anchored Part — the Part itself for a Part URI,
/// or the type's primary Part for an Item URI.
///
/// `extra_parts` carries **additional Parts of the same Item**, so a new
/// multi-Part Item (a project's overview + goals + progress) lands as **one
/// proposal** rather than one branch per Part — the latter cannot be accepted
/// in isolation, since post-merge validation sees an Item missing its other
/// required Parts. `extra_parts` is only valid with an Item URI.
///
/// `lang` is the language variant every draft targets (`en`, `zh`, …).
///
/// The proposal branch lifecycle is owned by the engine
/// (`Workspace::create_proposal`); this function supplies the id, the touched
/// URIs, and a closure writing each draft file plus any missing `meta.toml`.
pub fn propose(
    content_root: &Path,
    uri: &str,
    draft: Option<&str>,
    lang: &str,
    extra_parts: &[PartDraft],
) -> Result<ProposalCreated, McpError> {
    let target = ProposalTarget::parse(uri).map_err(|e| McpError::Proposal(e.to_string()))?;
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;

    // `draft` writes the URI's anchored Part; `extra_parts` writes siblings.
    // At least one must be present — a `propose` that writes nothing is a
    // mistake. Omitting `draft` is the "only add sibling Parts, leave the
    // primary Part untouched" path, so it is valid as long as `extra_parts`
    // carries something.
    if draft.is_none() && extra_parts.is_empty() {
        return Err(McpError::Proposal(
            "propose needs `draft` (the anchored Part) or `parts` (sibling \
             Parts) — it cannot write nothing"
                .to_owned(),
        ));
    }

    // `extra_parts` name sibling Parts of the same Item, so the anchor must be
    // an Item URI — a Part URI already names its one Part.
    let item_uri = match (&target, extra_parts.is_empty()) {
        (ProposalTarget::Item(_), _) => uri.to_owned(),
        (ProposalTarget::Part { .. }, true) => uri.to_owned(),
        (ProposalTarget::Part { .. }, false) => {
            return Err(McpError::Proposal(
                "extra_parts is only valid with an Item URI, not a Part URI".to_owned(),
            ));
        }
    };

    // Resolve every draft's path *against the SCHEMA* up front — a Part role
    // the type does not declare is rejected here, before any branch or file
    // exists, so a mis-named Part fails cleanly instead of producing a
    // silently mis-anchored proposal.
    //
    // The primary Part is written only when `draft` is given; with `draft`
    // omitted the primary Part (e.g. an Item's `overview`) is left exactly
    // as it is and only the `extra_parts` siblings are added.
    let mut writes: Vec<(DraftLocation, String, String)> = Vec::new();
    if let Some(draft) = draft {
        let primary = resolve_draft_location(&ws, &target, lang)?;
        let primary_meta = render_part_meta(&primary.role, primary.shape, lang);
        writes.push((primary, draft.to_owned(), primary_meta));
    }
    for part in extra_parts {
        let part_uri = format!("{item_uri}/{}", part.role);
        let part_target =
            ProposalTarget::parse(&part_uri).map_err(|e| McpError::Proposal(e.to_string()))?;
        let loc = resolve_draft_location(&ws, &part_target, lang)?;
        let meta = render_part_meta(&loc.role, loc.shape, lang);
        writes.push((loc, part.content.clone(), meta));
    }

    // An `episode` Item lives under a *series* directory whose `series.toml`
    // is the parent the scanner reads (`episode_series` row). A new episode
    // in a not-yet-existing series needs that file too — like a new Part
    // needs its `meta.toml` — or the scanner cannot place the episode.
    let series = episode_series_file(&target);

    let id =
        ProposalId::new(Ulid::new().to_string()).map_err(|e| McpError::Proposal(e.to_string()))?;

    ws.create_proposal(
        &id,
        ProposalKind::Modify,
        vec![item_uri.clone()],
        &format!("propose {}", id.as_str()),
        |root| {
            for (loc, content, meta) in &writes {
                write_draft_file(&root.join(&loc.draft_file), content)?;
                // A Part is only valid with a `meta.toml`; `index sync` skips
                // a directory that lacks one. Write it whenever the Part is
                // new, so the proposal produces a complete, syncable Part. An
                // existing Part keeps its `meta.toml` (and `part_id`) intact.
                let meta_path = root.join(&loc.part_dir).join("meta.toml");
                if !meta_path.exists() {
                    write_draft_file(&meta_path, meta)?;
                }
            }
            // Write the container series' `series.toml` if the series is new.
            if let Some((rel, content)) = &series {
                let series_path = root.join(rel);
                if !series_path.exists() {
                    write_draft_file(&series_path, content)?;
                }
            }
            Ok(())
        },
    )
    .map_err(|e| McpError::Proposal(e.to_string()))?;

    let hint = propose_hint(&ws, &target, &writes, lang);
    Ok(ProposalCreated {
        id: id.as_str().to_owned(),
        branch: id.branch_name(),
        hint,
        // `propose` already carries the target URI from its arguments — pass
        // it back as `created_uri` so MCP clients can chain accept→sync.
        created_uri: Some(uri.to_owned()),
    })
}

/// Build the state-aware next-step hint for a completed `propose`.
///
/// It inspects what the proposal actually wrote against the content tree and
/// the SCHEMA, and flags the things an agent most often forgets: a Part left
/// without its `en` variant, the sibling Parts a multi-Part type still has
/// empty, and the accept -> sync step that has to follow. `None` when there
/// is nothing worth saying.
fn propose_hint(
    ws: &Workspace,
    target: &ProposalTarget,
    writes: &[(DraftLocation, String, String)],
    lang: &str,
) -> Option<String> {
    let mut notes: Vec<String> = Vec::new();

    let item_uri = match target {
        ProposalTarget::Item(uri) => uri,
        ProposalTarget::Part { item, .. } => item,
    };
    let kind = item_kind(item_uri).ok()?;
    let item_str = item_uri.to_string();
    let scan = ws.scan().ok();

    // 1. A draft in a non-`en` language whose `en` variant does not exist.
    //    `en` is the canonical variant; a zh-only Part has no fallback.
    if lang != "en" {
        let item = scan
            .as_ref()
            .and_then(|s| s.items().iter().find(|i| i.uri().to_string() == item_str));
        for (loc, _, _) in writes {
            let has_en = item
                .map(|i| {
                    i.parts().iter().any(|p| {
                        p.role().as_str() == loc.role
                            && p.files().iter().any(|f| f.lang().as_str() == "en")
                    })
                })
                .unwrap_or(false);
            if !has_en {
                notes.push(format!(
                    "the `{}` Part has no `en` variant — propose `{item_str}/{}` \
                     with lang=en too; `en` is the canonical language",
                    loc.role, loc.role
                ));
            }
        }
    }

    // 2. A multi-Part type whose other declared Parts are still unwritten.
    if let Some(type_spec) = ws.schema().type_spec(kind) {
        if type_spec.parts.len() > 1 {
            let written: Vec<&str> = writes.iter().map(|(l, _, _)| l.role.as_str()).collect();
            let existing: Vec<String> = scan
                .as_ref()
                .and_then(|s| s.items().iter().find(|i| i.uri().to_string() == item_str))
                .map(|i| i.parts().iter().map(|p| p.role().to_string()).collect())
                .unwrap_or_default();
            let missing: Vec<&str> = type_spec
                .parts
                .iter()
                .map(|p| p.role.as_str())
                .filter(|r| !written.contains(r) && !existing.iter().any(|e| e == r))
                .collect();
            if !missing.is_empty() {
                notes.push(format!(
                    "`{kind}` recommends these Parts you have not written yet: \
                     {} — add them with the `parts` argument or a later \
                     `propose` to each Part URI; this list is a recommendation, \
                     not a limit — you may also propose any new Part role that \
                     fits the Item",
                    missing.join(", ")
                ));
            } else {
                notes.push(format!(
                    "all recommended `{kind}` Parts are covered — if the Item \
                     needs a section the recommended set does not name, propose \
                     a new Part role for it (it lands as prose)"
                ));
            }
        }

        // 2b. A structured Part whose entry schema has an image/logo field —
        //     a work entry can carry a company logo, a publication a figure.
        //     These are optional, so an agent leaves them empty unless
        //     nudged; an empty cover then renders as a broken card image.
        for (loc, _, _) in writes {
            if let Some(part) = type_spec.part(&loc.role) {
                let image_fields: Vec<&str> = part
                    .entry_fields
                    .iter()
                    .map(|f| f.name.as_str())
                    .filter(|n| {
                        [
                            "image",
                            "logo",
                            "cover",
                            "avatar",
                            "thumbnail",
                            "certificate",
                        ]
                        .iter()
                        .any(|kw| n.contains(kw))
                    })
                    .collect();
                if !image_fields.is_empty() {
                    notes.push(format!(
                        "each `{}` entry can carry an image — set {} if you \
                         have one, or the card shows a blank cover",
                        loc.role,
                        image_fields.join(" / ")
                    ));
                }
            }
        }
    }

    // 3. The publish path always follows acceptance.
    notes.push(
        "after you finish, the owner reviews with `proposal show`, accepts \
         with the CLI, then `index sync` — the agent never publishes"
            .to_owned(),
    );

    Some(notes.join("; "))
}

/// `capture(note, type?, slug?, title?)` — capture a thought into a proposal.
///
/// Two routing paths, decided by `kind`:
///
/// * **`kind` is `None` or `"note"`** — the legacy scratch-note path. A free-text
///   note lands in `agent/notes/<id>.md` on a proposal branch. No Item identity;
///   the proposal touches `silan://agent/notes/<id>`.
///
/// * **`kind` is one of the six content kinds** (`idea` / `blog` / `project` /
///   `episode` / `resume` / `update`) — open a real Item under
///   `silan://resources/<type>/<slug>/`. The proposal scaffolds the primary Part
///   (`overview` for idea/project; `body` for blog/episode/update;
///   `summary` for resume) with the note as the body, frontmatter pre-filled
///   with `slug` / `title` / `kind` / `status: draft` / `visibility: private`.
///   The owner accepts → `silan index sync` and the Item is live in the db.
///
/// This is the GOAL §1.2 owner-view tape: silan voices a half-formed thought →
/// `capture` opens an Item proposal → owner accepts → the thought lives as a
/// real Item with a stable URI. Before this fix, every `type` value just wrote
/// `agent/notes/`, so the "voice a thought → it becomes an Item" picture had
/// no implementation behind it.
pub fn capture(
    content_root: &Path,
    note: &str,
    kind: Option<&str>,
    slug: Option<&str>,
    title: Option<&str>,
) -> Result<ProposalCreated, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
    let id =
        ProposalId::new(Ulid::new().to_string()).map_err(|e| McpError::Proposal(e.to_string()))?;

    // Route by `kind`. The "no kind" and "kind=note" cases keep the legacy
    // agent/notes/ behaviour so existing callers don't break.
    let kind = kind.unwrap_or("note");
    if kind == "note" {
        let rel = format!("agent/notes/{}.md", id.as_str());
        ws.create_proposal(
            &id,
            ProposalKind::Create,
            vec![format!("silan://agent/notes/{}", id.as_str())],
            &format!("capture {}", id.as_str()),
            |root| write_draft_file(&root.join(&rel), note),
        )
        .map_err(|e| McpError::Proposal(e.to_string()))?;
        return Ok(ProposalCreated {
            id: id.as_str().to_owned(),
            branch: id.branch_name(),
            hint: None,
            created_uri: Some(format!("silan://agent/notes/{}", id.as_str())),
        });
    }

    // Content-kind route: scaffold a real Item under resources/<type>/<slug>/.
    //
    // resume is intentionally excluded — it is a single Item scaffolded by
    // `silan init`, and capturing a second one would violate the single-
    // resume contract. Point the agent at the right command instead.
    // (V2-9 from the 2026-05-22 e2e pass.)
    if kind == "resume" {
        return Err(McpError::InvalidRequest(
            "capture cannot create a resume — resume is a single Item scaffolded by \
             `silan init`. Use `silan resume edit <part>` (e.g. `summary` / `education`) \
             or `propose` to `silan://resources/resume/resume/<part>` to modify it."
                .to_owned(),
        ));
    }
    let content_kind = parse_kind(kind).ok_or_else(|| {
        McpError::InvalidRequest(format!(
            "capture `type` must be one of note / idea / blog / project / episode / update; got `{kind}`"
        ))
    })?;

    // Derive a slug from `slug` (explicit) → `title` → first sentence of the
    // note. The result is normalised by `slugify` so trailing punctuation,
    // unicode, etc. do not produce illegal slugs (`10` §10.4 slug pattern).
    let derived_title = title
        .map(str::to_owned)
        .unwrap_or_else(|| first_sentence(note));
    let chosen_slug = match slug {
        Some(s) if !s.is_empty() => slugify(s),
        _ => slugify(&derived_title),
    };
    if chosen_slug.is_empty() {
        return Err(McpError::InvalidRequest(
            "capture could not derive a slug from `slug`/`title`/`note`; pass an explicit `slug`"
                .to_owned(),
        ));
    }

    // The primary Part of each content kind — where the note becomes the body.
    let primary_role = match content_kind {
        silan_viking_app::ContentKind::Idea | silan_viking_app::ContentKind::Project => "overview",
        silan_viking_app::ContentKind::Resume => "summary",
        _ => "body",
    };

    let type_dir = match content_kind {
        silan_viking_app::ContentKind::Idea => "ideas",
        silan_viking_app::ContentKind::Blog => "blog",
        silan_viking_app::ContentKind::Project => "projects",
        silan_viking_app::ContentKind::Episode => "episode",
        silan_viking_app::ContentKind::Resume => "resume",
        silan_viking_app::ContentKind::Update => "update",
    };

    let part_dir_rel = format!(
        "resources/{}/{}/parts/{}",
        type_dir, chosen_slug, primary_role
    );
    let body_rel = format!("{}/en.md", part_dir_rel);
    let meta_rel = format!("{}/meta.toml", part_dir_rel);
    let item_uri = format!("silan://resources/{}/{}", type_dir, chosen_slug);

    // The body file: frontmatter with the SCHEMA-required fields. Each
    // content type has its own `status` enum (`10` §10.4) — idea/blog/episode
    // use `draft` as the initial value, project and update don't have a
    // `draft` state and start at `active`. update additionally requires
    // `update_type` and `date` (per `10` §10.4.6). resume has no `status`.
    let initial_status = match content_kind {
        silan_viking_app::ContentKind::Project | silan_viking_app::ContentKind::Update => "active",
        silan_viking_app::ContentKind::Resume => "", // no status field
        _ => "draft",
    };

    // Extra frontmatter lines specific to certain kinds — kept minimal so a
    // capture stays a single-call proposal, but still SCHEMA-valid.
    let extra_lines = match content_kind {
        silan_viking_app::ContentKind::Update => {
            // SCHEMA requires update_type + date for an update; without these,
            // sync's post-merge validation rejects the proposal. Pick safe
            // defaults the owner can refine after `proposal accept`.
            let today = today_iso_date();
            format!("update_type: progress\ndate: {today}\n")
        }
        _ => String::new(),
    };

    let status_line = if initial_status.is_empty() {
        String::new()
    } else {
        format!("status: {initial_status}\n")
    };

    let body = format!(
        "---\nslug: {slug}\ntitle: {title}\nkind: {kind}\n{status}visibility: private\n{extra}---\n\n# {title}\n\n{note}\n",
        slug = chosen_slug,
        title = derived_title,
        kind = kind,
        status = status_line,
        extra = extra_lines,
        note = note,
    );

    // The meta.toml: PartID + role + canonical_lang.
    let part_ulid = Ulid::new();
    let meta = format!(
        "part_id        = \"p_{part_id}\"\ntype           = \"{role}\"\ncanonical_lang = \"en\"\n",
        part_id = part_ulid,
        role = primary_role,
    );

    ws.create_proposal(
        &id,
        ProposalKind::Create,
        vec![item_uri.clone()],
        &format!("capture {} ({})", id.as_str(), kind),
        |root| {
            write_draft_file(&root.join(&body_rel), &body)?;
            write_draft_file(&root.join(&meta_rel), &meta)?;
            Ok(())
        },
    )
    .map_err(|e| McpError::Proposal(e.to_string()))?;

    let hint = Some(format!(
        "review with `silan proposal show {}`; accept with `silan proposal accept {}`; then `silan index sync` to land it. The new Item is at {}",
        id.as_str(), id.as_str(), item_uri
    ));

    Ok(ProposalCreated {
        id: id.as_str().to_owned(),
        branch: id.branch_name(),
        hint,
        created_uri: Some(item_uri),
    })
}

/// Take the first sentence-ish span of `note` to use as a derived title /
/// slug seed. Stops at the first `\n` / `!` / `?` — but **not** at `.`,
/// because version strings ("v0.2") and acronyms ("e.g.") deserve to live
/// in the title. The whole-note fallback caps at 80 chars so a paragraph
/// blob still produces a usable title.
fn first_sentence(note: &str) -> String {
    let trimmed = note.trim();
    let end = trimmed
        .find(['\n', '!', '?'])
        .unwrap_or(trimmed.len())
        .min(80);
    let s = trimmed[..end].trim().to_owned();
    if s.is_empty() {
        trimmed.chars().take(80).collect()
    } else {
        s
    }
}

/// Today's date as `YYYY-MM-DD` UTC — used by `capture(type=update)` to
/// satisfy the SCHEMA `date` requirement without dragging in chrono.
fn today_iso_date() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    // Civil date from a UNIX timestamp via the Howard Hinnant algorithm;
    // good for any reasonable date this century. Avoiding the chrono crate
    // keeps capture cheap.
    let days = now.div_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

// (deduplicated)

/// Slugify a free-form title into a `10` §10.4-compatible slug:
/// lowercase, ASCII alphanumeric, `-` between runs of non-alphanumeric,
/// trimmed of leading/trailing `-`, capped at 60 chars.
fn slugify(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_dash = true; // skip a leading run of separators
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.len() > 60 {
        out.truncate(60);
        while out.ends_with('-') {
            out.pop();
        }
    }
    out
}

/// Write a proposal draft file, creating parent directories. The
/// `write_draft` closure of `Workspace::create_proposal` returns
/// `ProposalError`, so io failures map to `ProposalError::Io`.
fn write_draft_file(path: &Path, body: &str) -> Result<(), silan_viking_app::ProposalError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| silan_viking_app::ProposalError::Io(e.to_string()))?;
    }
    fs::write(path, body).map_err(|e| silan_viking_app::ProposalError::Io(e.to_string()))
}

/// Where a proposal draft is written, resolved against the SCHEMA.
struct DraftLocation {
    /// Repo-relative path of the Part's `parts/<role>/` directory.
    part_dir: String,
    /// Repo-relative path of the draft language file (`<lang>.<ext>`).
    draft_file: String,
    /// The Part's role — `type` field of `meta.toml`.
    role: String,
    /// The Part's shape — `shape` field of `meta.toml`, and what decides
    /// the draft file's extension.
    shape: silan_viking_app::PartShape,
}

/// Resolve where a proposal draft is written, **validating the target Part
/// role against the SCHEMA**.
///
/// An Item target (`silan://resources/<kind>/<slug>`) has no explicit Part, so
/// the type's primary Part is used — the lowest-`order` Part the SCHEMA
/// declares (`body` for blog, `summary` for resume, `overview` for
/// idea/project). A Part target (`.../<slug>/<role>`) must name a Part the
/// type actually declares; an unknown role is rejected with the list of
/// valid roles, instead of silently creating an off-schema `parts/<role>/`
/// directory that later breaks `index sync`.
///
/// The file extension follows the resolved Part's `shape`: `prose` Parts are
/// `<lang>.md`, `entry_list` / `key_value_list` Parts are `<lang>.toml`. A
/// structured Part drafted as `.md` would be ignored by `index sync`, so the
/// extension is taken from the SCHEMA, never assumed.
fn resolve_draft_location(
    ws: &Workspace,
    target: &ProposalTarget,
    lang: &str,
) -> Result<DraftLocation, McpError> {
    let (item_uri, kind, role) = match target {
        ProposalTarget::Item(uri) => (uri, item_kind(uri)?, None),
        ProposalTarget::Part { item, role } => (item, item_kind(item)?, Some(role.as_str())),
    };

    // Every Item-identifying segment after the type (`<slug>`, and the
    // `<series>` of an episode) must be a well-formed slug. Rejecting an
    // ill-formed one here turns "an agent invented `my-project#goals` as a
    // pseudo-slug" into a clear error instead of a stray off-tree directory.
    for seg in item_uri.segments().iter().skip(1) {
        silan_viking_app::Slug::new(seg.clone()).map_err(|e| {
            McpError::Proposal(format!(
                "`{seg}` is not a valid slug ({e}) — a slug is the Item's \
                 identity; a Part goes in its own URI segment, not the slug"
            ))
        })?;
    }

    let type_spec = ws
        .schema()
        .type_spec(kind)
        .ok_or_else(|| McpError::Proposal(format!("schema has no type spec for `{}`", kind)))?;

    // The type's `parts` list is a *recommended* set, not a closed whitelist:
    // an agent may extend an Item with a Part whose role the SCHEMA does not
    // predeclare (a project `benchmark` / `roadmap` section). A declared role
    // keeps its SCHEMA `shape`; an undeclared one defaults to `prose` — the
    // shape almost every Part is. A role still has to be a well-formed
    // identifier so it maps cleanly to a `parts/<role>/` directory.
    let (resolved_role, resolved_shape): (String, silan_viking_app::PartShape) = match role {
        Some(role) => {
            // A role names a `parts/<role>/` directory and an `item_part.role`
            // column — it must be a lowercase identifier. Unlike a `Slug` it
            // *may* contain `_` (the SCHEMA itself ships `quick_start` /
            // `release_notes`), so it gets its own check rather than `Slug`.
            let role_ok = !role.is_empty()
                && role
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
                && role.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit());
            if !role_ok {
                return Err(McpError::Proposal(format!(
                    "`{role}` is not a valid Part role — a role must be a \
                     lowercase identifier (a-z, 0-9, `_`, `-`)"
                )));
            }
            match type_spec.part(role) {
                Some(p) => (p.role.clone(), p.shape),
                None => (role.to_owned(), silan_viking_app::PartShape::Prose),
            }
        }
        // Item target: fall back to the type's primary (lowest-order) Part.
        None => {
            let p = type_spec
                .parts
                .iter()
                .min_by_key(|p| p.order)
                .ok_or_else(|| McpError::Proposal(format!("type `{}` declares no Parts", kind)))?;
            (p.role.clone(), p.shape)
        }
    };

    let part_dir = format!("{}/parts/{}", item_dir_rel(item_uri, kind), resolved_role);
    let draft_file = format!("{part_dir}/{lang}.{}", resolved_shape.file_extension());
    Ok(DraftLocation {
        part_dir,
        draft_file,
        role: resolved_role,
        shape: resolved_shape,
    })
}

/// Render a Part's `meta.toml` — the manifest that makes a directory a valid
/// Part (`01` §1.3.1). A Part without it is skipped by `index sync`, so
/// `propose` writes one whenever it creates a new Part.
fn render_part_meta(role: &str, shape: silan_viking_app::PartShape, lang: &str) -> String {
    format!(
        "# Part identity for the `{role}` part (per 01 §1.3.1 / §1.4).\n\
         part_id        = \"p_{}\"\n\
         type           = \"{role}\"\n\
         shape          = \"{}\"\n\
         canonical_lang = \"{lang}\"\n",
        Ulid::new(),
        shape.schema_name(),
    )
}

/// The repo-relative directory of an Item — where its `parts/` live.
///
/// For most types this is `resources/<kind>/<slug>/`. `resume` is a single
/// Item, so `content/resources/resume/` IS the Item directory: it has no
/// `<slug>` level (matching `Workspace::scan`, which treats `resume` the same
/// way). Its URI still carries a synthetic `resume` slug segment, so without
/// this fold a draft would be written one directory too deep, at
/// `resources/resume/resume/parts/...`, and the scanner would never see it.
fn item_dir_rel(item_uri: &silan_viking_app::SilanUri, kind: ContentKind) -> String {
    if kind == ContentKind::Resume {
        return format!("resources/{}", kind.dir_name());
    }
    uri_to_rel(item_uri)
}

/// For an `episode` Item target, the `(rel_path, content)` of the container
/// series' `series.toml`. `None` for any non-episode target.
///
/// An episode lives at `resources/episode/<series>/<episode>/`; the series
/// directory's `series.toml` is the parent the scanner reads. A proposal that
/// creates an episode in a brand-new series must carry that file, or the
/// scanner has no series to attach the episode to. `propose` writes it only
/// when absent, so an existing series keeps its own `series.toml`.
fn episode_series_file(target: &ProposalTarget) -> Option<(String, String)> {
    let item_uri = match target {
        ProposalTarget::Item(uri) => uri,
        ProposalTarget::Part { item, .. } => item,
    };
    let segments = item_uri.segments();
    // An episode Item URI is `episode/<series>/<episode>`.
    if segments.first().map(String::as_str) != Some("episode") {
        return None;
    }
    let series_slug = segments.get(1)?;
    let rel = format!("resources/episode/{series_slug}/series.toml");
    let title = slug_to_title(series_slug);
    let content = format!(
        "# Container series metadata (per 10 §10.4.4).\n\
         title       = \"{title}\"\n\
         slug        = \"{series_slug}\"\n\
         description = \"\"\n\
         status      = \"ongoing\"\n",
    );
    Some((rel, content))
}

/// Turn a slug into a human title — `using-silan-viking` -> `Using Silan
/// Viking`. A plain default the owner edits; the slug stays the identity.
fn slug_to_title(slug: &str) -> String {
    slug.split('-')
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The `ContentKind` of an Item URI — its first path segment is the type's
/// directory name (`ideas` / `blog` / `projects` / …).
fn item_kind(uri: &silan_viking_app::SilanUri) -> Result<ContentKind, McpError> {
    let dir = uri
        .segments()
        .first()
        .ok_or_else(|| McpError::Proposal("proposal target has no type segment".to_owned()))?;
    ContentKind::from_dir_name(dir)
        .map_err(|e| McpError::Proposal(format!("unknown content type `{dir}`: {e}")))
}

/// `silan://resources/a/b` -> `resources/a/b`.
fn uri_to_rel(uri: &silan_viking_app::SilanUri) -> String {
    let mut rel = String::from("resources");
    for segment in uri.segments() {
        rel.push('/');
        rel.push_str(segment);
    }
    rel
}

fn agent_path(content_root: &Path, uri: &str) -> Result<PathBuf, McpError> {
    let prefix = "silan://agent/";
    let rel = uri.strip_prefix(prefix).ok_or(McpError::InvalidAgentUri)?;
    if rel
        .split('/')
        .any(|segment| segment == ".." || segment.is_empty())
    {
        return Err(McpError::InvalidAgentUri);
    }
    Ok(content_root.join("agent").join(rel))
}

// ── 档 1 — the remaining read-only tools (`03` §3.2) ────────────────────────

/// One entry of a `browse` listing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct BrowseEntry {
    /// The child URI.
    pub uri: String,
    /// `namespace` / `collection` / `item` / `part` / `file`.
    pub kind: String,
    /// The display name (the last URI segment).
    pub name: String,
}

/// `browse(uri)` — list the children of a node in the `content/` tree
/// (`03` §3.2). At the root it returns the per-type collections; at a
/// collection it returns its Items; at an Item it returns its Parts.
pub fn browse(content_root: &Path, uri: &str) -> Result<Vec<BrowseEntry>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
    let scan = ws.scan().map_err(|e| McpError::Workspace(e.to_string()))?;

    // Root / namespace: list the distinct type collections present.
    if uri == "silan://resources" || uri == "silan://" || uri.is_empty() {
        let mut kinds: Vec<String> = scan
            .items()
            .iter()
            .map(|i| i.kind().dir_name().to_owned())
            .collect();
        kinds.sort();
        kinds.dedup();
        return Ok(kinds
            .into_iter()
            .map(|k| BrowseEntry {
                uri: format!("silan://resources/{k}"),
                kind: "collection".to_owned(),
                name: k,
            })
            .collect());
    }

    // A collection URI `silan://resources/<kind>`: list its Items.
    let resources_prefix = "silan://resources/";
    if let Some(rest) = uri.strip_prefix(resources_prefix) {
        let segments: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
        match segments.as_slice() {
            [collection] => {
                return Ok(scan
                    .items()
                    .iter()
                    .filter(|i| i.kind().dir_name() == *collection)
                    .map(|i| BrowseEntry {
                        uri: i.uri().to_string(),
                        kind: "item".to_owned(),
                        name: i.slug().as_str().to_owned(),
                    })
                    .collect());
            }
            // An Item URI: list its Parts.
            [_collection, slug] => {
                let item = scan
                    .items()
                    .iter()
                    .find(|i| i.slug().as_str() == *slug)
                    .ok_or_else(|| McpError::Workspace(format!("no item at {uri}")))?;
                return Ok(item
                    .parts()
                    .iter()
                    .map(|p| BrowseEntry {
                        uri: format!("{uri}/{}", p.role()),
                        kind: "part".to_owned(),
                        name: p.role().to_string(),
                    })
                    .collect());
            }
            _ => {}
        }
    }
    Err(McpError::Workspace(format!("cannot browse `{uri}`")))
}

/// The `context_brief` payload (`03` §3.2 档 1) — the "what is silan thinking
/// about" digest a new agent reads first.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ContextBrief {
    /// Project name.
    pub project: String,
    /// `content/SCHEMA.md` version.
    pub schema_version: u32,
    /// The latest `content/` commit, if it is a Git repo.
    pub content_commit: Option<String>,
    /// The condensed agent-memory brief.
    pub brief: String,
    /// URIs worth reading next.
    pub suggested_next_reads: Vec<String>,
}

/// `context_brief()` — assemble the project digest from the agent memory and
/// the current content tree (`03` §3.2). Distinct from `ctx_brief`, which is
/// the档 2.5 raw agent-memory dump.
pub fn context_brief(content_root: &Path, project: &str) -> Result<ContextBrief, McpError> {
    let instructions = server_instructions(content_root, project);
    let brief = ctx_brief(content_root).unwrap_or_default();
    // Suggest the most-recently-scanned Items as next reads.
    let suggested = Workspace::open(content_root)
        .ok()
        .and_then(|ws| ws.scan().ok())
        .map(|scan| {
            scan.items()
                .iter()
                .take(5)
                .map(|i| i.uri().to_string())
                .collect()
        })
        .unwrap_or_default();
    Ok(ContextBrief {
        project: instructions.project,
        schema_version: instructions.schema_version,
        content_commit: instructions.content_commit,
        brief,
        suggested_next_reads: suggested,
    })
}

/// `lint(uri?)` — the content health report (`03` §3.2). Delegates to
/// `Workspace::lint`, returning every graded parser/SCHEMA issue.
pub fn lint(
    content_root: &Path,
    uri: Option<&str>,
) -> Result<Vec<silan_viking_app::LintIssue>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
    ws.lint(uri).map_err(|e| McpError::Workspace(e.to_string()))
}

/// `reflect(session)` — append an immutable session summary under
/// `agent/sessions/YYYY/MM/DD/<ulid>.md` (`03` §3.2 档 2.5, the
/// OpenViking-style self-evolution path). Returns the written URI.
pub fn reflect(content_root: &Path, session: &str) -> Result<String, McpError> {
    let now = time::OffsetDateTime::now_utc();
    let id = Ulid::new();
    let rel = format!(
        "agent/sessions/{:04}/{:02}/{:02}/{}.md",
        now.year(),
        u8::from(now.month()),
        now.date().day(),
        id
    );
    let path = content_root.join(&rel);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| McpError::Io(e.to_string()))?;
    }
    let stamp = format!(
        "{:04}-{:02}-{:02}",
        now.year(),
        u8::from(now.month()),
        now.date().day()
    );
    fs::write(&path, format!("# Session {stamp}\n\n{session}\n"))
        .map_err(|e| McpError::Io(e.to_string()))?;
    Ok(format!("silan://{rel}"))
}

/// `summarize_updates()` — draft a changelog/update summary as a proposal
/// (`03` §3.2 档 3). It is `propose` specialised to the `update` type: the
/// summary is written to a new `update` Item on a proposal branch.
pub fn summarize_updates(content_root: &Path, summary: &str) -> Result<ProposalCreated, McpError> {
    let slug = format!("changelog-{}", Ulid::new().to_string().to_ascii_lowercase());
    let uri = format!("silan://resources/update/{slug}");
    let draft = format!(
        "---\nslug: {slug}\ntitle: Update Summary\nkind: update\nupdate_type: progress\n\
         status: active\nvisibility: private\ndate: {}\n---\n\n{summary}\n",
        today_utc()
    );
    propose(content_root, &uri, Some(&draft), "en", &[])
}

/// Today's date `YYYY-MM-DD` (UTC).
fn today_utc() -> String {
    let d = time::OffsetDateTime::now_utc().date();
    format!("{:04}-{:02}-{:02}", d.year(), u8::from(d.month()), d.day())
}

// ── 档 1 — #15 remote stats tools (`03` §3.2) ───────────────────────────────
//
// stats/visitors/crawler_breakdown/source_breakdown read the local stats
// cache (`stats_cache_*` tables of portfolio.db). That cache is filled by
// `silan stats sync`, which pulls the runtime data from the deployed Go API
// — so an MCP agent sees the same cached data the CLI does. A cache that has
// never been synced reports `BackendUnavailable` pointing at `stats sync`.

/// Resolve a `silan://resources/<kind>/<slug>` URI to `(entity_type,
/// entity_id)` via the local content database. Mirrors the CLI's
/// `resolve_stats_filter`.
fn resolve_stats_entity(db_path: &Path, uri: &str) -> Result<(String, String), McpError> {
    let rest = uri.strip_prefix("silan://resources/").ok_or_else(|| {
        McpError::InvalidRequest(format!("stats uri must be silan://resources/...: {uri}"))
    })?;
    let segments: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
    let kind = *segments
        .first()
        .ok_or_else(|| McpError::InvalidRequest(format!("stats uri has no kind: {uri}")))?;
    let slug = *segments
        .last()
        .ok_or_else(|| McpError::InvalidRequest(format!("stats uri has no slug: {uri}")))?;

    let (entity_type, table) = match kind {
        "blog" | "blogs" => ("blog", "blog_posts"),
        "project" | "projects" => ("project", "projects"),
        "idea" | "ideas" => ("idea", "ideas"),
        "episode" | "episodes" => ("episode", "episodes"),
        "update" | "updates" => ("update", "recent_updates"),
        "resume" => ("resume", "personal_info"),
        other => {
            return Err(McpError::InvalidRequest(format!(
                "unsupported stats kind `{other}`"
            )));
        }
    };

    // A missing db file means the project has never been synced — point at
    // `index sync` rather than leaking a raw "unable to open" sqlite error.
    if !db_path.exists() {
        return Err(McpError::Workspace(format!(
            "no local DB at {} — run `silan index sync` first",
            db_path.display()
        )));
    }
    let conn = rusqlite::Connection::open(db_path)
        .map_err(|e| McpError::Workspace(format!("open {}: {e}", db_path.display())))?;
    let query = if entity_type == "resume" {
        format!("SELECT id FROM {table} LIMIT 1")
    } else {
        format!("SELECT id FROM {table} WHERE slug = ?1 LIMIT 1")
    };
    let row: Result<String, _> = if entity_type == "resume" {
        conn.query_row(&query, [], |r| r.get(0))
    } else {
        conn.query_row(&query, rusqlite::params![slug], |r| r.get(0))
    };
    let entity_id = row.map_err(|_| {
        McpError::Workspace(format!(
            "no {entity_type} `{slug}` in the local DB — run `silan index sync` first"
        ))
    })?;
    Ok((entity_type.to_owned(), entity_id))
}

/// `stats` / `visitors` / `crawler_breakdown` / `source_breakdown` — the four
/// #15 stats tools, served from the local cache (`silan stats sync` fills it).
fn cached_stats(db_path: &Path, tool: &str, uri: &str) -> Result<serde_json::Value, McpError> {
    use serde_json::json;
    let (entity_type, entity_id) = resolve_stats_entity(db_path, uri)?;
    let cache = StatsCache::open(db_path);

    // A never-synced cache surfaces as a clear "run stats sync" message.
    let not_synced = |e: silan_viking_app::StatsError| match e {
        silan_viking_app::StatsError::NotSynced(_) | silan_viking_app::StatsError::Sqlite(_) => {
            McpError::BackendUnavailable(format!(
                "stats cache empty for `{uri}` — run `silan stats sync {uri}` first"
            ))
        }
        other => McpError::Workspace(other.to_string()),
    };

    match tool {
        "stats" => {
            let s = cache.item(&entity_type, &entity_id).map_err(not_synced)?;
            Ok(json!({
                "uri": uri, "views": s.views, "likes": s.likes, "comments": s.comments
            }))
        }
        "visitors" => {
            let v = cache
                .visitors(&entity_type, &entity_id)
                .map_err(not_synced)?;
            Ok(json!({ "uri": uri, "visitors": v }))
        }
        "crawler_breakdown" => {
            let rows = cache
                .crawlers(&entity_type, &entity_id)
                .map_err(not_synced)?;
            Ok(json!({ "uri": uri, "items": rows }))
        }
        "source_breakdown" => {
            let rows = cache
                .sources(&entity_type, &entity_id)
                .map_err(not_synced)?;
            Ok(json!({ "uri": uri, "items": rows }))
        }
        other => Err(McpError::UnknownTool(other.to_owned())),
    }
}

// ── the tool dispatcher — name + JSON args -> JSON result ───────────────────

/// Dispatch an MCP `tools/call` by name. This is the single routing point
/// from the JSON-RPC server to the typed tool functions above; it owns the
/// argument extraction so each tool function stays transport-free.
///
/// Every tool listed by [`tool_specs`] has an arm here — the
/// `dispatch_covers_every_advertised_tool` test asserts there is no drift.
pub fn call(
    content_root: &Path,
    db_path: &Path,
    project: &str,
    tool: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, McpError> {
    use serde_json::json;

    // Small helpers for argument extraction with clear errors.
    let str_arg = |key: &str| -> Result<String, McpError> {
        args.get(key)
            .and_then(|v| v.as_str())
            .map(str::to_owned)
            .ok_or_else(|| McpError::InvalidRequest(format!("`{tool}` requires `{key}`")))
    };
    let opt_str = |key: &str| args.get(key).and_then(|v| v.as_str()).map(str::to_owned);

    match tool {
        "recall" => {
            let query = str_arg("query")?;
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(10) as usize;
            let hits = recall(content_root, &query, limit)?;
            Ok(json!({
                "items": hits.iter().map(|h| json!({
                    "uri": h.document.uri,
                    "title": h.document.title,
                    "score": h.score,
                })).collect::<Vec<_>>()
            }))
        }
        "list" => {
            let kind = opt_str("type")
                .map(|t| {
                    parse_kind(&t)
                        .ok_or_else(|| McpError::InvalidRequest(format!("unknown type `{t}`")))
                })
                .transpose()?;
            // `03` §3.2: `filter` is a nested object whose keys are `status`,
            // `visibility`, `updated_after`, `updated_before`, `tag`. Read
            // `status`/`tag` from `filter`, falling back to a top-level key.
            let filter = args.get("filter").and_then(|v| v.as_object());
            let from_filter = |key: &str| -> Option<String> {
                filter
                    .and_then(|f| f.get(key))
                    .and_then(|v| v.as_str())
                    .map(str::to_owned)
                    .or_else(|| opt_str(key))
            };
            let status = from_filter("status");
            let tag = from_filter("tag");
            let docs = list(content_root, kind, status.as_deref(), tag.as_deref())?;
            Ok(json!({
                "items": docs.iter().map(|d| json!({
                    "uri": d.uri, "slug": d.slug, "title": d.title,
                    "status": d.status, "tags": d.tags,
                })).collect::<Vec<_>>()
            }))
        }
        "list_tags" => {
            let kind = opt_str("type")
                .map(|t| {
                    parse_kind(&t)
                        .ok_or_else(|| McpError::InvalidRequest(format!("unknown type `{t}`")))
                })
                .transpose()?;
            let tags = list_tags(content_root, kind)?;
            Ok(json!({
                "tags": tags.iter().map(|(t, n)| json!({"tag": t, "count": n}))
                    .collect::<Vec<_>>()
            }))
        }
        "browse" => {
            let uri = opt_str("uri").unwrap_or_else(|| "silan://resources".to_owned());
            Ok(json!({ "entries": browse(content_root, &uri)? }))
        }
        "read" => {
            let uri = str_arg("uri")?;
            match read(content_root, &uri)? {
                Some(r) => Ok(json!({
                    "uri": r.uri,
                    "title": r.title,
                    "languages": r.languages,
                    "body": r.body,
                })),
                None => Err(McpError::InvalidRequest(format!("no item at `{uri}`"))),
            }
        }
        "context_brief" => Ok(serde_json::to_value(context_brief(content_root, project)?)
            .map_err(|e| McpError::Workspace(e.to_string()))?),
        "lint" => {
            let issues = lint(content_root, opt_str("uri").as_deref())?;
            Ok(json!({ "issues": issues }))
        }
        "stats" | "visitors" | "crawler_breakdown" | "source_breakdown" => {
            let uri = str_arg("uri")?;
            cached_stats(db_path, tool, &uri)
        }
        "capture" => {
            let note = str_arg("note")?;
            // `type` / `slug` / `title` are all optional; missing type means
            // "scratch note" — the legacy behaviour (agent/notes/<ulid>.md).
            // Any of the six content kinds routes through a different
            // scaffold path so the proposal opens a real Item under
            // resources/<type>/<slug>/.
            let kind = opt_str("type");
            let slug = opt_str("slug");
            let title = opt_str("title");
            let created = capture(
                content_root,
                &note,
                kind.as_deref(),
                slug.as_deref(),
                title.as_deref(),
            )?;
            Ok(json!({
                "proposal_id": created.id,
                "branch": created.branch,
                "hint": created.hint,
                "created_uri": created.created_uri,
            }))
        }
        "ctx_read" => {
            let uri = str_arg("uri")?;
            Ok(json!({ "uri": uri, "content": ctx_read(content_root, &uri)? }))
        }
        "ctx_write" => {
            let uri = str_arg("uri")?;
            let content = str_arg("content")?;
            let path = ctx_write(content_root, &uri, &content)?;
            Ok(json!({ "uri": uri, "path": path.display().to_string() }))
        }
        "ctx_brief" => Ok(json!({ "brief": ctx_brief(content_root)? })),
        "reflect" => {
            let session = str_arg("session")?;
            Ok(json!({ "written": [reflect(content_root, &session)?] }))
        }
        "propose" => {
            let uri = str_arg("uri")?;
            // `draft` is optional: omitting it (with `parts` given) is the
            // "add sibling Parts only, leave the primary Part untouched" path.
            let draft = opt_str("draft");
            // `lang` is optional — defaults to the canonical `en` variant.
            let lang = opt_str("lang").unwrap_or_else(|| "en".to_owned());
            // `parts` is optional — a `{role: content}` object carrying extra
            // Parts of the same Item, so a multi-Part new Item is one
            // proposal. Each value must be a string draft.
            let extra_parts: Vec<PartDraft> = match args.get("parts") {
                None | Some(serde_json::Value::Null) => Vec::new(),
                Some(serde_json::Value::Object(map)) => {
                    let mut parts = Vec::with_capacity(map.len());
                    for (role, value) in map {
                        let content = value.as_str().ok_or_else(|| {
                            McpError::Proposal(format!("parts.{role} must be a string draft"))
                        })?;
                        parts.push(PartDraft {
                            role: role.clone(),
                            content: content.to_owned(),
                        });
                    }
                    parts
                }
                Some(_) => {
                    return Err(McpError::Proposal(
                        "parts must be a {role: content} object".to_owned(),
                    ));
                }
            };
            let created = propose(content_root, &uri, draft.as_deref(), &lang, &extra_parts)?;
            Ok(json!({ "proposal_id": created.id, "branch": created.branch, "hint": created.hint }))
        }
        "summarize_updates" => {
            let summary = opt_str("summary").unwrap_or_else(|| "Recent updates.".to_owned());
            let created = summarize_updates(content_root, &summary)?;
            Ok(json!({ "proposal_id": created.id, "branch": created.branch, "hint": created.hint }))
        }
        // Deploy is a gated tool. `call()` answers the wire even when
        // the gate is closed — but only the server's `--enable-deploy`
        // path actually advertises it (`tools/list` filters it out
        // otherwise). Calling deploy through the JSON-RPC server when
        // it isn't advertised hits this arm with `confirm=false`-style
        // semantics: we surface a `BackendUnavailable` so the host
        // understands the gate, instead of `UnknownTool` which would be
        // a coverage drift.
        "deploy" => {
            let confirm = args.get("confirm").and_then(|v| v.as_bool()).unwrap_or(false);
            if !confirm {
                return Err(McpError::InvalidRequest(
                    "deploy requires `confirm: true` to run the pipeline".to_owned(),
                ));
            }
            // The real deploy lives in `silan-viking-site::deploy`; calling
            // it from MCP couples this crate to the site crate, which the
            // L4 adapter independence rule forbids. The CLI `silan site
            // deploy` covers the human path; the MCP surface stays as a
            // gated placeholder until the proxy via the server's deploy
            // hook is wired (`03` §3.2 note).
            Err(McpError::BackendUnavailable(
                "deploy via MCP is gated — invoke `silan site deploy` from \
                 the CLI, or start the MCP server with `--enable-deploy` \
                 once the deploy hook is wired".to_owned(),
            ))
        }
        // ── E1 stubs (`15` §15.2) — return empty suggestion lists. The
        // shape is the documented one from §15.5.1 so an agent can
        // ingest the response today; the algorithm that fills the
        // suggestions is the next implementation pass.
        "suggest_relations" => {
            // `scope` and `limit` accepted but unused by the stub; we
            // still validate that `scope` is an array of strings if
            // supplied so a real client failure surfaces at the boundary.
            if let Some(scope) = args.get("scope") {
                if !scope.is_array() {
                    return Err(McpError::InvalidRequest(
                        "suggest_relations.scope must be an array of URIs".to_owned(),
                    ));
                }
            }
            Ok(json!({ "suggestions": [] }))
        }
        "suggest_parts" => {
            let uri = str_arg("uri")?;
            Ok(json!({ "uri": uri, "suggestions": [] }))
        }
        "suggest_lifecycle" => {
            let uri = str_arg("uri")?;
            Ok(json!({
                "uri": uri,
                "current_status": null,
                "suggested_status": null,
                "rationale": "stub: lifecycle inference not yet implemented",
                "proposal_id": null,
            }))
        }
        other => Err(McpError::UnknownTool(other.to_owned())),
    }
}

/// Parse a content-type name to a `ContentKind`.
fn parse_kind(name: &str) -> Option<ContentKind> {
    match name {
        "idea" => Some(ContentKind::Idea),
        "blog" => Some(ContentKind::Blog),
        "project" => Some(ContentKind::Project),
        "episode" => Some(ContentKind::Episode),
        "resume" => Some(ContentKind::Resume),
        "update" => Some(ContentKind::Update),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handshake_covers_every_tier() {
        // 6 tiers exist now: the original four (ReadOnly / Capture /
        // AgentContext / Proposal) plus Deploy (M9 gated) and Evolve
        // (E1 gated). Every tier must have at least one tool in the
        // closed set — drift here would be a milestone-table mismatch
        // with 17 §17.2 / GOAL §5.
        let tiers: std::collections::BTreeSet<_> = tool_specs()
            .into_iter()
            .map(|tool| tool.tier as u8)
            .collect();
        assert_eq!(tiers.len(), 6, "expected 6 tiers, got {}", tiers.len());
    }

    /// Closed-set count is the M9-plus-E1 superset: 17 §17.2 pins M9=18
    /// (11 read + 4 ctx/reflect + capture + 2 proposal + deploy) and
    /// E1=22 (+suggest_relations/parts/lifecycle). The default `tool_specs`
    /// returns all 22 because it's the *closed set*; the server's gate
    /// filters down to what's actually surfaced.
    ///
    /// The count went from 21 → 22 when `list_tags` was added in the
    /// 2026-05-22 audit follow-up — tag enumeration was a gap the e2e
    /// surfaced. Tag count is now ReadOnly tier, so the default surface
    /// also bumped from 17 → 18.
    #[test]
    fn closed_set_is_22_through_e1() {
        let names: Vec<&'static str> = tool_specs().iter().map(|t| t.name).collect();
        assert_eq!(names.len(), 22, "tool count = {}, want 22", names.len());
        for required in [
            "deploy",
            "suggest_relations",
            "suggest_parts",
            "suggest_lifecycle",
            "list_tags",
        ] {
            assert!(
                names.contains(&required),
                "closed set missing `{required}`"
            );
        }
    }

    /// Default gate hides Deploy + Evolve tools — the M9 default surface
    /// is the 18 non-gated tools (11 ReadOnly + 4 AgentContext +
    /// capture + propose + summarize_updates). Counts include `list_tags`
    /// added by the 2026-05-22 audit follow-up.
    #[test]
    fn default_gate_advertises_18_tools() {
        let surface = advertised_tool_specs(ToolGate::default());
        assert_eq!(surface.len(), 18, "default surface = {}", surface.len());
        for hidden in [
            "deploy",
            "suggest_relations",
            "suggest_parts",
            "suggest_lifecycle",
        ] {
            assert!(
                !surface.iter().any(|t| t.name == hidden),
                "`{hidden}` must be hidden by default"
            );
        }
    }

    #[test]
    fn rejects_resource_context_writes() {
        let err = ctx_write(Path::new("/tmp/content"), "silan://resources/ideas/x", "no")
            .expect_err("resources must be rejected");
        assert!(matches!(err, McpError::InvalidAgentUri));
    }

    /// Every advertised tool must have a `call` dispatch arm. A tool with no
    /// arm returns `UnknownTool`; any other error (including a missing-arg
    /// `InvalidRequest`) proves the arm exists. This is the regression guard
    /// for the "8 tools advertised but not implemented" drift.
    #[test]
    fn dispatch_covers_every_advertised_tool() {
        let args = serde_json::json!({});
        for spec in tool_specs() {
            let result = call(
                Path::new("/tmp/nonexistent-mcp"),
                Path::new("/tmp/nonexistent-mcp/portfolio.db"),
                "test",
                spec.name,
                &args,
            );
            if let Err(McpError::UnknownTool(name)) = result {
                panic!("advertised tool `{name}` has no dispatch arm");
            }
        }
    }
}
