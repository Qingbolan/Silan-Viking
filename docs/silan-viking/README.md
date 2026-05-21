# silan-viking — design documents

> silan's one-person context system.
>
> This directory is the authoritative design for silan-viking. One chapter
> per file. Older single-file designs and early sketches live in `archive/`.

## One-sentence terminal state

> silan-viking is silan's one-person context system: it continually captures
> and structures his ideas (spark → article → project), lets any collaborating
> agent understand him; the personal website is a selective outward projection
> of the mature content inside that context.

## Chapter index

| File | Contents | Status |
|---|---|---|
| [`OVERVIEW.md`](./OVERVIEW.md) | **Main entry** — one-glance picture + every question the owner cares about, answered in order | settled |
| [`GOAL.md`](./GOAL.md) | **Single-page nail** of the current terminal state — definition, run tape, disk layout, object model, service surface, data flow, 16-row acceptance matrix, executable checklist, 10 invariants | settled |
| [`00-end-state-and-requirements.md`](./00-end-state-and-requirements.md) | Terminal state, 16-row requirement baseline, abstractions inherited from Python, **whole-disk picture** | settled |
| [`01-oop-structure.md`](./01-oop-structure.md) | Four-layer architecture, domain objects, persistence mapping, code layout, schema revisions | settled (reviewed multiple rounds) |
| [`02-cli-service.md`](./02-cli-service.md) | `silan` command-line surface (noun-first; 6 type groups + 8 tool groups) | settled |
| [`03-mcp-service.md`](./03-mcp-service.md) | MCP tool surface (how a collaborating agent connects; four tiers) | settled |
| [`04-milestones.md`](./04-milestones.md) | Implementation route starting at M0 | settled (M0–M9 main table; M4/M8 pre-condition contract exits) |
| [`05-testing.md`](./05-testing.md) | Four-layer test structure, scenario tests (back-cast from requirements), contract tests | settled |
| [`06-end-to-end.md`](./06-end-to-end.md) | The full backbone from install to deploy — wires up parts, fills gaps | settled |
| [`07-playbooks.md`](./07-playbooks.md) | 10 user operation playbooks (configure / open an idea / write a blog / agent edits resume / evolve …) | settled |
| [`08-engineering-review.md`](./08-engineering-review.md) | Engineering-review patches: unfinished issues, M0/M0.5 hard gates, SCHEMA minimum contract, deploy/stats/proposal hard constraints | settled |
| [`09-observability-and-performance.md`](./09-observability-and-performance.md) | Layered error handling, tracing span contract, scale assumptions, performance budget and benchmarks | settled |
| [`10-m0-schema-finalisation.md`](./10-m0-schema-finalisation.md) | **M0 artefact spec** — `content/SCHEMA.md`, the 6 content types field-by-field, enum decisions, error tiers | settled |
| [`11-m0_5-ent-schema-pr.md`](./11-m0_5-ent-schema-pr.md) | **M0.5 artefact spec** — Go ent revision PR (new tables / changed tables / dropped tables / allowlist / migration steps) | settled |
| [`12-legacy-content-rearrange.md`](./12-legacy-content-rearrange.md) | One-shot action between M0 and M0.5 — old layout → new layout rearrange rules | settled |
| [`13-skill-distribution.md`](./13-skill-distribution.md) | Let a collaborating agent "install once, understand silan" — `silan skill` command group, skill bundle, auto-trigger manual | settled |
| [`14-drift-diagnosis-and-milestone-convergence.md`](./14-drift-diagnosis-and-milestone-convergence.md) | Doc-drift diagnosis flow and per-milestone convergence discipline | settled |
| [`15-agent-self-evolution.md`](./15-agent-self-evolution.md) | Three-layer design + gates for agents that evolve a project on their own; the E1–E3 stages (wired into `04`) | settled |
| [`16-terminal-artifact-delivery-deploy.md`](./16-terminal-artifact-delivery-deploy.md) | Delivery and deployment of the terminal-state artefact | settled |
| [`17-single-source-of-truth.md`](./17-single-source-of-truth.md) | **SSOT** — drift-prone global definitions pinned in one place + the consistency self-check checklist (cures doc drift) | settled |

## Reading order

New readers: **start with `OVERVIEW.md`** → `00` → `06` (walk the main backbone) → `07` (concrete operations) → `01` → `02`/`03` → `05` → `08` → `09` → `04`.
Focused reads: backbone in `06`; CLI in `02`; agent integration in `03`; database and objects in `01`; test coverage in `05`.
**Ready to start coding**: after `04`, the coding-grade specs for M0/M0.5 live in `10` (SCHEMA finalisation) → `12` (legacy content rearrange) → `11` (ent schema PR) — those three are the M0/M0.5 implementation basis.

> **Implementation boundary** (full explanation in `04`): the current doc set is
> enough to start **M0 → M6** (structural layer + Rust core); **M7–M9**
> (CLI/MCP/site/deploy) have partial implementation-grade contracts (MCP JSON
> schema, draft Go-API read matrix, promote transaction details), but M4/M8
> must re-verify against the real `backend.api`/ent/SCHEMA. Don't read
> "the design docs are complete" as "the whole system can be written in one go".

## Design discipline

- Every object / command / interface must point back to a numbered `#` requirement in `00-end-state-and-requirements.md`. If it can't, delete it.
- The source of truth for the table schema is the Go backend ent schema (`backend/internal/ent/schema/`), not this document.
- This directory holds design only, not implementation code.

## archive/

- `RUST-ENGINE-DESIGN.md` — early single-file design, framed around "the website"; biased. **Obsolete; do not reference.**
- `ARCHITECTURE.md` — earlier markdown → SQLite → Go pipeline design. Superseded by this directory.
- `extraction-report.md` — M0 resume field fact-extraction appendix, referenced by `10` §10.4.5.
