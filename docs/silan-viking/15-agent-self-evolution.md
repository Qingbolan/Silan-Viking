# 15 · Agent self-evolution — three-layer design and gates

> A requirement extension from `#10` (agents update content through
> proposals) / `#11` (agents maintain the website) / `#12` (context
> enrichment). This chapter answers a new question: **let a
> collaborating agent be more than "edit one file on command" — let
> it actively evolve the project's content, structure, and even UI;
> what is the boundary, what is the gate.**
>
> One sentence to pin the whole chapter: **"self-evolution" is not
> "the agent edits and ships on its own". It is "the agent actively
> discovers + proposes + tiered gates + the human decides at key
> nodes".** The level of agent autonomy decreases as the cost of
> a wrong change rises.

---

## §15.0 Three-layer model — layered by "cost of getting it wrong"

The things that can be evolved inside silan-viking fall into three
layers; **autonomy is inversely correlated with cost**:

| Layer | Object | Cost of error | Autonomy | Gate |
|---|---|---|---|---|
| L-content | markdown under `content/resources/**` | low — data; git-revertible | **high**: agent proactively proposes | validation ① + human `accept` (already in place) |
| L-structure | `content/SCHEMA.md` + derived DB schema | medium — wrong causes sync/promote failures | **medium**: agent proposes; machine gate + human double-sign | three-way consistency check + human `accept` |
| L-UI | `frontend/` code + deployment | high — runtime, user-visible, hard to self-test | **low**: agent drafts a PR; human reviews | CI + preview + human merge |

> Why not "one mechanism for everything": a wrong content edit is
> one line of markdown; a wrong schema means `portfolio.db` cannot
> rebuild; a wrong UI is a blank screen in production. **Different
> costs require different gates.** Cramming all three into the same
> `accept` chain means "the looseness fit for editing markdown" is
> applied to "editing the database" — exactly the breeding ground
> for the M4 contract-drift class of incident.

---

## §15.1 L-content evolution — existing mechanism + proactivity boost

### Today (already implemented)

The `03` tier 2 `capture` + `§3.1` proposal chain: the agent drafts
content → `proposal/<ulid>` git branch → validation ① → human
`silan proposal accept`. The idea→blog→project evolution edges
(`content_relation`) are also in. **This layer needs no new work;
it can already evolve content.**

### The boost — from "passive capture" to "active discovery"

Today the agent captures one thing when the owner voices one thing.
The evolution boost gives it **initiative**:

| New MCP tool (tier-2 extension) | Purpose |
|---|---|
| `suggest_relations()` | Scan every Item and find **evolution edges that should exist but are missing** — e.g. a blog clearly talks about an idea but has no `documents` edge. Returns the candidate-edge list; the owner `accept`s one by one. |
| `suggest_parts(uri)` | Look at an Item's existing Parts and propose **missing optional Parts** — e.g. an `experimenting`-status idea has no `progress` Part. |
| `suggest_lifecycle(uri)` | Based on content maturity, propose a `status` advance — e.g. an idea's overview already reads like a project plan; propose `idea promote --to project`. |

**Gate**: identical to the existing proposal mechanism — these
`suggest_*` **only produce proposals**, they never auto-apply.
Their outputs enter `silan proposal list`; the owner `accept` /
`reject` each one. The risk is low because: a wrong suggestion =
one rejected proposal, zero side effect.

**Code site**: `silan-viking-mcp`, pure read + proposal output; no new crate.

---

## §15.2 L-structure evolution — agents edit SCHEMA; the machine gate stands guard

### Why this layer is feasible

silan-viking's parser is **config-driven** (`OVERVIEW.md` Q5):
"adding a content tab = edit the type definition in `SCHEMA.md`, no
Rust change". So an agent editing `SCHEMA.md` is, in principle, no
different from editing a markdown file — both change a file in
`content/`, and both can go through a proposal branch.

### Why this layer cannot copy L-content's looseness

A `SCHEMA.md` edit **cascades into three downstream consumers**:
1. **Engine parser** — new Part role / frontmatter field, the parser must be able to parse it.
2. **Derived DB schema** — new fields may need new columns; ent schema and the engine mapper must stay consistent (this is exactly the M4 contract-drift battlefield).
3. **promote** — the `DERIVED_TABLES` allowlist and column mappings must follow.

When an agent casually adds a field to `SCHEMA.md` without a check,
the next `sync` or `deploy` will blow up just like e2e debugging day:
`NOT NULL constraint failed`, `schema drift`, `FOREIGN KEY constraint
failed` — one by one.

### The gate — "structure proposals" must pass a three-way consistency check

L-structure evolution introduces a **new proposal sub-kind**:
`schema-proposal`. It uses the proposal branch path, but before
`accept` there is one extra **machine gate** `silan schema check`:

```
agent calls propose_schema(change)
   ↓  opens proposal/<ulid> branch; touches SCHEMA.md
   ↓
validation ①  —— SCHEMA.md's own syntax / type-definition validity
   ↓
silan schema check  —— ★ the new three-way consistency gate ★
   ├─ engine side: run the parser with the new SCHEMA; fixture content parses
   ├─ DB side: derive the new SCHEMA → derived-table DDL diff; detect whether ent changes are needed
   └─ promote side: detect whether DERIVED_TABLES / column mappings are still self-consistent
   ↓  all three green → enters acceptable state
human accept  —— owner reviews the diff + the schema-check report; double-sign
   ↓
if the check report says "ent change needed" — accept does not pass through;
   it produces a backend ent-change ticket (handled in the L-UI layer)
```

**Key rulings**:
- The agent **can propose** schema changes; it **cannot** auto-land them into `portfolio.db`.
- If `silan schema check` fails → the proposal is marked red; cannot `accept` (same discipline as validation ①).
- Any schema proposal whose check determines "ent / Go code changes are also required" — `accept` only merges `SCHEMA.md`, and **simultaneously produces an L-UI-layer ticket**, because Go code edits belong to L-UI. Schema and code land in two layers, at two cadences (M0.5a/M0.5b already follows this idea).

### Safety ruling — structural operations the agent must never do

| Operation | Allowed? | Reason |
|---|---|---|
| Add an optional Part role / add a frontmatter field | ✅ propose | additive; backward-compatible |
| Add a new content type | ⚠️ propose + strict human review | cascading parser / mapper / ent edits; equivalent to an L-UI ticket |
| Delete a Part / delete a field / delete a type | ❌ never | destructive; data loss; only the owner manually |
| Edit a derived-DB runtime table | ❌ never | hard constraint in `08` §8.3; runtime data is off-limits to the agent |

**Code site**: `silan-viking-cli` adds a `schema` command group (`check` / `diff`); `silan-viking-mcp` adds the `propose_schema` tool. No new crate.

> **Fixture sync**: a `schema-proposal` editing `SCHEMA.md` **must
> sync-upgrade `engine/tests/fixtures/content/` in the same
> proposal branch** — `schema check`'s engine-side validation runs
> against the upgraded fixture; if it isn't synced, the gate fails.
> Full rules in `08` §8.7.1.

### §15.2.1 The DB-side derivation algorithm of `schema check` (E2 implementation-grade spec)

> Red-team audit addition: §15.2's diagram treats "DB side: derive
> the DDL diff" as a black box. This section gives an
> implementation-grade algorithm — when E2 implements `schema check`,
> use this as the basis.

**Input**: the `SCHEMA.md` on the proposal branch (new) + the main-branch `SCHEMA.md` (old).
**Output**: a `DdlDiff` report — for each type's derived table, which `ADD COLUMN` / type change / no-op is needed, and whether the compile-time closed set is touched.

**Algorithm (pure derivation; no real DB needed)**:

```
1. Parse new and old SCHEMA.md; obtain a { type -> [FieldDef] } map for each.
   FieldDef = { name, kind (see table), required, enum_values? }
2. Diff field sets per the 6 types; each change gets one verdict:
   - Added non-enum field        → ADD_COLUMN
   - Added enum field            → ADD_COLUMN (the column ships with CHECK;
                                   SQLite's ADD COLUMN supports a new column
                                   with CHECK — safe)
   - Existing enum extended/reduced → REBUILD ★ key point: SQLite cannot edit
                                   CHECK constraints in place; the 12-step
                                   "create new table + migrate data + rename"
                                   is required. This is a destructive
                                   migration, not an ADD — but ent migration
                                   can do it.
   - Field deletion / kind change → FATAL (forbidden in the §15.2 safety
                                   table; column type changes are destructive)
3. For every ADD_COLUMN, use the "field kind → SQLite column type" map (below)
   to compute the column definition.
4. New Part role: if the shape is known → only item_part gains a few extra
   rows; no DDL; verdict = NO_OP. If the shape is unknown (a new shape) →
   verdict = ENGINE (the compile-time closed set is touched).
5. Aggregate into a four-state schema_check result (matches the propose_schema
   enum in §15.5.1):
   - All NO_OP                                  → passed
   - Contains ADD_COLUMN / REBUILD, no FATAL/ENGINE → needs_ent
       (REBUILD is recorded in ddl_diff with action `rebuild_table`; ticket
        notes "destructive migration, ent runs the 12-step rebuild, requires
        a downtime window or a shadow table")
   - Contains ENGINE                            → needs_engine
   - Contains FATAL                             → failed (proposal marked red, no accept)
```

**Field kind → SQLite column type mapping table** (the sole basis for derived DDL):

| SCHEMA `kind` | SQLite column type | Nullability | Notes |
|---|---|---|---|
| `string` / `slug` / `uri` | `TEXT` | `required` → `NOT NULL` | — |
| `text` (long text) | `TEXT` | same | body-like text usually flows through `item_part`, not the main table |
| `int` | `INTEGER` | same | — |
| `bool` | `INTEGER` (0/1) | `NOT NULL DEFAULT 0` | — |
| `date` / `datetime` | `TEXT` (ISO-8601) | same | matches the existing ent `field.Time` |
| `enum` | `TEXT` + `CHECK(col IN (...))` | same | **Adding a new enum field** = safe ADD; **changing an existing enum's value set** = REBUILD (see algorithm step 2) |
| `string_list` / `tag_list` | does not enter the main table | — | goes through a join table or JSON; verdict = ENGINE |

> **Difference between the three non-passed verdicts**:
> - `needs_ent` — Go ent edits suffice; the Rust engine is untouched
>   (`silan-viking-entities` is reverse-regenerated). Within this,
>   `ADD_COLUMN` is a lightweight migration; `REBUILD` (changing an
>   enum's value set) is a **destructive migration** — ent can
>   still do it (SQLite 12-step rebuild), but `ddl_diff` must mark
>   it `rebuild_table` and the ticket must note "downtime window /
>   shadow table required" so the owner is informed at `accept`.
> - `needs_engine` — the compile-time closed set is touched (new
>   shape / new type / list-class field); the Rust engine needs
>   edits. `accept` still merges only `SCHEMA.md`; the ticket is
>   tagged "engine code change required".
> - `failed` — destructive or forbidden operations like field
>   deletion / kind change; the proposal cannot be `accept`-ed.
>
> This pins §15.2's "detect whether ent changes are needed" into
> a **decidable four-state**, and it no longer hand-waves the real
> SQLite constraint that "changing an enum value set is a
> destructive operation" (early drafts treated "adding to an enum"
> as a safe ADD — the red-team audit corrected this; pinned here).

---

## §15.3 L-UI evolution — agent drafts, human reviews the PR; no "auto-ship"

### Ruling: UI "self-evolution" = agent-assisted development + human review, not automation

Letting the agent auto-edit `frontend/` components and
`site deploy` them — **this design explicitly vetoes that**. The
reason is cost-layering:

- Content wrong: the owner sees the diff and notices; revert one markdown line.
- Schema wrong: `silan schema check`'s machine gate catches it on the spot.
- **UI wrong: the agent has no "see the rendering result" ability.** A broken component, a style regression, a broken interaction — the machine gate cannot measure "ugly" or "unusable", and the agent cannot self-measure either. These errors can only be discovered by humans, and the time of discovery is "after it's shipped and a user sees it".

So the correct shape of "evolution" at the UI layer is **the
collaboration mode you and I are using right now**: the agent (in
Claude Code / IDE) edits code → runs lint/build/tests → **opens a
PR** → **human reviews + checks preview → human merges**. This
needs no new mechanism inside silan-viking — it is standard
agent-assisted development.

### What silan-viking can do for UI evolution — within limits

Not "let the agent auto-edit UI", but **give the agent better input
when it edits UI**:

| Capability | Purpose |
|---|---|
| `site check` extension | Add to the pre-publish health check: broken links, missing images, component prop contracts, design-system token consistency — gives the UI-editing agent a self-check list. |
| schema → frontend type-linkage check | Each ent-change ticket produced by L-structure evolution carries a "which frontend components / types must follow" list (continuing `docs/backend-frontend-migration/`'s endpoint↔component matrix). |
| Deploy preview | `site preview` already exists — after the agent edits UI, the human eyes the preview before deciding. |

**Ruling**: the agent's admission to `site deploy` stays at the
status quo in `03` tier 4 — `deploy()` is off by default, with
mandatory dry-run + owner confirmation. **UI shipping authority
always belongs to the human.**

---

## §15.4 The three layers strung together — what one "complete evolution" looks like

The owner says: "That AI content optimizer idea — I've been thinking about it more deeply lately."

```
[L-content] agent recall hits that idea; suggest_lifecycle proposes:
            "its overview already reads like a project plan — propose
             promoting to project."
            → owner accepts → idea→project evolution edge + a new project
              Item is created.

[L-content] agent suggest_parts: "the new project is missing a progress Part."
            → owner accepts → progress Part scaffolded.

[L-structure] agent notices project needs an "experimental metric" field
              that SCHEMA does not define.
              propose_schema: add a metrics field to project's frontmatter.
              → silan schema check: engine parser ✅, DB derivation says
                "ent column needed" ⚠️.
              → owner reviews the report and accepts → SCHEMA.md is merged
                + an ent-change ticket is produced.

[L-UI] The ent-change ticket enters the dev flow: the agent (inside IDE)
       follows the ticket, edits the ent schema, regenerates, edits the Go
       handler, edits the frontend component to read the new field → runs
       tests → opens a PR.
       → owner reviews the PR + checks site preview → merges → site deploy
         (with human confirmation).
```

The autonomy at each layer differs: at L-content the agent produces
proposals nearly fully automatically and the owner `accept`s along;
at L-structure the agent proposes but is held by the machine gate +
human double-sign; at L-UI the agent only assists writing code,
human reviews the PR, human ships. **Evolution is real, but the
higher the cost the more the human is present.**

---

## §15.5 Staging

| Stage | Deliverable | Depends on |
|---|---|---|
| **E1** | L-content boost: the three MCP tools `suggest_relations` / `suggest_parts` / `suggest_lifecycle`, producing proposals | the existing proposal mechanism (M7) |
| **E2** | L-structure: the `silan schema check` three-way consistency gate + the `propose_schema` MCP tool + the `schema-proposal` sub-kind | E1, a stable ent↔engine contract |
| **E3** | L-UI assist: `site check` extension + the schema→frontend linkage list | E2 |

> E1 is low-risk and purely additive; can be scheduled immediately.
> E2 is the chapter's main engineering load — the three-way check
> in `schema check` is the key, turning "the agent edits structure"
> from a dangerous thing into a gated thing. E3 introduces no "UI
> auto-evolution"; it only thickens the input for an agent editing
> UI.

> **Wired into the backbone**: E1 / E2 / E3 are officially scheduled
> in the "E1–E3" section of `04-milestones.md` (after M9). The new
> MCP tools (`suggest_*` / `propose_schema`) are increments outside
> the M9 closed set of 18 tools. The closed set grows to 21 after
> E1 lands, then to 22 after E2; `03` §3.2 closed-set notes state
> this; the `silan schema` command group enters `02` at E2.

### §15.5.1 JSON-schema contract for the E-stage tools

> Red-team audit addition: the four E1/E2 MCP tools previously had
> only behavioural semantics, no `03` §3.2-style input/output JSON
> schema. This section fills that in — when E1/E2 implements
> `silan-viking-mcp`, use this as the source of tool signatures.
> Error returns follow the unified `{ "error": {...} }` shape from
> `03` §3.2.

```json
{
  "suggest_relations": {
    "input": { "scope": "uri[]?", "limit": "integer?" },
    "output": { "suggestions": [
      { "from": "uri", "to": "uri", "relation_type": "string",
        "confidence": "number", "rationale": "string",
        "proposal_id": "string" }
    ] }
  },
  "suggest_parts": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "suggestions": [
      { "role": "string", "shape": "prose|entry_list|key_value_list",
        "rationale": "string", "proposal_id": "string" }
    ] }
  },
  "suggest_lifecycle": {
    "input": { "uri": "uri" },
    "output": { "uri": "uri", "current_status": "string",
      "suggested_status": "string", "rationale": "string",
      "proposal_id": "string?" }
  },
  "propose_schema": {
    "input": {
      "change": {
        "op": "add_field | extend_enum | add_part_role",
        "target_type": "idea|blog|project|episode|resume|update",
        "field_def": {
          "name": "string", "kind": "string",
          "required": "bool", "enum_values": "string[]?"
        },
        "part_role": { "role": "string", "shape": "prose|entry_list|key_value_list" }
      },
      "rationale": "string?"
    },
    "output": { "proposal_id": "string", "branch": "proposal/<id>",
      "kind": "schema-proposal",
      "schema_check": "passed|needs_ent|needs_engine|failed",
      "ddl_diff": [ { "type": "string",
        "action": "no_op|add_column|rebuild_table",
        "column": "string?", "sql_type": "string?",
        "destructive": "bool" } ],
      "issues": ["string"] }
  }
}
```

> `propose_schema.input.change` is a **structured** object, not
> free text — it must directly drive §15.2.1's derivation
> algorithm, so the fields are isomorphic to the algorithm's
> `FieldDef`. `op` is one of three: `add_field` (uses
> `field_def`), `extend_enum` (uses `field_def.name` +
> `field_def.enum_values` for the new value set), `add_part_role`
> (uses `part_role`). Sub-objects unrelated to `op` are `null`.
> Destructive operations like field deletion / type deletion
> **have no corresponding `op`** — the agent cannot initiate them
> at the contract layer (the §15.2 safety table's "agent never"
> is enforced here).

Contract notes (consistent with the existing mechanism; no parallel rules):

- The three `suggest_*` **only ever produce proposals** — each
  `suggestion` in the output carries a `proposal_id`; outputs enter
  `silan proposal list`; the owner `accept` / `reject` per
  suggestion. `suggest_*` themselves do not apply and have no side
  effect (the §15.2 "gate").
- `propose_schema`'s `schema_check` field is the four-state result
  of the §15.2.1 derivation algorithm
  (`passed` / `needs_ent` / `needs_engine` / `failed`); `ddl_diff`
  is the algorithm's `DdlDiff` report; the three `action` states
  `no_op` / `add_column` / `rebuild_table` map to algorithm
  verdicts, with `destructive=true` ≡ `rebuild_table` (destructive
  migrations like changing an enum's value set in SQLite). When
  `failed`, the proposal is marked red and cannot `accept`.
- These 4 tools reuse the `McpError` variants from `03` §3.2:
  argument errors → `InvalidRequest`; target Item does not exist →
  `Workspace`; proposal / validation failed → `Proposal`. The E
  stages introduce no new error variants.

---

## §15.6 One sentence

**Agent self-evolution isn't "let it auto-edit and auto-ship" — it
is "give it active-discovery + proposal ability, and constrain it
with the three-layer gate: the higher the cost, the harder the
gate, the more present the human".** L-content can already evolve
(boost proactivity); L-structure can evolve (build the
`schema check` machine gate first); L-UI does not "self-evolve" —
it is "agent-assisted + human-reviewed PR".
