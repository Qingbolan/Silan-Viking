# 14 · Drift diagnosis and per-milestone convergence

> This chapter is not new design. It answers a question that an e2e
> run surfaced — heavier than any single bug:
> **why does a project that claims to be settled from `11`, after
> multiple rounds of first-principles review and convergence, have
> schema / behaviour drift everywhere in the implementation? If we
> fix one, will the next still appear?**
>
> This chapter gives the first-principles diagnosis, the three seam
> classes where drift hides, the convergence mechanism that was
> missing, and the construction plan for "re-running per-milestone
> convergence".

---

## 14.1 Symptoms — 11 drift sites surfaced by one e2e run

The 2026-05-17 e2e run (`silan init` → `index sync` → query for
updates) did not stop at "the CLI doesn't work" — `init` / `new` /
`sync` / `content` / `relation` all run correctly in practice.
What it surfaced is a **chain of implementation defects**, totalling
11 drift sites:

| # | Drift | Between which two sides |
|---|---|---|
| 1 | `content_relation` writes `from_uri` ≠ entities' `from_type/from_id` | impl ↔ impl |
| 2 | `item_part` writes only `item_id/role` ≠ entities' 7 columns | impl ↔ impl |
| 3 | The translation table's FK `item_id` ≠ entities' `blog_post_id` etc. | impl ↔ impl |
| 4 | `part_entry` flat columns ≠ entities' `shared_payload` JSON column | impl ↔ impl |
| 5 | `main_row` writes a `kind` column; entities have no such column | impl ↔ impl |
| 6 | `episodes.series` ≠ entities' `series_id` | impl ↔ impl |
| 7 | `priority` / `tech_stack` legacy frontmatter fields had no landing place — *first judged doc ↔ doc, actually the new design intentionally drops them (see §14.3 class-C correction)* | (not drift) |
| 8 | `scroll_progress` / `recent_updates` media fields — Go ent has them; `11` first draft missed them (now back-filled) | doc ↔ doc |
| 9 | `init` doesn't lay 6 type directories + sample items — impl ≠ `06` §6.2.1 | impl ↔ doc |
| 10 | `scaffold` doesn't write `part_id` — impl ≠ `01` §1.4 | impl ↔ doc |
| 11 | `content tree/ls`'s `--help` advertises a `<uri>` argument the impl doesn't accept | impl ↔ doc |

> 11 sites are **not all the same kind of error** — that itself is
> a clue. They fall into three classes (last column); each class
> has different causes, but **shares one root**.

---

## 14.2 Root cause — the engine was "fully generated in one shot from the docs", skipping `04`'s convergence mechanism

The `04` milestones split implementation into M1 → M9: each is
"independently acceptable", with an ordering and a gate.
**That design is correct.** But git history shows how the engine
actually landed:

```
39491f7  feat(engine): silan-viking Rust content engine (M1-M9)
```

**M1 to M9, nine milestones, one commit.** The engine was "read the
docs → write out all 7 crates in one shot", not "M1 finishes
acceptance → M2 builds on M1's real artefact", growing milestone by
milestone.

"Generate everything at once from the docs" and "converge milestone
by milestone" are fundamentally different:

- **Per-milestone convergence**: after M4 generates `entities`, when M5 / M6 write the `mapper`, **M4's real artefact** is right there. The mapper naturally writes columns matching `entities`' real column names — the previous milestone's artefact is the next milestone's **factual foundation**.
- **One-shot full generation**: when writing the `mapper`, `entities` might not be generated yet, or sits in a different file that the author didn't check. The mapper author writes column names **based on the doc description** (or even their own understanding of the schema).

The header comment of `sync/rows.rs` is the smoking gun:

> "Until the sea-orm Entities are reverse-generated (milestone M4),
> a `Row` is represented generically..."

—— **The `mapper` was written under the assumption that `entities`
doesn't exist yet.** M4 did generate `entities` later, but **no
step, no test** forced the `mapper` to go back and align with it.
And `sink` is row-driven dynamic table creation (whatever columns
the mapper writes is what the table gets), so drift can persist
silently and `cargo test` still goes green.

**Conclusion**: drift is not 11 incidental bugs, it is the
**inevitable product** of "skipping per-milestone convergence and
letting 7 crates each write to a 'plan' (the docs) in parallel".
The docs are "what we plan to build"; the `04` milestone chain is
meant to make "the plan" **solidify into facts** step by step, with
each step standing on the previous step's facts. Skip the chain and
drift becomes the default state.

---

## 14.3 Three seam classes — drift hides between milestones

Classifying the 11 sites by "between which two sides", we get
**three seam classes**. Each is a "upstream artefact → downstream
consumer" seam; drift hides in the seam:

### Class A — impl ↔ impl (two crates in the same generation, each writing independently)

Drift #1–#6. Typical seam: **M4 `entities` ↔ M5/M6 `mapper`**.
`entities` is reverse-generated from Go ent (correct); `mapper`
writes columns from the doc description (drifted). Two modules in
the same commit go their own way; **no step exists to align them**.

### Class B — impl ↔ doc (impl didn't track the settled docs verbatim, or docs changed afterwards and impl didn't follow)

Drift #9–#11. Typical seam: **`06` / `01` / `02` settled docs ↔
each crate's impl**. `init` was supposed to produce 6 types (`06`
§6.2.1) but produced 1; `scaffold` was supposed to write `part_id`
(`01` §1.4) but didn't; `content tree`'s `--help` promised a `<uri>`
argument the impl never wired in.

### Class C — doc ↔ doc (two docs never aligned with each other)

Typical seam: **`11` settled doc ↔ Go ent schema**.

> **2026-05-17 convergence cross-check — this seam class barely
> drifts (>99% consistent).** The first draft of this chapter put
> #7 / #8 in class C; after a per-table cross-check of `11` ↔
> `backend/internal/ent/schema/`, that turned out to be a diagnostic
> misjudgement. Corrections:
> - `priority` (idea) / `tech_stack` (project): Go ent **does not
>   have** these columns, and `10` / `11` **never actually pinned
>   them as columns** either — they are Python old-parser frontmatter
>   fields that the new design **intentionally drops**. Not drift.
> - `scroll_progress` + `recent_updates` media fields: Go ent has
>   them; `11`'s first draft missed them — back-filled into `11`
>   §11.3 / §11.7.1. Aligned.
> - The only leftover: `personal_info.visibility` — `10` §10.4.5
>   gave resume a `visibility`; Go ent's `personal_info` lacks the
>   column. A small gap; goes to M0.5a.
>
> **Conclusion**: class C does not need a dedicated gate — Go ent
> and `11` are already highly consistent. Convergence focus stays
> on class A (gate built) and class B (gate to build).

---

## 14.4 The missing convergence mechanism — every seam needs a "gate"

Drift can hide long-term because **no mechanism continuously checks
both sides of every seam for consistency**. The cure is not "fix
the 11 sites this time" (that's symptomatic), it is **build an
automatic validation gate for every seam class**, so drift is
**structurally impossible to stay silent**.

| Seam class | The gate it needs | Status |
|---|---|---|
| A impl ↔ impl (mapper ↔ entities) | Pre-write validation in `sink`: the columns the mapper produces must ⊆ the entity columns of `silan-viking-entities`; mismatch raises `SchemaDrift` | ✅ **Built** (2026-05-17, `sync/sink.rs` Phase 0) — see §14.6 |
| B impl ↔ doc | A set of "contract tests" that turn doc contracts into executable assertions: `init` output == `06` §6.2.1 (6 type directories + 3 samples + SCHEMA/config/git); `scaffold`'s meta.toml == `01` §1.3.1/§1.4 (`part_id` stable); `--help` == the actual command set | ✅ **Built** (2026-05-17, `silan-viking-cli/tests/doc_contract.rs`, 7 tests) |
| C doc ↔ doc (`11` ↔ Go ent) | After the 2026-05-17 per-table cross-check this seam is >99% consistent (see §14.3 class-C correction) — **no dedicated gate needed**; the only leftover, `personal_info.visibility`, goes to M0.5a | ✅ Cross-checked; no gate needed |

> **The mapper ↔ entities gate is the model**: it changes class-A
> drift from "silent" to "errors at sync time". When opened, one
> sync reports every drifted column in one pass — the six class-A
> drifts were exactly what it forced out, and they were then
> aligned one by one. Classes B / C don't yet have equivalent
> gates, so "drift still feels alive" is real: nothing is watching
> those two seams.

---

## 14.5 "Re-run per-milestone convergence" — construction plan

silan's ruling: **re-run per-milestone convergence**. This does
not mean "rewrite all 7 crates from M1" (that is another one-shot
big move, just in a new direction). It precisely means:

> Let the convergence mechanism `04` designed — later milestones
> stand on earlier milestones' real artefacts; every seam has
> acceptance — **actually run once**. The current ~17500 lines of
> engine code are largely correct (171 tests green); it is a
> **draft**. Re-running convergence = **walk seam by seam, compare
> the upstream and downstream artefacts, squeeze the drift in the
> seam out and align it, build automatic gates where automatable**
> — not rewrite what is already correct.

### M1–M9 seam list (construction order for seam-by-seam cross-check)

| Seam | Upstream artefact (milestone) | Downstream consumer (milestone) | Drift risk | Gate |
|---|---|---|---|---|
| 1 | M0.5a Go ent schema | M4 `entities` (sea-orm-cli reverse-gen) | `11` ↔ Go ent (class C) | 🔲 build class-C gate |
| 2 | M3 `content` (Item/Part/PartId) | M5 `parser` building `Parsed` | The Part.id chain (now wired, 2026-05-17) | indirect (parser tests) |
| 3 | M4 `entities` | M5/M6 `mapper` producing RowSet | mapper column names (class A, 6 sites aligned) | ✅ §14.6 gate |
| 4 | M6 `sync` behaviour | M8 `cli` actual command behaviour | init / content tree (class B, fixed) | 🔲 build class-B gate |
| 5 | `00`–`12` settled docs | each crate's impl | impl ≠ settled (class B, widespread) | 🔲 build class-B gate |
| 6 | M7 `proposal` / `accept` | M8 CLI `proposal` group | ✅ clean — CLI `proposal_accept` is a thin wrapper over `ws.accept_proposal`; logic not duplicated | not needed (thin wrapper) |
| 7 | M8 `cli` / M7 `app` | M9 `mcp` / `site` | ✅ converged — discovered the "create proposal" logic lived only in mcp (`accept` in app but `create` in mcp — asymmetric), lifted to `Workspace::create_proposal`; mcp `propose` / `capture` are now thin wrappers (2026-05-17) | structural (create and accept both in app) |

> The convergence action for each seam: ① take the upstream's real
> artefact, check whether the downstream consumes it correctly;
> ② squeeze the drift out and align it (change the downstream, or
> change the upstream if it is wrong, with `11` / settled docs as
> the optimal baseline); ③ for seams that can be auto-validated,
> build a gate so drift is structurally impossible later.

---

## 14.6 The model gate already built — mapper ↔ entities schema gate

The class-A gate is built; it is the template for later class-B / class-C gates.

**Location**: `engine/crates/silan-viking-app/src/sync/sink.rs`, the Phase 0 of `write_batch`.

**Mechanism**:
- `silan-viking-entities` adds a public `table_columns(table) -> Option<Vec<String>>` — uses sea-orm's `Iterable` to reflect entity column names; the query entry point of the "schema source of truth".
- Before `sink` writes the DB, for every table: if it is an `entities` entity, the columns the mapper produced must ⊆ the entity columns; mismatch is collected into `SyncError::SchemaDrift`.
- One sync reports **every** drifted column in one pass (not "trip one, stop"); the mapper aligns in one round.
- Entity-backed tables are created using the **entity column set** (no longer the columns the mapper happened to give) — the on-disk schema stays consistent with the entities.

**Payoff**: `entities` goes from "dead code" to "the enforced schema
source of truth". If the mapper stays on the old understanding,
sync errors with `SchemaDrift` directly — class-A drift cannot stay
silent any more.

> Class-B gates (impl ↔ doc) and class-C gates (`11` ↔ Go ent) are
> built on the same template: find "the queryable entry point of
> the source of truth" + "validate on a mandatory path". Detailed
> design is given seam by seam when "re-running per-milestone
> convergence" is executed.

---

## 14.7 Discipline going forward — no more "one-shot full generation"

The one line from this chapter most worth remembering:

> **Implementation that spans multiple milestones and multiple
> modules must not be generated all at once from the docs.** Docs
> are "the plan" — they go stale, they exist in multiple copies,
> they sometimes contradict each other. Implementation must land
> per-milestone: the previous milestone delivers **live, executable
> facts** (code + tests); the next milestone stands on those facts,
> not on the docs' description. Every milestone seam has
> acceptance; where auto-validatable, build a gate.

Drift is not slips; it is the **inevitable product** of "letting N
modules each write to a single 'plan' in parallel". The convergence
mechanism (per-milestone + seam gates) is the apparatus that forces
"plans" to become "facts" and then lets "facts" constrain the next
step. `04` designed this apparatus; this round did not run it —
this chapter exists so that next time it gets run.
