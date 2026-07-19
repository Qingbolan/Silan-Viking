// silan-viking CLI — top-level `--help` banner
// =============================================
//
// File: src/banner.rs
// Description: Renders the ASCII wordmark + creator signature + live
//              project-status block printed above the grouped command
//              listing when the user types `silan-viking`,
//              `silan-viking --help`, `silan-viking -h`, or
//              `silan-viking help`. Subcommand help does NOT show the
//              banner — it would be noise.
//
// This module is aligned, deliberately, with EasyNet-Cli's
// `src/facade/cli/banner.rs` so the two CLIs read as one product
// family. Same design constraints carry over:
//
// Design constraints
// ------------------
// 1. Side-effect-free: only local file reads (project config, DB
//    `stat`). No network I/O — `--help` must stay fast offline.
// 2. Restrained NUS palette. NUS Blue (#003D7C) owns structure and
//    identity; NUS Orange (#EF7C00) owns actions and attention. Supporting
//    text remains terminal-native dim so contrast follows the user's theme.
// 3. Two-column layout. Every label is left-padded to `LABEL_WIDTH`
//    so values line up under one another regardless of label length.
// 4. Honour `NO_COLOR` / `CLICOLOR_FORCE` / TTY detection.
//
// Author: Silan Hu <silan.hu@u.nus.edu>
// Copyright (c) 2026 Silan Hu. All rights reserved.

use std::io::IsTerminal;
use std::path::Path;

/// Width of the status-block label column ("Project:", "Content:",
/// "Database:"). The longest label fits with one trailing space
/// before the value column; shorter labels are padded to match.
const LABEL_WIDTH: usize = 14;

/// Outer left margin for the whole banner. Empty — wordmark, tagline,
/// signature, and status rows all sit flush at column 0 so the banner
/// reads as a header rather than a child of the indented command block.
const MARGIN: &str = "";

/// Top-level decoration block printed before the grouped command
/// listing. Returns a single string ready to write to stdout.
///
/// Layout (top to bottom):
///   1. ASCII wordmark   — six-line block letters (single bold cyan)
///   2. Tagline + signature
///   3. Status rows      — Project / Content / Database
pub fn render_top_level_banner(content_root: &Path) -> String {
    let style = ColourMode::detect();
    let mut buf = String::new();
    write_logo(&mut buf, style);
    write_tagline(&mut buf, style);
    write_project_status(&mut buf, style, content_root);
    buf.push('\n');
    buf
}

/// Detect the active colour mode for the current process. Exposed so
/// the grouped command listing in `main.rs::print_help` paints its
/// hand-rendered block with the same palette as the banner.
pub fn colour_mode() -> ColourMode {
    ColourMode::detect()
}

// ── ANSI colour control ──────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ColourMode {
    On,
    Off,
}

impl ColourMode {
    /// Standard precedence: `NO_COLOR` (any value) wins absolute.
    /// Then `CLICOLOR_FORCE` forces on. Otherwise on iff stdout is a
    /// TTY. Same logic anstream/anstyle use.
    fn detect() -> Self {
        if std::env::var_os("NO_COLOR").is_some() {
            return Self::Off;
        }
        if std::env::var_os("CLICOLOR_FORCE")
            .map(|v| v != "0")
            .unwrap_or(false)
        {
            return Self::On;
        }
        if std::io::stdout().is_terminal() {
            Self::On
        } else {
            Self::Off
        }
    }

    /// Wrap `text` in `style` only when colour is on. `style` is an SGR
    /// parameter list and may use true-colour RGB.
    pub fn paint(self, style: &str, text: &str) -> String {
        match self {
            Self::On => format!("\x1b[{style}m{text}\x1b[0m"),
            Self::Off => text.to_string(),
        }
    }
}

/// NUS corporate palette for terminal UI. RGB values follow the official
/// identity guide: Blue #003D7C and Orange #EF7C00.
pub mod sgr {
    /// NUS Blue — identity, hierarchy, labels, and section headers.
    pub const ACCENT: &str = "1;38;2;0;61;124";
    /// NUS Orange — commands, actions, and the product wordmark.
    pub const ACTION: &str = "1;38;2;239;124;0";
    /// Dim default — secondary text (tagline, signature, hints).
    pub const DIM: &str = "2";
    /// Ready / healthy uses NUS Blue rather than introducing a third hue.
    pub const OK: &str = ACCENT;
    /// Warnings and incomplete states use NUS Orange.
    pub const WARN: &str = ACTION;
}

// ── Logo ─────────────────────────────────────────────────────────────

/// Six-line ASCII wordmark "SILAN", painted in one shade of bold
/// cyan. Single colour by intent: a CLI banner is a navigation
/// surface, not fireworks.
fn write_logo(buf: &mut String, style: ColourMode) {
    const LOGO_LINES: [&str; 6] = [
        "███████╗██╗██╗      █████╗ ███╗   ██╗",
        "██╔════╝██║██║     ██╔══██╗████╗  ██║",
        "███████╗██║██║     ███████║██╔██╗ ██║",
        "╚════██║██║██║     ██╔══██║██║╚██╗██║",
        "███████║██║███████╗██║  ██║██║ ╚████║",
        "╚══════╝╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝",
    ];
    for line in LOGO_LINES {
        buf.push_str(MARGIN);
        buf.push_str(&style.paint(sgr::ACCENT, line));
        buf.push('\n');
    }
    buf.push('\n');
}

// ── Tagline ──────────────────────────────────────────────────────────

/// Wordmark + tagline + signature. Three lines at the shared `MARGIN`
/// indent so the banner reads as one block. ASCII `--` rather than an
/// em dash so the banner stays pure ASCII across every terminal.
fn write_tagline(buf: &mut String, style: ColourMode) {
    const WORDMARK: &str = "silan";
    const TAGLINE: &str = "The content engine for Silan's personal website";
    const SIGNATURE: &str = "-- Silan Hu · aliases: svk · silan-viking";

    buf.push_str(MARGIN);
    buf.push_str(&style.paint(sgr::ACTION, WORDMARK));
    buf.push_str("  ");
    buf.push_str(&style.paint(sgr::DIM, TAGLINE));
    buf.push('\n');
    buf.push_str(MARGIN);
    buf.push_str(&style.paint(sgr::DIM, SIGNATURE));
    buf.push_str("\n\n");
}

// ── Project status ───────────────────────────────────────────────────

/// Live block: is the content root an initialised silan-viking
/// project, where does its content live, and is the deploy DB built.
/// Two-column layout — labels padded to `LABEL_WIDTH`, values follow.
fn write_project_status(buf: &mut String, style: ColourMode, content_root: &Path) {
    let project_root = content_root.parent().unwrap_or(content_root);
    let config_path = project_root.join("silan-viking.toml");
    let schema_path = content_root.join("SCHEMA.md");
    let initialised = config_path.exists() && schema_path.exists();

    // Row 1 — project initialisation state.
    let (dot_sgr, dot, project_text) = if initialised {
        (sgr::OK, "●", "initialised".to_string())
    } else {
        (
            sgr::WARN,
            "○",
            "not initialised  ·  run 'silan init'".to_string(),
        )
    };
    write_row(
        buf,
        style,
        "Project:",
        &format!(
            "{} {}",
            style.paint(dot_sgr, dot),
            style.paint(
                if initialised { sgr::ACCENT } else { sgr::DIM },
                &project_text
            ),
        ),
    );

    // Row 2 — content root.
    write_row(
        buf,
        style,
        "Content:",
        &style.paint(sgr::DIM, &content_root.display().to_string()),
    );

    // Row 3 — database. Resolved from the project config when the
    // project is initialised; shown as "(set by silan-viking.toml)"
    // otherwise. We report whether the file exists and its size, so
    // a stale or empty DB is visible at a glance.
    let db_value = match resolve_db_path(content_root) {
        Some(path) => {
            let label = path.display().to_string();
            match std::fs::metadata(&path) {
                Ok(meta) if meta.len() > 0 => format!(
                    "{}  {}",
                    label,
                    style.paint(sgr::OK, &format!("({} KiB)", meta.len() / 1024)),
                ),
                Ok(_) => format!("{}  {}", label, style.paint(sgr::WARN, "(empty)")),
                Err(_) => format!(
                    "{}  {}",
                    label,
                    style.paint(sgr::WARN, "(not built — run 'silan index sync')"),
                ),
            }
        }
        None => "(set by silan-viking.toml [database].path)".to_string(),
    };
    write_row(buf, style, "Database:", &style.paint(sgr::DIM, &db_value));
}

/// Print a `label  value` row with the label painted accent and
/// padded to `LABEL_WIDTH` so all rows line up under one another.
fn write_row(buf: &mut String, style: ColourMode, label: &str, value: &str) {
    let padded = format!("{label:<LABEL_WIDTH$}");
    buf.push_str(MARGIN);
    buf.push_str(&style.paint(sgr::ACCENT, &padded));
    buf.push(' ');
    buf.push_str(value);
    buf.push('\n');
}

/// Resolve the deploy DB path from `silan-viking.toml`'s
/// `[database].path`, relative to the project root. Returns `None`
/// when the config is missing or unparseable — the banner must never
/// panic.
fn resolve_db_path(content_root: &Path) -> Option<std::path::PathBuf> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let config: toml::Value = std::fs::read_to_string(project_root.join("silan-viking.toml"))
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Force colour off and render. Used by every test so the
    /// asserted output is plain ASCII-with-newlines.
    fn render_plain(content_root: &Path) -> String {
        unsafe {
            std::env::set_var("NO_COLOR", "1");
        }
        render_top_level_banner(content_root)
    }

    #[test]
    fn render_never_panics_in_clean_environment() {
        // The banner must produce something sensible even when the
        // user has never run silan-viking before — no config, no DB.
        let out = render_plain(Path::new("/nonexistent/content"));
        assert!(out.contains("silan-viking"), "wordmark missing");
        assert!(out.contains("Silan Hu"), "signature missing");
        assert!(out.contains("Project:"), "project status missing");
        assert!(out.contains("Content:"), "content status missing");
        assert!(out.contains("Database:"), "database status missing");
    }

    #[test]
    fn uninitialised_project_shows_init_hint() {
        let out = render_plain(Path::new("/nonexistent/content"));
        assert!(
            out.contains("not initialised"),
            "uninitialised project should hint at 'silan init'"
        );
    }

    #[test]
    fn no_color_strips_ansi() {
        let out = render_plain(Path::new("/nonexistent/content"));
        assert!(!out.contains('\x1b'), "ANSI escape leaked despite NO_COLOR");
    }

    #[test]
    fn nus_palette_uses_official_rgb_values() {
        assert_eq!(sgr::ACCENT, "1;38;2;0;61;124");
        assert_eq!(sgr::ACTION, "1;38;2;239;124;0");
        assert_eq!(
            ColourMode::On.paint(sgr::ACCENT, "NUS"),
            "\u{1b}[1;38;2;0;61;124mNUS\u{1b}[0m"
        );
    }

    #[test]
    fn banner_contains_no_cjk() {
        // Pin the contract that the banner stays non-CJK. Common
        // Unicode status glyphs (`●`, `○`, `·`) are allowed.
        let out = render_plain(Path::new("/nonexistent/content"));
        for (i, ch) in out.char_indices() {
            let cp = ch as u32;
            let is_cjk = (0x4E00..=0x9FFF).contains(&cp)
                || (0xFF00..=0xFFEF).contains(&cp)
                || (0x3000..=0x303F).contains(&cp)
                || (0x3040..=0x309F).contains(&cp)
                || (0x30A0..=0x30FF).contains(&cp)
                || (0xAC00..=0xD7AF).contains(&cp);
            assert!(
                !is_cjk,
                "CJK character {ch:?} (U+{cp:04X}) at byte {i} in banner",
            );
        }
    }
}
