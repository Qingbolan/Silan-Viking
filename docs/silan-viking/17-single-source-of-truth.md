# 17 · Single source of truth (SSOT)

> This chapter exists to cure **doc drift** at the root. silan-viking's
> design was written incrementally across 17 chapters; later chapters
> never went back to fix earlier ones, so the same definition
> (`idea.status` enum, MCP tool count, table list) appeared with
> different values in different chapters — the `claude -p` red-team
> audit on 2026-05-19 found four such mismatches in a single read.
>
> This chapter **pins the drift-prone global definitions in one place**.
> When other chapters touch these definitions they **cite this chapter
> instead of copying the value**. If this chapter conflicts with
> another, the column "authoritative source" in the table below wins;
> this chapter is an index + consistency checklist, not a new authority.

---

## 17.1 Index of drift-prone definitions

| Definition | Authoritative source | Current value (excerpt) | Citing chapters |
|---|---|---|---|
| `idea.status` enum | `10` §10.4 | `draft / hypothesis / experimenting / validating / published / concluded` (6 values) | `02` `silan idea status`, `08` §8.2 |
| `blog.status` enum | `10` §10.4 | `draft / published / archived` (3 values) | `02`, `11` |
| `project.status` enum | `10` §10.4 | `active / completed / paused / cancelled / archived` (lowercase 5 values) | `02`, `11` |
| `blog.content_type` | `10` §10.4 | `article / podcast / vlog / tutorial` (4 values; episode is its own type) | `01`, `11` |
| `visibility` (every type) | `10` §10.3 | `private / unlisted / public`; only `public` is projected to the website | `02`, `08` §8.2 |
| The 6 content types — closed set | `10` §10.4 | `idea / blog / project / episode / resume / update` | global; `01` §1.9 compile-time closed set |
| Part `shape` closed set | `01` §1.3.1 | `prose / entry_list / key_value_list` (3 values, compile-time closed set) | `01`, `10` §10.4.5 |
| MCP tool closed set | `03` §3.2 | M9 is **19**; E1 reaches 22; E2 reaches 23 (see §17.2) | `03`, `04` E-stage |
| `silan` CLI command groups | `02` design notes | M8 ships **8 tool groups** (`content`/`index`/`relation`/`site`/`stats`/`proposal`/`mcp`/`skill`) + 6 type groups; E2 adds a `schema` group | `02`, `04`, `OVERVIEW`, `README` |
| ent table list | `11` §11.1 | see `11`; includes `stats_cache_*` (`11` §11.3.1) | `11`, `08` §8.3 |
| `referrer_kind` / `source` enum | `11` §11.3 | `search / social / ai_chat / direct / internal` (+ `unknown`) | `03`, `05` |

> **Discipline for editing these definitions**: edit only the
> authoritative chapter, and after editing **you must** rescan every
> chapter in the "Citing chapters" column and update them in step.
> That sweep is the diagnostic action
> `14-drift-diagnosis-and-milestone-convergence.md` describes — this
> chapter gives it a machine-checkable list.

---

## 17.2 MCP tool closed set — grows per milestone

This is what `UnknownTool` errors are judged against, and also the
full set advertised by `tools/list`. **It grows through the E
stages**:

| Stage | Tools | Increment |
|---|---|---|
| M9 | **19** | tier 1 read-only 11 (`recall` `list` `list_tags` `browse` `read` `context_brief` `lint` `stats` `visitors` `crawler_breakdown` `source_breakdown`) + tier 2 `capture` + tier 2.5 `ctx_read` `ctx_write` `ctx_brief` `reflect` + tier 3 `propose` `summarize_updates` + tier 4 `deploy` |
| E1 | **22** | +`suggest_relations` `suggest_parts` `suggest_lifecycle` (`15` §15.2; JSON schema §15.5.1) |
| E2 | **23** | +`propose_schema` (`15` §15.2 L-structure; DDL algorithm §15.2.1; JSON schema §15.5.1) |

> `list_tags` was added in the 2026-05-22 audit follow-up: tag enumeration
> (USAGE §6 / `02`) was an owner / agent question with no MCP tool answer
> before this — both `list` and `recall` could filter *by* a tag, but
> neither could enumerate "what tags exist". `list_tags` returns
> `[{tag, count}]` rows so a tag cloud can be rendered without scanning
> every Item.

> `context_brief` (tier 1, reads the current published-content state)
> and `ctx_brief` (tier 2.5, reads agent memory) are two different
> tools — do not merge. `deploy` is not advertised by default;
> `--enable-deploy` is required to enter the surfaced closed set.

---

## 17.3 Deployment-topology assumption — single device (red-team gap 1)

> The red-team audit flagged this: the `agent-write.lock` in `03` §3.1
> / `08` §8.5 is a **local file lock**, valid only on one machine. If
> the doc claims "single-tenant, multi-device", the lock and the
> `expected_head` mechanism cannot guarantee cross-device atomicity.
> This section pins the assumption and kills the false solution.

**This release's assumption: silan-viking runs on a single host.**

- Writes to the `content/` git repo (`ctx_write`, `reflect`,
  `proposal accept`) are serialised by the file lock at
  `content/.git/silan/locks/agent-write.lock` — **this lock is valid
  only within one machine; the design explicitly does not span
  devices**.
- A multi-device scenario (the owner runs silan-viking on two
  machines) is **not consistency-guaranteed by the engine**; it
  relies on manual `git push` / `git pull` of the `content/` repo,
  same as any other git collaboration. Simultaneous writes across
  devices may produce git conflicts — the owner resolves them by
  hand; the engine doesn't intervene.
- `expected_head` (in the `03` §3.1 accept flow) is an **intra-machine**
  optimistic lock for serialised writes; it prevents `ctx_write` and
  `accept` from interleaving on the same machine, **not across
  devices**.

**Extension points reserved** (the object model leaves room for
future multi-device — not implemented):

- The write lock is abstracted as the `WriteLock` trait. The current
  sole implementation is `FileWriteLock` (the local file lock).
  Future multi-device work can add a `RemoteWriteLock` (lease /
  lock-branch on a git remote) without touching `Engine` /
  `Namespace` callers.
- `accept`'s `expected_head` already has the "compare HEAD before
  commit" semantics — a cross-device version only needs to compare
  the remote tracking ref instead of the local HEAD; the interface
  doesn't change.

> One sentence: **this release is single-device; multi-device sync is
> future work; the lock abstraction has the seams already.** Wherever
> other chapters say "multi-device" or "multi-tenant", read it as
> "via manual git sync, not engine-guaranteed", not "the engine has
> solved this".

---

## 17.4 Consistency self-check (run after every global-definition edit)

After editing any definition in §17.1, work through this list:

1. Did you actually change the value in the authoritative chapter?
2. Did the "current value" column of §17.1 follow?
3. Each chapter listed in "Citing chapters" — searched, updated?
4. If you touched MCP tool count — did `03` §3.2 closed-set
   description, §17.2, and the `04` milestone acceptance criterion
   all move in step?
5. If you touched an enum — did `10` (authoritative), `11` (ent
   `field.Enum` values), and `02` (CLI prompt text) all move in step?

> This checklist is the root-cause counter to the four red-team
> mismatches — it turns the rescan from "hopefully someone remembers"
> into "a table you must run".
