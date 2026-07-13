# silan Python command shim

The Python package preserves the installed `silan` and `silan-db-tools`
command names. It does not contain content-management or database logic.
Both entry points replace the Python process with the Rust `silan-viking`
binary and forward all arguments, exit codes, signals, stdin, and stdout.

The current implementation is intentionally small:

```text
silan-personal-website/silan/silan.py
  -> resolve silan-viking on PATH
  -> os.execv(silan-viking, original arguments)
```

## Install the engine

```bash
cd engine
cargo install --path crates/silan-viking-cli
```

The Python shim also checks `~/.local/bin`, `~/.cargo/bin`,
`/usr/local/bin`, and `/opt/homebrew/bin` when the binary is not on `PATH`.

## Content workflow

`content/` Markdown and TOML files are the only authored source. The Rust
engine validates those files and projects them into SQLite:

```bash
silan index sync
```

Do not edit projected SQLite content rows directly. A later sync is allowed
to rebuild them from `content/`.

## Desktop editor

From the project root:

```bash
silan desktop
```

This opens the standalone Tauri project in `desktop/`. Prose edits update the
selected Markdown source first and then run the Rust projection pipeline. The
desktop application does not embed Python and does not treat SQLite as its
write model.

## Verify the shim

```bash
python -m silan --help
silan --help
```

Both commands should display the same Rust CLI help.
