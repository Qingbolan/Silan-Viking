# silan-viking usage manual (for non-developers)

> You only need to write markdown. silan-viking turns it into a deployable
> personal website and lets any collaborating agent read your context.
> **Single-tenant, single-device, content-driven.**

The only thing you need installed: **Docker**.

Every command below is copy-paste runnable.

---

## 0. One-time install

```bash
# Pick one:

# Option A: cargo install (recommended — fully automatic)
cargo install silan-viking

# Option B: from source (developers)
git clone https://github.com/Silan-Hu/Silan-Personal-Website.git
cd Silan-Personal-Website/engine
cargo install --path crates/silan-viking-cli

# Option C: one-shot script (simplest)
curl -fsSL https://raw.githubusercontent.com/Silan-Hu/Silan-Personal-Website/main/engine/install.sh | sh
```

Once installed, the `silan-viking` binary appears on PATH as `silan` (add an
alias yourself if your installer didn't).

Verify:

```bash
silan-viking --version    # should print the version
```

---

## 1. Create a new project

```bash
silan-viking init
```

By default this lays the project under `~/.silan-viking/`. To pick a different location:

```bash
silan-viking --content /path/to/project/content \
             --db      /path/to/project/_deploy/portfolio.db \
             init
```

After it runs, your project looks like this:

```
~/.silan-viking/
├── silan-viking.toml           # project config (identity / database / deploy)
├── content/                    # ← where you write markdown (a git repo)
│   ├── SCHEMA.md               # the 6 content type definitions (don't touch)
│   ├── resources/
│   │   ├── blog/      ideas/      projects/
│   │   ├── episode/   resume/     update/
│   └── agent/                  # the agent's own context memory
└── _deploy/
    └── portfolio.db            # derived cache (rebuildable)
```

---

## 2. Write your first piece of content

### Write a blog post

```bash
silan-viking blog new my-first-post
```

This generates:
```
content/resources/blog/my-first-post/
└── parts/
    └── body/
        ├── meta.toml
        └── en.md             # ← edit this
```

Open `en.md`, write markdown, save. Sync into the database:

```bash
silan-viking index sync
```

### Write an idea (a half-formed thought)

```bash
silan-viking idea new kv-store-on-iouring
# edit content/resources/ideas/kv-store-on-iouring/parts/overview/en.md
silan-viking index sync
```

### Maintain a project

```bash
silan-viking project new silan-viking
# edit content/resources/projects/silan-viking/parts/overview/en.md
silan-viking index sync
```

---

## 3. Content lifecycle — six statuses

| status | applies to | meaning |
|---|---|---|
| `draft` | blog / idea / project | draft, not public |
| `hypothesis` | idea | a hypothesis has formed |
| `experimenting` | idea | running experiments |
| `validating` | idea | validating findings |
| `published` | blog / idea | public |
| `concluded` | idea | wrapped up |

Edit the frontmatter at the top of `parts/<role>/en.md`:

```yaml
---
slug: my-first-post
title: My First Post
kind: blog
status: published        # ← change here
visibility: public       # ← change here
---
```

Then `silan-viking index sync`. **Only content with `visibility: public` goes live.**

---

## 4. Inspect / list / check

```bash
# List every idea
silan-viking idea list

# Show one specific item
silan-viking content show silan://resources/blog/my-first-post

# Browse the whole content tree
silan-viking content tree

# Run health checks (content consistency + doc drift)
silan-viking content lint
silan-viking content lint --drift    # only meaningful inside a source checkout
```

---

## 5. Deploy to the web

### 5.1 Configure the deploy target

Edit `silan-viking.toml`:

```toml
[deploy]
mode      = "ssh"                 # or "local" for self-hosting
host      = "your-server.com"
ssh_user  = "deploy"
ssh_key_path = "~/.ssh/id_ed25519"
ssh_port  = 22                    # change here for a custom port
remote_dir = "~/silan-viking"     # prefer a path under the deploy user's home
```

### 5.2 One command to ship

```bash
silan-viking site deploy --confirm
```

What it does:
1. Extract the bundled frontend/backend/deploy tars
2. `docker compose` multi-stage build (npm/go run inside containers, never on your host)
3. `docker save` the images → SSH `scp` them to the target
4. On the target: `docker load` + `compose up`
5. Promote derived tables (runtime data untouched)
6. Restart backend + proxy

**Target host needs only: Docker + sshd.** No Node / Go / source.

### 5.3 Local mode (run on your own machine)

```toml
[deploy]
mode = "local"
host = "localhost"
```

Then `silan-viking site deploy --confirm`. It boots docker compose locally; visit `http://localhost:8080`.

### 5.4 Deploy troubleshooting

If it fails:

| Error | Fix |
|---|---|
| `remote_dir 'xxx' is not writable by the deploy user` | The message already tells you: either `sudo chown $USER xxx`, or pick a `remote_dir` under the user's home |
| `ssh: connection refused` | Check `ssh_port`, the target's sshd, the firewall |
| `docker save failed` | The local Docker daemon isn't running |
| Backend up but the frontend won't load | Wait about 30 seconds — the proxy needs time to pick up the new backend |

---

## 6. Let an AI agent read your context

### 6.1 Install the silan-viking skill into Claude

```bash
silan-viking skill install
```

This lays a skill bundle under `~/.claude/skills/silan-viking/`. Open Claude and it auto-discovers the skill and connects to MCP.

### 6.2 Start your own MCP server

```bash
# For a local script / tool to call
silan-viking mcp serve --stdio

# Let the agent maintain the website (off by default)
silan-viking mcp serve --stdio --enable-deploy

# Let the agent help evolve the SCHEMA (off by default)
silan-viking mcp serve --stdio --enable-evolve
```

Tool count: default 17 / `--enable-deploy` 18 / `--enable-evolve` adds 3 = 21.

### 6.3 Verify the MCP server is up

```bash
silan-viking mcp serve | grep '^tool=' | wc -l   # should print 17
silan-viking mcp status                          # self-check
```

### 6.4 Review proposals the agent wrote

When an agent writes content through MCP, it first creates a `proposal/<ulid>` git branch — it never merges directly. You review:

```bash
silan-viking proposal list           # pending proposals
silan-viking proposal show <id>      # see the diff
silan-viking proposal accept <id>    # accept → merge → triggers a sync
silan-viking proposal reject <id>    # discard
```

---

## 7. Read visitor data (after deploy)

Visitor / comment data live only on the server. Pull a cache locally and query:

```bash
# Sync once (pull server stats into the local cache)
silan-viking stats sync silan://resources/blog/my-first-post

# Query
silan-viking stats show     silan://resources/blog/my-first-post
silan-viking stats visitors silan://resources/blog/my-first-post
silan-viking stats crawlers silan://resources/blog/my-first-post
silan-viking stats sources  silan://resources/blog/my-first-post
```

You get visitor kind (human / search_bot / ai_bot / unknown) and source (search / social / ai_chat / direct / internal).

---

## 8. Restore on a new machine

```bash
git clone <your-content-repo>  ~/.silan-viking/content
cd ~/.silan-viking
silan-viking init --here       # only generate silan-viking.toml + _deploy/
silan-viking index sync        # rebuild the local database
```

**Note**: comments / visitor stats are server-native; the local database
won't automatically have them. Use `silan-viking stats sync` when you
want to see them.

---

## 9. Cheat sheet

| What you want | Command |
|---|---|
| Write a new blog | `silan-viking blog new <slug>` |
| Write a new idea | `silan-viking idea new <slug>` |
| Sync into the database | `silan-viking index sync` |
| Fully rebuild the db | `rm _deploy/portfolio.db && silan-viking index sync` |
| Go live | `silan-viking site deploy --confirm` |
| Local preview | `silan-viking site preview` |
| Health check | `silan-viking content lint` |
| What should I do next? | `silan-viking guide` |
| Start MCP | `silan-viking mcp serve --stdio` |
| Install the Claude skill | `silan-viking skill install` |
| Read visitor data | `silan-viking stats sync <uri> && silan-viking stats show <uri>` |
| Version | `silan-viking --version` |
| Help | `silan-viking --help` or `silan-viking <noun> --help` |

---

## 10. Don't do these

1. **Don't edit `_deploy/portfolio.db` by hand** — it's derived; any `silan-viking index sync` overwrites your changes. Edit markdown and let sync do its job.
2. **Don't put `content/` outside a git repo** — content is your source of truth; no git means no history.
3. **Don't hand-edit `portfolio.db` on the server** — its content tables are replaced by promote. To change content, edit local markdown, sync, deploy.
4. **Don't overwrite the server's `portfolio.db` with your local one directly** — the server's runtime tables (comments, visitors) live only there; overwriting = lost comments. `silan site promote` already handles this correctly.
5. **Don't `sudo silan`** — it doesn't need root. The only thing that needs root is `chown remote_dir` on the target once.

---

## 11. When you're stuck

```bash
# Step 1: ask silan what it thinks you should do next
silan-viking guide

# Step 2: run a health check
silan-viking content lint

# Step 3: self-check
silan-viking mcp status
silan-viking site status

# Step 4: fully rebuild the local db (doesn't touch your source of truth)
rm _deploy/portfolio.db
silan-viking index sync
```

If you're still stuck, see `docs/silan-viking/GOAL.md` (the terminal-state picture) and `docs/silan-viking/OVERVIEW.md` (the index).
