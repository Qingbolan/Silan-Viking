//! `Workspace` — the L3 aggregate root.
//!
//! Per `docs/silan-viking/01` §1.6, a `Workspace` is one `content/` tree and
//! the single entry point that the L4 adapters (CLI / MCP / site) call. It
//! exposes `scan` (M5 — walk the disk into `Item`s), `sync` (M6 — parse, map,
//! write `portfolio.db`), and later `query` / `propose` / `publish`.
//!
//! Construction is via [`Workspace::open`], the dependency-assembly point:
//! it loads `SCHEMA.md`, builds the parser and mapper registries, and wires
//! the SQLite sink (`01` §1.5.0). Adapters never `new` a parser themselves.

mod scan;

pub use scan::{ScanError, ScanReport};

use crate::parser::ParserRegistry;
use crate::proposal::accept::{accept as run_accept, AcceptReport};
use crate::proposal::store::{ProposalKind, ProposalRecord};
use crate::proposal::{GitRepo, ProposalError, ProposalId};
use crate::query::{QueryError, QueryHit, QueryIndex};
use crate::schema::{Schema, SchemaError};
use crate::sync::{MapperRegistry, SqliteSink, SyncError, SyncReport};
use silan_viking_base::Identified;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use thiserror::Error;

/// The default main branch name of a `content/` Git repo.
pub const DEFAULT_MAIN_BRANCH: &str = "main";

/// One graded content-health issue from [`Workspace::lint`].
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct LintIssue {
    /// `fatal` / `warn` / `info`.
    pub level: String,
    /// The Item URI the issue is about.
    pub uri: String,
    /// The human-readable diagnostic message.
    pub message: String,
}

/// All ways opening a `Workspace` can fail.
#[derive(Debug, Error)]
pub enum OpenError {
    /// The workspace root or its `content/SCHEMA.md` could not be read.
    #[error("cannot read `{path}`: {detail}")]
    Io { path: String, detail: String },

    /// `content/SCHEMA.md` failed to parse.
    #[error("schema error: {0}")]
    Schema(#[from] SchemaError),
}

/// One `content/` tree, opened for scanning and syncing.
///
/// Invariant: `schema`, `parsers`, and `mappers` are all built from the same
/// `content/SCHEMA.md` at `open` time, so the parse contract and the map
/// contract never diverge within a `Workspace`.
pub struct Workspace {
    /// The `content/` directory (holds `SCHEMA.md`, `resources/`, `agent/`).
    content_root: PathBuf,
    schema: Arc<Schema>,
    parsers: ParserRegistry,
    mappers: MapperRegistry,
}

impl Workspace {
    /// Open the workspace whose `content/` directory is `content_root`.
    ///
    /// Loads `SCHEMA.md` and assembles the parser and mapper registries.
    pub fn open(content_root: impl AsRef<Path>) -> Result<Self, OpenError> {
        let content_root = content_root.as_ref().to_path_buf();
        let schema_path = content_root.join("SCHEMA.md");
        let schema_text = std::fs::read_to_string(&schema_path).map_err(|e| OpenError::Io {
            path: schema_path.display().to_string(),
            detail: e.to_string(),
        })?;
        let schema = Arc::new(Schema::parse(&schema_text)?);

        Ok(Self {
            content_root,
            schema: Arc::clone(&schema),
            parsers: ParserRegistry::new(Arc::clone(&schema)),
            mappers: MapperRegistry::new(),
        })
    }

    /// The loaded SCHEMA contract.
    pub fn schema(&self) -> &Schema {
        &self.schema
    }

    /// The `content/` root directory.
    pub fn content_root(&self) -> &Path {
        &self.content_root
    }

    /// Walk `content/resources/` and build every `Item` (milestone M5).
    ///
    /// See [`scan`] for the algorithm. The returned [`ScanReport`] holds the
    /// Items in scan order.
    pub fn scan(&self) -> Result<ScanReport, ScanError> {
        scan::scan_resources(&self.content_root)
    }

    /// Parse, map, and write every scanned Item into `portfolio.db`
    /// (milestone M6).
    ///
    /// The full chain (`01` §1.5.0):
    /// `scan -> parser_for -> parse -> validate -> mapper_for -> map -> sink`.
    pub fn sync(&self, db_path: impl AsRef<Path>) -> Result<SyncReport, SyncError> {
        let mut sink = SqliteSink::open(db_path.as_ref())?;
        self.sync_into(&mut sink)
    }

    /// `sync`, but writing into a caller-provided [`SqliteSink`] — used by
    /// tests that open an in-memory database.
    pub fn sync_into(&self, sink: &mut SqliteSink) -> Result<SyncReport, SyncError> {
        crate::sync::run_sync(&self.parsers, &self.mappers, &self.scan()?, sink)
    }

    /// Borrow the parser registry — exposed for the M5 main-chain scenario
    /// tests that exercise `parser_for` directly.
    pub fn parsers(&self) -> &ParserRegistry {
        &self.parsers
    }

    /// Borrow the mapper registry.
    pub fn mappers(&self) -> &MapperRegistry {
        &self.mappers
    }

    /// Build a local query index over the current `content/` tree (M7).
    pub fn query_index(&self) -> Result<QueryIndex, QueryError> {
        QueryIndex::build(
            &self.parsers,
            &self.scan().map_err(|e| QueryError::Build(e.to_string()))?,
        )
    }

    /// Recall matching Items from the local lexical index (M7).
    pub fn query(&self, text: &str, limit: usize) -> Result<Vec<QueryHit>, QueryError> {
        self.query_index()?.recall(text, limit)
    }

    /// Run every parser's `validate` over the scanned Items and return the
    /// graded issues — the content health report behind `silan index lint`
    /// and the MCP `lint` tool (`03` §3.2, `08` §8.7). An optional `uri`
    /// scopes the report to a single Item.
    pub fn lint(&self, uri: Option<&str>) -> Result<Vec<LintIssue>, ScanError> {
        let scan = self.scan()?;
        let mut issues = Vec::new();
        for item in scan.items() {
            let item_uri = item.uri().to_string();
            if uri.is_some_and(|u| u != item_uri) {
                continue;
            }
            let parser = match self.parsers.parser_for(item) {
                Ok(p) => p,
                Err(e) => {
                    issues.push(LintIssue {
                        level: "fatal".to_owned(),
                        uri: item_uri.clone(),
                        message: format!("parser dispatch failed: {e}"),
                    });
                    continue;
                }
            };
            let parsed = match parser.parse(item) {
                Ok(parsed) => parsed,
                Err(e) => {
                    issues.push(LintIssue {
                        level: "fatal".to_owned(),
                        uri: item_uri.clone(),
                        message: format!("parse error: {e}"),
                    });
                    continue;
                }
            };
            for issue in parser.validate(item, &parsed) {
                issues.push(LintIssue {
                    level: issue.severity().as_str().to_owned(),
                    uri: item_uri.clone(),
                    message: issue.message().to_owned(),
                });
            }
        }
        Ok(issues)
    }

    // ── M7 proposal lifecycle (`03` §3.1, `08` §8.5) ──────────────────────
    //
    // The `content/` directory is itself the proposal Git repo, so the repo
    // root is `content_root`. The engine owns the *whole* proposal branch
    // lifecycle — creation, registration, and `accept` — because each step
    // carries an invariant (`#10`: a proposal branch never advances `main`;
    // `accept` is the only path into `main`). The caller of `create_proposal`
    // (the MCP server's `propose`/`capture`, or a future `silan propose`)
    // supplies only *what files to write* via a closure; it never drives the
    // branch git itself. Creating a proposal is not an agent-only action —
    // silan may propose too — so it belongs in the engine, beside `accept`.

    /// Open the `content/` Git repository backing this workspace.
    pub fn content_repo(&self) -> Result<GitRepo, ProposalError> {
        Ok(GitRepo::open(&self.content_root)?)
    }

    /// Create a proposal branch `proposal/<id>`, let `write_draft` populate
    /// the working tree, commit it, return to `main`, and register the
    /// proposal's metadata (`03` §3.1). Returns the persisted record.
    ///
    /// The engine owns the branch lifecycle and the `#10` invariant (the
    /// branch is created off `main`, committed, and `main` is checked back
    /// out — `main` itself is never advanced here; only `accept` does that).
    /// `write_draft` receives the content root and writes whatever files the
    /// proposal carries — it is the *only* caller-specific part.
    pub fn create_proposal<F>(
        &self,
        id: &ProposalId,
        kind: ProposalKind,
        touched: Vec<String>,
        commit_summary: &str,
        write_draft: F,
    ) -> Result<ProposalRecord, ProposalError>
    where
        F: FnOnce(&Path) -> Result<(), ProposalError>,
    {
        let repo = self.content_repo()?;
        let branch = id.branch_name();
        // Branch off main; the agent/owner never writes to main directly.
        repo.run(["checkout", "-q", "-b", &branch])?;

        // The caller writes the draft files; then stage + commit. Run the
        // sequence into a `Result` so a failure does not skip the checkout
        // back to `main` below.
        let committed: Result<(), ProposalError> = (|| {
            write_draft(&self.content_root)?;
            repo.run(["add", "-A"])?;
            repo.run(["commit", "-q", "-m", commit_summary])?;
            Ok(())
        })();

        // Always return to main, even if the draft write or commit failed,
        // so a failed `create_proposal` does not strand the repo on the
        // proposal branch.
        let back = repo.run(["checkout", "-q", DEFAULT_MAIN_BRANCH]);
        committed?;
        back?;
        self.register_proposal(id, kind, touched)
    }

    /// Register proposal metadata for a `proposal/<id>` branch (`08` §8.5):
    /// records the base OID, kind, and touched URIs so `proposal list` can
    /// render it and flag overlaps. Returns the persisted record.
    pub fn register_proposal(
        &self,
        id: &ProposalId,
        kind: ProposalKind,
        touched: Vec<String>,
    ) -> Result<ProposalRecord, ProposalError> {
        let repo = self.content_repo()?;
        let base = repo.rev_parse(&format!("refs/heads/{DEFAULT_MAIN_BRANCH}"))?;
        let record = ProposalRecord::new(id, base, kind, touched);
        record.save(&repo.git_dir())?;
        Ok(record)
    }

    /// Every known proposal record, sorted by id (ULID ids sort by time) —
    /// the data behind `silan proposal list`.
    pub fn list_proposals(&self) -> Result<Vec<ProposalRecord>, ProposalError> {
        let repo = self.content_repo()?;
        ProposalRecord::load_all(&repo.git_dir())
    }

    /// Accept proposal `id` into the main branch (`03` §3.1 accept flow):
    /// worktree merge + post-merge validation + guarded `update-ref`. Every
    /// failure leaves the main branch untouched.
    pub fn accept_proposal(&self, id: &ProposalId) -> Result<AcceptReport, ProposalError> {
        run_accept(&self.content_root, id, DEFAULT_MAIN_BRANCH)
    }
}
