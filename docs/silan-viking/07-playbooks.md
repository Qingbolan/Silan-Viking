# 07 · Playbooks — step by step for "I want to do X"

> `06` is the main backbone (install → deploy); this chapter is **the
> per-task playbook**: each one starts with "what the user wants to
> do" and walks line by line through **what to type / what to say to
> the agent / what the screen shows back / how the files change**.
> Not slogans — read a playbook and you can reproduce it verbatim.
>
> Convention: `$` lines are terminal commands; indented lines are
> screen output; `▸ silan:` / `▸ agent:` are dialogue with the
> collaborating agent.

## Playbook index

| # | What the user wants | Who does it | §  |
|---|---|---|---|
| A | Configure the CLI after install | silan | §7.1 |
| B | Open the first idea | silan | §7.2 |
| C | Write a blog directly | silan | §7.3 |
| D | Maintain a project (update progress) | silan | §7.4 |
| E | Have the agent edit the resume | agent (via proposal) | §7.5 |
| F | Grow a blog out of an idea | agent (via proposal) | §7.6 |
| G | A mature idea becomes a project | owner + agent | §7.7 |
| H | Add a Chinese variant to existing content | silan / agent | §7.8 |
| I | Delete / archive content | silan | §7.9 |
| J | Have the agent lint content and summarise updates | agent | §7.10 |
| K | Install the agent skill so it integrates zero-config and helps maintain | silan + agent | §7.11 |

> Permission rule (per `03` §3.1): when an agent edits **memory**,
> it takes effect directly; when it edits **published content**
> (resume / blog / project), **it always goes through a proposal
> branch**; only `silan proposal accept` lands it in the source of
> truth.
>
> Playbooks A–J have the agent connect via the manual route
> (`silan mcp serve` + manual hook-up); **playbook K is the
> zero-config form of the same capability set** — install a skill,
> the agent auto-discovers and auto-connects. Both routes have the
> same capabilities; the difference is only "how the connection
> happens".

---

## §7.1 Configure the CLI (playbook A)

After `silan init`, two config files need filling: the global
`~/.config/silan/config.toml` and the project
`~/.silan-viking/silan-viking.toml` (`06` §6.1 / §6.2.2 give the
full fields). This section is the **hands-on operation**.

**Step 1 — decide whether to use an LLM**. The engine defaults to
purely local (rule-based L0 summaries); you can run without
configuring an LLM. To let the agent's `context_brief` and L0
summaries be smarter, fill in:

```
$ silan config edit --global          # open ~/.config/silan/config.toml
```

Fill the `[llm]` section (skip if you don't want LLM):

```toml
[llm]
provider = "anthropic"
api_key  = "sk-ant-..."        # under ~/.config/silan/; never enters any git
```

**Step 2 — fill the deploy target** (skip if you aren't deploying yet; fill before deploy):

```
$ silan config edit                   # open the project silan-viking.toml
```

Fill the `[deploy]` section; `ssh_key_path` points at your deploy private key:

```toml
[deploy]
host         = "silan.tech"
user         = "deploy"
ssh_key_path = "~/.ssh/silan_deploy_ed25519"
```

**Step 3 — verify the config**:

```
$ silan doctor
  silan doctor — config + environment check

  ✓ global config  ~/.config/silan/config.toml
  ✓ project config ~/.silan-viking/silan-viking.toml
  ✓ LLM            anthropic (api_key set)
  ⚠ deploy         ssh_key_path ~/.ssh/silan_deploy_ed25519 does not exist
                   → generate one with ssh-keygen before deploying, or skip deploy
  ✓ git repo       content/ initialised

  1 warning — does not block daily use; resolve before deploy.
```

> `silan doctor` is **the first command to run when you aren't sure
> the config is correct**. It reports each item `✓ / ⚠ / ✗`;
> warnings do not block; only `✗` must be fixed.

---

## §7.2 Open the first idea (playbook B)

silan has an idea and wants to record it. Two paths.

### Path 1 — build it yourself

```
$ silan idea new rust-context-engine
  ✓ created content/resources/ideas/rust-context-engine/
  ✓ created content/resources/ideas/rust-context-engine/parts/overview/{meta.toml, en.md}
  ✓ updated content/resources/ideas/.silan-cache

  Next: edit parts/overview/en.md and write your idea; silan index sync to write it to the db.
```

Open `parts/overview/en.md`; the frontmatter template is scaffolded; silan fills the body:

```markdown
---
slug: rust-context-engine
title: "Write a context engine in Rust"
kind: idea
status: hypothesis
tags: [rust, context]
tldr: ""                        # leave empty → the engine generates an L0 at sync time
---

# Write a context engine in Rust

## Motivation
Content management is in Python today; I want to rewrite it in Rust...

## Approach
...
```

Sync into the db:

```
$ silan index sync
  ✓ ideas/rust-context-engine — new
  ✓ L0 summary generated: "the idea of rewriting the content engine in Rust"
  1 new, 0 updates, portfolio.db refreshed
```

### Path 2 — say it to the agent

The agent is connected (`silan mcp serve`, see §7.5 step 1). In dialogue:

```
▸ silan: I have an idea — rewrite the current content engine in Rust; want to record it.
▸ agent: (calls capture) drafted an idea "Write a context engine in Rust" for
         you, placed on the proposal branch proposal/01H..., you can run
         silan proposal show to view it.
```

What `capture` drafts is a **proposal** (content-class — goes through a proposal):

```
$ silan proposal list
  01H8X...  idea  rust-context-engine  "Write a context engine in Rust"  ✓ validated
$ silan proposal accept 01H8X...
  ✓ merged proposal/01H8X... → main
  ✓ content/resources/ideas/rust-context-engine/ landed
```

> Both paths end in the same place:
> `content/resources/ideas/rust-context-engine/`. Path 1 suits you
> if you want to write it yourself; path 2 suits you if you only
> have a vague thought and want the agent to draft.

---

## §7.3 Write a blog directly (playbook C)

Skip the idea; start a blog post directly.

```
$ silan blog new 2026-rust-rewrite-notes
  ✓ created content/resources/blog/2026-rust-rewrite-notes/
  ✓ created .../en.md (body Part, primary language)
```

Write the body in `en.md` (the frontmatter template is already
scaffolded; fill `content_type` / `tags`, etc.), then sync:

```
$ silan index sync
  ✓ blog/2026-rust-rewrite-notes — new
$ silan content show silan://resources/blog/2026-rust-rewrite-notes
  blog · 2026-rust-rewrite-notes
  title    Rust rewrite notes
  status   draft
  langs    en
  L0       "recording the process and trade-offs of rewriting the engine in Rust"
```

To publish, change the frontmatter `status` to `published` and sync
again. To go live on the website, see "publish" at the end of §7
or `06` §6.5.

> A blog is a single Part (`body`); it does not have idea/project's
> multiple tabs — one blog = one body file.

---

## §7.4 Maintain a project — update progress (playbook D)

The project already exists
(`content/resources/projects/silan-viking/`). The owner wants to
log a progress note.

A project has multiple Parts: `overview` / `progress` /
`reference`; each Part is a `parts/<role>/` directory (`meta.toml`
+ a `.md` / `.toml` per language). Updating progress = writing the
`progress` Part.

**If the `progress` Part does not exist yet** (initially only the
overview Part exists; progress is optional):

```
$ silan project add-part silan-viking progress
  ✓ created content/resources/projects/silan-viking/parts/progress/{meta.toml, en.md}
```

Open `parts/progress/en.md` and append a progress note, then:

```
$ silan index sync
  ✓ projects/silan-viking — updated (progress Part changed)
  ✓ item_part table: progress / en row refreshed
```

`silan content show silan://resources/projects/silan-viking` will
list it as having both overview and progress.

> "Maintaining a project" is at its core **writing into its
> Parts**. Add a new tab = `add-part`; edit an existing tab = edit
> the corresponding `.md`. Tabs grow on demand (§1.3.1).

---

## §7.5 Have the agent edit the resume (playbook E)

silan wants to add a new experience to the resume; have the
collaborating agent do it.

> **Basis (`10` ruling #2)**: resume is **not** a single `body` Part
> — it is multi-Part: `summary` (prose); `education` / `experience`
> / `publications` / `awards` / `research` (entry_list); `skills`
> (key_value_list). The source files for structured Parts are
> `parts/<role>/<lang>.toml` (TOML array-of-tables); each entry has
> a stable anchor `entry_id = "e_<ulid>"`. "Add an experience to
> the resume" = add one `[[entry]]` block to the `experience`
> entry_list Part — **not** to edit a generic `body`.

**Step 1 — start the MCP server so the agent can connect**:

```
$ silan mcp serve --stdio
  silan mcp serve — stdio mode; waiting for an agent to connect
  ✓ SCHEMA + project overview ready; waiting for an agent
  [agent claude-1 connected] pushed SCHEMA (6 types) + project overview (blog 3 / idea 2 / project 1 / resume 1)
```

The instant the agent connects it "understands" the project (the
handshake push in `06` §6.3). SCHEMA is the **6 types**
(idea/blog/project/episode/resume/update, `10` ruling #1 / #3).

**Step 2 — tell the agent what to change**:

```
▸ silan: add an experience to the resume — from 2026, AI infra at Company X.
▸ agent: (reads the experience Part of resume → adds a [[entry]] block
         at the top of parts/experience/en.toml; the engine generates
         entry_id = e_<ulid>; calls propose anchored to
         silan://resources/resume/resume/experience)
         Drafted. Proposal proposal/01HA..., validation passed. Diff:
         parts/experience/en.toml +1 entry (e_01HA9...). silan proposal
         show 01HA... to view.
```

> The agent edits **one entry in the experience Part**, not other
> Parts. The new entry gets its `entry_id` from the engine; sync
> can pinpoint "this one is the new one" (`10` §10.4.5).

**Step 3 — silan reviews and accepts**:

```
$ silan proposal show 01HA...
  Proposal 01HA... · resume · experience Part (entry_list) · validation ✓
  --- diff (proposal branch vs main) ---
  parts/experience/en.toml:
  + [[entry]]
  + entry_id   = "e_01HA9..."
  + company    = "Company X"
  + position   = "AI Infra Engineer"
  + start_date = 2026-01-01
  + is_current = true
$ silan proposal accept 01HA...
  ✓ staging merge + validation ② passed (entry_fields contract: company / position required ✓)
  ✓ main pointer advanced → parts/experience/en.toml updated
$ silan index sync
  ✓ resume — updated; experience Part: part_entry +1 row (e_01HA9...)
```

> The agent **never touched the source of truth** — it only wrote
> the proposal branch. The resume genuinely changed only when the
> owner ran `accept`. This is "the agent updates content via skill,
> but the owner is the author" (§3.1). Note that sync lands the
> data into the generic `part_entry` table (not a legacy
> `work_experience` dedicated table — `10` ruling #2: no dedicated
> ent tables for structured resume Parts).

> **Editing an existing entry** (e.g. correcting the GPA of an
> education entry): the agent likewise goes through a proposal,
> editing **just that `[[entry]]`** in `parts/education/en.toml`
> (located by `entry_id`); other entries are unchanged — sync
> updates a single row by `entry_id`; `git diff` shows only that
> entry change. The command `silan resume edit education` opens the
> same file for the owner to edit directly.

---

## §7.6 Grow a blog out of an idea (playbook F)

The `rust-context-engine` idea (built in §7.2) has matured; silan wants to write a blog based on it.

```
▸ silan: write the rust-context-engine idea up as a blog.
▸ agent: (recall reads the idea's README → drafts a blog → propose
         creating the new blog + writes an evolution edge in the blog
         frontmatter: documents → that idea)
         Drafted blog "Rewriting the content engine in Rust: design notes",
         proposal proposal/01HB.... Includes the relation
         blog --documents--> ideas/rust-context-engine.
```

```
$ silan proposal show 01HB...
  Proposal 01HB... · new blog "Rewriting the content engine in Rust: design notes"
  + content/resources/blog/rust-rewrite-design-notes/parts/body/en.md
  + relation: blog/rust-rewrite-design-notes --documents--> ideas/rust-context-engine
  validation ✓
$ silan proposal accept 01HB...
  ✓ landed; the relation is written into the content_relation table
```

Querying the idea afterwards shows "which blog documents it":

```
$ silan relation show silan://resources/ideas/rust-context-engine
  forward:  (none)
  reverse:  blog/rust-rewrite-design-notes  --documents-->  this idea
```

> idea→blog **does not** move the idea away — the idea stays, the
> blog is a new item, and a `documents` evolution edge connects
> them (`#4`). That edge was built by the agent inside `propose`.

---

## §7.7 A mature idea becomes a project (playbook G)

`rust-context-engine` is not just clear; silan decides to build it — the idea becomes a project.

**Key: this is not "the idea changes into the project"**. An idea is
an idea (`content/resources/ideas/`); a project is a project
(`content/resources/projects/`); two independent items (`#4`: three
independent items). "Becoming" = **create a new project + create an
`evolved-from` edge pointing back to the idea**.

```
$ silan project new rust-context-engine
  ✓ created content/resources/projects/rust-context-engine/ (overview Part)
$ silan relation link \
    silan://resources/projects/rust-context-engine \
    silan://resources/ideas/rust-context-engine \
    --type evolved-from
  ✓ relation written: project --evolved-from--> idea
```

Or say to the agent "promote the rust-context-engine idea into a
project"; the agent `propose`s a new project + an `evolved-from`
edge; silan `accept`s.

The idea's `status` can be set to `shipped` (it gave rise to the
project), but the idea item is **kept** — it is the source of
thought for this project, and the evolution chain (`#4`) needs it
present.

---

## §7.8 Add a Chinese variant to existing content (playbook H)

The `welcome` blog post currently has only `en.md`; the owner wants to add Chinese.

A blog's body Part is the `parts/body/` directory (`01` §1.3.1).
Adding Chinese = adding a `zh.md` representation in that Part
directory:

```
$ silan blog add-lang welcome zh
  ✓ created content/resources/blog/welcome/parts/body/zh.md (the zh representation of the body Part)
  ✓ parts/body/meta.toml: variants += zh (translation_of field left empty, see 01 §1.3.2)
```

Open `parts/body/zh.md`, translate / write the Chinese body, then sync:

```
$ silan index sync
  ✓ blog/welcome — updated; langs: en, zh
  ✓ blog_post_translations table: zh row written
```

> `Part` (role) and `File` (language) are two orthogonal dimensions
> (§1.3) — adding a language adds a File under the Part; it does
> not alter the Part structure. `Parsed`'s multilingual variants
> (§1.8.0) absorb it; the Mapper maps to the `*_translations`
> tables.

---

## §7.9 Delete / archive content (playbook I)

silan wants to take an old blog post offline. Two intensities:

**Archive (recommended)** — keep the content, but un-publish:

```
$ silan blog archive old-post
  ✓ frontmatter status set to archived
$ silan index sync && silan site deploy --confirm
  archived content is no longer projected to the site (SiteProjector only projects visibility=public)
```

**Real delete** — truly remove the files:

```
$ silan blog rm old-post
  ⚠ Will delete the directory content/resources/blog/old-post/ entirely, and:
    - detected 1 evolution edge pointing to it (idea/x --documents--> this blog)
    - after deletion that edge becomes dangling
  Confirm? [y/N] y
  ✓ Deleted; related edges in content_relation cleaned up; git commit "remove blog/old-post"
```

> Before `rm`, the engine **actively checks evolution edges** —
> deleting a referenced item would leave a dangling edge (`#4`,
> §1.8.2); the engine prompts then deletes and cleans up. Same kind
> of check as `silan index lint`, advanced into the delete action.

---

## §7.10 Have the agent lint content and summarise updates (playbook J)

silan has the agent do two maintenance jobs; both are **read-only / via proposal** — neither edits the source of truth directly.

**Content lint** — the agent calls `lint` (`03` tier 1, read-only):

```
▸ silan: lint my content for me — check for issues.
▸ agent: (calls lint) lint report:
         · ideas/old-idea — status=exploring but unchanged for 6 months; recommend review
         · blog/draft-x — dangling evolution edge: documents → a deleted idea
         · projects/y — overview Part missing tldr; the L0 summary is empty
         3 items; no fatal. Want me to draft repair proposals?
```

**Update summary** — the agent calls `summarize_updates` (`03` tier 3, via proposal):

```
▸ silan: summarise recent updates into one update post.
▸ agent: (reads recent git log + content changes → drafts an update Item → propose)
         Drafted update "Recent: Rust-engine design finalised, +2 new blogs",
         proposal proposal/01HC....
$ silan proposal show 01HC...
  Proposal 01HC... · new update "Recent: Rust-engine design finalised, +2 new blogs"
  + content/resources/update/2026-05-rust-engine-recap/parts/body/en.md
  validation ✓
$ silan proposal accept 01HC...
  ✓ update landed; recent_updates table gains a row
```

> `update` is **the 6th content type** (`10` ruling #3) — it has
> its own container `content/resources/update/<slug>/parts/body/`,
> its own parser, and its own main content table `recent_updates`.
> The summary lands as a proper `update` Item, not as some derived
> record.

> Linting is **read-only** (agent gives a report; no edits);
> summarising is **a proposal** (agent drafts an update; the owner
> accepts). Neither lets the agent touch the source of truth —
> maintenance jobs also follow the §3.1 boundary.

---

## §7.11 Install the skill so the agent integrates zero-config and maintains (playbook K)

> Corresponds to `13-skill-distribution.md` and requirement `#16`.
> In playbooks E / J, the agent uses "silan manually runs
> `silan mcp serve` + the agent manually hooks up". This playbook
> is **the zero-config form of the same capability set** — silan
> installs a skill; afterwards any Claude agent on startup
> auto-discovers silan-viking and auto-connects; silan only talks.
> The skill **adds no abilities**; it just lets the E / J abilities
> "connect themselves".

**Step 1 — silan generates and installs the skill (one-shot)**:

```
$ silan skill emit
  ✓ generated ~/.claude/skills/silan-viking/
      SKILL.md                (name + description + body)
      reference/mcp-tools.md  (quick reference for the four-tier MCP tools)
  ✓ body embedded: the 6 content types + the MCP local resolution rules
  Next: silan mcp status --json checks local availability; then silan mcp serve --stdio to connect
```

> `silan skill emit` is a **derived action**; it doesn't touch the
> source of truth — same as `portfolio.db`. If SCHEMA changes, just
> re-emit. `silan init` does **not** auto-emit: the skill is the
> optional layer for "let a collaborating agent use it"; silan opts
> in explicitly (same discipline as `site deploy` off by default).

**Step 2 — start the MCP server (the skill instructs the agent to connect, but starting the process is still silan's job)**:

```
$ silan mcp status --json
  {"available":true,"transport_resolved":"stdio","schema_hash_match":true,"skill_hash_match":true}
$ silan mcp serve --stdio
  silan mcp serve — stdio mode; waiting for an agent to connect
```

**Step 3 — the agent connects zero-config; silan just talks**:

```
▸ silan: (in a brand-new Claude session) I've been thinking — I want to rewrite
         my resume's research-direction section to emphasise AI infra.
▸ agent: (Claude scans ~/.claude/skills/; the description matches "silan voices a
         thought / wants to write / push a project forward" → mounts the
         silan-viking skill
         → body "connect" section: check silan mcp status --json first, then
         hook into MCP via stdio; first action: call context_brief()
         → body translation table: "want to edit a Part" → propose anchored to
         that Part)
         I checked your current context first — you've been pushing the Rust
         engine to finalisation this week. I drafted the resume research-Part
         edit anchored to research only; proposal proposal/01HD..., validation
         passed. silan proposal show 01HD... to view the diff.
```

> Compare playbook E: silan **never said** "connect MCP" or "call
> propose". The skill body's description + translation table
> handles the agent's translation from "what silan looks like he's
> doing" to "which MCP tier to call" (`13` §13.4 hurdle ③). This
> is the landing of `00`-end-state §0.1 "speaking to an agent that
> carries this skill".

**Step 4 — maintenance is also zero-config**. silan says "lint my
content" / "summarise an update"; via the skill, the agent
automatically runs `lint` / `summarize_updates` (same as playbook
J); silan never has to name the tools.

**Step 5 — red lines unchanged; publication is still silan's**:

```
$ silan proposal accept 01HD...
  ✓ staging merge + validation ② passed; research Part updated
```

> The skill body hard-codes three red lines (`13` §13.4): the
> agent on `resources/` can only propose; `accept` / `publish` /
> `deploy` are human-only; `agent/` is never published.
> **Installing the skill is not handing over authority** — through
> the skill, the agent can "maintain, draft"; the final publication
> action always belongs to silan: `silan proposal accept` /
> `silan site deploy`.

> **The skill is "how to connect", not "what it can do"**: playbook
> K's capabilities are identical to E / J — capture / propose /
> lint / summarize_updates, none more, none fewer. The skill only
> changes the integration cost: from "silan manually starts the
> server + tells the agent how to connect" to "the agent discovers
> itself, connects itself, thinks of what to do itself".

---

## §7.12 What these playbooks verify

Every playbook is a real path "user wants to do X" run from start
to end. Together they verify: the `silan` CLI commands, the `03`
MCP proposal mechanism, the `13` skill distribution, the `#4`
evolution edges, the `01` Part / multilingual model — not just
internally consistent design, but **assembled into the operation
flow a real user actually walks**.

> If reading a playbook reveals a step with "no matching command /
> mechanism", that is a design gap. Every step in every playbook
> in this chapter maps to a concrete command or MCP tool — during
> M1 implementation, these playbooks are the acceptance scripts.
