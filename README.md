# silan-viking — the content engine for Silan's personal website

`silan-viking` is a single self-contained CLI that scaffolds, indexes, previews,
and deploys a Silan-style personal website. It is the public face of the
[Silan-Personal-Website](https://github.com/Qingbolan/Silan-Personal-Website)
project: a Rust engine that turns a directory of Markdown into a runnable site
backed by a Go API and a React frontend.

![Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Release](https://img.shields.io/github/v/release/Qingbolan/Silan-Personal-Website)

- **Live demo**: <https://silan.tech>
- **Latest release**: [v1.0.0](https://github.com/Qingbolan/Silan-Personal-Website/releases/tag/v1.0.0)

![alt text](image.png)

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Personal-Website/main/engine/install.sh | sh
```

The installer detects your OS and CPU, downloads the matching prebuilt binary
from GitHub Releases, and drops it into `~/.local/bin/silan-viking`. If no
prebuilt asset exists for your platform it falls back to building from source
with `cargo` (needs the [Rust toolchain](https://rustup.rs)).

Prebuilt binaries are shipped for:

| Platform                  | Triple                          |
| ------------------------- | ------------------------------- |
| macOS, Apple Silicon      | `aarch64-apple-darwin`          |
| macOS, Intel              | `x86_64-apple-darwin`           |
| Linux x86_64 (glibc)      | `x86_64-unknown-linux-gnu`      |
| Linux arm64 (glibc)       | `aarch64-unknown-linux-gnu`     |

Verify with `SHA256SUMS` published alongside each release. See
[`engine/INSTALL.md`](engine/INSTALL.md) for environment variables
(`SILAN_INSTALL_DIR`, `SILAN_VERSION`) and uninstall instructions.

> **Note on Linux binaries.** The CLI's embedded deploy artifacts (`frontend/`,
> `backend/`, `deploy/` tarballs used by `silan site deploy`) are empty
> placeholders in cross-compiled Linux releases. Every other command — `init`,
> `index sync`, `guide`, `site preview`, content CRUD, MCP server — works
> normally. For full `site deploy` on Linux, build from a local checkout.

## From zero to a running site

```sh
mkdir my-site && cd my-site

silan-viking init            # scaffold content/, silan-viking.toml, SCHEMA.md
silan-viking guide           # "what do I do now?" — re-run any time
silan-viking index sync      # build the derived database from content/
silan-viking site preview    # build the site and open a local preview
```

`init` lays down `content/` with six content types and three seed items.
After that, `guide` reads project state and tells you the next step — before
`index sync` it points at sync; after syncing it points at preview and deploy.

Add content with the per-type verbs:

```sh
silan-viking blog new <slug>
silan-viking project new <slug>
silan-viking idea new <slug>
silan-viking index sync
```

Run `silan-viking --help` for the full surface (content, workflow, publish,
integration, maintenance).

## Repository layout

```
Silan-Personal-Website/
├── engine/                       # silan-viking Rust workspace
│   ├── crates/
│   │   ├── silan-viking-base     # L1: utilities
│   │   ├── silan-viking-content  # L2: domain data
│   │   ├── silan-viking-entities # L2.5: sea-orm entities
│   │   ├── silan-viking-app      # L3: parser / mapper / sink
│   │   ├── silan-viking-cli      # L4: CLI adapter (binary: silan-viking)
│   │   ├── silan-viking-mcp      # L4: MCP server adapter
│   │   └── silan-viking-site     # L4: site build / preview / deploy
│   ├── install.sh                # one-line installer
│   └── INSTALL.md                # install reference
│
├── content/                      # the Markdown truth source
│   ├── blog/  project/  idea/    # content types
│   ├── episode/  update/         # series and timeline
│   ├── resources/resume/         # parts-based resume
│   └── moment/                   # short updates
├── silan-viking.toml             # project config (paths, identity, deploy)
│
├── frontend/                     # React 18 + Vite + TypeScript app
├── backend/                      # Go-Zero API + Ent ORM
├── deploy/                       # docker-compose, nginx, entrypoints
│
└── docs/                         # design docs (silan-viking architecture)
```

The Rust engine writes a derived SQLite database under `_deploy/api/` that the
Go backend serves; the React frontend reads from the Go API. `site deploy`
ships the whole bundle — engine binary, derived DB, Go service, built
frontend, Docker assets — to a target host so the only host-side dependency is
Docker.

## Architecture

```
                       ┌─────────────────────────────────┐
                       │  content/ (Markdown + YAML)     │
                       └──────────────┬──────────────────┘
                                      │ silan-viking index sync
                                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        silan-viking (Rust)                           │
│  L4  cli  ·  mcp  ·  site                                            │
│  L3  app  (parser → mapper → sink)                                   │
│  L2  content   ·   L2.5  entities  (sea-orm)                         │
│  L1  base                                                            │
└──────────────────────────────────────────────────────────────────────┘
                                      │ writes _deploy/api/portfolio.db
                                      ▼
                       ┌─────────────────────────────────┐
                       │  Go-Zero API   +   Ent ORM      │
                       │  (backend/, reads SQLite)       │
                       └──────────────┬──────────────────┘
                                      │ HTTP / JSON
                                      ▼
                       ┌─────────────────────────────────┐
                       │  React 18 + Vite + Tailwind     │
                       │  (frontend/)                    │
                       └─────────────────────────────────┘
```

Crate dependency direction is strictly one-way (`cli/mcp/site → app →
entities/content → base`); cargo enforces no back-edges at compile time. See
[`docs/silan-viking/01-oop结构.md`](docs/silan-viking) for the full design.

## Building from source

The engine is a Cargo workspace pinned to Rust stable (currently 1.95).

```sh
cd engine
cargo build --release -p silan-viking-cli
# binary: engine/target/release/silan-viking
```

For developer builds with the install script's layout, use
`engine/install-dev.sh`.

### Cross-compiling release binaries

```sh
# macOS host, native build
cargo build --release -p silan-viking-cli --target aarch64-apple-darwin

# Linux via cross (needs Docker + cross from git main on Apple Silicon)
cargo install cross --git https://github.com/cross-rs/cross
cross build --config 'build.rustc-wrapper=""' \
            --release -p silan-viking-cli \
            --target x86_64-unknown-linux-gnu
```

The `build.rustc-wrapper=""` override is only needed if your global
`~/.cargo/config.toml` sets `rustc-wrapper = sccache` — cross containers don't
ship sccache.

## Frontend & backend (optional, for full-stack development)

The engine is the only piece a user needs to publish a site. The frontend and
backend are bundled into `silan-viking site deploy` and rebuilt inside Docker
on the deploy host, so you do **not** need Node or Go locally to ship.

If you do want to work on them directly:

```sh
# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173

# Backend
cd backend && go mod download && go run backend.go   # http://localhost:8080
```

See [`frontend/README.md`](frontend/README.md) and the
[`backend/`](backend/) tree for service-specific details.

## Contributing

1. Fork the repository
2. Branch off `main`
3. Conventional commits (`feat`, `fix`, `chore`, `docs`)
4. Open a PR — include a `## Test plan` checklist

Engine work happens under `engine/`. Each layer has its own README/design
doc under `docs/silan-viking/`. Bug fixes that pay off a sharp edge should
mention the cost they paid for in the PR description so the next person
knows why the rule exists.

## License

Apache License 2.0 — see [`License`](License).

## Author

**Silan Hu** — AI Researcher & Full Stack Developer

- Website: <https://silan.tech>
- GitHub: [@Qingbolan](https://github.com/Qingbolan)
- Email: <silan.hu@u.nus.edu>

---

If you find this project helpful, please give it a star ★. Questions or
suggestions? [Open an issue](https://github.com/Qingbolan/Silan-Personal-Website/issues).
