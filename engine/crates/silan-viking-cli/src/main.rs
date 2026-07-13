//! `silan-viking` CLI binary — M8 command surface.

mod banner;
mod scaffold;
mod skill;

use rusqlite::{params, Connection, OptionalExtension};
use silan_viking_app::{ContentKind, Identified, ProposalId, ScannedAsset, Workspace};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

/// The canonical `content/SCHEMA.md`, embedded so `silan init` writes a
/// schema the engine can actually parse (it needs the fenced ```yaml``` block).
const SCHEMA_TEMPLATE: &str = include_str!("../assets/SCHEMA.md");

// Deploy artifacts, packed by `build.rs` into `OUT_DIR` and embedded
// here. `silan site deploy` unpacks these into a staging directory and
// builds the Docker images from them — so the user's machine needs
// only Docker, no source checkout, no Node, no Go (docs/silan-viking/16).
/// Front-end source (`frontend/`, minus `node_modules`/`dist`), gzip tar.
const FRONTEND_TARBALL: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/frontend.tar.gz"));
/// Go backend source (`backend/`, minus compiled binaries), gzip tar.
const BACKEND_TARBALL: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/backend.tar.gz"));
/// Docker deploy assets (`deploy/`: compose, Dockerfiles, nginx), gzip tar.
const DEPLOY_TARBALL: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/deploy.tar.gz"));

fn main() {
    if let Err(err) = run(env::args().skip(1).collect()) {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

/// Verb-usage lines for a known multi-verb command. Keyed by the
/// top-level command name; the slices are the same `<command> ...`
/// usage strings the `print_help` "verbs" sections render. Returns
/// `None` for unknown commands so callers can fall back to the banner.
///
/// Maintenance contract: this mirrors the dispatch table in `run` and
/// the verb listings in `print_help` — there is no auto-sync.
fn command_usage(command: &str) -> Option<&'static [&'static str]> {
    Some(match command {
        "idea" => &[
            "idea new|list|show|edit|archive|rm <slug>",
            "idea add-part <slug> <role> · idea add-lang <slug> <lang>",
            "idea status <slug> <state> · idea promote <slug> --to blog|project",
            "idea list [--status <status>|--tag <tag>]",
        ],
        "blog" => &[
            "blog new|list|show|edit|archive|rm <slug>",
            "blog add-part <slug> <role> · blog add-lang <slug> <lang>",
            "blog publish|unpublish <slug>",
            "blog list [--status <status>|--tag <tag>]",
        ],
        "project" => &[
            "project new|list|show|edit|archive|rm <slug>",
            "project add-part <slug> <role> · project add-lang <slug> <lang>",
            "project progress <slug>",
            "project list [--status <status>|--tag <tag>]",
        ],
        "update" => &[
            "update new|list|show|edit|archive|rm <slug>",
            "update add-part <slug> <role> · update add-lang <slug> <lang>",
            "update status <slug> <state> · update set-type <slug> <update-type>",
            "update list [--status <status>|--tag <tag>]",
        ],
        "episode" => &[
            "episode series new|list|show|reorder|archive|rm <series>",
            "episode new <series> <slug>",
            "episode show|edit|publish|unpublish|archive|rm <series> <slug>",
            "episode add-lang <series> <slug> <lang>",
        ],
        "resume" => &[
            "resume show|list",
            "resume add-part <role> · resume add-lang <role> <lang>",
            "resume edit <role> [lang]",
        ],
        "index" => &["index sync|status|lint|rebuild"],
        "content" => &[
            "content tree|ls|show <uri>",
            "content lint [<uri>] · content lint --drift",
        ],
        "relation" => &[
            "relation graph",
            "relation show <uri>",
            "relation link <from> <to> --type <kind>",
        ],
        "proposal" => &[
            "proposal list|show|accept|reject <id>",
            "proposal rebase <id> [--continue]",
            "proposal create <uri> [--lang en] (--from-file <path> | --from-stdin)",
        ],
        "site" => &[
            "site build [--static-base <base>|--target nus] · site preview|check|status [--out PATH]",
            "site publish <uri> · site deploy [--dry-run|--confirm]",
            "site update-content [--dry-run|--confirm]",
            "site rollback · site promote <live-db> <snapshot-db> <content-commit>",
        ],
        "stats" => &[
            "stats sync <uri>",
            "stats show|visitors|crawlers|sources <uri>",
        ],
        "mcp" => &["mcp serve [--stdio] · mcp status"],
        "uninstall" => &["uninstall [--purge] [--dry-run|--yes]"],
        "skill" => &["skill emit|status [--path PATH]", "skill rm [--path PATH]"],
        "config" => &["config · config edit [--global]"],
        "completion" => &["completion bash|zsh|fish"],
        _ => return None,
    })
}

/// The first positional (non-flag) token in `args`, skipping the
/// global `--content`/`--db`/`--out` flags and their values — the same
/// flags `CliOptions::parse` consumes. Returns `None` when every token
/// is a flag (or its value). Used to find the command name *before*
/// `CliOptions::parse` strips the flags.
fn first_positional(args: &[String]) -> Option<&str> {
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--content" | "--db" | "--out" => i += 2,
            other => return Some(other),
        }
    }
    None
}

fn run(args: Vec<String>) -> Result<(), String> {
    // Command-specific help: `silan-viking <command> --help`. The
    // top-level banner promises "run 'silan-viking <command> --help'
    // for command-specific help", but the broad `--help` check below
    // would catch that `--help` and fall through to the full banner —
    // breaking the promise. So when the first positional token is a
    // known multi-verb command AND a help flag follows, print just
    // that command's verb usage. Must run *before* the top-level check.
    if let Some(command) = first_positional(&args) {
        let asks_help = args
            .iter()
            .any(|a| matches!(a.as_str(), "-h" | "--help" | "help"));
        if asks_help {
            if let Some(usage) = command_usage(command) {
                println!("silan-viking {command} — verbs:");
                for line in usage {
                    println!("    silan-viking {line}");
                }
                return Ok(());
            }
        }
    }

    // Top-level version: `silan-viking --version` / `-V` / `version`. Caught
    // here, before `CliOptions::parse` would reject the flag as an unknown
    // command. The banner's last line already carries the version; this is
    // the conventional standalone form scripts and `--version` probes expect.
    if args
        .iter()
        .any(|a| matches!(a.as_str(), "-V" | "--version" | "version"))
    {
        println!("silan-viking {}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    // Top-level help is shown for no args, or whenever `-h`/`--help`/`help`
    // appears anywhere before a subcommand. We still parse `--content` so
    // the banner's status block reflects the project the user is pointing
    // at, not a stray cwd default.
    if args.is_empty()
        || args
            .iter()
            .any(|a| matches!(a.as_str(), "-h" | "--help" | "help"))
    {
        let content_root = resolve_content_root(&args);
        print_help(&content_root);
        return Ok(());
    }

    let opts = CliOptions::parse(&args)?;
    let command = opts.command.iter().map(String::as_str).collect::<Vec<_>>();
    match command.as_slice() {
        ["init"] => init_content(&opts.content_root),
        ["guide"] => guide(&opts.content_root, false),
        ["doctor"] => doctor(&opts.content_root),
        // uninstall [--purge] [--dry-run|--yes] — order-insensitive flags.
        ["uninstall", flags @ ..]
            if flags
                .iter()
                .all(|f| matches!(*f, "--purge" | "--dry-run" | "--yes")) =>
        {
            uninstall(
                &opts.content_root,
                flags.contains(&"--purge"),
                flags.contains(&"--dry-run"),
                flags.contains(&"--yes"),
            )
        }
        ["config"] => {
            println!("content_root={}", opts.content_root.display());
            println!("db={}", opts.db_path.display());
            Ok(())
        }
        ["config", "edit"] => config_edit(&opts.content_root, false),
        ["config", "edit", "--global"] => config_edit(&opts.content_root, true),
        ["completion", shell] => completion(shell),
        ["index", "sync"] => {
            let ws = Workspace::open(&opts.content_root).map_err(|e| e.to_string())?;
            let report = ws.sync(&opts.db_path).map_err(|e| e.to_string())?;
            println!(
                "synced items={} rows={} wrote={} hash={}",
                report.items_scanned, report.rows_written, report.wrote, report.content_hash
            );
            Ok(())
        }
        ["index", "status"] => {
            let ws = Workspace::open(&opts.content_root).map_err(|e| e.to_string())?;
            let scan = ws.scan().map_err(|e| e.to_string())?;
            println!("items={}", scan.len());
            Ok(())
        }
        ["index", "lint"] => {
            let ws = Workspace::open(&opts.content_root).map_err(|e| e.to_string())?;
            let index = ws.query_index().map_err(|e| e.to_string())?;
            println!(
                "ok documents={} embedder={:?}",
                index.documents().len(),
                index.mode()
            );
            Ok(())
        }
        ["index", "rebuild"] => {
            // `rebuild` discards the derived database and syncs from scratch.
            // Unlike `sync` — which writes into whatever db already exists —
            // it deletes the file first, so a db left over from an older
            // schema (a different tool, or a pre-migration build) cannot
            // collide with the current Entity layer. The `content/` truth
            // source is never touched; only the rebuildable cache is.
            if opts.db_path.exists() {
                std::fs::remove_file(&opts.db_path)
                    .map_err(|e| format!("could not remove old database: {e}"))?;
            }
            let ws = Workspace::open(&opts.content_root).map_err(|e| e.to_string())?;
            let report = ws.sync(&opts.db_path).map_err(|e| e.to_string())?;
            println!(
                "rebuilt items={} rows={} wrote={} hash={}",
                report.items_scanned, report.rows_written, report.wrote, report.content_hash
            );
            Ok(())
        }
        ["content", "tree"] => content_tree(&opts.content_root, None),
        ["content", "tree", uri] => content_tree(&opts.content_root, Some(uri)),
        ["content", "ls"] => content_ls(&opts.content_root, None),
        ["content", "ls", uri] => content_ls(&opts.content_root, Some(uri)),
        ["content", "show", uri] => content_show(&opts.content_root, uri),
        // `content lint` — graded content-health report (GOAL §7.3 / 14
        // §14.3 类 B 漂移). Subset surfaces today:
        //   `content lint`         — run Workspace::lint over every Item
        //   `content lint <uri>`   — same, scoped to one Item
        //   `content lint --drift` — doc / schema drift self-check; dev-only,
        //                            shells out to engine/scripts/check_docs_drift.py
        ["content", "lint"] => content_lint(&opts.content_root, None),
        ["content", "lint", "--drift"] => content_lint_drift(),
        ["content", "lint", uri] => content_lint(&opts.content_root, Some(uri)),
        // `relation list` is the noun-first alias newcomers reach for first
        // (matches `<type> list` for content); behaves identically to graph.
        ["relation", "graph"] | ["relation", "list"] => relation_graph(&opts.content_root),
        ["relation", "show", uri] => relation_show(&opts.content_root, uri),
        ["relation", "link", from, to, "--type", kind] => {
            relation_link(&opts.content_root, from, to, kind)
        }
        ["skill", "emit"] => skill::emit(&opts.content_root, &skill::default_skill_dir()),
        ["skill", "emit", "--path", path] | ["skill", "emit", path] => {
            skill::emit(&opts.content_root, Path::new(path))
        }
        ["skill", "status"] => skill::status(&opts.content_root, &skill::default_skill_dir()),
        ["skill", "status", "--path", path] | ["skill", "status", path] => {
            skill::status(&opts.content_root, Path::new(path))
        }
        ["skill", "rm"] => skill::remove(&skill::default_skill_dir()),
        ["skill", "rm", "--path", path] | ["skill", "rm", path] => skill::remove(Path::new(path)),

        // -- episode: series sub-group (must precede the per-episode arms) --
        ["episode", "series", "new", series] => episode_series_new(&opts.content_root, series),
        ["episode", "series", "list"] => episode_series_list(&opts.content_root),
        ["episode", "series", "show", series] => episode_series_show(&opts.content_root, series),
        ["episode", "series", "reorder", series, rest @ ..] => {
            episode_series_reorder(&opts.content_root, series, rest)
        }
        ["episode", "series", "archive", series] => {
            episode_series_archive(&opts.content_root, series)
        }
        ["episode", "series", "rm", series] => episode_series_rm(&opts.content_root, series),
        // -- episode: per-episode verbs --
        ["episode", "new", series, slug] => episode_new(&opts.content_root, series, slug),
        ["episode", "list"] => episode_list(&opts.content_root, None),
        ["episode", "list", series] => episode_list(&opts.content_root, Some(series)),
        ["episode", "show", series, slug] => episode_show(&opts.content_root, series, slug),
        ["episode", "edit", series, slug] => episode_edit(&opts.content_root, series, slug, None),
        ["episode", "edit", series, slug, lang] => {
            episode_edit(&opts.content_root, series, slug, Some(lang))
        }
        ["episode", "add-lang", series, slug, lang] => {
            episode_add_lang(&opts.content_root, series, slug, lang)
        }
        ["episode", "publish", series, slug] => {
            // Like blog publish: flip both status and visibility so the
            // episode actually projects to the site.
            episode_set_publish(&opts.content_root, series, slug, "published", "public")
        }
        ["episode", "unpublish", series, slug] => {
            episode_set_publish(&opts.content_root, series, slug, "draft", "private")
        }
        ["episode", "archive", series, slug] => {
            episode_set_status(&opts.content_root, series, slug, "archived")
        }
        ["episode", "rm", series, slug] => episode_rm(&opts.content_root, series, slug),

        // -- resume: single Item, Part-granular --
        ["resume", "show"] | ["resume", "show", _] => resume_show(&opts.content_root),
        ["resume", "list"] => resume_list(&opts.content_root),
        ["resume", "add-part", role] => resume_add_part(&opts.content_root, role),
        ["resume", "add-lang", role, lang] => resume_add_lang(&opts.content_root, role, lang),
        ["resume", "edit", role] => resume_edit(&opts.content_root, role, None),
        ["resume", "edit", role, lang] => resume_edit(&opts.content_root, role, Some(lang)),

        // -- type-specific verbs --
        ["idea", "status", slug, state] => {
            type_set_field(&opts.content_root, "idea", slug, "status", state)
        }
        ["idea", "promote", slug, "--to", target] => idea_promote(&opts.content_root, slug, target),
        ["blog", "publish", slug] => {
            // Publish writes BOTH status=published AND visibility=public so the
            // post actually reaches the website — `status` alone leaves it
            // private and unprojected (USAGE §3 table).
            type_set_publish(&opts.content_root, "blog", slug, "published", "public")
        }
        ["blog", "unpublish", slug] => {
            // Reverse: status back to draft AND visibility back to private.
            type_set_publish(&opts.content_root, "blog", slug, "draft", "private")
        }
        ["project", "progress", slug] => project_progress(&opts.content_root, slug),
        ["update", "status", slug, state] => {
            type_set_field(&opts.content_root, "update", slug, "status", state)
        }
        ["update", "set-type", slug, ut] => {
            type_set_field(&opts.content_root, "update", slug, "update_type", ut)
        }

        // -- flat-type write verbs (idea / blog / project / update) --
        [kind, "new", slug] if is_flat_kind(kind) => type_new(&opts.content_root, kind, slug),
        [kind, "add-part", slug, role] if is_flat_kind(kind) => {
            type_add_part(&opts.content_root, kind, slug, role)
        }
        [kind, "add-lang", slug, lang] if is_flat_kind(kind) => {
            type_add_lang(&opts.content_root, kind, slug, lang)
        }
        [kind, "edit", slug] if is_flat_kind(kind) => {
            type_edit(&opts.content_root, kind, slug, None)
        }
        [kind, "edit", slug, role] if is_flat_kind(kind) => {
            type_edit(&opts.content_root, kind, slug, Some(role))
        }
        [kind, "archive", slug] if is_flat_kind(kind) => {
            type_archive(&opts.content_root, kind, slug)
        }
        [kind, "rm", slug] if parse_kind(kind).is_some() => {
            type_rm(&opts.content_root, kind, slug, false)
        }
        [kind, "rm", slug, "--force"] if parse_kind(kind).is_some() => {
            type_rm(&opts.content_root, kind, slug, true)
        }

        [kind, "list"] if parse_kind(kind).is_some() => {
            type_list(&opts.content_root, kind, None, None)
        }
        [kind, "list", "--status", status] if parse_kind(kind).is_some() => {
            type_list(&opts.content_root, kind, Some(status), None)
        }
        // `silan tags` — enumerate every tag used across the workspace, with
        // counts. `--type <kind>` scopes to one content kind. Backs the
        // owner question "what tags am I using" that USAGE §6 / `02` flag
        // but the round-two audit found neither CLI nor MCP answered. The
        // MCP companion is the `list_tags` tool added alongside.
        ["tags"] => tags_list(&opts.content_root, None),
        ["tags", "--type", kind] if parse_kind(kind).is_some() => {
            tags_list(&opts.content_root, Some(kind))
        }
        [kind, "list", "--tag", tag] if parse_kind(kind).is_some() => {
            type_list(&opts.content_root, kind, None, Some(tag))
        }
        [kind, "show", slug] if parse_kind(kind).is_some() => {
            type_show(&opts.content_root, kind, slug)
        }
        ["proposal", "list"] => proposal_list(&opts.content_root),
        ["proposal", "show", id] => proposal_show(&opts.content_root, id),
        ["proposal", "accept", id] => proposal_accept(&opts.content_root, id),
        ["proposal", "reject", id] => proposal_reject(&opts.content_root, id),
        ["proposal", "rebase", id, "--continue"] => {
            proposal_rebase_continue(&opts.content_root, id)
        }
        ["proposal", "rebase", id] => proposal_rebase(&opts.content_root, id),
        ["proposal", "create", rest @ ..] => proposal_create(&opts.content_root, rest),
        ["stats", "sync", uri] => stats_sync(&opts.content_root, &opts.db_path, uri),
        ["stats", "show", uri] => stats_show(&opts.db_path, uri),
        ["stats", "visitors", uri] => stats_visitors(&opts.db_path, uri),
        ["stats", "crawlers", uri] => stats_crawlers(&opts.db_path, uri),
        ["stats", "sources", uri] => stats_sources(&opts.db_path, uri),
        // `mcp serve [--stdio]` accepts gate flags in any order after the
        // verb. The gates surface deploy / E-stage tools that are kept out
        // of the default 17-tool surface (17 §17.2 / GOAL §5).
        ["mcp", "serve", rest @ ..] => {
            let mut stdio = false;
            let mut gate = silan_viking_mcp::ToolGate::default();
            for flag in rest {
                match *flag {
                    "--stdio" => stdio = true,
                    "--enable-deploy" => gate.deploy = true,
                    "--enable-evolve" => gate.evolve = true,
                    other => {
                        return Err(format!(
                            "unknown `mcp serve` flag `{other}` \
                             (accepts --stdio / --enable-deploy / --enable-evolve)"
                        ));
                    }
                }
            }
            if stdio {
                mcp_stdio(&opts.content_root, &opts.db_path, gate)
            } else {
                mcp_handshake(&opts.content_root, gate)
            }
        }
        ["mcp", "status"] => mcp_status(&opts.content_root),
        ["site", "build", flags @ ..] => {
            let target = FrontendBuildTarget::parse_site_build_flags(flags)?;
            site_build(&opts.content_root, &opts.out_dir, target)
        }
        // `site preview` and `site build` used to be aliases — the 2026-05-21
        // e2e pass surfaced that `preview` produced only SEO artefacts and
        // never started anything you could open in a browser. Now `preview`
        // delegates to a real local-docker stack (single-host deploy, no
        // [deploy] config required); `build` stays an artefacts-only operation.
        ["site", "preview"] => {
            site_preview(&opts.content_root, &opts.db_path, &opts.out_dir, false)
        }
        ["site", "preview", "--confirm"] => {
            site_preview(&opts.content_root, &opts.db_path, &opts.out_dir, true)
        }
        ["site", "check"] => site_check(&opts.content_root),
        ["site", "status"] => site_status(&opts.content_root),
        ["site", "promote", live, snapshot, commit] => site_promote(live, snapshot, commit),
        ["site", "publish", uri] => site_publish(&opts.content_root, uri),
        // `site deploy` accepts an optional `--confirm` / `--dry-run` (mutually
        // exclusive) and, in nginx mode, an optional `--what=content|frontend|
        // backend|all` to scope the push. The two flags can appear in any
        // order.
        ["site", "deploy", flags @ ..] => {
            let mut confirm = false;
            let mut what = DeployWhat::All;
            for arg in flags {
                match *arg {
                    "--confirm" => confirm = true,
                    "--dry-run" => confirm = false,
                    s if s.starts_with("--what=") => {
                        what = DeployWhat::parse(&s["--what=".len()..])?;
                    }
                    other => {
                        return Err(format!(
                            "site deploy: unknown flag `{other}` · expected --confirm | --dry-run | --what=content|frontend|backend|all"
                        ));
                    }
                }
            }
            site_deploy(
                &opts.content_root,
                &opts.db_path,
                &opts.out_dir,
                confirm,
                what,
            )
        }
        // `site update-content` — the narrow, frequently-needed verb: push
        // edited content/ to the live backend, nothing else. It is exactly
        // `site deploy --what=content` with a name that says what it does,
        // so authors don't have to know that "deploy" is overloaded for
        // both "ship the whole stack" and "just refresh the DB".
        ["site", "update-content", flags @ ..] => {
            let mut confirm = false;
            for arg in flags {
                match *arg {
                    "--confirm" => confirm = true,
                    "--dry-run" => confirm = false,
                    other => {
                        return Err(format!(
                            "site update-content: unknown flag `{other}` · expected --confirm | --dry-run"
                        ));
                    }
                }
            }
            site_deploy(
                &opts.content_root,
                &opts.db_path,
                &opts.out_dir,
                confirm,
                DeployWhat::Content,
            )
        }
        ["site", "rollback"] => site_rollback(&opts.content_root),
        // The first token names a known multi-verb command, but the rest
        // didn't match any arm — a bare or mistyped subcommand. List that
        // command's verbs rather than leaving the user with a blank error.
        [head, ..] if command_usage(head).is_some() => {
            let usage = command_usage(head).expect("guarded by match arm");
            let mut msg = if command.len() == 1 {
                format!("`{head}` needs a subcommand. Usage:")
            } else {
                format!(
                    "unknown `{head}` subcommand `{}`. Usage:",
                    command[1..].join(" "),
                )
            };
            for line in usage {
                msg.push_str("\n    silan-viking ");
                msg.push_str(line);
            }
            Err(msg)
        }
        _ => Err(format!(
            "unknown command `{}` · run 'silan-viking --help' for the command list",
            opts.command.join(" "),
        )),
    }
}

struct CliOptions {
    content_root: PathBuf,
    db_path: PathBuf,
    out_dir: PathBuf,
    command: Vec<String>,
}

impl CliOptions {
    fn parse(args: &[String]) -> Result<Self, String> {
        let cwd = env::current_dir().map_err(|e| e.to_string())?;
        let mut explicit_content: Option<PathBuf> = None;
        let mut db_path: Option<PathBuf> = None;
        let mut explicit_out: Option<PathBuf> = None;
        let mut command = Vec::new();
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--content" => {
                    i += 1;
                    explicit_content = Some(
                        args.get(i)
                            .ok_or("--content requires a path")?
                            .as_str()
                            .into(),
                    );
                }
                "--db" => {
                    i += 1;
                    db_path = Some(args.get(i).ok_or("--db requires a path")?.as_str().into());
                }
                "--out" => {
                    i += 1;
                    explicit_out =
                        Some(args.get(i).ok_or("--out requires a path")?.as_str().into());
                }
                other => command.push(other.to_owned()),
            }
            i += 1;
        }

        // V3-H / F5 carry-over: if no `--content` was passed, climb `..`
        // from cwd looking for a `silan-viking.toml`. That file is the
        // project root marker (the same role `git rev-parse --show-toplevel`
        // serves for git). Without this climb, running `silan-viking idea
        // new <slug>` from a subdir of a project either operated on the
        // wrong tree or required threading `--content` on every call.
        let project_root = explicit_content
            .as_deref()
            .and_then(|p| p.parent())
            .map(Path::to_path_buf)
            .or_else(|| find_project_root_from(&cwd));
        let content_root = explicit_content.unwrap_or_else(|| match &project_root {
            Some(root) => root.join("content"),
            None => cwd.join("content"),
        });

        let out_dir = explicit_out.unwrap_or_else(|| match &project_root {
            Some(root) => root.join("_site"),
            None => cwd.join("_site"),
        });

        // `--db` wins. Otherwise resolve from `silan-viking.toml`'s
        // `[database].path` (relative to the project root) so `index sync` and
        // `site deploy` write where the config says, not a stray cwd file.
        let db_path = db_path
            .unwrap_or_else(|| resolve_db_path(&content_root).unwrap_or(cwd.join("portfolio.db")));
        Ok(Self {
            content_root,
            db_path,
            out_dir,
            command,
        })
    }
}

/// Climb `..` from `start` looking for a directory that contains a
/// `silan-viking.toml`. Returns the project root (the directory containing
/// the file) on the first hit, or `None` if no ancestor has one.
///
/// This is the `git rev-parse --show-toplevel`-style discovery the V1 e2e
/// (F2) and V2 e2e (F5) both flagged: without it, every command run from
/// a subdir of a project either needs explicit `--content` flags or works
/// against the wrong tree.
fn find_project_root_from(start: &Path) -> Option<PathBuf> {
    let mut cur: Option<&Path> = Some(start);
    while let Some(dir) = cur {
        if dir.join("silan-viking.toml").is_file() {
            return Some(dir.to_path_buf());
        }
        cur = dir.parent();
    }
    None
}

/// Resolve the derived-database path from `silan-viking.toml`'s
/// `[database].path`. The project root is the content dir's parent; a relative
/// config path is joined onto it. Returns `None` when there is no project
/// config yet (e.g. before `silan init`) so the caller can fall back.
fn resolve_db_path(content_root: &Path) -> Option<PathBuf> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let config: toml::Value = fs::read_to_string(project_root.join("silan-viking.toml"))
        .ok()?
        .parse()
        .ok()?;
    let raw = config
        .get("database")
        .and_then(|d| d.get("path"))
        .and_then(|v| v.as_str())?;
    let path = Path::new(raw);
    Some(if path.is_absolute() {
        path.to_path_buf()
    } else {
        project_root.join(path)
    })
}

/// Resolve the content root for the help/banner path. Mirrors the
/// `--content` handling in `CliOptions::parse` so the banner's status
/// block reflects the project the user is pointing at.
///
/// Priority: `--content <path>` (explicit) → `find_project_root_from(cwd)`
/// climb (V3-H fix) → `<cwd>/content` fallback. The climb means running
/// `silan-viking --help` from a project subdir prints the right project
/// status (matching what `silan-viking ... idea new` would actually do).
fn resolve_content_root(args: &[String]) -> PathBuf {
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut explicit: Option<PathBuf> = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--content" {
            if let Some(p) = args.get(i + 1) {
                explicit = Some(PathBuf::from(p));
            }
            i += 2;
            continue;
        }
        i += 1;
    }
    if let Some(p) = explicit {
        return p;
    }
    if let Some(root) = find_project_root_from(&cwd) {
        return root.join("content");
    }
    cwd.join("content")
}

/// Top-level `--help`. Aligned with EasyNet-Cli (`src/facade/cli/mod.rs`)
/// so the two CLIs read as one product family:
///
///   1. ASCII wordmark banner + tagline + signature + live project status
///      (rendered by `banner::render_top_level_banner`).
///   2. A hand-grouped, ANSI-coloured `Commands:` block with `[Group]`
///      headers in bold cyan and command names in bold.
///
/// Maintenance contract: this block is hand-written. Adding, renaming, or
/// removing a command requires updating both the dispatch table in `run`
/// and this listing — there is no auto-sync.
fn print_help(content_root: &Path) {
    use banner::sgr;
    let style = banner::colour_mode();

    // Banner: wordmark + tagline + signature + project-status block.
    print!("{}", banner::render_top_level_banner(content_root));

    let h = |t: &str| style.paint(sgr::ACCENT, t); // group / section header
    let c = |t: &str| style.paint(sgr::BOLD, t); // command literal
    let d = |t: &str| style.paint(sgr::DIM, t); // dim hint text

    // Usage line.
    println!("{}", h("Usage:"));
    println!(
        "  {} {}\n",
        c("silan-viking"),
        d("[--content PATH] [--db PATH] [--out PATH] <command>"),
    );

    // Grouped command listing. `[Group]` headers in bold cyan, command
    // names in bold, descriptions plain. Padding is fixed so the
    // description column lines up across every group.
    println!("{}", h("Commands:"));

    // Pad a command name to a fixed-width column so descriptions line
    // up. The width must clear the longest name (`idea|blog|project|
    // update`, 24 chars); `c()` wraps the name in ANSI escapes, so the
    // pad is applied to the *painted* string and the escapes count
    // toward the width — we therefore pad the raw name first, then
    // paint, keeping the visible column honest.
    const NAME_COL: usize = 26;
    let row = |name: &str, desc: &str| {
        let painted = c(name);
        let pad = NAME_COL.saturating_sub(name.chars().count());
        println!("    {}{} {}", painted, " ".repeat(pad), desc);
    };

    println!("  {}", h("[Content]"));
    row(
        "idea|blog|project|update",
        "Create / edit / list a content item",
    );
    row("episode", "Manage episode series and per-episode entries");
    row("resume", "Show and edit the single resume Item");
    println!();

    println!("  {}", h("[Workflow]"));
    row("index", "Sync, lint, or rebuild the derived database");
    row("content", "Inspect the content tree (tree, ls, show)");
    row("relation", "Inspect and link cross-item relations");
    row(
        "proposal",
        "Review agent proposals (list, accept, reject, rebase)",
    );
    println!();

    println!("  {}", h("[Publish]"));
    row("site", "Build, preview, check, deploy, rollback the site");
    row("stats", "Pull and query runtime visitor statistics");
    println!();

    println!("  {}", h("[Integration]"));
    row(
        "mcp",
        "MCP server — expose the content engine to AI assistants",
    );
    row(
        "skill",
        "Manage the silan-viking Claude skill (emit, status, rm)",
    );
    println!();

    println!("  {}", h("[Maintenance]"));
    row("init", "Lay down a runnable silan-viking project");
    row("guide", "Show the next recommended step for this project");
    row("doctor", "Health check — content, index, embedder");
    row("config", "Show resolved paths, or edit silan-viking.toml");
    row(
        "completion",
        "Emit a shell completion script (bash/zsh/fish)",
    );
    row(
        "uninstall",
        "Remove the skill + derived files (--purge: content too)",
    );
    println!();

    // Per-group detail, for the verbs the one-line summary can't carry.
    println!("{}", h("Content verbs:"));
    println!(
        "  {}",
        d("idea|blog|project|update new|list|show|edit|archive|rm <slug>")
    );
    println!(
        "  {}",
        d("idea|blog|project|update add-part <slug> <role> · add-lang <slug> <lang>")
    );
    println!(
        "  {}",
        d("idea status <slug> <state> · idea promote <slug> --to blog|project")
    );
    println!(
        "  {}",
        d("blog publish|unpublish <slug> · project progress <slug>")
    );
    println!(
        "  {}",
        d("update status <slug> <state> · update set-type <slug> <update-type>")
    );
    println!(
        "  {}",
        d("episode series new|list|show|reorder|archive|rm <series>")
    );
    println!(
        "  {}",
        d("episode new|show|edit|add-lang|publish|unpublish|archive|rm <series> <slug>")
    );
    println!(
        "  {}",
        d("resume show|list · resume add-part|add-lang|edit <role> [lang]")
    );
    println!();

    println!("{}", h("Workflow verbs:"));
    println!("  {}", d("index sync|status|lint|rebuild"));
    println!(
        "  {}",
        d("content tree|ls|show <uri> · relation graph|show <uri>")
    );
    println!("  {}", d("relation link <from> <to> --type <kind>"));
    println!(
        "  {}",
        d("proposal list|show|accept|reject <id> · proposal rebase <id> [--continue]")
    );
    println!();

    println!("{}", h("Publish verbs:"));
    println!(
        "  {}",
        d("site build [--static-base <base>|--target nus] · site preview|check|status [--out PATH]")
    );
    println!(
        "  {}",
        d("site publish <uri> · site deploy [--dry-run|--confirm]")
    );
    println!("  {}", d("site update-content [--dry-run|--confirm]"));
    println!(
        "  {}",
        d("site rollback · site promote <live-db> <snapshot-db> <content-commit>")
    );
    println!(
        "  {}",
        d("stats sync <uri> · stats show|visitors|crawlers|sources <uri>")
    );
    println!();

    println!("{}", h("Maintenance verbs:"));
    println!(
        "  {}",
        d("config edit [--global] · completion bash|zsh|fish")
    );
    println!("  {}", d("uninstall [--purge] [--dry-run|--yes]"));
    println!();

    println!(
        "{}",
        d(&format!(
            "silan-viking {} · run 'silan-viking <command> --help' for command-specific help.",
            env!("CARGO_PKG_VERSION"),
        )),
    );
}

/// The default `silan-viking.toml` project config (`06` §6.2.2).
fn default_config(content_dir: &str) -> String {
    format!(
        "# silan-viking.toml — project config (per docs/silan-viking/06 §6.2.2).\n\
         # Required sections: [project], [database]. [deploy] is needed only\n\
         # for `silan site deploy`; [identity]/[mcp] may be omitted.\n\
         \n\
         [project]\n\
         name        = \"silan-site\"\n\
         content_dir = \"{content_dir}\"\n\
         \n\
         [identity]\n\
         # Seeds content/resources/resume/parts/summary/en.md on `init`;\n\
         # after that, edit that file — it is the truth source, this is not.\n\
         full_name = \"Example User\"\n\
         title     = \"AI Researcher / Engineer\"\n\
         email     = \"example@example.com\"\n\
         location  = \"\"\n\
         \n\
         [database]\n\
         path = \"_deploy/portfolio.db\"\n\
         \n\
         [mcp]\n\
         port          = 7700\n\
         enable_deploy = false\n\
         \n\
         # [deploy] — uncomment and fill in for `silan site deploy`.\n\
         # The Docker compose file and images are embedded in the silan\n\
         # binary; the target machine needs only Docker.\n\
         # host         = \"example.com\"\n\
         # user         = \"deploy\"\n\
         # ssh_key_path = \"~/.ssh/silan_deploy_ed25519\"  # path only, never the key\n\
         # remote_dir   = \"/srv/silan-viking\"\n"
    )
}

/// `silan init` — lay down a runnable project: `content/SCHEMA.md` (the real
/// embedded schema), the `silan-viking.toml` config, the `agent/` tree, the
/// single `resume` Item seeded from `[identity]`, and a Git repo over
/// `content/` with a first commit (`06` §6.2: `content/` is the proposal Git
/// repo, so `init` must `git init` + commit).
fn init_content(content_root: &Path) -> Result<(), String> {
    fs::create_dir_all(content_root.join("resources")).map_err(|e| e.to_string())?;
    fs::create_dir_all(content_root.join("agent/notes")).map_err(|e| e.to_string())?;

    // SCHEMA.md — the embedded canonical schema, so `index sync` works.
    let schema = content_root.join("SCHEMA.md");
    if !schema.exists() {
        fs::write(&schema, SCHEMA_TEMPLATE).map_err(|e| e.to_string())?;
    }

    // silan-viking.toml — at the project root (the content dir's parent).
    let content_dir_name = content_root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("content");
    let project_root = content_root.parent().unwrap_or(content_root);
    let config = project_root.join("silan-viking.toml");
    if !config.exists() {
        fs::write(&config, default_config(content_dir_name)).map_err(|e| e.to_string())?;
    }

    // .gitignore — keep derived caches out of the content Git repo.
    let gitignore = content_root.join(".gitignore");
    if !gitignore.exists() {
        fs::write(&gitignore, "/.silan-cache\n*.db\n").map_err(|e| e.to_string())?;
    }

    // The single resume Item — every project has exactly one (`02` §一).
    // The presence check keys on the `summary` *Part* (the one required
    // part of a resume), not on the `resources/resume` directory: that
    // directory may already exist as an empty skeleton folder, in which
    // case keying on it would silently skip scaffolding and leave an
    // Item with zero language variants — a state `index sync` rejects
    // with "parsed item has no language variant".
    let resume_summary = content_root.join("resources/resume/parts/summary");
    if !resume_summary.exists() {
        scaffold::new_resume(content_root, "Example User", "AI Researcher / Engineer")
            .map_err(|e| e.to_string())?;
    }

    // The six content-type directories (`06` §6.2.1). `episode` / `update`
    // stay empty collections — no seed item, just the directory so the
    // collection exists. `blog` / `ideas` / `projects` each get one seed
    // item below; `resume` is already scaffolded above.
    for type_dir in ["blog", "ideas", "projects", "episode", "update"] {
        fs::create_dir_all(content_root.join("resources").join(type_dir))
            .map_err(|e| e.to_string())?;
    }

    // Three seed items (`06` §6.2.1: "六 type + 三示例条目"): a welcome blog,
    // one idea, one project. Skipped if a same-slug item already exists, so
    // `init` over a non-empty content/ does not clobber real content.
    for (kind, slug) in [
        ("blog", "welcome"),
        ("idea", "first-idea"),
        ("project", "first-project"),
    ] {
        let item_dir = content_root
            .join("resources")
            .join(scaffold::type_dir_name(kind).map_err(|e| e.to_string())?)
            .join(slug);
        if !item_dir.exists() {
            scaffold::new_item(content_root, kind, slug).map_err(|e| e.to_string())?;
        }
    }

    // `git init` over `content/` + first commit (`06` §6.2 step 3). The
    // proposal mechanism (`03` §3.1) needs `content/` to be a Git repo, so
    // `init` must establish it. Exit code 2 if `git` is unavailable.
    git_init_content(content_root)?;

    println!("initialized {}", content_root.display());
    println!("  schema  {}", schema.display());
    println!("  config  {}", config.display());
    println!(
        "  resume  {}",
        content_root.join("resources/resume").display()
    );

    // Hand the user the next step — `init` should never end on a flat list
    // of paths. `guide` reads the just-created project and prints the arc.
    println!();
    guide(content_root, true)?;
    Ok(())
}

/// The default Git author for the `content/` repo (`06` §6.2). Persisted into
/// the repo's own `git config` at `init`, so every later commit — the
/// proposal merge commit (`03` §3.1 accept), `ctx_write`, `reflect` — carries
/// it without each call passing `-c`.
const DEFAULT_GIT_NAME: &str = "Silan.Hu";
const DEFAULT_GIT_EMAIL: &str = "silan.hu@u.nus.edu";

/// Run `git init` over `content/`, set the default identity, and make the
/// first commit — unless the directory is already a Git repo. A missing `git`
/// binary exits with code 2 (`06` §6.8: environment error), distinct from a
/// code-1 user error.
fn git_init_content(content_root: &Path) -> Result<(), String> {
    let git = |args: &[&str]| -> Result<(), String> {
        let status = match Command::new("git")
            .args(args)
            .current_dir(content_root)
            .status()
        {
            Ok(status) => status,
            Err(e) => {
                // `git` not on PATH — environment error, exit code 2.
                eprintln!("error: git is required for `silan init`: {e}");
                std::process::exit(2);
            }
        };
        if !status.success() {
            return Err(format!("git {} failed", args.join(" ")));
        }
        Ok(())
    };

    // An already-initialized repo (e.g. `init --here` on a clone): don't
    // re-init or re-commit, but still ensure the default identity is set so
    // the proposal merge commit has an author.
    if content_root.join(".git").is_dir() {
        git_ensure_identity(content_root);
        return Ok(());
    }

    // `-b main`: the proposal plane (`03` §3.1) advances the `main` branch
    // ref, so the repo must be born on `main`, not the git default.
    git(&["init", "--quiet", "-b", "main"])?;
    // Persist the default identity into the repo config so every commit the
    // engine makes later (proposal merge, ctx_write, reflect) is attributed.
    git(&["config", "user.name", DEFAULT_GIT_NAME])?;
    git(&["config", "user.email", DEFAULT_GIT_EMAIL])?;
    git(&["add", "-A"])?;
    git(&["commit", "--quiet", "-m", "chore: silan init"])?;
    println!("  git     initialized content/ repo ({DEFAULT_GIT_NAME} <{DEFAULT_GIT_EMAIL}>)");
    Ok(())
}

/// Set the default Git identity on an existing `content/` repo, but only for
/// keys that are not already configured — never override an identity the
/// owner set themselves.
fn git_ensure_identity(content_root: &Path) {
    for (key, default) in [
        ("user.name", DEFAULT_GIT_NAME),
        ("user.email", DEFAULT_GIT_EMAIL),
    ] {
        let configured = Command::new("git")
            .args(["config", "--local", key])
            .current_dir(content_root)
            .output()
            .map(|o| o.status.success() && !o.stdout.is_empty())
            .unwrap_or(false);
        if !configured {
            let _ = Command::new("git")
                .args(["config", key, default])
                .current_dir(content_root)
                .status();
        }
    }
}

fn doctor(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    let index = ws.query_index().map_err(|e| e.to_string())?;
    println!(
        "ok content={} items={} documents={} embedder={:?}",
        content_root.display(),
        scan.len(),
        index.documents().len(),
        index.mode()
    );
    Ok(())
}

/// `uninstall [--purge] [--dry-run|--yes]` — remove what silan-viking put on
/// this machine.
///
/// Two scopes, because `content/` is the user's hand-written source of truth
/// and `index sync`/`deploy` cannot regenerate it:
///   - default: the installed skill (`~/.claude/skills/silan-viking`) and the
///     *derived* `_deploy/` artifacts (index db, deploy staging, tarballs) —
///     everything reproducible from `content/`.
///   - `--purge`: also `content/` and `silan-viking.toml`, i.e. the project
///     itself. Irreversible loss of authored content.
///
/// The operation is "loud": it prints the exact path list it will delete and
/// waits for a typed `y` (or the purge confirm word) before touching disk.
/// `--dry-run` lists and stops; `--yes` skips the prompt for scripts. This
/// mirrors `site deploy`'s dry-run-by-intent / `--confirm` discipline.
fn uninstall(
    content_root: &Path,
    purge: bool,
    dry_run: bool,
    assume_yes: bool,
) -> Result<(), String> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let skill_dir = skill::default_skill_dir();
    let deploy_dir = project_root.join("_deploy");

    // Build the delete list — only paths that actually exist, so the printed
    // plan is the truth and an absent path is not reported as a deletion.
    let mut targets: Vec<(PathBuf, &str)> = Vec::new();
    if skill_dir.exists() {
        targets.push((skill_dir.clone(), "installed Claude skill"));
    }
    if deploy_dir.exists() {
        targets.push((deploy_dir.clone(), "derived index + deploy artifacts"));
    }
    if purge {
        // content/ and the project config — the irreplaceable half.
        if content_root.exists() {
            targets.push((
                content_root.to_path_buf(),
                "content/ — YOUR AUTHORED CONTENT",
            ));
        }
        let config = project_root.join("silan-viking.toml");
        if config.exists() {
            targets.push((config, "project config"));
        }
    }

    if targets.is_empty() {
        println!("nothing to uninstall — no silan-viking artifacts found");
        return Ok(());
    }

    // Print the plan. This is the same list whether or not we go on to delete.
    println!(
        "silan-viking uninstall{} — the following will be deleted:",
        if purge { " --purge" } else { "" },
    );
    for (path, what) in &targets {
        println!("  {}  ({what})", path.display());
    }
    if !purge {
        println!("\ncontent/ and silan-viking.toml are kept. Pass --purge to delete those too.",);
    }

    if dry_run {
        println!("\n--dry-run: nothing deleted.");
        return Ok(());
    }

    // The confirmation gate. --purge demands the word `purge` (not a bare `y`)
    // so a reflexive yes cannot wipe authored content; the plain scope takes
    // `y`. --yes skips the prompt entirely, for non-interactive callers.
    if !assume_yes {
        let (prompt, expected) = if purge {
            (
                "\nThis DELETES your content/ — type `purge` to confirm: ",
                "purge",
            )
        } else {
            ("\nProceed? [y/N]: ", "y")
        };
        print!("{prompt}");
        // `flush` lives on `io::Write`; call it fully-qualified rather than
        // pulling a bare `Write` into this large module's namespace.
        io::Write::flush(&mut io::stdout()).map_err(|e| e.to_string())?;
        let mut answer = String::new();
        io::stdin()
            .read_line(&mut answer)
            .map_err(|e| e.to_string())?;
        if answer.trim() != expected {
            println!("aborted — nothing deleted.");
            return Ok(());
        }
    }

    for (path, _) in &targets {
        fs::remove_dir_all(path)
            .or_else(|_| fs::remove_file(path))
            .map_err(|e| format!("removing {}: {e}", path.display()))?;
        println!("removed {}", path.display());
    }
    println!("uninstall complete.");
    if !purge {
        println!("the silan-viking binary itself is not self-deleting — remove it by hand.");
    }
    Ok(())
}

/// The lifecycle stage of a silan-viking project, used by `guide` and `init`
/// to tell the user what to do next.
enum ProjectStage {
    /// No `silan-viking.toml` + `SCHEMA.md` — not a project yet.
    NotInitialised,
    /// Initialised, but the derived DB is missing or empty — `index sync`
    /// has not run (or ran against no content).
    NotSynced,
    /// Initialised and the derived DB is built — ready to preview / deploy.
    Synced,
}

/// Classify the project at `content_root`. Mirrors the banner's state logic
/// (`banner::write_project_status`) so `guide`, `init`, and the banner agree
/// on what stage a directory is in.
fn project_stage(content_root: &Path) -> ProjectStage {
    let project_root = content_root.parent().unwrap_or(content_root);
    let initialised =
        project_root.join("silan-viking.toml").exists() && content_root.join("SCHEMA.md").exists();
    if !initialised {
        return ProjectStage::NotInitialised;
    }
    // Initialised — is the derived DB built and non-empty?
    let synced = resolve_db_path(content_root)
        .and_then(|db| fs::metadata(db).ok())
        .is_some_and(|meta| meta.len() > 0);
    if synced {
        ProjectStage::Synced
    } else {
        ProjectStage::NotSynced
    }
}

/// `guide` — print the next recommended step(s) for wherever the project is
/// in its lifecycle. The terminal-state answer to "I just installed this,
/// now what?": instead of making the user read the full command surface,
/// `guide` looks at the directory and hands them the exact next command.
///
/// `from_init` tags the call as the tail of `init`, which only changes the
/// opening line ("Next steps" vs "You are here") — the step list is the same.
fn guide(content_root: &Path, from_init: bool) -> Result<(), String> {
    let stage = project_stage(content_root);
    let project_root = content_root.parent().unwrap_or(content_root);

    // Numbered steps: (command, what-it-does). The first is the immediate
    // next action; the rest preview the path ahead so the user sees the arc.
    let (header, steps): (&str, Vec<(&str, &str)>) = match stage {
        ProjectStage::NotInitialised => (
            "No silan-viking project here yet. To start:",
            vec![
                ("silan-viking init", "scaffold a project in this directory"),
                ("silan-viking guide", "re-run this to see what is next"),
            ],
        ),
        ProjectStage::NotSynced => (
            if from_init {
                "Project created. Next steps:"
            } else {
                "Project is initialised but not yet synced. Next steps:"
            },
            vec![
                (
                    "silan-viking index sync",
                    "build the derived database from content/",
                ),
                (
                    "silan-viking site preview",
                    "build the site and preview it locally",
                ),
                (
                    "silan-viking blog new <slug>",
                    "write your first post (or idea/project)",
                ),
            ],
        ),
        ProjectStage::Synced => (
            "Project is initialised and synced. From here you can:",
            vec![
                (
                    "silan-viking site preview",
                    "rebuild and preview the site locally",
                ),
                (
                    "silan-viking blog new <slug>",
                    "add content, then re-run index sync",
                ),
                (
                    "silan-viking site deploy --confirm",
                    "deploy to the host in silan-viking.toml",
                ),
                (
                    "silan-viking doctor",
                    "health-check content, index, and embedder",
                ),
            ],
        ),
    };

    println!("{header}");
    for (i, (cmd, what)) in steps.iter().enumerate() {
        println!("  {}. {cmd}", i + 1);
        println!("       {what}");
    }
    // A project initialised in a subdirectory needs a `cd` first; say so once.
    if !matches!(stage, ProjectStage::NotInitialised) {
        if let Ok(cwd) = env::current_dir() {
            if cwd != project_root {
                println!("\n(run these from {})", project_root.display());
            }
        }
    }
    println!("\nrun 'silan-viking --help' for the full command list.");
    Ok(())
}

/// `content tree [uri]` — list items and their parts. With `uri`, only items
/// whose URI is at or under that prefix are shown (subtree filter, `02`).
fn content_tree(content_root: &Path, filter: Option<&str>) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    for item in ws.scan().map_err(|e| e.to_string())?.items() {
        if !uri_matches(&item.uri().to_string(), filter) {
            continue;
        }
        println!("{} {}", item.kind(), item.uri());
        for part in item.parts() {
            println!("  part {}", part.role());
        }
    }
    Ok(())
}

/// `content ls [uri]` — list item URIs, optionally filtered to a subtree.
fn content_ls(content_root: &Path, filter: Option<&str>) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    for item in ws.scan().map_err(|e| e.to_string())?.items() {
        let uri = item.uri().to_string();
        if uri_matches(&uri, filter) {
            println!("{uri}");
        }
    }
    Ok(())
}

/// True if `uri` should be shown given an optional subtree `filter`. No
/// filter → always shown. With a filter → `uri` must equal it or sit under
/// it (prefix match on a `/` boundary, so `.../idea` does not match
/// `.../idea-two`).
fn uri_matches(uri: &str, filter: Option<&str>) -> bool {
    match filter {
        None => true,
        Some(prefix) => {
            let prefix = prefix.trim_end_matches('/');
            uri == prefix || uri.starts_with(&format!("{prefix}/"))
        }
    }
}

fn content_show(content_root: &Path, uri: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    let item = scan
        .items()
        .iter()
        .find(|item| item.uri().to_string() == uri)
        .ok_or_else(|| format!("not found: {uri}"))?;
    print_item(&ws, item)
}

/// `content lint [<uri>]` — graded content-health report. Defers to
/// `Workspace::lint` for the per-Item validate() chain (parser dispatch +
/// per-type validation). `fatal` issues exit non-zero; `warn` / `info`
/// print but succeed, so this command works as a CI gate.
fn content_lint(content_root: &Path, uri: Option<&str>) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let issues = ws.lint(uri).map_err(|e| e.to_string())?;
    if issues.is_empty() {
        println!("ok — 0 lint issues");
        return Ok(());
    }
    let mut fatals = 0usize;
    for issue in &issues {
        println!("{:<5} {}  {}", issue.level, issue.uri, issue.message);
        if issue.level == "fatal" {
            fatals += 1;
        }
    }
    println!("\n{} issue(s); {fatals} fatal", issues.len());
    if fatals > 0 {
        return Err(format!("{fatals} fatal lint issue(s)"));
    }
    Ok(())
}

/// `content lint --drift` — run the §17.4 doc-drift self-check. The
/// authoritative check script lives at `engine/scripts/check_docs_drift.py`
/// (the same one the engine-ci `docs-drift` job runs). It needs python3
/// and the silan-viking source checkout — when invoked from an installed
/// binary outside the repo it can't find either, so we degrade gracefully
/// and explain rather than crash.
fn content_lint_drift() -> Result<(), String> {
    // Search for the checker relative to a likely cargo workspace root.
    // CARGO_MANIFEST_DIR is set during `cargo run` but not in installed
    // binaries — that's the explicit signal this is dev-mode.
    let manifest = env::var("CARGO_MANIFEST_DIR").ok();
    let script = match manifest {
        Some(m) => Path::new(&m)
            .parent() // crates/silan-viking-cli -> crates
            .and_then(Path::parent) // -> engine
            .map(|engine| engine.join("scripts/check_docs_drift.py")),
        None => None,
    };
    let script = match script {
        Some(p) if p.exists() => p,
        _ => {
            // Try walking up from CWD: lets owners run this in a content
            // project that happens to sit inside the silan-viking checkout
            // (the test fixtures do).
            let mut cur: Option<&Path> = Some(Path::new("."));
            let mut found: Option<PathBuf> = None;
            while let Some(p) = cur {
                let candidate = p.join("engine/scripts/check_docs_drift.py");
                if candidate.exists() {
                    found = Some(candidate);
                    break;
                }
                cur = p.parent();
            }
            match found {
                Some(p) => p,
                None => {
                    return Err("doc-drift check needs the silan-viking source \
                         checkout (it reads docs/silan-viking/). Run this \
                         inside a clone of the repo, or rely on the \
                         engine-ci `docs-drift` job."
                        .to_owned());
                }
            }
        }
    };
    let status = Command::new("python3")
        .arg(&script)
        .status()
        .map_err(|e| format!("python3 not available ({e}); needed for content lint --drift"))?;
    if !status.success() {
        return Err("doc drift detected — see output above".to_owned());
    }
    Ok(())
}

fn type_list(
    content_root: &Path,
    kind: &str,
    status: Option<&str>,
    tag: Option<&str>,
) -> Result<(), String> {
    let kind = parse_kind(kind).ok_or("unknown kind")?;
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let index = ws.query_index().map_err(|e| e.to_string())?;
    for doc in index.list(Some(kind), status, tag) {
        println!(
            "{}\t{}\t{}",
            doc.slug,
            doc.status.unwrap_or_default(),
            doc.title
        );
    }
    Ok(())
}

/// `silan tags [--type <kind>]` — enumerate every tag used across the
/// workspace with its Item count. Backs the owner question "what tags am I
/// using" and lets the agent (via the matching MCP `list_tags` tool) build
/// a tag cloud or pick a known tag for `list --tag <t>`. Counts are derived
/// from `QueryDocument.tags`, which already folds each Item's frontmatter
/// `tags:` list into the index (`silan-viking-app/src/query.rs` §208).
fn tags_list(content_root: &Path, kind: Option<&str>) -> Result<(), String> {
    let kind_filter = kind
        .map(|k| parse_kind(k).ok_or_else(|| format!("unknown type `{k}`")))
        .transpose()?;
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let index = ws.query_index().map_err(|e| e.to_string())?;
    let mut counts: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    for doc in index.documents() {
        if let Some(k) = kind_filter {
            if doc.kind != k {
                continue;
            }
        }
        for tag in &doc.tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }
    if counts.is_empty() {
        println!("no tags");
        return Ok(());
    }
    // Sort by count desc, then alpha — most-used tags first is what the
    // owner usually wants when scanning the cloud.
    let mut rows: Vec<(String, usize)> = counts.into_iter().collect();
    rows.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    for (tag, n) in rows {
        println!("{n}\t{tag}");
    }
    Ok(())
}

fn type_show(content_root: &Path, kind: &str, slug: &str) -> Result<(), String> {
    let kind = parse_kind(kind).ok_or("unknown kind")?;
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    let item = scan
        .items()
        .iter()
        .find(|item| item.kind() == kind && item.slug().as_str() == slug)
        .ok_or_else(|| format!("not found: {kind} {slug}"))?;
    print_item(&ws, item)
}

fn print_item(ws: &Workspace, item: &silan_viking_app::Item) -> Result<(), String> {
    let parser = ws.parsers().parser_for(item).map_err(|e| e.to_string())?;
    let parsed = parser.parse(item).map_err(|e| e.to_string())?;
    println!("uri={}", item.uri());
    println!("kind={}", item.kind());
    println!("slug={}", item.slug());
    for (lang, variant) in parsed.langs() {
        println!("lang={lang}");
        if let Some(title) = variant.text("title").or_else(|| variant.text("full_name")) {
            println!("title={title}");
        }
        for role in variant.prose_roles() {
            println!("part={role}");
            if let Some(body) = variant.prose(role) {
                println!("{}", body.trim());
            }
        }
    }
    Ok(())
}

fn relation_graph(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    for item in ws.scan().map_err(|e| e.to_string())?.items() {
        let parser = ws.parsers().parser_for(item).map_err(|e| e.to_string())?;
        let parsed = parser.parse(item).map_err(|e| e.to_string())?;
        for relation in parsed.relations() {
            let edge = relation.canonicalized();
            println!("{}\t{}\t{}", edge.from(), edge.relation_type(), edge.to());
        }
    }
    Ok(())
}

fn relation_show(content_root: &Path, uri: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    for item in ws.scan().map_err(|e| e.to_string())?.items() {
        let parser = ws.parsers().parser_for(item).map_err(|e| e.to_string())?;
        let parsed = parser.parse(item).map_err(|e| e.to_string())?;
        for relation in parsed.relations() {
            let edge = relation.canonicalized();
            if edge.from().to_string() == uri || edge.to().to_string() == uri {
                println!("{}\t{}\t{}", edge.from(), edge.relation_type(), edge.to());
            }
        }
    }
    Ok(())
}

/// `silan relation link <from> <to> --type <kind>` — declare a directed
/// evolution edge by appending a `relations:` entry to the `from` Item's
/// frontmatter (`02` §relation). The edge becomes a `content_relation` row on
/// the next `index sync`. `<kind>` accepts the doc's hyphenated spelling
/// (`evolved-into`) or the wire form (`evolved_into`).
fn relation_link(content_root: &Path, from: &str, to: &str, kind: &str) -> Result<(), String> {
    use silan_viking_app::RelationType;

    // Normalise `evolved-into` → `evolved_into` and validate against the
    // closed RelationType set, so a typo fails here, not at `index sync`.
    let wire = kind.replace('-', "_");
    let rel = RelationType::ALL
        .iter()
        .find(|t| t.as_str() == wire)
        .ok_or_else(|| {
            format!(
                "unknown relation type `{kind}` — allowed: {}",
                RelationType::ALL
                    .iter()
                    .map(|t| t.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;

    let from_file = relation_item_file(content_root, from)?;
    // The `to` endpoint must resolve to a real Item — link only existing nodes.
    relation_item_file(content_root, to)?;
    append_relation(&from_file, rel.as_str(), to)?;
    println!("linked {from} -{}-> {to}", rel.as_str());
    Ok(())
}

/// Resolve a `silan://resources/<kind>/<slug>` URI to its primary Part's
/// canonical `en.md` — the frontmatter-carrying file an edge is declared in.
fn relation_item_file(content_root: &Path, uri: &str) -> Result<PathBuf, String> {
    let path = uri
        .strip_prefix("silan://resources/")
        .ok_or_else(|| format!("relation uri must start with silan://resources/: {uri}"))?;
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let kind = segments
        .first()
        .ok_or_else(|| format!("relation uri has no content kind: {uri}"))?;
    let slug = segments
        .last()
        .ok_or_else(|| format!("relation uri has no slug: {uri}"))?;
    // `episode` URIs carry `<series>/<slug>`; every other type is `<slug>`.
    let role = match *kind {
        "idea" | "ideas" | "project" | "projects" => "overview",
        _ => "body",
    };
    let canon = match *kind {
        "idea" | "ideas" => "ideas",
        "project" | "projects" => "projects",
        "blog" | "blogs" => "blog",
        "episode" | "episodes" => "episode",
        "update" | "updates" => "update",
        "resume" => "resume",
        other => return Err(format!("unsupported relation kind `{other}` in {uri}")),
    };
    let mut dir = content_root.join("resources").join(canon);
    // episode: silan://resources/episode/<series>/<slug>
    if canon == "episode" && segments.len() >= 3 {
        dir = dir.join(segments[1]);
    }
    let file = dir.join(slug).join("parts").join(role).join("en.md");
    if !file.exists() {
        return Err(format!("relation endpoint not found: {uri}"));
    }
    Ok(file)
}

// ── proposal group (`02` §二 `silan proposal`, mechanism in `03` §3.1) ──────

fn proposal_list(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let records = ws.list_proposals().map_err(|e| e.to_string())?;
    if records.is_empty() {
        println!("no proposals");
        return Ok(());
    }
    for record in &records {
        // `02`: validation failures are flagged. Overlapping pending
        // proposals that touch the same Part get a conflict-risk warning
        // (`08` §8.5).
        let flag = if record.validation.starts_with("failed") {
            " [validation-failed]"
        } else {
            ""
        };
        let overlap = record.overlapping(&records);
        let overlap_note = if overlap.is_empty() {
            String::new()
        } else {
            format!(" [overlaps: {}]", overlap.join(","))
        };
        println!(
            "{}\t{}\t{}\t{}{flag}{overlap_note}",
            record.id,
            record.state,
            record.kind_str(),
            record.validation
        );
    }
    Ok(())
}

fn proposal_show(content_root: &Path, id: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let records = ws.list_proposals().map_err(|e| e.to_string())?;
    let record = records
        .iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("unknown proposal `{id}`"))?;

    println!("id={}", record.id);
    println!("state={}", record.state);
    println!("kind={}", record.kind_str());
    println!("base={}", record.base);
    println!("validation={}", record.validation);
    if record.touched.is_empty() {
        println!("touched=(none)");
    } else {
        for uri in &record.touched {
            println!("touched={uri}");
        }
    }

    // Diff of the proposal branch against main (`02`: "提案 diff").
    let repo = ws.content_repo().map_err(|e| e.to_string())?;
    let branch = format!("proposal/{id}");
    if repo.branch_exists(&branch) {
        match repo.run(["diff", "--stat", "main", &branch]) {
            Ok(out) if !out.stdout.is_empty() => {
                println!("--- diff vs main ---");
                println!("{}", out.stdout);
            }
            Ok(_) => println!("(no file changes vs main)"),
            Err(e) => println!("(diff unavailable: {e})"),
        }
    } else {
        println!("(proposal branch `{branch}` not found)");
    }
    Ok(())
}

/// `silan proposal create <uri> [--lang en] (--from-file <path> | --from-stdin)`
///
/// Owner-side entry point to `silan_viking_mcp::propose` — useful when MCP
/// stdio is not running or the agent surface is unavailable. The draft body
/// is read from a file (`--from-file <path>`) or stdin (`--from-stdin`); the
/// URI must be a valid proposal target (Item, Part, or Series).
fn proposal_create(content_root: &Path, args: &[&str]) -> Result<(), String> {
    if args.is_empty() {
        return Err(
            "usage: proposal create <uri> [--lang en] (--from-file <path> | --from-stdin)"
                .to_owned(),
        );
    }
    let uri = args[0].to_owned();
    let mut lang = "en".to_owned();
    let mut source: Option<String> = None;
    let mut from_stdin = false;

    let mut i = 1;
    while i < args.len() {
        match args[i] {
            "--lang" => {
                let value = args.get(i + 1).copied().ok_or("--lang needs a value")?;
                lang = value.to_owned();
                i += 2;
            }
            other if other.starts_with("--lang=") => {
                lang = other.trim_start_matches("--lang=").to_owned();
                i += 1;
            }
            "--from-file" => {
                let value = args.get(i + 1).copied().ok_or("--from-file needs a path")?;
                source = Some(value.to_owned());
                i += 2;
            }
            other if other.starts_with("--from-file=") => {
                source = Some(other.trim_start_matches("--from-file=").to_owned());
                i += 1;
            }
            "--from-stdin" => {
                from_stdin = true;
                i += 1;
            }
            other => {
                return Err(format!(
                    "proposal create: unknown flag `{other}` · expected --lang | --from-file | --from-stdin"
                ));
            }
        }
    }

    if from_stdin && source.is_some() {
        return Err(
            "proposal create: pick either --from-file or --from-stdin, not both".to_owned(),
        );
    }
    let draft_body = if let Some(path) = source {
        std::fs::read_to_string(&path).map_err(|e| format!("reading {path}: {e}"))?
    } else if from_stdin {
        let mut buf = String::new();
        use std::io::Read as _;
        std::io::stdin()
            .read_to_string(&mut buf)
            .map_err(|e| format!("reading stdin: {e}"))?;
        buf
    } else {
        return Err(
            "proposal create: needs a body — pass --from-file <path> or --from-stdin".to_owned(),
        );
    };

    let created = silan_viking_mcp::propose(content_root, &uri, Some(&draft_body), &lang, &[])
        .map_err(|e| e.to_string())?;
    println!("created {} branch {}", created.id, created.branch);
    if let Some(uri) = created.created_uri {
        println!("  uri    {uri}");
    }
    if let Some(hint) = created.hint {
        println!("  hint   {hint}");
    }
    Ok(())
}

fn proposal_accept(content_root: &Path, id: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let proposal_id = ProposalId::new(id).map_err(|e| e.to_string())?;
    let report = ws
        .accept_proposal(&proposal_id)
        .map_err(|e| e.to_string())?;
    println!(
        "accepted {} main {} -> {}",
        report.id, report.previous_main, report.new_main
    );
    Ok(())
}

/// `silan proposal reject <id>` — discard a proposal: delete its
/// `proposal/<id>` branch and its record file (`02` §proposal). The main
/// branch is never touched. Rejecting is final; the proposal's history goes
/// away with the branch.
fn proposal_reject(content_root: &Path, id: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let repo = ws.content_repo().map_err(|e| e.to_string())?;
    let branch = format!("proposal/{id}");
    if !repo.branch_exists(&branch) {
        return Err(format!("proposal `{id}` not found (no branch `{branch}`)"));
    }
    // `-D`: drop the branch even if it was never merged — rejection is a
    // deliberate discard, not a safety check.
    repo.run(["branch", "-D", branch.as_str()])
        .map_err(|e| e.to_string())?;
    // Drop the proposal record so `proposal list` no longer shows it.
    let record = repo
        .git_dir()
        .join("silan")
        .join("proposals")
        .join(format!("{id}.toml"));
    if record.exists() {
        fs::remove_file(&record).map_err(|e| e.to_string())?;
    }
    println!("rejected proposal `{id}` (branch `{branch}` deleted)");
    Ok(())
}

/// `silan proposal rebase <id>` — replay a stale proposal branch onto the
/// latest `main` (`02` §proposal / `03` §3.1). On conflict it stops, leaving
/// the repo mid-rebase for the owner to resolve, then `--continue`.
fn proposal_rebase(content_root: &Path, id: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let repo = ws.content_repo().map_err(|e| e.to_string())?;
    let branch = format!("proposal/{id}");
    if !repo.branch_exists(&branch) {
        return Err(format!("proposal `{id}` not found (no branch `{branch}`)"));
    }
    repo.run(["checkout", branch.as_str()])
        .map_err(|e| e.to_string())?;
    match repo.run(["rebase", "main"]) {
        Ok(_) => {
            println!("rebased proposal `{id}` onto latest main");
            Ok(())
        }
        Err(e) => {
            // Conflict: git left the repo mid-rebase. The owner resolves the
            // content divergence by hand, then `proposal rebase <id> --continue`.
            Err(format!(
                "rebase of `{id}` hit conflicts ({e}); resolve them, then run \
                 `silan proposal rebase {id} --continue`"
            ))
        }
    }
}

/// `silan proposal rebase <id> --continue` — resume a conflicted rebase after
/// the owner has resolved the conflicts.
fn proposal_rebase_continue(content_root: &Path, id: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let repo = ws.content_repo().map_err(|e| e.to_string())?;
    repo.run(["rebase", "--continue"])
        .map_err(|e| e.to_string())?;
    println!("rebase of proposal `{id}` continued");
    Ok(())
}

// ── stats group (`02` §二 `silan stats`, #15) ───────────────────
//
// stats follows the sync-then-query model: `silan stats sync <uri>` pulls the
// runtime interaction data from the deployed Go API into `stats_cache_*`
// tables of the local portfolio.db; `stats show/visitors/crawlers/sources`
// then read that local cache, offline.

/// Resolve a `silan://resources/<kind>/<slug>` URI to `(entity_type,
/// entity_id)` using the locally synced content DB. Runs `index sync` data.
fn resolve_stats_filter(conn: &Connection, uri: &str) -> Result<StatsFilter, String> {
    let path = uri
        .strip_prefix("silan://resources/")
        .ok_or_else(|| format!("stats uri must start with silan://resources/: {uri}"))?;
    let segments = path
        .split('/')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    let kind = segments
        .first()
        .ok_or_else(|| format!("stats uri has no content kind: {uri}"))?;
    let slug = segments
        .last()
        .ok_or_else(|| format!("stats uri has no slug: {uri}"))?;

    let (entity_type, table) = match *kind {
        "blog" | "blogs" => ("blog", "blog_posts"),
        "project" | "projects" => ("project", "projects"),
        "idea" | "ideas" => ("idea", "ideas"),
        "episode" | "episodes" => ("episode", "episodes"),
        "update" | "updates" => ("update", "recent_updates"),
        "resume" => {
            let entity_id = conn
                .query_row("SELECT id FROM personal_info LIMIT 1", [], |row| {
                    row.get::<_, String>(0)
                })
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or("no resume row in personal_info — run `silan index sync` first")?;
            return Ok(StatsFilter {
                entity_type: "resume".to_owned(),
                entity_id,
            });
        }
        _ => return Err(format!("unsupported stats kind `{kind}` in {uri}")),
    };

    let entity_id = conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE slug=?1 LIMIT 1"),
            params![slug],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| {
            format!("no {entity_type} `{slug}` in the local DB — run `silan index sync` first")
        })?;
    Ok(StatsFilter {
        entity_type: entity_type.to_owned(),
        entity_id,
    })
}

/// A resolved stats target.
struct StatsFilter {
    entity_type: String,
    entity_id: String,
}

/// Read the Go API base URL from `silan-viking.toml`. The config lives at the
/// project root (the content dir's parent). stats needs a deployed server, so
/// a missing `[deploy] host` is a clear error, not a silent fallback.
fn api_base_url(content_root: &Path) -> Result<String, String> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let config_path = project_root.join("silan-viking.toml");
    let text = fs::read_to_string(&config_path).map_err(|e| {
        format!(
            "stats needs a deployed server: cannot read {}: {e}",
            config_path.display()
        )
    })?;
    let config: toml::Value = text
        .parse()
        .map_err(|e| format!("{}: {e}", config_path.display()))?;
    // [deploy].api_base wins; else derive https://<host> from [deploy].host.
    let deploy = config.get("deploy");
    if let Some(base) = deploy
        .and_then(|d| d.get("api_base"))
        .and_then(|v| v.as_str())
    {
        return Ok(base.trim_end_matches('/').to_owned());
    }
    if let Some(host) = deploy.and_then(|d| d.get("host")).and_then(|v| v.as_str()) {
        return Ok(format!("https://{host}"));
    }
    Err(
        "stats needs a deployed server: add a [deploy] section with `host` \
         (or `api_base`) to silan-viking.toml"
            .to_owned(),
    )
}

/// `silan stats sync <uri>` — pull this item's runtime stats from the Go API
/// into the local cache.
fn stats_sync(content_root: &Path, db_path: &Path, uri: &str) -> Result<(), String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("open local db {}: {e}", db_path.display()))?;
    let filter = resolve_stats_filter(&conn, uri)?;
    let base = api_base_url(content_root)?;
    let sync = silan_viking_app::StatsSync::new(base, db_path);
    sync.sync_item(&filter.entity_type, &filter.entity_id)
        .map_err(|e| e.to_string())?;
    println!(
        "synced stats for {} ({} {})",
        uri, filter.entity_type, filter.entity_id
    );
    Ok(())
}

/// Resolve a URI to a filter against the local DB, for the read commands.
fn stats_filter_for(db_path: &Path, uri: &str) -> Result<StatsFilter, String> {
    let conn = Connection::open(db_path)
        .map_err(|e| format!("open local db {}: {e}", db_path.display()))?;
    resolve_stats_filter(&conn, uri)
}

fn stats_show(db_path: &Path, uri: &str) -> Result<(), String> {
    let filter = stats_filter_for(db_path, uri)?;
    let cache = silan_viking_app::StatsCache::open(db_path);
    let stats = cache
        .item(&filter.entity_type, &filter.entity_id)
        .map_err(|e| e.to_string())?;
    println!("uri={uri}");
    println!("views={}", stats.views);
    println!("likes={}", stats.likes);
    println!("comments={}", stats.comments);
    Ok(())
}

fn stats_visitors(db_path: &Path, uri: &str) -> Result<(), String> {
    let filter = stats_filter_for(db_path, uri)?;
    let cache = silan_viking_app::StatsCache::open(db_path);
    let visitors = cache
        .visitors(&filter.entity_type, &filter.entity_id)
        .map_err(|e| e.to_string())?;
    if visitors.is_empty() {
        println!("no cached visitors — run `silan stats sync {uri}` first");
        return Ok(());
    }
    for v in visitors {
        println!(
            "{}\t{}\t{}\t{}\t{}",
            v.fingerprint, v.ip_masked, v.visitor_kind, v.referrer_kind, v.last_seen_at
        );
    }
    Ok(())
}

fn stats_crawlers(db_path: &Path, uri: &str) -> Result<(), String> {
    let filter = stats_filter_for(db_path, uri)?;
    let cache = silan_viking_app::StatsCache::open(db_path);
    let rows = cache
        .crawlers(&filter.entity_type, &filter.entity_id)
        .map_err(|e| e.to_string())?;
    if rows.is_empty() {
        println!("no cached crawler data — run `silan stats sync {uri}` first");
        return Ok(());
    }
    for r in rows {
        println!("{}\t{}", r.label, r.count);
    }
    Ok(())
}

fn stats_sources(db_path: &Path, uri: &str) -> Result<(), String> {
    let filter = stats_filter_for(db_path, uri)?;
    let cache = silan_viking_app::StatsCache::open(db_path);
    let rows = cache
        .sources(&filter.entity_type, &filter.entity_id)
        .map_err(|e| e.to_string())?;
    if rows.is_empty() {
        println!("no cached source data — run `silan stats sync {uri}` first");
        return Ok(());
    }
    for r in rows {
        println!("{}\t{}", r.label, r.count);
    }
    Ok(())
}

// ── mcp / site groups — M9 adapters (`02` §二) ──────────────────────────────

fn mcp_handshake(content_root: &Path, gate: silan_viking_mcp::ToolGate) -> Result<(), String> {
    // `silan mcp serve` without a stdio transport: print the §8.6 handshake
    // so an operator can confirm the tool surface and SCHEMA the agent sees.
    // The advertised tool list honours `gate` so `--enable-deploy` /
    // `--enable-evolve` previews exactly what a host would see.
    let instructions = silan_viking_mcp::server_instructions(content_root, "silan-viking");
    println!("project={}", instructions.project);
    println!("schema_version={}", instructions.schema_version);
    println!(
        "content_commit={}",
        instructions.content_commit.as_deref().unwrap_or("(none)")
    );
    for resource in &instructions.key_resources {
        println!("resource={resource}");
    }
    for tool in silan_viking_mcp::advertised_tool_specs(gate) {
        println!("tool={}\t{:?}", tool.name, tool.tier);
    }
    Ok(())
}

/// `silan mcp serve --stdio` — run the real JSON-RPC MCP server over stdio
/// (`03` §3.2, `08` §8.6). An MCP host drives it; the loop ends at EOF.
/// `gate` controls which gated tool tiers (deploy / Evolve) are advertised.
fn mcp_stdio(
    content_root: &Path,
    db_path: &Path,
    gate: silan_viking_mcp::ToolGate,
) -> Result<(), String> {
    let server =
        silan_viking_mcp::McpServer::new(content_root, db_path, "silan-viking").with_gate(gate);
    server
        .serve(io::stdin().lock(), io::stdout().lock())
        .map_err(|e| e.to_string())
}

/// `silan mcp status` — report whether this machine can serve the MCP plane
/// (`02` §二). There is no resident server to query, so this is a readiness
/// probe: the binary is on PATH (we are running), the content repo resolves,
/// SCHEMA parses, and the tool surface is countable.
fn mcp_status(content_root: &Path) -> Result<(), String> {
    let schema_ok = content_root.join("SCHEMA.md").exists();
    let repo_ok = content_root.join(".git").is_dir();
    let tools = silan_viking_mcp::tool_specs().len();
    println!("binary_found=true");
    println!("content_root={}", content_root.display());
    println!("schema_present={schema_ok}");
    println!("content_repo={repo_ok}");
    println!("transport=stdio (silan mcp serve --stdio)");
    println!("tools_advertised={tools}");
    if schema_ok && repo_ok {
        println!("mcp_available=true");
        Ok(())
    } else {
        println!("mcp_available=false");
        Err("mcp not ready — run `silan init` to lay down SCHEMA.md and the content repo".into())
    }
}

/// `silan config edit` — open the project (or, with `--global`, the global)
/// config in `$EDITOR` (`02` §顶层命令). Falls back to printing the path when
/// no editor is set, so it stays useful in non-interactive shells.
fn config_edit(content_root: &Path, global: bool) -> Result<(), String> {
    let path = if global {
        let home = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
        PathBuf::from(home).join(".config/silan/config.toml")
    } else {
        let project_root = content_root.parent().unwrap_or(content_root);
        project_root.join("silan-viking.toml")
    };
    if !path.exists() {
        return Err(format!(
            "config not found: {} — run `silan init` first",
            path.display()
        ));
    }
    match env::var("EDITOR").ok().filter(|e| !e.is_empty()) {
        Some(editor) => {
            let status = Command::new(&editor)
                .arg(&path)
                .status()
                .map_err(|e| format!("launch {editor}: {e}"))?;
            if !status.success() {
                return Err(format!("{editor} exited with a non-zero status"));
            }
            Ok(())
        }
        None => {
            // No $EDITOR — print the path so the caller can open it themselves.
            println!("{}", path.display());
            println!("(set $EDITOR to open it directly)");
            Ok(())
        }
    }
}

/// `silan completion <shell>` — emit a shell completion script (`02` §顶层
///命令). The surface is verb-stable, so a static script per shell suffices.
fn completion(shell: &str) -> Result<(), String> {
    match shell {
        "bash" => {
            println!(
                "# silan bash completion — source this, or add to ~/.bashrc:\n\
                 #   eval \"$(silan completion bash)\"\n\
                 _silan() {{\n  \
                   local groups=\"idea blog project episode resume update content index \\\n    \
                     relation site stats proposal mcp skill init config doctor completion\"\n  \
                   COMPREPLY=( $(compgen -W \"$groups\" -- \"${{COMP_WORDS[COMP_CWORD]}}\") )\n\
                 }}\n\
                 complete -F _silan silan"
            );
            Ok(())
        }
        "zsh" => {
            println!(
                "# silan zsh completion — add to a dir on $fpath, or:\n\
                 #   eval \"$(silan completion zsh)\"\n\
                 #compdef silan\n\
                 _silan() {{\n  \
                   local -a groups\n  \
                   groups=(idea blog project episode resume update content index \\\n    \
                     relation site stats proposal mcp skill init config doctor completion)\n  \
                   compadd -- $groups\n\
                 }}\n\
                 compdef _silan silan"
            );
            Ok(())
        }
        "fish" => {
            println!(
                "# silan fish completion — save to ~/.config/fish/completions/silan.fish\n\
                 complete -c silan -f -n __fish_use_subcommand -a \\\n  \
                 'idea blog project episode resume update content index relation site \\\n   \
                 stats proposal mcp skill init config doctor completion'"
            );
            Ok(())
        }
        other => Err(format!(
            "unsupported shell `{other}` — supported: bash, zsh, fish"
        )),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FrontendBuildTarget {
    static_base: Option<String>,
}

impl FrontendBuildTarget {
    fn default() -> Self {
        Self { static_base: None }
    }

    fn static_base(base: &str) -> Result<Self, String> {
        let normalized = normalize_static_base(base)?;
        if normalized == "/" {
            return Ok(Self::default());
        }
        Ok(Self {
            static_base: Some(normalized),
        })
    }

    fn parse_site_build_flags(flags: &[&str]) -> Result<Self, String> {
        let mut target = Self::default();
        let mut i = 0;
        while i < flags.len() {
            let arg = flags[i];
            if arg == "--static-base" || arg == "--base" {
                let Some(value) = flags.get(i + 1) else {
                    return Err(format!("site build: {arg} needs a base path"));
                };
                target = Self::static_base(value)?;
                i += 2;
            } else if arg == "--target" {
                let Some(value) = flags.get(i + 1) else {
                    return Err("site build: --target needs a target name".to_owned());
                };
                target = Self::named_target(value)?;
                i += 2;
            } else if let Some(value) = arg.strip_prefix("--static-base=") {
                target = Self::static_base(value)?;
                i += 1;
            } else if let Some(value) = arg.strip_prefix("--base=") {
                target = Self::static_base(value)?;
                i += 1;
            } else if let Some(value) = arg.strip_prefix("--target=") {
                target = Self::named_target(value)?;
                i += 1;
            } else {
                return Err(format!(
                    "site build: unknown flag `{arg}` · expected --static-base <base> | --target nus"
                ));
            }
        }
        Ok(target)
    }

    fn named_target(target: &str) -> Result<Self, String> {
        match target.trim() {
            "default" => Ok(Self::default()),
            "nus" => Self::static_base("/~silan-hu/"),
            other => Err(format!("--target={other}: supported target aliases: nus")),
        }
    }

    fn npm_script(&self) -> String {
        if self.static_base.is_some() {
            "build:static".to_owned()
        } else {
            "build".to_owned()
        }
    }

    fn npm_args(&self) -> Vec<String> {
        match &self.static_base {
            Some(base) => vec!["run".to_owned(), self.npm_script(), "--".to_owned(), base.clone()],
            None => vec!["run".to_owned(), self.npm_script()],
        }
    }

    fn label(&self) -> &str {
        self.static_base.as_deref().unwrap_or("default")
    }

    fn is_default(&self) -> bool {
        self.static_base.is_none()
    }
}

fn normalize_static_base(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("--static-base needs a non-empty base path".to_owned());
    }
    if trimmed.contains("://") {
        return Err(format!("--static-base={trimmed}: expected a path, not a URL"));
    }
    let with_leading = if trimmed.starts_with('/') {
        trimmed.to_owned()
    } else {
        format!("/{trimmed}")
    };
    Ok(if with_leading.ends_with('/') {
        with_leading
    } else {
        format!("{with_leading}/")
    })
}

fn site_build(
    content_root: &Path,
    out_dir: &Path,
    target: FrontendBuildTarget,
) -> Result<(), String> {
    if !target.is_default() {
        let project_root = content_root.parent().unwrap_or(content_root);
        let dist = build_frontend_target(project_root, &target)?;
        println!(
            "built frontend target={} out={}",
            target.label(),
            dist.display()
        );
        return Ok(());
    }

    // The base URL is a deploy-config value; default to a placeholder so
    // `site build` works offline. `--out` controls the artifact directory.
    let projector = silan_viking_site::SiteProjector::new("https://silan.tech");
    let report = projector
        .build(content_root, out_dir)
        .map_err(|e| e.to_string())?;
    println!("built pages={} out={}", report.pages, out_dir.display());
    for artifact in report.artifacts {
        println!("artifact={}", artifact.display());
    }
    Ok(())
}

fn build_frontend_target(
    project_root: &Path,
    target: &FrontendBuildTarget,
) -> Result<PathBuf, String> {
    let frontend = project_root.join("frontend");
    if !frontend.is_dir() {
        return Err(format!(
            "[frontend] {} not found — silan-viking expects a frontend/ next to content/",
            frontend.display(),
        ));
    }
    if which("npm").is_none() {
        return Err(
            "[frontend] `npm` not found on PATH · install Node.js to build the frontend"
                .to_owned(),
        );
    }

    let script = target.npm_script();
    let npm_args = target.npm_args();
    println!(
        "[frontend] npm run {} (target={}, in {})",
        script,
        target.label(),
        frontend.display()
    );
    let status = Command::new("npm")
        .args(&npm_args)
        .current_dir(&frontend)
        .status()
        .map_err(|e| format!("[frontend] npm run {script}: {e}"))?;
    if !status.success() {
        return Err(format!(
            "[frontend] npm run {script} failed (status {status})"
        ));
    }

    let dist = frontend.join("dist");
    if !dist.is_dir() {
        return Err(format!(
            "[frontend] build finished but {} does not exist",
            dist.display(),
        ));
    }
    Ok(dist)
}

fn site_check(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    println!(
        "site check ok content={} items={}",
        content_root.display(),
        scan.len()
    );
    Ok(())
}

fn site_promote(live: &str, snapshot: &str, commit: &str) -> Result<(), String> {
    // The `08` §8.3 promote: replace the live DB's derived tables from the
    // synced snapshot, transactionally, leaving runtime data untouched.
    let report = silan_viking_site::promote(live, snapshot, commit).map_err(|e| e.to_string())?;
    println!(
        "promoted tables={} rows={} content_commit={}",
        report.replaced_tables.len(),
        report.rows_inserted,
        report.content_commit
    );
    Ok(())
}

/// `silan site publish <uri>` — flip an Item's `visibility` to `public` so the
/// SiteProjector picks it up (`02` §site). This is a person-only verb (`02`
/// §设计要点: selective publishing is silan's call, never an agent's).
fn site_publish(content_root: &Path, uri: &str) -> Result<(), String> {
    let path = uri
        .strip_prefix("silan://resources/")
        .ok_or_else(|| format!("publish uri must start with silan://resources/: {uri}"))?;
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let kind = *segments
        .first()
        .ok_or_else(|| format!("publish uri has no content kind: {uri}"))?;
    let slug = *segments
        .last()
        .ok_or_else(|| format!("publish uri has no slug: {uri}"))?;
    let kind = match kind {
        "ideas" => "idea",
        "projects" => "project",
        "blogs" => "blog",
        "episodes" => "episode",
        "updates" => "update",
        other => other,
    };
    type_set_field(content_root, kind, slug, "visibility", "public")?;
    println!("published {uri} (visibility -> public; run `silan index sync` to project it)");
    Ok(())
}

/// The `[deploy]` section of `silan-viking.toml` (`06` §6.2.2).
//
// There is deliberately no `compose_file` field: the Docker compose
// file and Dockerfiles are embedded in the `silan-viking` binary and
// staged at deploy time (`docs/silan-viking/16`), not user-supplied.
/// What to push in an nginx-mode deploy. Docker mode ignores this — it
/// always ships the whole stack as one image set.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeployWhat {
    /// Sync `content/`, scp `portfolio.db`, restart the backend. The cheapest
    /// path — no rebuild, no frontend bundle. Use this when you edited a blog
    /// post and want it live in ~10 seconds.
    Content,
    /// Build the frontend with `npm run build` and ship `dist/`. Run when you
    /// changed React code; content is not re-synced.
    Frontend,
    /// Tar the backend Go source, build remotely (CGO needs the target's
    /// glibc / SQLite headers), restart. Run when you changed Go code.
    Backend,
    /// Everything: content + frontend + backend, in that order so the API
    /// is restarted with a fresh schema before the new frontend assets load.
    All,
}

impl DeployWhat {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "content" => Ok(Self::Content),
            "frontend" => Ok(Self::Frontend),
            "backend" => Ok(Self::Backend),
            "all" => Ok(Self::All),
            other => Err(format!(
                "--what={other}: must be one of content|frontend|backend|all"
            )),
        }
    }
    fn does_content(self) -> bool {
        matches!(self, Self::Content | Self::All)
    }
    fn does_frontend(self) -> bool {
        matches!(self, Self::Frontend | Self::All)
    }
    fn does_backend(self) -> bool {
        matches!(self, Self::Backend | Self::All)
    }
    fn label(self) -> &'static str {
        match self {
            Self::Content => "content",
            Self::Frontend => "frontend",
            Self::Backend => "backend",
            Self::All => "all",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DeployMode {
    /// v1.0.0 default. Builds Docker images locally (or on remote), ships
    /// via `docker save | ssh docker load`, runs `docker compose up -d`.
    /// The host needs only Docker.
    Docker,
    /// v1.1.0. Targets a host where Nginx (e.g. BaoTa/宝塔) already fronts
    /// vhosts and the backend runs under systemd. Pushes the frontend
    /// `dist/`, the derived `portfolio.db`, and the backend Go source;
    /// builds the backend remotely (CGO needs the target's glibc); then
    /// `systemctl restart` and a `/api/v1/health` probe.
    Nginx,
}

struct DeployConfig {
    mode: DeployMode,
    host: String,
    user: String,
    /// SSH key path — only required for a remote `host`.
    ssh_key_path: PathBuf,
    /// Remote directory — only required for a remote `host`. In Docker
    /// mode this is the staging dir; in Nginx mode it is the vhost root
    /// (e.g. `/www/wwwroot/silan.tech`).
    remote_dir: String,
    /// SSH port. Optional in `[deploy]`, defaults to 22 — a hardened
    /// server often moves sshd off the standard port.
    ssh_port: u16,

    // --- Nginx mode only ---
    /// Public URL of the deployed site (`https://silan.tech`). Optional —
    /// used only by the health check, which `host` alone can't satisfy when
    /// `host` is a bare IP (the cert + nginx vhost match the domain). If
    /// absent, falls back to `https://<host>`.
    public_url: Option<String>,
    /// Port the backend binds to on the remote (default 5200, matches
    /// `backend/etc/backend-api.yaml`). Bound to 127.0.0.1; Nginx
    /// reverse-proxies `/api/`.
    backend_port: u16,
    /// Name of the systemd unit that owns the backend. Default
    /// `silan-backend`; `systemctl restart <unit>` runs after each push.
    systemd_unit: String,
    /// Where to drop the BaoTa-style `extension/<host>/silan-viking.conf`
    /// snippet. Optional — if absent, the deploy assumes a sysadmin
    /// wired Nginx by hand. Parsed and held here for the future auto-
    /// nginx-conf path; clippy's dead-code lint would block CI otherwise.
    #[allow(dead_code)]
    nginx_extension_dir: Option<String>,
}

/// Read and validate `[deploy]` from the project config. A missing section or
/// field is a code-1 user error (`06` §6.8). For a remote `host`, the SSH key
/// file must exist with `600` permissions (`06` §6.2.2). A `localhost` /
/// `local` host is a single-host docker deploy and needs no SSH fields.
fn deploy_config(content_root: &Path) -> Result<DeployConfig, String> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let config_path = project_root.join("silan-viking.toml");
    let text = fs::read_to_string(&config_path)
        .map_err(|e| format!("cannot read {}: {e}", config_path.display()))?;
    let config: toml::Value = text
        .parse()
        .map_err(|e| format!("{}: {e}", config_path.display()))?;
    let deploy = config
        .get("deploy")
        .ok_or("`silan site deploy` needs a [deploy] section in silan-viking.toml")?;
    let field = |k: &str| -> Result<String, String> {
        deploy
            .get(k)
            .and_then(|v| v.as_str())
            .map(str::to_owned)
            .ok_or_else(|| format!("[deploy].{k} is required in silan-viking.toml"))
    };
    let opt = |k: &str| -> String {
        deploy
            .get(k)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_owned()
    };

    let host = field("host")?;
    let is_local = matches!(host.as_str(), "localhost" | "127.0.0.1" | "local");

    let (ssh_key_path, remote_dir) = if is_local {
        // Single-host deploy: no SSH, no remote dir.
        (PathBuf::new(), String::new())
    } else {
        let ssh_key_raw = field("ssh_key_path")?;
        // Expand a leading `~/` to $HOME — the config stores a path, not the key.
        let ssh_key_path = if let Some(rest) = ssh_key_raw.strip_prefix("~/") {
            PathBuf::from(env::var("HOME").map_err(|_| "HOME is not set".to_string())?).join(rest)
        } else {
            PathBuf::from(&ssh_key_raw)
        };
        if !ssh_key_path.exists() {
            return Err(format!(
                "SSH key not found: {} — generate one or fix [deploy].ssh_key_path",
                ssh_key_path.display()
            ));
        }
        // The private key must be `600` — ssh refuses a world-readable key
        // anyway, and we fail early with a clear message (`06` §6.2.2).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&ssh_key_path)
                .map_err(|e| e.to_string())?
                .permissions()
                .mode()
                & 0o777;
            if mode != 0o600 {
                return Err(format!(
                    "SSH key {} has mode {mode:o}, expected 600 — run `chmod 600` on it",
                    ssh_key_path.display()
                ));
            }
        }
        (ssh_key_path, field("remote_dir")?)
    };

    // ssh_port — optional, defaults to 22. Accepts a TOML integer or a
    // string (so `ssh_port = 2222` and `ssh_port = "2222"` both work).
    let ssh_port: u16 = match deploy.get("ssh_port") {
        None => 22,
        Some(v) => v
            .as_integer()
            .map(|i| i.to_string())
            .or_else(|| v.as_str().map(str::to_owned))
            .and_then(|s| s.parse().ok())
            .ok_or("[deploy].ssh_port must be a port number (1-65535)")?,
    };

    // mode — optional, defaults to docker (v1.0.0 behaviour). v1.1.0 adds
    // "nginx" for BaoTa / systemd hosts.
    let mode = match deploy
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("docker")
    {
        "docker" => DeployMode::Docker,
        "nginx" => DeployMode::Nginx,
        other => {
            return Err(format!(
                "[deploy].mode = \"{other}\" — must be \"docker\" or \"nginx\""
            ))
        }
    };

    // Nginx-mode fields. All optional with safe defaults so a half-filled
    // [deploy] still parses; the orchestrator will surface missing values
    // when it actually needs them.
    let backend_port: u16 = deploy
        .get("backend_port")
        .and_then(|v| v.as_integer())
        .map(|i| i as u16)
        .unwrap_or(5200);
    let systemd_unit = deploy
        .get("systemd_unit")
        .and_then(|v| v.as_str())
        .unwrap_or("silan-backend")
        .to_owned();
    let nginx_extension_dir = deploy
        .get("nginx_extension_dir")
        .and_then(|v| v.as_str())
        .map(str::to_owned);
    let public_url = deploy
        .get("public_url")
        .and_then(|v| v.as_str())
        .map(|s| s.trim_end_matches('/').to_owned());

    Ok(DeployConfig {
        mode,
        host,
        user: if is_local {
            opt("user")
        } else {
            field("user")?
        },
        ssh_key_path,
        remote_dir,
        ssh_port,
        public_url,
        backend_port,
        systemd_unit,
        nginx_extension_dir,
    })
}

/// Run one ssh command against `cfg.host` and return its stdout. Inherits
/// stderr to the parent so the user sees real-time progress (helpful for
/// long-running remote `go build`). Empty `cfg.ssh_key_path` falls back to
/// the user's ssh-agent / default key — used when invoked from tests or
/// from a config without an explicit key.
fn ssh_exec(cfg: &DeployConfig, command: &str) -> Result<String, String> {
    let mut cmd = Command::new("ssh");
    if !cfg.ssh_key_path.as_os_str().is_empty() {
        cmd.arg("-i").arg(&cfg.ssh_key_path);
    }
    if cfg.ssh_port != 22 {
        cmd.arg("-p").arg(cfg.ssh_port.to_string());
    }
    // BatchMode=yes refuses interactive prompts — fail fast in CI rather
    // than hang waiting for a passphrase.
    cmd.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
    ]);
    cmd.arg(format!("{}@{}", cfg.user, cfg.host));
    cmd.arg(command);
    cmd.stderr(std::process::Stdio::inherit());
    let out = cmd
        .output()
        .map_err(|e| format!("ssh {}@{}: {e}", cfg.user, cfg.host))?;
    if !out.status.success() {
        return Err(format!(
            "ssh {}@{} exited with status {} (command: {command})",
            cfg.user, cfg.host, out.status,
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// `scp <src> <user>@<host>:<dst>`. `src` may be a file or directory
/// (recursive `-r` is always used; scp is silent for single files).
fn scp_to(cfg: &DeployConfig, src: &Path, dst: &str) -> Result<(), String> {
    let mut cmd = Command::new("scp");
    cmd.arg("-r");
    if !cfg.ssh_key_path.as_os_str().is_empty() {
        cmd.arg("-i").arg(&cfg.ssh_key_path);
    }
    if cfg.ssh_port != 22 {
        cmd.arg("-P").arg(cfg.ssh_port.to_string());
    }
    cmd.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
    ]);
    cmd.arg(src);
    cmd.arg(format!("{}@{}:{dst}", cfg.user, cfg.host));
    let status = cmd.status().map_err(|e| {
        format!(
            "scp {} -> {}@{}:{dst}: {e}",
            src.display(),
            cfg.user,
            cfg.host
        )
    })?;
    if !status.success() {
        return Err(format!(
            "scp {} -> {}@{}:{dst} exited with status {}",
            src.display(),
            cfg.user,
            cfg.host,
            status,
        ));
    }
    Ok(())
}

/// `scp <user>@<host>:<src> <dst>`. This is the read-side counterpart of
/// [`scp_to`], used by deploy promotion to bring the server's live SQLite DB
/// to the operator machine before replacing derived tables. Pulling the live
/// file first is what preserves comments, likes, views and contact messages.
fn scp_from(cfg: &DeployConfig, src: &str, dst: &Path) -> Result<(), String> {
    let mut cmd = Command::new("scp");
    if !cfg.ssh_key_path.as_os_str().is_empty() {
        cmd.arg("-i").arg(&cfg.ssh_key_path);
    }
    if cfg.ssh_port != 22 {
        cmd.arg("-P").arg(cfg.ssh_port.to_string());
    }
    cmd.args([
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
    ]);
    cmd.arg(format!("{}@{}:{src}", cfg.user, cfg.host));
    cmd.arg(dst);
    let status = cmd.status().map_err(|e| {
        format!(
            "scp {}@{}:{src} -> {}: {e}",
            cfg.user,
            cfg.host,
            dst.display()
        )
    })?;
    if !status.success() {
        return Err(format!(
            "scp {}@{}:{src} -> {} exited with status {}",
            cfg.user,
            cfg.host,
            dst.display(),
            status,
        ));
    }
    Ok(())
}

/// Probe `https://<host>/api/v1/health` over HTTPS. Returns Err when the
/// status is not 2xx or the body doesn't include `"ok"`. Uses `curl` via
/// the host shell — Rust's HTTP clients would mean another dependency for
/// what is a one-line healthcheck.
fn deploy_health_check(cfg: &DeployConfig) -> Result<(), String> {
    let base = cfg
        .public_url
        .clone()
        .unwrap_or_else(|| format!("https://{}", cfg.host));
    let url = format!("{base}/api/v1/health");
    // `-k` accepts self-signed / hostname-mismatched certs — required when
    // `host` is a bare IP (no SAN for the IP) but nginx forces 80→443.
    // The health endpoint returns the same `{"status":"ok"}` either way;
    // we only need a successful round-trip through the reverse proxy.
    let out = Command::new("curl")
        .args([
            "-sSLk",
            "--max-time",
            "10",
            "-o",
            "-",
            "-w",
            "\n%{http_code}",
            &url,
        ])
        .output()
        .map_err(|e| format!("curl {url}: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut lines: Vec<&str> = stdout.lines().collect();
    let code = lines.pop().unwrap_or("");
    let body = lines.join("\n");
    if code.starts_with('2') {
        println!("        health: HTTP {code} · {}", body.trim());
        Ok(())
    } else {
        Err(format!("health check failed: HTTP {code} · {body}"))
    }
}

/// Unpack one embedded gzip tarball into `staging`. The tarball's paths
/// are repo-relative (`frontend/...`, `backend/...`, `deploy/...`), so
/// after this the staging dir mirrors the repo layout the Docker build
/// expects (`docs/silan-viking/16`).
fn unpack_embedded(staging: &Path, name: &str, tarball: &[u8]) -> Result<(), String> {
    let tar_path = staging.join(name);
    fs::write(&tar_path, tarball).map_err(|e| format!("write {name}: {e}"))?;
    let status = Command::new("tar")
        .arg("-xzf")
        .arg(&tar_path)
        .arg("-C")
        .arg(staging)
        .status()
        .map_err(|e| format!("tar -x {name}: {e}"))?;
    if !status.success() {
        return Err(format!("failed to unpack embedded {name}"));
    }
    let _ = fs::remove_file(&tar_path);
    Ok(())
}

/// Materialise the deploy build context from the artifacts embedded in
/// this binary. Returns the staging directory — laid out as a minimal
/// repo (`frontend/`, `backend/`, `deploy/`) the Docker multi-stage
/// builds consume. The user's machine never needs a source checkout.
fn stage_deploy_artifacts(project_root: &Path) -> Result<PathBuf, String> {
    let staging = project_root.join("_deploy/staging");
    // Always start clean: a stale tree from a half-finished deploy would
    // poison the Docker build context.
    if staging.exists() {
        fs::remove_dir_all(&staging).map_err(|e| format!("clear staging: {e}"))?;
    }
    fs::create_dir_all(&staging).map_err(|e| format!("create staging: {e}"))?;

    unpack_embedded(&staging, "frontend.tar.gz", FRONTEND_TARBALL)?;
    unpack_embedded(&staging, "backend.tar.gz", BACKEND_TARBALL)?;
    unpack_embedded(&staging, "deploy.tar.gz", DEPLOY_TARBALL)?;
    Ok(staging)
}

/// Single-host docker bring-up — the steps 4/5/6 of the deploy pipeline when
/// `host=localhost`. Shared between `site deploy` (local target) and
/// `site preview` (no `[deploy]` config required). Returns once the stack is
/// up, the live db is promoted, and the proxy is refreshed.
///
/// This is the body of the previous `if is_local { ... }` branch lifted out
/// so `site preview` can call it without going through `[deploy]` parsing.
/// `docs/silan-viking/16` §16.5 lists the WAL / proxy / promote ordering
/// every step here keeps.
fn run_local_deploy(
    staging: &Path,
    compose: &str,
    project_root: &Path,
    db_path: &Path,
    media_root: Option<&Path>,
    assets: &[silan_viking_app::ScannedAsset],
    content_commit: &str,
) -> Result<(), String> {
    // 4 — ship: images are already in the local docker daemon.
    println!("[4/6] ship (local — images already loaded)");

    // 5 — up first, so the named volume + live db exist for promote.
    println!("[5/6] promote — bring stack up, then replace derived tables");
    docker_compose(staging, compose, &["up", "-d"])?;
    if let Some(dir) = media_root {
        sync_media_into_volume(compose, staging, "backend", dir)?;
        println!("  synced {} media file(s) into /data/media", assets.len());
    }
    // The live db lives in the `portfolio-db` named volume. The backend keeps
    // it in SQLite WAL mode (split state across `.db` + `-wal`); we stop the
    // backend so the WAL is checkpointed before we touch the file, promote on
    // a quiescent snapshot, copy it back, then clear stale WAL companions.
    docker_compose(staging, compose, &["stop", "backend"])?;
    let live_snapshot = project_root.join("_deploy/live-portfolio.db");
    docker_cp_from(
        compose,
        staging,
        "backend",
        "/data/portfolio.db",
        &live_snapshot,
    )
    // First deploy: no live db yet — start from the fresh snapshot.
    .or_else(|_| {
        fs::copy(db_path, &live_snapshot)
            .map(|_| ())
            .map_err(|e| e.to_string())
    })?;
    promote_db(&live_snapshot, db_path, content_commit)?;
    docker_cp_to(
        compose,
        staging,
        "backend",
        &live_snapshot,
        "/data/portfolio.db",
    )?;
    clear_wal_companions(compose, staging, "backend")?;

    // 6 — back up; refresh the proxy so it picks up the recreated backend's IP.
    println!("[6/6] up — start backend with the promoted db, refresh proxy");
    docker_compose(staging, compose, &["up", "-d"])?;
    docker_compose(staging, compose, &["restart", "proxy"])?;
    println!("up — open http://localhost:8080");
    Ok(())
}

/// `silan site preview` — bring a real local instance up (frontend, backend,
/// proxy) using Docker, so the owner can open `http://localhost:8080` and
/// see the site. Unlike `site deploy`, this does not require a `[deploy]`
/// section in `silan-viking.toml`; localhost is implicit.
///
/// Before this fix, `site preview` was aliased to `site build` and only
/// produced SEO artefacts (sitemap / robots / jsonld) — there was no server,
/// no rendering, nothing to look at. The 2026-05-21 e2e pass surfaced this as
/// GOAL §8.8.2 A1; this is the fix.
fn site_preview(
    content_root: &Path,
    db_path: &Path,
    out_dir: &Path,
    confirm: bool,
) -> Result<(), String> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let compose = "deploy/docker-compose.yml";

    if !confirm {
        println!("site preview — dry run (pass --confirm to start the local stack)");
        println!("  Brings up a single-host Docker stack at http://localhost:8080:");
        println!("  1 sync     content/ -> {}", db_path.display());
        println!(
            "  2 build    stage embedded sources + SEO artifacts + media -> {}",
            out_dir.display()
        );
        println!("  3 package  docker compose build (backend/web/proxy images)");
        println!("  4 ship     images already in the local docker daemon");
        println!("  5 promote  replace derived tables; runtime tables preserved");
        println!("  6 up       docker compose up -d  ->  http://localhost:8080");
        println!();
        println!("  Requires: Docker. Stop with `docker compose -f \\$staging/{compose} down`.");
        return Ok(());
    }

    // 1 — sync: rebuild the derived db snapshot from content/.
    println!("[1/6] sync");
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    ws.sync(db_path).map_err(|e| e.to_string())?;
    let content_commit = git_head_commit(content_root).unwrap_or_else(|| "unknown".into());
    let assets = ws.scan().map_err(|e| e.to_string())?.assets().to_vec();

    // 2 — build: stage embedded artefacts + SEO into the project's staging area.
    println!("[2/6] build");
    let staging = stage_deploy_artifacts(project_root)?;
    let projector = silan_viking_site::SiteProjector::new("http://localhost:8080");
    let seo_dir = staging.join("deploy/seo");
    projector
        .build(content_root, &seo_dir)
        .map_err(|e| e.to_string())?;
    let _ = projector.build(content_root, out_dir);
    let media_root = stage_media(&staging, &assets)?;
    if let Some(ref dir) = media_root {
        println!(
            "        staged {} media file(s) -> {}",
            assets.len(),
            dir.display()
        );
    }

    // 3 — package: build the docker images from the staged compose file.
    println!("[3/6] package");
    docker_compose(&staging, compose, &["build"])?;

    // 4/5/6 — single-host bring-up, shared with `site deploy` localhost.
    run_local_deploy(
        &staging,
        compose,
        project_root,
        db_path,
        media_root.as_deref(),
        &assets,
        &content_commit,
    )
}

// ---------------------------------------------------------------------------
// `silan site deploy` — the `06` §6.5 six-step pipeline: sync → build →
// package → ship → promote → up. Dry-run is the default; only `--confirm`
// touches the server.
//
// The Docker build context is materialised from artifacts embedded in this
// binary (`stage_deploy_artifacts`), not from a source checkout — so the
// only thing the operator's machine needs is Docker (`docs/silan-viking/16`).
//
// Nginx-mode deploy (v1.1.0)
// ---------------------------------------------------------------------------
//
// Targets a host where Nginx already fronts vhosts (e.g. BaoTa / 宝塔) and
// the backend runs under systemd. The CLI orchestrates a sequence of host
// tools (npm, go via ssh, scp, ssh, curl); it does not bundle them. A
// missing tool surfaces as a clear error before anything is shipped.
//
// The remote layout follows the README + the manual EasyNet-style deploy:
//
//   <remote_dir>/                     (e.g. /www/wwwroot/silan.tech)
//   ├── index.html  assets/  ...      ← frontend dist root
//   └── api/
//       ├── silan-backend             ← compiled Go binary
//       ├── etc/backend-api.yaml      ← server config
//       └── _deploy/api/portfolio.db  ← derived database

/// One end-to-end nginx-mode deploy. Walks through each enabled phase, then
/// restarts the backend and probes `/api/v1/health`. Restart and health check
/// run unconditionally when *any* phase ran — even content-only — because the
/// backend caches DB handles and must reopen the file.
fn run_nginx_deploy(
    content_root: &Path,
    db_path: &Path,
    project_root: &Path,
    cfg: &DeployConfig,
    confirm: bool,
    what: DeployWhat,
) -> Result<(), String> {
    if !confirm {
        println!("site deploy — dry run (pass --confirm to execute)");
        println!(
            "  target  {}@{}:{}  (nginx mode)",
            cfg.user, cfg.host, cfg.remote_dir,
        );
        println!("  scope   --what={}", what.label());
        let mut step = 1;
        if what.does_frontend() {
            println!("  {step} frontend npm run build → scp dist/",);
            step += 1;
        }
        if what.does_backend() {
            println!("  {step} backend  tar source → scp → build API + sqlite2pg (remote)");
            step += 1;
        }
        if what.does_content() {
            println!(
                "  {step} content  silan-viking index sync → stop {} → cp .prev → \
                 clear wal/shm → pull live DB → promote derived tables locally → \
                 scp promoted DB → chown → md5-verify → \
                 (if PG-configured: sqlite2pg, preserving runtime tables) → mirror media/",
                cfg.systemd_unit,
            );
            step += 1;
        }
        let bring_up_verb = if what.does_content() {
            "start"
        } else {
            "restart"
        };
        println!(
            "  {step} {bring_up_verb}  systemctl {bring_up_verb} {} → curl /api/v1/health",
            cfg.systemd_unit
        );
        return Ok(());
    }

    let mut did_work = false;
    // `deploy_nginx_content` stops the backend itself (to release the
    // mmap'd DB before scp). If it ran we need `start`, not `restart` —
    // restart on a stopped unit works but loses one transition's worth of
    // journal context, and tooling that watches the unit state sees two
    // active→inactive flips instead of one.
    let mut backend_stopped = false;
    // Run every failure-prone build before content stops the live API. This
    // prevents a missing local toolchain or remote compile error from leaving
    // the service offline. Backend goes before content so the matching
    // sqlite2pg importer is installed before the content phase invokes it.
    if what.does_frontend() {
        deploy_nginx_frontend(project_root, cfg)?;
        did_work = true;
    }
    if what.does_backend() {
        deploy_nginx_backend(project_root, cfg)?;
        did_work = true;
    }
    if what.does_content() {
        backend_stopped = deploy_nginx_content(content_root, db_path, cfg)?;
        did_work = true;
    }
    if !did_work {
        return Err(format!("--what={} selected nothing", what.label()));
    }

    let restart_verb = if backend_stopped { "start" } else { "restart" };
    println!(
        "[{restart_verb}] systemctl {restart_verb} {}",
        cfg.systemd_unit
    );
    ssh_exec(
        cfg,
        &format!("systemctl {restart_verb} {}", cfg.systemd_unit),
    )?;
    // Give systemd a beat to flip the unit state before we probe.
    std::thread::sleep(std::time::Duration::from_secs(2));
    let health_base = cfg
        .public_url
        .clone()
        .unwrap_or_else(|| format!("https://{}", cfg.host));
    println!("[health] {health_base}/api/v1/health");
    deploy_health_check(cfg)?;
    println!("done.");
    Ok(())
}

/// Phase 1 — content. Rebuild the local derived db, ship it, leave the
/// restart/health check to the caller.
///
/// The DB swap is wrapped in stop → backup → pull-live → promote → push →
/// clear-wal → chown. Only derived tables come from `index sync`; runtime
/// facts remain owned by the live DB. Returns `true` when the backend was
/// stopped here, so the caller does `start` instead of `restart`.
fn deploy_nginx_content(
    content_root: &Path,
    db_path: &Path,
    cfg: &DeployConfig,
) -> Result<bool, String> {
    println!("[content] index sync");
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    ws.sync(db_path).map_err(|e| e.to_string())?;

    let remote_dir = format!("{}/api/_deploy/api", cfg.remote_dir);
    println!("[content] mkdir -p {remote_dir}");
    ssh_exec(cfg, &format!("mkdir -p {remote_dir}"))?;

    // Stop the backend BEFORE touching the live DB. Without this, scp races
    // against silan-backend's mmap'd file handle: on some kernels the
    // overwrite "succeeds" but the running process keeps serving the old
    // inode, leaving local md5 ≠ remote md5 even though deploy looks green.
    println!(
        "[content] systemctl stop {} (release DB lock)",
        cfg.systemd_unit
    );
    ssh_exec(cfg, &format!("systemctl stop {}", cfg.systemd_unit))?;

    // Take a .prev snapshot so `site rollback` has something to fall back
    // on. The previous --what=content path skipped this and left rollback
    // unusable on a bad content deploy.
    let remote_db = format!("{remote_dir}/portfolio.db");
    println!("[content] backup → {remote_db}.prev");
    ssh_exec(
        cfg,
        &format!("[ -f {remote_db} ] && cp -f {remote_db} {remote_db}.prev || true"),
    )?;

    // Clear stale -wal/-shm from the now-stopped backend. If they survive
    // they will be paired against the new main DB at next open and sqlite
    // will report "database disk image is malformed" → crashloop → 502.
    println!("[content] clear stale WAL/SHM on remote");
    ssh_exec(cfg, &format!("rm -f {remote_db}-wal {remote_db}-shm"))?;

    // Never ship the derived snapshot over the live DB. The live file owns
    // all runtime facts; pull it, replace only the derived-table whitelist in
    // one local transaction, then ship that promoted generation back.
    let live_snapshot = std::env::temp_dir().join(format!(
        "silan-viking-nginx-live-{}-{}.db",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("system clock before unix epoch: {e}"))?
            .as_nanos(),
    ));
    let promotion = (|| -> Result<(), String> {
        let remote_exists = ssh_exec(
            cfg,
            &format!("if [ -f {remote_db} ]; then printf present; fi"),
        )?;
        if remote_exists.trim() == "present" {
            println!("[content] pull live DB → {}", live_snapshot.display());
            scp_from(cfg, &remote_db, &live_snapshot)?;
        } else {
            println!("[content] first deploy — seed live DB from derived snapshot");
            fs::copy(db_path, &live_snapshot).map_err(|e| {
                format!(
                    "[content] seed {} from {}: {e}",
                    live_snapshot.display(),
                    db_path.display()
                )
            })?;
        }

        let content_commit = git_head_commit(content_root).unwrap_or_else(|| "unknown".into());
        println!("[content] promote derived tables (runtime facts stay live)");
        promote_db(&live_snapshot, db_path, &content_commit)?;

        println!("[content] scp {} → {remote_db}", live_snapshot.display());
        scp_to(cfg, &live_snapshot, &remote_db)?;

        // Backend runs as `User=www` per the silan-backend.service unit; if
        // scp landed as root the daemon cannot open the DB for writes.
        ssh_exec(cfg, &format!("chown www:www {remote_db}"))?;

        // Trust nothing — verify the promoted generation byte-for-byte.
        verify_remote_db_matches(cfg, &live_snapshot, &remote_db)
    })();
    let _ = fs::remove_file(&live_snapshot);
    promotion?;

    // If the live backend runs against PostgreSQL (the runtime DB is no
    // longer the shipped SQLite file but a server-resident PG), import the
    // freshly-scp'd SQLite into PG before the backend comes back up. The
    // SQLite file remains on disk as the rollback artifact; PG is the read
    // path. We detect PG mode by the presence of the systemd EnvironmentFile
    // the installer wrote (/etc/silan-backend/db.env containing DB_SOURCE).
    // Without it, the deploy stays SQLite-only — no change in behaviour for
    // installs that never migrated.
    sync_remote_postgres_if_configured(cfg, &remote_db)?;

    // Mirror media assets to <remote_dir>/api/media. The DB already holds
    // rewritten `/api/v1/media?f=<rel_path>` URLs from `sync`; the backend
    // serves them out of `Media.Root` (see deploy_nginx_backend for the yaml
    // template that points Media.Root here). Mirror semantics: an asset
    // deleted from content/ disappears from the server on the next deploy.
    let assets = ws.scan().map_err(|e| e.to_string())?.assets().to_vec();
    if assets.is_empty() {
        return Ok(true);
    }
    let staging = std::env::temp_dir().join("silan-viking-content-staging");
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging)
        .map_err(|e| format!("[content] staging dir {}: {e}", staging.display()))?;
    let Some(media_root) = stage_media(&staging, &assets)? else {
        return Ok(true);
    };
    let remote_media = format!("{}/api/media", cfg.remote_dir);
    println!(
        "[content] mirror {} media file(s) → {remote_media}",
        assets.len(),
    );
    // Clear the remote dir first so a deleted asset doesn't linger.
    ssh_exec(
        cfg,
        &format!("rm -rf {remote_media} && mkdir -p {remote_media}"),
    )?;
    // scp -r the *contents* of the staged tree into the remote media dir
    // (the trailing `/.` is the "merge contents, don't nest" trick).
    let mut src = absolutise(&media_root)?.into_os_string();
    src.push("/.");
    scp_to(cfg, Path::new(&src), &remote_media)?;
    let _ = fs::remove_dir_all(&staging);
    Ok(true)
}

/// Confirm that the remote DB file is byte-identical to what we shipped.
/// scp can return success while the backend's mmap'd inode keeps serving
/// the old bytes, so size+timestamp aren't enough — md5 is the only
/// honest signal that the swap actually landed.
fn verify_remote_db_matches(
    cfg: &DeployConfig,
    local_db: &Path,
    remote_db: &str,
) -> Result<(), String> {
    let local_hash = md5_file(local_db)?;
    // `md5sum` is GNU coreutils — present on every Linux target this
    // deploy supports. Output is `<hash>  <path>\n`; take the first word.
    let raw = ssh_exec(cfg, &format!("md5sum {remote_db}"))?;
    let remote_hash = raw
        .split_whitespace()
        .next()
        .ok_or_else(|| format!("[content] empty md5sum output for {remote_db}"))?
        .to_string();
    if remote_hash.eq_ignore_ascii_case(&local_hash) {
        println!("[content] verified md5 {local_hash} (local == remote)");
        Ok(())
    } else {
        Err(format!(
            "[content] md5 mismatch — local {local_hash} != remote {remote_hash}; \
             scp did not land. Backend is stopped; investigate before restarting."
        ))
    }
}

/// Path the PG cutover installer writes — a systemd-style env file with
/// `DB_DRIVER=postgres` and `DB_SOURCE=postgres://...`. Its presence is the
/// signal that the backend has been switched off SQLite; its absence means
/// the deploy stays SQLite-only and PG sync is skipped.
const REMOTE_DB_ENV_PATH: &str = "/etc/silan-backend/db.env";

/// Path the PG cutover installer drops the importer at. A Linux x86_64 build
/// of `backend/cmd/sqlite2pg` from this same tree.
const REMOTE_SQLITE2PG_BIN: &str = "/usr/local/bin/silan-sqlite2pg";

/// If the remote backend is configured to read from PostgreSQL (env file
/// present and `DB_DRIVER=postgres`), import the freshly-scp'd SQLite into
/// PG so the next backend start reads the new content. Without this, a
/// content push only refreshes the SQLite file — but the live read path is
/// PG, so the site would keep serving stale data.
///
/// Returns Ok(()) and prints a one-line skip note when PG mode is not
/// detected, so the same `update-content` flow keeps working for installs
/// that never migrated off SQLite.
fn sync_remote_postgres_if_configured(cfg: &DeployConfig, remote_db: &str) -> Result<(), String> {
    // Decide once whether PG mode is active. Reading the env file's
    // `DB_DRIVER` and trying `[ -x importer ]` in a single ssh call keeps
    // the deploy log clean for non-PG installs (one round trip, one note).
    let probe = format!(
        "if [ -f {env} ] && grep -q '^DB_DRIVER=postgres' {env} && [ -x {bin} ]; then \
           echo PG_READY; \
         elif [ -f {env} ] && grep -q '^DB_DRIVER=postgres' {env}; then \
           echo PG_NO_BIN; \
         else \
           echo NO_PG; \
         fi",
        env = REMOTE_DB_ENV_PATH,
        bin = REMOTE_SQLITE2PG_BIN,
    );
    let state = ssh_exec(cfg, &probe)?;
    let state = state.trim();
    match state {
        "NO_PG" => {
            println!("[pg-sync] skip: remote backend uses SQLite (no {REMOTE_DB_ENV_PATH})");
            Ok(())
        }
        "PG_NO_BIN" => Err(format!(
            "[pg-sync] {REMOTE_DB_ENV_PATH} says DB_DRIVER=postgres but \
             {REMOTE_SQLITE2PG_BIN} is missing — install it from \
             `backend/cmd/sqlite2pg` before running update-content. Backend is \
             stopped; restart manually after fixing."
        )),
        "PG_READY" => {
            println!("[pg-sync] import SQLite → PG via {REMOTE_SQLITE2PG_BIN}");
            let cmd = format!(
                "{bin} --sqlite {db} --env-file {env}",
                bin = REMOTE_SQLITE2PG_BIN,
                db = remote_db,
                env = REMOTE_DB_ENV_PATH,
            );
            let out = ssh_exec(cfg, &cmd)?;
            // The importer logs one "copied <table>: N rows" line per table
            // and a "done: copied X tables" trailer. Echo just the trailer
            // to keep the deploy log readable; the full log is available on
            // the server side if a per-table count is needed.
            if let Some(done) = out.lines().rev().find(|l| l.contains("done:")) {
                println!("[pg-sync] {}", done.trim());
            }
            Ok(())
        }
        other => Err(format!("[pg-sync] unexpected probe state: {other:?}")),
    }
}

/// Compute the lowercase hex md5 of a local file. Streams the file so the
/// 250 KB derived DB doesn't all need to be in memory at once (matters for
/// the larger media tarballs in the same flow).
fn md5_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut f =
        fs::File::open(path).map_err(|e| format!("[content] open {}: {e}", path.display()))?;
    let mut ctx = md5::Context::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = f
            .read(&mut buf)
            .map_err(|e| format!("[content] read {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        ctx.consume(&buf[..n]);
    }
    Ok(format!("{:x}", ctx.compute()))
}

/// Phase 2 — frontend. Build the default frontend target locally; ship
/// `dist/`. macOS-produced `._*` AppleDouble files are stripped on the remote
/// side (otherwise nginx serves them as text/plain and search engines index
/// them).
fn deploy_nginx_frontend(project_root: &Path, cfg: &DeployConfig) -> Result<(), String> {
    let dist = build_frontend_target(project_root, &FrontendBuildTarget::default())?;
    let tarball = std::env::temp_dir().join("silan-viking-frontend-dist.tar.gz");
    println!("[frontend] tar dist → {}", tarball.display());
    let status = Command::new("tar")
        .arg("-czf")
        .arg(&tarball)
        .arg("-C")
        .arg(&dist)
        .arg(".")
        .status()
        .map_err(|e| format!("[frontend] tar: {e}"))?;
    if !status.success() {
        return Err(format!("[frontend] tar exited with {status}"));
    }
    let remote_tar = "/tmp/silan-viking-frontend-dist.tar.gz";
    println!("[frontend] scp → {}", remote_tar);
    scp_to(cfg, &tarball, remote_tar)?;
    // Untar over the vhost root, then drop AppleDouble resource forks
    // (`._*`) so nginx doesn't serve them.
    println!("[frontend] untar at {}", cfg.remote_dir);
    ssh_exec(
        cfg,
        &format!(
            "cd {dir} && tar -xzf {tar} && find . -maxdepth 4 -name '._*' -delete",
            dir = cfg.remote_dir,
            tar = remote_tar,
        ),
    )?;
    let _ = std::fs::remove_file(&tarball);
    Ok(())
}

/// Phase 3 — backend. Tar the Go source (excluding artefacts), build on the
/// server (CGO_ENABLED=1 — the SQLite driver needs cgo + libsqlite on the
/// target's libc), drop the binary at `<remote_dir>/api/silan-backend`. A
/// `backend-api.yaml` is written if one isn't already there; the caller
/// restarts systemd to pick it up.
fn deploy_nginx_backend(project_root: &Path, cfg: &DeployConfig) -> Result<(), String> {
    let backend = project_root.join("backend");
    if !backend.is_dir() {
        return Err(format!(
            "[backend] {} not found — silan-viking expects backend/ next to engine/",
            backend.display(),
        ));
    }
    let tarball = std::env::temp_dir().join("silan-viking-backend-src.tar.gz");
    println!("[backend] tar source → {}", tarball.display());
    let status = Command::new("tar")
        .args([
            "--exclude=.git",
            "--exclude=*.log",
            "--exclude=silan-backend",
            "--exclude=silan-backend-mac",
            "-czf",
        ])
        .arg(&tarball)
        .arg("-C")
        .arg(&backend)
        .arg(".")
        .status()
        .map_err(|e| format!("[backend] tar: {e}"))?;
    if !status.success() {
        return Err(format!("[backend] tar exited with {status}"));
    }
    let remote_tar = "/tmp/silan-viking-backend-src.tar.gz";
    println!("[backend] scp → {}", remote_tar);
    scp_to(cfg, &tarball, remote_tar)?;

    let api_dir = format!("{}/api", cfg.remote_dir);
    let etc_dir = format!("{api_dir}/etc");
    let bin_path = format!("{api_dir}/silan-backend");
    let importer = REMOTE_SQLITE2PG_BIN;
    // Untar + go build. We rebuild every time — Go's incremental cache
    // makes this fast after the first run, and a fresh build catches any
    // drift between local source and what is deployed.
    println!("[backend] remote build (API + runtime-safe sqlite2pg importer)");
    ssh_exec(
        cfg,
        &format!(
            "set -e && \
             mkdir -p {api_dir} {etc_dir} && \
             rm -rf /tmp/silan-backend-build && mkdir -p /tmp/silan-backend-build && \
             cd /tmp/silan-backend-build && tar -xzf {remote_tar} && \
             CGO_ENABLED=1 go build -o {bin_path} backend.go && \
             CGO_ENABLED=1 go build -o {importer} ./cmd/sqlite2pg"
        ),
    )?;

    // Write etc/backend-api.yaml if missing. Don't clobber a hand-edited
    // file — the operator may have customised auth or database path.
    let probe = ssh_exec(
        cfg,
        &format!("test -f {etc_dir}/backend-api.yaml && echo yes || echo no"),
    )?;
    if probe.trim() == "no" {
        println!("[backend] write {etc_dir}/backend-api.yaml (defaults)");
        let yaml = format!(
            "Name: silan-backend\n\
             Host: 127.0.0.1\n\
             Port: {port}\n\
             Database:\n\
             \x20\x20driver: sqlite3\n\
             \x20\x20source: {dir}/api/_deploy/api/portfolio.db?_fk=1\n\
             \x20\x20host: ''\n\x20\x20port: ''\n\x20\x20user: ''\n\
             \x20\x20password: ''\n\x20\x20name: ''\n\x20\x20ssl_mode: ''\n\
             Auth:\n\x20\x20google_client_id: ''\n\
             Media:\n\x20\x20Root: {dir}/api/media\n",
            port = cfg.backend_port,
            dir = cfg.remote_dir,
        );
        // Use a heredoc-like base64 round-trip so any awkward shell
        // characters (back-quotes, $ signs) survive intact.
        let b64 = base64_encode(yaml.as_bytes());
        ssh_exec(
            cfg,
            &format!("echo {b64} | base64 -d > {etc_dir}/backend-api.yaml"),
        )?;
    }
    let _ = std::fs::remove_file(&tarball);
    Ok(())
}

/// Minimal base64 encoder — used only for shipping a multi-line YAML
/// through a single-line ssh command. Avoids a dependency on the
/// `base64` crate for one call site.
fn base64_encode(input: &[u8]) -> String {
    const ALPHA: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        out.push(ALPHA[(b0 >> 2) as usize] as char);
        out.push(ALPHA[(((b0 & 0b11) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(ALPHA[(((b1 & 0b1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(ALPHA[(b2 & 0b111111) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// `which(name)` — return the resolved binary path if it's on PATH.
/// Equivalent to the shell's `command -v`; used to surface a clear
/// "install npm" / "install go" message instead of an opaque exec error.
fn which(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path).find_map(|dir| {
        let p = dir.join(name);
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    })
}

fn site_deploy(
    content_root: &Path,
    db_path: &Path,
    out_dir: &Path,
    confirm: bool,
    what: DeployWhat,
) -> Result<(), String> {
    let cfg = deploy_config(content_root)?;
    let project_root = content_root.parent().unwrap_or(content_root);
    if cfg.mode == DeployMode::Nginx {
        return run_nginx_deploy(content_root, db_path, project_root, &cfg, confirm, what);
    }
    // Below this point: docker mode (v1.0.0 behaviour). `--what` is not
    // meaningful here — docker ships everything as one image set — so a
    // non-default selection is a no-op warning.
    if what != DeployWhat::All {
        eprintln!(
            "note: --what={} ignored in docker mode (docker ships the whole stack)",
            what.label(),
        );
    }
    // A `localhost` / `local` host means a single-host deploy: docker runs
    // here, no SSH. This is what the e2e Docker experiment exercises.
    let is_local = matches!(cfg.host.as_str(), "localhost" | "127.0.0.1" | "local");
    let target = format!("{}@{}", cfg.user, cfg.host);
    // The compose file lives inside the staged `deploy/` directory. Its
    // own `build.context: ..` then resolves to the staging root, which
    // holds `frontend/` and `backend/`.
    let compose = "deploy/docker-compose.yml";

    if !confirm {
        println!("site deploy — dry run (pass --confirm to execute)");
        if is_local {
            println!("  target  localhost (single-host docker deploy)");
        } else {
            println!("  target  {target}:{}", cfg.remote_dir);
        }
        println!("  1 sync     content/ -> {}", db_path.display());
        println!(
            "  2 build    stage embedded sources + SEO artifacts + media -> {}",
            out_dir.display()
        );
        println!("  3 package  docker compose build (backend/web images, multi-stage)");
        println!(
            "  4 ship     {}",
            if is_local {
                "load images locally"
            } else {
                "docker save | ssh docker load"
            }
        );
        println!("  5 promote  replace derived tables on the live db (runtime tables preserved)");
        println!("  6 up       docker compose up -d");
        return Ok(());
    }

    // 1 — sync: rebuild the derived db snapshot from content/.
    println!("[1/6] sync");
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    ws.sync(db_path).map_err(|e| e.to_string())?;
    let content_commit = git_head_commit(content_root).unwrap_or_else(|| "unknown".into());
    // The scan also surfaces the binary resources (`assets/` images) the
    // `silan://` references in the synced db now point at — they ride along
    // into the backend's media volume below.
    let assets = ws.scan().map_err(|e| e.to_string())?.assets().to_vec();

    // 2 — build: materialise the Docker build context from the embedded
    // artifacts, then render SEO crawler artifacts into `deploy/seo/` so
    // the web image bakes them in. The front-end itself is NOT built
    // here — the web Dockerfile's `node` stage does that, in a container
    // isolated from the operator's host (`docs/silan-viking/16`).
    println!("[2/6] build");
    let staging = stage_deploy_artifacts(project_root)?;
    let base_url = if is_local {
        "http://localhost:8080".to_owned()
    } else {
        format!("https://{}", cfg.host)
    };
    let projector = silan_viking_site::SiteProjector::new(&base_url);
    let seo_dir = staging.join("deploy/seo");
    projector
        .build(content_root, &seo_dir)
        .map_err(|e| e.to_string())?;
    // Mirror the SEO artifacts into `--out` too, for `site preview` parity.
    let _ = projector.build(content_root, out_dir);
    // Stage the binary resources beside the build context, ready to ship
    // into the backend's media volume.
    let media_root = stage_media(&staging, &assets)?;
    if let Some(ref dir) = media_root {
        println!(
            "        staged {} media file(s) -> {}",
            assets.len(),
            dir.display()
        );
    }

    // 3 — package: build the docker images from the staged compose file.
    println!("[3/6] package");
    docker_compose(&staging, compose, &["build"])?;

    // 4/5/6 differ between a local and a remote target.
    if is_local {
        return run_local_deploy(
            &staging,
            compose,
            project_root,
            db_path,
            media_root.as_deref(),
            &assets,
            &content_commit,
        );
    }

    // ---- remote target: ship pre-built images + snapshot over SSH ----
    let key = cfg.ssh_key_path.to_string_lossy().into_owned();
    // ssh takes `-p <port>`, scp takes `-P <port>` — different flags for
    // the same thing. Pre-format both as strings the closures can pass.
    let ssh_port = cfg.ssh_port.to_string();
    let ssh = |remote_cmd: &str| -> Result<(), String> {
        // Capture stderr so the wrapper can recognise common failure
        // modes (Permission denied on the deploy dir is the one users
        // hit most) and translate the raw OS error into something
        // actionable. `.status()` would inherit stderr to the terminal
        // and leave nothing for us to inspect.
        let out = Command::new("ssh")
            .args([
                "-i",
                &key,
                "-p",
                &ssh_port,
                // First deploy to a fresh server: its host key is not
                // yet known. `accept-new` records it on first contact
                // and verifies strictly thereafter — unlike `no`, which
                // would silently accept a changed (possibly spoofed)
                // key on every connection.
                "-o",
                "StrictHostKeyChecking=accept-new",
                &target,
                remote_cmd,
            ])
            .output()
            .map_err(|e| format!("ssh: {e}"))?;
        // Mirror the captured streams to the terminal so verbose
        // output (docker load progress, etc.) is still visible.
        if !out.stdout.is_empty() {
            let _ = std::io::Write::write_all(&mut std::io::stdout(), &out.stdout);
        }
        if !out.stderr.is_empty() {
            let _ = std::io::Write::write_all(&mut std::io::stderr(), &out.stderr);
        }
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            if stderr.contains("Permission denied")
                && (remote_cmd.contains("mkdir") || stderr.contains(cfg.remote_dir.as_str()))
            {
                return Err(format!(
                    "remote_dir `{}` is not writable by the deploy user. \
                     Either pre-create it with `sudo mkdir -p {dir} && sudo chown $USER {dir}` \
                     on the target, or pick a path under the deploy user's home (e.g. `~/silan-viking`) \
                     in [deploy] of silan-viking.toml.",
                    cfg.remote_dir,
                    dir = cfg.remote_dir,
                ));
            }
            return Err(format!("remote command failed: {remote_cmd}"));
        }
        Ok(())
    };
    // scp a local file up to `<remote_dir>/<remote_rel>`. The
    // `accept-new` host-key policy matches the `ssh` closure above.
    let scp_up = |local: &Path, remote_rel: &str| -> Result<(), String> {
        let status = Command::new("scp")
            .args([
                "-i",
                &key,
                "-P",
                &ssh_port,
                "-o",
                "StrictHostKeyChecking=accept-new",
            ])
            .arg(local)
            .arg(format!("{target}:{}/{remote_rel}", cfg.remote_dir))
            .status()
            .map_err(|e| format!("scp: {e}"))?;
        if !status.success() {
            return Err(format!("scp up failed: {}", local.display()));
        }
        Ok(())
    };
    // scp a file down from `<remote_dir>/<remote_rel>` to a local path.
    let scp_down = |remote_rel: &str, local: &Path| -> Result<(), String> {
        let status = Command::new("scp")
            .args([
                "-i",
                &key,
                "-P",
                &ssh_port,
                "-o",
                "StrictHostKeyChecking=accept-new",
            ])
            .arg(format!("{target}:{}/{remote_rel}", cfg.remote_dir))
            .arg(local)
            .status()
            .map_err(|e| format!("scp: {e}"))?;
        if !status.success() {
            return Err(format!("scp down failed: {remote_rel}"));
        }
        Ok(())
    };

    println!("[4/6] ship");
    ssh(&format!("mkdir -p {}", cfg.remote_dir))?;
    // Clean up stale ship artefacts from a previous (possibly failed)
    // deploy. The hazard: if a previous run died after `mkdir -p` but
    // before scp, Docker may have created any of the bind-mount sources
    // below as an empty directory; the next scp would then fail with a
    // confusing "Is a directory" or silently produce wrong contents.
    // We delete only the four paths this command actually ships into,
    // not the whole remote_dir — the operator may keep other files
    // (logs, manual backups) alongside.
    ssh(&format!(
        "cd {dir} && rm -rf images.tar snapshot.db docker-compose.yml proxy.conf",
        dir = cfg.remote_dir,
    ))?;
    // Save the built images to a tarball and ship them.
    let images_tar = project_root.join("_deploy/images.tar");
    let save = Command::new("docker")
        .args(["save", "-o"])
        .arg(&images_tar)
        .args(["silan-backend:latest", "silan-web:latest"])
        .status()
        .map_err(|e| format!("docker save: {e}"))?;
    if !save.success() {
        return Err("docker save failed".into());
    }
    scp_up(&images_tar, "images.tar")?;
    scp_up(db_path, "snapshot.db")?;
    // The compose file is shipped flat (no `deploy/` prefix); on the
    // server it sits beside the loaded images, and its `build.context`
    // is never used there — the images are pre-built.
    scp_up(&staging.join(compose), "docker-compose.yml")?;
    // proxy.conf must travel with the compose file: the `proxy` service
    // bind-mounts `./proxy.conf` into the nginx container, and that path
    // resolves next to the (flat-shipped) compose file. Without it,
    // Docker creates `/srv/silan/proxy.conf` as a directory and the
    // mount onto a file path fails.
    scp_up(&staging.join("deploy/proxy.conf"), "proxy.conf")?;
    // The silan-viking binary is deliberately NOT shipped: it is built
    // for the operator's OS/arch and may not run on the target. promote
    // is a pure SQLite operation — it runs here, on the operator's
    // machine, against a db copied down from the server.
    ssh(&format!(
        "cd {} && docker load -i images.tar",
        cfg.remote_dir
    ))?;

    println!("[5/6] promote");
    // Bring the stack up so the named volume + live db exist.
    ssh(&format!(
        "cd {dir} && docker compose -f docker-compose.yml up -d",
        dir = cfg.remote_dir,
    ))?;

    // Ship the media tree first, while the backend is up — the mirror step
    // uses `docker compose exec`, which needs a running container. tar it
    // (scp has no recursive flag here), send the tarball, unpack it on the
    // server, then mirror it into the volume — clearing `/data/media` first
    // so a deleted asset also disappears server-side.
    if let Some(ref dir) = media_root {
        let media_tar = project_root.join("_deploy/media.tar");
        let tar = Command::new("tar")
            .arg("-czf")
            .arg(&media_tar)
            .arg("-C")
            .arg(dir)
            .arg(".")
            .status()
            .map_err(|e| format!("tar media: {e}"))?;
        if !tar.success() {
            return Err("packing the media tree failed".to_owned());
        }
        scp_up(&media_tar, "media.tar")?;
        ssh(&format!(
            "cd {dir} && docker compose -f docker-compose.yml exec -T backend \
                 sh -c 'rm -rf /data/media && mkdir -p /data/media' && \
             rm -rf media && mkdir -p media && tar -xzf media.tar -C media && \
             docker compose -f docker-compose.yml cp media/. backend:/data/media",
            dir = cfg.remote_dir,
        ))?;
        println!("  synced {} media file(s) into /data/media", assets.len());
    }

    // Now stop the backend before touching the db: the backend keeps it in
    // SQLite WAL mode, so copying the bare `portfolio.db` while the backend
    // holds an uncheckpointed WAL yields a torn snapshot, and copying a
    // fresh `.db` back next to a stale `-wal` corrupts the database on the
    // next open. Stopping the backend checkpoints and releases the WAL.
    // Then: pull the live db down, promote it HERE (operator-side — no
    // remote binary), push the promoted db back, and delete the now-stale
    // `-wal`/`-shm` before the backend reopens. Runtime tables survive.
    ssh(&format!(
        "cd {dir} && docker compose -f docker-compose.yml stop backend && \
         (docker compose -f docker-compose.yml cp backend:/data/portfolio.db live.db \
            || cp snapshot.db live.db) && \
         cp -f live.db portfolio.db.prev",
        dir = cfg.remote_dir,
    ))?;
    let live_snapshot = project_root.join("_deploy/live-portfolio.db");
    scp_down("live.db", &live_snapshot)?;
    promote_db(&live_snapshot, db_path, &content_commit)?;
    scp_up(&live_snapshot, "live.db")?;
    ssh(&format!(
        "cd {dir} && docker compose -f docker-compose.yml cp live.db backend:/data/portfolio.db && \
         docker compose -f docker-compose.yml run --rm --no-deps --entrypoint sh backend \
             -c 'rm -f /data/portfolio.db-wal /data/portfolio.db-shm'",
        dir = cfg.remote_dir,
    ))?;

    // Start the backend back up — it was stopped for the db copy — so it
    // reopens the promoted db cleanly, and restart the proxy: `up -d` may
    // recreate the backend on a fresh IP, and nginx caches the `backend`
    // upstream IP at worker start, so a stale proxy serves 502.
    println!("[6/6] up");
    ssh(&format!(
        "cd {} && docker compose -f docker-compose.yml up -d && \
         docker compose -f docker-compose.yml restart proxy",
        cfg.remote_dir
    ))?;

    println!("deployed to https://{}", cfg.host);
    Ok(())
}

/// Run `docker compose -f <file> <args...>` from the project root.
fn docker_compose(project_root: &Path, compose_file: &str, args: &[&str]) -> Result<(), String> {
    let status = Command::new("docker")
        .args(["compose", "-f", compose_file])
        .args(args)
        .current_dir(project_root)
        .status()
        .map_err(|e| format!("docker compose: {e}"))?;
    if !status.success() {
        return Err(format!("docker compose {} failed", args.join(" ")));
    }
    Ok(())
}

/// Resolve `local` to an absolute path. `docker compose cp` interprets a
/// relative local path against its own working directory (here the
/// staging dir), which is *not* where the snapshot lives — so the path
/// must be absolutised before it crosses the process boundary.
fn absolutise(local: &Path) -> Result<PathBuf, String> {
    if local.is_absolute() {
        return Ok(local.to_path_buf());
    }
    let cwd = env::current_dir().map_err(|e| e.to_string())?;
    Ok(cwd.join(local))
}

/// `docker compose cp <service>:<remote> <local>` — copy a file out of a
/// running container. `compose_dir` is where `docker compose` runs (it
/// resolves `compose_file` and the project from there); `local` is
/// absolutised so it does not depend on that directory.
fn docker_cp_from(
    compose_file: &str,
    compose_dir: &Path,
    service: &str,
    remote: &str,
    local: &Path,
) -> Result<(), String> {
    let local = absolutise(local)?;
    let status = Command::new("docker")
        .args(["compose", "-f", compose_file, "cp"])
        .arg(format!("{service}:{remote}"))
        .arg(&local)
        .current_dir(compose_dir)
        .status()
        .map_err(|e| format!("docker compose cp: {e}"))?;
    if !status.success() {
        return Err(format!("docker compose cp from {service}:{remote} failed"));
    }
    Ok(())
}

/// `docker compose cp <local> <service>:<remote>` — copy a file into a
/// running container. See [`docker_cp_from`] for the `compose_dir` /
/// `local` path-resolution contract.
fn docker_cp_to(
    compose_file: &str,
    compose_dir: &Path,
    service: &str,
    local: &Path,
    remote: &str,
) -> Result<(), String> {
    let local = absolutise(local)?;
    let status = Command::new("docker")
        .args(["compose", "-f", compose_file, "cp"])
        .arg(&local)
        .arg(format!("{service}:{remote}"))
        .current_dir(compose_dir)
        .status()
        .map_err(|e| format!("docker compose cp: {e}"))?;
    if !status.success() {
        return Err(format!("docker compose cp to {service}:{remote} failed"));
    }
    Ok(())
}

/// Delete the SQLite WAL companion files (`portfolio.db-wal` /
/// `portfolio.db-shm`) from the backend's data volume.
///
/// Called after the promoted `portfolio.db` has been copied back in, while
/// the backend container is stopped. The promoted `.db` is a complete,
/// self-contained file; a `-wal`/`-shm` left over from before the stop is
/// keyed to the *previous* database generation, and SQLite would replay its
/// stale frames onto the new file on reopen — corrupting it. The backend is
/// stopped, so a throwaway `run` is used to reach the volume.
fn clear_wal_companions(
    compose_file: &str,
    compose_dir: &Path,
    service: &str,
) -> Result<(), String> {
    let status = Command::new("docker")
        .args(["compose", "-f", compose_file, "run", "--rm", "--no-deps"])
        .args(["--entrypoint", "sh", service])
        .args(["-c", "rm -f /data/portfolio.db-wal /data/portfolio.db-shm"])
        .current_dir(compose_dir)
        .status()
        .map_err(|e| format!("docker compose run (clear wal): {e}"))?;
    if !status.success() {
        return Err("clearing the stale WAL companion files failed".to_owned());
    }
    Ok(())
}

/// Promote the snapshot's derived tables onto the live db, in place. Runtime
/// tables (comment / content_interaction / annotation) are left untouched
/// (`08` §8.3).
fn promote_db(live_db: &Path, snapshot_db: &Path, content_commit: &str) -> Result<(), String> {
    let report = silan_viking_site::promote(
        &live_db.to_string_lossy(),
        &snapshot_db.to_string_lossy(),
        content_commit,
    )
    .map_err(|e| e.to_string())?;
    println!(
        "  promoted tables={} rows={} content_commit={}",
        report.replaced_tables.len(),
        report.rows_inserted,
        report.content_commit
    );
    Ok(())
}

/// Stage the scanned binary resources into one local `media/` tree.
///
/// Each [`ScannedAsset`] is copied to `<staging>/deploy/media/<rel_path>`,
/// preserving the `<type>/<slug>/assets/<file>` layout — the same path the
/// `sync` step rewrote `silan://` references to (minus the `/api/v1/media`
/// route prefix). The returned directory is what [`sync_media_into_volume`]
/// ships into the backend's media volume. Returns `None` when the content
/// tree has no assets, so deploy can skip the media steps entirely.
fn stage_media(staging: &Path, assets: &[ScannedAsset]) -> Result<Option<PathBuf>, String> {
    if assets.is_empty() {
        return Ok(None);
    }
    let media_root = staging.join("deploy/media");
    // A clean tree each deploy: the staged set IS the desired server state
    // (mirror semantics), so a stale file from a previous run must not linger.
    let _ = fs::remove_dir_all(&media_root);
    for asset in assets {
        let dest = media_root.join(&asset.rel_path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("staging media dir {}: {e}", parent.display()))?;
        }
        fs::copy(&asset.abs_path, &dest)
            .map_err(|e| format!("staging media file {}: {e}", asset.rel_path))?;
    }
    Ok(Some(media_root))
}

/// Mirror the staged `media/` tree into the backend container's `/data/media`
/// volume.
///
/// Mirror, not merge: the container's `/data/media` is removed first, so an
/// asset deleted from `content/` also disappears from the server — the live
/// media set always equals the current scan. The volume itself persists
/// across container restarts (it is a named volume), so this is the only
/// thing that changes its contents.
fn sync_media_into_volume(
    compose_file: &str,
    compose_dir: &Path,
    service: &str,
    media_root: &Path,
) -> Result<(), String> {
    // Clear the volume's media dir, then recreate it empty, so `cp` lands the
    // staged tree as `/data/media` exactly (not nested under a stale dir).
    let clear = Command::new("docker")
        .args(["compose", "-f", compose_file, "exec", "-T", service])
        .args(["sh", "-c", "rm -rf /data/media && mkdir -p /data/media"])
        .current_dir(compose_dir)
        .status()
        .map_err(|e| format!("docker compose exec (clear media): {e}"))?;
    if !clear.success() {
        return Err("clearing the container's /data/media failed".to_owned());
    }
    // `cp <localdir>/. <service>:/data/media` copies the *contents* of the
    // staged tree into the now-empty volume dir — the trailing `/.` is what
    // makes `docker cp` merge contents rather than nest the directory.
    let media_root = absolutise(media_root)?;
    let mut src = media_root.into_os_string();
    src.push("/.");
    let status = Command::new("docker")
        .args(["compose", "-f", compose_file, "cp"])
        .arg(&src)
        .arg(format!("{service}:/data/media"))
        .current_dir(compose_dir)
        .status()
        .map_err(|e| format!("docker compose cp (media): {e}"))?;
    if !status.success() {
        return Err("copying media into the container failed".to_owned());
    }
    Ok(())
}

/// The current `content/` Git HEAD commit — the marker promote writes so
/// monitoring knows which content revision is live.
fn git_head_commit(content_root: &Path) -> Option<String> {
    let out = Command::new("git")
        .args(["-C"])
        .arg(content_root)
        .args(["rev-parse", "HEAD"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

/// `silan site rollback` — restore the previous live db on the server and
/// restart the stack (`02` §site / `06` §6.5). It relies on the
/// `portfolio.db.prev` snapshot that `site deploy` and `site update-content`
/// leave behind.
///
/// Branches on `cfg.mode`: in `docker` mode the prev sits at
/// `<remote_dir>/portfolio.db` alongside the compose file; in `nginx` mode
/// (systemd + native binary) it sits under `<remote_dir>/api/_deploy/api/`
/// next to the live DB. The two layouts cannot be unified without breaking
/// the compose contract, so we pick the right recipe per mode.
fn site_rollback(content_root: &Path) -> Result<(), String> {
    let cfg = deploy_config(content_root)?;
    let target = format!("{}@{}", cfg.user, cfg.host);
    let key = cfg.ssh_key_path.to_string_lossy().into_owned();
    let remote = if cfg.mode == DeployMode::Nginx {
        // Stop the systemd unit first — same reasoning as in the deploy
        // path: don't swap a mmap'd file. Then promote .prev. Then start.
        // Clear any stale -wal/-shm so the restarted backend doesn't try to
        // pair the rolled-back DB with the failed deploy's WAL.
        format!(
            "set -e; \
             dir={dir}/api/_deploy/api; \
             test -f $dir/portfolio.db.prev || {{ echo 'no portfolio.db.prev'; exit 1; }}; \
             systemctl stop {unit}; \
             mv -f $dir/portfolio.db.prev $dir/portfolio.db; \
             rm -f $dir/portfolio.db-wal $dir/portfolio.db-shm; \
             chown www:www $dir/portfolio.db; \
             systemctl start {unit}",
            dir = cfg.remote_dir,
            unit = cfg.systemd_unit,
        )
    } else {
        // docker mode (v1.0.0): the compose file is shipped flat to the
        // remote dir by `site deploy` (always named `docker-compose.yml`).
        format!(
            "cd {dir} && test -f portfolio.db.prev && \
             mv -f portfolio.db.prev portfolio.db && \
             docker compose -f docker-compose.yml up -d",
            dir = cfg.remote_dir,
        )
    };
    let status = Command::new("ssh")
        .args([
            "-i",
            &key,
            "-p",
            &cfg.ssh_port.to_string(),
            "-o",
            "StrictHostKeyChecking=accept-new",
            &target,
            &remote,
        ])
        .status()
        .map_err(|e| format!("ssh: {e}"))?;
    if !status.success() {
        return Err("rollback failed — no portfolio.db.prev on the server?".into());
    }
    println!("rolled back https://{} to the previous deploy", cfg.host);
    Ok(())
}

/// `silan site status` — query live service health and the deployed content
/// commit (`02` §site). Distinct from `site check`, which is the pre-publish
/// local health check.
///
/// Without a `[deploy]` section, status falls back to a local-stack probe
/// (the 2026-05-21 e2e pass flagged the previous behaviour: a friendly
/// command was returning a deploy-flavoured error). With `[deploy]`, it
/// SSHes to the remote host as before.
fn site_status(content_root: &Path) -> Result<(), String> {
    // Try [deploy] first; if it isn't configured, that is no longer a hard
    // error — it just means "there is no remote target, only a local stack
    // might be running".
    let cfg = match deploy_config(content_root) {
        Ok(cfg) => cfg,
        Err(_) => {
            // No [deploy] — probe the local docker stack instead.
            return local_site_status();
        }
    };

    let is_local = matches!(cfg.host.as_str(), "localhost" | "127.0.0.1" | "local");
    if is_local {
        return local_site_status();
    }

    let target = format!("{}@{}", cfg.user, cfg.host);
    let key = cfg.ssh_key_path.to_string_lossy().into_owned();
    let out = Command::new("ssh")
        .args([
            "-i",
            &key,
            "-p",
            &cfg.ssh_port.to_string(),
            "-o",
            "StrictHostKeyChecking=accept-new",
            &target,
            &format!("cd {} && docker compose ps", cfg.remote_dir),
        ])
        .output()
        .map_err(|e| format!("ssh: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "cannot reach {target}: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    println!("site status — {}", cfg.host);
    print!("{}", String::from_utf8_lossy(&out.stdout));
    Ok(())
}

/// Report the local Docker stack — what `site status` shows when there is no
/// remote `[deploy]` to ask about. Uses the bundled compose name labels so it
/// finds the stack even if the staging directory has been cleaned up.
fn local_site_status() -> Result<(), String> {
    // `docker compose ls` lists every compose project; we filter to the ones
    // whose name contains `silan` (the bundled compose file is named
    // `silan-viking-deploy`). If docker itself is missing, surface a clear
    // hint pointing at how to actually run a local instance.
    let out = Command::new("docker")
        .args(["compose", "ls", "--all", "--format", "json"])
        .output();
    match out {
        Ok(out) if out.status.success() => {
            let raw = String::from_utf8_lossy(&out.stdout);
            let trimmed = raw.trim();
            if trimmed.is_empty() || trimmed == "[]" {
                println!("site status — no local stack");
                println!("  run `silan site preview --confirm` to start one (needs Docker)");
            } else {
                println!("site status — local docker stacks:");
                print!("{raw}");
            }
            Ok(())
        }
        Ok(out) => Err(format!(
            "docker compose ls failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        )),
        Err(e) => Err(format!(
            "docker not available ({e}) — install Docker or configure [deploy] for a remote target"
        )),
    }
}

fn parse_kind(kind: &str) -> Option<ContentKind> {
    match kind {
        "idea" => Some(ContentKind::Idea),
        "blog" => Some(ContentKind::Blog),
        "project" => Some(ContentKind::Project),
        "episode" => Some(ContentKind::Episode),
        "resume" => Some(ContentKind::Resume),
        "update" => Some(ContentKind::Update),
        _ => None,
    }
}

/// The flat content types — those with a `<kind> new <slug>` scaffold (every
/// type except `episode`, which nests under a series, and `resume`, the
/// single Item created by `init`).
fn is_flat_kind(kind: &str) -> bool {
    matches!(kind, "idea" | "blog" | "project" | "update")
}

// ── content scaffolding verbs (`02` §一) ────────────────────────────────────

fn report_scaffold(
    result: Result<scaffold::Scaffolded, scaffold::ScaffoldError>,
) -> Result<(), String> {
    let scaffolded = result.map_err(|e| e.to_string())?;
    for file in &scaffolded.files {
        println!("created {}", file.display());
    }
    Ok(())
}

fn type_new(content_root: &Path, kind: &str, slug: &str) -> Result<(), String> {
    report_scaffold(scaffold::new_item(content_root, kind, slug))
}

fn type_add_part(content_root: &Path, kind: &str, slug: &str, role: &str) -> Result<(), String> {
    report_scaffold(scaffold::add_part(content_root, kind, slug, role))
}

fn type_add_lang(content_root: &Path, kind: &str, slug: &str, lang: &str) -> Result<(), String> {
    // add-lang targets the type's primary Part by default.
    let role = match kind {
        "idea" | "project" => "overview",
        _ => "body",
    };
    report_scaffold(scaffold::add_lang(content_root, kind, slug, role, lang))
}

fn type_edit(
    content_root: &Path,
    kind: &str,
    slug: &str,
    role: Option<&str>,
) -> Result<(), String> {
    // `edit` is non-interactive here: it resolves and prints the file path the
    // author should open (a real $EDITOR launch is a host concern).
    let role = role.unwrap_or(match kind {
        "idea" | "project" => "overview",
        _ => "body",
    });
    let dir = scaffold::type_dir_name(kind).map_err(|e| e.to_string())?;
    let file = content_root
        .join("resources")
        .join(dir)
        .join(slug)
        .join("parts")
        .join(role)
        .join("en.md");
    if !file.exists() {
        return Err(format!("not found: {}", file.display()));
    }
    println!("{}", file.display());
    Ok(())
}

/// `archive` takes an Item off the site (`02` §一). Its mechanism depends on
/// the type: blog/episode have an `archived` value in their `status` enum, so
/// archive sets that. idea/project/update have no `archived` status, so
/// archive sets `visibility` to `unlisted` instead (`10` rule 6: only
/// `visibility=public` is projected). update's `status` is explicitly left
/// unchanged (`02` §一: "归档:status 不变").
fn type_archive(content_root: &Path, kind: &str, slug: &str) -> Result<(), String> {
    let content_kind = parse_kind(kind).ok_or_else(|| format!("unknown type `{kind}`"))?;
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let status_has_archived = ws
        .schema()
        .type_spec(content_kind)
        .and_then(|s| s.field("status"))
        .and_then(|f| f.enum_values())
        .is_some_and(|vals| vals.contains(&"archived"));
    if status_has_archived {
        type_set_field(content_root, kind, slug, "status", "archived")
    } else {
        type_set_field(content_root, kind, slug, "visibility", "unlisted")
    }
}

/// `silan <type> rm <slug>` — delete an Item. Before this fix, rm was an
/// unconditional `fs::remove_dir_all` — no warning when other Items pointed
/// at the doomed one through a `content_relation` edge, no confirmation
/// prompt at all. After deletion the relations became silently dangling
/// (V2-5/V2-6 from the 2026-05-22 e2e pass; USAGE §9 / `07` §7.9 require a
/// warning + confirm).
///
/// New behaviour: scan every Item's `relations` frontmatter for declarations
/// pointing at this slug. If any are found, refuse unless `--force` is set,
/// listing the incoming edges so the owner can fix them first. The owner can
/// either rewrite the source Item's frontmatter (drop the obsolete edge) or
/// run `silan <type> rm <slug> --force` to delete and leave the upstream
/// `relations:` block to be cleaned up by `silan content lint` next time.
fn type_rm(content_root: &Path, kind: &str, slug: &str, force: bool) -> Result<(), String> {
    let type_dir = scaffold::type_dir_name(kind).map_err(|e| e.to_string())?;
    let dir = content_root.join("resources").join(type_dir).join(slug);
    if !dir.exists() {
        return Err(format!("{kind} `{slug}` not found"));
    }

    // Find incoming relations pointing at this Item. The target form mirrors
    // the URI the source frontmatter uses: `silan://resources/<type-dir>/<slug>`.
    let target_uri = format!("silan://resources/{type_dir}/{slug}");
    let incoming = find_incoming_relations(content_root, &target_uri);
    if !incoming.is_empty() && !force {
        let mut msg = format!(
            "{kind} `{slug}` has {n} incoming relation(s):\n",
            n = incoming.len()
        );
        for (src_uri, rel_type) in &incoming {
            msg.push_str(&format!("  {src_uri} --{rel_type}--> this {kind}\n"));
        }
        msg.push_str(
            "  Deleting now would leave those edges dangling.\n  \
             Edit the source frontmatter to drop the edge first, or pass `--force` to delete anyway.",
        );
        return Err(msg);
    }
    if !incoming.is_empty() && force {
        println!(
            "⚠ deleting {kind} `{slug}` with {n} incoming relation(s) — they will become dangling",
            n = incoming.len()
        );
        for (src_uri, rel_type) in &incoming {
            println!("    {src_uri} --{rel_type}--> this {kind}");
        }
    }

    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    println!("removed {}", dir.display());
    Ok(())
}

/// Walk every Item's primary Part frontmatter and collect relation edges
/// that point at `target_uri`. Returns `(source_uri, relation_type)` pairs.
/// This is the rm-time safety check (V2-5); it parses frontmatter directly
/// rather than going through `Workspace::query_index` because rm needs to
/// work on a not-yet-synced tree (no `portfolio.db` required).
fn find_incoming_relations(content_root: &Path, target_uri: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let resources = content_root.join("resources");
    if !resources.exists() {
        return out;
    }
    let kinds = ["ideas", "blog", "projects", "episode", "resume", "update"];
    for kind_dir in kinds {
        let dir = resources.join(kind_dir);
        if !dir.exists() {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let item_dir = entry.path();
            if !item_dir.is_dir() {
                continue;
            }
            let item_slug = entry.file_name().to_string_lossy().into_owned();
            let source_uri = format!("silan://resources/{kind_dir}/{item_slug}");
            // The relations declaration lives in the primary Part's en.md
            // frontmatter (`01` §1.10 modifies the source Item's frontmatter
            // when `silan idea promote` runs).
            for role in ["overview", "body", "summary"] {
                let path = item_dir.join("parts").join(role).join("en.md");
                if !path.exists() {
                    continue;
                }
                let Ok(text) = fs::read_to_string(&path) else {
                    continue;
                };
                for (rel_type, to) in parse_relation_block(&text) {
                    if to == target_uri && source_uri != target_uri {
                        out.push((source_uri.clone(), rel_type));
                    }
                }
            }
        }
    }
    out
}

/// Extract `(type, to)` pairs from a `relations:` YAML block in the
/// frontmatter. Tolerates both compact (`{ type: t, to: "..." }`) and
/// block-style (`- type: t\n    to: "..."`) forms. Returns an empty Vec
/// when there's no relations block. This is a deliberately small
/// hand-parser — pulling YAML for this would over-engineer the rm path.
fn parse_relation_block(text: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    // Find the frontmatter `relations:` section.
    let mut in_fm = false;
    let mut in_relations = false;
    let mut current_type: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed == "---" {
            if in_fm {
                break;
            }
            in_fm = true;
            continue;
        }
        if !in_fm {
            continue;
        }
        if !line.starts_with(' ') && !line.starts_with('-') && line.contains(':') {
            in_relations = line.trim_start().starts_with("relations:");
            current_type = None;
            continue;
        }
        if !in_relations {
            continue;
        }
        // Compact inline: - { type: foo, to: "silan://..." }
        if let Some((t, to)) = parse_compact_relation(line) {
            out.push((t, to));
            continue;
        }
        // Block: - type: foo
        //          to: "silan://..."
        if let Some(t) = parse_block_field(line, "type") {
            current_type = Some(t);
        }
        if let Some(to) = parse_block_field(line, "to") {
            if let Some(t) = current_type.take() {
                out.push((t, to));
            }
        }
    }
    out
}

fn parse_compact_relation(line: &str) -> Option<(String, String)> {
    let l = line.trim();
    if !l.starts_with("- {") {
        return None;
    }
    let inside = l.trim_start_matches("- {").trim_end_matches('}');
    let mut t = None;
    let mut to = None;
    for kv in inside.split(',') {
        let mut it = kv.splitn(2, ':');
        let key = it.next()?.trim();
        let val = it.next()?.trim().trim_matches('"').trim_matches('\'');
        if key == "type" {
            t = Some(val.to_owned());
        } else if key == "to" {
            to = Some(val.to_owned());
        }
    }
    Some((t?, to?))
}

fn parse_block_field(line: &str, key: &str) -> Option<String> {
    let l = line.trim_start_matches('-').trim();
    let prefix = format!("{key}:");
    if !l.starts_with(&prefix) {
        return None;
    }
    Some(
        l[prefix.len()..]
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_owned(),
    )
}

/// The primary (frontmatter-carrying) Part role of a flat content type.
fn primary_role(kind: &str) -> &'static str {
    match kind {
        "idea" | "project" => "overview",
        _ => "body",
    }
}

/// Set a frontmatter field of a flat-type Item, validating the value against
/// the SCHEMA enum if the field is enumerated. This backs `idea status`,
/// `blog publish/unpublish`, `update status/set-type`, and `archive`
/// (`02` §一 type-specific verbs). The frontmatter lives in the canonical
/// `en.md` of the type's primary Part (`01` §1.3.1).
fn type_set_field(
    content_root: &Path,
    kind: &str,
    slug: &str,
    field: &str,
    value: &str,
) -> Result<(), String> {
    let content_kind = parse_kind(kind).ok_or_else(|| format!("unknown type `{kind}`"))?;
    let type_dir = scaffold::type_dir_name(kind).map_err(|e| e.to_string())?;
    let file = content_root
        .join("resources")
        .join(type_dir)
        .join(slug)
        .join("parts")
        .join(primary_role(kind))
        .join("en.md");
    if !file.exists() {
        return Err(format!("{kind} `{slug}` not found"));
    }

    // Validate against the SCHEMA enum so a bad lifecycle value fails here,
    // not later at `index sync`.
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    if let Some(spec) = ws.schema().type_spec(content_kind) {
        if let Some(field_spec) = spec.field(field) {
            if let Some(allowed) = field_spec.enum_values() {
                if !allowed.contains(&value) {
                    return Err(format!(
                        "`{value}` is not a valid {kind} {field} — allowed: {}",
                        allowed.join(", ")
                    ));
                }
            }
        }
    }

    rewrite_frontmatter_field(&file, field, value)?;
    println!("{kind} `{slug}` {field} -> {value}");
    Ok(())
}

/// Type-specific `publish` / `unpublish` for flat-type Items (blog, update,
/// idea, project). `status` is the lifecycle field; `visibility` is the
/// website-projection field — `01` §1.7 / `10` §10.3 keep them separate, but
/// the user-visible `publish` verb (USAGE §3 table; `02` §一) sets BOTH in
/// one go: published = `status=published` + `visibility=public`. Without
/// flipping visibility the post is "published" in lifecycle but never
/// projected — the bug a 2026-05-21 e2e pass surfaced and the contract this
/// helper restores.
fn type_set_publish(
    content_root: &Path,
    kind: &str,
    slug: &str,
    status: &str,
    visibility: &str,
) -> Result<(), String> {
    let content_kind = parse_kind(kind).ok_or_else(|| format!("unknown type `{kind}`"))?;
    let type_dir = scaffold::type_dir_name(kind).map_err(|e| e.to_string())?;
    let file = content_root
        .join("resources")
        .join(type_dir)
        .join(slug)
        .join("parts")
        .join(primary_role(kind))
        .join("en.md");
    if !file.exists() {
        return Err(format!("{kind} `{slug}` not found"));
    }

    // Validate both enum values up-front so a bad input fails before any
    // file write — keeps publish atomic from the owner's view.
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    if let Some(spec) = ws.schema().type_spec(content_kind) {
        for (field, value) in [("status", status), ("visibility", visibility)] {
            if let Some(field_spec) = spec.field(field) {
                if let Some(allowed) = field_spec.enum_values() {
                    if !allowed.contains(&value) {
                        return Err(format!(
                            "`{value}` is not a valid {kind} {field} — allowed: {}",
                            allowed.join(", ")
                        ));
                    }
                }
            }
        }
    }

    rewrite_frontmatter_field(&file, "status", status)?;
    rewrite_frontmatter_field(&file, "visibility", visibility)?;
    println!("{kind} `{slug}` status -> {status}, visibility -> {visibility}");
    Ok(())
}

/// Rewrite (or append) a `key: value` line inside a file's `---` frontmatter
/// block. If the key is absent it is inserted before the closing `---`.
fn rewrite_frontmatter_field(file: &Path, key: &str, value: &str) -> Result<(), String> {
    let text = fs::read_to_string(file).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = text.lines().map(str::to_owned).collect();
    let prefix = format!("{key}:");

    if let Some(line) = lines.iter_mut().find(|l| l.starts_with(&prefix)) {
        *line = format!("{key}: {value}");
    } else {
        // Insert before the closing `---` of the frontmatter block (the
        // second `---` line).
        let fences: Vec<usize> = lines
            .iter()
            .enumerate()
            .filter(|(_, l)| l.trim() == "---")
            .map(|(i, _)| i)
            .collect();
        match fences.get(1) {
            Some(&close) => lines.insert(close, format!("{key}: {value}")),
            None => {
                return Err(format!(
                    "{}: no frontmatter block to update",
                    file.display()
                ))
            }
        }
    }
    fs::write(file, format!("{}\n", lines.join("\n"))).map_err(|e| e.to_string())
}

fn episode_series_new(content_root: &Path, series: &str) -> Result<(), String> {
    report_scaffold(scaffold::new_series(content_root, series))
}

fn episode_new(content_root: &Path, series: &str, slug: &str) -> Result<(), String> {
    report_scaffold(scaffold::new_episode(content_root, series, slug))
}

fn episode_show(content_root: &Path, series: &str, slug: &str) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    let item = scan
        .items()
        .iter()
        .find(|i| i.kind() == ContentKind::Episode && i.slug().as_str() == slug)
        .ok_or_else(|| format!("episode not found: {series}/{slug}"))?;
    print_item(&ws, item)
}

/// The episode-type directory: `content/resources/episode`.
fn episode_root(content_root: &Path) -> PathBuf {
    content_root.join("resources").join("episode")
}

/// The slugs of every episode under a series, sorted (matching scan order).
fn episode_slugs(series_dir: &Path) -> Result<Vec<String>, String> {
    let mut slugs: Vec<String> = fs::read_dir(series_dir)
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    slugs.sort();
    Ok(slugs)
}

fn episode_series_list(content_root: &Path) -> Result<(), String> {
    let root = episode_root(content_root);
    if !root.is_dir() {
        println!("no episode series");
        return Ok(());
    }
    let mut found = false;
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().join("series.toml").exists() {
            let count = episode_slugs(&entry.path())?.len();
            println!("{}\t{count} episodes", entry.file_name().to_string_lossy());
            found = true;
        }
    }
    if !found {
        println!("no episode series");
    }
    Ok(())
}

fn episode_series_show(content_root: &Path, series: &str) -> Result<(), String> {
    let dir = scaffold::series_dir(content_root, series).map_err(|e| e.to_string())?;
    let toml = fs::read_to_string(dir.join("series.toml")).map_err(|e| e.to_string())?;
    println!("series={series}");
    print!("{toml}");
    println!("--- episodes ---");
    for (i, slug) in episode_slugs(&dir)?.iter().enumerate() {
        println!("  {}. {slug}", i + 1);
    }
    Ok(())
}

/// Reorder a series' episodes by rewriting each episode's `episode_number`.
/// With explicit slugs, that order is applied; with none, the episodes are
/// renumbered 1..N by current sort order (an idempotent normalize).
fn episode_series_reorder(content_root: &Path, series: &str, order: &[&str]) -> Result<(), String> {
    let dir = scaffold::series_dir(content_root, series).map_err(|e| e.to_string())?;
    let existing = episode_slugs(&dir)?;
    let sequence: Vec<String> = if order.is_empty() {
        existing.clone()
    } else {
        // Every named slug must exist, and every existing episode must be named.
        for slug in order {
            if !existing.iter().any(|s| s == slug) {
                return Err(format!("episode `{series}/{slug}` not found"));
            }
        }
        if order.len() != existing.len() {
            return Err(format!(
                "reorder must list all {} episodes, got {}",
                existing.len(),
                order.len()
            ));
        }
        order.iter().map(|s| (*s).to_owned()).collect()
    };
    for (i, slug) in sequence.iter().enumerate() {
        let file = dir.join(slug).join("parts/body/en.md");
        rewrite_frontmatter_field(&file, "episode_number", &(i + 1).to_string())?;
        println!("{slug} -> episode_number {}", i + 1);
    }
    Ok(())
}

fn episode_series_archive(content_root: &Path, series: &str) -> Result<(), String> {
    let dir = scaffold::series_dir(content_root, series).map_err(|e| e.to_string())?;
    let toml_path = dir.join("series.toml");
    let text = fs::read_to_string(&toml_path).map_err(|e| e.to_string())?;
    let rewritten: String = text
        .lines()
        .map(|l| {
            if l.trim_start().starts_with("status") {
                "status      = \"archived\"".to_owned()
            } else {
                l.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&toml_path, format!("{rewritten}\n")).map_err(|e| e.to_string())?;
    println!("episode series `{series}` -> archived");
    Ok(())
}

fn episode_series_rm(content_root: &Path, series: &str) -> Result<(), String> {
    let dir = scaffold::series_dir(content_root, series).map_err(|e| e.to_string())?;
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    println!("removed series {}", dir.display());
    Ok(())
}

fn episode_list(content_root: &Path, series: Option<&str>) -> Result<(), String> {
    let root = episode_root(content_root);
    if !root.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let series_name = entry.file_name().to_string_lossy().into_owned();
        if !entry.path().join("series.toml").exists() {
            continue;
        }
        if series.is_some_and(|s| s != series_name) {
            continue;
        }
        for slug in episode_slugs(&entry.path())? {
            println!("{series_name}\t{slug}");
        }
    }
    Ok(())
}

fn episode_edit(
    content_root: &Path,
    series: &str,
    slug: &str,
    lang: Option<&str>,
) -> Result<(), String> {
    let dir = scaffold::episode_dir(content_root, series, slug).map_err(|e| e.to_string())?;
    let file = dir
        .join("parts/body")
        .join(format!("{}.md", lang.unwrap_or("en")));
    if !file.exists() {
        return Err(format!("not found: {}", file.display()));
    }
    println!("{}", file.display());
    Ok(())
}

fn episode_add_lang(
    content_root: &Path,
    series: &str,
    slug: &str,
    lang: &str,
) -> Result<(), String> {
    let dir = scaffold::episode_dir(content_root, series, slug).map_err(|e| e.to_string())?;
    report_scaffold(scaffold::add_lang_at(&dir.join("parts/body"), lang))
}

fn episode_set_status(
    content_root: &Path,
    series: &str,
    slug: &str,
    status: &str,
) -> Result<(), String> {
    let dir = scaffold::episode_dir(content_root, series, slug).map_err(|e| e.to_string())?;
    rewrite_frontmatter_field(&dir.join("parts/body/en.md"), "status", status)?;
    println!("episode `{series}/{slug}` status -> {status}");
    Ok(())
}

/// Episode counterpart of `type_set_publish` — flip status AND visibility in
/// the same call so `silan episode publish` actually projects to the site,
/// not just changes the lifecycle. See `type_set_publish` for the rationale.
fn episode_set_publish(
    content_root: &Path,
    series: &str,
    slug: &str,
    status: &str,
    visibility: &str,
) -> Result<(), String> {
    let dir = scaffold::episode_dir(content_root, series, slug).map_err(|e| e.to_string())?;
    let file = dir.join("parts/body/en.md");
    rewrite_frontmatter_field(&file, "status", status)?;
    rewrite_frontmatter_field(&file, "visibility", visibility)?;
    println!("episode `{series}/{slug}` status -> {status}, visibility -> {visibility}");
    Ok(())
}

fn episode_rm(content_root: &Path, series: &str, slug: &str) -> Result<(), String> {
    let dir = scaffold::episode_dir(content_root, series, slug).map_err(|e| e.to_string())?;
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    println!("removed episode {}", dir.display());
    Ok(())
}

/// `idea promote <slug> --to blog|project` — scaffold a new Item of the target
/// type, seeded from the idea's slug, and declare the evolution edge in the
/// idea's frontmatter (`02` §一: idea promote auto-creates the relation).
fn idea_promote(content_root: &Path, slug: &str, target: &str) -> Result<(), String> {
    if target != "blog" && target != "project" {
        return Err(format!("`--to` must be blog or project, got `{target}`"));
    }
    let idea_overview = content_root
        .join("resources/ideas")
        .join(slug)
        .join("parts/overview/en.md");
    if !idea_overview.exists() {
        return Err(format!("idea `{slug}` not found"));
    }
    // Scaffold the target Item (its slug mirrors the idea's).
    report_scaffold(scaffold::new_item(content_root, target, slug))?;

    // Declare the evolution edge on the idea: blog `documents` the idea is the
    // canonical direction; `evolved_into` for a project (10 §10.5).
    let (rel, target_uri) = match target {
        "blog" => ("documents", format!("silan://resources/blog/{slug}")),
        _ => ("evolved_into", format!("silan://resources/projects/{slug}")),
    };
    append_relation(&idea_overview, rel, &target_uri)?;
    println!("idea `{slug}` promoted to {target} `{slug}` (relation: {rel})");
    Ok(())
}

/// Append a `relations:` entry to a file's frontmatter (used by `idea
/// promote`). Creates the `relations:` block if absent.
fn append_relation(file: &Path, rel: &str, to_uri: &str) -> Result<(), String> {
    let text = fs::read_to_string(file).map_err(|e| e.to_string())?;
    let mut lines: Vec<String> = text.lines().map(str::to_owned).collect();
    let entry = format!("  - {{ type: {rel}, to: \"{to_uri}\" }}");
    if let Some(idx) = lines.iter().position(|l| l.trim() == "relations:") {
        lines.insert(idx + 1, entry);
    } else {
        let fences: Vec<usize> = lines
            .iter()
            .enumerate()
            .filter(|(_, l)| l.trim() == "---")
            .map(|(i, _)| i)
            .collect();
        match fences.get(1) {
            Some(&close) => {
                lines.insert(close, entry);
                lines.insert(close, "relations:".to_owned());
            }
            None => return Err(format!("{}: no frontmatter block", file.display())),
        }
    }
    fs::write(file, format!("{}\n", lines.join("\n"))).map_err(|e| e.to_string())
}

/// `project progress <slug>` — append a dated progress note to the project's
/// `progress` Part, auto-creating that Part if it does not exist (`07` §7.4).
fn project_progress(content_root: &Path, slug: &str) -> Result<(), String> {
    let progress_dir = content_root
        .join("resources/projects")
        .join(slug)
        .join("parts/progress");
    if !content_root.join("resources/projects").join(slug).exists() {
        return Err(format!("project `{slug}` not found"));
    }
    if !progress_dir.exists() {
        // Auto-create the optional `progress` Part (`02` §一 / `07` §7.4).
        scaffold::add_part(content_root, "project", slug, "progress").map_err(|e| e.to_string())?;
        println!("created progress part for project `{slug}`");
    }
    let en = progress_dir.join("en.md");
    let mut body = fs::read_to_string(&en).unwrap_or_default();
    let stamp = now_date();
    body.push_str(&format!("\n## {stamp}\n\nProgress note — replace this.\n"));
    fs::write(&en, body).map_err(|e| e.to_string())?;
    println!("appended progress entry to {}", en.display());
    Ok(())
}

/// Today's date `YYYY-MM-DD` (UTC).
fn now_date() -> String {
    use time::OffsetDateTime;
    let d = OffsetDateTime::now_utc().date();
    format!("{:04}-{:02}-{:02}", d.year(), u8::from(d.month()), d.day())
}

fn resume_add_lang(content_root: &Path, role: &str, lang: &str) -> Result<(), String> {
    let part_dir = content_root.join("resources/resume/parts").join(role);
    report_scaffold(scaffold::add_lang_at(&part_dir, lang))
}

fn resume_edit(content_root: &Path, role: &str, lang: Option<&str>) -> Result<(), String> {
    let part_dir = content_root.join("resources/resume/parts").join(role);
    if !part_dir.exists() {
        return Err(format!("resume part `{role}` not found"));
    }
    let lang = lang.unwrap_or("en");
    // The extension follows the Part shape (.toml for list shapes).
    for ext in ["md", "toml"] {
        let file = part_dir.join(format!("{lang}.{ext}"));
        if file.exists() {
            println!("{}", file.display());
            return Ok(());
        }
    }
    Err(format!("resume part `{role}` has no `{lang}` file"))
}

fn resume_show(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    let item = scan
        .items()
        .iter()
        .find(|i| i.kind() == ContentKind::Resume)
        .ok_or("resume not found — run `silan init`")?;
    print_item(&ws, item)
}

fn resume_list(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let scan = ws.scan().map_err(|e| e.to_string())?;
    let item = scan
        .items()
        .iter()
        .find(|i| i.kind() == ContentKind::Resume)
        .ok_or("resume not found — run `silan init`")?;
    for part in item.parts() {
        println!("{}\t{:?}", part.role(), part.shape());
    }
    Ok(())
}

fn resume_add_part(content_root: &Path, role: &str) -> Result<(), String> {
    use silan_viking_app::PartShape;

    // The `role` must be one of the resume Parts declared in SCHEMA.md, and
    // its shape (prose / entry_list / key_value_list) comes from there too —
    // the CLI must not guess (`02` §一: role taken from SCHEMA resume.parts).
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let type_spec = ws
        .schema()
        .type_spec(ContentKind::Resume)
        .ok_or("SCHEMA.md has no `resume` type")?;
    let part_spec = type_spec
        .part(role)
        .ok_or_else(|| format!("`{role}` is not a declared resume part in SCHEMA.md"))?;
    let shape = part_spec.shape;

    let part_dir = content_root.join("resources/resume/parts").join(role);
    if part_dir.exists() {
        return Err(format!("resume part `{role}` already exists"));
    }
    fs::create_dir_all(&part_dir).map_err(|e| e.to_string())?;

    // The file extension follows the shape: prose -> .md, the list shapes
    // -> .toml (`01` §1.3.1).
    let (shape_str, ext, seed) = match shape {
        PartShape::Prose => (
            "prose",
            "md",
            format!("## {role}\n\nDraft — replace this.\n"),
        ),
        PartShape::EntryList => (
            "entry_list",
            "toml",
            format!("# {role} entries — one [[entry]] table per item.\n# [[entry]]\n"),
        ),
        PartShape::KeyValueList => (
            "key_value_list",
            "toml",
            format!("# {role} — top-level category keys, each a list.\n"),
        ),
    };
    let meta = part_dir.join("meta.toml");
    fs::write(
        &meta,
        format!("type           = \"{role}\"\nshape          = \"{shape_str}\"\ncanonical_lang = \"en\"\n"),
    )
    .map_err(|e| e.to_string())?;
    let lang_file = part_dir.join(format!("en.{ext}"));
    fs::write(&lang_file, seed).map_err(|e| e.to_string())?;
    println!("created {}", meta.display());
    println!("created {}", lang_file.display());
    Ok(())
}
