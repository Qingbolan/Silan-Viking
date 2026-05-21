# 13 · Skill distribution — let a collaborating agent "install once, understand silan"

> Serves requirements `#10 #11 #12`.
> The previous twelve chapters complete the agent's abilities — but the
> **carrier** for those abilities is the MCP server. This chapter
> covers the final layer: letting a Claude agent **auto-discover
> silan-viking and call it at the right moment without manually
> configuring MCP, just by installing one skill**.
>
> The reason this chapter exists is the promise in `00` §0.1 —
> "speaking to an agent **that carries this skill**". In `00`–`12`
> that promise had no implementation backing: agents connect via
> MCP, not via a skill. This chapter cashes that promise.

---

## §13.1 Back-cast from the terminal state — what does the skill actually solve

First, kill a misreading so `03-mcp-service.md` and this chapter don't
end up looking like two parallel ability sets:

> **The skill re-implements no ability. Every silan-viking agent
> ability (recall / capture / propose / ctx_* / reflect …) lives
> only inside MCP (the four-tier tool set in `03`). The skill is
> a "distribution package + auto-trigger manual" for that ability
> set, not a second logic path.**

First-principles split — for a Claude agent to "install once and
understand silan", three hurdles lie between today and the terminal
state, and MCP only crosses the first:

| Hurdle | Question | Solved by |
|---|---|---|
| ① Capability | Does the agent have callable actions like recall / capture / propose | **MCP** (`03`) |
| ② Discovery | How does the agent know silan-viking exists on this machine, and when to use it | **The skill** (this chapter) |
| ③ Trigger | silan only "voices a thought" — how does the agent automatically think of calling `capture` | **The skill's description + body** (this chapter §13.4) |

Hurdles ② and ③ are where the picture from `00` — "he doesn't enter
content, he just thinks" — actually lands. silan should not manually
configure an MCP server address or say "please call the capture
tool"; he says a half-formed thought, and the agent thinks of folding
it into context on its own. **The skill is the manual that makes the
agent "think of it on its own".**

### Terminal-state picture (this chapter's version)

silan talks to a Claude agent on any machine that has silan-viking
installed:

- At agent startup, Claude scans `~/.claude/skills/` and discovers the `silan-viking` skill.
- silan voices a half-formed thought → the skill's description matches → Claude mounts the skill body → the body tells it "call `context_brief` first, then decide" → it calls MCP.
- silan never said the words "MCP", "capture", or "tool".

---

## §13.2 What a skill bundle looks like — disk artefacts

A silan-viking skill is a small tree under
`~/.claude/skills/silan-viking/`. **It is a `silan`-generated
artefact, not hand-written, not the source of truth** — same nature
as `portfolio.db`: rebuildable at any time by `silan skill emit`.

```
~/.claude/skills/silan-viking/
├── SKILL.md            # ★ the only required file: frontmatter (name/description) + body
└── reference/
    └── mcp-tools.md    # quick reference for the four-tier MCP tools (derived from 03, cited by the SKILL body)
```

`SKILL.md` frontmatter shape (description is the core of hurdle ③, detailed in §13.4):

```markdown
---
name: silan-viking
description: silan's personal context system. Use when silan voices a thought,
  a spark, a half-formed idea, or wants to write an article / push a project
  forward / view site content and visitor data — help him capture the thought
  into context, assist with writing, maintain projects, and selectively publish.
---

(body — see §13.4)
```

> **Why the skill bundle is a derived artefact**: the skill body has
> to embed "MCP local resolution rules", "the current list of 6
> content types", and "a SCHEMA summary" — all of which move with
> `silan-viking.toml` and `SCHEMA.md`. Hand-writing inevitably
> drifts. Letting `silan skill emit` regenerate from the source of
> truth keeps the skill consistent with the project state — same
> load-bearing discipline as `00` §0.4: one source of truth, every
> derived artefact rebuildable.

---

## §13.3 How to generate it, how to install it — the `silan skill` command group

A new tool group is added, alongside `mcp` / `site` / `proposal` in
the "cross-type / tool groups" of `02-cli-service.md`. Naming follows
`#8` noun-first:

```
silan skill emit            emit the skill bundle to ~/.claude/skills/silan-viking/
                            (--path overrides output; derived from silan-viking.toml + SCHEMA.md)
silan skill status          check whether the skill is installed and matches project state (hash comparison)
silan skill rm              remove the installed skill bundle
```

`silan skill emit` does three things, all pure-generative with no side effects on the source of truth:

1. Read `silan-viking.toml` (project identity, MCP transport
   preference) + `content/SCHEMA.md` (the current definitions of
   the 6 types).
2. Render `SKILL.md` — the frontmatter description uses a fixed
   template (§13.4); the body embeds the current type list and the
   **MCP local resolution rules**.
3. Write the whole `~/.claude/skills/silan-viking/` tree. Overwrites
   if present (it is a derived artefact; overwriting loses nothing).

> **Install** = one command: `silan skill emit`. No extra "download
> / register" steps — Claude's discovery mechanism is its own scan
> of `~/.claude/skills/`; once the files are in place, it discovers
> them.
> **Does `silan init` auto-emit**: no. `init` builds only the
> content project (`00` §0.4 pile ③); the skill is an optional layer
> for "let a collaborating agent use it" and is opted-in explicitly
> by silan with `silan skill emit` — same discipline as "`deploy`
> off by default" (`03` tier 4): externally-facing surfaces are off
> by default.

### Cross-machine distribution channels

silan-viking does not invent a skill-distribution protocol. The
skill bundle is a derived artefact; the source of truth remains
`silan-viking.toml` + `content/SCHEMA.md`. The only problem
cross-machine distribution solves is "put the derived artefact in
the target machine's Claude skills directory". Three landing
places:

| Scenario | How | Constraint |
|---|---|---|
| Local personal use | `silan skill emit` writes `~/.claude/skills/silan-viking/` | Default path; overwriting is safe |
| Multiple personal machines | `silan skill emit --path <dotfiles>/skills/silan-viking/`, then dotfiles / cloud drive / git syncs into each machine's `~/.claude/skills/` | Sync is outsourced to existing tools; each machine uses its own `silan mcp status` for connection status, `silan skill status` uses hash comparison to detect drift |
| Team / project share | `silan skill emit --path .claude/skills/silan-viking/` and distribute alongside the repo | Only bundles without private ports / absolute paths may be committed; the MCP integration must be written as a relative convention like `silan mcp serve --stdio` |

This boundary matters: the skill bundle is not a general marketplace
package, and it is not the sync vehicle for local ports / absolute
paths. Cross-machine distribution defaults to dotfiles / git / cloud
drive, but each machine must still have an executable `silan-viking`
and the corresponding MCP server configured; otherwise the skill can
only say "abilities not available in this environment".

### The local-resolution contract for MCP coordinates

The skill bundle can be synced, but **MCP coordinates cannot be
treated as syncable truth**. When `silan skill emit` generates
`reference/mcp-tools.md`, it follows these rules:

1. **Default writes are relative startup conventions**, not absolute paths or fixed ports:

   ```text
   transport: stdio
   command: silan mcp serve --stdio
   project: resolve from current workspace or SILAN_VIKING_PROJECT
   ```

   In other words, the agent finds `silan` via the local `PATH`
   before connecting; `silan mcp serve` reads `silan-viking.toml`
   on the local machine. After this skill bundle is synced to a
   second machine, the second machine's own `silan` resolves the
   project and the transport.

2. **Probe local state first**. The skill body must state: before
   connecting MCP, execute (or ask the host to execute)
   `silan mcp status --json` first. Only when status returns
   `available=true` and the `schema_hash` / `skill_hash` matches
   the current bundle do we declare "available"; otherwise prompt
   the operator to re-run `silan skill emit` or `silan mcp serve --stdio`.

3. **TCP / port only as a local hint**. If `[mcp]` is configured
   with `transport=tcp`, `emit` may write
   `127.0.0.1:<port>` into `reference/mcp-tools.local.md` for
   local use, but that file is `.gitignore`-d by default / not
   synced; the synced bundle's `reference/mcp-tools.md` still
   writes the stdio convention.

4. **`status` surfaces drift causes**. Beyond ContentHash,
   `silan skill status` shows `binary_found`, `mcp_available`,
   `transport_resolved`, `schema_hash_match`, `skill_hash_match`.
   That way a second machine's failure is diagnosable; "skill
   discovered" is never misreported as "MCP connected".

### How the skill and the MCP server hook up

The skill body carries no abilities; it **instructs Claude to
connect to MCP**. The wiring:

- The skill body states: "silan-viking's abilities come through MCP. If this session has not connected, follow `reference/mcp-tools.md` to run `silan mcp status --json`; once available, connect with `silan mcp serve --stdio`."
- The MCP server is still started by silan (or the environment) via `silan mcp serve` — the skill **does not start processes** (the skill is a declarative manual, not a supervisor).
- Connection coordinates are resolved on the local machine via `silan mcp status --json` / `silan mcp serve --stdio`. `silan-viking.toml`'s `[mcp]` section only provides transport preferences; it must not write a local absolute coordinate as cross-machine truth.

> **Boundary**: the skill can let Claude "know it should connect to
> MCP, where to connect, and what to call after connecting", but
> starting the server is still silan's environment's job. If a
> particular agent's environment has no silan-viking binary at all
> — the skill body explicitly says "no silan-viking in this
> environment; abilities unavailable", and does not pretend.

### "Skill installed" vs "agent can use it"

`silan skill emit` only fulfils the **discovery layer**. For an
agent to actually call silan-viking, three things must hold at once:

1. `~/.claude/skills/silan-viking/` contains the current-hash skill bundle.
2. An executable `silan-viking` / `silan` binary exists on this machine and can read the content repo `silan-viking.toml` points to.
3. `silan mcp status --json` reports MCP available on this machine, or the host can start / connect to it via the relative convention `silan mcp serve --stdio`.

When ② or ③ is missing, the skill can still be discovered by
Claude, but it can only say "abilities not available in this
environment"; it must not pretend to be connected. This limitation
is a safety boundary: the skill bundle is not an installer; it does
not copy the private content repo, the MCP server, or the local
binary onto a collaborator's machine.

---

## §13.4 description and body — make the agent "think of it on its own" (hurdle ③)

This is the load-bearing section of the chapter. Whether the skill
cashes the `00` terminal-state picture comes down to how well the
description is written — Claude uses the description to decide
"should this skill be mounted right now".

### Discipline for writing the description

The description must cover silan's **natural-language trigger
surface**, not tool names:

- ✅ Cover "silan voices a thought / a spark / a half-formed idea" — maps to `capture`.
- ✅ Cover "wants to write an article / push a project forward / tidy up some idea" — maps to `propose` / `summarize_updates`.
- ✅ Cover "view the site content, visitor data, the views/comments of a piece" — maps to `stats` / `visitors`.
- ❌ Do not write "use when calling the capture tool" — that is a tool name; silan never speaks that way.

The description-match criterion is **"what does silan look like he's
doing"**, not "which function to call". The agent is first caught
by the skill body, and the body translates "what he's doing" into
"which MCP tier".

### Body skeleton (the sections `SKILL.md`'s body should contain)

```
## What this is
  silan's personal context system. Source of truth is markdown;
  abilities come through MCP. One-sentence positioning + a pointer
  to silan:// (00 terminal-state).

## Connect (hurdle ②)
  Abilities come from MCP. If this session has not connected,
  follow reference/mcp-tools.md to connect. First action after
  connecting: call context_brief() — understand what silan is
  thinking about now, before doing anything.

## When to do what (hurdle ③ — the natural-language → MCP-tier translation table)
  | silan looks like he's… | What you do |
  |---|---|
  | Surveying existing content ("what projects do I have in progress") | list(type, filter) — structured listing with status |
  | Searching "have I written about this topic" | recall(query) — semantic search |
  | Voicing a half-formed thought | capture(note, type) — start a proposal; do not land directly |
  | Wanting to think one idea deeper, into an article | recall first for related old Items; then propose |
  | Wanting to push some project / idea forward | propose anchored to the matching Part (progress etc.) |
  | Asking "how many people read this" | stats / visitors / crawler_breakdown / source_breakdown (read the synced local cache) |
  | Asking you to remember something about him / the project | ctx_write to silan://agent/ — direct write, no proposal |
  | End of session | reflect(session) — settle into agent/sessions/ and agent/owner/ |

## Three non-negotiable red lines (restating 03's safety rules; not new)
  1. resources/ (published content): capture / propose only — never ctx_write, never merge directly.
  2. accept / reject / publish / deploy are not for the agent — those are silan's CLI actions.
  3. The agent/ namespace is never published.

## Reference
  reference/mcp-tools.md — full signatures of the four-tier tools (derived from 03-mcp-service.md).
```

> **Why the body restates `03`'s safety red lines**: the skill body
> is the text the agent actually reads and acts on. If `03`'s
> safety rules live only in the doc tree and not in the skill body,
> the agent does not see them at runtime — the red lines must
> appear where the agent actually reads. This is not "two rule
> sets"; it is **the same rules projected into the agent's view**;
> `03` is the source, the skill body is the derived projection, and
> `silan skill emit` keeps them drift-free.

---

## §13.5 Consistency self-check with the existing design

| Existing constraint | Does this chapter break it? |
|---|---|
| `#1` markdown as source of truth | ✅ The skill bundle is a derived artefact under `~/.claude/`; does not touch `content/` |
| `#10` agent updates published content via proposal | ✅ Red line ① in the skill body forbids resources/ direct writes |
| `#13` single-tenant; selective-publish authority belongs to silan | ✅ Red line ②: accept / publish / deploy are not exposed to the agent |
| `03` MCP is the only ability source | ✅ The skill carries zero abilities; only discovery + trigger; everything turns into an MCP call |
| `00` §0.4 "one source of truth, derived artefacts rebuildable" | ✅ The skill bundle is rebuilt by `silan skill emit` from the source of truth |
| `#8` noun-first CLI | ✅ `silan skill emit / status / rm`, noun-first |
| Discipline of "`deploy` off by default" | ✅ `init` doesn't auto-emit; silan explicitly opts in |

> **Design-discipline self-check (`00` §0.2)**: the new objects in
> this chapter = the `silan skill` command group + the skill-bundle
> artefact. Both point back to **`#16`** (collaborating agent
> connects through a skill with zero configuration) — the
> requirement was officially added to `00` §0.2 during review.
> Pointers back exist; nothing to delete.

---

## §13.6 Sync-back to existing docs — status

Landing this chapter requires syncing four existing docs;
**the first three were completed when this chapter was introduced**:

1. ✅ **`00-end-state-and-requirements.md` §0.2** — `#16` (collaborating agent connects through a skill with zero configuration) is in the baseline, with a footnote explaining that `#16` is not a detail of `#12` but an independent distribution face. The `00` §0.1 phrase "an agent that carries this skill" thereby has requirement support.
2. ✅ **`02-cli-service.md` "cross-type / tool groups"** — the `silan skill` command group (`emit` / `status` / `rm`) is added alongside `mcp` / `site` / `proposal`.
3. ✅ **`03-mcp-service.md` tier 1** — the `#15` MCP tools are now one-to-one with CLI `silan stats`: `traffic_breakdown` was split into `crawler_breakdown` + `source_breakdown` to match CLI `crawlers` / `sources`. The two sides no longer diverge.
4. ✅ **`04-milestones.md`** — synced. `silan skill` **splits into M8 structural acceptance + M9 end-to-end acceptance**: M8 ships `emit / status / rm` in `silan-viking-cli`, verifying that the skill bundle generates, is discoverable by Claude, and that hash drift can be detected; M9 (after the MCP server is ready) verifies "the skill bundle completes one capture through MCP" (playbook K in `07`).

> All four sync-backs are complete — the skill line forms a closed
> loop across `00` (requirement #16) / `02` (command group) / `03`
> (stats alignment) / `04` (milestones) / `05` (test scenarios) /
> `07` (playbook K) / `13` (this chapter); no dangling reference.

---

## §13.7 Code site

The skill generation logic sits in **the `silan-viking-cli` crate**;
no new crate is added — reason: the skill bundle is "render a few
markdown files to disk", which has no domain ability and doesn't
warrant an L4 adapter (compare `silan-viking-mcp`, which is an
actual server process).

```
silan-viking-cli/src/skill.rs   # the three silan skill emit/status/rm sub-commands
                                # reads silan-viking.toml + SCHEMA.md
                                # renders SKILL.md + reference/ into ~/.claude/skills/
```

- The `SKILL.md` frontmatter description uses a **fixed template
  string** (the discipline in §13.4 is pinned); only the type list
  and the MCP coordinates in the body are variable interpolations.
- `silan skill status`'s "consistency comparison": a byte-by-byte
  compare between `SKILL.md` and "the result of re-rendering with
  the current `silan-viking.toml` + `SCHEMA.md`" — mismatch prompts
  `silan skill emit` to regenerate. Beyond that, it outputs the
  §13.3 rule-4 diagnostic fields: `binary_found`, `mcp_available`,
  `transport_resolved`, `schema_hash_match`, `skill_hash_match`,
  `status` (`not_installed` / `up_to_date` / `stale`).
- `silan skill emit`, when `[mcp].transport = "tcp"`, additionally
  writes `reference/mcp-tools.local.md` (`127.0.0.1:<port>` local
  hint) and adds it to the skill bundle's `.gitignore` — the
  synced bundle keeps only `mcp-tools.md` with the stdio convention.
  stdio (the default) does not produce a local file.

> This chapter touches none of L1–L3; touches none of
> `silan-viking-mcp`. It is purely "one more tool group in
> `silan-viking-cli`" — consistent with `01` §1.1 "add a new L4
> crate only for a new outward interface": the skill is not a new
> interface but "packaging an existing MCP interface for easy
> discovery by an agent", and stays in the CLI.
