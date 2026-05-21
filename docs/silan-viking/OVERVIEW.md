# silan-viking · overview — read this once and you understand the system

> This is the **main entry** for the silan-viking design. It answers every
> key question about "how this system actually runs" **point by point**,
> with pointers to the detailed chapters. After this one document, you
> shouldn't have to piece things together across seven files.
>
> 30-second positioning: silan-viking is silan's one-person context system —
> markdown is the source of truth, the Rust engine `silan` syncs it into
> SQLite to feed the website, collaborating agents read and write it
> through MCP. Details in `00-end-state-and-requirements.md`.

---

## One picture: how it runs

```
                 ┌─────────────── local machine ──────────────┐
  silan writes md ─▶ content/ (markdown source of truth, Git repo)
                          │  silan index sync
                          ▼
                     portfolio.db (derived cache; the local copy has no runtime data)
                          │
  collaborating agent ◀──▶ silan mcp serve (MCP: read content / write agent context / propose)
                          │  silan site deploy
                     └─────┼─────────────────────────────────────┘
                           ▼
                     ┌─────────────── server ─────────────────┐
                     Go API + portfolio.db + frontend
                           │
                     visitors browse → comments / likes / pings — runtime data is born only here
                           │
  silan stats (remote query) ◀──────────────────────┘
                     └────────────────────────────────────────┘
```

---

## Every question you'd ask, answered in order

### Q1. End-to-end — how do I install and initialise?

**Install**: any of three forms — install script / `cargo install silan-viking` / `pip install silan-viking` (a thin installer package). All three land in the same place: the `silan-viking` binary appears on PATH as `silan`. **No dependency on the legacy Python package.**

**Initialise**: `silan init` — lays the six type directories under `content/` in `~/.silan-viking/` + three sample items (welcome blog / one idea / one project) + `SCHEMA.md` + `silan-viking.toml` + `git init`. The screen prints the file tree and the numbered next step.

→ Full text: `06-end-to-end.md` §6.1 (install), §6.2 (init — actual screen output and project structure).

### Q2. What interfaces does it offer — for humans and for agents?

**Two surfaces, one engine core** (`Workspace`):

- **For humans — CLI `silan`**: the six type-specific command groups (`idea`/`blog`/`project`/`episode`/`resume`/`update`), each with `new/list/show/edit/rm/archive` + type-specific operations, plus the eight tool groups `content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`.
- **For agents — MCP**: `silan mcp serve` boots an MCP server; once an agent connects, the handshake pushes SCHEMA + the project overview. The agent can search / capture / propose / read and write its own context.

→ Full text: `02-cli-service.md` (the complete CLI surface), `03-mcp-service.md` (MCP tools, four tiers + §3.1).

### Q3. How do I create an idea / project / blog?

**Two paths**, same end:
- **Build it yourself**: `silan idea new <slug>` — scaffolds the directory + `parts/overview/` + a template frontmatter. Edit markdown, then `silan index sync`.
- **Tell the agent**: the agent's `capture` drafts → a proposal git branch → `silan proposal accept` takes it in.

A blog is a single Part (`body`); idea/project carry multiple Parts (overview / progress / …).

→ Full text: `07-playbooks.md` §7.2 (opening an idea), §7.3 (writing a blog), §7.4 (maintaining a project) — each playbook is line-by-line commands + screen output + file diffs.

### Q4. How does the parser work?

`Parser` (an L3 trait, six implementations = the Rust counterpart of Python's six parsers) reads the type definition from `SCHEMA.md`, walks each `parts/<role>/` directory along the `parts` list, and parses every `<lang>.<ext>` into `Parsed` (the extension is decided by Part shape; the result is a language-agnostic `main` + multilingual `langs`).
`Parser` exposes only three public methods (`content_type` / `parse` / `validate`); every `extract_*` is a private struct fn.

→ Full text: `01-oop-structure.md` §1.5 (Parser trait + visibility), §1.5.1 (a real ResumeParser slice, method by method), §1.8 (the Parser → Parsed → Mapper → Sink persistence chain).

### Q5. How is the OOP implemented? How do I extend it?

**Four layers**: L1 base (pure utilities) → L2 content (domain data: Namespace/Collection/Item/Part/File) → L3 app (behaviour: Workspace/Parser/Mapper/Sink) → L4 adapter (CLI/MCP/Site). Dependencies are strictly downward; crate boundaries are physically enforced by `Cargo.toml`.

**Extension hinges on two points**: ① adding a content tab = edit the type definition in `SCHEMA.md`, no Rust change (the parser is config-driven); ② adding a new outward interface = add an L4 adapter crate, no change to L1–L3.

→ Full text: `01-oop-structure.md` §1.1 (the four layers), §1.2 (inheritance mechanism), §1.3.1 (the configurable file tree).

### Q6. Are there end-to-end tests?

Yes — four layers: L1 unit / L2 `insta` snapshots / **L3 e2e** (`assert_cmd` running the real `silan` command) / **L4 contract tests** (the db emitted by Rust is aligned line-by-line against the Go ent schema and the frontend read contract).
Test scenarios are **back-cast from the 16 requirements one by one**; the end of the doc has a requirement-↔-scenario self-check table — a requirement with no matching scenario = a gap in the tests.

→ Full text: `05-testing.md` (the four-layer structure + scenario list + §5.3.1 ResumeParser test slice).

### Q7. How does sync work?

`silan index sync` — walk `content/` → `Parser` parses → `Mapper` maps to a `RowSet` → `Sink` writes `portfolio.db` in a transaction. Incremental: compare hashes, only rebuild changed Items.
Content updates have **two paths**: the owner edits directly (edit the source file → sync), or the agent edits (propose → proposal branch → owner accept → sync).

→ Full text: `06-end-to-end.md` §6.4 (the full update chain, two paths in parallel), `01` §1.8 (persistence).

### Q8. On a new machine pulling from the server, do I get the latest comments / visit data?

**This is a key data-flow question; the answer separates two classes of data**:

- **Content** (blog/idea/project…) = markdown, source of truth in the `content/` git repo.
  A new machine `git clone`s the content repo, getting every item; a local `sync` rebuilds `portfolio.db`'s content tables. ✅ Fully received.
- **Runtime data** (comments `comment` / view pings `content_interaction`) is born on the **production server** (visitors comment and browse on the website). **It lives only in the server's `portfolio.db`; it does not enter Git, and it is not in any markdown file.**

**Architectural decision (silan's)**: runtime data **lives only on the server; local machines never hold it.**
- On a fresh-machine pull → the local `portfolio.db` runtime tables (comment / content_interaction) are **empty**; this is **expected behaviour**, not a bug.
- To see comment / visit data → use `silan stats` (CLI) / the MCP `stats` tools to **query the server remotely**; no need to sync runtime data locally.
- Benefit: the local machine only deals with "content creation"; responsibilities are clean. Runtime data has one home (the server); no "whose comment data is newest?" sync headache.

→ Full text: `01-oop-structure.md` §1.10 "knock-on effects on §1.8" — the "derived vs runtime data boundary" and "physical home of runtime data" paragraphs — and §1.10 revision D (`content_interaction`); `02` `silan stats` command group.

### Q9. How is versioning handled?

**Git** — `content/` is a git repo; every markdown edit is a commit; version history is git history. `portfolio.db` **does not store historical versions** (it's a derived cache; storing history would be a role mismatch). To see versions → `git log` / `git diff` on the content repo.
Agent proposals are also git branches (`proposal/<ulid>`); `accept` = merge.

→ Full text: `01-oop-structure.md` §1.10 revision B (versioning via git), `03` §3.1 (proposal = git branch).

---

## Doc map — drill down by need

| You want to know | Read |
|---|---|
| Why this system exists, what it solves | `00-end-state-and-requirements.md` |
| Object model / parser / database schema / code layout | `01-oop-structure.md` |
| The complete CLI surface | `02-cli-service.md` |
| How an agent connects, the proposal mechanism | `03-mcp-service.md` |
| Implementation milestones | `04-milestones.md` |
| How testing is done | `05-testing.md` |
| The full backbone from install to deploy | `06-end-to-end.md` |
| "I want to do X" — step-by-step | `07-playbooks.md` |
| Which design pieces aren't done, what M0 must cover | `08-engineering-review.md` |
| Error handling, tracing, scale assumptions, performance budget | `09-observability-and-performance.md` |
| How to write SCHEMA for M0 (6 types, field-by-field) | `10-m0-schema-finalisation.md` |
| How to revise the Go ent for M0.5 (the PR) | `11-m0_5-ent-schema-pr.md` |
| How to one-shot rearrange legacy content into the new layout | `12-legacy-content-rearrange.md` |
| How a collaborating agent installs the skill and auto-understands silan | `13-skill-distribution.md` |

> Reading order: this doc → `00` → `06` (backbone) → `07` (operations) → `01` (objects / database) → `02`/`03` → `05` → `08` → `09` → `04`.
> Ready to start M0/M0.5: `10` → `12` → `11`.
