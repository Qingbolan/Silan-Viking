# Silan Personal Website — User Manual

> **Language / 语言**: **English** · [中文](./MANUAL.zh-CN.md)

> A manual you can read once and run end-to-end: **what the system is → how to
> install it → how to use it → how to publish**.
>
> Design docs live in `docs/silan-viking/` (`OVERVIEW.md` is the design entry
> point, `07-操作手册.md` has line-by-line playbooks). This manual is the
> distilled, user-facing version.

---

## 1. What this system is

Silan Personal Website is a personal-website platform with **markdown files as
the source of truth**. You write markdown locally, the engine syncs it into a
database, and that gets deployed as a live site. A collaborating AI agent can
read your content and draft for you through an MCP interface — but any
publishable change goes through a proposal that you approve.

```
            ┌──────────────── Local machine ────────────────┐
 you write ─▶ content/        markdown source of truth (Git repo)
                 │  silan-viking index sync
                 ▼
            portfolio.db     derived database (rebuildable, never hand-edit)
                 │
 AI agent ◀─▶  silan-viking mcp serve   (MCP: read content / write agent context / propose)
                 │  silan-viking site deploy
            └────┼────────────────────────────────────────────┘
                 ▼
            ┌──────────────── Server ──────────────────────┐
            Go API  +  portfolio.db  +  React frontend
                 │
            visitors browse → comments / likes → runtime data lives only here
            └───────────────────────────────────────────────┘
```

### Three components

| Component | Directory | Tech | Role |
|---|---|---|---|
| **Engine CLI** | `engine/` | Rust (`silan-viking`) | Content management, sync, site build, deploy, MCP service |
| **Backend API** | `backend/` | Go + Go-Zero + Ent ORM | Serves the frontend, handles runtime data (comments/likes) |
| **Frontend site** | `frontend/` | React 18 + TypeScript + Vite + Tailwind | What visitors see |

> Historical note: older versions used a Python CLI (the legacy `README.md`
> still describes it). **The current CLI is the Rust `silan-viking`** — this
> manual reflects that.

### Content types

The engine manages six content types, defined in `content/SCHEMA.md`:

`blog` · `project` · `idea` · `episode` · `resume` · `update`

- `blog` is **single-Part** (one body file, `body`).
- `idea` / `project` are **multi-Part** (`overview` / `progress` /
  `reference`…); each Part is a `parts/<role>/` directory with `meta.toml`
  plus one `.md` per language.
- Content lives in two namespaces: `content/resources/` (publishable) and
  `content/agent/` (the agent's private context, never shown on the site).

---

## 2. Installation

### 2.1 Install the engine CLI (end users)

One-line install — auto-detects your OS/CPU (macOS / Linux, Intel / ARM) and
downloads a prebuilt binary:

```sh
curl -fsSL https://raw.githubusercontent.com/Qingbolan/Silan-Personal-Website/main/engine/install.sh | sh
```

The installer: ① detects OS/CPU; ② downloads the matching binary from GitHub
Releases; ③ installs it to `~/.local/bin/silan-viking`; ④ prints the next
command. If no prebuilt binary exists for your platform, it **falls back to
building from source** with cargo (needs the Rust toolchain — see
[rustup.rs](https://rustup.rs)).

**Options** (via environment variables):

```sh
# install somewhere else
curl -fsSL .../install.sh | SILAN_INSTALL_DIR="$HOME/bin" sh
# pin a specific release
curl -fsSL .../install.sh | SILAN_VERSION="v0.1.0" sh
```

**Add it to PATH** — if the installer says `~/.local/bin` is not on your PATH,
add this line to `~/.zshrc` or `~/.bashrc` and restart the shell:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Verify:

```sh
silan-viking --help        # list all commands
```

### 2.2 Engine developers (build from the repo source)

```sh
cd engine
./install-dev.sh           # build & install from the current checkout via cargo
```

See `engine/INSTALL.md` for details.

### 2.3 Backend / frontend dependencies

Only needed if you run or self-deploy the backend/frontend:

- **Backend**: Go 1.21+ (`go build` in `backend/`)
- **Frontend**: Node.js 18+ (`npm install` in `frontend/`)
- **Deploy**: Docker + Docker Compose (`deploy/docker-compose.yml`)

---

## 3. From zero to a running site

`silan-viking` walks you through everything — you never have to memorize the
command surface. The key command is **`guide`**: run it any time and it reads
the project state and tells you the next step.

```sh
mkdir my-site && cd my-site

silan-viking init          # scaffold: content/ + config + SCHEMA.md,
                           # prints the next steps at the end

silan-viking guide         # "what do I do now?" — re-run anytime

silan-viking index sync    # build the derived database from content/

silan-viking site preview  # build the site and preview it locally
```

`init` lays down `content/` (six content types + three seed items: a welcome
blog, an idea, a project), a `silan-viking.toml` config, and a `SCHEMA.md`.
From there `guide` reads the project state and points you at the right next
command.

![silan-viking init scaffold output](images/02-init.png)
*`silan-viking init` — prints the file tree it created and your numbered next steps*

![silan-viking guide next-step hint](images/03-guide.png)
*`silan-viking guide` — re-run anytime; it reads the project state and tells you what to do next*

> For the full step-by-step "from zero to a live site" walkthrough, see
> **§10 Case 1**.

---

## 4. Command reference

### 4.1 Content-type commands (six groups, each with new/list/show/edit/rm/archive)

```sh
silan-viking blog    new <slug>      # new blog post
silan-viking project new <slug>      # new project
silan-viking idea    new <slug>      # new idea
silan-viking episode new <slug>      # new episode
silan-viking resume                  # manage the resume
silan-viking update                  # manage updates

silan-viking blog list               # list all items of a type
silan-viking project show <slug>     # view an item's detail
```

### 4.2 Tool command groups

| Command | Purpose |
|---|---|
| `silan-viking init` | Scaffold the project |
| `silan-viking guide` | Stage-aware next-step hints |
| `silan-viking index sync` | Rebuild the derived database from `content/` |
| `silan-viking content show <silan://...>` | View content by URI |
| `silan-viking site preview` | Build and preview locally |
| `silan-viking site build` | Build the site artifact |
| `silan-viking site deploy` | Deploy to the server |
| `silan-viking stats` | Query remote runtime data (comments/likes/metrics) |
| `silan-viking proposal list / show / accept / reject` | Manage agent proposals |
| `silan-viking mcp serve` | Start the MCP server for agents (16 tools — see §5.4) |
| `silan-viking skill emit / status / rm` | Install / check / remove the agent skill — zero-config connection (see §5.5) |
| `silan-viking doctor` | Config and environment health check |
| `silan-viking config edit [--global]` | Edit config files |
| `silan-viking uninstall [--purge]` | Remove the install footprint |

---

## 5. Common task playbooks

### 5.1 Configure the CLI

After `init` there are two config files: the global
`~/.config/silan/config.toml` and the project-level `silan-viking.toml`.

```sh
silan-viking config edit --global    # global config (optional [llm] section)
silan-viking config edit             # project config (fill the [deploy] section)
silan-viking doctor                  # per-item ✓/⚠/✗ health check
```

The engine is **local-first by default** and runs without an LLM (it generates
content summaries with a rule-based method). Fill the `[llm]` section only if
you want smarter agent summaries (the API key is stored under
`~/.config/silan/`, never committed to any Git repo).

Key sections of the project `silan-viking.toml`:

```toml
[project]
name        = "my-site"
content_dir = "content"

[database]
path = "_deploy/api/portfolio.db"

[deploy]                          # needed only for `site deploy`
host         = "silan.tech"
user         = "deploy"
ssh_key_path = "~/.ssh/silan_deploy_ed25519"   # path only, never the key itself
```

### 5.2 Write a blog post

```sh
silan-viking blog new 2026-rust-notes    # scaffolds content/resources/blog/2026-rust-notes/
# edit en.md — the frontmatter template is already generated
silan-viking index sync                  # sync into the database
```

To publish: change the frontmatter `status` to `published`, then `index sync`.

### 5.3 Start an idea / project

```sh
silan-viking idea new rust-context-engine
# edit parts/overview/en.md
silan-viking index sync
```

idea/project are multi-Part: recording project progress means writing the
`progress` Part.

### 5.4 Connect an AI agent (MCP)

This is the **most powerful part** of the system: your content is not just
static files — it is a **live context an AI agent can safely read and write**.
The agent can search your entire history, turn a spark into a draft, push
projects forward, and look at visitor data — but any change that would go live
becomes a proposal first, and you make the call.

#### What MCP is

`silan-viking mcp serve` starts an **MCP server** (Model Context Protocol — the
standard for connecting AI clients to external capabilities). When an agent
connects it handshakes immediately: the server pushes the `SCHEMA` and a
project overview. From then on the agent can use the 16 tools below.

```sh
silan-viking mcp serve           # start the MCP server (port: see [mcp] in silan-viking.toml)
```

![silan-viking mcp serve output](images/08-mcp-serve.png)
*The MCP server is up, waiting for an agent to connect*

#### The 16 MCP tools, in four permission tiers

Tools are graded by how much impact they can have — **the higher the tier, the
closer to your source of truth, the higher the bar.**

**Tier 1 · Read-only (10 tools)** — pure queries, never change anything:

| Tool | What the agent uses it for |
|---|---|
| `recall` | Semantic search over all content ("have I written about Rust before?") |
| `list` | Structured list by type + status ("which projects are in flight") |
| `browse` | Browse the content tree |
| `read` | Read one item's summary |
| `context_brief` | Pull the owner/project digest — **the first thing an agent calls on connecting**, to understand what you're thinking about before acting |
| `lint` | Parser and schema health check |
| `stats` | View / like / comment counts |
| `visitors` | De-identified visitor list |
| `crawler_breakdown` | Visitor-kind breakdown (humans vs crawlers) |
| `source_breakdown` | Referrer-source breakdown |

**Tier 2 · Capture (1 tool)** — parks a thought, never touches published content:

| Tool | Purpose |
|---|---|
| `capture` | Drop a free-text note into a **proposal** (under `agent/notes/`). When you voice a half-formed thought, the agent uses this to catch it — without committing |

**Tier 3 · Agent private memory (4 tools)** — written in the `silan://agent/`
namespace, **takes effect directly, no proposal** (it never appears on the site):

| Tool | Purpose |
|---|---|
| `ctx_read` | Read the agent's own context |
| `ctx_write` | Write the agent's own context ("remember I prefer concise writing" lands here) |
| `ctx_brief` | A brief of the agent's memory |
| `reflect` | At session end, settle what was learned into long-term memory |

**Tier 4 · Publishable-content proposals (2 tools)** — these change content that
goes live to visitors, so **they must be confirmed by you**:

| Tool | Purpose |
|---|---|
| `propose` | Draft a content proposal (args `uri, draft, lang?=en`), anchored to a specific Item or Part; `lang` can create a non-English variant |
| `summarize_updates` | Draft a "recent updates" summary proposal |

#### The line that must not be crossed

This is the heart of the whole permission model, in one sentence:

> **An agent's changes to its own memory (`silan://agent/`) take effect
> directly; an agent's changes to any publishable content (resume / blog /
> project / idea …) always land on a Git proposal branch, and enter the source
> of truth only after you `proposal accept`.**

So you will never "wake up to find the agent quietly rewrote your resume." The
most it can do is hand you a draft.

#### Reviewing proposals

After the agent drafts with `capture` / `propose`, the change waits on a
`proposal/<id>` Git branch for you to handle:

```sh
silan-viking proposal list                 # see all pending proposals
silan-viking proposal show <id>             # view the actual change in a proposal
silan-viking proposal accept <id>           # accept: merge to main, land it as source of truth
silan-viking proposal reject <id>           # reject
```

After `accept`, remember to `silan-viking index sync`, then `site build/deploy`
to take it live.

### 5.5 Zero-config connection: silan-viking skill

§5.4 is the "manual `mcp serve` + configure the connection in your agent" path.
**A skill is the zero-config form of the same capability** — you install one
skill, and an agent like Claude auto-discovers and connects, with no connection
config to touch. The two paths have **identical capability** — they differ only
in *how you connect*.

```sh
silan-viking skill emit          # render and install the skill to ~/.claude/skills/silan-viking/
silan-viking skill status        # check install status
silan-viking skill rm            # remove the skill
```

![silan-viking skill emit output](images/09-skill-emit.png)
*`skill emit` — renders the skill into `~/.claude/skills/`; Claude auto-discovers it on next launch*

**What a skill is**: a small directory under `~/.claude/skills/silan-viking/`
containing `SKILL.md` (the skill definition) and `reference/mcp-tools.md` (the
MCP connection notes + the tool table).

**Why it never goes stale**: the skill is a **derived artifact** — `skill emit`
renders it live from your source of truth (`silan-viking.toml` +
`content/SCHEMA.md`). Change your content types, re-run `skill emit` once, and
it follows automatically — it never drifts.

**How it gets triggered**: `SKILL.md` describes **your natural language** ("I
have an idea", "I want to write an article", "see how many people read this") —
not tool names. Claude mounts the skill by matching *what you're doing*. You
don't memorize any command — you just talk normally, and the agent translates
that into the right MCP tool calls.

> In one line: `mcp serve` gives you the capability; `skill emit` makes that
> capability **automatically visible to agents**. For daily use, prefer the skill.

---

## 6. Publishing

```sh
silan-viking site build          # build the site artifact
silan-viking site deploy         # deploy to the server in silan-viking.toml [deploy]
```

The deploy pipeline is Docker-based (`deploy/docker-compose.yml`): Go API +
frontend + `portfolio.db`. **Runtime data (visitor comments, likes, metrics)
is produced only on the server** — your local `portfolio.db` does not contain
it. To inspect runtime data:

```sh
silan-viking stats               # query the server-side runtime data
```

---

## 7. Uninstalling

```sh
silan-viking uninstall           # remove the skill + derived files, keep your content/
silan-viking uninstall --purge   # also delete content/ and the config
```

`uninstall` prints exactly what it will delete and asks for confirmation. It
does **not** delete the `silan-viking` binary itself — remove it by hand with
`rm ~/.local/bin/silan-viking`.

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `silan-viking: command not found` | `~/.local/bin` is not on PATH — see §2.1 |
| Not sure the config is right | Run `silan-viking doctor`, check each ✓/⚠/✗ |
| Don't know the next step | Run `silan-viking guide` |
| Edited content but the site didn't change | After editing, run `silan-viking index sync`, then `site build/deploy` |
| Deploy fails on SSH | Check that the `[deploy]` `ssh_key_path` file exists |
| Can't see visitor comments/likes | That's runtime data, server-side only — use `silan-viking stats` |

---

## 9. Further reading

| File | Contents |
|---|---|
| `docs/silan-viking/OVERVIEW.md` | Design entry point, answers "how the system works" item by item |
| `docs/silan-viking/07-操作手册.md` | Full playbooks: line-by-line commands + screen output + file changes |
| `docs/silan-viking/02-cli服务.md` | Full CLI command list |
| `docs/silan-viking/03-mcp服务.md` | MCP tools and permission model |
| `docs/silan-viking/06-端到端.md` | The install→deploy backbone |
| `engine/INSTALL.md` | Engine installation in detail |
| `content/SCHEMA.md` | The content contract (shared source of truth for parser/CLI/MCP) |

---

## 10. Case studies — three complete scenarios

> The earlier sections are the "command reference"; this one is the
> "playbook you can follow and have it work." Each case starts from a real
> need and gives you, step by step, what to type, what the screen shows, and
> which screenshot goes with it.

### Case 1 · From zero to a live site

**Need**: I just installed `silan-viking` and want to turn it into a real
website.

**Step 1 — Create the project directory and initialize**

```sh
mkdir my-site && cd my-site
silan-viking init
```

`init` lays down `content/` (six content types + three seed items), the
`silan-viking.toml`, the `SCHEMA.md`, and runs `git init`. It prints the file
tree and numbered next steps.

![init output](images/02-init.png)

**Step 2 — Unsure what's next? Ask guide**

```sh
silan-viking guide
```

![guide output](images/03-guide.png)

**Step 3 — Write your first blog post**

```sh
silan-viking blog new my-first-post
# open content/resources/blog/my-first-post/en.md in your editor —
# the frontmatter template is generated; write the body. To publish,
# change status to published.
```

![blog new output](images/04-blog-new.png)

**Step 4 — Sync into the derived database**

```sh
silan-viking index sync
```

![index sync output](images/05-index-sync.png)

**Step 5 — Preview locally**

```sh
silan-viking site preview
# open the local URL it prints, check the page looks right
```

![site preview + the site in a browser](images/06-site-preview.png)

**Step 6 — Deploy live**

Fill the `[deploy]` section of `silan-viking.toml` first (see §5.1), then:

```sh
silan-viking site deploy --confirm
```

![site deploy output](images/14-site-deploy.png)

That's it — a live site like `silan.tech` is now running. After that, every
content change is just "edit → `index sync` → `site deploy`".

---

### Case 2 · Let an AI agent turn a spark into a draft

**Need**: I have an idea in my head and don't want to write it all from
scratch — I want the agent to catch it, draft it, and I just do the final
review.

**Step 1 — Install the skill so Claude auto-connects**

```sh
silan-viking skill emit
silan-viking skill status        # confirm status=installed
```

![skill emit output](images/09-skill-emit.png)

**Step 2 — Start the MCP server**

```sh
silan-viking mcp serve
```

![mcp serve output](images/08-mcp-serve.png)

**Step 3 — Just talk normally in Claude**

You don't memorize any tool name — just talk. On connecting, the agent first
calls `context_brief()` to understand what you're thinking about, then turns
your idea into a proposal with `capture`:

```
You:    I have an idea — writing a context engine in Rust. Capture it for me.
Claude: (calls capture) I've drafted an idea "A context engine in Rust" for
        you, on a proposal branch — you can review it with
        silan-viking proposal show.
```

![the conversation with the agent](images/10-agent-chat.png)

**Step 4 — Review the proposal**

Publishable content the agent drafts waits on a Git proposal branch for your
call:

```sh
silan-viking proposal list
silan-viking proposal show <id>
```

![proposal list](images/11-proposal-list.png)
![the diff from proposal show](images/12-proposal-show.png)

**Step 5 — Accept or reject**

```sh
silan-viking proposal accept <id>    # accept: merge into the source of truth
silan-viking index sync              # sync into the database
```

> At no step does the agent bypass you — it can draft, but "publish or not" is
> always your nod.

---

### Case 3 · Day-to-day content maintenance

**Need**: the site is live; I want to keep updating it and see if anyone is
reading.

**Update a project's progress**

```sh
silan-viking project progress silan-viking
# edit the progress Part's markdown, write up this round of progress
silan-viking index sync
silan-viking site deploy --confirm
```

**Add a Chinese version of existing content**

```sh
silan-viking blog add-lang my-first-post zh
# edit the newly generated zh.md, write the Chinese body
silan-viking index sync
```

**Check visitor data**

Runtime data (views, likes, comments) is produced only on the server; query it
remotely with `stats`:

```sh
silan-viking stats
```

![stats output](images/13-stats.png)

**Two catch-all commands for when you're not sure**

```sh
silan-viking guide      # what should I do now
silan-viking doctor     # is the config / environment healthy
```

> The daily loop is one line: **edit markdown → `index sync` → `site deploy`**.
> Let `guide` and `doctor` cover the rest.
