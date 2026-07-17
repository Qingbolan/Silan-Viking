# Silan Context System

Standalone Tauri authoring application for the local `content/` workspace.
It is not part of the public React website and is not served by the Go
backend.

## Launch

Use the Rust CLI from the repository root so both workspace paths are passed
to Tauri:

```bash
./engine/target/debug/silan-viking desktop
```

For an installed CLI:

```bash
silan-viking desktop
# `silan desktop` is the Python command-name shim for the same binary.
```

## Data ownership

```text
content/**/*.md                 authoritative prose
        |
        | ContentEditor::save_markdown_and_sync
        v
Workspace::sync
        |
        v
_deploy/api/portfolio.db       local read store
        |- authored content tables (rebuildable projection)
        `- runtime tables (optional comments/interactions)
```

The Tauri adapter opens SQLite read-only. `ProjectionRepository` reads
rebuildable content metadata, while `RuntimeInsightsRepository` reads optional
traffic and comment tables. A newly synchronized database has no runtime
tables, which is represented as zero observations rather than a load error.

Editor bodies and revisions are always loaded from Markdown. Saving performs
an optimistic revision check, preserves YAML frontmatter, writes the source
atomically, and refreshes the projection. Saves are serialized inside the
engine. If projection fails, rollback occurs only while the just-written
source is still unchanged, so an external edit is never overwritten.

Structured Resume Parts remain TOML and are intentionally excluded from the
Markdown editor until a shape-specific structured editor exists.

## Development checks

```bash
npm --prefix desktop run build
cargo check --manifest-path desktop/src-tauri/Cargo.toml
cargo test --manifest-path desktop/src-tauri/Cargo.toml
cargo test --manifest-path engine/Cargo.toml -p silan-viking-app
```
