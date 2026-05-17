//! `silan-viking` CLI binary — M8 command surface.

mod scaffold;
mod skill;

use rusqlite::{params, Connection, OptionalExtension};
use silan_viking_app::{ContentKind, Identified, ProposalId, Workspace};
use std::env;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// The canonical `content/SCHEMA.md`, embedded so `silan init` writes a
/// schema the engine can actually parse (it needs the fenced ```yaml``` block).
const SCHEMA_TEMPLATE: &str = include_str!("../assets/SCHEMA.md");

fn main() {
    if let Err(err) = run(env::args().skip(1).collect()) {
        eprintln!("error: {err}");
        std::process::exit(1);
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    if args.is_empty() || matches!(args[0].as_str(), "-h" | "--help" | "help") {
        print_help();
        return Ok(());
    }

    let opts = CliOptions::parse(&args)?;
    let command = opts.command.iter().map(String::as_str).collect::<Vec<_>>();
    match command.as_slice() {
        ["init"] => init_content(&opts.content_root),
        ["doctor"] => doctor(&opts.content_root),
        ["config"] => {
            println!("content_root={}", opts.content_root.display());
            println!("db={}", opts.db_path.display());
            Ok(())
        }
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
        ["index", "lint"] | ["index", "rebuild"] => {
            let ws = Workspace::open(&opts.content_root).map_err(|e| e.to_string())?;
            let index = ws.query_index().map_err(|e| e.to_string())?;
            println!(
                "ok documents={} embedder={:?}",
                index.documents().len(),
                index.mode()
            );
            Ok(())
        }
        ["content", "tree"] => content_tree(&opts.content_root),
        ["content", "ls"] => content_ls(&opts.content_root),
        ["content", "show", uri] => content_show(&opts.content_root, uri),
        ["relation", "graph"] => relation_graph(&opts.content_root),
        ["relation", "show", uri] => relation_show(&opts.content_root, uri),
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
            episode_set_status(&opts.content_root, series, slug, "published")
        }
        ["episode", "unpublish", series, slug] => {
            episode_set_status(&opts.content_root, series, slug, "draft")
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
            type_set_field(&opts.content_root, "blog", slug, "status", "published")
        }
        ["blog", "unpublish", slug] => {
            type_set_field(&opts.content_root, "blog", slug, "status", "draft")
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
        [kind, "rm", slug] if parse_kind(kind).is_some() => type_rm(&opts.content_root, kind, slug),

        [kind, "list"] if parse_kind(kind).is_some() => type_list(&opts.content_root, kind),
        [kind, "show", slug] if parse_kind(kind).is_some() => {
            type_show(&opts.content_root, kind, slug)
        }
        ["proposal", "list"] => proposal_list(&opts.content_root),
        ["proposal", "show", id] => proposal_show(&opts.content_root, id),
        ["proposal", "accept", id] => proposal_accept(&opts.content_root, id),
        ["stats", "sync", uri] => stats_sync(&opts.content_root, &opts.db_path, uri),
        ["stats", "show", uri] => stats_show(&opts.db_path, uri),
        ["stats", "visitors", uri] => stats_visitors(&opts.db_path, uri),
        ["stats", "crawlers", uri] => stats_crawlers(&opts.db_path, uri),
        ["stats", "sources", uri] => stats_sources(&opts.db_path, uri),
        ["mcp", "serve", "--stdio"] => mcp_stdio(&opts.content_root, &opts.db_path),
        ["mcp", "serve"] => mcp_handshake(&opts.content_root),
        ["site", "build"] | ["site", "preview"] => site_build(&opts.content_root, &opts.out_dir),
        ["site", "check"] | ["site", "status"] => site_check(&opts.content_root),
        ["site", "promote", live, snapshot, commit] => site_promote(live, snapshot, commit),
        _ => Err(format!("unknown command `{}`", opts.command.join(" "))),
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
        let mut content_root = cwd.join("content");
        let mut db_path = cwd.join("portfolio.db");
        let mut out_dir = cwd.join("_site");
        let mut command = Vec::new();
        let mut i = 0;
        while i < args.len() {
            match args[i].as_str() {
                "--content" => {
                    i += 1;
                    content_root = args
                        .get(i)
                        .ok_or("--content requires a path")?
                        .as_str()
                        .into();
                }
                "--db" => {
                    i += 1;
                    db_path = args.get(i).ok_or("--db requires a path")?.as_str().into();
                }
                "--out" => {
                    i += 1;
                    out_dir = args.get(i).ok_or("--out requires a path")?.as_str().into();
                }
                other => command.push(other.to_owned()),
            }
            i += 1;
        }
        Ok(Self {
            content_root,
            db_path,
            out_dir,
            command,
        })
    }
}

fn print_help() {
    println!(
        "silan-viking {}

Usage:
  silan-viking [--content PATH] [--db PATH] [--out PATH] <command>

Content groups:
  idea|blog|project|update new|list|show|edit|archive|rm <slug>
  idea|blog|project|update add-part <slug> <role>
  idea|blog|project|update add-lang <slug> <lang>
  idea status <slug> <state>     idea promote <slug> --to blog|project
  blog publish|unpublish <slug>  project progress <slug>
  update status <slug> <state>   update set-type <slug> <update-type>
  episode series new|list|show|reorder|archive|rm <series>
  episode new|show|edit|add-lang|publish|unpublish|archive|rm <series> <slug>
  episode list [<series>]
  resume show|list                resume add-part|add-lang|edit <role> [lang]

Tool groups:
  content tree|ls|show <uri>
  index sync|status|lint|rebuild
  relation graph|show <uri>
  site build|preview|check|status [--out PATH]
  site promote <live-db> <snapshot-db> <content-commit>
  stats sync <uri>                 (pull runtime stats from the deployed API)
  stats show|visitors|crawlers|sources <uri>   (query the local stats cache)
  proposal list|show|accept
  mcp serve --stdio
  skill emit|status|rm [--path <dir>]   (default ~/.claude/skills/silan-viking)
  init|config|doctor",
        env!("CARGO_PKG_VERSION")
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
         # host         = \"example.com\"\n\
         # user         = \"deploy\"\n\
         # ssh_key_path = \"~/.ssh/silan_deploy_ed25519\"  # path only, never the key\n\
         # remote_dir   = \"/srv/silan-viking\"\n\
         # compose_file = \"deploy/docker-compose.yml\"\n"
    )
}

/// `silan init` — lay down a runnable project: `content/SCHEMA.md` (the real
/// embedded schema), the `silan-viking.toml` config, the `agent/` tree, and
/// the single `resume` Item seeded from `[identity]`.
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

    // The single resume Item — every project has exactly one (`02` §一).
    let resume_dir = content_root.join("resources/resume");
    if !resume_dir.exists() {
        scaffold::new_resume(content_root, "Example User", "AI Researcher / Engineer")
            .map_err(|e| e.to_string())?;
    }

    println!("initialized {}", content_root.display());
    println!("  schema  {}", schema.display());
    println!("  config  {}", config.display());
    println!("  resume  {}", resume_dir.display());
    Ok(())
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

fn content_tree(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    for item in ws.scan().map_err(|e| e.to_string())?.items() {
        println!("{} {}", item.kind(), item.uri());
        for part in item.parts() {
            println!("  part {}", part.role());
        }
    }
    Ok(())
}

fn content_ls(content_root: &Path) -> Result<(), String> {
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    for item in ws.scan().map_err(|e| e.to_string())?.items() {
        println!("{}", item.uri());
    }
    Ok(())
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

fn type_list(content_root: &Path, kind: &str) -> Result<(), String> {
    let kind = parse_kind(kind).ok_or("unknown kind")?;
    let ws = Workspace::open(content_root).map_err(|e| e.to_string())?;
    let index = ws.query_index().map_err(|e| e.to_string())?;
    for doc in index.list(Some(kind), None) {
        println!(
            "{}\t{}\t{}",
            doc.slug,
            doc.status.unwrap_or_default(),
            doc.title
        );
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

fn mcp_handshake(content_root: &Path) -> Result<(), String> {
    // `silan mcp serve` without a stdio transport: print the §8.6 handshake
    // so an operator can confirm the tool surface and SCHEMA the agent sees.
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
    for tool in silan_viking_mcp::tool_specs() {
        println!("tool={}\t{:?}", tool.name, tool.tier);
    }
    Ok(())
}

/// `silan mcp serve --stdio` — run the real JSON-RPC MCP server over stdio
/// (`03` §3.2, `08` §8.6). An MCP host drives it; the loop ends at EOF.
fn mcp_stdio(content_root: &Path, db_path: &Path) -> Result<(), String> {
    let server = silan_viking_mcp::McpServer::new(content_root, db_path, "silan-viking");
    server
        .serve(io::stdin().lock(), io::stdout().lock())
        .map_err(|e| e.to_string())
}

fn site_build(content_root: &Path, out_dir: &Path) -> Result<(), String> {
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

fn type_rm(content_root: &Path, kind: &str, slug: &str) -> Result<(), String> {
    let type_dir = scaffold::type_dir_name(kind).map_err(|e| e.to_string())?;
    let dir = content_root.join("resources").join(type_dir).join(slug);
    if !dir.exists() {
        return Err(format!("{kind} `{slug}` not found"));
    }
    fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    println!("removed {}", dir.display());
    Ok(())
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
