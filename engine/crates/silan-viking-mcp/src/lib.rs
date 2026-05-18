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
}

/// One advertised MCP tool.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ToolSpec {
    /// Tool name.
    pub name: &'static str,
    /// Mutability tier.
    pub tier: ToolTier,
    /// Short contract description.
    pub description: &'static str,
}

/// Initial handshake payload: schema version plus tool surface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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
        },
        ToolSpec {
            name: "list",
            tier: ReadOnly,
            description: "structured list by content type and status",
        },
        ToolSpec {
            name: "browse",
            tier: ReadOnly,
            description: "browse content tree",
        },
        ToolSpec {
            name: "read",
            tier: ReadOnly,
            description: "read one item summary",
        },
        ToolSpec {
            name: "context_brief",
            tier: ReadOnly,
            description: "brief owner/project context",
        },
        ToolSpec {
            name: "lint",
            tier: ReadOnly,
            description: "parser and schema health check",
        },
        ToolSpec {
            name: "stats",
            tier: ReadOnly,
            description: "view/like/comment counts (local stats cache)",
        },
        ToolSpec {
            name: "visitors",
            tier: ReadOnly,
            description: "de-identified visitor list (local stats cache)",
        },
        ToolSpec {
            name: "crawler_breakdown",
            tier: ReadOnly,
            description: "visitor-kind breakdown (local stats cache)",
        },
        ToolSpec {
            name: "source_breakdown",
            tier: ReadOnly,
            description: "referrer-source breakdown (local stats cache)",
        },
        ToolSpec {
            name: "capture",
            tier: Capture,
            description: "capture a note into a proposal",
        },
        ToolSpec {
            name: "ctx_read",
            tier: AgentContext,
            description: "read silan://agent context",
        },
        ToolSpec {
            name: "ctx_write",
            tier: AgentContext,
            description: "write silan://agent context",
        },
        ToolSpec {
            name: "ctx_brief",
            tier: AgentContext,
            description: "brief agent memory",
        },
        ToolSpec {
            name: "reflect",
            tier: AgentContext,
            description: "append session memory",
        },
        ToolSpec {
            name: "propose",
            tier: Proposal,
            description: "draft a content proposal (args: uri, draft, lang?=en, \
                          parts?) — targets an Item or Part. A URI whose Item \
                          does not exist yet is created (no CLI `new` needed); \
                          an existing one is modified. `parts` is a \
                          {role: content} object of additional Parts of the \
                          same Item — use it so a new multi-Part Item is ONE \
                          proposal. lang picks the language variant",
        },
        ToolSpec {
            name: "summarize_updates",
            tier: Proposal,
            description: "draft update summary proposal",
        },
    ]
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

/// Read one URI by using the query index metadata.
pub fn read(content_root: &Path, uri: &str) -> Result<Option<ReadResult>, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;
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
    draft: &str,
    lang: &str,
    extra_parts: &[PartDraft],
) -> Result<ProposalCreated, McpError> {
    let target = ProposalTarget::parse(uri).map_err(|e| McpError::Proposal(e.to_string()))?;
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;

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
    let mut writes: Vec<(DraftLocation, String, String)> = Vec::new();
    let primary = resolve_draft_location(&ws, &target, lang)?;
    let primary_meta = render_part_meta(&primary.role, primary.shape, lang);
    writes.push((primary, draft.to_owned(), primary_meta));
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

    Ok(ProposalCreated {
        id: id.as_str().to_owned(),
        branch: id.branch_name(),
    })
}

/// `capture(note)` — the lightweight entry point: drop a free-text note into
/// `agent/notes/` on a proposal branch. It is `propose` aimed at the agent's
/// own scratch space, so it always proposes a modification under
/// `silan://resources` is *not* used — capture stays in `agent/`.
pub fn capture(content_root: &Path, note: &str) -> Result<ProposalCreated, McpError> {
    let ws = Workspace::open(content_root).map_err(|e| McpError::Workspace(e.to_string()))?;

    let id =
        ProposalId::new(Ulid::new().to_string()).map_err(|e| McpError::Proposal(e.to_string()))?;
    let rel = format!("agent/notes/{}.md", id.as_str());

    ws.create_proposal(
        &id,
        ProposalKind::Create,
        vec![format!("silan://agent/notes/{}", id.as_str())],
        &format!("capture {}", id.as_str()),
        |root| write_draft_file(&root.join(&rel), note),
    )
    .map_err(|e| McpError::Proposal(e.to_string()))?;

    Ok(ProposalCreated {
        id: id.as_str().to_owned(),
        branch: id.branch_name(),
    })
}

/// Write a proposal draft file, creating parent directories. The
/// `write_draft` closure of `Workspace::create_proposal` returns
/// `ProposalError`, so io failures map to `ProposalError::Io`.
fn write_draft_file(path: &Path, body: &str) -> Result<(), silan_viking_app::ProposalError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| silan_viking_app::ProposalError::Io(e.to_string()))?;
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

    let type_spec = ws.schema().type_spec(kind).ok_or_else(|| {
        McpError::Proposal(format!("schema has no type spec for `{}`", kind))
    })?;

    let part_spec = match role {
        // Part target: the named role must be declared by the type.
        Some(role) => type_spec.part(role).ok_or_else(|| {
            let valid: Vec<&str> = type_spec.parts.iter().map(|p| p.role.as_str()).collect();
            McpError::Proposal(format!(
                "`{}` has no Part `{}` — valid Parts: {}",
                kind,
                role,
                valid.join(", ")
            ))
        })?,
        // Item target: fall back to the type's primary (lowest-order) Part.
        None => type_spec
            .parts
            .iter()
            .min_by_key(|p| p.order)
            .ok_or_else(|| {
                McpError::Proposal(format!("type `{}` declares no Parts", kind))
            })?,
    };

    let part_dir = format!(
        "{}/parts/{}",
        item_dir_rel(item_uri, kind),
        part_spec.role
    );
    let draft_file = format!("{part_dir}/{lang}.{}", part_spec.shape.file_extension());
    Ok(DraftLocation {
        part_dir,
        draft_file,
        role: part_spec.role.clone(),
        shape: part_spec.shape,
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
    propose(content_root, &uri, &draft, "en", &[])
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
        "browse" => {
            let uri = opt_str("uri").unwrap_or_else(|| "silan://resources".to_owned());
            Ok(json!({ "entries": browse(content_root, &uri)? }))
        }
        "read" => {
            let uri = str_arg("uri")?;
            match read(content_root, &uri)? {
                Some(r) => Ok(json!({ "uri": r.uri, "title": r.title, "languages": r.languages })),
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
            let created = capture(content_root, &note)?;
            Ok(json!({ "proposal_id": created.id, "branch": created.branch }))
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
            let draft = str_arg("draft")?;
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
                            McpError::Proposal(format!(
                                "parts.{role} must be a string draft"
                            ))
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
            let created = propose(content_root, &uri, &draft, &lang, &extra_parts)?;
            Ok(json!({ "proposal_id": created.id, "branch": created.branch }))
        }
        "summarize_updates" => {
            let summary = opt_str("summary").unwrap_or_else(|| "Recent updates.".to_owned());
            let created = summarize_updates(content_root, &summary)?;
            Ok(json!({ "proposal_id": created.id, "branch": created.branch }))
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
    fn handshake_advertises_all_four_tiers() {
        let tiers: std::collections::BTreeSet<_> = tool_specs()
            .into_iter()
            .map(|tool| tool.tier as u8)
            .collect();
        assert_eq!(tiers.len(), 4);
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
