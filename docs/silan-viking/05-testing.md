# 05 · Test scenarios

> Test coverage is **back-cast from the `#1–#16` requirement baseline
> and the object model, point by point** — not "what I feel like
> testing", but "for each requirement, for each key object, which
> scenario must be green".
> The test code site is `engine/tests/` (see `01-oop-structure.md`
> §1.9).

## 5.1 Four-layer test structure

| Layer | Tool | What it tests | Site |
|---|---|---|---|
| L1 unit | `#[cfg(test)]` | Single-object contracts (`SilanUri::parse`, `Part` role inference, …) | inside each crate |
| L2 snapshot | `insta` | Stability of parser outputs and `SeoEmitter` outputs | `silan-viking-app` |
| L3 e2e | `assert_cmd` | The `silan` command end-to-end against a real fixture repo | `engine/tests/` |
| L4 contract | custom | The db produced by Rust `silan index sync` is aligned line-by-line with the Go ent schema and the frontend's read contract | `engine/tests/` |

Async paths (the MCP server) are wrapped with
`tokio::time::timeout`; the failure mode is "test fails", not "CI
hangs".

## 5.2 Test fixture — a tiny content/ repo

`engine/tests/fixtures/content/` is a deliberately constructed
minimal content repo — **one sample of every structure** — so
scenario tests have real input:

```
fixtures/content/
├── resources/
│   ├── blog/
│   │   ├── hello-world/  parts/body/{meta.toml, en.md, zh.md}   # ordinary blog, bilingual
│   │   └── my-vlog/      parts/body/{meta.toml, en.md}          # content_type=vlog, single-language
│   ├── ideas/
│   │   └── multi-tab-idea/  parts/
│   │         ├── overview/{meta.toml, en.md}
│   │         ├── progress/{meta.toml, en.md, zh.md}   # ★ a Part with multilingual variants
│   │         ├── reference/{meta.toml, en.md}
│   │         └── result/{meta.toml, en.md}
│   ├── projects/
│   │   └── sample-project/  parts/{overview, progress}/  # one meta.toml + en.md per Part
│   ├── episode/
│   │   └── tutorial-series/                            # episode is an independent content type (ruling 2)
│   │         ├── episode-01-intro/   parts/body/{meta.toml, en.md, zh.md}
│   │         └── episode-02-deep/    parts/body/{meta.toml, en.md}
│   ├── update/
│   │   └── changelog-2026-q2/  parts/body/{meta.toml, en.md}   # update is the 6th content type (ruling 3)
│   └── resume/  parts/                                 # resume is multi-Part (ruling 1), not a single body Part
│         ├── summary/      en.md,   zh.md              # prose Part → .md
│         ├── education/    en.toml, zh.toml            # entry_list Part → .toml (array-of-tables)
│         ├── experience/   en.toml, zh.toml            # entry_list Part → .toml
│         ├── publications/ en.toml, zh.toml            # entry_list Part → .toml
│         ├── awards/       en.toml, zh.toml            # entry_list Part → .toml
│         ├── research/     en.toml, zh.toml            # entry_list Part → .toml
│         └── skills/       en.toml, zh.toml            # key_value_list Part → .toml
└── agent/
    ├── project/understanding.md      # agent's understanding of the project (the source for ctx_brief)
    ├── notes/sample-note.md
    ├── owner/silan-profile.md         # agent's understanding of the owner (the write target of reflect)
    └── sessions/sample.md

# resume's Parts come in two source-file kinds, by shape (ruling 1,
# extension rules in 10 §10.4.5):
#   summary is prose shape → parts/summary/<lang>.md (markdown);
#   education / experience / publications / awards / research are
#     entry_list → TOML array-of-tables, each entry has
#     entry_id = e_<ulid>;
#   skills is key_value_list → TOML top-level category key → list<string>;
#   both land into part_entry + part_entry_translation.
# Boundary fixtures (to test validate's tiering):
#   resume-no-name/    missing full_name      → expects error
#   resume-no-email/   missing email          → expects warning (not error)
#   resume-bad-dates/  an education entry has start > end → expects error
# Frontmatter is seeded with: a deliberate idea→blog→project evolution
# edge, and one bidirectionally-declared edge (to test canonicalisation).
```

## 5.3 Scenario tests — back-cast per requirement

Each requirement has at least one scenario. The `★`-marked ones are
those you recently flagged as must-nail-down.

### Content structure and parsing (#2)

| Scenario | What it tests | Expected |
|---|---|---|
| ★ **idea multi-tab parse** | parse `multi-tab-idea/`; the Part model (§1.3) | 4 `Part`s parse out (overview / progress / reference / result); the `progress` Part has two `File`s (en/zh) — **Part dimension and Lang dimension do not mix** |
| ★ **Configurable file tree** | Temporarily add a new `Part` (discussion) to SCHEMA's idea definition + add `Discussion.md` in the fixture | The parser **parses the 5th Part with no code change** — proves the §1.3.1 config-driven contract |
| ★ **Missing non-required Part** | `sample-project` has only README + Progress, no Reference | Parse succeeds; the missing Part is marked absent; no error (`required: false`) |
| Missing required Part | A fixture idea without a README | Parse errors, non-zero exit, names the missing `required` Part |
| Language variant = a representation inside a Part | `parts/progress/` has `en.md` + `zh.md` | Both belong to the `progress` Part (same `part_id` in `meta.toml`); en and zh are two representations |
| Collection / Item / File three layers | `silan content tree` | Output hierarchy matches the on-disk structure |

### 5.3.1 `ResumeParser` validation slice — one parser through the full test stack

> Corresponds to `ResumeParser` in `01-oop-structure.md` §1.5.1.
> One real parser end-to-end through "parser methods + tests".
> Fixture: `fixtures/content/resources/resume/`.

**L1 unit tests** (`silan-viking-app/src/parser/resume.rs`'s `#[cfg(test)]`):

```rust
#[test]
fn content_type_is_resume() {
    assert_eq!(ResumeParser::default().content_type(), ContentKind::Resume);
}

#[test]
fn parser_registry_dispatches_by_item_kind() {
    let registry = ParserRegistry::new();
    let item = load_fixture_item("resume/");
    assert_eq!(item.kind(), ContentKind::Resume);

    let parser = registry.parser_for(&item).unwrap();
    assert_eq!(parser.content_type(), ContentKind::Resume);
}

#[test]
fn scanner_rejects_unknown_content_kind_before_registry() {
    let err = scan_fixture("resources/unknown-type/example").unwrap_err();
    assert!(matches!(err, ScanError::UnknownContentKind { .. }));
}

#[test]
fn parsed_builder_is_not_public_api() {
    // compile-fail doctest / trybuild:
    // external modules cannot call Parsed::builder or ParsedBuilder mutators.
    // Parsed can only be produced by finish() inside the parser module;
    // mappers can only read via getters.
}

#[test]
fn parse_full_resume_extracts_seven_parts() {
    // resume is a multi-Part type (ruling 1): summary / education /
    // experience / publications / awards / research / skills. The source
    // file extension follows the shape: summary is prose → <lang>.md;
    // the rest are structured Parts → <lang>.toml.
    let item = load_fixture_item("resume/");
    let parsed = ResumeParser::default().parse(&item).unwrap();
    assert_eq!(parsed.main().get("personal.full_name"), Some("Example User"));
    // All 7 Parts parse out. Structured Parts use the entry_list /
    // key_value_list shape; each entry has entry_id = e_<ulid> (ruling 1).
    for role in ["education","experience","publications","awards",
                 "research"] {
        let entries = parsed.entries(role);
        assert!(!entries.is_empty(), "{role}'s entry_list must be non-empty");
        // Every entry must carry an entry_id with prefix e_
        assert!(entries.iter().all(|e| e.entry_id().starts_with("e_")),
                "each entry of {role} must have entry_id = e_<ulid>");
    }
    assert!(!parsed.key_values("skills").is_empty(), "skills is key_value_list");
    // summary is an ordinary Part (not entry_list)
    assert!(parsed.text("en", "summary").is_some());
}

#[test]
fn resume_parses_both_languages() {
    // ★ Pins review R1's fix: every language variant under a Part
    // directory (en + zh) is parsed into Parsed.langs — no language
    // is lost. (summary is .md; the rest are structured Parts in .toml.)
    let item = load_fixture_item("resume/");     // fixture: summary/{en,zh}.md + every other parts/<role>/{en,zh}.toml
    let parsed = ResumeParser::default().parse(&item).unwrap();
    // Both language variants are present
    assert_eq!(parsed.langs().count(), 2);
    assert!(parsed.lang("en").is_some());
    assert!(parsed.lang("zh").is_some());
    // The zh variant has Chinese content and is non-empty — proves zh
    // was not swallowed by primary_file()
    let zh = parsed.lang("zh").unwrap();
    assert!(zh.get("personal.title").is_some());
    assert!(!parsed.entries_for_lang("zh", "education").is_empty());
    // main (language-agnostic) reads only from canonical_lang
    // (the §1.8.0 invariant)
    assert_eq!(parsed.main().slug(), "resume");
}

#[test]
fn missing_full_name_is_error() {
    let item = load_fixture_item("resume-no-name/");   // fixture: name deliberately removed
    let parser = ResumeParser::default();
    let issues = parser.validate(&parser.parse(&item).unwrap());
    assert!(issues.iter().any(|i| i.is_error() && i.msg().contains("full_name")));
}

#[test]
fn missing_email_is_warning_not_error() {
    let item = load_fixture_item("resume-no-email/");
    let parser = ResumeParser::default();
    let issues = parser.validate(&parser.parse(&item).unwrap());
    assert!(issues.iter().any(|i| i.is_warn() && i.msg().contains("email")));
    assert!(!issues.iter().any(|i| i.is_error()));   // missing email must not be an error
}

#[test]
fn invalid_education_date_range_is_error() {
    let item = load_fixture_item("resume-bad-dates/");  // an education entry has start > end
    let parser = ResumeParser::default();
    let issues = parser.validate(&parser.parse(&item).unwrap());
    assert!(issues.iter().any(|i| i.is_error() && i.msg().contains("education date")));
}

#[test]
fn resume_is_multi_part_entry_list() {
    // resume is a multi-Part type (ruling 1): summary + 5 entry_list Parts + skills key_value_list.
    // Verify the Part model holds for "multi-Part resume" too — no
    // longer the legacy single body Part.
    let item = load_fixture_item("resume/");
    for role in ["summary","education","experience","publications",
                 "awards","research","skills"] {
        assert!(item.part(role).is_some(), "resume must have the {role} Part");
    }
    assert!(item.part("body").is_none());   // resume has no legacy single body Part
}
```

**L2 snapshot test** (`insta`):

```rust
#[test]
fn resume_parsed_snapshot() {
    let parsed = ResumeParser::default().parse(&load_fixture_item("resume/")).unwrap();
    insta::assert_yaml_snapshot!(parsed);   // parse-result shape is stable; logic changes show up as diff
}
```

**L3 e2e** (`assert_cmd`, running real `silan`):

```
silan index sync           → resume's 7 Parts land correctly: summary
                             and other ordinary Parts go to
                             item_part + item_part_translation; each
                             entry of the 5 entry_list Parts goes to
                             part_entry + part_entry_translation;
                             skills, as a key_value_list, goes to
                             part_entry (ruling 1)
silan content show silan://resources/resume → output includes the
                             name and the entry counts of each Part
```

**Mapper / Registry unit tests**:

```rust
#[test]
fn mapper_registry_dispatches_by_parsed_kind() {
    let parser = ParserRegistry::new()
        .get(ContentKind::Resume)
        .unwrap();
    let parsed = parser.parse(&load_fixture_item("resume/")).unwrap();

    let mapper = MapperRegistry::new().mapper_for(&parsed).unwrap();
    assert_eq!(mapper.content_type(), ContentKind::Resume);
}

#[test]
fn resume_mapper_outputs_identity_and_translation_rows() {
    let parsed = ResumeParser::default()
        .parse(&load_fixture_item("resume/"))
        .unwrap();
    let rows = ResumeMapper::default().map(&parsed).unwrap();

    assert!(rows.item_parts().any(|r| r.role == "summary"));
    assert!(rows.part_entries().any(|r| r.role == "education"));
    assert!(rows.part_entries().any(|r| r.role == "skills"));
    assert!(rows.part_entry_translations().any(|r| r.lang == "en"));
    assert!(rows.part_entry_translations().any(|r| r.lang == "zh"));
}
```

**L4 contract**: with the same resume (en/zh `.toml` files under
`parts/<role>/`), the resume-related tables produced by Rust `silan`
must satisfy the current Go ent schema and the frontend's read
contract — including `part_entry` main table **and the
`part_entry_translation` translation table** (both languages must
match), each entry_list entry's `entry_id` must be consistent
between main and translation tables, and the skills key_value_list
category keys must be consistent between the two tables.

**This slice proves**: `ResumeParser`'s three public contract methods
(`content_type` / `parse` / `validate`) each have dedicated tests;
`ParserRegistry` dispatches on `Item.kind()`'s closed set; `Parsed`
construction can only go through the parser-only builder;
`validate`'s error vs warning tiering (missing name = error, missing
email = warn) is precisely verified; the `Part` model uniformly
applies to "multi-Part resume" and "multi-Part idea"; resume's 5
entry_list Parts and the skills key_value_list land into `part_entry`
+ `part_entry_translation` (ruling 1); `parse` traverses multilingual
`File`s and `Parsed` carries multilingual variants (§1.8.0) pinned by
`resume_parses_both_languages` — review R1 does not recur.

### Series (#3 #5)

> episode is an independent content type (ruling 2): on disk
> `content/resources/episode/<series-slug>/<episode-slug>/parts/body/`;
> its own ent tables `episodes` / `episode_series`.

| Scenario | What it tests | Expected |
|---|---|---|
| Episode series ordered | parse `episode/tutorial-series/` | Each episode is ordered by its `episode-NN` slug prefix and attached to the same `episode_series` |
| Episodes land in dedicated tables | sync `episode/tutorial-series/` | Episodes land in `episodes`; the series lands in `episode_series`; nothing pollutes the blog main table (ruling 2) |
| Episodes don't show up in the blog list | `silan content ls blog` | Episodes **do not appear** in the blog list |

### Evolution relations (#4)

| Scenario | What it tests | Expected |
|---|---|---|
| ★ **Canonicalisation** | A fixture where idea writes `evolved-into: blog-X` and blog-X writes `evolved-from: idea` (both ends declared) | After sync, `content_relation` has **exactly one row**; no `UNIQUE` collision; no error (§1.8.2) |
| Evolution chain end-to-end | After sync, query idea→blog→project | All three edges exist; forward and reverse both queryable |
| Dangling edge detection | A fixture edge pointing to a non-existent Item | `silan index lint` reports the dangling edge |

### Persistence (#1 #6 #7)

| Scenario | What it tests | Expected |
|---|---|---|
| ★ **item_part landing** | sync `multi-tab-idea`; query `item_part` + `item_part_translation` | progress has **one row** in `item_part` (identity); `item_part_translation` carries the per-language rows (one each for en and zh); `lang`/`body` live in the translation table (ruling 4: split the table) |
| Full sync | `silan index sync` | Main content tables + translation + `item_part` + `item_part_translation` + `content_relation` data are correct |
| Incremental sync | Change one Item, sync again | Only that Item is rebuilt; other Items' `.meta` hash is unchanged |
| Rebuild idempotency | `silan index rebuild` | Result is **byte-for-byte identical** to the first sync |
| Sync doesn't touch runtime data | Preload a db with comments / pings, then sync | `comment` / `content_interaction` rows are **preserved as-is** (derived vs runtime boundary) |

### Pings and visitor identification (#15)

| Scenario | What it tests | Expected |
|---|---|---|
| ★ **Three-way crawler classification** | Feed three user-agents (Googlebot / GPTBot / a real human) | `visitor_kind` classifies them as search_crawler / ai_crawler / human respectively |
| ★ **AI-chat source** | referrer from chatgpt.com / google.com / direct | `referrer_kind` classifies them as ai_chat / search / direct respectively (ruling 5: every place uses `ai_chat`) |
| Chapter-level pings | A ping with section_anchor | A `content_interaction` row records the specific chapter |
| Interaction-stats query (remote) | `silan stats show <uri>` hits a stub Go API stats endpoint | `silan stats` issues an HTTP request to `[deploy].host`'s `/api/v1/stats`, parses the response; **does not query the local db**; `--json` is parseable. Without `[deploy]` configured, it errors |
| view + like share a table | Once a view, once a like | Two `content_interaction` rows; `kind` is view / like respectively |

### Annotations and comments

| Scenario | What it tests | Expected |
|---|---|---|
| Three classes of annotations | Write annotations with `author_kind` reader / owner / agent | Each lands; owner annotations default `visibility=private` |
| annotation vs comment boundary | One with anchor, one without | With anchor → `annotation`; without → `comment` (§revision E FLAG 6) |

### CLI (#8 #9)

| Scenario | What it tests | Expected |
|---|---|---|
| `silan` noun-first | `silan --help` | The 6 type groups + 8 tool groups (`content` / `index` / `relation` / `site` / `stats` / `proposal` / `mcp` / `skill`) are all there |
| Naming consistency (#9) | `silan --version`, the binary name, `silan://` URI parsing | binary = `silan-viking` enters PATH as `silan`; every URI is prefixed `silan://`; crate name is `silan-viking-*` |
| type group verb consistency | Run `new` / `list` / `show` / `edit` / `rm` / `archive` across idea / blog / project / update | The six verbs share names and meanings; behaviour is consistent |

### MCP tier 1 read-only — one scenario per tool (#10 #12 #15)

> `03-mcp-service.md` tier 1 has 9 tools. One scenario per tool; missing one = a gap.

| Scenario | What it tests | Expected |
|---|---|---|
| MCP `recall` | A known query against the default SQLite FTS5 lexical index | With no network and no Embedder, returns the expected Item, with summary and matched_parts |
| MCP `recall` fallback | An ApiEmbedder is configured but the stub returns an error | Degrades to lexical-only; the span marks `embedder=fallback`; the tool still succeeds |
| ★ **MCP `list`** | `list("project", {status:"building"})` | Returns only `status=building` projects with slug / title / status / evolution relations; **result matches** CLI `silan project list --status building` |
| MCP `browse` | `browse("silan://resources/")` | Returns the directory structure, matching disk |
| MCP `read` | `read` on an Item URI | Returns the body of that Item |
| MCP `context_brief` | `context_brief()` on an empty session | Returns a condensed brief that includes what silan is currently thinking about |
| MCP `lint` | `lint()` | Returns the health report; same result as `silan index lint` |
| MCP `stats` / `visitors` | Hits a stub Go API | Remote query, not the local db; isomorphic with CLI `silan stats show` / `visitors` |
| ★ **MCP `crawler_breakdown` / `source_breakdown`** | Hits a stub Go API | Two tools aggregate by visitor kind / source respectively; **one-to-one isomorphic, identical results** with CLI `silan stats crawlers` / `sources` |

### MCP tier 2 / 2.5 — capture and agent context (#12)

| Scenario | What it tests | Expected |
|---|---|---|
| MCP `capture` | agent `capture(note, "idea")` | Opens a `proposal/<ulid>` branch; the new Item is written in the canonical layout; the main branch of the source of truth is untouched |
| ★ **`ctx_write` direct write to agent/** | `ctx_write("silan://agent/notes/x", ...)` | Direct write; **does not** open a proposal branch; only stages `content/agent/**`; produces an `agent: ctx_write ...` commit |
| ★ **`ctx_write` concurrent lock** | Two `ctx_write`s on the same agent file simultaneously | `agent-write.lock` serialises them; no half-written files; commit trailers carry `Agent-Tool` / `Agent-Uri` / `Content-Hash` |
| ★ **`ctx_write` refuses resources/** | `ctx_write("silan://resources/ideas/x", ...)` | Rejected by the Namespace layer (`ResourceNamespace.accepts_direct_write() == false`) |
| `ctx_read` | Read a file under `silan://agent/` | Returns content |
| `ctx_brief` | `ctx_brief()` on a fresh agent | Returns "the project understanding handed down by the previous agent" brief |
| `reflect` | `reflect(session)` at session end | Writes the immutable `agent/sessions/YYYY/MM/DD/<ulid>.md`, and patches `agent/owner/` and `agent/project/` per the rules |
| ★ **`agent/` is never published** | Put content under `agent/`, then `silan site build` | Not a single word of `agent/` appears in the site output (`is_publishable() == false`) |

### MCP tier 3 / 4 — proposals and dangerous side effects (#10 #11 #13)

| Scenario | What it tests | Expected |
|---|---|---|
| MCP proposal isolation | After `propose`, query the source of truth | The source of truth (main branch) is unchanged; the draft sits on `proposal/<id>`; only `accept` merges it into main |
| `summarize_updates` | The agent drafts a changelog | Goes through a proposal branch; does not land directly |
| ★ **`deploy` off by default** | Without `--enable-deploy`, the agent calls `deploy()` | Rejected; with `--enable-deploy`, still forces dry-run + owner confirmation |
| MCP cannot accept / publish | The agent calls `accept` / `publish` | Rejected — human-only (#13); neither is in the MCP tool list |
| ★ **Proposal anchored to a Part** | The agent `propose`s an idea's `progress` Part | The proposal branch touches only the `parts/progress/` directory; other Parts are unchanged (verified via `git diff`) |
| ★ **Validation gate blocks dirty data** | The agent submits a proposal with broken frontmatter | Validation ① marks red; `silan proposal accept` is denied; main branch is unchanged |
| Validation-passing proposal can be accepted | The agent submits a structurally-clean proposal | Validation green; `accept` = merge + revalidate succeeds; main shows the new content |
| ★ **Stale proposal → accept conflict** | After branching, silan edits the same file on main and commits; then accept | Staging-area merge conflicts → `accept` errors out; **main HEAD is byte-unchanged**; `silan proposal show` lists the conflict files |
| ★ **Revalidation at accept (validation ②)** | Validation ① passed at submission, but silan later deletes an Item the proposal references | After staging merge, validation ② fails → the temporary worktree is discarded; **main HEAD has never moved** (not "moved then rolled back") |
| ★ **Accept atomicity** | One successful accept | The main pointer atomically advances to a single verified merge commit (with the 1 merge commit); on failure paths, `git reflog` shows no trace on main |
| Temporary worktree never leaks | Run accept across all three exits (success / validation-fail / conflict) | After each exit, `git worktree list` shows no leftover temporary worktree |
| Rebase a stale proposal | `silan proposal rebase <id>`, then accept | After rebasing onto the baseline, conflict-free accept succeeds |

### Skill distribution (#16)

> See `13-skill-distribution.md`. The contract for the `silan skill` command group and the skill bundle.

| Scenario | What it tests | Expected |
|---|---|---|
| ★ **`silan skill emit` artefacts** | Run `silan skill emit --path t` | `t/silan-viking/` has `SKILL.md` (frontmatter with name/description) + `reference/mcp-tools.md`; exit code 0 |
| SKILL.md frontmatter compliance | Parse the emitted `SKILL.md` | Frontmatter has `name` / `description`; description is the fixed template and covers the natural-language trigger surface |
| Skill body embeds project state | Read the body of the emitted `SKILL.md` | Includes the current 6 content types + the MCP local resolution rules; synced bundle has no absolute paths or fixed ports |
| ★ **MCP coordinates resolve locally** | Emit on machine A, copy to machine B, run `silan skill status` + `silan mcp status --json` on B | Connects via machine B's own `silan mcp serve --stdio`; if the binary / project / Schema hash mismatches, reports `binary_found` / `mcp_available` / `schema_hash_match` failures explicitly |
| ★ **emit is derived; rebuildable** | Edit `SCHEMA.md`, then re-`emit` | The skill bundle overwrites and follows the new project state; no stale type listings remain |
| `silan skill status` consistency | After emit, edit `SCHEMA.md`, then `skill status` | Detects the mismatch (ContentHash comparison); prompts re-emit |
| `silan init` doesn't auto-emit | After a fresh `silan init`, inspect `~/.claude/skills/` | No silan-viking skill — emit must be explicit (off by default, same as deploy) |
| `silan skill rm` | After emit, `skill rm` | The skill bundle directory is removed |
| Skill body carries the red lines | Read the body of the emitted `SKILL.md` | Contains the three safety red lines (resources/ only via proposal; accept/publish/deploy are human-only; agent/ is never published) — the `03` safety rules are projected into the agent's view |

### End-to-end main path: init / config / deploy (`06`)

> See `06-end-to-end.md`. These cases pin every step of the contract from "install" to "deploy".

| Scenario | What it tests | Expected |
|---|---|---|
| ★ **`silan init` artefacts** | Run `silan init --path t` against an empty directory | Produces a `content/` with the six type directories (blog / projects / ideas / episode / resume / update, ruling 3) + three sample items (welcome blog / ai-content-optimizer idea / sample-project) + `SCHEMA.md` + `silan-viking.toml` + a `git` repo with an initial commit; exit code 0 |
| `silan init` non-empty | Run `silan init` against a non-empty directory | Exit code 1; error; with `--here` mode, only the missing pieces are filled in |
| ★ **toml full parse** | Parse the full `silan-viking.toml` in §6.2.2 | `[project]` / `[identity]` / `[database]` / `[mcp]` / `[deploy]` are all parsed correctly |
| toml missing a required section | `silan-viking.toml` missing `[deploy]` | `silan site deploy` exits 1 with an error naming `[deploy]` |
| ★ **SSH key path missing** | `[deploy].ssh_key_path` points at a non-existent file | `silan site deploy` exits 1, prompts to generate a key; **does not** try to connect to the server |
| SSH key wrong perms | The key file is not 0600 | `silan site deploy` errors with a `chmod 600` hint |
| ★ **identity seeds resume** | After `silan init`, inspect `content/resources/resume/parts/summary/en.md` | summary is a prose Part → `.md`; name / title / email come from `[identity]`; after editing `parts/experience/en.toml` (entry_list Part → `.toml`) to add an entry and syncing, the `part_entry` / `part_entry_translation` tables follow (markdown/toml is the source of truth, ruling 1) |
| `deploy --dry-run` | Default `silan site deploy` | Prints the six-step plan; **does not connect to the server; does not change live state**; exit 0 |
| `deploy --confirm` chain | `silan site deploy --confirm` | Executes the six steps sync→build→package→ship→promote→up; the live content_commit advances; runtime tables are not overwritten |
| ★ **Deploy doesn't overwrite runtime data** | Preload the live DB with comments / content_interaction, then promote a new derived db | Derived tables update; comment / content_interaction / reader annotation rows are preserved as-is (`08` §8.3) |
| Main exit codes | Run init / sync / serve / accept / deploy with both success and failure | Exit codes follow §6.8 (0 success / 1 user-fixable / 2 environment error) |
| ★ **SeoEmitter artefacts** | `silan site build` | Produces sitemap.xml / robots.txt / JSON-LD / pre-rendered HTML / meta; snapshot-compared (#14) |
| Visibility projection | One private Item, one public Item | Only the public one is projected into the site output |

## 5.4 Contract tests — validate only the latest layout (#6)

The same `fixtures/content/`: Rust `silan index sync` produces a
`portfolio.db`. Assert that it satisfies three groups of
latest-layout contracts:

- Go ent schema: every derived-table field, enum, index, foreign key matches `backend/internal/ent/schema/` — including the table splits `item_part` / `item_part_translation` (ruling 4), `part_entry` / `part_entry_translation` (ruling 1), `episodes` / `episode_series` (ruling 2); the `referrer_kind` enum uses `ai_chat` (ruling 5).
- Frontend read contract: the queries the Go API actually uses can read the 6 content types (blog / projects / ideas / episode / resume / update, ruling 3) + relations + item_part (translations via `item_part_translation`) from the new db.
- Content invariant: only `content/resources/` is derived; `content/agent/` never enters the db.

The legacy Python `silan` is reference material for M0 fact extraction only — **not a cross-check target**. This round lands the latest layout directly; it does not preserve the legacy on-disk layout or the legacy Python output db on a table-by-table basis.

## 5.5 CI

```
cargo test --workspace                       # L1 + L2 + L3
cargo clippy -- -D warnings -D unwrap_used    # 09 §9.1: zero unwrap in non-test code
cargo fmt --check
<contract job>                               # L4: Go ent + frontend read contract
<criterion bench job>                        # 09 §9.5: perf bench, > baseline × 1.5 warns, × 2 fails
```

## 5.6 Test coverage ↔ requirement map (self-check table)

| Requirement | Matching scenarios |
|---|---|
| #1 markdown source of truth | full / incremental sync; rebuild idempotency |
| #2 content structure | idea multi-tab / configurable file tree / three-layer tree / language inference / resume multi-Part (7 Parts, ruling 1) / update is the 6th type (ruling 3) |
| #3 #5 series | episode series ordered / episodes in dedicated tables / episodes don't show in blog list (ruling 2) |
| #4 evolution relations | canonicalisation / evolution chain end-to-end / dangling edge |
| #6 Rust rewrite | contract tests (including item_part table split, part_entry, episode dedicated tables); `silan init` produces six types (clean-room Rust; no Python dependency; no legacy-structure compatibility) |
| #7 OOP | L1 units (per-object contracts) |
| #8 CLI | `silan` noun-first / 6 type groups + 8 tool groups / verb uniformity |
| #9 naming consistency | naming consistency (binary / URI prefix / crate name) |
| #10 #12 MCP | `recall` / `list` / `browse` / `read` / `context_brief` / `capture` / `ctx_*` / `ctx_brief` / `reflect` / proposal isolation / Part-anchored proposal / validation gate / accept atomicity |
| #11 #13 | `lint` / `summarize_updates` / `deploy` off by default / MCP cannot accept-publish / `agent/` never published / visibility projection |
| #14 crawler artefacts | SeoEmitter artefact snapshots |
| #15 pings | three-way crawler classification / AI source / chapter pings / stats / visitors / crawler_breakdown / source_breakdown (CLI and MCP isomorphic) |
| #16 skill distribution | `silan skill emit` artefacts / SKILL.md frontmatter / emit is rebuildable / `skill status` consistency / init doesn't auto-emit / red lines in the body |
| End-to-end backbone (`06`) | `silan init` artefacts / toml full parse / SSH key validation / identity seeding / deploy dry-run / exit codes |

> If a requirement has no matching scenario in this table, the
> tests have a gap. During M0 / M1 implementation, this table
> must stay fully covered.
