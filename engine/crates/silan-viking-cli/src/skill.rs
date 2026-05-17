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
         | finding whether a topic was written about | `recall(query)` — semantic search |\n\
         | voicing a half-formed thought | `capture(note, type)` — open a proposal, do not commit |\n\
         | wanting to think an idea through, write it up | `recall` for related Items first, then `propose` |\n\
         | wanting to push a project / idea forward | `propose` anchored to the right Part (e.g. progress) |\n\
         | asking \"how many people read this\" | `stats` / `visitors` / `crawler_breakdown` / `source_breakdown` |\n\
         | asking you to remember something about him / the project | `ctx_write` to `silan://agent/` — written directly, no proposal |\n\
         | ending the session | `reflect(session)` — settle it into agent memory |\n\
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
    Ok(())
}

/// `silan skill status` — report whether the installed package matches what
/// `emit` would produce now (`13` §13.7: re-render and compare). A mismatch
/// means the project changed since `emit`; re-run it.
pub fn status(content_root: &Path, dir: &Path) -> Result<(), String> {
    let skill_md = dir.join("SKILL.md");
    if !skill_md.exists() {
        println!("not installed: {} is absent", dir.display());
        println!("run `silan skill emit` to install");
        return Ok(());
    }
    let installed = fs::read_to_string(&skill_md).map_err(|e| e.to_string())?;
    let fresh = render_skill_md(content_root);
    if installed == fresh {
        println!("up to date: {}", dir.display());
    } else {
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
