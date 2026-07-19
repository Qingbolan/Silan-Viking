# 06 · End-to-end main path — from install to deploy

> Chapters `00`–`05` zoom into the parts under a microscope
> (objects, parser, accept atomicity). This chapter steps back and
> **strings the parts into the path a real user walks**: install →
> open project → agent connects → update content → deploy to server.
> Wherever a step is missing (install method, `silan init`, agent
> handshake, deploy pipeline), it gets filled in here.
>
> This chapter is the check on whether "this car can drive from the
> garage to its destination".

## §6.0 Main-path overview

```
[1] Install          [2] Open project    [3] Agent connect  [4] Update content   [5] Deploy
Install the silan    →  silan init       →  silan mcp serve →  agent capture/   →  silan site deploy
binary (cargo /         (scaffold +        (handshake pushes    propose          (sync → build →
 script / pip           git init)          SCHEMA)            → silan proposal     Docker → server)
 installer)                                                     accept
```

Each step has its own section. Each section ends with the `00`–`05` sections it depends on.

---

## §6.1 Install

> silan-viking is a **brand-new project rewritten from scratch in
> Rust** (requirement `#6`). **The command name `silan` belongs to
> the new engine**, replacing the legacy Python package's use of
> that command. Naming has three layers (easy to confuse on a bulk
> replace, so pinned): user command = `silan`; binary artefact =
> `silan-viking`; crates = `silan-viking-*`. A command name
> differing from the binary name is a normal practice (crate
> `ripgrep` / command `rg`).

### Three install routes, pick one

```
# Route A — install script (recommended; no Rust toolchain needed)
curl -fsSL https://silan-viking.dev/install.sh | sh

# Route B — cargo (when you have a Rust toolchain)
cargo install silan-viking

# Route C — pip (for users used to pip; silan-viking on PyPI is a thin binary installer package)
pip install silan-viking
```

The three routes **produce identical results**: the `silan-viking`
binary appears on `PATH` as `silan`. Route C's
`pip install silan-viking` is a **different PyPI package** from the
legacy `pip install silan`; after install, the `silan` command
points at the new Rust engine — this is replacement, not
coexistence.

### What you see on screen after install

```
$ curl -fsSL https://silan-viking.dev/install.sh | sh
  silan-viking 1.0.0
  ✓ downloaded silan-viking (x86_64-apple-darwin, 8.2 MB)
  ✓ installed to /usr/local/bin/silan
  ✓ generated global config ~/.config/silan/config.toml

  Next: silan init        # initialise your content project

$ silan --version
silan 1.0.0
```

### Global config — `~/.config/silan/config.toml` (XDG standard location)

Generated at install time; the **cross-project shared** config (the
project is single-tenant, but global config stays independent of
the project so you can re-point the project path). Full content,
field by field:

```toml
# ~/.config/silan/config.toml — silan global config (generated at install)

[project]
# Location of the current content project. Default ~/.silan-viking; silan init --path overrides.
path = "~/.silan-viking"

[llm]
# The LLM used by the engine to generate L0 summaries / agent context_brief / etc.
# Empty = use the rule-based fallback (first sentence); no LLM, no network needed (01 §1.8 embedding design).
provider = ""                 # "" | "openai" | "anthropic" | ...
api_key  = ""                 # empty = pure local; non-empty = network calls

[mcp]
default_port = 7700           # default port for silan mcp serve (project-level can override)

[identity]
# Optional: only used by silan init to seed the resume defaults; after init, markdown is the source of truth.
full_name = "Example User"
title     = "AI Researcher / Engineer"
email     = "example@example.com"
```

> `[llm].api_key` is sensitive: it lives under
> `~/.config/silan/` (the user config directory), **not in any
> project directory, never in any git repo**. The XDG location is a
> natural isolation.

Depends on: `01` §1.9 crate layout; requirement `#6`.

---

## §6.2 Open the project — `silan init`

```
silan init
```

No positional arguments — silan-viking is single-tenant (`#13`):
one user, one project. `silan init` initialises at **the default
project path `~/.silan-viking/`**; pick a different location with
`silan init --path <dir>` (also updates the global config's
`[project].path`).

### `silan init` screen output — the user follows it; never stuck

```
$ silan init
  silan init — initialising the content project at ~/.silan-viking/

  ✓ content/                       content source-of-truth directory
  ✓ content/SCHEMA.md              type definitions / frontmatter conventions
  ✓ content/resources/blog/welcome/          the first blog (sample)
  ✓ content/resources/ideas/ai-content-optimizer/   the first idea (sample)
  ✓ content/resources/projects/sample-project/      the first project (sample)
  ✓ content/resources/resume/parts/summary/  resume's summary Part (seeded from global [identity])
  ✓ silan-viking.toml              project config
  ✓ .gitignore
  ✓ git init + initial commit

  Next:
    1. silan content show silan://resources/blog/welcome   # view the first sample
    2. Edit markdown under content/, or silan blog new <slug> to start something new
    3. silan mcp serve                                     # let the collaborating agent connect
    4. silan site preview                                  # locally preview the whole site
```

What `silan init` does: scaffold `content/` (six types + three
sample items), write `SCHEMA.md`, write `silan-viking.toml`,
`git init` + initial commit. Exit codes: `0` success; `1` directory
is non-empty (with `--here`, only the missing pieces are filled
in); `2` `git` is unavailable.

### §6.2.1 Project structure after `silan init`

After `silan init` runs against `~/.silan-viking/` (sample items
are silan's **built-in templates**, designed from Python `silan
init`'s validated samples and re-implemented in Rust):

```
~/.silan-viking/
├── silan-viking.toml               # project config (§6.2.2)
├── .gitignore
└── content/                        # = silan:// source of truth; a git repo
    ├── SCHEMA.md
    ├── .silan-cache                 # root registry
    ├── blog/
    │   ├── .silan-cache
    │   └── welcome/                 # ── the first blog ──
    │       ├── .silan-cache
    │       └── parts/
    │           └── body/            # blog single Part (role=body)
    │               ├── meta.toml    # ★ part_id (ULID) / type / canonical_lang
    │               └── en.md        # primary-language representation
    ├── ideas/
    │   ├── .silan-cache
    │   └── ai-content-optimizer/    # ── the first idea ──
    │       ├── .silan-cache
    │       └── parts/
    │           └── overview/        # overview Part (required); progress/reference/
    │               ├── meta.toml    #   result are optional Parts; first sample
    │               └── en.md        #   has only overview; add others on demand
    ├── projects/
    │   ├── .silan-cache
    │   └── sample-project/          # ── the first project ──
    │       ├── .silan-cache
    │       └── parts/
    │           └── overview/
    │               ├── meta.toml
    │               └── en.md
    ├── episode/  └── .silan-cache    # empty collection, no first sample (episode is an independent type)
    ├── update/   └── .silan-cache    # empty collection, no first sample (update = the 6th type)
    └── resume/
        ├── .silan-cache
        └── parts/                   # resume multi-Part: summary/education/...
            └── summary/             # summary Part; frontmatter seeded from global [identity]
                ├── meta.toml
                └── en.md
```

> Each Part is a `parts/<role>/` directory: `meta.toml` carries the
> `PartID` (identity); `<lang>.<ext>` is the language representation
> (§1.3 / §1.3.1). Renaming a language file does not affect
> identity — identity lives in `meta.toml`'s `part_id`, not in the
> filename.

**The first blog — `content/resources/blog/welcome/parts/body/en.md`**:

```markdown
---
slug: welcome
title: "Welcome to silan-viking"
kind: blog
content_type: article          # article | vlog | tutorial | podcast
date: 2026-05-16
status: published
tags: [welcome, getting-started]
tldr: "Getting started — what silan-viking is and how to use it"
---

# Welcome 🎉

This is your first blog. Edit it, or `silan blog new <slug>` to start a new one.
```

**The first idea — `content/resources/ideas/ai-content-optimizer/parts/overview/en.md`**:

```markdown
---
slug: ai-content-optimizer
title: "AI Content Optimizer"
kind: idea
status: hypothesis              # idea lifecycle: draft | hypothesis | experimenting | validating | published | concluded
category: "AI/ML"
tags: [AI, content, optimization]
open_for_collaboration: true
tldr: "An idea about automatically optimising content readability and SEO"
---

# AI Content Optimizer

## Motivation
Why this, who benefits.

## Approach
Method / approach.
```

> The first sample idea has only `parts/overview/` (the required
> Part). `progress` / `reference` / `result` are optional Parts —
> add them with `silan idea add-part` when you want a progress /
> reference / result section, or have the agent `propose` anchored
> to the matching Part (§3.1). Tabs grow on demand; you do not have
> to create them all up front.

**The first project — `content/resources/projects/sample-project/parts/overview/en.md`**:

```markdown
---
slug: sample-project
title: "Sample Project"
kind: project
status: active                 # project lifecycle: active | completed | paused | cancelled
start_date: 2026-05-16
technologies: [Markdown, Rust]
github_url: ""
tldr: "Sample project — demonstrating the project structure"
---

# Sample Project

Project overview. `progress` / `reference` are optional Parts; add via `silan project add-part` on demand.
```

**The relationship among the three `.silan-cache` files** (§1.4 Manifest):
- `content/resources/blog/.silan-cache` = `CollectionManifest`, registering the `welcome` Item.
- `content/resources/blog/welcome/.silan-cache` = `ItemManifest`, registering the `en.md` File.
- The root `content/.silan-cache` registers the six Collections (blog/projects/ideas/episode/resume/update).

> Handling legacy structure: this design does not do compat reads.
> Legacy `content/{type}/...` that wants to enter silan-viking
> must first be one-shot rearranged into the latest layout
> `content/resources/{type}/{item}/parts/<role>/`; the rearrange
> script is an M0 offline tool and does not enter the runtime
> parser.

### §6.2.2 Project config — `silan-viking.toml` (field by field)

Generated by `silan init` in the project root (`~/.silan-viking/`). Full content:

```toml
# silan-viking.toml — project config (global config in ~/.config/silan/config.toml)

[project]
name        = "silan-site"            # project name
content_dir = "content"               # source-of-truth directory (relative to project root)

[identity]
# Personal info. This is "initialisation source", not source of truth —
# silan init uses this section to seed
# content/resources/resume/parts/summary/en.md's frontmatter; afterwards,
# edit that file to change personal info.
# silan init reads from global [identity] (if any) or asks interactively, and writes here.
full_name = "Example User"
title     = "AI Researcher / Engineer"
email     = "example@example.com"
avatar    = "content/resources/resume/assets/avatar.jpg"   # avatar image (travels with content into git)
location  = "Singapore"
social    = { github = "https://github.com/...", x = "" }

[database]
path = "_deploy/portfolio.db"          # read-only derived cache of content/ (01 §1.8)

[mcp]
port          = 7700                   # overrides the global [mcp].default_port
enable_deploy = false                  # the deploy() ability is off by default (03 tier 4)

[deploy]
# Deploy target server. silan site deploy reads this section (§6.5)
host         = "silan.tech"
credential_profile = "primary"        # OAuth credentials; profiles may be shared across domains
user         = "deploy"
ssh_key_path = "~/.ssh/silan_deploy_ed25519"   # ★ only stores the path; never the key body
remote_dir   = "/srv/silan-viking"
compose_file = "deploy/docker-compose.yml"
```

**Required sections**: `[project]` / `[database]`. `[deploy]` is
required only for `silan site deploy`. `[identity]` / `[mcp]` are
optional (default to the global config / built-in defaults).
`silan` validates required sections at startup; on a missing
section → exit code `1`, naming what is missing.

**SSH-key safety convention**: `ssh_key_path` is only a path; the
private key body never enters `toml`, never enters git.
`silan-viking.toml` itself can enter git (it only stores the path).
At deploy time `silan site deploy` checks the file exists and has
permission `600`; otherwise → exit code `1`, prompting to generate
the key or `chmod`.

**`[identity]` and "markdown as source of truth"**: `[identity]` is
config; its role is **initialisation** — `silan init` uses it to
seed `content/resources/resume/parts/summary/en.md`'s frontmatter.
Edit that markdown to change personal info afterwards (which flows
through sync into the `personal_info` table). The `toml`
`[identity]` is read only at `silan init` time. Avatar images sit
under `content/resources/resume/assets/` and travel with content
into git. This makes "personal info configured in toml" and
"markdown is the source of truth" non-conflicting — toml is the
seeder; `parts/summary/<lang>.md` is the source. resume is
multi-Part (summary / education / …); structured Parts (e.g.
education) use `entry_list` `.toml` files (ruling: resume is
multi-Part).

---

### §6.2.3 The full filesystem when the project has matured (the terminal picture)

> §6.2.1 is the snapshot **right after `silan init`** (only three
> first samples). This section is the project's appearance **after
> some use, with content grown** — multi-Part, multilingual, many
> items, the proposal area, the derived cache, all there. This is
> the authoritative full picture "what the filesystem ultimately
> looks like", each file annotated.

```
~/.silan-viking/
├── silan-viking.toml              # project config ([identity] / [database] / [deploy])
├── .gitignore                     # ignores _deploy/, *.db
│
├── content/                       # ★★ the only source of truth; one git repo ★★
│   ├── SCHEMA.md                  # type definitions / frontmatter conventions / Part config (read by humans + agents)
│   ├── index.md                   # engine-maintained: global index, one line per L0
│   ├── log.md                     # engine-maintained: append-only operation log
│   ├── .silan-cache               # root registry
│   │
│   ├── resources/                 # ── namespace ①: published content (can be projected to the site) ──
│   │   ├── blog/
│   │   │   ├── .silan-cache       # CollectionManifest
│   │   │   └── <slug>/            # one blog = one Item
│   │   │       ├── .silan-cache   # ItemManifest
│   │   │       └── parts/body/    # blog single Part
│   │   │           ├── meta.toml  # ★ part_id / type / canonical_lang +
│   │   │           ├── en.md      #   (reserved) translation_of/source_hash/stale
│   │   │           └── zh.md
│   │   │
│   │   ├── ideas/
│   │   │   └── <slug>/            # idea = one Item (multi-Part)
│   │   │       ├── .silan-cache
│   │   │       └── parts/
│   │   │           ├── overview/{meta.toml, en.md, zh.md}   # required
│   │   │           ├── progress/{meta.toml, en.md}          # optional
│   │   │           ├── reference/{meta.toml, en.md}         # optional
│   │   │           └── result/{meta.toml, en.md}            # optional
│   │   │
│   │   ├── projects/
│   │   │   └── <slug>/
│   │   │       ├── .silan-cache
│   │   │       └── parts/{overview, progress, reference}/   # each with {meta.toml, en.md}
│   │   │
│   │   ├── episode/                # episode = an independent content type
│   │   │   └── <series-slug>/      # container series = directory layer
│   │   │       ├── .silan-cache    # CollectionManifest (the series's episode set)
│   │   │       └── <episode-slug>/ # each episode = one Item; uses parts/body/
│   │   │           ├── .silan-cache
│   │   │           └── parts/body/{meta.toml, en.md, zh.md}
│   │   │
│   │   ├── resume/
│   │   │   └── <slug>/             # resume = one Item (multi-Part)
│   │   │       ├── .silan-cache
│   │   │       ├── parts/
│   │   │       │   ├── summary/{meta.toml, en.md, zh.md}     # prose Part
│   │   │       │   ├── education/{meta.toml, en.toml}        # structured Part: entry_list .toml
│   │   │       │   ├── experience/{meta.toml, en.toml}       # structured Part: entry_list .toml
│   │   │       │   └── .../                                 # awards / publications …
│   │   │       └── assets/avatar.jpg
│   │   │
│   │   └── update/                 # update = the 6th content type
│   │       └── <slug>/             # one update = one Item
│   │           ├── .silan-cache
│   │           └── parts/body/{meta.toml, en.md}
│   │
│   ├── agent/                     # ── namespace ②: agent context, ★ never published ★ ──
│   │   ├── .silan-cache
│   │   ├── project/               # the agent's understanding of this project (settled from reading resources/)
│   │   ├── notes/                 # the agent's working notes / task memory
│   │   ├── owner/                 # the agent's understanding of the owner (preferences / style / judgement)
│   │   └── sessions/              # summaries of the agent's past dialogues with silan (settled at session end)
│   │                              #   SiteProjector never touches agent/ (01 §1.2.1)
│
└── _deploy/
    └── portfolio.db               # derived cache: silan index sync produces from content/resources/;
                                    #   the Go API consumes it read-only; deletable and rebuildable
```

**Global config lives elsewhere** (not in the project directory):

```
~/.config/silan/config.toml         # cross-project global config: [project].path / [llm] / [mcp]
```

**One-sentence positioning of the whole filesystem**: `content/` is
the source of truth (markdown + git repo); `portfolio.db` is its
derived cache (rebuildable by `silan index sync`); config is two
layers (global `~/.config/silan/` + project `silan-viking.toml`);
the agent proposal area is not a disk directory — it is a set of
git branches inside the `content/` repo (`proposal/<ulid>`) that
never enter main. An end user's disk has only these — the engine
source code (`engine/crates/`) is a separate pile only engine
developers have (`00` §0.4 pile ④).

## §6.3 Agent connects — the MCP handshake pushes SCHEMA

```
silan mcp serve
```

Starts an MCP server (`silan-viking-mcp` from `03`). The
collaborating agent connects. **Key: the instant the agent
connects, the server proactively pushes two things at the
handshake stage**, so the agent "understands" this project
immediately, not by guessing on its own:

1. **SCHEMA** — the content of `content/SCHEMA.md`: which types exist, what Parts each type has, the frontmatter conventions. The agent uses this to know "to create a new idea, build these files; each frontmatter needs these fields".
2. **Project overview** — what Items currently exist in `content/` (per-type Item listing + each Item's L0 summary). The agent uses this to know "what the owner already has", so it won't duplicate and can reference correctly.

After the handshake, the agent's mental model is complete: it
knows the **structural rules** (SCHEMA) and the **existing
content** (overview). This is the entry action for the `00`
terminal-state "let a collaborating agent understand silan".

> The earlier docs only had "SCHEMA is for the agent to read" — a
> slogan. Here it is turned into a mechanism: **the handshake
> pushes**, not "wait for the agent to `read` it on its own". If
> the agent misses the SCHEMA, it writes wrongly; the handshake
> push removes that at the source.

Depends on: `03` MCP service; the `SCHEMA.md` from §6.2.

---

## §6.4 The full update chain — how content goes from "edit one file" to "land in the database"

> Content updates have **two paths**: owner edits directly, or
> agent edits via proposal. This section walks them **side by side
> end to end** — earlier this chain was scattered across `01`
> §1.8, `03` §3.1, `07`; readers had to assemble it. This section
> is the main backbone; details point to the corresponding
> chapters.

The two paths **end at the same destination** — `portfolio.db` — but the front halves differ:

```
Path ①  owner edits directly                Path ②  agent edits via proposal
────────────────────────                  ─────────────────────────────────
1. Edit content/resources/<type>/<item>/parts/<role>/<lang>.<ext>
                                            1. The agent calls propose / capture
   (touches the source of truth directly;    ↓
   the content owner is the author)        2. The engine cuts a proposal git branch proposal/<ulid>
        ↓                                       The agent's draft is written into that branch (main untouched)
   (no intermediate step; source of truth      ↓
   has changed)                            3. Validation ① (at submit; early feedback)
        ↓                                       ↓
                                          4. silan: silan proposal accept <id>
                                               ↓ staging-area merge + validation ② + advance main pointer
                                          5. The draft is merged into main = source of truth has changed
        │                                       │
        └────────────────┬───────────────────────┘
                          ▼  The two paths converge here — content/ source of truth is now the latest
            6. silan index sync
                 scan content/ → Parser parses → Parsed (main + multilingual)
                 → Mapper → RowSet → Sink → portfolio.db
                          ▼
            7. portfolio.db refreshed; the Go API reads it and serves the website
```

### Path ① — owner edits directly (the shortest path)

The owner is the content author and edits the source file under
`content/` directly — **no proposal, no review**, because he is
editing his own source of truth. After editing, one step:

```
$ silan index sync
```

`sync` internally is the persistence chain in `01` §1.8: `Parser`
parses every Item's every Part's every language `File` → `Parsed`
(language-agnostic `main` + multilingual `langs`, §1.8.0) →
`Mapper` splits into a `RowSet` → `Sink` writes `portfolio.db`
inside a transaction. `content_relation` (evolution edges) is
canonicalised during the collection phase (§1.8.2).

> Path ①'s "update logic" = **edit markdown + `silan index sync`**.
> Two steps. silan holds the source of truth directly; the engine
> doesn't stand in his way.

### Path ② — agent edits via proposal (with review gates)

The agent **is not the author**; it cannot touch the source of truth directly. Each `capture` / `propose`:

1. The engine cuts a **proposal branch** `proposal/<ulid>` off `content/`'s main (`03` §3.1).
2. The agent's draft is written into the **proposal branch** in the same `content/` layout; main is untouched.
3. **Validation ①**: at submit time, run `Parser::validate` + SCHEMA validation; failures are marked red in `silan proposal list` — early feedback so the agent learns it wrote wrongly on the spot.
4. silan reviews: `silan proposal show <id>` for the diff; `silan proposal accept <id>`.
5. `accept` is not a merge one-liner — it merges in a **temporary worktree** + runs **validation ②** (on the merge result); on pass, it **atomically advances** main to the verified commit; on any failure, main is byte-for-byte unchanged (`03` §3.1 accept flow, settled across three review rounds).

After the proposal is merged into main, the source of truth has
changed — from here it converges with path ①: `silan index sync`.

> Path ②'s "update logic" = **agent propose → proposal branch →
> owner accept (staging merge + validation) → source of truth
> changes → sync**. The review gates (validation ① / ②, human
> accept) are what path ② has extra over path ① — because what
> edits the source of truth is the agent, not the author.

### The boundary between the two paths (pinned in one line)

| | Path ① silan edits | Path ② agent edits |
|---|---|---|
| Who edits the source of truth | silan, directly | the agent, **cannot edit directly**, must go through a proposal |
| Review? | None (the content owner is the author) | Yes: validation ① + validation ② + owner `accept` |
| Intermediate carrier | None; edits `content/` directly | The proposal git branch `proposal/<ulid>` |
| Convergence | —— `silan index sync` writes `content/` into `portfolio.db` —— | |

> The agent editing **memory** (the agent namespace) is the
> exception: that is the agent's own mutable area; direct writes,
> no proposal (`03` §3.1). The two paths in this section are about
> editing **published content** (the 6 types: blog / projects /
> ideas / episode / resume / update) — that is always path ②.

For per-line playbooks (owner opens an idea, agent edits the
resume, …) see `07-playbooks.md`; the object-level details of the
persistence chain are in `01` §1.8; the full proposal-mechanism
design is in `03` §3.1. This section is the **overview** that
strings them into one backbone.

Depends on: `01` §1.8 persistence mapping; `03` §3.1 agent update chain; `07` playbooks.

## §6.5 Deploy — from content to live server

Deploy is the full chain that turns the `content/` source of truth
into a live website. The `silan site` verbs from `02` are **strung
into a flow** here (earlier they were isolated verb names with no
flow).

### The six steps of the deploy pipeline

```
silan site deploy   triggers the following pipeline (--dry-run is on by default; --confirm executes for real):

1. sync     silan index sync — scan content/ → parse → write portfolio.db
            (content tables only; pings / annotations etc. runtime data untouched, see 01 §1.8 boundary)
2. build    build the frontend (Vite) → static artefact; and run SeoEmitter for crawler artefacts
            (sitemap/robots/JSON-LD/pre-rendered HTML/meta, see 01 §1.6.1)
3. package  package into Docker images: Go backend + frontend static artefact + derived-db snapshot
4. ship     push the images / snapshot to the server (image registry or direct scp + docker load)
5. promote  the server transactionally replaces derived tables; runtime tables (comment/interaction/annotation) untouched
6. up       docker compose up on the server — starts the Go backend + frontend service
```

The `silan site` verbs are **individually-callable stages** of this pipeline:
- `silan site build` = steps 1–2 (produce artefacts locally; don't deploy).
- `silan site deploy` = the full steps 1–6.
- `silan site preview` = steps 1–2 + start a local instance (don't push to the server).
- `silan site rollback` = on the server, switch to the previous image tag.
- `silan site status` = check live-service health + the content commit currently deployed.

### Deploy config — `silan-viking.toml`

The deploy target (server address, SSH / image-registry creds,
docker compose file) lives in the `silan-viking.toml` generated by
`silan init` in §6.2. `silan site deploy` reads it; it does not
take a wall of command-line parameters.

### Docker orchestration

Three services on the server (continuing the Docker Compose idea
in archive `ARCHITECTURE.md`, but this chapter is the new design;
that one is obsolete):

| Service | Contents | Notes |
|---|---|---|
| `backend` | Go API + the persistent `portfolio.db` | reads derived content tables; writes runtime tables (comment / interaction / annotation) |
| `web` | frontend static artefact + crawler artefacts | hosted by nginx / caddy; includes sitemap etc. |
| `proxy` | reverse proxy + TLS | the external entry point |

The local `_deploy/portfolio.db` is regenerated by step 1 each
deploy; it is only a **derived-db snapshot**. The live server's
`portfolio.db` is a persistent volume: deploy promote only
replaces derived tables; it never overwrites runtime tables. This
boundary is a hard constraint; otherwise one deploy would lose
comments and visit pings. The full policy is in
`08-engineering-review.md` §8.3.

### Can the agent deploy

`03` tier 4: the `deploy()` ability is **off by default**; it
requires `silan mcp serve --enable-deploy` to surface, and forces
dry-run + owner confirmation. `publish` (setting an Item to
public) is **never** given to the agent. The "selective deploy"
choice is silan's (`#13`).

Depends on: `02` `silan site` command group; `01` §1.6.1 SeoEmitter; `01` §1.8 content / runtime-data boundary; `03` tier 4.

---

## §6.5.1 Switching machines — taking over from the server on a new machine

> silan switched laptops and wants to continue this project on the
> new machine. Distinguish "what to bring" from "what not to bring".

On the new machine:

```
$ pip install silan-viking          # or cargo / script — install silan (§6.1)
$ git clone <content-repo>  ~/.silan-viking/content
$ silan init --here ~/.silan-viking  # for an existing content/, fill in silan-viking.toml etc.
$ silan index sync                   # rebuild the local portfolio.db from markdown
```

**What the new machine gets**: every markdown file under
`content/` — every Item across the six types
(blog/projects/ideas/episode/resume/update), all history (the git
log). This is the source of truth and is complete. A local `sync`
produces a fresh `portfolio.db`.

**What the new machine does not get — runtime data**: comments
(`comment`), visit pings (`content_interaction`) are produced by
visitors on the **live website** and live only in the server's
`portfolio.db`. The `portfolio.db` produced by the new machine's
local `sync` has **empty runtime tables** — this is by design
(`01` §1.8 "runtime data lives only on the server").

To see comments / visit data on the new machine — sync into the local cache first, then query:

```
$ silan stats sync silan://resources/blog/welcome   # pull from the server into the local stats cache
$ silan stats show silan://resources/blog/welcome   # read the local cache
```

> `stats` is sync-then-query (`02` §`silan stats`): `sync` pulls
> server-side runtime stats into the local `portfolio.db`'s
> `stats_cache_*` tables; read commands query that cache. The
> runtime tables themselves (`comment` / `content_interaction`
> rows) are not downloaded — they have one home (the server); the
> local machine deals only with content creation. This way,
> switching machines is always "git clone content + sync" — there
> is no "whose comments are newest" sync headache. Cross-machine
> content is naturally consistent via git; runtime data never
> participates in local content sync; you pull a read-only cache
> per Item when needed.

## §6.6 Main-path gaps — what this chapter filled

| Gap (before this chapter) | How this chapter fills it |
|---|---|
| "pip download" doesn't match the Rust engine | §6.1 Rust standard distribution; new/old packages have zero runtime relation; pip is only an independent binary installer |
| The CLI inventory had no `init`; "how to open a project from an empty directory" was undefined | §6.2 added `silan init` |
| `content/` is a git repo, but who runs `git init` was unsaid | §6.2 `silan init` step 3 |
| "SCHEMA is for the agent to read" was a slogan with no mechanism | §6.3 the MCP handshake actively pushes it |
| `silan site`'s six verbs were isolated; no complete deploy flow | §6.5 strings them into the six-step pipeline |
| The Docker orchestration of deploy was not inherited by the new docs | §6.5 redesigned the three services |

> Open items going into M0 (raised by this chapter):
> - `silan init`'s exact rule for "filling in missing pieces" on an existing project.
> - Step 3: does `portfolio.db` go into the image or get volume-mounted.
> - How deploy credentials are stored in `silan-viking.toml` (plaintext / environment-variable reference).

---

## §6.7 One-sentence acceptance

A new user: install `silan` (`cargo install silan-viking` / install
script / `pip install silan-viking` — pick one) → `silan init` →
write two markdowns → `silan mcp serve` to let the agent connect
and help edit → `silan proposal accept` to take in the changes →
`silan site deploy` pushes live.
**Every step on this path has a corresponding command and
mechanism in this chapter — the car can drive from the garage to
its destination.**

---

## §6.8 Main-path commands — input / output / exit code

> The precise contract of every main-path command. Not a slogan:
> what the input is, what it produces, which exit code it returns
> on success or failure. `silan`'s exit-code convention: `0`
> success; `1` user-fixable error (missing config, validation
> failure); `2` environment error (git missing, network down).

### `silan init` (optional `--path <dir>` / `--here`)

| | |
|---|---|
| Input | No positional args; defaults to initialising at `~/.silan-viking/`. `--path <dir>` overrides; `--here` fills in missing pieces of an existing project |
| Output | `~/.silan-viking/content/` (six types + three sample items §6.2.1), `SCHEMA.md`, `silan-viking.toml` (§6.2.2), `git init` + initial commit; updates the global `[project].path` |
| stdout | The created file tree + numbered next steps (§6.2 screen output) |
| Exit code | `0` success; `1` directory non-empty (without `--here`); `2` `git` unavailable |

### `silan index sync`

| | |
|---|---|
| Input | The `content/` source of truth; `silan-viking.toml`'s `[database].path` |
| Output | `portfolio.db` (content tables + translation + `item_part` + `content_relation`); refreshed `.silan-cache` files; one new line in `content/log.md` |
| stdout | Per-Collection counts; added / updated / skipped tallies |
| Exit code | `0` all valid; `1` some Items fail validation (SCHEMA violation; names file:line); `2` db not writable |

### `silan mcp serve`

| | |
|---|---|
| Input | `silan-viking.toml`'s `[mcp]`; optional `--enable-deploy` (overrides config) |
| Output | A long-lived MCP server; on agent connect, the handshake pushes SCHEMA + project overview (§6.3) |
| stdout | Listening port; one log line per agent connect / disconnect |
| Exit code | `0` normal exit (Ctrl-C); `2` port in use |

### `silan proposal accept <id>`

| | |
|---|---|
| Input | `<id>` the proposal ULID; the corresponding `proposal/<id>` branch exists |
| Output | On success: main pointer advances to the verified merge commit (§3.1); on failure: main is byte-for-byte unchanged |
| stdout | Merge result; validation ② report; one of three outcomes: success / conflict / validation failure |
| Exit code | `0` merged; `1` merge conflict or validation ② failed (each with a next-step hint); `2` proposal does not exist |

### `silan site deploy`

| | |
|---|---|
| Input | `silan-viking.toml`'s `[deploy]`; `--dry-run` (default) / `--confirm` |
| Output | dry-run: prints "the six steps it will execute"; does not touch the server. `--confirm`: executes sync→build→package→ship→promote→up (§6.5); live service updates |
| stdout | Step-by-step progress for the six steps; the deployed content_commit; the live URL |
| Exit code | `0` deploy succeeded (or dry-run completed); `1` config missing / validation failure / SSH key file missing; `2` server unreachable |

> The complete command inventory is in `02-cli-service.md`; this section lists only the precise IO contracts of the five main-path commands.
