# 08 · Engineering review — unfinished items and design gates that must be filled

> This chapter is an engineering-review patch on the previous doc round. Conclusion up front:
> The current `docs/silan-viking/` already covers terminal state, objects, CLI, MCP, and testing densely,
> but there is no Rust `engine/` in the repo yet, and Go ent schema has not been revised per the docs.
> So the next step is not "start M1 and write the parser" directly; the design gates below must be cleared first.

## 8.1 Hard facts that have not landed yet

| Doc promise | Repo reality | Engineering judgement |
|---|---|---|
| The Rust `engine/` workspace + 7 member crates | No `engine/` at the repo root | Before M1, "design" — not "implementation" |
| The latest content layout `content/resources/.../parts/...` | The legacy Python is still on `content/{type}/{item}/{file}` semantics | No compatibility; M0 writes only the latest SCHEMA; legacy content is rearranged offline |
| `content_relation` / `content_interaction` / `annotation` / `item_part` | `backend/internal/ent/schema/` is still the old tables; `project_relationships`, `project_views`, `project_likes`, `comment_likes` remain | M0.5 must edit Go ent first, otherwise Rust entities have no source of truth |
| Runtime data lives only on the server | The original `06` deploy flow had "local db packed into the image / or volume TBD" | If the live `portfolio.db` is overwritten directly, comments / pings are lost; must change to "replace derived tables only" |
| `silan stats` queries visitor IPs / fingerprints remotely | Commands are listed but remote auth, masking, and access boundaries aren't written | `#15` is high-sensitivity data; must have owner-only auth and default masking |
| MCP handshake pushes SCHEMA | Implementation shape is filled in (`03` §3.2) | M8 must rescan instructions / resources / tool schema against the final SCHEMA; do not start a parallel implicit contract in code |
| `proposal accept` atomicity | The flow is correct, but locking and expected-HEAD details are missing | On the same machine, concurrent processes / interleaved writes need a lock + `update-ref <new> <old>`; cross-device is not guaranteed (single-device assumption, `17` §17.3) |

## 8.2 The minimum SCHEMA contract for M0

The `content/SCHEMA.md` in M0 cannot just be field descriptions. It
must be enough that the CLI, MCP, parser, and test fixtures can all
generate and validate content against the same contract. Minimum
fields:

```yaml
version: 1
layout: latest-only

namespaces:
  resources:
    root: content/resources
    publishable: true
    direct_agent_write: false
  agent:
    root: content/agent
    publishable: false
    direct_agent_write: true

types:
  idea:
    collection: ideas
    item_id: { source: frontmatter.id, fallback: slug, stable: true }
    slug: { pattern: "^[a-z0-9][a-z0-9-]*$" }
    parts:
      - { role: overview, required: true, order: 10 }
      - { role: progress, required: false, order: 20 }
      - { role: reference, required: false, order: 30 }
      - { role: result, required: false, order: 40 }
    # idea.status — the source of truth is 10-m0-schema-finalisation.md §10.4 (this skeleton only cites)
    statuses: [draft, hypothesis, experimenting, validating, published, concluded]
    publish_statuses: [published]
    frontmatter_required: [slug, title, kind, status]

relations:
  types: [evolved_into, evolved_from, documents, references, supersedes, part_of]
  canonical:
    evolved_from: evolved_into
    evolved_into: evolved_into
    documents: documents
    references: references
    supersedes: supersedes
    part_of: part_of
```

**Hard rules**:

- The runtime parser only accepts `content/resources/{type}/{item}/parts/<role>/meta.toml` + `<lang>.<ext>` (`prose` uses `.md`, structured Parts use `.toml`). Legacy `README.md`, `NOTES.md`, `resume.md` are not runtime inputs.
- `PartID` must be present in `meta.toml`; when missing, `silan init` / `add-part` / the offline rearrange script fills it; `index sync` does not silently generate and write it back, or sync turns from a read-only operation into an implicit mutation of the source of truth.
- **When `index sync` / `index rebuild` encounters a `meta.toml` missing `PartID`: error and exit; do not silently generate**. The error names the Part path with the missing ID and prompts "run `silan index repair` to fill it in". `silan index repair` is the **only** command allowed to write `PartID` back into `meta.toml` (`02` §`silan index`) — it is an explicit, human-knowing source-of-truth write. Rationale: `PartID` is the stable anchor of the `item_part` table's foreign key; if `sync` auto-generates a new ID, old table rows become orphans — turning a read-only sync into a destructive operation.
  This makes `rebuild` truly "fully rebuild the derived artefacts" rather than "rebuild the source of truth" — `rebuild` only rebuilds `.silan-cache` and derived tables; `meta.toml` is its **read-only input**.
- `.silan-cache` is engine-written; humans do not hand-write it. SCHEMA / frontmatter / meta.toml are human-and-agent editable contracts; `.silan-cache` is a derived registry. When `.silan-cache` is lost, `rebuild` reconstructs it from `meta.toml` in full (since `meta.toml` is the truth → the rebuild has no side effects); when `meta.toml` loses its PartID, the previous rule errors out — the two cases are handled differently because the former is a derived artefact and the latter is the source of truth.
- `status` and `visibility` must be separate: `status` is the content lifecycle; only `visibility=public` is projected to the website. `blog publish` can set `status=published` and `visibility=public` at once, but in the schema they cannot be merged into one field.

## 8.3 Deploy must not overwrite runtime data

`01` already pinned that runtime data (comment / content_interaction
/ the annotation reader part) lives only on the production server.
So deploy cannot replace the live `portfolio.db` on the server with
the locally generated `_deploy/portfolio.db`.

**Final policy**:

1. Local `silan index sync` produces a **derived-db snapshot**:
   main content tables, translation, `item_part`,
   `content_relation`, `sync_meta`.
2. `silan site deploy --confirm` uploads the derived-db snapshot
   and the frontend artefact.
3. The server runs a promote job: inside the same persistent
   `portfolio.db`, in a transaction, delete and rebuild the
   **derived tables**; runtime tables (`comments`,
   `content_interaction`, annotation reader rows, `user_identities`)
   are untouched.
4. After promote succeeds, update `sync_meta.content_commit`; on
   failure, the live DB stays in its old state.

This is simpler than a "dual-db" design: the Go API still reads one
SQLite file; but deploy's write boundary is the table level, not
the file level. When M0.5 edits Go ent, "derived tables / runtime
tables" must be listed as a whitelist.

> **promote atomicity and availability during promote** are not
> just text promises — the implementation-grade contract is in
> `11-m0_5-ent-schema-pr.md` §11.11 "promote job
> implementation-grade contract": a single `BEGIN IMMEDIATE`
> transaction wraps every DELETE + INSERT; failure on any one
> table rolls back the lot (no half-old-half-new state); the Go
> API read side uses WAL and is not blocked; if `busy_timeout`
> expires, the promote fails and the live state is preserved.
> M9's `site deploy` acceptance criterion is "promote satisfies
> §11.11's contract" — no longer an empty criterion.

## 8.4 Security contract for the stats remote query

`#15` queries IPs, browser fingerprints, AI crawlers, and source
kinds. This is owner-only data; it cannot go through a public API.

Minimum design:

- `silan stats *` defaults to an SSH tunnel or an HTTPS endpoint with an owner admin token.
- The admin token lives in `~/.config/silan/config.toml` or the system keychain — not in `silan-viking.toml`, not in the content git repo.
- Default output is masked: IPs show `/24` or a hash prefix; fingerprints show only the first 8 chars.
- `--raw` requires interactive confirmation by the local-machine owner before printing the full IP / fingerprint; the MCP side does not expose a `--raw` equivalent.
- On write, the Go API classifies `visitor_kind` / `crawler_name` / `referrer_kind`; Rust stats only reads — it does not re-classify.

## 8.5 proposal concurrency and conflict patches

The worktree + validation ② direction in `03` is correct, but the implementation is missing two hard constraints:

- `accept` must hold a process lock: `content/.git/silan/locks/proposal-accept.lock`. Only one `accept` / `rebase` can be writing the main branch in the same content repo at a time.
- `proposal-accept.lock` is the proposal-level mutex; before advancing the main branch, you must also acquire `content/.git/silan/locks/agent-write.lock` — the same HEAD-write lock shared with `ctx_write` / `reflect`. Otherwise agent/ direct commits can race with accept's `update-ref`.
- Advancing the main branch must use the expected old OID: `git update-ref refs/heads/main <verified_merge_oid> <expected_main_oid>`. If the main branch was advanced **by another write on the same machine** (`ctx_write` / `reflect` / another `accept`) during validation, the command fails and the main branch is untouched. This is the intra-machine optimistic lock; silan-viking is a **single-device assumption**, and cross-device consistency relies on manual `git push/pull` of the `content/` repo — not guaranteed by this mechanism (`17` §17.3).

`propose` must also record `touched parts` in the metadata:

```toml
id = "01H..."
base = "<main_oid>"
kind = "modify"
touched = ["silan://resources/ideas/rust-context-engine/progress"]
validation = "passed"
```

If `silan proposal list` finds multiple pending proposals touching
the same Part, it must flag conflict risk. This is not a lock, but
it prevents the owner from reviewing the two proposals as if they
were independent.

## 8.6 The implementation shape of the MCP handshake

"Handshake pushes SCHEMA" needs to land in a shape MCP can actually implement:

- The server `initialize` instructions contain: project name, SCHEMA version, the latest content commit, and key resource URIs.
- Expose read-only resources:
  - `silan://schema`
  - `silan://overview`
  - `silan://agent/brief`
- Expose tools:
  - `context_brief()` returns the condensed version.
  - `read(uri)` reads a resource.
  - `ctx_write(uri, content)` only on `silan://agent/`.

That way, even if the host doesn't surface resources to the agent,
the agent learns from instructions what to read first — it doesn't
have to "spontaneously go read the docs".

## 8.7 Definition of done for M0 / M0.5

M0 is done iff:

- `content/SCHEMA.md` covers the 6 types (blog / projects / ideas / episode / resume / update), every Part, frontmatter, relation, status, visibility, manifest ownership.
- `engine/tests/fixtures/content/` is entirely the latest layout — no legacy-path samples.
- The offline rearrange script is used only to move legacy samples one-shot to the latest layout; the runtime parser has no compat branch.

M0.5 is done iff:

- Go ent regenerates successfully after the new / dropped / changed tables.
- Go API reads of the derived tables pass; writes to runtime tables pass.
- The deploy promote job demonstrates that it replaces only derived tables and never deletes existing comment / content_interaction.
- Rust `silan-viking-entities` is reverse-generated from the Go ent source of truth — no hand-written drifted entities.

These two gates must clear before M1 parser. Otherwise the Rust code reworks itself around a still-drifting schema.

### 8.7.1 Fixture sync responsibility on SCHEMA edits (from E2 onward; red-team audit addition)

"The runtime parser has no compat branch" (above) means
`engine/tests/fixtures/content/` **always has only one set, matching
the current SCHEMA**. So when E2's `propose_schema` edits
`SCHEMA.md`, who upgrades the fixtures and when — pinned as follows:

- **Fixture upgrade is part of the `schema-proposal`, not an after-the-fact patch**. When a `schema-proposal` proposal branch (`15` §15.2) edits `SCHEMA.md`, **the same proposal branch must also edit `engine/tests/fixtures/content/`** so the fixture is self-consistent with the new SCHEMA. Both land in the same branch, merged in the same `accept` — there is no "SCHEMA changed but the fixture is stale" intermediate state.
- **`silan schema check`'s engine-side validation (§15.2.1) runs against the upgraded fixture**. That is: the check validates "new SCHEMA + new fixture" together; if the fixture isn't synced, engine-side parsing fails → `schema check` fails → the proposal cannot `accept`. This turns "fixture didn't keep up" from an ownerless thing into something the gate auto-catches.
- **Who edits the fixture**: the agent that filed the `propose_schema`. It edits `SCHEMA.md` and updates the fixture sample to the new structure at the same time — this is part of the agent's proposal content, and the owner reviews the fixture diff alongside `accept`.
- **For added optional Parts / fields**: the fixture must add at least one sample that uses the new structure (per `05` §5.2 "one sample per structure"). Deletions are forbidden by the §15.2 safety table, so fixture removal is not part of this rule.

> One sentence: **SCHEMA and the fixture are tied together in the
> same proposal, live or die together**; `schema check` is the
> machine gate over their consistency. M0's invariant "the fixture
> is entirely in the latest layout" is preserved after E2 by this
> rule.

## 8.8 Camera-ready rehearsal — live CLI / MCP / skill acceptance (2026-05-19)

One round of camera-ready rehearsal: `engine/install-dev.sh` route
rebuilt the engine, `skill emit` installed the skill, both frontend
and backend up, then playbook-by-playbook (`07` A–K) live tests.
**Record three classes: verified working, real gaps, and
methodology failures.**

#### Methodology failure — the acceptance script self-destructed three times; that is itself a camera-ready gap

The rehearsal **mis-reported gaps three times**, none of which were
the engine's fault — the acceptance script wasn't trustworthy:

- Mis-report 1: used a stale, broken `silan-viking` binary (SIGKILL across the board) to test `project list`, got `unknown command`, and concluded "every `list` verb is missing". **The reality was a broken old binary**; after a rebuild, every `list` worked.
- Mis-report 2: shell-style `for v in "show foo"` — the quoting passed `show foo` as a single argument; the engine received argv `["blog","show foo"]` and reported `unknown subcommand`.
- Mis-report 3: `for c in "blog --help"` — same bug again; `"blog --help"` passed as one token; the engine reported `unknown command`, leading to the false claim "all 20 commands have broken `--help`". **Reality: the same tokenisation bug**; once arguments were passed as an array, all 20 `--help` invocations passed.

> Three failures from the same source (uncontrolled variables /
> shell tokenisation) say one thing: **this rehearsal had no
> trustworthy acceptance script** — every conclusion only avoided
> entering the docs because a human re-verified. In a rehearsal
> whose output becomes an acceptance basis, **the trustworthiness
> of the acceptance script = the trustworthiness of the
> conclusions**. This itself enters the backlog as §8.8.2 A2 —
> the engine needs a contract-test layer over the CLI/MCP
> surface so future rehearsals don't depend on ad-hoc fragile
> shell scripts. Lesson pinned: pass matrix tests as arrays
> token by token; land MCP output to disk and parse with `jq`;
> never use a string with whitespace or a brittle inline script.

### 8.8.1 Verified working (new binary, correct tokenisation)

| Surface | Command / tool | Result |
|---|---|---|
| CLI list | `idea/blog/project/update list` | ✅ all four pass |
| CLI show | `<type> show <slug>` | ✅; missing slug returns `not found` with `exit=1` |
| CLI list | `content ls`, `episode series list`, `episode list <series>` | ✅ |
| CLI resume | `resume show`, `resume list` (lists sections research / experience / publications etc.) | ✅ |
| CLI proposal | `proposal list` | ✅ |
| CLI relation | `relation graph` (no args), `relation show <uri>` | ✅ (`graph` takes no URI) |
| Engine | `doctor`, `guide`, `index sync`, `skill emit/status` | ✅; `skill status=up_to_date` |
| MCP | `mcp status` → `tools_advertised=17`, `mcp_available=true` | ✅ |
| MCP | `tools/list` via stdio JSON-RPC → all 17 tools enumerated | ✅ |
| MCP | `list` (by type / full), `read` (Item summary / Part full), `context_brief` | ✅ returns real data |

> MCP `read` on an Item URI returns `body:null` + title / languages;
> on a Part URI (`…/<slug>/<role>`) it returns the full body —
> **this is by design** (the tool description says so), not a gap.

### 8.8.2 Real gaps — architect-graded (凉冰)

> Engineers grade by "is the command broken"; the architect grades
> by "how far from the terminal state". The table below is the
> latter. The most valuable output of this round is not "frontend
> and backend are wired", it is **confirming that M9 is not
> actually done**.

#### A1 — `site preview` doesn't do what its name says; the root cause is one missing line in M9 acceptance (formerly G1+G4)

`["site","build"] | ["site","preview"]` both point to `site_build`,
which produces only the three SEO artefacts (sitemap / robots /
jsonld); it does not start a server and does not render HTML.

**This is not "code didn't follow the spec"; the spec itself is
missing a line.** `04` §M9's exit reads "the MCP + end-to-end +
website scenarios in `05` all green; deploy promote replaces only
derived tables" — **nothing requires `site preview` to render a
viewable site in the browser**. Under M9's current acceptance,
`SiteProjector` producing only SEO artefacts is "passing". And
`guide` / `--help` text "preview the site locally" promised
something the M9 acceptance never required — the text and the
acceptance criterion fight each other; the code stands with the
acceptance criterion.

Terminal-state judgement: the engine embeds frontend / backend /
deploy tarballs; that fact itself is a spec declaration — **the
engine promises to be able to run the site itself; on
camera-ready day the user only has a binary from `curl|sh`, and
`site preview` is his single entry point to see his own site**.
That entry point is empty today.

**Action (outside this round's "compile + install" responsibility; must go through a proper PR):**
1. `04-milestones.md` §M9 acceptance gets one more line: `site preview` unpacks the embedded frontend / backend tarballs, starts a local instance against `_deploy/api/portfolio.db`, and renders the site in the browser; companion commands `site stop` retire the instance, `site status` reports instance liveness. The fix path can reuse the tarball-unpacking logic in `site_deploy`, as a local version that does not push to a remote.
2. After the new acceptance is added, M9 is **re-accepted**. Until then, M9 is not done.

> Former G4 (no process management / no `site stop`, repeated starts accumulate port-zombies) is the same source as A1: the engine has no notion of a "local instance". Once `site preview` shifts from "build" to "start an instance", the preview / status / stop triad must land together — so it's merged into A1.

#### A2 — CLI command surface lacks contract tests (formerly G3)

`--version` missing is fixed (`main.rs` adds `--version` / `-V` /
`version` branches, intercepted before parse). But **the real gap
is not the ten missing lines; it is that
`engine/crates/silan-viking-cli/tests/` has no layer covering the
command surface as a contract test**. `silan-viking` is a
self-evolving engine (chapter `15`); the agent will keep editing
the CLI surface — without surface contract tests, regressions like
the missing `--version` can never be caught by CI; what we hit
today is just one of them.

**Action:** backlog gains one item — contract tests over the CLI
command/verb surface (for every public command, for every verb
promised by `--help`, at least one "is recognised, does not return
unknown" assertion).

#### A3 — `site status` error text is mis-placed (formerly G2; stays P3)

`silan-viking site status` reports `silan site deploy needs a [deploy]
section` — the text was copied from deploy, and `status` should not
hard-depend on the `[deploy]` section. Small but in the same
"command surface not covered by tests" class as A2; fix together.

#### A4 — `init`'s seed content is all draft/private; a new user's first screen is an empty site (decided)

The backend's `/api/v1/blog/posts`, `/api/v1/projects` correctly
filter drafts (publish is a person-only verb, `02` design notes) —
the behaviour is correct. But the sample content `init` lays is
all `draft/private`, so on camera-ready day silan installs, inits,
syncs, opens the site — **he sees an empty shell**. Correct
behaviour meeting wrong initial state.

**Architect ruling (凉冰, 2026-05-19): `init` does not preload
published content.** silan-viking's soul is "silan voices a thought
→ content grows out"; `init` should be a blank sheet — preloading
fake samples would betray that voice, and would put content the new
user didn't write into his site from day one. **Fill the void with
guidance, not fake data**: the real fix is for `guide` to recognise
the "post-init, content not published" state and point next-step
clearly at `blog publish <slug>` / `site publish`, rather than
gesturing at "preview/deploy" generically. This item folds into the
same PR as A1 (both are guide / preview onboarding wrap-up).

#### A5 — The CLI adapter and the MCP adapter give non-equivalent results for the same engine capability (new this round)

`08`'s previous acceptance asked only "does CLI run / does MCP
run"; **it never asked "do the two adapters of the same capability
return equivalent results"**. After per-playbook live tests this
is the broadest miss; examples:

| Capability | CLI exit | MCP exit | Problem |
|---|---|---|---|
| `lint` health check | `index lint` → `ok documents=12`, **0 issue** | `lint` → **15 `info` issues** (missing translations) | CLI swallows every issue into one `ok` |
| `lint` health check | `doctor` → `ok ... items=12`, **0 issue** | Same 15 issues | `doctor` also fails to report per-issue |
| `stats` empty cache | `silan stats sync` | `silan stats sync <uri>` | Error text drifts; the MCP message with URI is more usable |

**Why this matters:** `07` playbook J explicitly says the agent's
`lint` call should return **a health report with per-issue rows**.
The MCP side does that; the CLI's `index lint` / `doctor` only
report `ok N`, **swallowing all 15 "missing translation" issues**.
Someone using only the CLI will never know their content has 15
missing translations — and a camera-ready user uses both the CLI
and MCP (via skill); the two sides contradict, and he can't tell
which to trust. This violates the implicit contract from `02` /
`03`: the CLI and MCP are two adapters of the same engine —
**identical capability names must return equivalent conclusions**;
differences belong only to presentation (human-readable vs JSON),
not content.

**Action (proper PR, outside this round's responsibility):**
1. `index lint` / `doctor` must output the same issue list as MCP `lint` (in human-readable form), not silently swallow issues into `ok`.
2. CLI and MCP error text are unified to the URI-bearing variant.
3. The root cure is the A2 contract tests — the test matrix must include "the CLI exit and the MCP exit for the same input return equivalent conclusions", or this kind of drift will keep happening.

> A5 is what this round's "per-playbook" approach mined that
> "per-command" never would. Lesson: the unit of acceptance is the
> **playbook** (one user path end-to-end), not the isolated command
> — isolated commands each saying `ok` does not mean the strung-up
> path makes sense to the user.
