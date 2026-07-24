# 11 · M0.5 — Go ent schema revision PR

> This chapter sinks the revisions A/D/E/F/G in `01-oop-structure.md`
> §1.10 into an **executable Go ent PR**: every new / changed
> table's complete fields + enums + indexes + migration steps; the
> drop-list; the derived-table / runtime-table whitelists.
>
> **Status of this chapter**: it is the artefact spec for M0.5.
> M0.5 = edit `backend/internal/ent/schema/` + re-run
> `go generate` + Go API adaptation + `sea-orm-cli` reverse-generate
> Rust entities.
>
> **Prerequisite**: M0 (the SCHEMA finalisation in `10`) must
> complete first — this chapter's field names and enum values
> follow the rulings in `10`. **If M0 has not finalised, do not
> open M0.5.** (`08` §8.7)
>
> **Source-of-truth discipline**: the source of truth for the table
> schema is Go ent (`README` design discipline), not this chapter.
> This chapter is "how Go ent must change" — the PR design. After
> editing ent, `sea-orm-cli` reverse-generates Rust
> `silan-viking-entities`; **Rust entities are not hand-written**
> (or they drift).
>
> **Decision-authority discipline**: this chapter follows `10`'s
> finalised decision ledger (`10` §10.1.1). The ledger red dots
> #6/#7/#8 are **all settled** — #6 drop `episode` from
> `blog.content_type`, #7 `request_logs` becomes a dedicated ent
> table, #8 `referrer_kind` uniformly uses `ai_chat`. This chapter
> already reflects the rulings; no ⏳ open items.
>
> **Downstream construction plan**: this chapter only defines what
> changes in ent schema. The schema change **cascades into 18
> backend handlers / 14 logic files in Go and the API/types/
> components in the React frontend** — that handler-by-handler /
> component-by-component update plan lives in
> **`docs/backend-frontend-migration/`** (the full expansion of
> this chapter's "Go API adaptation" line). §11.12's M0.5a/M0.5b
> sequencing aligns with that directory's
> `03-integration-and-cutover.md`.

---

## 11.1 Revision overview — what M0.5 changes, in one table

> This table is updated per the finalised decision ledger (`10`
> §10.1.1): episode becomes its own table; update is the 6th type
> (`recent_updates` is promoted to its main content table); resume
> flows through `part_entry`.

| Action | Object | Source | Section |
|---|---|---|---|
| ➕ Add | `content_relation` | §1.10 revision A | §11.2 |
| ➕ Add | `content_interaction` | §1.10 revision D | §11.3 |
| ➕ Add | `stats_cache_*` (local read-only cache, 3 tables) | `02` §`silan stats` sync-then-query | §11.3.1 |
| ➕ Add | `annotation` | §1.10 revision E | §11.4 |
| ➕ Add | `item_part` + `item_part_translation` | §1.10 revision G | §11.5 |
| ➕ Add | `part_entry` + `part_entry_translation` | `10` §10.4.5 ruling #2 | §11.5.1 |
| ➕ Add | `episodes` + `episode_series` (+ their translations) | `10` §10.4.4 ruling #1 | §11.5.2 |
| ✏️ Edit | `comment` (F: enum + rename typo) | §1.10 revision F | §11.6 |
| ✏️ Edit | `blog_posts` (drop `ideas_id` FK + content_type + visibility) | §1.10 A + `10` §10.4.2 | §11.7 |
| ✏️ Edit | `projects` / `ideas` (status / visibility aligned with `10`) | `10` §10.4 | §11.7 |
| ✏️ Edit | `recent_updates` (promoted to `update` type main table + add slug / visibility / update_type) | `10` §10.4.6 ruling #3 | §11.7.1 |
| ✏️ Edit | `*_details` tables (text-tab fields move out to `item_part`) | §1.10 revision G | §11.8 |
| ❌ Drop | `project_relationships` | covered by `content_relation` | §11.9 |
| ❌ Drop | `project_views` / `project_likes` / `comment_likes` | covered by `content_interaction` | §11.9 |
| ❌ Drop | `education` / `work_experience` / `publications` / `awards` etc. resume-only tables | resume flows through `part_entry` (ruling #2) | §11.9 |
| ✏️ Edit | `request_logs` formalised as an independent ent table | `10` ruling #7 | §11.10 |

---

## 11.2 ➕ `content_relation` — the generic relation table (revision A)

Per `01` §1.10 revision A, **field-by-field in ent**:

```go
// backend/internal/ent/schema/contentrelation.go
type ContentRelation struct{ ent.Schema }

func (ContentRelation) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.Enum("from_type").
            Values("blog", "project", "idea", "episode", "resume", "update"),
        field.UUID("from_id", uuid.UUID{}),
        field.Enum("to_type").
            Values("blog", "project", "idea", "episode", "resume", "update"),
        field.UUID("to_id", uuid.UUID{}),
        field.Enum("relation_type").
            Values("evolved_into", "documents", "references",
                   "supersedes", "part_of"),
        field.Int("sort_order").Default(0),
        field.Time("created_at").Default(time.Now),
    }
}

func (ContentRelation) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("from_type", "from_id", "to_type", "to_id",
                     "relation_type").Unique(),   // dedup
        index.Fields("from_type", "from_id"),     // forward query
        index.Fields("to_type", "to_id"),         // reverse query
    }
}
```

**Alignment with `10`'s rulings**:
- `relation_type` enum **stores only the canonical direction** — `evolved_from` is not stored (it is the flip of `evolved_into`, `10` §10.5), so the enum has no `evolved_from`.
- `from_type` / `to_type` enums **include all 6 types: `blog/project/idea/episode/resume/update`** — the final ruling is that `update` is the 6th content type (`10` §10.4.6 ruling #3); `update` is a valid relation endpoint (an update can `documents` a project, be one end of an `evolved_into` edge, etc.).
  (Note: an early draft wrote "drop update", based on the obsolete view that update wasn't a type; overturned by ruling #3 — this is consistent with the Go schema's 6-value enum.)

---

## 11.3 ➕ `content_interaction` — the unified interaction table (revision D)

Per §1.10 revision D; merges `project_views` + `project_likes` +
section-level pings + the `#15` visitor-identification needs. This
is a **runtime table** (server-only writes; §11.11 whitelist).

```go
// contentinteraction.go
func (ContentInteraction) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.Enum("entity_type").
            Values("blog", "project", "idea", "episode", "resume", "update"),
        field.UUID("entity_id", uuid.UUID{}),
        field.String("section_anchor").Optional().Nillable(), // section-level ping
        field.Enum("kind").Values("view", "like"),            // one row per event
        // —— visitor identification (#15) ——
        field.String("user_identity_id").Optional().Nillable(),
        field.String("fingerprint").Optional().Nillable(),
        field.String("ip_address").Optional().Nillable(),
        field.String("user_agent").Optional().Nillable(),
        field.Enum("visitor_kind").
            Values("human", "search_crawler", "ai_crawler").
            Default("human"),
        field.Enum("referrer_kind").
            // Final ruling (ledger #8): the whole repo uniformly uses
            //   `ai_chat` (the requirement text says "AI chat source").
            //   `ai_referral` used in 01 / 05 earlier is changed to
            //   `ai_chat` in the write-back pass.
            Values("search", "social", "ai_chat", "direct", "internal").
            Default("direct"),
        field.String("crawler_name").Optional().Nillable(),
        field.Int("session_duration").Default(0),
        // scroll_progress: how far down the page the visitor scrolled
        // (0.0–1.0). Go ent already carries this; the 11 draft missed
        // it; back-filled here (silan ruling: keep real Go ent fields,
        // back-fill into 11).
        field.Float("scroll_progress").Default(0.0),
        field.Time("created_at").Default(time.Now),
    }
}

func (ContentInteraction) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("entity_type", "entity_id"),
        index.Fields("entity_type", "entity_id", "section_anchor"),
        index.Fields("entity_type", "entity_id", "kind"),
        index.Fields("fingerprint"),
        index.Fields("created_at"),
    }
}
```

> `kind` records one event per row (`project_views`'s "one view"
> + `project_likes`'s "one like" merged). `view_count` /
> `like_count` **no longer live in the main content table** —
> they are aggregated live via `SELECT count(*) ... WHERE kind=?`,
> or cached by the Go API.
> `visitor_kind` / `referrer_kind` / `crawler_name` are
> **classified at write time by the Go API** (`08` §8.4); Rust
> stats only queries — it never re-classifies.

---

## 11.3.1 ➕ `stats_cache_*` — local read-only stats cache (sync-then-query)

> Red-team audit addition: `02` §`silan stats` and `03` tier 1
> repeatedly refer to `stats_cache_*`, but §11.1's early inventory
> missed building this table. This section fills it in. **These
> three tables are NOT the same as `content_interaction` in
> §11.3**: `content_interaction` is the **server**
> `portfolio.db`'s runtime truth table (written by the Go API when
> a visitor visits); `stats_cache_*` is the **owner's local**
> `portfolio.db`'s read-only cache — `silan stats sync` pulls
> server stats (already aggregated) via the Go API; CLI `silan
> stats` and the four MCP `#15` tools read this cache. The local
> `content_interaction` is always empty (`02` makes this explicit).

Why a cache instead of a direct connection: the owner can `silan
stats show` offline; one `sync` pulls a batch, avoiding an HTTP
call per command. The cache can be wiped and re-`sync`ed
wholesale; **it is not a source of truth and does not participate
in cross-check tests**.

Three tables (all with `synced_at` to record cache freshness):

```go
// stats_cache_summary.go — one row per Item; stats show reads it
func (StatsCacheSummary) Fields() []ent.Field {
    return []ent.Field{
        field.String("entity_uri"),              // silan:// URI, primary key
        field.Int("views").Default(0),
        field.Int("likes").Default(0),
        field.Int("comments").Default(0),
        field.Time("synced_at"),                 // when this row was synced
    }
}
func (StatsCacheSummary) Indexes() []ent.Index {
    return []ent.Index{ index.Fields("entity_uri").Unique() }
}

// stats_cache_visitor.go — visitor details; stats visitors reads it
func (StatsCacheVisitor) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.String("entity_uri"),
        field.String("visitor_id"),              // masked visitor identifier
        field.String("ip_masked").Optional().Nillable(),  // the MCP side only returns masked (08 §8.4)
        field.Enum("visitor_kind").
            Values("human", "search_bot", "ai_bot", "unknown").Default("unknown"),
        field.String("referrer_kind").Optional().Nillable(),
        field.String("crawler_name").Optional().Nillable(), // specific crawler name
        field.Enum("source").
            Values("search", "social", "ai_chat", "direct", "internal", "unknown").
            Default("unknown"),
        field.Time("last_seen_at"),
        field.Time("synced_at"),
    }
}
func (StatsCacheVisitor) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("entity_uri"),
        index.Fields("entity_uri", "visitor_kind"),
        index.Fields("entity_uri", "source"),
    }
}

// stats_cache_meta.go — single row; records overall sync state
func (StatsCacheMeta) Fields() []ent.Field {
    return []ent.Field{
        field.Int("id").Default(1),              // always 1; single row
        field.Time("last_full_sync_at").Optional().Nillable(),
        field.String("api_base").Optional().Nillable(), // the server address used by sync
    }
}
```

> `crawlers` / `sources` commands (and MCP `crawler_breakdown` /
> `source_breakdown`) do not need a fourth table — they do
> `GROUP BY visitor_kind` / `GROUP BY source` live aggregation
> over `stats_cache_visitor`. `stats_cache_visitor.ip_masked` is
> already masked; CLI / MCP never touch the raw IP (per `08` §8.4).
>
> **Whitelist class**: `stats_cache_*` is neither derived (not
> rebuilt from `content/` markdown) nor a truth table (truth is on
> the server); it is **a third class: remote cache**. `sync`
> rebuilds it; `rebuild` doesn't touch it; cross-check tests
> exclude it. §11.11's table-class whitelist needs this class.

---

## 11.4 ➕ `annotation` — the annotation table (revision E)

Per §1.10 revision E. The reader portion of annotations is **runtime data** (§11.11).

```go
// annotation.go
func (Annotation) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.Enum("entity_type").
            Values("blog", "project", "idea", "episode", "resume", "update"),
        field.UUID("entity_id", uuid.UUID{}),
        field.String("part_role").Optional().Nillable(),  // which Part the anchor sits on
        field.String("anchor").Optional().Nillable(),     // location inside the Part
        field.Text("body"),
        field.Enum("author_kind").Values("owner", "reader", "agent"),
        field.String("user_identity_id").Optional().Nillable(),
        field.Time("created_at").Default(time.Now),
        field.Time("updated_at").Default(time.Now),
    }
}

func (Annotation) Indexes() []ent.Index {
    return []ent.Index{ index.Fields("entity_type", "entity_id") }
}
```

> `author_kind`: `owner` (owner annotation; can enter git / derived
> tables), `reader` (visitor annotation; runtime; server-only),
> `agent`. The promote whitelist splits by `author_kind` — see
> §11.11.

---

## 11.5 ➕ `item_part` — the generic Part table (revision G)

Per §1.10 revision G + `01` §1.3 (`Part == Identity`) + `10`
§10.3. This is where Part bodies land; it **replaces** the
text-tab fields scattered across `*_details` / `*_translations`.

```go
// itempart.go
func (ItemPart) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.String("part_id"),                 // p_<ulid>; comes from meta.toml; stable
        field.Enum("entity_type").
            Values("blog", "project", "idea", "episode", "resume", "update"),
        field.UUID("entity_id", uuid.UUID{}),
        field.String("role"),                    // overview / progress / body / ...
        field.Int("sort_order").Default(0),       // = SCHEMA Part order
        field.String("canonical_lang"),
        field.Time("created_at").Default(time.Now),
        field.Time("updated_at").Default(time.Now),
    }
}

func (ItemPart) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("part_id").Unique(),
        index.Fields("entity_type", "entity_id"),
        index.Fields("entity_type", "entity_id", "role").Unique(),
    }
}
```

```go
// itemparttranslation.go — multilingual variants of a Part body
func (ItemPartTranslation) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.UUID("item_part_id", uuid.UUID{}),
        field.String("language_code"),
        field.Text("body"),                       // the body of this Part in this language
        field.Time("created_at").Default(time.Now),
    }
}
func (ItemPartTranslation) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("item_part_id", "language_code").Unique(),
    }
}
```

> This pair (`item_part` + `item_part_translation`) mirrors `01`
> §1.8.0's `Parsed` (`main` + `langs`). The Mapper maps each
> Part of an Item into one `item_part` row + N
> `item_part_translation` rows.
>
> `item_part` serves `shape: prose` Parts (blog body, idea
> overview …). The entries of `shape: entry_list` Parts (resume's
> education …) land in `part_entry` — see §11.5.1.

### 11.5.1 ➕ `part_entry` + `part_entry_translation` (ruling #2)

Per `10` §10.4.5 final ruling #2: resume's structured Parts
(`entry_list` shape) **do not get a dedicated ent table per kind
of Part**; they land in the generic `part_entry`.

```go
// partentry.go — one row per entry in an entry_list (one education / one experience)
func (PartEntry) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.UUID("item_part_id", uuid.UUID{}),  // which entry_list Part it belongs to
        field.String("entry_id"),                 // e_<ulid>; from the source TOML; stable
        field.Int("sort_order").Default(0),
        // language-agnostic fields (date / url / logo / bool …),
        //   per SCHEMA entry_fields with translatable=false; this is
        //   SCHEMA-validated typed JSON, not an unconstrained blob —
        //   sync must validate against entry_fields before DB write.
        field.JSON("shared_payload", map[string]any{}),
        field.Time("created_at").Default(time.Now),
    }
}
func (PartEntry) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("item_part_id"),
        index.Fields("item_part_id", "entry_id").Unique(),  // stable anchor of an entry
    }
}
```

> **`entry_id` is the stable anchor of an entry** (review P1 ruling,
> see `10` §10.4.5): it is to an entry what `part_id` is to a Part
> — engine-generated, lifetime-immutable, written into the source
> TOML. With it, sync can pinpoint "which entry changed" without
> delete+insert of the whole Part; an agent editing a single
> education has a clean `git diff`. `(item_part_id, entry_id)` is
> UNIQUE — entry_ids do not repeat within a Part.

```go
// partentrytranslation.go — language-specific fields of an entry
func (PartEntryTranslation) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.UUID("part_entry_id", uuid.UUID{}),
        field.String("language_code"),
        // language-specific fields (title / details / description …);
        //   entry_fields with translatable=true; also SCHEMA-validated
        //   typed JSON.
        field.JSON("localized_payload", map[string]any{}),
        field.Time("created_at").Default(time.Now),
    }
}
func (PartEntryTranslation) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("part_entry_id", "language_code").Unique(),
    }
}
```

> **The payload is not an unconstrained blob** (a hard constraint
> from final ruling #2): the JSON structure of `shared_payload` /
> `localized_payload` is defined by the matching Part's
> `entry_fields` in `SCHEMA.md`. Rust sync **must** validate
> against `entry_fields` before writing the DB — a violation is
> the `entry_field_violation` (fatal) in `10` §10.6.
>
> **Extensibility payoff**: adding a kind of resume Part
> (`talks` / `patents` / `service`) = add a block of
> `entry_fields` config in `SCHEMA.md`. The `part_entry` table
> **doesn't change**; no new table, no migration, no mapper
> change. This is the fundamental purpose of ruling #2.
>
> **Future high-frequency queries on an entry field** (e.g.
> sorting every entry by `start_date`): add a projection /
> materialised view in phase two; **do not** widen `part_entry`
> for it (ruling #2 verbatim: "do not pre-widen every resume
> block").

### 11.5.2 ➕ `episodes` + `episode_series` (ruling #1)

Per `10` §10.4.4 final ruling #1: episode is **its own main
content table**, not a row in `blog_posts`.

```go
// episodeseries.go — the container series
func (EpisodeSeries) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.String("slug").Unique(),
        field.String("title"),
        field.Text("description").Optional().Nillable(),
        field.Enum("status").
            Values("ongoing", "completed", "archived").Default("ongoing"),
        field.Time("created_at").Default(time.Now),
        field.Time("updated_at").Default(time.Now),
    }
}

// episode.go — one episode Item
func (Episode) Fields() []ent.Field {
    return []ent.Field{
        field.UUID("id", uuid.UUID{}).Default(uuid.New),
        field.UUID("series_id", uuid.UUID{}),        // strong belonging to container series
        field.String("slug").Unique(),
        field.String("title"),
        field.Int("episode_number"),
        field.Enum("status").
            Values("draft", "published", "archived").Default("draft"),
        field.Enum("visibility").
            Values("private", "unlisted", "public").Default("private"),
        field.Time("published_at").Optional().Nillable(),
        field.Int("duration_minutes").Optional().Nillable(),
        field.Time("created_at").Default(time.Now),
        field.Time("updated_at").Default(time.Now),
    }
}
func (Episode) Indexes() []ent.Index {
    return []ent.Index{
        index.Fields("series_id"),
        index.Fields("series_id", "episode_number").Unique(),
    }
}
```

> Add `episode_translations` + `episode_series_translations`
> (same shape as other `*_translations`: `language_code` + the
> language-specific `title` / `description`).
>
> **The `#5` invariant is enforced by structure**: an episode
> lives in the dedicated `episodes` table; it is naturally absent
> from `blog_posts` queries — "episode does not appear in the
> blog list" no longer depends on a `WHERE` filter; it is
> structural (the payoff of ruling #1).
>
> The legacy `blog_series` table: if existing blogs also use it
> for "blog series" (a loose-belonging concept, not the strong-
> belonging episode series), `blog_series` is reserved for blog;
> `episode_series` is episode's dedicated container series. The
> two are not shared — container series (strong belonging) and
> blog series (loose belonging) have different semantics; merging
> them is the special-case patch `VISION` §3.1 warns about.
> ⚠️ M0.5 confirms this against existing blog usage; if blog has
> no series usage, `blog_series` can be dropped.

---

## 11.6 ✏️ Edit `comment` (revision F)

Per §1.10 revision F. Three edits:

| Edit | Now | Change to |
|---|---|---|
| Spelling | `referrence_id` (double r) | `reference_id` |
| `type` becomes enum | `String` default "general" | `Enum("general","question","feedback")` default "general" |
| `entity_type` becomes enum | `String` (bare-text polymorphism) | `Enum("blog","project","idea","episode","resume")` |

```go
// comment.go — only the changed fields
field.Enum("entity_type").
    Values("blog", "project", "idea", "episode", "resume", "update"),
field.Enum("type").
    Values("general", "question", "feedback").Default("general"),
field.String("reference_id").Optional().Nillable(),  // renamed
```

**Migration note**: `referrence_id → reference_id` is a column
rename — the migration script must use
`ALTER TABLE comments RENAME COLUMN`, not drop+add (which loses
data). `comment` is a runtime table; the rename migration runs
once on the **server**.

> Also add the missing indexes on `comment`:
> `index.Fields("entity_type", "entity_id")` +
> `index.Fields("parent_id")` — these two are missing in current
> ent; back-fill in the same change.

---

## 11.7 ✏️ Edit main content tables — enums and foreign keys

**`blog_posts`**:
- Drop the `ideas_id` FK column — idea→blog evolution edges move to `content_relation` (revision A).
- `content_type` enum: **changed to `article/podcast/vlog/tutorial` (4 values)** — the final ruling keeps `podcast` (ledger #4) and drops `episode` (ledger #6; episode is now its own `episodes` table). Current Go ent has 3 values `article/vlog/episode`: add `podcast` / `tutorial`, drop `episode`.
  ⚠️ Migration: existing `blog_posts` rows with `content_type=episode` were moved into the `episodes` table during the offline rearrange (`12`); before changing the enum in M0.5, confirm no leftover episode rows in `blog_posts`.
- `status` enum: keep `draft/published/archived` (`10` is aligned).
- ➕ Add a `visibility` enum column: `Values("private","unlisted","public") .Default("private")` — `10` §10.3 requires status/visibility separation.

**`ideas`**:
- `status` enum keeps the 6 values (`draft/hypothesis/experimenting/validating/published/concluded`; `10` §10.4.1 confirms ent and Python agree; no change).
- ➕ Add the `visibility` enum column (as above). The `is_public` column: kept but derived from `visibility` (`visibility=public` ⇒ `is_public=true`), or M0.5 drops `is_public` outright in favour of `visibility` — **ruling: drop `is_public`, uniformly use `visibility`** (avoid two fields expressing the same intent; the spirit of `10` §10.3).

**`projects`**:
- `status` enum: lowercase `active/completed/paused/cancelled/archived`, consistent with `10` §10.4.3.
- ➕ Add the `visibility` column; drop `is_public` (same as ideas).

> **Unified action**: all three main content tables
> (`blog_posts` / `ideas` / `projects`) add a `visibility` enum
> column and drop `is_public`. **All three default to `private`**
> — new content is not public by default; the author must
> explicitly publish (silan ruling; includes `projects`; the
> early Go ent erroneously set `projects` to `public`; corrected).
> The Go API reads `visibility` to decide what to return to the
> public.

### 11.7.1 ✏️ `recent_updates` promoted to the `update` type main table (ruling #3)

Per `10` §10.4.6 final ruling #3: `update` is the 6th content
type, and `recent_updates` is its **main content table** (not a
derived table). Edits:

- ➕ Add a `slug` column (`String().Unique()`) — `update` as a type must be addressable.
- ➕ Add a `visibility` enum column (`private/unlisted/public`, default private).
- ➕ Add an `update_type` enum column carrying the 8 values from `10` §10.4.6: `milestone/achievement/progress/release/announcement/insight/learning/reflection`.
- The existing `type` column (enum `work/education/research/publication/project`) has **different semantics** from `update_type` ("about what" vs "what kind"). **silan ruling: keep the `type` column at its current name** (real Go ent fields are kept) — `type` and `update_type` coexist; the former is "what is this update about", the latter is "what kind of update". An early draft suggested renaming to `subject_kind`; vetoed; no rename.
- `recent_updates` enters the **derived-table whitelist** (§11.11) — it is the main content table that sync rebuilds from markdown, in the same class as blog_posts / ideas.

**Fields already in Go ent that the `11` draft missed (silan ruling: keep, back-fill into `11`)**:

`recent_updates` in Go ent carries a batch of media / link /
metadata fields that the `11` draft didn't list, but they are
real needs; they are kept and recorded here:

| Field | Type | Meaning |
|---|---|---|
| `title` / `description` / `date` | String / Text / Time | the update's title, body summary, occurrence date |
| `tags` | String (JSON) Optional | tags |
| `status` / `priority` | Enum | see `10` §10.4.6 |
| `image_url` / `video_url` / `document_url` | String Optional | primary media links |
| `gallery` / `attachments` / `media_metadata` | String (JSON) Optional | media gallery / attachments / media metadata |
| `demo_url` / `github_url` / `external_url` | String Optional | external links |
| `external_id` | String Optional | external-system id |
| `social_links` | String (JSON) Optional | social links |
| `sort_order` | Int (default 0) | ordering |
| `user_id` | UUID | owning user (single-tenant: always silan) |

> These fields are already in Go ent and the reverse-generated
> `silan-viking-entities`; this table back-fills the `11` doc to
> match Go ent — it is not "adding new Go ent fields".

> An early draft listed `recent_updates` as "demote-to-derived
> or drop, TBD". The final ruling #3 overturned it; it is a
> proper main content table. The earlier statements in `08` /
> `10` that "recent_update is derived; the engine should
> aggregate it" will be corrected in the `15` write-back pass.

---

## 11.8 ✏️ Move text fields out of `*_details` tables

Per §1.10 revision G. The **long-form text organised by tab** in
`*_details` / `*_translations` moves to `item_part`; the
**structured attribute fields** stay. Table by table:

| Table | Move to item_part | Stay in this table |
|---|---|---|
| `idea_details` | progress / results / references (text) | collaboration_needed / funding_required / estimated_duration_months / estimated_budget (structured) |
| `idea_detail_translations` | progress / results / references / required_resources (text) | (none) |
| `project_details` | quick_start / release_notes (text) | license / license_text / version / dependencies |
| `project_detail_translations` | detailed_description / goals / challenges / solutions / lessons_learned / future_enhancements | (all text; all move out) |

> **Move criterion** (`10` §10.3 rule): the field is "Part body
> long text" ⇒ move to `item_part`; it is "an indexable
> structured attribute" ⇒ stay in the main / details table.
> `project_detail_translations` has every field as Part body;
> after the move it may be empty enough to drop; confirm at M0.5
> implementation time.
>
> **Data migration**: `*_details` are **derived tables** (rebuilt
> by sync), so the migration **does not need to move data** —
> after editing the ent schema, the next `silan index sync`
> rebuilds them according to the new structure. This is the
> convenience of "derived artefacts are rebuildable"
> (VISION §3.5).

---

## 11.9 ❌ Drop list and timing

| Dropped table | Replaced by | Earliest drop window | Drop safety |
|---|---|---|---|
| `project_relationships` | `content_relation` (revision A) | M0.5a | Derived data; sync rebuilds; can be dropped directly |
| `project_views` | `content_interaction` kind=view | **M0.5b** | **Runtime data!** Migrate first, validate, then drop |
| `project_likes` | `content_interaction` kind=like | **M0.5b** | **Runtime data!** Migrate first, validate, then drop |
| `comment_likes` | `content_interaction` (or annotation) | **M0.5b** | **Runtime data!** Migrate first, validate, then drop |
| `education` / `education_details` / `education_translations` / `education_detail_translations` | `part_entry` (ruling #2) | **M0.5b** | Derived data; but must wait for M6 to prove rebuildable |
| `work_experience` / `work_experience_details` (+ their translations) | `part_entry` | **M0.5b** | Derived data; but must wait for M6 |
| `publications` / `publication_authors` / `publication_translations` | `part_entry` | **M0.5b** | Derived data; but must wait for M6 |
| `awards` / `award_translations` | `part_entry` | **M0.5b** | Derived data; but must wait for M6 |
| `research_project` etc. resume-research tables | `part_entry` | **M0.5b** | Derived data; but must wait for M6 |
| `project_technologies` | `part_entry` (if used by resume skills) / kept for project tech_stack | M0.5b or kept | Confirm at M0.5 implementation time |

> ⚠️ **`project_views` / `project_likes` / `comment_likes` are
> runtime data** (visitor-behaviour outputs, server-only).
> Dropping them = deleting real historical data on the server.
> **M0.5a may NOT drop these three runtime tables** — M0.5a only
> allows: adding `content_interaction`, deploying dual-read /
> migration scripts, validating migration results in an
> integration environment. The real drops belong in **M0.5b's
> irreversible window**: `INSERT INTO content_interaction (...)`
> from these three tables, validate row counts and sampled
> content, then drop. This migration is executed **once on the
> server**, and `04` milestones must schedule it into M0.5
> (§11.12). `project_relationships` is derived; no such concern.
>
> **Resume-only tables (`education` etc.) are derived data** —
> resume's source of truth is the content under
> `content/resources/resume/` (ruling #2: `SCHEMA.md` +
> `part_entry`). Dropping these legacy tables is safe, **but the
> drop timing is locked by review P1**: it must wait until
> M5/M6 Rust sync lands, the offline rearrange (`12`) moves
> legacy resume into the new structure, and `part_entry` rebuilds
> are verified — i.e. **M0.5b** (§11.12), not M0.5a. Dropping
> too early loses resume data with no path back.

---

## 11.10 `request_logs` — formalised as an independent ent table (ruling #7)

> **Final ruling (ledger #7)**: `request_logs` **becomes a formal
> ent table**, not merged into `content_interaction`. Reason:
> `request_logs` is API / access logging; semantically different
> from `content_interaction` (content browse / like — **content
> interaction**). Merging them stuffs two different things into
> one table — the special-case patch `VISION` §3.1 warns about.

- `request_logs` is kept as an independent ent table; M0.5 **formalises** it: complete field definitions, indexes (at least `created_at` and a path-based query).
- It is a **runtime table** (Go API writes when a request arrives) — enters the runtime-table whitelist in §11.11; promote **never touches it**.
- If the current table has irregular fields (decide at M0.5 implementation against the real `request_logs` structure), normalise into a formal ent schema; but no merge, no drop.

---

## 11.11 Derived-table / runtime-table whitelist (links to `08` §8.3 promote)

`08` §8.3 requires deploy promote to **replace only derived
tables and never touch runtime tables**. M0.5 must classify every
table explicitly and produce this whitelist — the promote job
follows it.

> **The whitelist has two versions** — because M0.5 is split into
> M0.5a / M0.5b (§11.12); the resume legacy tables still exist
> during M0.5a and are only dropped in M0.5b. Promote refactoring
> lands in M0.5a, so during M0.5a, promote must use the
> **transitional whitelist**; after M0.5b, switch to the
> **terminal whitelist**.

**Derived tables — M0.5a transitional whitelist** (between M0.5a and M0.5b; promote follows this):

```
Main content:     blog_posts, ideas, projects, personal_info, recent_updates,
                  episodes, episode_series
Translation:      *_translations (all, including episode / episode_series)
Part body:        item_part, item_part_translation
Part entries:     part_entry, part_entry_translation   ← resume's entry_list
Relations:        content_relation
Registry:         sync_meta
★ Resume legacy:  education, education_details, work_experience,
                  work_experience_details, publications, publication_authors,
                  awards, social_links (+ their translations)
                  —— During M0.5a these tables still exist and remain derived
                     tables; promote still rebuilds them. Reason: M0.5a does
                     not drop them (§11.12); sync may still be writing them.
```

**Derived tables — M0.5b terminal whitelist** (after M0.5b drops the resume legacy tables, promote switches to this):

```
Main content:     blog_posts, ideas, projects, personal_info, recent_updates,
                  episodes, episode_series
Translation:      *_translations (all)
Part body:        item_part, item_part_translation
Part entries:     part_entry, part_entry_translation
Relations:        content_relation
Registry:         sync_meta
(Resume legacy education / work_experience / ... dropped; not in the terminal whitelist)
```

> **Cut-over timing**: the same PR that drops the resume legacy
> tables in M0.5b switches the promote-job derived-table
> whitelist from transitional to terminal — drop + whitelist
> change must be in the same commit; otherwise promote will
> `DELETE FROM education` on a non-existent table and error.
> `recent_updates` is in both versions (it is the main content
> table of the `update` type, ruling #3).

**Runtime tables** (the Go API writes when a visitor visits; promote **never touches them**):

```
content_interaction        ← browse / like pings
comment                    ← comments
annotation (rows with author_kind=reader)  ← visitor annotations
user_identities            ← visitor identity
request_logs               ← API / access logging (ruling #7; independent formal table)
```

> **Boundary nuance**: `annotation` mixes two classes in one
> table — `author_kind=owner` annotations are written directly
> by the owner (can enter git / be derived), `author_kind=reader`
> are runtime. **M0.5 ruling**: classify the whole `annotation`
> table as **runtime** (promote does not touch it). If owner
> annotations later need to enter version control, design that
> in phase two; M0.5 does not split the table for this corner case.

### promote-job implementation contract (M8 cross-check; M9 implementation)

The promote job's SQL is only allowed in the following order; whole-db file replacement is forbidden:

```
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
BEGIN IMMEDIATE;
DELETE FROM <derived_table_1>;
DELETE FROM <derived_table_2>;
...
INSERT INTO <derived_table_1> ...;
INSERT INTO <derived_table_2> ...;
...
INSERT INTO sync_meta(key, value) VALUES('content_commit', ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value;
COMMIT;
```

- `<derived_table_*>` can only come from this section's transitional / terminal whitelists. No runtime table name may appear in promote SQL.
- `BEGIN IMMEDIATE` takes the write lock up-front; the Go API read side uses WAL — reads are not blocked for long. If `busy_timeout` expires, this promote run fails and exits; the live DB stays in its old state.
- Every `DELETE` and `INSERT` is in the same transaction; if any one table fails, the whole rollback applies — no half-old-half-new derived state.
- `sync_meta.content_commit` is updated last; it is the "this batch of derived tables is complete and usable" commit marker. Monitoring and rollback look only at this commit, not at intermediate row counts.

---

## 11.12 M0.5 split into M0.5a / M0.5b — drops cannot precede Rust sync

> **Review P1 ruling**: the early draft put "drop the resume
> legacy tables" inside M0.5. But the Rust parser / sync from
> milestones (`04`) only arrives at M5 / M6 — **at the M0.5
> stage, no verifiable Rust sync exists; `part_entry`'s rebuild
> from the new structure cannot be confirmed**. Dropping
> `education` etc. at this time risks losing resume data with no
> path back when sync goes wrong.
>
> **So M0.5 splits in two**, with M6 in between:

### M0.5a — add new tables + change enums + adapt the API (**keep every legacy table**)

1. **Edit ent schema**: add tables — `content_relation` / `content_interaction` / `annotation` / `item_part` (+ translation) / `part_entry` (+ translation) / `episodes` / `episode_series` (+ their translations) (§11.2–§11.5.2); formalise `request_logs` (§11.10).
   Edit `comment` / `blog_posts` / `ideas` / `projects` / `recent_updates` / `*_details` (§11.6–§11.8). **The resume-only tables `education` / `work_experience` / … are untouched in this stage.**
2. **Write the runtime-data migration script but do not drop legacy tables** (§11.9): `project_views` / `project_likes` / `comment_likes` → `content_interaction`; the script must be idempotent, support dry-run, output source row counts / target inserts / sampled validation. The `comment.referrence_id` column rename runs in M0.5a; reverse SQL must exist.
3. `go generate ./...` regenerates the ent code.
4. **Go API adaptation**: handlers for dropped tables read `content_interaction` / `content_relation`; new-table read endpoints work end to end.
5. **Promote-job refactor**: per the §11.11 whitelist, promote only DELETE+INSERTs derived tables.
6. **`sea-orm-cli` reverse-generate** `engine/crates/silan-viking-entities` (for M4) — reverse-generated from the post-change Go ent; **never hand-written**.
7. **M0.5a acceptance**: ent regenerates successfully; Go API derived-table reads + runtime-table writes pass; promote proves only derived tables are replaced; Rust entities reverse-generate without drift.

### After M6 — verify that `part_entry` rebuilds from the new structure

> After M5 / M6 Rust parser / sync land, run the offline rearrange
> (`12`) first to move legacy resume into the new structure, then
> `silan index sync`, and **verify that `part_entry` /
> `part_entry_translation` rebuild correctly** (stable entry_id,
> fields pass `entry_fields` validation, multilingual alignment).
> This step is the prerequisite gate for M0.5b.

### M0.5b — drop the resume legacy tables (**only after the M6 verification passes**)

8. **Execute the irreversible migration and drop** (§11.9): first execute the runtime-interaction migration and validate `project_views` / `project_likes` / `comment_likes` row counts, then drop those three legacy tables; only after confirming `part_entry` rebuild succeeds, drop `education` / `work_experience` / `publications` / `awards` and the translation / detail tables. Dropping too early loses resume data.
9. **M0.5b acceptance**: the resume legacy tables are gone; the resume read path goes entirely through `part_entry`; `sea-orm-cli` regenerates entities once more (legacy tables disappear); full regression passes.

> **Decoupling and timing**: M0.5a is decoupled from the Rust
> engine M1–M5 and can run in parallel (`04` milestones). M4
> (entities generation) depends on M0.5a finishing. M0.5b
> **must** be scheduled after M6 — this is the hard ordering from
> review P1; `04`'s milestone table is updated accordingly.
> Red dots #6/#7/#8 are settled (ledger §10.1.1); M0.5a can begin
> immediately.
