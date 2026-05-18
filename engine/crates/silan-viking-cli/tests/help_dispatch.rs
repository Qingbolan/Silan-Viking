//! Help / dispatch-error integration tests — drive the built
//! `silan-viking` binary and pin the three concise help behaviors:
//! bare multi-verb command, mistyped subcommand, genuinely unknown
//! command, plus the per-command `--help` path and the unchanged
//! top-level banner.

use std::path::PathBuf;
use std::process::Command;

/// The CLI binary cargo built for this test.
fn bin() -> &'static str {
    env!("CARGO_BIN_EXE_silan-viking")
}

/// A fresh empty temp dir, used as cwd so no real content project
/// interferes — the error/help paths fail at dispatch before touching
/// the filesystem, and an empty cwd proves it.
fn empty_cwd() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "silan-cli-helpdispatch-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos()
    ));
    std::fs::create_dir_all(&dir).expect("mkdir temp cwd");
    dir
}

/// Run the CLI in a fresh empty cwd, returning (exit code, stdout, stderr).
fn run(args: &[&str]) -> (i32, String, String) {
    let dir = empty_cwd();
    let out = Command::new(bin())
        .args(args)
        .current_dir(&dir)
        .output()
        .expect("cli runs");
    let _ = std::fs::remove_dir_all(&dir);
    (
        out.status.code().expect("cli exits with a code"),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}

/// A substring that only ever appears in the full top-level banner — the
/// tagline rendered by `banner::write_tagline`. Concise error/help output
/// must never contain it.
const BANNER_TAGLINE: &str = "The content engine for Silan's personal website";

#[test]
fn bare_multi_verb_command_lists_verbs_on_stderr() {
    // Behavior 1: `silan-viking stats` with no subcommand.
    let (code, stdout, stderr) = run(&["stats"]);
    assert_eq!(code, 1, "bare `stats` must exit 1");
    assert!(
        stderr.contains("`stats` needs a subcommand. Usage:"),
        "stderr must explain the missing subcommand: {stderr}"
    );
    assert!(
        stderr.contains("silan-viking stats sync <uri>"),
        "stderr must list the `stats` verb usage lines: {stderr}"
    );
    assert!(
        stdout.is_empty(),
        "concise error must not write to stdout: {stdout}"
    );
    assert!(
        !stderr.contains(BANNER_TAGLINE) && !stdout.contains(BANNER_TAGLINE),
        "concise error must not print the full banner"
    );
}

#[test]
fn mistyped_subcommand_lists_verbs_on_stderr() {
    // Behavior 2: `silan-viking stats foo` — known command, bad verb.
    let (code, stdout, stderr) = run(&["stats", "foo"]);
    assert_eq!(code, 1, "mistyped `stats foo` must exit 1");
    assert!(
        stderr.contains("unknown `stats` subcommand `foo`. Usage:"),
        "stderr must name the unknown subcommand: {stderr}"
    );
    assert!(
        stderr.contains("silan-viking stats show|visitors|crawlers|sources <uri>"),
        "stderr must list the `stats` verb usage lines: {stderr}"
    );
    assert!(
        stdout.is_empty(),
        "concise error must not write to stdout: {stdout}"
    );
    assert!(
        !stderr.contains(BANNER_TAGLINE) && !stdout.contains(BANNER_TAGLINE),
        "concise error must not print the full banner"
    );
}

#[test]
fn unknown_command_reports_concise_error_on_stderr() {
    // Behavior 3: `silan-viking frobnicate` — not a known command at all.
    let (code, stdout, stderr) = run(&["frobnicate"]);
    assert_eq!(code, 1, "unknown command must exit 1");
    assert!(
        stderr.contains(
            "unknown command `frobnicate` · run 'silan-viking --help' for the command list"
        ),
        "stderr must give the concise unknown-command error: {stderr}"
    );
    assert!(
        stdout.is_empty(),
        "concise error must not write to stdout: {stdout}"
    );
    assert!(
        !stderr.contains(BANNER_TAGLINE) && !stdout.contains(BANNER_TAGLINE),
        "concise error must not print the full banner"
    );
}

#[test]
fn command_help_writes_verbs_to_stdout() {
    // Behavior 4: `silan-viking stats --help` (and `-h`) — intentional
    // help goes to STDOUT and exits 0, distinguishing it from the error
    // path which goes to stderr.
    for flag in ["--help", "-h"] {
        let (code, stdout, stderr) = run(&["stats", flag]);
        assert_eq!(code, 0, "`stats {flag}` must exit 0");
        assert!(
            stdout.contains("silan-viking stats — verbs:"),
            "`stats {flag}` must write the verbs header to stdout: {stdout}"
        );
        assert!(
            stdout.contains("silan-viking stats sync <uri>"),
            "`stats {flag}` must list the `stats` verb usage lines: {stdout}"
        );
        assert!(
            stderr.is_empty(),
            "intentional help must not write to stderr: {stderr}"
        );
        assert!(
            !stdout.contains(BANNER_TAGLINE),
            "command-specific help must not print the full banner"
        );
    }
}

#[test]
fn top_level_help_still_prints_full_banner() {
    // Behavior 5: `silan-viking --help` and bare `silan-viking` keep the
    // full ASCII-art banner and exit 0.
    for args in [vec!["--help"], vec![]] {
        let (code, stdout, stderr) = run(&args);
        assert_eq!(code, 0, "top-level help ({args:?}) must exit 0");
        assert!(
            stdout.contains(BANNER_TAGLINE),
            "top-level help ({args:?}) must print the full banner: {stdout}"
        );
        assert!(
            stdout.contains("Usage:") && stdout.contains("Commands:"),
            "top-level help ({args:?}) must list usage and commands: {stdout}"
        );
        assert!(
            stderr.is_empty(),
            "top-level help ({args:?}) must not write to stderr: {stderr}"
        );
    }
}

#[test]
fn valid_command_dispatches_normally() {
    // Behavior 6: a valid command dispatches past the help/error gate.
    // With no content project in the fresh cwd it will fail, but it must
    // fail in the command's own logic — not with a dispatch-level
    // "needs a subcommand" / "unknown command" message.
    let (code, _stdout, stderr) = run(&["idea", "list"]);
    assert_ne!(code, 0, "`idea list` with no project should fail");
    assert!(
        !stderr.contains("needs a subcommand")
            && !stderr.contains("unknown `idea` subcommand")
            && !stderr.contains("unknown command `idea"),
        "`idea list` must reach the command, not the dispatch-error path: {stderr}"
    );
}
