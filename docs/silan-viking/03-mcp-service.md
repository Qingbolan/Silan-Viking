# 03 · MCP service surface (collaborating-agent integration)

> Serves requirements `#10 #11 #12`.
> `silan mcp serve` starts an MCP server that exposes `Workspace`'s
> capabilities to **any agent that collaborates with silan** (the
> "collaborating agent"). This is where the terminal-state goal
> "capture ideas + context enrichment" actually lands.

MCP tools come in four tiers; **mutability follows the tier**.

## Tier 1 — read-only: understand silan (context enrichment, #12) + interaction-data queries (#15)

| MCP tool | Purpose |
|---|---|
| `recall(query)` | Semantic search across the owner's content; returns matching Item summaries |
| `list(type, [filter])` | Structured list of Items of a given type: slug / title / status / evolution relations. `filter` supports `status`, recently-modified — symmetric with the CLI `silan <type> list` |
| `browse(uri)` | Browse the `content/` directory structure |
| `read(uri)` | Read the body of one Item |
| `context_brief()` | **Core**: returns a condensed brief of "what silan is currently thinking about" — so a new agent understands silan from day one |
| `lint()` | Content health report (#11) |
| `stats(uri, [section])` | Live interaction stats for an Item / chapter: views / likes / comments (#15) |
| `visitors(uri)` | Visitor details for that content: fingerprint / IP / visitor_kind / referrer_kind (#15) |
| `crawler_breakdown([uri])` | Aggregated by visitor kind: human / search engine / AI crawler; per-crawler scrape count (#15) |
| `source_breakdown([uri])` | Aggregated by source: search / social / AI chat / direct / on-site referral (#15) |

> The four `#15` tools (`stats` / `visitors` / `crawler_breakdown` /
> `source_breakdown`) **map one-to-one to** the `silan stats`
> command group (`02-cli-service.md`'s `show` / `visitors` /
> `crawlers` / `sources`) — same `#15`, CLI and MCP carve it the
> same way; there is no asymmetry of "three tools on one side, four
> commands on the other". They follow the **sync-then-query model**
> (an owner-decided design change): runtime data (comments / pings)
> lives only on the production server (`01` §1.8); `silan stats sync`
> pulls it through the Go API into the local `portfolio.db`'s
> `stats_cache_*` tables, and these four MCP tools share the same
> local cache with the CLI read commands (`02` §`silan stats`). CLI
> for silan, MCP for collaborating agents, one cache, no two
> implementations. They are **read-only**: agents / owner can see
> interaction data but cannot edit it — pings are written by the Go
> API into the server's db when a visitor visits. When the cache
> hasn't been `sync`-ed, the tool returns `backend_unavailable`.

> **Why `list` exists — closing the agent's query-surface asymmetry**:
> `recall` is semantic search, `browse` is directory traversal,
> `read` is single-document read — all three lack a **structured
> list**. When an agent wants to "go through every project with
> status=building" or "list recently changed ideas", without `list`
> it must `browse` the whole tree and `read` document by document —
> inefficient, and it doesn't surface structured fields like
> `status`. The CLI side has `list` + `--status` filters in every
> one of the 6 type groups; the MCP side didn't — an asymmetry
> against `#10` "agents can search". With `list(type, filter)`
> added, the agent's query story is three-layered: `list` for the
> roster → `recall` for semantic location → `read` for detail.
> `list` is source-symmetric with CLI `silan <type> list` and reads
> the local `content/` (not remote — opposite to the `stats` group).

## Tier 2 — capture: write thoughts into context (#12)

| MCP tool | Purpose |
|---|---|
| `capture(note, type)` | The agent captures one of the owner's thoughts during a conversation → opens a new-Item proposal (see §3.1) |

## Tier 2.5 — agent context: read and write `silan://agent/` directly (#12)

> `agent/` is the agent's own namespace (`01` §1.2.1) — its
> understanding of the project, its notes, its understanding of the
> owner, session summaries. This pile is **written directly by the
> agent, not through proposals** — it's the agent's memory, not
> published content (§3.1 "memory-class is directly editable").

| MCP tool | Purpose |
|---|---|
| `ctx_read(uri)` | Read a context file under `silan://agent/` (the agent's own memory / understanding) |
| `ctx_write(uri, content)` | **Direct write** to `silan://agent/` — no proposal, no owner `accept` |
| `ctx_brief()` | When a new agent joins, condense `agent/` into a "project understanding handed down by the previous agent" brief |
| `reflect(session)` | At the end of a session: settle this conversation into `agent/sessions/` and `agent/owner/` (OpenViking-style self-evolution) |

> **Why direct write, not proposal**: when an agent edits
> `resources/` (published content) it goes through a proposal —
> that is the owner's work and the owner is the author. `agent/` is
> the agent's own memory and the agent **is** its author — making
> silan review the agent's own notebook makes no sense.
>
> **Load-bearing boundary**: `ctx_write` only accepts URIs prefixed
> with `silan://agent/`. The engine enforces this at the
> `Namespace` layer — a `ctx_write` against a `silan://resources/...`
> URI is rejected outright (`AgentNamespace.accepts_direct_write() == true`,
> `ResourceNamespace` is `false`, §1.2.1). The agent can never use
> `ctx_write` to bypass proposals and edit published content.
>
> **Never published**: the `agent/` namespace has
> `is_publishable() == false`; `SiteProjector` cannot reach it — no
> matter how much agent context exists, not a word of it can ever
> appear on the website (explicit design requirement).

### How agent/ memory is organised, and `reflect`'s write strategy

`agent/` is not a junk drawer for arbitrary writes. From M7 onward it has four fixed path classes:

```
content/agent/
├── owner/
│   ├── profile.md          # owner's stable preferences, long-term goals, working style
│   └── preferences.md      # writing / engineering / publishing preferences
├── project/
│   ├── brief.md            # current project state overview; ctx_brief reads this primarily
│   └── open-threads.md     # questions / risks still needing follow-up
├── notes/
│   └── <slug>.md           # topical notes the agent actively organises
└── sessions/
    └── YYYY/MM/DD/<ulid>.md # one immutable session summary per reflect
```

`reflect(session)` write rules:

1. Always write a new `agent/sessions/YYYY/MM/DD/<ulid>.md` first.
   This is an immutable audit record — only new files appended; old
   sessions are not retroactively edited.
2. Extract stable facts from the session and patch them into
   `agent/owner/*.md` and `agent/project/*.md`. Only write
   "still-holds-across-sessions" preferences, goals, constraints,
   and unfinished threads; one-off chit-chat does not enter
   owner / project.
3. Topical content goes into `agent/notes/<slug>.md`. When the same
   slug already exists, append a `## YYYY-MM-DD <ulid>` section
   rather than rewriting the whole file.
4. `ctx_brief()` reads only `owner/`, `project/`, and the most
   recent N session summaries; the brief is capped at 2k chars —
   when over budget, `project/open-threads.md` is preferred.

Merge strategy:

- `owner/profile.md` / `preferences.md`: patch by H2 heading; old
  content under the same heading is not removed unless a new fact
  explicitly supersedes it, in which case a `Supersedes:` audit
  line is kept.
- `project/brief.md`: replace the three fixed sections "Current
  state / Next / Risks".
- `project/open-threads.md`: merge by checkbox item; deduplicate
  same-name threads.
- `sessions/`: immutable; not merged.

This gives `reflect` a minimally implementable strategy: audit
first, condense memory next, control growth via `ctx_brief`.

### Git writes, concurrency, and audit for `ctx_write`

`ctx_write` doesn't go through proposals, but it still writes to the
same `content/` git repo, so atomic-write discipline is required:

1. `ctx_write` and `reflect` must hold the same write lock:
   `content/.git/silan/locks/agent-write.lock`. `proposal accept /
   rebase` must also acquire this lock before advancing the main
   branch, to avoid agent/ direct writes and resources/ proposal
   merges racing on HEAD.
2. Each `ctx_write` writes onto the current main branch and is
   allowed to stage only `content/agent/**`. If the working tree
   contains dirty files outside agent/, do not touch / do not
   stage / do not rollback those.
3. One `ctx_write` call = one commit; one `reflect` call = one
   commit which may include multiple `agent/` files. Commit
   messages are fixed: `agent: ctx_write <uri>` or `agent: reflect
   <session_ulid>`.
4. Record `expected_head` before commit; if `HEAD` after commit is
   not based on `expected_head`, return `conflict` and require a
   retry. Implementation: `git rev-parse HEAD` under the lock +
   `git commit` ensure single-process atomicity.
5. Every write writes commit trailers: `Agent-Tool: ctx_write|reflect`,
   `Agent-Uri: <uri>`, `Content-Hash: <hash>`.

Audit semantics: agent/ is the agent's own memory, so it doesn't
require owner accept — but it isn't a trace-less write either. Each
direct write has a git commit + tracing event; it can be reviewed,
reverted, and never bleeds into a proposal branch.

## Tier 3 — proposal: assisted writing / content editing (#10 #11)

| MCP tool | Purpose |
|---|---|
| `propose(uri, draft)` | Agent drafts / edits — `uri` can anchor at the whole Item **or at one Part (tab)** (see §3.1) |
| `summarize_updates()` | Agent drafts a changelog / recent-update; goes through a proposal |

> What `capture` / `propose` write is not the source of truth — it
> is a **proposal git branch**. `accept` / `reject` **are not** MCP
> tools — an agent can never merge its own drafts into the source
> of truth (`#10` invariant). The full mechanism is in §3.1.

## §3.1 The agent update path — how `capture` / `propose` actually lands

> Earlier drafts treated `capture` / `propose` / `accept` as three
> black-box verbs without pinning the proposal-area structure, the
> proposal granularity, or the validation checkpoints. This section
> fills that in — this is the actual chain for "can the agent
> reasonably update content".

### The proposal area = git branches

`content/` is a git repo (per revision B "versioning via git" — same
git line, no new dependency). Each agent `capture` / `propose`:

1. `silan-viking-mcp` cuts a **proposal branch** `proposal/<id>` off
   `content/`'s main branch — `id` uses a **ULID** (time-sortable;
   `silan proposal list` orders by time, which fits; not a
   `hash+timestamp` concatenation, which would collide).
2. The agent's draft is **written into the proposal branch with the
   exact same `content/` layout** — creating a new Item creates
   `content/resources/{type}/{slug}/` plus Part files; editing an
   Item edits the corresponding Part's `.md`. The file layout in the
   proposal branch is **identical** to the source of truth (Item /
   Part / File from §1.3).
3. `accept` / `reject` follow the "accept flow" below — **not** a
   `git merge` one-liner.

> Benefits: proposals are naturally versioned; you can `git diff` to
> see exactly what the agent changed; merges are clean.
> Cost: the MCP server's environment needs git; `content/` must be
> `git init`-ed first — same git line as revision B, self-consistent.

### Proposal granularity — anchor to a Part

`propose(uri, draft)`'s `uri` supports two anchoring levels:

| URI shape | Meaning |
|---|---|
| `silan://resources/ideas/<slug>` | Propose the whole Item (creation or large rewrite) |
| `silan://resources/ideas/<slug>/progress` | **Propose only the `progress` Part (tab)** |

When anchored to a Part, the proposal branch **only touches that one
`parts/<role>/` directory** (and its multilingual variants); the
other Parts are not touched. "The agent only adds the Progress tab"
is a single minimal change — `git diff` shows only that one file.
This relies on the `Part` model in §1.3: a Part is an independently
addressable unit.

> Multilingual: `propose` can target just one language variant of a
> Part (only `parts/progress/zh.md`, leaving `en.md` alone) —
> `Parsed`'s multilingual structure (§1.8.0) allows partial
> languages; missing languages keep their existing files.

### Two-tier validation — once at submit, once at accept

The agent writes a draft; structural correctness is enforced by
**validation**, not by humans reading carefully. The key point:
proposal branches have a lifetime; while waiting for review, the
`content/` main branch keeps moving (the owner is editing too), so
**validation must run twice**.

**Validation ① (at `propose` submit time)** — runs
`Parser::validate` + SCHEMA structural validation against the
proposal branch (are frontmatter fields complete, do Part filenames
match the §1.3.1 type definition). The result is stored in the
proposal metadata; failing proposals are marked red in
`silan proposal list`. This is **early feedback** — the agent learns
on the spot that its draft is shaped wrong.

> But validation ① **does not carry over to accept** — it was
> based on the main-branch snapshot at branch-cut time. The main
> branch can change after that (owner deleted a referenced Item,
> updated SCHEMA), and the proposal may no longer be valid.

### The accept flow — merge + validate in a staging area, only then advance the main pointer (load-bearing)

`silan proposal accept <id>` is **not** a `git merge` one-liner.
Key invariant: **the main branch has only two states — "untouched"
or "transitioned to a verified result"; no intermediate state
exists**. To achieve this, merge and validation **never happen on
main directly** (merging onto main and then rolling back means HEAD
genuinely moved, concurrent writes can lose commits, and during the
validation window an "already merged but unverified" state exists —
not atomic).

The correct flow: merge + validate happen in a **temporary worktree**
(`git worktree`):

```
1. git worktree creates a temporary worktree based on the current
   main HEAD.
2. In the staging worktree: git merge proposal/<id> (this produces a
   merge commit — the real historical record of "whose proposal,
   when merged", which is kept).
   Conflict → accept errors out. Main is untouched.
   silan proposal show <id> lists the conflict files; silan can use
   silan proposal rebase <id> to rebase the proposal onto the latest
   main, or resolve the conflict manually — conflicts are content
   disagreements between the agent's proposal and silan's edits, and
   only the content owner can adjudicate them; the engine does not
   auto-rebase (doesn't make content choices on behalf of humans).
3. Staging merge succeeds → validation ②: run Parser::validate + SCHEMA
   against the merge result in the staging area.
   Failure → error. Main is untouched.
4. Validation ② passes → advance the main pointer **atomically** to
   that verified merge commit in the staging area
   (`git update-ref`). At this moment main becomes the "verified
   result"; no intermediate commit exists.
* Exit cleanup: the temporary worktree created in step 1 is
  **unconditionally cleaned up** at the end of accept
  (`git worktree remove`) — success, validation failure, merge
  conflict, all three exits clean up. Implementation uses RAII /
  `defer` so no path has to remember it (§1.5 resource lifecycle).
```

- **Where the real atomicity comes from**: merge and validation
  happen entirely in the temporary worktree; the main HEAD **moves
  only at step 4**, and that single move is "the pointer atomically
  points at an already-verified commit" — not a fast-forward
  (because the merge in step 2 already produced a merge commit,
  main and the staging area have diverged, so ff isn't an option),
  it is an `update-ref`-style atomic pointer advance. Atomicity
  **doesn't depend on ff**: it depends on "the main pointer moves
  exactly once, and before it moves the result has been validated".
  Failure paths (conflict / validation failure) leave main **byte-
  for-byte unchanged** — no pseudo-atomic "merge then reset" tricks.
- **Validation ② (against the staged merge result) is the real
  gate** — it looks at "what the proposal looks like once merged
  into main", not at the proposal itself. It stops "proposal goes
  stale and dirties main when merged".
- Before step 4 advances the pointer, if the main HEAD has already
  moved (on the same machine, `ctx_write` / `reflect` interleaved
  with this `accept`), the staged merge is no longer based on the
  latest main → accept errors; silan retries (or rebases first).
  `expected_head` prevents **intra-machine** write interleaving and
  never loses commits. **Cross-device is outside this mechanism** —
  silan-viking is a single-device assumption; multi-device relies
  on manual `git push/pull` of the `content/` repo (see `17` §17.3).

`silan proposal rebase <id>` (CLI): rebases a proposal branch onto
the latest main, for stale proposals. `rebase` itself may produce
conflicts — same interaction as standard `git rebase`: stop in
conflict state; silan resolves manually and runs
`silan proposal rebase --continue`. It is a command silan invokes
manually; he is present, and he adjudicates conflicts.

> `accept` / `reject` / `rebase` remain **CLI-only and human-only**,
> not exposed to the agent (`#13`). Validation is the machine's
> job; accept is the human's — the machine guarantees structure,
> the human decides whether the content is worth taking and
> adjudicates conflicts.

## §3.2 MCP implementation-grade contract — JSON schema / error codes / resources

> This section fills the slot in `10` §10.8.2. When M9 writes
> `silan-viking-mcp`, this is the source of tool signatures; if a
> field name changes in M0 `SCHEMA.md`, M8 may only sync this
> section, not start a second implicit contract in code.

### Common return shape

Every tool returns a JSON object. On success: business fields. On
failure: the unified error shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "human readable summary",
    "uri": "silan://resources/ideas/example"
  }
}
```

Error codes: `silan-viking-mcp`'s `McpError` is **a semantic enum
with a `String` payload** (implementation choice — the early design
was "a closed set of code strings"; during implementation it became
a Rust enum variant per code, each variant carrying a human-readable
detail). Variant set:

| Variant | Triggers |
|---|---|
| `InvalidRequest` | wrong parameter type / missing required field, or `type` not in the 6-content-type closed set |
| `InvalidAgentUri` | `ctx_read` / `ctx_write` URI does not start with `silan://agent/` (including `..` traversal) |
| `Workspace` | Item / Part / URI does not exist, or a workspace operation failed |
| `Proposal` | `capture` / `propose` failed, the proposal did not pass SCHEMA validation, or a git conflict occurred |
| `BackendUnavailable` | stats local cache hasn't been `sync`-ed, or local git / SQLite is unavailable |
| `Io` | file read/write error |
| `UnknownTool` | a `tools/call` tool name not in the advertised 18-tool closed set (see below) |

> **The 18-tool closed set** (the basis for `UnknownTool`, also the
> full set advertised by `tools/list`):
> tier 1 — 10 read-only: `recall` `list` `browse` `read`
> `context_brief` `lint` `stats` `visitors` `crawler_breakdown`
> `source_breakdown`;
> tier 2 — 1 capture: `capture`;
> tier 2.5 — 4 agent context: `ctx_read` `ctx_write` `ctx_brief`
> `reflect`;
> tier 3 — 2 proposal: `propose` `summarize_updates`;
> tier 4 — 1 dangerous: `deploy` (not advertised by default;
> `--enable-deploy` is required to enter the closed set).
> Note that `context_brief` (tier 1, reads current published
> content) and `ctx_brief` (tier 2.5, reads `agent/` memory) are
> **two different tools** — do not merge. The E-stage `suggest_*` /
> `propose_schema` tools are not in these 18 — see `15` §15.5 and
> the E1/E2 milestones in `04`.

> The common return shape stays `{ "error": { ... } }`; `code` is
> the snake_case of the variant name (`invalid_request` /
> `invalid_agent_uri` / …); `message` is the variant's payload
> detail. This is a divergence from the earlier "6-value closed
> set": the implementation has finer variants (e.g.
> `permission_denied` split into `InvalidAgentUri`; `not_found`
> rolled into `Workspace`); the table above is aligned with the
> implementation.

### Read-only tool schemas

```json
{
  "recall": {
    "input": { "query": "string", "limit": "integer?", "scope": "uri[]?" },
    "output": { "items": [{ "uri": "uri", "title": "string", "summary": "string", "score": "number", "matched_parts": ["string"] }] }
  },
  "list": {
    "input": { "type": "idea|blog|project|episode|resume|update", "filter": "object?", "limit": "integer?", "cursor": "string?" },
    "output": { "items": [{ "uri": "uri", "slug": "string", "title": "string", "status": "string", "visibility": "string", "updated_at": "string?" }], "next_cursor": "string?" }
  },
  "browse": {
    "input": { "uri": "uri" },
    "output": { "entries": [{ "uri": "uri", "kind": "namespace|collection|item|part|file", "name": "string" }] }
  },
  "read": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "mime": "string", "content": "string" }
  },
  "context_brief": {
    "input": {},
    "output": { "project": "string", "schema_version": "integer", "content_commit": "string", "brief": "string", "suggested_next_reads": ["uri"] }
  },
  "lint": {
    "input": { "uri": "uri?" },
    "output": { "issues": [{ "level": "fatal|warn|info", "uri": "uri", "message": "string" }] }
  }
}
```

`filter` keys are restricted to `status`, `visibility`,
`updated_after`, `updated_before`, `tag`. Unknown keys return
`invalid_request`; they are not silently ignored.

### Stats tool schemas

```json
{
  "stats": {
    "input": { "uri": "uri", "section": "string?" },
    "output": { "uri": "uri", "views": "integer", "likes": "integer", "comments": "integer", "updated_at": "string" }
  },
  "visitors": {
    "input": { "uri": "uri", "limit": "integer?", "cursor": "string?" },
    "output": { "visitors": [{ "visitor_id": "string", "ip_masked": "string", "visitor_kind": "human|search_bot|ai_bot|unknown", "referrer_kind": "string", "last_seen_at": "string" }], "next_cursor": "string?" }
  },
  "crawler_breakdown": {
    "input": { "uri": "uri?" },
    "output": { "items": [{ "crawler": "string", "count": "integer", "last_seen_at": "string?" }] }
  },
  "source_breakdown": {
    "input": { "uri": "uri?" },
    "output": { "items": [{ "source": "search|social|ai_chat|direct|internal|unknown", "count": "integer" }] }
  }
}
```

MCP never returns raw IP / full fingerprint; only masked fields, same as `08` §8.4.

### Write and proposal tool schemas

```json
{
  "capture": {
    "input": { "note": "string", "type": "idea|blog|project|episode|resume|update", "lang": "string?", "title": "string?", "tags": ["string"] },
    "output": { "proposal_id": "string", "branch": "proposal/<id>", "created_uri": "uri", "validation": "passed|failed", "issues": ["string"] }
  },
  "propose": {
    "input": { "uri": "uri", "draft": "string", "lang": "string?", "message": "string?" },
    "output": { "proposal_id": "string", "branch": "proposal/<id>", "touched": ["uri"], "validation": "passed|failed", "issues": ["string"] }
  },
  "summarize_updates": {
    "input": { "since": "string?", "scope": "uri[]?" },
    "output": { "proposal_id": "string", "created_uri": "uri", "summary": "string", "validation": "passed|failed" }
  },
  "ctx_read": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "content": "string", "updated_at": "string?" }
  },
  "ctx_write": {
    "input": { "uri": "uri", "content": "string", "mode": "replace|append" },
    "output": { "uri": "uri", "content_hash": "string", "written_at": "string" }
  },
  "ctx_brief": {
    "input": {},
    "output": { "brief": "string", "source_uris": ["uri"] }
  },
  "reflect": {
    "input": { "session": "string" },
    "output": { "written": ["uri"], "content_hashes": ["string"] }
  }
}
```

`ctx_write.uri` must start with `silan://agent/`; otherwise the call
returns `permission_denied`. `capture` / `propose` always return
proposal info — never "published / merged".

### initialize and MCP resources

`initialize.instructions` fixed template:

```text
This MCP server exposes silan-viking, silan's personal context system.
First call context_brief(). Published resources are read/propose only.
Agent memory under silan://agent/ may be updated with ctx_write.
Never accept, publish, or deploy without an explicit owner CLI action.
Schema version: <schema_version>. Content commit: <content_commit>.
Useful resources: silan://schema, silan://overview, silan://agent/brief.
```

Read-only resources:

| URI | MIME | Body |
|---|---|---|
| `silan://schema` | `text/markdown` | the current `content/SCHEMA.md` |
| `silan://overview` | `text/markdown` | project identity, 6-type listing, common URIs |
| `silan://agent/brief` | `text/markdown` | a static snapshot of `ctx_brief()` |

## Tier 4 — dangerous: production side effects (#11)

| MCP tool | Default | Purpose |
|---|---|---|
| `deploy()` | **off** | Deploy to the website. Requires `silan mcp serve --enable-deploy` to surface; mandatory dry-run + owner confirmation |

> `publish` (setting an Item to public) is **not** given to the
> agent — the "selective publication" choice belongs to silan alone
> (`#13` single-tenant safety boundary). The agent can `propose`
> content; it cannot decide that the content goes public.

## General MCP security rules (single-tenant, `#13`)

- For `silan://resources/` (published content), the agent can
  **read**, **capture / propose** (into isolated git branches),
  **cannot write directly**, **cannot set public**, and by default
  **cannot** deploy.
- For `silan://agent/` (agent context, §1.2.1), the agent can
  **read and write directly** (`ctx_read` / `ctx_write`) — that is
  the agent's own memory; no proposal. But it has
  `is_publishable() == false` and is **never published**.
- Every change to the `resources/` source of truth goes through one
  explicit silan action on the CLI side.
- The result: the terminal-state pieces "capture ideas", "assist
  writing", and "context enrichment" all hold, while the
  foundations "`resources/` markdown is the source of truth + owner
  is the author + selective publication" (`#1` `#12` `#13`) remain
  intact.

## Code site

The `silan-viking-mcp` crate (L4 adapter, see `01-oop-structure.md`
§1.9):
- `server.rs` — the MCP server process
- `tools.rs` — the four-tier abilities; every tool turns into a
  `Workspace` method call; no second logic path exists.
