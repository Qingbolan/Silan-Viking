# 16 · Terminal-state artefact delivery + deploy — first-principles rebuild of the deploy pipeline

> Decision owner: CTO Silan.Hu (final call) · Architect: 凉冰 · Status: in flight
> Date: 2026-05-17

## 16.1 The problem

`silan site deploy` is currently a **source-code deploy**, not an
**artefact deploy**. The whole pipeline and the two Dockerfiles
implicitly assume "the target machine has the full source repo":

- `run_vite_build` requires `frontend/package.json`, runs `npm ci && npm run build` on the spot
- `web.Dockerfile` does `COPY frontend/ ./` and builds the Vite bundle on the spot
- `backend.Dockerfile` does `COPY backend/ ./` and runs `go build` on the spot
- `docker-compose.yml` uses `build.context: ..` and treats the whole repo as build context

But after a real user runs `cargo install silan-viking` /
`pip install silan`, they have **no `frontend/`, no `backend/`, no
Dockerfile, no compose.yml** — those live only in the product repo.
`silan site deploy` fails out of the gate with `front-end not found`.

## 16.2 First-principles derivation

**What is the product**: an AI-driven personal portfolio platform.
**Who is the user**: someone who wants a personal website, not a
contributor cloning the repo. **Their only asset** is markdown under
`content/` plus `silan-viking.toml`. Frontend / backend are the
**product**, not user assets.

This mirrors Hugo / Zola: the user never touches theme source; the
theme ships with the engine.

**The unique terminal-state shape:**

> `cargo install silan-viking` → `silan init` lays the project →
> write markdown → `silan site deploy`, one command goes live.
> End-to-end zero frontend source, zero Node, zero Go.

**This locks every "choice" into a single answer:**

1. **The backend must be pre-built.** The user's machine has no Go source; a `go build` on the spot is logically impossible.
2. **The frontend must ship with the engine.** Isomorphic to `silan init` embedding `SCHEMA.md` — the engine carries the canonical schema, so it should carry the canonical frontend bundle and Docker assets too.
3. **registry vs embedded**: a registry requires maintaining Docker Hub / CI publishing / users being able to reach the registry — that is a hosted-service operations burden. The terminal state may have a registry later, but **the current single correct answer is "the CLI binary carries its own pre-built artefacts"**: collapse the "can the user deploy" dependency to zero — only Docker is required.

**Conclusion: `run_vite_build` is a false function in the terminal state and should be deleted.**

## 16.3 Terminal-state architecture — embedded source tars + Docker isolated build

**Core judgement: the invariant is "the user's machine doesn't need
the source repo", not "never compile".** A Docker multi-stage build
is closed, reproducible, isolated from the user's host environment —
`npm run build` / `go build` inside the container is entirely
legitimate. `run_vite_build` is wrong because it compiles **on the
user's host with the user's npm** — that is what must be eliminated.

At engine build time (`build.rs`), package the following and
`include_bytes!` them into the binary:

| Artefact | Source | Excluded |
|---|---|---|
| `frontend.tar.gz` | `frontend/` source (~4.9M) | `node_modules`, `dist`, `.git` |
| `backend.tar.gz` | `backend/` source (~11.3M) | compiled binaries, `*.db`, `*.log` |
| `deploy.tar.gz` | `deploy/`: compose, the two Dockerfiles, nginx/proxy config, entrypoint | — |

~16M total source, smaller after compression; with these embedded,
`silan-viking` is about 25MB — acceptable (Hugo-class).
**Why embed source tars rather than the `frontend/dist` build
output**: `dist/` is a git-ignored artefact; checking it into
`assets/` would stuff build output into version control and force a
manual sync after every frontend change. `build.rs` tars at compile
time, guaranteeing the artefact matches the current source without
polluting git.

**Why use `build.rs` to tar, not `npm run build`**: if `build.rs`
ran npm, every `cargo build` would force a Node install — violating
"a developer building the CLI should not depend on Node". `build.rs`
only does `tar` packaging (pure Rust / system tar); the actual
npm/go build is deferred to the Docker multi-stage.

`silan site deploy`: extract the three embedded tars into a temporary
staging directory → docker compose multi-stage build there (node
stage builds the frontend, golang stage builds the backend, all in
the container's isolated environment) → boot. User-side dependency
collapses to one thing: **have Docker.**

## 16.4 Backend image policy

The backend uses `mattn/go-sqlite3` (CGO). `backend.Dockerfile`
keeps the `golang:1.24-bookworm` build stage (gcc + libc6-dev
pre-installed), building from the `backend/` source extracted in the
staging directory. Symmetric to the frontend's `node:22` build
stage — both follow "engine-embedded source tar → Docker multi-stage
isolated build"; the architecture is consistent. We do not
pre-compile cross-arch binaries: Go/Node container builds are fast
and reproducible, sparing us multi-arch distribution.

## 16.5 Real bugs uncovered (blockers to running the terminal state end-to-end)

Ten bugs caught and fixed during implementation + end-to-end
verification:

1. **The healthcheck endpoint bypassed the contract**: `/api/v1/health` was previously a hand-written `server.AddRoute` in `backend.go`, bypassing goctl. The `.api` file is the single source of truth for the backend's HTTP contract. **Fixed**: added the `health` group + `Health` handler in `backend.api`, ran `goctl api go` to regenerate, and removed the bypass `AddRoute` from `backend.go`.
2. **Repo hygiene debt**: four compiled binaries (including a 99M ar-archive mistakenly emitted into `internal/ent/`) were tracked by git, polluting the to-be-embedded backend source tar. **Fixed**: `git rm --cached` + `.gitignore`, removed the junk files.
3. **`build.rs` exclusion rule clobbered source**: `tar --exclude=migrate` used a bare basename, so the source bundle's `backend/internal/ent/migrate/` got excluded too — `go build` inside the image then failed with `package ... migrate is not in std`. **Fixed**: changed the exclusion pattern to be path-anchored (`backend/migrate`).
4. **Missing healthcheck probe tool**: the `debian:bookworm-slim` runtime image has neither `wget` nor `curl`, so the compose healthcheck running `wget` → `exit 127` → the container is permanently unhealthy. **Fixed**: install `curl` in the runtime stage, switch the healthcheck to `curl -fsS`.

5. **Cross-host ship missed `proxy.conf`**: the `proxy` service bind-mounts `./proxy.conf` into the nginx container, but the cross-host ship step only scp'd the compose file, not `proxy.conf`. Docker, seeing the source path missing, **created** it as a same-named directory → the mount onto a file path inside the container failed. **Fixed**: ship step now also `scp`s `proxy.conf` (alongside the compose file in the root of `remote_dir`).
6. **Shipping the binary cross-host was wrong**: the old cross-host path `scp`d the control machine's `silan-viking` binary to the target to execute `site promote`. The control binary is compiled for the control machine's OS/arch and may not run on the target (macOS → Linux, glibc ↔ musl). **Fixed**: promote is a pure SQLite operation — changed to "do it locally on the control machine": `scp` the live db down from the target, promote locally, `scp` back. No more shipping the binary.
7. **Missing SSH host-key policy**: `ssh` / `scp` had no `StrictHostKeyChecking` set, so a first connection to a new server would hang interactively. **Fixed**: all four `ssh`/`scp` callsites use `StrictHostKeyChecking=accept-new` (accept and record on first contact, strict thereafter — safer than `=no`).
8. **`[deploy]` didn't support a custom SSH port**: real servers often move sshd off port 22. **Fixed**: added an optional `ssh_port` (default 22) under `[deploy]`; `ssh -p` / `scp -P` everywhere.
9. **`index sync` didn't write `episode_series` → promote hit an FK violation**: when scanning `episode/<series>/<episode>/`, `scan_episode_type` completely ignored `series.toml` in the series directory and never produced an `episode_series` row; yet `ProseMapper` wrote `series_id` (= series slug) onto every `episodes` row. The live db (post-Go-ent migration) has `episodes.series_id` as a foreign key to `episode_series.id` — with the parent row missing, promote raised a bare `FOREIGN KEY constraint failed` at COMMIT. **Fixed**: `scan` now reads `series.toml` into a new `ScannedSeries` struct (slug = the directory name, the FK target); `run.rs` produces `episode_series` rows at the end of `build_batch`, per series — at the batch layer rather than the per-Item mapper, because a series is a parent row shared by multiple episodes; producing it from the mapper would duplicate it per episode and crash the sink's bare INSERT on a primary-key collision.
10. **After backend container rebuild, proxy cached the old IP → 502**: step 5 of deploy `compose up -d` **rebuilds** the backend container (new network IP), but step 6 only `restart backend`. nginx resolves the `backend` upstream once at worker start and caches the IP — the old proxy points at the dead old container and returns 502 forever. **Fixed**: step 6 is now `restart backend proxy`, refreshing the proxy upstream on both single-machine and cross-host paths.

## 16.6 Acceptance — the terminal state runs end-to-end (2026-05-17)

**Single-machine mode** — in a brand-new directory with no source,
using only the `silan-viking` binary: `init` →
`[deploy] host=localhost` → `deploy --confirm` → all six pipeline
steps pass, the site is live on local Docker.

**Cross-host mode** — two isolated Docker containers, literally
"two machines":

- Control machine `sv-control`: only the `silan-viking` binary + Docker + SSH client, **no source** (simulates an operator's machine post `cargo install`).
- Target machine `sv-target`: DinD + sshd, only Docker + SSH (simulates a real remote server).
- Control: `init` a fresh project → configure `[deploy]` at `sv-target` → `deploy --confirm` → image build / pack / `docker save` / scp over SSH to the target → target `docker load` / `up` → promote → site live.

Both modes accepted green:

| Check | Result |
|---|---|
| `/api/v1/health` | `{"status":"ok"}` |
| Frontend home | HTTP 200 |
| `/api/v1/resume` | returns real data |
| `/api/v1/blog/posts` | HTTP 200 |
| backend container health | `healthy` |
| promote | `tables=11 rows=17`; runtime tables preserved |

CTO's original question — "install and configure on one machine,
deploy to another (Docker)" — answer: **yes, and end-to-end tested
live**. The engine binary carries the full artefact set; the target
side needs only Docker + SSH. Both single-machine and cross-host
paths run.

CTO directive: **go to the terminal state in one step; require a
real working result**. Achieved.

## 16.7 Optimisations / known traps (not blocking; on the books)

- ✅ **Fixed (GOAL §8 deploy #1)**: when `remote_dir` points to a
  path the deploy user can't write (e.g. somewhere under `/srv`),
  the `ssh` closure catches `Permission denied` and surfaces a
  guidance message, telling the operator to either pre-`sudo chown
  $USER <dir>` or move `remote_dir` under the user's home. Site:
  the `ssh` closure in `engine/crates/silan-viking-cli/src/main.rs`.
- ✅ **Fixed (GOAL §8 deploy #2)**: clear stale files in
  `remote_dir` before cross-host ship — the `[4/6] ship` step now
  runs `rm -rf images.tar snapshot.db docker-compose.yml
  proxy.conf` right after `mkdir -p`, clearing same-named
  directories left behind by a previous failure (so a subsequent
  `scp` doesn't get stuck because `rm -f` can't remove a directory).
- ⚠️ **Known trap (developer-side note)**: cross-platform container
  builds (macOS host + Linux container sharing the mounted volume)
  **cannot trust the cargo incremental cache** — the fingerprint
  the host writes does not match the container's glibc/libc, and
  re-using the wrong `.rmeta` produces bizarre "symbol not found"
  failures.
  - **Symptom**: `cargo build` succeeds on the macOS host; immediately
    `docker run` mounting the host `target/` into a Linux container
    and rebuilding fails at link time or crashes at runtime.
  - **Mitigation**: container builds use an **independent**
    `CARGO_TARGET_DIR` (e.g. `CARGO_TARGET_DIR=/tmp/target-linux
    cargo build`), never sharing the host `target/`. Docker
    multi-stage builds use isolated volumes by default, so this
    note mainly applies to developers manually switching back and
    forth between host and container.
  - **Invariant**: the `build.rs` tar packaging
    (`silan-viking-cli/build.rs`) runs on the host — it only tars
    sources and never calls cargo, so it is immune to this trap
    (consistent with GOAL §9 invariant #9).
