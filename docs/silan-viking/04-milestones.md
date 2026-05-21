# 04 · Milestones

> Implementation route. The M0–M9 main table is fixed; the
> implementation-grade contracts for M7–M9 are filled in via the M4/M8
> acceptance exits in `10` §10.8.

## Current status

- `00`–`03`: OOP structure / CLI / MCP are aligned after several review rounds.
- The review revisions have landed (`01-oop-structure.md` §1.8.1 + §1.10 revision A).
- M0–M6 can be scheduled directly from this chapter; M7–M9 must satisfy the pre-condition contracts in `10` §10.8 before starting.

## ⚠️ Implementation boundary — how far the docs can carry us

> **This boundary matters; do not misread "docs are complete" as "the whole system can be written end-to-end".**

| Stage | Doc support | Notes |
|---|---|---|
| **Structural layer + M0 / M0.5a** | ✅ ready to build | Layering, crate boundaries, Parser/Mapper/Sink, RowSet, entity generation, SCHEMA finalisation, ent revision PR — implementation-grade contracts are complete. |
| **M1 – M6** (Rust core) | ✅ ready to build | base / content / entities / app (parser + sync). `00`–`12` in this directory carry the per-crate implementation. |
| **M7 – M9** (L4 adapters: CLI/MCP/site/deploy) | ⚠️ **partial contracts; M4/M8 exits still required** | The CLI direction is in `02`; MCP tool JSON schema lives in `03` §3.2; promote DDL/WAL lives in `11` §11.11. The **Go API read matrix (endpoint ↔ table ↔ field)** has a draft in `docs/backend-frontend-migration/01-backend-migration.md` §1.10, but M4 must verify it against the real `backend.api` / ent table names; M8 must do another verification against the final SCHEMA / Go API for the `03` / `11` / skill integration contracts. |

> One line: **M0 → M6 are ready to start; build the Rust core**. But
> the `10` §10.8 exits are no longer "we'll figure it out later":
> verifying the Go API read matrix against real code gates the M4
> exit; the final verification of MCP schema / promote details gates
> the M8 exit. Don't start the corresponding M9 implementation until
> those exits pass.

## M0 — finalise `content/SCHEMA.md` (next step)

> **The coding-grade spec is `10-m0-schema-finalisation.md`** — this
> section is the milestone-level summary; `10` is the per-field, per-
> enum, per-error-tier basis for the 6 types
> (idea/blog/project/episode/resume/update). The legacy-content
> rearrange rules are in `12-legacy-content-rearrange.md`.

Take the "latest layout" from `00` plus the objects from `01` and pin
them field by field.

How: read through silan's 6 parsers (`silan/parsers/`) and real
`.silan-cache` samples, extract only **field semantics** and existing
content facts; do not inherit the legacy on-disk layout. The runtime
parser only accepts the latest layout
`content/resources/{type}/{item}/parts/<role>/{meta.toml,<lang>.<ext>}`.
Legacy content enters the new system via the M0 offline rearrange
script, never through a runtime compat layer.

Open items from the M0 review — F1/F2 closed by `10`:

- F1 — ✅ closed (`10` §10.4.6): `update` is kept as the 6th content
  type, with `recent_updates` as its main content table; the
  question "what role does `update` play in `content_relation`" is
  gone.
- F2 — ✅ closed (`10` §10.4.6 footnote / §10.4.1):
  `idea_details.references` (free text) and `content_relation`'s
  `references` edge each have their own role — settled.
- §1.4 — ✅ closed (final ruling, `01` §1.4): both `.silan-cache`
  manifests are engine-derived, `rebuild`-able, in `.gitignore`,
  and private to the type crate; `meta.toml` is the editable
  contract (in git); `part_id` is generated only by
  `init`/`add-part`/the rearrange tool; `sync` never writes back
  implicitly.
- The three review-flagged information gaps — language-variant
  inference, episode parse path, idea multi-file aggregation.
- The SCHEMA minimum contract in `08-engineering-review.md` §8.2:
  URI, ItemID/PartID, frontmatter, relation declaration,
  status/visibility, manifest ownership.

## M0.5 — schema revision PR (split into M0.5a / M0.5b)

> **The executable PR design is `11-m0_5-ent-schema-pr.md`** — every
> new/changed table's full fields, enums, indexes; the table-drop
> list; the derived / runtime allowlist; migration steps. This
> section is the overview.
>
> **Review decision P1**: M0.5 is split into **M0.5a / M0.5b**, with
> M6 in between (detailed execution order in `11` §11.12). Reason:
> at M0.5 there is no verifiable Rust sync yet (that arrives in
> M5/M6); we cannot drop the resume-only tables without a verifiable
> sync — if sync breaks, resume data is gone and there is no path
> back.

### M0.5a — add new tables + change enums + adapt the API (**keep every legacy resume table**)

The revisions A/D/E/F/G in `01-oop-structure.md` §1.10 + the rulings in `10`, landed in Go ent:

- New tables: `content_relation` (A), `content_interaction` (D), `annotation` (E), `item_part` (+ `item_part_translation`, G), `part_entry` (+ `part_entry_translation`, `10` ruling #2), `episodes` / `episode_series` (+ their translations, `10` ruling #1 — episode is an independent type); enum fields + indexes.
- Migrate but **do not drop in M0.5a**: `project_views`, `project_likes`, `comment_likes` are runtime data; in this stage only add `content_interaction` and write a one-shot migration script; the actual drop is moved into the irreversible window of M0.5b (`11` §11.9 / §11.12). `project_relationships` is a derived table; it can be removed once M0.5a moves to `content_relation`. `blog_posts` drops the `ideas_id` foreign key.
- Change `comment`: `type` / `entity_type` become enums; rename `referrence_id` to `reference_id` (F).
- Change `recent_updates`: promote it to the main content table for `update` (the 6th type) — add `slug` / `visibility` / `update_type` (`10` §10.4.6 ruling #3).
- Change `blog_posts` / `ideas` / `projects`: align enums and visibility with `10`.
- `*_details` tables (idea / project): text-tab fields move out to `item_part`; structural attribute fields stay — field-by-field split in `11` §11.8.
- Absorb `request_logs`: it becomes a formal ent table (`10` ruling #7; not merged into `content_interaction`).
- **Resume-only tables `education` / `work_experience` / `publications` / `awards` / … are untouched and preserved at this stage.**
- Deployment data policy per `08` §8.3: the server's persistent DB keeps runtime tables; deploy only replaces derived tables — a fresh local `portfolio.db` must never overwrite live comments / pings.
- ent regenerated → Go API adapted → promote refactored → `sea-orm-cli` reverse-generates `silan-viking-entities`.

> M0.5a is a Go-side change and is decoupled from the silan-viking
> engine implementation, so it **can run in parallel with Rust
> M1–M5**. M4 (entities reverse generation) depends on M0.5a
> finishing.
>
> **The complete construction plan for "Go API adaptation"**: the
> schema change cascades into 18 backend handlers / 14 logic files,
> plus the frontend's API / types / components — the coding-grade
> per-handler / per-component plan lives in
> `docs/backend-frontend-migration/` (`01` backend, `02` frontend,
> `03` integration + cutover). The changes in that directory are
> tagged M0.5a / M0.5b per the timing above; the frontend resume
> refactor and the backend drop of legacy tables are both **M0.5b**
> (post-M6).
>
> **Execution discipline**: M0.5a runs in parallel, but it is not
> the sort of PR you hand a mid-level engineer to merge alone. It
> simultaneously touches Go ent, runtime-data migration, the API
> contract, the frontend types, and the promote allowlist; the PR
> needs at least one senior / owner to walk through the stage gates
> in `docs/backend-frontend-migration/03-integration-and-cutover.md`
> item by item. Any SQL that would drop runtime tables or
> legacy-resume tables must not appear in the M0.5a deploy bundle.

### M0.5b — drop the legacy resume tables (**only after M6 verification passes**)

After M5/M6 Rust parser/sync are in place, the offline rearrange (`12`)
has migrated legacy resume content into the new layout, and
`silan index sync` has verified that `part_entry` /
`part_entry_translation` rebuild correctly from the new layout — only
then does M0.5b drop `education` / `work_experience` /
`publications` / `awards` and friends (+ their detail / translation
tables), and re-run `sea-orm-cli` to regenerate entities.

> **M0.5b must come after M6** — that is the hard ordering from
> review decision P1. The detailed execution order and acceptance
> criteria live in `11` §11.12.

## M1+ — Rust engine implementation (the full milestone table)

> Bottom-up, crate by crate (the **7 member crates** in `01` §1.9;
> `engine/Cargo.toml` is the workspace root, not a crate — M1 builds
> the skeleton accordingly). Each M is independently acceptable.
> **Universal acceptance precondition**: `cargo test` + `cargo clippy
> -D warnings -D unwrap_used` + `cargo fmt --check` all green; M's
> that touch core operations also satisfy the span instrumentation +
> performance budget in `09`.

| M | Deliverable | Depends on | Acceptance |
|---|---|---|---|
| **M1** | `engine/` workspace + 7-crate empty skeleton + CI pipeline (`05` §5.5 + `09` §9.5 bench job) | M0 | `cargo test --workspace` runs (empty); the three-stage CI + the bench job are configured; the crate dependency graph is unidirectional at compile time (`01` §1.9) |
| **M2** | `silan-viking-base`: `SilanUri`/`Meta`/`ContentHash`/`Lang`/`Slug` + the `Identified`/`HasMeta` traits + `BaseError` | M1 | L1 unit tests cover URI parse / hash; `BaseError` matches `09` §9.1 |
| **M3** | `silan-viking-content`: `Namespace`/`Collection`/`Item`/`Part`/`File`/`Manifest`/`Relation`/`Series`/`Anthology` + `ContentError` | M2 | L1 units; the `Part == Identity` (the `PartID` in `meta.toml`) invariant holds; the `is_publishable` / `accepts_direct_write` invariants of the two namespaces hold |
| **M4** | `silan-viking-entities`: `sea-orm-cli` reverse-generated from Go ent post-M0.5a | M0.5a, M3 | Every new/changed table from M0.5a generates entities successfully; the Go API endpoint ↔ table ↔ field read matrix has been verified against the real `backend.api` / ent table names (`docs/backend-frontend-migration/01` §1.10, per `10` §10.8.1); the `05` L4 cross-check can use it |
| **M5** | `silan-viking-app` parsers: the `Parser` trait + **6 implementations** (idea/blog/project/episode/resume/update) + `ParserRegistry` (closed-set static dispatch) + read-only `Parsed` result + parser-only `ParsedBuilder` + `ParseError`; **parsers run in parallel** (`09` §9.4) | M3, M4 | All content-parse scenarios in `05` §5.3 green; the main chain `Workspace::scan -> Item.kind -> ParserRegistry::parser_for -> parse -> validate` test passes; the §5.3.1 ResumeParser slice runs; full sync of 1000 items < 5s (`09` §9.4) |
| **M6** | `silan-viking-app` sync: the `Mapper` trait + **6 implementations** (one per type) + `MapperRegistry` (closed-set static dispatch) + `RowSet` + `Sink` / `SqliteSink` + `Workspace::sync` + incremental; `sync` / `parse` spans (`09` §9.2) | M5 | Persistence scenarios in `05` green; the main chain `Parsed.kind -> MapperRegistry::mapper_for -> map -> Sink` test passes; incremental sync < 200ms; the L4 cross-check passes; `sync_meta` writes; `part_entry` rebuilds correctly from the new layout (the gate for M0.5b) |
| **M7** | `silan-viking-app` proposal + relation + query: proposal git branch, `accept` (worktree + check ② + lock + expected OID, `08` §8.5), `canonicalize`, `Workspace::query` + the SQLite FTS5 `QueryIndex` (`01` §1.5.Q) | M6 | All evolution-relation + proposal scenarios in `05` green; the `accept` atomicity tests (stale / conflict / re-check) pass; in an offline environment `recall` lexical fallback hits the expected Item; the acceptance report explicitly states `embedder=none|api|local|fallback` and does not advertise the lexical fallback as semantic recall |
| **M8** | `silan-viking-cli`: the `silan` binary, the 6 type command groups + 8 tool groups (`content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`) + `init` / `config` / `doctor` (`02`) + **skill bundle layout generator** (`silan skill emit/status/rm`, `13`) | M7 | The CLI scenarios in `05` + the operation playbooks in `07` all run; every group of `silan --help` is present; `silan skill emit --path t` produces a bundle Claude can discover, and `status` hash detection works; the skill bundle uses only the local convention `silan mcp serve --stdio`, no absolute paths or fixed ports across machines; the MCP JSON schema and the promote DDL/WAL/rollback contract have been verified against the final SCHEMA / ent table names (`10` §10.8.2–§10.8.3) |
| **M9** | `silan-viking-mcp` + `silan-viking-site`: MCP server (handshake pushes SCHEMA, four tool tiers, `ctx_*`, `08` §8.6) + `SiteProjector` / `SeoEmitter` + the `silan site` deploy chain (`06` §6.5 + `08` §8.3 promote) + **skill end-to-end integration verification** (`13`) | M8 | All MCP + end-to-end + website scenarios in `05` green; deploy promote replaces only derived tables (`08` §8.3) verified; **the skill bundle produced in M8 can be discovered by Claude and complete one capture through the M9 MCP** (playbook K in `07`) |

**Critical path**: M1 → M2 → M3 → M5 → M6 → M7 is serial (each step
depends on the prior step's objects / capabilities); M4 can run in
parallel with M2 / M3 once **M0.5a** is done; M8 / M9 are L4
adapters, available only after M7 produces a complete `Workspace`.
**Skill distribution (`silan skill`, requirement `#16`) has two
acceptance stages**: M8 first ships the CLI-side `emit/status/rm`
plus bundle layout / hash acceptance, so "install once" is testable
early; M9 does the real end-to-end capture once the MCP server is
ready. It still lives in `silan-viking-cli` (`13` §13.7), with no
separate crate and no downstream dependency. **M0.5b (drop of
legacy resume tables) depends on M6** — it only starts after M6
verifies that `part_entry` rebuilds correctly from the new layout;
this is the hard ordering from review decision P1 (`11` §11.12).
M0.5b is not on the Rust critical path but is gated by M6.
**Schedule the team along this dependency graph.**

## E1–E3 — agent self-evolution (after M9, chapter `15`)

> `15-agent-self-evolution.md` defines the three-layer design for
> "an agent that evolves a project on its own"; it carries its own
> §15.5 staging table. The red-team audit pointed out that it was
> originally orphaned outside the main milestone table; this
> section wires it in officially — the E stages come after M9 (MCP
> server is ready); the tool / command contracts come from `15`.

| Milestone | Deliverable | Depends on | Acceptance |
|---|---|---|---|
| **E1** | `silan-viking-mcp` adds the three tools `suggest_relations` / `suggest_parts` / `suggest_lifecycle` (`15` §15.2); their outputs flow through the existing proposal mechanism — no new gate | M9 | Proposals produced by the three tools can be reviewed via `silan proposal`; the `03` tool closed set grows 18 → 21, `tools/list` and `UnknownTool` follow in step |
| **E2** | `silan schema check` three-way consistency gate (CLI) + the `propose_schema` MCP tool + a `schema-proposal` proposal sub-kind (`15` §15.2; DDL algorithm §15.2.1; JSON schema §15.5.1) | E1; stable ent ↔ engine contract | `schema check` catches "the engine parser passes but ent needs a new column"; `schema check` must pass before any schema proposal `accept`; the `02` `silan schema` command group and the `03` tool closed set (→ 22) are updated in step |
| **E3** | `site check` extension + schema → frontend follow-through checklist (`15` §15.4) | E2 | `site check` lists "schema changed but frontend hasn't followed"; no automatic UI evolution |

> The E-stage MCP tools (`suggest_*` / `propose_schema`) are **not in
> the 18-tool M9 closed set** — they are increments added in E1/E2;
> the `03` §3.2 closed-set description states this. The
> `silan schema` command group is the same: M8's 8 tool groups do
> not contain it; E2 adds it.

---

**Cross-cutting acceptance for every M** (per `09`, not listed as a separate milestone):
- M's that touch core operations (M5 sync/parse, M6 sync, M7 accept, M9 mcp/deploy) have `tracing` spans instrumented per `09` §9.2 at acceptance time.
- M5 / M6 / M7 acceptance includes the `09` §9.4 performance budget (criterion benchmarks).
- Each crate ships with its own `thiserror` error enum on delivery (`09` §9.1).

> The M0–M12 plan in the old `archive/RUST-ENGINE-DESIGN.md` is superseded by this table; do not refer to its split.
