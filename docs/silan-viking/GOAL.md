# GOAL · silan-viking terminal state (sharpened)

> This file is the **single-page goal nail** for silan-viking. Every PR,
> every doc, every agent behaviour must point back to a line here; if it
> can't point back, delete it.
> Detailed derivations live in `00-end-state-and-requirements.md` /
> `16-terminal-artifact-delivery-deploy.md` / `17-single-source-of-truth.md`.

---

## 1. One sentence

**silan-viking is silan's one-person context system.**
markdown is the source of truth; the Rust engine (`silan`) incrementally
syncs it into a SQLite derived cache that feeds the website; collaborating
agents read and write the context through MCP; the personal website is an
outward projection of the `visibility=public` slice of that context.
**Single-tenant, single-device, content-driven, agent-native.**

**Non-goals (here to block drift)**
- ❌ Not a CMS — the owner manages "ideas", not "a website"
- ❌ Not a multi-tenant SaaS — single-tenant is nailed (`17` §17.3)
- ❌ Not a cross-device consistency system — multi-device relies on manual `git push/pull`
- ❌ Not a compatibility layer for the legacy Python `silan` — the old repo is archive only

---

## 2. Terminal-state run tape (owner view)

```
$ cargo install silan-viking         # or curl|sh / pip install silan-viking
$ silan init                          # lay content/ + toml + git under ~/.silan-viking/
$ silan idea new "kv-store-on-iouring"
$ vim .../parts/overview/zh.md
$ silan index sync                    # incremental sync into _deploy/portfolio.db
$ silan site deploy --confirm         # local or remote Docker deploy, zero Node, zero Go
```

On the agent side (a Claude with the silan skill installed):
voice a thought → `recall` finds the old idea → `ctx_write` adds to it
→ days later `capture` drafts → proposal branch → owner `silan proposal accept <ulid>`
→ content matures → agent proposes `visibility=public` → accept → `silan site deploy`
→ site goes live (sitemap / robots / JSON-LD / per-page meta / pre-rendered HTML all there)
→ visitor comments/views land only on the server
→ owner `silan stats <slug>` queries the visitor fingerprint + traffic source remotely.

---

## 3. Disk terminal state (four piles — mix them and you've drifted)

```
① /usr/local/bin/silan                   binary=silan-viking, enters PATH as silan
② ~/.config/silan/config.toml            cross-project config (XDG)
③ ~/.silan-viking/                       content project (--path overrides)
   ├─ silan-viking.toml                  [identity]/[database]/[deploy]
   ├─ _deploy/portfolio.db               ★ derived cache, rebuildable
   └─ content/                           ★ only source of truth, a git repo
      ├─ SCHEMA.md  index.md  log.md
      ├─ resources/{blog,ideas,projects,episode,resume,update}/<item>/parts/<role>/{meta.toml,<lang>.<ext>}
      └─ agent/{project,notes,silan,sessions}/     ← never published
④ engine/crates/silan-viking-{base,content,entities,app,cli,mcp,site}  engine devs only
```

---

## 4. Object model (L1–L4 strictly unidirectional, crate boundaries enforce it)

| Layer | Crate | Core |
|---|---|---|
| L1 base | `silan-viking-base` | errors / URI / ULID / hash / fs / tracing |
| L2 content | `silan-viking-content` | `Namespace` / `Collection` / `Item` / `Part` / `File`, SCHEMA parse, Part shape closed set `prose / entry_list / key_value_list` |
| L3 app | `silan-viking-app` | `Workspace` / `Parser` (6 impls) / `Mapper` / `Sink` / `RowSet` / `WriteLock` trait (`FileWriteLock` is the sole impl) |
| L4 adapter | `silan-viking-{cli,mcp,site}` | three outward faces, no cross-dependency |

**The 6 content types are a compile-time closed set**: `idea / blog / project / episode / resume / update`.
Adding a type = edit L2/L3 + rebuild + bump major.
**Adding a tab needs no rebuild**: edit the `parts` list in `content/SCHEMA.md`; the parser is config-driven.

---

## 5. Service surface

### CLI `silan` — for humans
- **8 tool groups**: `content / index / relation / site / stats / proposal / mcp / skill`
- **6 type groups**: `idea / blog / project / episode / resume / update`, each with `new/list/show/edit/rm/archive` + type-specific operations
- Style is locked **noun-first**: `silan <noun> <verb>` (matches EasyNet-Cli)

### MCP `silan mcp serve` — for agents
Tool count is a closed set, authoritative table in `17` §17.2:

| Stage | Tool count |
|---|---|
| **M9 (current terminal state)** | **18** |
| E1 | 21 (+`suggest_relations/parts/lifecycle`) |
| E2 | 22 (+`propose_schema`) |

`deploy` is hidden by default; `--enable-deploy` is required to surface it.
The handshake pushes `silan://schema` + `silan://overview` + `silan://agent/brief`.

### Site `silan site deploy` — for the world
Single form: **binary ships pre-built artefact tars + Docker multi-stage isolated build** (`16`).
- `build.rs` `include_bytes!`s `frontend.tar.gz / backend.tar.gz / deploy.tar.gz` into the binary at compile time
- deploy = extract tars to staging → `docker compose` multi-stage build → boot
- user-side dependency collapses to **one thing**: Docker (plus SSH for remote)
- automatically produces crawler artefacts: sitemap + robots + JSON-LD + per-page meta + pre-rendered HTML for public pages

### Skill `silan skill install` — zero-config agent onboarding
Emits a skill bundle → install it into Claude → MCP auto-discovered → calls the engine when the owner talks / writes / pushes a project forward.

---

## 6. Data flow (grep-verifiable)

### Content (bidirectional, the git repo is the source of truth)
```
owner writes md ─┐
                 ├─▶ content/*.md (git commit)
agent proposes ──┘                │ silan index sync (hash-incremental)
                                  ▼
                        _deploy/portfolio.db (derived cache)
                                  │ silan site deploy
                                  ▼
                        server portfolio.db (content tables) + frontend
```
Agent write path: `ctx_write` / `reflect` / `propose` go through a `proposal/<ulid>` branch
+ `agent-write.lock` file lock + `expected_head` optimistic lock; only `silan proposal accept` merges.

### Runtime data (one-way, server only)
visitor comments / view pings / kind detection (human / search-engine / AI crawler) →
server `portfolio.db` tables `comment / content_interaction / request_logs / stats_cache_*` →
`silan stats` / MCP `stats` query remotely.
**Runtime data is always empty locally — this is the design, not a bug.**

### Promote allowlist (iron rule)
- **Derived tables** (`blog_posts / ideas / projects / episodes / episode_series / resume / recent_updates / item_part / part_entry / content_relation / annotation / …`) → **replaced**
- **Runtime tables** (`comment / content_interaction / request_logs / stats_cache_*`) → **preserved**
- `site promote` must run **locally on the control machine** with scp pull/swap/push; overwriting the live db directly with a local one = lost comments = forbidden (`16` §16.5 bug #6).

---

## 7. Acceptance matrix (each row maps to a `#` in `00` §0.2)

| # | Acceptance check | Mechanical verification |
|---|---|---|
| 1 | md→SQLite→Docker | `silan init && silan index sync && sqlite3 portfolio.db "select count(*) from blog_posts"` |
| 2 | 6 types + parts/role | the 6 directories all exist; CLI rejects a 7th type |
| 3 | container series + collection series coexist | `episode/<series>/<ep>/` parses into `episode_series + episodes`; promote does not hit an FK violation |
| 4 | idea→blog→project evolution | `content_relation` carries three distinct items + an `evolves_into` edge |
| 5 | container-series episodes don't show in blog lists | `/api/v1/blog/posts` returns no episode rows |
| 6 | Rust engine + Go backend + Python archived | `engine/` builds and runs; `silan/` referenced only by docs |
| 7 | OOP + SCHEMA-first | `crates/` has the four physical-boundary layers; `SCHEMA.md` is in git |
| 8 | noun-first CLI | `silan idea new` works; `silan new idea` errors |
| 9 | naming | binary=`silan-viking`, PATH name=`silan`, protocol=`silan://` |
| 10 | agent read / write / publish | the 18 MCP tools all present; propose→accept goes through a git branch |
| 11 | agent maintains the site | the MCP `deploy` tool (`--enable-deploy`) works |
| 12 | capture → write → project → deploy | the §2 tape runs end-to-end |
| 13 | single-tenant | `agent-write.lock` is a file lock; docs make no cross-device promise |
| 14 | crawler artefacts | sitemap / robots / JSON-LD / per-page meta / pre-rendered HTML each exist as files |
| 15 | live data + visitor identification | `silan stats <slug>` returns `referrer_kind ∈ {search, social, ai_chat, direct, internal}` |
| 16 | skill zero-config | the skill bundle from `silan skill install`, once installed into Claude, auto-discovers MCP |

---

## 8. Current → terminal: execution checklist

### 🔴 Blocks the terminal state (must do)
- [x] **M0.5b · Go ent catch-up**: switch to unified `content_tag` + `tag` ent; drop the `BlogTag` / `IdeaTag` / `BlogPostTag` schemas; remove the legacy edges from blogpost.go / idea.go; add the four `stats_cache_{item,visitor,crawler,source}` ent schemas; regenerate via `ent generate`
- [x] **M0.5b · Go logic catch-up**: `getblogtagslogic` / `getideatagslogic` already read `content_tag` via raw SQL through `internal/contenttag` (earlier implementation), consistent with the engine writer
- [ ] ~~**M0.5b · frontend resume rebuild**: consume the new `item_part / part_entry` model~~ (frontend work, separate PR)
- [x] ~~**M0.5b · one-shot migration script**~~: audit found the legacy `blog_tags` / `idea_tags` tables already empty (nothing writes them); a re-sync naturally populates `content_tag`, so no script needed
- [x] ~~**Non-blog detail handlers**~~: audit found these were back-filled on 2026-05-17 — `episode/:slug`, `update/:slug`, `idea/:id` (→ unified to `:slug`), `project/:slug`, `resume` (single-Item type, no `:slug` needed) all working
- [x] **Unify idea detail to `:slug`**: aligns with the blog/episode/update/project convention; `api/backend.api` + `types.go` + `routes.go` + `getidealogic.go` updated, build clean
- [x] **deploy #1**: `silan-viking-cli/src/main.rs` `ssh` closure upgraded to `.output()` to capture stderr; recognises `Permission denied` and emits a `chown` guidance message
- [x] **deploy #2**: the `[4/6] ship` step now runs `rm -rf images.tar snapshot.db docker-compose.yml proxy.conf` right after `mkdir -p`, clearing any same-name directories left behind by a failed previous deploy

### 🟡 E-stage (self-evolution)
> **Outside the current GOAL scope**: GOAL §5 nails M9=18 tools as the current terminal state; E1/E2/E3 are scheduled by `04` to land after M9. The docs (`15`) and JSON schemas (`15` §15.5.1) are ready, but **implementation belongs to the next stage, not GOAL closure**. Scope estimate in §11.
- [x] **Close M9 with `deploy`** ← real GOAL §5 gap: the original `tool_specs()` had only 17 entries, not the documented 18. Added `ToolTier::Deploy` + the `deploy` ToolSpec + dispatch arm (refuses the call by default, points the user at the CLI `silan site deploy`); added `ToolGate { deploy, evolve }` + `advertised_tool_specs(gate)`; the server filters deploy/evolve out of `tools/list` by default
- [x] **E1 three-tool stubs**: `suggest_{relations,parts,lifecycle}` ToolSpec + dispatch landed per the `15` §15.5.1 JSON schema; returns empty `suggestions[]` (schema-legal); gated the same way (`evolve: true` required to advertise); brings the code-side closed-set to 21
- [x] **MCP gate test pinning**: closed_set=21, default surface=17, 6 tiers covered (ReadOnly / Capture / AgentContext / Proposal / Deploy / Evolve) — matches the `17` §17.2 table
- [ ] **E1 algorithm implementation** (next stage): turn the three stubs' suggestions from `[]` into actual inference — ~500-600 lines of Rust
- [ ] **E2** (next stage): MCP +1 `propose_schema` + `silan schema check` three-way consistency gate + a `schema-proposal` proposal sub-kind — ~1500-2000 lines of Rust
- [x] **Drift self-check on CI**: the `17` §17.4 checklist became code — `engine/scripts/check_docs_drift.py` (six checks: 6-type closed set, MCP tool count M9/E1/E2, idea.status enum, referrer_kind typos, Part shape closed set, 8 CLI command groups); wired into `engine-ci` as the `docs-drift` job; doc changes also trigger it

### 🟢 Non-blocking, on the books
- [x] Cross-platform container cargo incremental-cache pitfall — `16` §16.7 promoted to a "fixed / on the books" section with a concrete mitigation (use an isolated `CARGO_TARGET_DIR`)
- [x] `silan content lint --drift` — `content lint [<uri>] [--drift]` shipped; `--drift` invokes `engine/scripts/check_docs_drift.py`; gives a clear degraded message when run outside the source checkout

---

## 9. Invariants (violate any one = automatic reject)

1. **The 6 types are a compile-time closed set** — adding a 7th requires editing Rust + a major version bump
2. **The source of truth is the `content/` git repo** — `portfolio.db` can be `rm`-ed and rebuilt by `silan index sync` at any time
3. **Runtime data lives only on the server** — local runtime tables are always empty, no "sync back to local"
4. **User-side dependency is only Docker** (plus SSH for remote) — never assume "the user installs Node/Go"
5. **Agents must write content through proposals** (git branch + `expected_head` + `agent-write.lock`) — no direct writes to the main branch
6. **Single-device assumption** — every "cross-device consistency" promise must explicitly note "relies on manual git sync"
7. **CLI is noun-first; MCP tool count is a closed set** (M9=18) — adding a tool must synchronously update `17` §17.2 + `03` §3.2 + `04` E-stage acceptance
8. **Promote replaces derived tables only**, runtime tables are preserved — fail this and you lose live comments
9. **`build.rs` only tars sources**, it never runs npm/go — the real compilation happens in Docker multi-stage
10. **Cross-host ship never transfers the binary** (the architecture may not match) — `promote` does the local scp pull/swap/push from the control machine

---

## 10. One-sentence summary

> **Anyone with Docker installed brings their own website online with three commands** (`cargo install` → `silan init` → `silan site deploy`).
> **Writing markdown is updating the website; talking to an agent extends your context; the agent proposes changes through proposals and a single owner `accept` publishes.**
> **There is no "managing a website" in this picture — only "managing ideas".**
