# 10 · M0 — `content/SCHEMA.md` finalisation

> This chapter sinks the SCHEMA **skeleton** in
> `08-engineering-review.md` §8.2 into the **coding-grade**
> finalised spec — so the parser doesn't have to guess, and
> CLI/MCP/test fixtures all generate and validate against the same
> contract.
>
> **Status of this chapter**: it is the artefact spec for M0. M0 is
> done = the repo actually has a `content/SCHEMA.md` that matches
> this chapter field-by-field. This chapter is not `SCHEMA.md`
> itself, it is "what shape `SCHEMA.md` must take" — the design
> and decision rationale.
>
> **Field-source discipline** (per `00` §0.3): every field is
> tagged with its source of fact — `[py]` = a field read by the
> current Python parser; `[ent]` = a current Go ent table field;
> `[new]` = newly added by this design. **No field without a
> `[new]` tag is allowed to appear out of thin air.**
>
> **Decision-authority discipline** (per `VISION.md` §4 "the
> owner is the author"): any **above-baseline ruling** in this
> chapter — the 6-type system, enum values, on-disk shape — is
> only a candidate proposal in the design draft; **only the
> final review can decide**. §10.1.1 is the decision ledger;
> every entry is tagged with whether it has had final
> confirmation. After this round closes, no ⏳ items remain in
> the ledger; new open issues must spin off their own review,
> not slip into the M0 finalisation table.

---

## 10.1 Why this chapter is necessary — three enum sets are at war

After extracting the current Python parser
(`silan-personal-website/silan/parsers/`) and the current Go ent
(`backend/internal/ent/schema/`), we find **the same enum, three
different value sets in three places**. This is the root of "the
parser has to guess". SCHEMA finalisation's first value = **decide
once, kill the war**.

| enum | Python parser | Go ent | `08` §8.2 old draft | **Ruling** |
|---|---|---|---|---|
| `idea.status` | draft/hypothesis/experimenting/validating/published/concluded | same as left (6 values) | legacy hypothesis/exploring/building/shipped/archived (rejected) | **Take Python ∩ ent's 6 values** (see §10.4.1) |
| `blog.content_type` | article/podcast/vlog/episode/tutorial (5) | article/vlog/episode (3) | — | **4 values: article/podcast/vlog/tutorial** — keep podcast; drop episode (episode is its own type) |
| `blog.status` | draft/published/private | draft/published/archived | — | **Split status and visibility**; `status` ∈ draft/published/archived; `private` goes to visibility (see §10.3) |
| `project.status` | ACTIVE/COMPLETED/PAUSED/CANCELLED (uppercase) | active/completed/paused/cancelled/archived | — | **Take the lowercase 5 values** (the disk contract is uniformly lowercase; archive is a first-class lifecycle state) |

> **Ruling principles**: ① enum values use "Python parser ∩ Go ent"
> as the baseline; the differences are settled one by one by the
> final review; ② case is uniformly lowercase; ③ `status`
> (lifecycle) and `visibility` are never mixed (per `08` §8.2 hard
> rule). Each ruling has its rationale in §10.4.

### 10.1.1 The decision ledger — M0 finalised rulings

> Early drafts pinned the rulings below. After engineering review,
> **two were overturned**. This ledger is "the first table the
> implementer must read before starting work". After this round
> closes, the ledger keeps no ⏳ items; new open issues must spin
> off their own review and cannot slip into the M0 finalisation
> table.

| # | Decision point | Early draft | **Final ruling** | Status |
|---|---|---|---|---|
| 1 | episode shape | blog_posts row + content_type | **Its own main content table + container series** | ✅ settled |
| 2 | resume model | 7 hard-coded heterogeneous Parts + 7 dedicated tables | **Config-driven `entry_list` + the generic `part_entry` table; no dedicated ent tables for resume** | ✅ settled |
| 3 | update / recent_update | Not part of the type system | **Kept as the 6th type** | ✅ settled |
| 4 | blog.content_type | 4 values (drop podcast) | **5 values (keep podcast)** | ✅ settled |
| 5 | is_public field | drop, replaced by visibility | **drop, replaced by visibility** | ✅ settled |
| 6 | blog.content_type contains `episode` | yes | **drop `episode`** — episode is now its own type; blog content_type = `article/podcast/vlog/tutorial` (4 values) | ✅ settled |
| 7 | `request_logs` absorption | TBD | **Becomes a formal ent table** — it is API / access logging; different semantics from content interaction | ✅ settled |
| 8 | `referrer_kind` enum naming | `ai_chat` | **uniformly `ai_chat`** — the requirement text says "AI chat source"; the whole repo uses `ai_chat` | ✅ settled |
| 9 | project `priority` / `complexity` | not introduced | **not introduced** — these are project-management ordering attributes, not content-ontology attributes; `status` + `is_featured` already cover current ordering needs | ✅ settled |

---

## 10.2 The top-level structure of `SCHEMA.md`

`content/SCHEMA.md` is a **YAML (with markdown commentary)**
document; the engine parses only fenced ` ```yaml ` blocks. Six top-level sections:

```yaml
version: 1               # SCHEMA version; the parser uses it to decide whether to parse
layout: latest-only      # Only the parts/<role>/ structure is recognised; no legacy-layout compat

namespaces: { ... }      # two namespaces (§10.2.1)
field_types: { ... }     # field-type vocabulary (§10.2.2)
types: { ... }           # the 6 content type definitions (§10.4) — the body of this chapter
relations: { ... }       # relation types and canonicalisation (§10.5)
errors: { ... }          # error tiering (§10.6)
```

### 10.2.1 namespaces

Carries from `01` §1.2.1 and `08` §8.2; unchanged:

```yaml
namespaces:
  resources:
    root: content/resources
    publishable: true
    direct_agent_write: false      # agents can only edit published content via proposal
  agent:
    root: content/agent
    publishable: false             # SiteProjector never touches it
    direct_agent_write: true       # agents write directly via ctx_write
```

### 10.2.2 field_types — the field-type vocabulary

When the parser validates fields, it follows this table. **This is the parser's type contract**:

| type | On-disk representation | Validation | Rust target |
|---|---|---|---|
| `string` | TOML / frontmatter string | non-empty (if required) | `String` |
| `text` | markdown body block | — | `String` |
| `int` | TOML integer | i64 range | `i64` |
| `float` | TOML float | f64 | `f64` |
| `bool` | TOML boolean | true/false | `bool` |
| `date` | `YYYY-MM-DD` string | strict ISO-8601 date | `time::Date` |
| `datetime` | RFC-3339 string | strict RFC-3339 | `time::OffsetDateTime` |
| `slug` | string | `^[a-z0-9][a-z0-9-]*$` | `Slug` (value object in `base`) |
| `enum(...)` | string | must be ∈ the values in parens | per-type dedicated enum |
| `list<T>` | TOML array | each item is T | `Vec<T>` |
| `ulid` | string | `p_` / `i_` prefix + ULID | `PartID` / `ItemID` |

---

## 10.3 frontmatter vs Part body vs entry vs item_part — where does a field land

This is the allocation rule M0 must pin, or the parser doesn't know where to read a field from or write it to.

```
The data of one Item is physically split across (three places for prose Parts; see below for entry_list Parts):

  ┌─ Item-level frontmatter ──→ the YAML head of parts/<primary-Part>/<lang>.md
  │    holds: slug / title / status / visibility / kind / relation declarations / structured attributes
  │    behaviour: language-agnostic fields go to main; translatable ones (title) go to each lang variant
  │    lands in: the main content table (blog_posts / ideas / projects ...) + *_translations
  │
  ├─ prose Part body ─────────→ the markdown body of parts/<role>/<lang>.md
  │    holds: each tab's long text (overview / progress / body ...)
  │    lands in: the item_part table (revision G) + its translation
  │
  ├─ entry_list / key_value_list Part ──→ parts/<role>/<lang>.toml (TOML)
  │    holds: entry_list = N homogeneous [[entry]] blocks; key_value_list = category-key → list
  │    behaviour: entry_list fields are defined by SCHEMA's entry_fields; key_value_list
  │               is defined by a role-specific contract; translatable=false → shared_payload,
  │               translatable=true → localized_payload
  │    lands in: the part_entry table + part_entry_translation (see 11 §11.5.1)
  │
  └─ Part meta.toml ─────────→ parts/<role>/meta.toml
       holds: part_id / type / shape / canonical_lang / translation metadata (phase 2)
       lands in: identity columns of item_part; does not enter the main content table
```

**Allocation rules** (the parser allocates accordingly):

0. **Item identity** → Item-root `item.toml` → the main table's `id`. It is minted once by scaffolding and never regenerated by scan/sync.
1. **Structured, enumerable, indexable** fields → frontmatter → main-content-table columns. Examples: `status`, `is_featured`, `start_date`, `github_url`.
2. **Long-form text of a prose Part, organised by tab** → Part body (`.md` body) → the `item_part` table. Examples: idea's overview/progress, project's challenges.
3. **Identity + translation metadata** → `meta.toml` → identity columns of `item_part`.
4. **`entry_list` / `key_value_list` Parts** have no markdown body. `entry_list` reads `[[entry]]` blocks from `.toml` per the `entry_fields` contract; `key_value_list` reads top-level category keys from `.toml`. Both land in `part_entry` (+ `part_entry_translation`). Only resume has Parts of these shapes (`10` §10.4.5).
5. **Language-agnostic fields are read only from `canonical_lang`**. If a non-canonical language file (e.g. `zh.toml` / `zh.md`) also writes a language-agnostic field (`slug`, `date`, an enum, a url, a bool), the parser ignores its value and reports `warn: main_field_lang_mismatch`. No cross-language tie-breaking, no "last writer wins": `meta.toml`'s `canonical_lang` is the sole source of truth for main fields; other language files contribute only translated fields.
6. **`status` and `visibility` must be two separate fields** (per `08` §8.2):
   - `status` = content lifecycle (draft → published → archived).
   - `visibility` ∈ `private` / `unlisted` / `public`; **only `public` is projected to the website by `SiteProjector`**.
   - The `blog publish` command may set `status=published` + `visibility=public` in one go, but in the SCHEMA they are independent fields; do not merge.

---

## 10.4 The 6 types — finalised field by field

> Each type has three tables: **A. frontmatter fields**, **B. Part
> inventory**, **C. enum decision rationale**. Field sources are
> tagged `[py]` / `[ent]` / `[new]`. The `req` column: ✔ =
> required, empty = optional. An empty `default` = no default
> (the optional field is None when absent).

### 10.4.1 type: `idea`

**A. frontmatter fields** (land in `ideas` + `idea_translations`)

| Field | type | req | default | Source | Column |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py][ent] | ideas.slug (unique) |
| `title` | string | ✔ | — | [py][ent] | ideas.title + translation.title |
| `kind` | enum(idea) | ✔ | idea | [new] | — (type discriminator; not stored) |
| `status` | enum(see below) | ✔ | draft | [py][ent] | ideas.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | ideas.is_public derived (public → true) |
| `priority` | enum(high,medium,low) | | medium | [py] | idea_details.* or new column |
| `category` | string | | — | [py][ent] | ideas.category |
| `abstract` | text | | — | [py][ent] | ideas.abstract + translation |
| `collaboration_needed` | bool | | false | [py][ent] | idea_details.collaboration_needed |
| `funding_required` | bool | | false | [py][ent] | idea_details.funding_required |
| `estimated_duration_months` | int | | — | [py][ent] | idea_details.estimated_duration_months |
| `estimated_budget` | float | | — | [py][ent] | idea_details.estimated_budget |
| `relations` | list<relation> | | [] | [new] | content_relation (§10.5) |

**B. Part inventory** (per `01` §1.3.1)

| role | required | order | Body lands in | Legacy ent field |
|---|---|---|---|---|
| `overview` | ✔ | 10 | item_part | idea_details / idea_translations.abstract |
| `progress` | | 20 | item_part | idea_details.progress |
| `reference` | | 30 | item_part | idea_details.references ([py] REFERENCES.md) |
| `result` | | 40 | item_part | idea_details.results |

**C. `idea.status` enum ruling**

```
status: enum(draft, hypothesis, experimenting, validating, published, concluded)
```
- Take the 6 values that Python parser ∩ Go ent share — both sources of truth agree; no ambiguity.
- The `exploring/building/shipped/archived` in `08` §8.2 old draft were invented from thin air; obsolete.
- **F1 open-item closed** (carry-over from `04` milestones): `update`/`recent_update` is no longer an idea status; it is a separate relation source (see §10.5 and §10.4.6 note).

### 10.4.2 type: `blog`

**A. frontmatter fields** (land in `blog_posts` + `blog_post_translations`)

| Field | type | req | default | Source | Column |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py][ent] | blog_posts.slug (unique) |
| `title` | string | ✔ | — | [py][ent] | blog_posts.title + translation |
| `kind` | enum(blog) | ✔ | blog | [new] | — |
| `content_type` | enum(article,podcast,vlog,tutorial) | | article | [py][ent] | blog_posts.content_type |
| `status` | enum(draft,published,archived) | ✔ | draft | [py][ent] | blog_posts.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | — (new column; see §11) |
| `excerpt` | text | | — | [py][ent] | blog_posts.excerpt + translation |
| `is_featured` | bool | | false | [py][ent] | blog_posts.is_featured |
| `featured_image_url` | string | | — | [py][ent] | blog_posts.featured_image_url |
| `published_at` | datetime | | — | [py][ent] | blog_posts.published_at |
| `category` | string | | — | [py][ent] | blog_posts.category_id (via blog_categories) |
| `tags` | list<string> | | [] | [py][ent] | blog_post_tags |
| `series` | string(slug) | | — | [py][ent] | blog_posts.series_id |
| `series_order` | int | | — | [py][ent] | blog_posts.series_order |
| `relations` | list<relation> | | [] | [new] | content_relation |

> `reading_time_minutes` / `view_count` / `like_count` /
> `comment_count` **do not enter frontmatter** — `reading_time` is
> computed by the engine from the body (derived); the latter three
> are runtime data (server-only, `01` §1.10). The parser neither
> reads nor writes them.

**B. Part inventory**

| role | required | order | Body lands in |
|---|---|---|---|
| `body` | ✔ | 10 | item_part / blog_post_translations.content |

**C. `blog.content_type` enum ruling**

```
content_type: enum(article, podcast, vlog, tutorial)
```
- Python gave 5 values (with `podcast`, `tutorial`); Go ent gave 3 (`article/vlog/episode`).
- **Final ruling (ledger #4)**: keep `podcast` (the early draft dropped it; overturned).
- **Final ruling (ledger #6)**: **drop `episode`** — episode is now its own type (§10.4.4); blog no longer uses `content_type=episode` to express episodes. Final 4 values: `article/podcast/vlog/tutorial`.
- M0.5 changes the Go ent `blog_posts.content_type` enum to these 4 values (see `11`).

### 10.4.3 type: `project`

**A. frontmatter fields** (land in `projects` + `project_translations` + `project_details`)

| Field | type | req | default | Source | Column |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py][ent] | projects.slug (unique) |
| `title` | string | ✔ | — | [py][ent] | projects.title + translation |
| `kind` | enum(project) | ✔ | project | [new] | — |
| `status` | enum(active,completed,paused,cancelled,archived) | ✔ | active | [py][ent] | projects.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | projects.is_public derived |
| `description` | text | | — | [py][ent] | projects.description + translation |
| `project_type` | string | | Web Application | [py][ent] | projects.project_type |
| `start_date` | date | | — | [py][ent] | projects.start_date |
| `end_date` | date | | — | [py][ent] | projects.end_date |
| `is_featured` | bool | | false | [py][ent] | projects.is_featured |
| `github_url` | string | | — | [py][ent] | projects.github_url |
| `demo_url` | string | | — | [py][ent] | projects.demo_url |
| `documentation_url` | string | | — | [py][ent] | projects.documentation_url |
| `thumbnail_url` | string | | — | [py][ent] | projects.thumbnail_url |
| `tech_stack` | list<string> | | [] | [py][ent] | project_technologies |
| `license` | string(SPDX) | | — | [py][ent] | project_details.license |
| `version` | string | | — | [py][ent] | project_details.version |
| `tags` | list<string> | | [] | [py] | (via content_relation or a new table; settled at M0.5) |
| `relations` | list<relation> | | [] | [new] | content_relation |

**B. Part inventory**

| role | required | order | Body lands in | Legacy ent field |
|---|---|---|---|---|
| `overview` | ✔ | 10 | item_part | project_detail_translations.detailed_description |
| `goals` | | 20 | item_part | project_detail_translations.goals |
| `challenges` | | 30 | item_part | project_detail_translations.challenges |
| `solutions` | | 40 | item_part | project_detail_translations.solutions |
| `lessons` | | 50 | item_part | project_detail_translations.lessons_learned |
| `quick_start` | | 60 | item_part | project_details.quick_start |
| `release_notes` | | 70 | item_part | project_details.release_notes |

> **Final ruling (ledger #9)**: `priority` / `complexity` do not
> enter M0 and are not retained as future candidates. They are
> project-management ordering attributes, not silan-viking's
> content-ontology attributes; existing content uses them
> sparsely, and `status` + `is_featured` already covers display
> and filtering needs today. If a project-management view is ever
> required, model it as an independent requirement; don't smuggle
> it through the project main table.
>
> **The ruling's scope is `project` only**: `idea.priority`
> (§10.4.1) and `update.priority` (§10.4.6) are real `[py]`
> fields, semantically the type's own content attribute (idea's
> push priority; update's importance); **kept** — ledger #9 does
> not affect them. #9 only kills "add an unused management column
> to the project main table".

### 10.4.4 type: `episode`

> **Final ruling (ledger #1)**: episode is **its own main content
> table**, not a row in `blog_posts`. The early draft stuffed
> episode into `blog_posts` with `content_type=episode` to
> distinguish — overturned. Reason: container series (`#5`:
> episodes belong strongly to a series; do not appear in blog
> lists) is a first-class concept; stuffing into `blog_posts` and
> distinguishing by a marker is exactly the "special case, patch"
> that `VISION.md` §3.1 calls out — not elegant. Episode as its
> own type is "naturally falls into the ontology".

**On-disk shape** — an episode belongs strongly to one container series; the series is a directory layer:

```
content/resources/episode/<series-slug>/
├── series.toml                     # container-series metadata (series identity)
└── <episode-slug>/                 # each episode is one Item
    ├── item.toml                    # stable Item identity
    └── parts/body/
        ├── meta.toml
        └── <lang>.md
```

**A. series.toml — container-series metadata**

| Field | type | req | default | Source | Lands |
|---|---|---|---|---|---|
| `series_id` | ulid | ✔ | (engine-generated) | [new] | a blog_series.id-style independent table |
| `title` | string | ✔ | — | [py] | episode_series.title + translation |
| `slug` | slug | ✔ | — | [py] | episode_series.slug |
| `description` | text | | — | [py] | episode_series.description |
| `status` | enum(ongoing,completed,archived) | ✔ | ongoing | [py] | episode_series.status |

**B. The frontmatter fields of each episode Item** (land in the independent `episodes` table)

| Field | type | req | default | Source | Column |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py] | episodes.slug |
| `title` | string | ✔ | — | [py] | episodes.title + translation |
| `kind` | enum(episode) | ✔ | episode | [new] | — |
| `series` | string(slug) | ✔ | — | [py] | episodes.series_id → episode_series |
| `episode_number` | int | ✔ | — | [py] | episodes.episode_number |
| `status` | enum(draft,published,archived) | ✔ | draft | [py] | episodes.status |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | episodes.visibility |
| `published_at` | datetime | | — | [py] | episodes.published_at |
| `duration_minutes` | int | | — | [py] | episodes.duration_minutes |
| `relations` | list<relation> | | [] | [new] | content_relation |

**C. Part inventory**

| role | required | order | Body lands in |
|---|---|---|---|
| `body` | ✔ | 10 | item_part |

> **The `#5` invariant**: episodes belong strongly to their
> series, **do not appear in blog lists** — because episode is its
> own type, its own table (`episodes`); it is naturally absent
> from `blog_posts` query results. The invariant is enforced by
> the "independent table" structure, not by a filter condition.
> This is precisely the payoff of ruling #1 choosing an independent
> table: the invariant goes from "remember to add WHERE
> content_type != 'episode'" to a structural guarantee.
>
> Python episode parser's `status` values
> `PUBLISHED/DRAFT/REVIEW/SCHEDULED` are **obsolete** —
> `REVIEW`/`SCHEDULED` are workflow states, not content-lifecycle
> states; episode `status` aligns with the three content-lifecycle
> values `draft/published/archived`. Scheduled publishing is
> expressed via a future `published_at`.
>
> M0.5 adds `episodes` + `episode_series` (+ their translation tables) as independent tables; see `11`.

### 10.4.5 type: `resume`

> resume is a **single Item** (`silan init` creates it; not
> added/removed; `02` §I). Of the 6 types this is structurally
> the most complex — Python's resume parser parses 7 blocks.

**A. frontmatter fields** (land in `personal_info`)

| Field | type | req | default | Source | Column |
|---|---|---|---|---|---|
| `full_name` | string | ✔ | — | [py][ent] | personal_info.full_name |
| `title` | string | ✔ | — | [py][ent] | personal_info.title |
| `kind` | enum(resume) | ✔ | resume | [new] | — |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | — |
| `current_status` | text | | — | [py][ent] | personal_info.current_status |
| `email` | string | | — | [py][ent] | personal_info.email |
| `phone` | string | | — | [py][ent] | personal_info.phone |
| `location` | string | | — | [py][ent] | personal_info.location |
| `website` | string | | — | [py][ent] | personal_info.website |
| `avatar_url` | string | | — | [py][ent] | personal_info.avatar_url |
| `social_links` | list<{platform,url,display_name}> | | [] | [py][ent] | social_links |

> resume has no `status` (it is not lifecycle content); it has
> `visibility` — a resume can be kept private.
>
> **Where these A-section fields land**: resume's top-level
> personal info (full_name / email / …) is **a single record**,
> not an entry_list — it still lands in the `personal_info` main
> table (+ translation). `social_links` is a small list; **fold
> it into the `summary` Part or personal_info**, don't build a
> dedicated table (same spirit as ruling #2: don't build
> dedicated tables for resume sub-structures). `personal_info` is
> the main content table of this single-Item resume; this does
> not conflict with ruling #2 "no dedicated tables for resume's
> **structured Parts**" — #2 targets entry_list Parts like
> education, not the resume Item main table.

**B. Part inventory — config-driven `entry_list` (final ruling #2)**

> **Final ruling (ledger #2)**: the early draft hard-coded
> resume's Parts as 7 heterogeneous Parts each landing in a
> dedicated ent table — **overturned**. The original ruling:
>
> > silan-viking's core is a personal context content system, not
> > an HR resume search system. Resume entry structure does need
> > to be validated, rendered, and safely edited by agents — but
> > there is no strong requirement for "independent SQL queries by
> > institution / start_date / company". Building a dedicated ent
> > table per Part turns resume into a schema-extension blocker:
> > adding `talks`, `teaching`, `patents`, `service` later would
> > require editing Go ent, migrations, Rust entities, mappers,
> > APIs.
> >
> > Resume's structured Parts use the `entry_list` shape.
> > `SCHEMA.md` is the source of truth for entry fields; Rust
> > parses markdown/frontmatter into schema-validated JSON
> > entries; the DB uses the generic `part_entry` /
> > `part_entry_translation`. M0.5 introduces no resume-specific
> > ent tables. Legacy `education/work_experience/...` tables, if
> > kept, are migration-period inputs or phase-two projections,
> > not the new system's source of truth.

**Each Part of resume has a `shape`**:

| shape | Meaning | Language-file extension | Lands in |
|---|---|---|---|
| `prose` | free markdown body (same as blog body) | **`<lang>.md`** | `item_part` + `item_part_translation` |

> **resume `summary` (bio) body must not write a top-level
> heading**: the body of the `summary` Part is plain
> paragraph-markdown. The frontend renders it inside a section
> already titled "About Me"; writing a `## Summary` / `# …`
> inside the body produces duplicate headings. The scaffold
> template emits a header-free paragraph — bio writes the body
> directly, no heading.

| `entry_list` | An ordered list of homogeneous entries (N education entries…) | **`<lang>.toml`** | `part_entry` + `part_entry_translation` |
| `key_value_list` | A list of categorised key-values (skills: `category: a, b, c`) | **`<lang>.toml`** | `part_entry` (payload is kv-shaped) |

> **Extension-name rule (load-bearing contract — loader / parser
> / CLI all follow it)**: a Part's language-file extension **is
> decided by `shape`**, not always `.md`:
> `shape=prose` → `<lang>.md` (content is markdown);
> `shape=entry_list` / `key_value_list` → `<lang>.toml` (content is TOML).
> The filename honestly reflects the format. The engine loader
> reads `meta.toml`'s `shape`; the CLI `resume edit <part>` opens
> a file — **both consult `shape` first to decide the
> extension** — do not assume Part files are always `.md`.
> blog / idea / project / episode / update Parts are all `prose`,
> hence `.md`; only resume has Parts with `entry_list` /
> `key_value_list` using `.toml`.

**resume's Part inventory** (entirely declared in `SCHEMA.md`; adding a kind of Part needs no Rust change):

| role | required | order | shape |
|---|---|---|---|
| `summary` | ✔ | 10 | prose |
| `education` | | 20 | entry_list |
| `experience` | | 30 | entry_list |
| `publications` | | 40 | entry_list |
| `awards` | | 50 | entry_list |
| `research` | | 60 | entry_list |
| `skills` | | 70 | key_value_list |

> To add `talks` / `patents` / `service` later = add a
> `{role, shape, entry_fields}` block under resume's `parts` in
> `SCHEMA.md`. **No Rust change, no new ent table, no migration,
> no mapper/API change.** This is the fundamental payoff of
> ruling #2 choosing config-driven over dedicated tables.

**`entry_list` Parts' `entry_fields` — the declarative schema of entry fields**

Each `entry_list` Part declares `entry_fields` in `SCHEMA.md`; it
is the entry **field contract** for that Part. Rust sync **must
validate against it** before writing the DB (payload is not an
unconstrained blob — this is a hard constraint silan added). Each
entry_field's properties:

```yaml
entry_fields:
  - { name: <field>, type: <field_type>, required: <bool>,
      translatable: <bool> }   # translatable=true → lands in part_entry_translation
```

- `translatable: false` (language-agnostic: date / url / logo / order / id) → `shared_payload` (JSON) on `part_entry`.
- `translatable: true` (language-specific: title / details / description) → `localized_payload` (JSON) on `part_entry_translation`.

**`education` Part's `entry_fields`** (fields sourced from `[py][ent]`; see `archive/extraction-report.md`)

| Field | type | req | translatable | Legacy ent column (migration-period reference only) |
|---|---|---|---|---|
| `institution` | string | ✔ | ✔ | education.institution |
| `degree` | string | ✔ | ✔ | education.degree |
| `field_of_study` | string | | ✔ | education.field_of_study |
| `start_date` | date | | ✗ | education.start_date |
| `end_date` | date | | ✗ | education.end_date |
| `is_current` | bool | | ✗ | education.is_current |
| `gpa` | string | | ✗ | education.gpa |
| `location` | string | | ✔ | education.location |
| `institution_website` | string | | ✗ | education.institution_website |
| `institution_logo_url` | string | | ✗ | education.institution_logo_url |
| `details` | list<text> | | ✔ | education_details.detail_text |

> The "legacy ent column" column is meaningful **only during the
> migration (`12`)** — it tells the rearrange script where the
> data came from. The new system **does not** land in `education`;
> `institution` etc. enter `part_entry`.

**`experience` Part's `entry_fields`**

| Field | type | req | translatable | Legacy ent column (migration-only) |
|---|---|---|---|---|
| `company` | string | ✔ | ✔ | work_experience.company |
| `position` | string | ✔ | ✔ | work_experience.position |
| `start_date` | date | | ✗ | work_experience.start_date |
| `end_date` | date | | ✗ | work_experience.end_date |
| `is_current` | bool | | ✗ | work_experience.is_current |
| `location` | string | | ✔ | work_experience.location |
| `company_website` | string | | ✗ | work_experience.company_website |
| `company_logo_url` | string | | ✗ | work_experience.company_logo_url |
| `details` | list<text> | | ✔ | work_experience_details.detail_text |

**`publications` Part's `entry_fields`**

| Field | type | req | translatable | Legacy ent column (migration-only) |
|---|---|---|---|---|
| `title` | string | ✔ | ✔ | publications.title + publication_translations.title |
| `authors` | list<string> | | ✗ | publication_authors.author_name |
| `journal_name` | string | | ✔ | publications.journal_name + publication_translations.journal_name |
| `conference_name` | string | | ✔ | publications.conference_name + publication_translations.conference_name |
| `publication_type` | enum(journal,conference,workshop,preprint) | | ✗ | publications.publication_type |
| `publication_date` | date | | ✗ | publications.publication_date |
| `doi` | string | | ✗ | publications.doi |
| `url` | string | | ✗ | publications.url |
| `pdf_url` | string | | ✗ | publications.pdf_url |
| `citation_count` | int | | ✗ | publications.citation_count |
| `is_peer_reviewed` | bool | | ✗ | publications.is_peer_reviewed |
| `sort_order` | int | | ✗ | publications.sort_order |

**`awards` Part's `entry_fields`**

| Field | type | req | translatable | Legacy ent column (migration-only) |
|---|---|---|---|---|
| `title` | string | ✔ | ✔ | awards.title + award_translations.title |
| `awarding_organization` | string | ✔ | ✔ | awards.awarding_organization + award_translations.awarding_organization |
| `award_date` | date | | ✗ | awards.award_date |
| `award_type` | string | | ✔ | awards.award_type + award_translations.award_type |
| `amount` | float | | ✗ | awards.amount |
| `description` | text | | ✔ | awards.description + award_translations.description |
| `url` | string | | ✗ | public source/title link |
| `certificate_url` | string | | ✗ | awards.certificate_url |
| `sort_order` | int | | ✗ | awards.sort_order |

**`research` Part's `entry_fields`**

| Field | type | req | translatable | Legacy ent column (migration-only) |
|---|---|---|---|---|
| `title` | string | ✔ | ✔ | research_projects.title + research_project_translations.title |
| `start_date` | date | | ✗ | research_projects.start_date |
| `end_date` | date | | ✗ | research_projects.end_date |
| `is_ongoing` | bool | | ✗ | research_projects.is_ongoing |
| `location` | string | | ✔ | research_projects.location + research_project_translations.location |
| `research_type` | string | | ✔ | research_projects.research_type + research_project_translations.research_type |
| `funding_source` | string | | ✔ | research_projects.funding_source + research_project_translations.funding_source |
| `funding_amount` | float | | ✗ | research_projects.funding_amount |
| `details` | list<text> | | ✔ | research_project_details.detail_text |
| `sort_order` | int | | ✗ | research_projects.sort_order |

**`skills` Part's `key_value_list` contract**

`skills` is not `entry_list`: its real shape is "category → list of
skills", e.g. `Languages = ["Rust", "Go", "Python"]`. The source
file is still `parts/skills/<lang>.toml`, but without `[[entry]]`;
each top-level key is a category name; the value is `list<string>`.

```toml
Languages = ["Rust", "Go", "Python"]
Systems = ["Linux", "SQLite", "MCP"]
```

On landing, each category produces one `part_entry`: the category
key is the stable entry key; the category name goes into
`localized_payload.category`; the skill array goes into
`localized_payload.items`. The current Go API's `resume.skills` is
still derived from project technologies — a legacy-site compat
path; M0's resume schema is this `key_value_list`.

**`entry_list` Part source-file syntax (final ruling: TOML array-of-tables)**

> `prose`-shape Parts are markdown (`<lang>.md`). `entry_list`-shape
> Parts are **not markdown** — an entry is structured data; use
> **TOML array-of-tables**. Filenames honestly reflect content:
> **`entry_list` Parts' language files are
> `parts/<role>/<lang>.toml`** (not `.md`). `meta.toml`'s `shape`
> field tells the engine which parser to use.

```toml
# parts/education/en.toml — the English variant of the education entry_list Part
# The file has no top-level content; each [[entry]] block is one education entry.

[[entry]]
entry_id    = "e_01H8X7..."          # ★ stable anchor; engine-generated; see below
institution = "National University of Singapore"
degree      = "B.S. Computer Science"
start_date  = 2019-08-01
end_date    = 2023-05-01
gpa         = "4.8/5.0"
details     = [                       # list<text>; long text uses an array
  "Dean's List 2020–2023",
  "Final-year thesis on distributed consensus",
]

[[entry]]
entry_id    = "e_01H8X8..."
institution = "..."
# ...
```

**`entry_id` — the stable anchor of an entry (review P1 ruling)**

- Every entry has `entry_id = "e_<ulid>"`, **engine-generated, lifetime-immutable**, written into the entry's own TOML block. It is to an entry what `PartID` is to a Part.
- **Why it must exist**: without it, rearrange / sorting / agents editing a single education have no stable anchor; sync can only delete+insert the whole Part — one edit rewrites the table, and the agent's proposal `git diff` becomes noise. With `entry_id`, sync can pinpoint "this one entry changed".
- The `part_entry` table adds an `entry_id` column + a `(item_part_id, entry_id)` UNIQUE constraint (see `11` §11.5.1).
- **Multilingual alignment**: the same education's `en.toml` and `zh.toml` use **the same `entry_id`** — this is the explicit binding "these two TOML blocks are two languages of the same education", not array-index alignment (indices shift on insert/delete).
- Handling of missing `entry_id` is the same as `PartID` (`08` §8.2): the `silan` command / offline rearrange script fills it; `index sync` does not silently generate and write back.

### 10.4.6 type: `update` (the 6th type)

> **Final ruling (ledger #3)**: the early draft excluded `update`
> from the type system (claiming `00` §0.2 literally said "5
> types") — **overturned**. The final ruling keeps `update` as
> **the 6th content type**. It has its own parser, its own
> `ContentKind::Update`, its own mapper. `recent_updates` is its
> main content table, not a derived table.
>
> **Knock-on effects (note for implementers)**: `00` §0.2
> requirement #2 has been corrected to "6 types"; `01`'s
> `ContentKind` keeps `Update`; `04` milestones keep 6 parsers /
> 6 mappers. Subsequent docs must not write `update` as a
> relation appendage or a resume sub-block.

**A. frontmatter fields** (land in `recent_updates` + `recent_update_translations`)

| Field | type | req | default | Source | Column |
|---|---|---|---|---|---|
| `slug` | slug | ✔ | — | [py] | recent_updates needs a slug column (M0.5) |
| `title` | string | ✔ | — | [py][ent] | recent_updates.title + translation |
| `kind` | enum(update) | ✔ | update | [new] | — |
| `update_type` | enum(see below) | ✔ | progress | [py] | recent_updates.type |
| `status` | enum(active,ongoing,completed) | ✔ | active | [py][ent] | recent_updates.status |
| `priority` | enum(high,medium,low) | | medium | [py][ent] | recent_updates.priority |
| `visibility` | enum(private,unlisted,public) | ✔ | private | [new] | (M0.5 new column) |
| `date` | date | ✔ | — | [py][ent] | recent_updates.date |
| `tags` | list<string> | | [] | [py][ent] | recent_updates.tags (JSON) |
| `relations` | list<relation> | | [] | [new] | content_relation |

**B. Part inventory**

| role | required | order | shape |
|---|---|---|---|
| `body` | ✔ | 10 | prose |

**C. `update_type` enum ruling**

```
update_type: enum(milestone, achievement, progress, release,
                   announcement, insight, learning, reflection)
```
- Take the 8 values from Python's `update_parser` (Python is the only source of truth — Go ent's `recent_updates.type` currently enumerates `work/education/research/publication/project`, which is a different semantic: "what the update is about", not "what kind of update").
- ⚠️ **Implementer note**: the Go ent `recent_updates.type` enum and Python's `update_type` are **semantically in conflict**; M0.5 must rule: add a new column on `recent_updates` to carry `update_type`'s 8 values; the disposition of the legacy `type` column (work/education/…) is decided in `11`. This is logged as an M0.5 revision point.

---

## 10.5 relations — declaration syntax and canonicalisation

Carries from `01` §1.10 revision A (`content_relation` table) and `08` §8.2.

**The `relations` declaration syntax in frontmatter**:

```yaml
relations:
  - { type: evolved_from, to: "silan://resources/ideas/rust-context-engine" }
  - { type: documents,    to: "silan://resources/projects/silan-viking" }
```

**The `relations` section's definition in SCHEMA.md**:

```yaml
relations:
  types: [evolved_into, evolved_from, documents, references, supersedes, part_of]
  # Canonicalisation: a directed edge is stored in one canonical direction;
  # the reverse direction is flipped at query time
  canonical:
    evolved_from: { store_as: evolved_into, flip: true }
    evolved_into: { store_as: evolved_into, flip: false }
    documents:    { store_as: documents,    flip: false }
    references:   { store_as: references,   flip: false }
    supersedes:   { store_as: supersedes,   flip: false }
    part_of:      { store_as: part_of,      flip: false }
  ordered: [part_of]          # these relation types use content_relation.sort_order
```

- **F2 open-item closed** (carry-over from `04` milestones): `idea_details.references` (free text) vs `content_relation`'s `references` edge — **ruling: they are different things**. `content_relation.references` is a structured Item↔Item reference edge; the idea's `reference` **Part body** (§10.4.1 Part inventory) is free-text reference material. The former lands in `content_relation`; the latter lands in `item_part`. Naming: the Part role uses `reference` (singular); the relation type uses `references` (plural) — no collision.

---

## 10.6 Error tiers

When parser / CLI / MCP validate content, errors land in three tiers. The `errors` section of `SCHEMA.md` declares the tier of each rule:

```yaml
errors:
  # fatal — blocking: the Item does not enter the RowSet; sync errors and exits
  fatal:
    - missing_required_frontmatter   # missing required slug/title/status/visibility/...
    - invalid_enum_value             # status etc. enum took an invalid value
    - kind_mismatch                  # path type does not match frontmatter kind
    - slug_pattern_violation         # slug does not match ^[a-z0-9][a-z0-9-]*$
    - missing_required_part          # missing a required Part (idea missing overview)
    - missing_part_id                # meta.toml has no part_id and this is not first-time scaffold
    - relation_target_not_found      # relations.to points at a non-existent Item
    - entry_field_violation          # entry_list / key_value_list Part violates
                                     #   the schema contract (missing required / wrong type)
                                     #   — payload is not an unconstrained blob; sync must validate before DB write
  # warn — non-blocking: the Item still enters the RowSet; sync summarises warnings at the end
  warn:
    - main_field_lang_mismatch       # a language-agnostic field (slug/date) conflicts between en and zh
    - empty_optional_part_dir        # parts/<role>/ exists but has no <lang>.<ext>
    - unknown_frontmatter_field      # a field not declared in SCHEMA (ignored; no error)
  # info — record only: does not affect sync
  info:
    - canonical_lang_only            # the Part has only the canonical_lang variant (no translation)
```

> **Load-bearing invariant**: `fatal` errors make sync "all or
> nothing" — if there is a fatal, the Item is not written at all;
> no half-row remains. Same spirit as "main branch has only two
> states" in `03` §3.1.

---

## 10.7 M0 acceptance checklist

Per the M0 definition-of-done in `08` §8.7, this chapter refines it into checkable items:

- [ ] `content/SCHEMA.md` exists and contains the six top-level sections of §10.2.
- [ ] Each of the 6 types (idea / blog / project / episode / resume / update) has a complete frontmatter field table + Part inventory; fields match §10.4.
- [ ] Each Part of resume is tagged with `shape` (prose / entry_list / key_value_list); each `entry_list` Part has complete `entry_fields`; `skills` has a complete `key_value_list` contract.
- [ ] The enum conflicts of §10.1 take the ruled values in `SCHEMA.md` (ledger #1–#9 are all settled).
- [ ] `status` and `visibility` are two independent fields, consistent across every type.
- [ ] The `relations` section has types / canonical / ordered.
- [ ] The `errors` section has the three tiers fatal / warn / info.
- [ ] `engine/tests/fixtures/content/` is entirely in the `parts/<role>/` latest layout; no legacy-path samples (`08` §8.7).
- [ ] Every field can point back to a `#` requirement in `00` §0.2, or is tagged `[new]` with a rationale.

---

## 10.8 Downstream-milestone contract dependencies — exit list

> Review made it explicit: the Go API read contract and MCP
> implementation-grade details **depend on M0 SCHEMA landing
> first**. This section lists "what must be cross-checked before
> implementation". MCP schema and promote DDL already have
> implementation-grade sources; the Go API read-matrix draft is
> in `docs/backend-frontend-migration/01-backend-migration.md`
> §1.10, but must still be re-verified against real
> `backend.api` / handlers / ent table names after M0.5a lands.

### 10.8.1 Go API read contract (M4/M9 prerequisite; the matrix draft awaits real-code verification)

The `portfolio.db` Rust sync produces must be read by the Go API. Contract skeleton:

- [ ] **Per-endpoint table**: which tables / which columns each `/api/v1/*` endpoint depends on, sort keys, filter semantics — to be extracted from the existing Go API handlers (reverse) after SCHEMA finalises + M0.5 ent lands, into an endpoint ↔ table ↔ field matrix.
- [ ] **Contract-test anchors**: the `05` L4 contract tests cross-check per endpoint; the inventory = the table above.
- TODO owner: M4 exit. After M4 generates entities, produce a draft endpoint ↔ table ↔ field matrix for the M5/M6 L4 cross-check and the M9 site adapter.

### 10.8.2 MCP protocol implementation details (M9 prerequisite; source pinned)

The implementation-grade contract source is `03-mcp-service.md` §3.2. M8 acceptance is only consistency cross-check:

- [x] Each MCP tool's **JSON input/output schema** (parameter names, types, required-flags): `03` §3.2.
- [x] **Error code table**: what code each of permission-failure / validation-failure / not-found returns: `03` §3.2.
- [x] The **exact template** of `initialize`'s `instructions` field: `03` §3.2.
- [x] The **MIME type and response body** of each resource URI (`silan://schema` etc.): `03` §3.2.
- [ ] M8 cross-check: re-scan `03` §3.2 against the final `content/SCHEMA.md` type / field names; on mismatch, edit the doc first, then write `silan-viking-mcp`.

### 10.8.3 deploy promote job details (M9 prerequisite; source pinned)

`08` §8.3 gives the policy; `11` §11.11 gives the implementation-grade SQL order + allowlist. M8 acceptance is only the real-table-name cross-check:

- [x] The **derived-table allowlist** exact table inventory: `11` §11.11 transitional + terminal lists.
- [x] The **DDL order** of the promote transaction: delete derived rows → insert new rows → update sync_meta: `11` §11.11.
- [x] **Failure rollback**: the transaction is not committed → the live DB is unchanged: `11` §11.11.
- [x] SQLite **WAL mode + busy_timeout**: `11` §11.11.
- [ ] M8 cross-check: re-scan the allowlist against the real ent table names after M0.5a; any new / dropped / changed table must update `11` §11.11 first before M9 deploy-promote implementation may start.
