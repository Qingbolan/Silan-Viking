// silan-viking-cli — build script
// ================================
//
// File: build.rs
// Description: Packages the deploy artifacts — the front-end source,
//              the Go backend source, and the `deploy/` Docker assets
//              — into three gzip tarballs in `OUT_DIR`. `main.rs`
//              embeds them with `include_bytes!`, so the shipped
//              `silan-viking` binary carries everything `silan site
//              deploy` needs. The user's machine then needs only
//              Docker — no source checkout, no Node, no Go.
//
// Why tar here, npm/go later
// --------------------------
// This script only *packs* sources; it never runs npm or go. The real
// front-end / backend builds happen inside the deploy Docker images'
// multi-stage builds (`node:20` / `golang:1.24`), in containers
// isolated from the user's host. Keeping npm/go out of `build.rs`
// means a developer can `cargo build` the CLI without Node or a Go
// toolchain installed.
//
// Why the system `tar`, not a tar crate
// -------------------------------------
// `build.rs` runs only when *building the engine* (a developer
// machine), never on a user's machine. The system `tar` is present on
// every Linux / macOS host and is the canonical packing tool. Shelling
// to it avoids adding `tar` + `flate2` as build-dependencies, which
// would slow the first `cargo build` for no real gain.
//
// Author: Silan Hu <silan.hu@u.nus.edu>
// Copyright (c) 2026 Silan Hu. All rights reserved.

use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    // The CLI crate is `engine/crates/silan-viking-cli`; the repository
    // root — which holds `frontend/`, `backend/`, `deploy/` — is three
    // levels up. `CARGO_MANIFEST_DIR` is absolute, so this resolves
    // correctly regardless of where `cargo` was invoked.
    let manifest_dir = PathBuf::from(env_var("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .join("../../..")
        .canonicalize()
        .expect("repo root (engine/../..) must exist");
    let out_dir = PathBuf::from(env_var("OUT_DIR"));

    // frontend.tar.gz — front-end source, minus the dependency cache and
    // build output (both are regenerated inside the web Docker image).
    pack(
        &repo_root,
        "frontend",
        &out_dir.join("frontend.tar.gz"),
        &["frontend/node_modules", "frontend/dist", "frontend/.git"],
    );

    // backend.tar.gz — Go backend source, minus compiled binaries and
    // local databases / logs (the backend image rebuilds the binary).
    //
    // Exclude patterns are path-anchored (`backend/<name>`), not bare
    // basenames: a bare `migrate` would also drop the *source* package
    // `backend/internal/ent/migrate/`, which `go build` needs.
    pack(
        &repo_root,
        "backend",
        &out_dir.join("backend.tar.gz"),
        &[
            "backend/silan-backend",
            "backend/silan-backend-mac",
            "backend/backend",
            "backend/migrate",
            "*.db",
            "*.log",
        ],
    );

    // deploy.tar.gz — the Docker assets: compose file, both Dockerfiles,
    // nginx / proxy configs, the backend entrypoint. The whole `deploy/`
    // directory, minus any stale SEO output (regenerated each deploy).
    pack(
        &repo_root,
        "deploy",
        &out_dir.join("deploy.tar.gz"),
        &["deploy/seo"],
    );
}

/// Pack `<repo_root>/<dir>` into `dest` as a gzip tarball, excluding the
/// given glob patterns. Re-runs whenever the source directory changes.
fn pack(repo_root: &Path, dir: &str, dest: &Path, excludes: &[&str]) {
    let src = repo_root.join(dir);
    // Cross-compilation environments (e.g. `cross` containers) only mount
    // the cargo workspace, so `repo_root/<dir>` is unreachable. Emit a
    // zero-byte placeholder tarball so the build succeeds; `silan site
    // deploy` will detect the empty archive at runtime and tell the user
    // to rebuild on a full checkout.
    if !src.is_dir() {
        println!(
            "cargo:warning=deploy artifact source missing ({}); writing empty {}",
            src.display(),
            dest.display()
        );
        std::fs::write(dest, b"").expect("write empty placeholder tarball");
        return;
    }
    // Cargo must re-run this script — and re-pack the tarball — whenever any
    // source file changes. A single `rerun-if-changed` on the *directory*
    // only reacts to the directory's own mtime (an entry added or removed at
    // the top level); a deep nested edit (e.g. `backend/internal/handler/
    // media/getmediahandler.go`) does not bump it, so the embedded artifact
    // would silently go stale. Emitting one `rerun-if-changed` per file —
    // the whole tree, walked here — is what makes nested edits trigger.
    emit_rerun_recursive(&src);

    let mut cmd = Command::new("tar");
    // `-C <repo_root>` so paths inside the archive are `frontend/...`
    // etc. (relative), not absolute host paths.
    cmd.arg("-C").arg(repo_root);
    cmd.arg("-czf").arg(dest);
    for pattern in excludes {
        cmd.arg(format!("--exclude={pattern}"));
    }
    cmd.arg(dir);

    let status = cmd
        .status()
        .unwrap_or_else(|e| panic!("failed to run `tar` for {dir}: {e}"));
    assert!(status.success(), "`tar` failed packing {dir}");
}

/// Emit a `cargo:rerun-if-changed` line for `path` and, recursively, every
/// file and directory beneath it — so an edit anywhere in the tree re-runs
/// the build script. A directory that cannot be read is reported as a single
/// `rerun-if-changed` (its mtime still tells Cargo something changed).
fn emit_rerun_recursive(path: &Path) {
    println!("cargo:rerun-if-changed={}", path.display());
    let Ok(entries) = std::fs::read_dir(path) else {
        return;
    };
    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_dir() {
            emit_rerun_recursive(&child);
        } else {
            println!("cargo:rerun-if-changed={}", child.display());
        }
    }
}

fn env_var(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("build script env var {key} not set"))
}
