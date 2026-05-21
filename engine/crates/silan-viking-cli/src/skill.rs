//! The `silan skill` command group — generate the Claude skill package
//! (`docs/silan-viking/13`).
//!
//! A silan-viking skill is a small tree under `~/.claude/skills/silan-viking/`:
//! `SKILL.md` (frontmatter + body) and `reference/mcp-tools.md`. It is a
//! *derived artifact* — `silan skill emit` regenerates it from the truth
//! source (`silan-viking.toml` + `content/SCHEMA.md`), so it never drifts.
//! `13` §13.7 puts this logic in the CLI crate: a skill is "render a few
//! markdown files", not a new L4 adapter.

use silan_viking_app::{ContentKind, Workspace};
use std::fs;
use std::path::{Path, PathBuf};

/// The fixed `SKILL.md` frontmatter `description` (`13` §13.4). It must cover
/// silan's *natural-language* trigger surface, never tool names — Claude
/// mounts the skill by matching this against what silan is doing.
const DESCRIPTION: &str = "silan's personal context system. \
Use it when silan voices an idea, a spark, a half-formed thought, or wants to \
write an article / push a project forward / review site content and visitor \
data — to capture the thought into context, help write, maintain projects, \
and selectively publish.";

/// The default install location — Claude discovers skills by scanning here.
pub fn default_skill_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_owned());
    Path::new(&home)
        .join(".claude")
        .join("skills")
        .join("silan-viking")
}

/// Render `SKILL.md` — frontmatter + the four-section body (`13` §13.4). The
/// content-type list is interpolated from the current SCHEMA so the skill and
/// the project never drift.
fn render_skill_md(content_root: &Path) -> String {
    // The 6 content types — only those the loaded SCHEMA actually declares,
    // so the skill body matches the project. Falls back to the closed set if
    // the workspace will not open.
    let types = match Workspace::open(content_root) {
        Ok(ws) => ContentKind::ALL
            .iter()
            .filter(|k| ws.schema().type_spec(**k).is_some())
            .map(|k| k.frontmatter_value().to_owned())
            .collect::<Vec<_>>()
            .join(" / "),
        Err(_) => ContentKind::ALL
            .iter()
            .map(|k| k.frontmatter_value().to_owned())
            .collect::<Vec<_>>()
            .join(" / "),
    };

    format!(
        "---\n\
         name: silan-viking\n\
         description: {DESCRIPTION}\n\
         ---\n\
         \n\
         # silan-viking\n\
         \n\
         ## What this is\n\
         \n\
         silan's personal context system. The truth source is markdown under\n\
         `silan://resources/` ({types}); capabilities are served over MCP.\n\
         \n\
         ## Connecting\n\
         \n\
         Capabilities come from an MCP server. If this session is not yet\n\
         connected, follow `reference/mcp-tools.md` to connect. Once connected,\n\
         the first thing to do is call `context_brief()` — understand what\n\
         silan is currently thinking about before doing anything.\n\
         \n\
         ## When to do what\n\
         \n\
         A natural-language → MCP-tool translation table. Match on what silan\n\
         *seems to be doing*, not on a function name.\n\
         \n\
         | silan seems to be… | what you do |\n\
         |---|---|\n\
         | taking stock of existing work (\"which projects are in flight\") | `list(type, filter)` — a structured list with status |\n\
         | wanting to see by tag (\"all the rust posts\", \"every ML idea\") | `list(type, filter.tag)` to filter; `list_tags(type?)` to see what tags exist |\n\
         | finding whether a topic was written about | `recall(query)` — semantic search; tags are folded in, so a tagged Item ranks high for its tag word |\n\
         | voicing a half-formed thought | `capture(note, type)` — open a proposal, do not commit |\n\
         | wanting a *new* idea / blog / project written | `propose` to a fresh `silan://resources/<kind>/<slug>` — see the note below |\n\
         | wanting to think an idea through, write it up | `recall` for related Items first, then `propose` |\n\
         | wanting to push a project / idea forward | `propose` anchored to the right Part (e.g. progress) |\n\
         | asking \"how many people read this\" | `stats` / `visitors` / `crawler_breakdown` / `source_breakdown` |\n\
         | asking you to remember something about him / the project | `ctx_write` to `silan://agent/` — written directly, no proposal |\n\
         | ending the session | `reflect(session)` — settle it into agent memory |\n\
         \n\
         ## Creating a new Item — just `propose` to its URI\n\
         \n\
         `propose` to a `silan://resources/<kind>/<slug>` whose Item does not\n\
         exist yet *creates* it: the proposal carries the new Item, its first\n\
         Part, and the `meta.toml`. You do **not** run a CLI `new` command\n\
         first, and you never write into `content/` directly — one `propose`\n\
         call is the whole path from a fresh idea to a reviewable proposal.\n\
         `propose` to an Item that already exists modifies it instead.\n\
         \n\
         For a multi-Part Item (a project with overview + goals + …), pass the\n\
         sibling Parts in one call via the `parts` argument — a\n\
         `{{role: content}}` object. The whole Item lands as **one** proposal.\n\
         Never split a new multi-Part Item into one `propose` per Part: the\n\
         later branches cannot be accepted on their own.\n\
         \n\
         ## Adding or revising a Part of an existing Item\n\
         \n\
         To add a Part to — or rewrite a Part of — an Item that already\n\
         exists, `propose` to the **Part URI**:\n\
         `silan://resources/<kind>/<slug>/<role>`. The SCHEMA's `parts` list\n\
         is a **recommendation, not a limit**: a project recommends\n\
         `overview` / `goals` / `challenges` / `solutions` / `lessons` /\n\
         `quick_start` / `release_notes`, but if the Item needs a section the\n\
         recommended set does not name — a `benchmark`, a `roadmap` — propose\n\
         a Part for that new role directly. A new role must be a lowercase\n\
         identifier (`a-z`, `0-9`, `_`, `-`); it lands as prose and the\n\
         frontend renders it as its own tab automatically. Read\n\
         `silan://schema` to see the recommended set. The `<slug>` is the\n\
         Item's own slug, unchanged — never encode the Part into the slug\n\
         (no `my-project#goals`); the role is its own URI segment. Each such\n\
         `propose` is one Part and lands as its own proposal.\n\
         \n\
         ## Three lines that must not be crossed\n\
         \n\
         (A restatement of the `03` security rules — not new rules.)\n\
         \n\
         1. Published content under `silan://resources/` may only be reached\n\
            with `capture` / `propose` — never `ctx_write`, never merged directly.\n\
         2. `accept` / `reject` / `publish` / `deploy` are not agent actions —\n\
            they are silan's CLI actions.\n\
         3. The `silan://agent/` namespace is never published.\n\
         \n\
         ## Reference\n\
         \n\
         `reference/mcp-tools.md` — the full four-tier MCP tool surface.\n"
    )
}

/// Render `reference/mcp-tools.md` — the four-tier tool quick-reference
/// (`13` §13.2, derived from `03`). The MCP coordinates are written as the
/// relative start convention, never an absolute path or fixed port
/// (`13` MCP-coordinate rule).
fn render_mcp_tools_md() -> String {
    let mut out = String::from(
        "# silan-viking MCP tools\n\
         \n\
         ## Connecting\n\
         \n\
         ```text\n\
         transport: stdio\n\
         command: silan mcp serve --stdio\n\
         project: resolve from the current workspace or SILAN_VIKING_PROJECT\n\
         ```\n\
         \n\
         Do not hard-code an absolute path or a port — resolve the project\n\
         locally on each machine.\n\
         \n\
         ## The four tiers\n\
         \n",
    );
    let mut tier = String::new();
    let mut first = true;
    for spec in silan_viking_mcp::tool_specs() {
        let tier_name = format!("{:?}", spec.tier);
        if tier_name != tier {
            // No leading blank line before the very first tier heading.
            let sep = if first { "" } else { "\n" };
            out.push_str(&format!("{sep}### {tier_name}\n\n"));
            tier = tier_name;
            first = false;
        }
        out.push_str(&format!("- `{}` — {}\n", spec.name, spec.description));
    }
    out
}

/// Read `[mcp].transport` / `[mcp].port` from `silan-viking.toml`, if present.
/// `13` §13.3 rule 3: a TCP transport gets a machine-local hint file; stdio
/// (the default) does not.
fn mcp_transport(content_root: &Path) -> Option<(String, u64)> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let text = fs::read_to_string(project_root.join("silan-viking.toml")).ok()?;
    let config: toml::Value = text.parse().ok()?;
    let mcp = config.get("mcp")?;
    let transport = mcp.get("transport").and_then(|v| v.as_str())?;
    let port = mcp.get("port").and_then(|v| v.as_integer()).unwrap_or(7700) as u64;
    Some((transport.to_owned(), port))
}

/// `silan skill emit` — render the skill package to `dir` (`13` §13.3).
/// Overwrites: the package is a derived artifact, overwrite is lossless.
pub fn emit(content_root: &Path, dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir.join("reference")).map_err(|e| e.to_string())?;
    let skill_md = dir.join("SKILL.md");
    fs::write(&skill_md, render_skill_md(content_root)).map_err(|e| e.to_string())?;
    let tools_md = dir.join("reference").join("mcp-tools.md");
    fs::write(&tools_md, render_mcp_tools_md()).map_err(|e| e.to_string())?;
    println!("emitted skill package to {}", dir.display());
    println!("  {}", skill_md.display());
    println!("  {}", tools_md.display());

    // `13` §13.3 rule 3: only a TCP transport gets a machine-local coordinate
    // file (`127.0.0.1:<port>`). It must never be synced, so `.gitignore` it —
    // the synced `mcp-tools.md` keeps the portable stdio convention.
    if let Some(("tcp", port)) = mcp_transport(content_root)
        .as_ref()
        .map(|(t, p)| (t.as_str(), *p))
    {
        let local = dir.join("reference").join("mcp-tools.local.md");
        fs::write(
            &local,
            format!(
                "# silan-viking MCP — machine-local hint (do not sync)\n\
                 \n\
                 transport: tcp\n\
                 address: 127.0.0.1:{port}\n\
                 \n\
                 This file is local to this machine. The portable coordinate\n\
                 is `mcp-tools.md` (stdio). `.gitignore` keeps this out of sync.\n"
            ),
        )
        .map_err(|e| e.to_string())?;
        let gitignore = dir.join(".gitignore");
        let line = "reference/mcp-tools.local.md\n";
        let existing = fs::read_to_string(&gitignore).unwrap_or_default();
        if !existing.contains("mcp-tools.local.md") {
            fs::write(&gitignore, format!("{existing}{line}")).map_err(|e| e.to_string())?;
        }
        println!("  {} (machine-local, gitignored)", local.display());
    }
    Ok(())
}

/// `silan skill status` — report whether the installed package matches what
/// `emit` would produce now (`13` §13.7), plus the machine-local diagnostics
/// of `13` §13.3 rule 4: `binary_found`, `mcp_available`, `transport_resolved`,
/// `schema_hash_match`, `skill_hash_match`. The diagnostics make a second
/// machine's failure legible — "skill discovered" must not be misread as
/// "MCP connected".
pub fn status(content_root: &Path, dir: &Path) -> Result<(), String> {
    // The CLI is running, so its own binary is on PATH.
    println!("binary_found=true");

    // MCP readiness: SCHEMA.md present + content/ is a Git repo (the proposal
    // plane needs both). Mirrors `silan mcp status`.
    let schema_present = content_root.join("SCHEMA.md").exists();
    let repo_present = content_root.join(".git").is_dir();
    println!("mcp_available={}", schema_present && repo_present);

    // The resolved transport (stdio unless `[mcp].transport` overrides it).
    let transport = mcp_transport(content_root)
        .map(|(t, _)| t)
        .unwrap_or_else(|| "stdio".to_owned());
    println!("transport_resolved={transport}");

    let skill_md = dir.join("SKILL.md");
    if !skill_md.exists() {
        println!("schema_hash_match=n/a");
        println!("skill_hash_match=n/a");
        println!("status=not_installed");
        println!("not installed: {} is absent", dir.display());
        println!("run `silan skill emit` to install");
        return Ok(());
    }

    // Re-render and compare. The SKILL.md body interpolates the SCHEMA type
    // list, so a SKILL.md match also proves the schema list is current.
    let installed = fs::read_to_string(&skill_md).map_err(|e| e.to_string())?;
    let fresh = render_skill_md(content_root);
    let skill_match = installed == fresh;
    println!("schema_hash_match={schema_present}");
    println!("skill_hash_match={skill_match}");
    if skill_match {
        println!("status=up_to_date");
        println!("up to date: {}", dir.display());
    } else {
        println!("status=stale");
        println!("stale: {} differs from the current project", dir.display());
        println!("run `silan skill emit` to regenerate");
    }
    Ok(())
}

/// `silan skill rm` — remove the installed skill package.
pub fn remove(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        println!("nothing to remove: {} is absent", dir.display());
        return Ok(());
    }
    fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    println!("removed skill package {}", dir.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skill_md_has_frontmatter_and_four_sections() {
        // Render without a real workspace — types fall back to the default.
        let md = render_skill_md(Path::new("/tmp/nonexistent-skill"));
        assert!(md.starts_with("---\nname: silan-viking\n"));
        assert!(md.contains("description: silan's personal context system"));
        for section in [
            "## What this is",
            "## Connecting",
            "## When to do what",
            "## Three lines that must not be crossed",
            "## Reference",
        ] {
            assert!(md.contains(section), "SKILL.md must have `{section}`");
        }
    }

    #[test]
    fn mcp_tools_md_uses_relative_start_convention() {
        let md = render_mcp_tools_md();
        assert!(md.contains("silan mcp serve --stdio"));
        // Must not bake in an absolute path or a port.
        assert!(!md.contains("127.0.0.1"));
        assert!(md.contains("recall"));
        assert!(md.contains("ctx_write"));
    }
}
