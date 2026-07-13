# 01 · OOP structure

> Converged after multiple review rounds + the layered-position discipline.
> Serves requirements `#2 #3 #4 #5 #6 #7 #9 #11 #13 #14 #15`.

## 1.1 Layered position — four layers, upper depends on lower

Design discipline: be explicit about what is utility, what is content,
and that content stands on utility. The result is four layers, with
**dependencies strictly unidirectional (upper → lower); the lower
never knows the upper exists**:

```
┌──────────────────────────────────────────────────────────┐
│ L4  adapter   silan-viking-cli / -mcp / -site             │ Outward face
│               CliAdapter · McpAdapter · SiteProjector     │
├──────────────────────────────────────────────────────────┤
│ L3  app       silan-viking-app                            │ Behaviour / abilities
│               Workspace (aggregate root) · Parser · Mapper│ parse · map · write · query
│               Sink · Embedder                             │
├──────────────────────────────────────────────────────────┤
│ L2  content   silan-viking-content                        │ Domain data
│               Namespace · Collection · Item · Part ·      │ pure data:
│               File · Manifest · Relation · Series ·       │ no parse / no IO
│               Anthology                                   │
├──────────────────────────────────────────────────────────┤
│ L1  base      silan-viking-base                           │ Pure utility
│               SilanUri · Meta · ContentHash · Lang ·      │ no domain knowledge;
│               Slug · «trait» Identified                   │ portable across projects
└──────────────────────────────────────────────────────────┘
         ▲ crate dependencies only go downward; cargo guarantees no back-edge at compile time
```

**Layer-membership rules** (the hard rule of "position"; new things land per this table):

| Layer | Belongs here iff | Counter-example (does not belong) |
|---|---|---|
| L1 base | doesn't know what blog/idea is; portable to other projects | `Collection` (knows about type) → not L1 |
| L2 content | is domain **data**; knows blog/idea; but **doesn't parse, doesn't IO, doesn't validate** | `Parser` (is behaviour) → not L2 |

> L2 has its own internal structure: `Namespace` (one silan:// tree)
> ⊃ `Collection` (one type) ⊃ `Item` ⊃ `Part` ⊃ `File`.
> `Namespace` is L2's **top-level structure**; see §1.2.1.

| L3 app | is **ability / behaviour**: parse, map, write to db, query, orchestrate | `SilanUri` (pure utility) → not L3 |
| L4 adapter | is the outward-interface shape: CLI / MCP / website projection | `Workspace` (orchestration) → not L4 |

## 1.2 "content inherits from base" — Rust landing mechanism

The design's "content inherits utility" — Rust has no class
inheritance, so the landing mechanism is **define a trait in the
lower layer; `impl` it in the content layer**:

- **L1 base defines the foundational trait** — a behavioural contract; no domain knowledge.
- **L2 content types `impl` those traits** — this is "inheriting abstraction".
- content data structures then **compose** themselves out of base's **value types**.

```
L1 base:   pub trait Identified  { fn uri(&self) -> &SilanUri; }
           pub trait HasMeta     { fn meta(&self) -> &Meta; }

L2 content:  impl Identified for Collection { ... }   ← content inherits base's ability
             impl Identified for Item       { ... }
             impl Identified for File       { ... }
             // Item internals:  uri: SilanUri,  meta: Meta   ← content composes base's data
```

> The shared-data traits (`Identified` / `HasMeta`) live in L1.
> **Validation is behaviour, not on data — it sinks into L3 `Parser`**.
> Data lineage and ability lineage do not share an ancestor.

## 1.2.1 Namespace — two namespaces (resources / agent)

> The early `Namespace` abstraction was dropped when the doc was
> split, leaving only `silan://resources/...`. This section restores
> it — `content/` does not contain only published content; it has
> **two namespaces**.

Under the `silan://` protocol, `content/` is split into two
**namespaces**, each an independent content tree:

```
silan://resources/...     Published content — blog / ideas / projects / episode / resume / update
                          ★ Can be selectively projected to the website by SiteProjector (#11 #13)

silan://agent/...         The agent's context — the agent's understanding of this project / the owner,
                          working notes, memory, session summaries
                          ★ Never published; SiteProjector never touches it
```

On disk (per §0.4 / §6.2.3):

```
content/
├── SCHEMA.md
├── resources/            ← namespace ①: published content
│   └── blog/ ideas/ projects/ episode/ resume/ update/
└── agent/                ← namespace ②: agent context; never published
    ├── project/          the agent's understanding of this project (settled from reading resources/)
    ├── notes/            the agent's working notes / task memory
    ├── owner/            the agent's understanding of the owner (preferences / style / judgement)
    └── sessions/         summaries of the agent's past dialogues with silan (settled at session end)
```

### Object model — `Namespace` trait, two implementations

| Object | What it is | Key invariants |
|---|---|---|
| `«trait» Namespace` | Abstraction of one content tree; `Workspace` holds many | each has `root_uri()`; has `is_publishable()` / `accepts_direct_write()` capability probes |
| `ResourceNamespace` | `silan://resources/` — published content | `is_publishable() == true` (projectable); `accepts_direct_write() == false` (agents edit it via proposal, §3.1) |
| `AgentNamespace` | `silan://agent/` — agent context | `is_publishable() == false` (**SiteProjector never touches it**); `accepts_direct_write() == true` (agents read/write directly, no proposal) |

**Two load-bearing invariants**:

1. **`AgentNamespace.is_publishable() == false`** — `SiteProjector`
   (§1.6.1) only projects `visibility=public` Items inside
   `ResourceNamespace`; the entire `agent/` namespace is
   **unreachable** in the projection logic. Agent context never
   reaches the website.
2. **`accepts_direct_write` decides how edits happen**: `resources/`
   is published content; agents edit it via proposals (`03` §3.1);
   `agent/` is the agent's own memory; the agent writes **directly** —
   consistent with §3.1's "memory class is directly editable; content
   class goes through proposals". `agent/` is exactly that "memory class".

**The two namespaces are organised differently — do not apply the same chain**:

- `ResourceNamespace` follows a strict four-layer chain: `Collection (type) → Item → Part → File` (§1.3) — because published content lands in the database and is projected to the website; the structure must be regular.
- `AgentNamespace` **does not follow this chain**. The directories `project/`, `notes/`, `silan/`, `sessions/` under `agent/` are **classification directories**, not `Collection`s (they are not types and have no SCHEMA Part config). Inside each directory you have freely organised markdown files — the agent's memory doesn't need the Item/Part regular structure; it needs "readable, writable, persists across sessions".
- Commonality: both are markdown, both in the same git repo. Difference: `resources/` is structurally regular (it lands in db); `agent/` is structurally free (only the agent reads/writes it).

> `agent/` is part of silan's project; it just isn't published and
> doesn't enter `portfolio.db` (`silan index sync` only scans
> `resources/`). Cross-session continuity for the agent depends on
> it: when a new agent connects, reading `agent/` picks up the
> previous agent's understanding (`00` end-state "context
> enrichment").

## 1.3 L2 content — domain data objects (serves #2 #3 #4 #5)

> This section has had two revisions. First: `File` was nailed as
> "language variant"; `Part` was added to split tabs. Second (this
> version): review pointed out that **`File == Identity` was a
> structural problem** — a Part's identity was inferred from `stem`,
> language from `suffix`; renaming a file broke the semantic chain;
> partial-translation / stale tracking / merge all failed. Fix:
> **`Part == Identity, File == Representation`** — a Part has a
> stable `PartID`; language variants are merely its representations.
> See §1.3.2 for the evolution path.

`ResourceNamespace` (`silan://resources/`)'s content model has four
layers: **Collection → Item → Part → File**:

```
 ResourceNamespace
   └─▶ Collection ──contains N──▶ Item ──made of N──▶ Part ──contains N──▶ File
       a type directory          one item           a semantic part         a language variant
       blog/ideas/...            + Manifest         ★ stable PartID ★       (representation)
```

**`Part` is the identity carrier, not the filename**:

- A `Part` has a `PartID` (`p_<ulid>`, engine-generated, written to
  `meta.toml`) — **renaming / moving files does not affect identity**.
  `role` (overview / progress …) is its semantic type, but identity
  is `PartID`, not `role`, and certainly not the filename.
- Multiple `File`s under a `Part` are **language representations of
  the same semantic part** — `en.md` / `zh.md` are two variants of
  Part `p_xxx`; the language relationship is explicitly established
  by **co-locating in one Part directory**, not by guessing at
  filename-stem similarity.
- idea's Parts: overview / progress / reference / result — the four front-end tabs.
- blog's Part: only one body.
- resume's Part: **not a single body** — it is one Item + multiple
  Parts; each Part has a `shape` (prose / entry_list /
  key_value_list); structured Parts (education / experience / …)
  use `entry_list`; see §1.5.1 (final ruling; see 10 §10.4.5 and 10
  §10.1.1 ledger #2).

**Why Part==Identity is necessary** (the issues review flagged, one by one):
- Renaming `parts/progress/zh.md → parts/progress/zh-Hans.md`: `PartID` unchanged; the semantic chain isn't broken.
- `parts/overview/en.md` and `parts/overview/zh.md` are semantically the same Part: they share a Part directory; the binding is by `PartID`, not by stem.
- Partial translation / stale tracking: `meta.toml` reserves field slots `canonical_lang` / `translation_of` / `source_hash` / `stale` (§1.3.1); stable identity is required to chase them.

| L2 object | What it is | Requirement | Invariant |
|---|---|---|---|
| `Collection` | A type directory; disk path `content/resources/{type}/` (blog / projects / ideas / episode / resume / update — 6 types) | #2 | Belongs to `ResourceNamespace`; collection-level Manifest registers its Items |
| `Item` | A single entry (directory + `item.toml` + several Parts + one Manifest) | #2 | Has a lifetime-stable `ItemID`; `kind: ContentKind` distinguishes the type |
| `ItemID` | Value object, `i_<ulid>` | #2 | Engine-generated at scaffold time; lifetime-immutable; written to the Item root's `item.toml`; sync never regenerates it |
| `ContentKind` | Enum: `Blog/Project/Idea/Episode/Update/Resume` | #2 | The discriminant field of Item |
| `Part` | A semantic part / one front-end tab | #2 | **Has a stable `PartID`**; identity not bound to filename; `role` is the semantic type |
| `PartID` | Value object, `p_<ulid>` | #2 | Engine-generated; lifetime-immutable; written to `meta.toml` |
| `File` | A language **representation** of a `Part` (one `<lang>.<ext>`) | #2 | `lang` from filename; `<ext>` decided by `Part.shape` — `prose` → `.md`, `entry_list` / `key_value_list` → `.toml` (see §1.3.1 and 10 §10.4.5) |
| `Relation` | A directed, typed edge (`from` / `to` / `type`) | #4 | `type` is a closed enum (§1.10 revision A) |
| `Series` | Container series: an ordered set of `Item`s under `episode/<series-slug>/` | #3 #5 | An episode belongs strongly to its series; episode is its own type and its own tables (`episodes` / `episode_series`); naturally absent from the blog list (final ruling; see 10 §10.4.4) |
| `Anthology` | Loose collection: references scattered Items in order | #3 | Referenced Items remain independent |

> Naming: `Collection` = the type directory (physical); `Anthology` = collection semantics. No name collision.

### 1.3.1 Part's on-disk shape and the configurable file tree (serves #2)

**On-disk shape** — a Part is a directory; identity lives in `meta.toml`; language variants are the `.md` files under the directory:

```
content/resources/ideas/rust-context-engine/
├── item.toml                     # ★ Item identity is here
├── .silan-cache                  # derived ItemManifest
└── parts/
    ├── overview/
    │   ├── meta.toml              # ★ Part identity is here
    │   ├── en.md                  # a language variant (representation)
    │   └── zh.md
    └── progress/
        ├── meta.toml
        └── en.md
```

`item.toml` is committed source data:

```toml
item_id = "i_01H8X7..."          # lifetime-immutable across rebuilds and renames
```

The database and runtime interaction tables use this value as the Item key.
Generating it during scan would orphan comments, likes, and views on every
content rebuild, so a missing or malformed `item.toml` is a hard scan error.

`meta.toml` — a Part's identity and translation metadata:

```toml
# parts/overview/meta.toml
part_id        = "p_01H8X7..."     # ★ engine-generated ULID; lifetime-immutable; rename-safe
type           = "overview"        # semantic type (= the role in SCHEMA's type definition)
canonical_lang = "en"              # which language is the source; the rest are its translations

# Fields below: phase one "reserve slots, leave values empty"; phase two will fill them (§1.3.2):
# [variants.zh]
# translation_of = ""              # translated from which language
# source_hash    = ""              # source-version hash translated from — if source changes, → stale
# stale          = false           # source updated but this translation didn't follow → true
```

`canonical_lang` is also the **main-field source** for this Part.
`slug`, dates, enums, urls, bools, and other language-agnostic
fields are read **only** from the canonical-language file; the
same-named fields in other language files are ignored, and the
parser reports `warn: main_field_lang_mismatch`. There is no
cross-language "who wins" arbitration; otherwise the parser would
turn translation divergence into state-machine complexity.

**Configurable file tree** — which `Part`s each type has is defined
in `content/SCHEMA.md`; not hard-coded. Adding a tab = editing
config:

```yaml
# content/SCHEMA.md — type definition (M0 finalisation)
types:
  idea:
    parts:
      - { role: overview,  required: true  }
      - { role: progress,  required: false }
      - { role: reference, required: false }
      - { role: result,    required: false }
  blog:
    parts:
      - { role: body,      required: true  }
  # project / episode / update are the same (single / multi prose Part)
  resume:
    parts:                                  # resume's Parts carry shape
      - { role: summary,      required: true,  shape: prose      }
      - { role: education,    required: false, shape: entry_list }
      - { role: experience,   required: false, shape: entry_list }
      # publications / awards / research (entry_list), skills (key_value_list) — same shape
```

> resume's Parts carry an extra `shape` field (`prose` /
> `entry_list` / `key_value_list`) — a `prose` Part's language file
> is `<lang>.md`; an `entry_list` Part's is `<lang>.toml` (TOML
> array-of-tables); a `key_value_list` Part's is also `<lang>.toml`
> (top-level category key → list). See §1.5.1 and 10 §10.4.5
> (final ruling, see 10 §10.1.1 ledger #2).

> Note: the type definition **no longer has `stem`** — a Part is a
> `parts/<role>/` directory; no filename-stem inference. `role` is
> the directory name; `PartID` lives in `meta.toml`; language
> variants are `<lang>.<ext>` files in the directory (`ext` is
> decided by `shape`, see below). The `stem` machinery (introduced
> at review R2) is superseded by `parts/<role>/` + `meta.toml`.

**Parser is config-driven**: `Parser` reads the `parts` list of the
type definition → enters each `parts/<role>/` directory → reads
`meta.toml` for `PartID` and `shape` → parses every language file
under that directory as a language representation of the Part into
`Parsed` (§1.8.0). **The language file's extension is decided by
`Part.shape`**: `prose` → `<lang>.md` (markdown body); `entry_list`
/ `key_value_list` → `<lang>.toml` (the former is TOML
array-of-tables; the latter has top-level category keys → list).
The parser picks the parse path by `shape`; it does not assume Part
files are always `.md` (blog/idea/project/episode/update Parts are
all `prose`, hence `.md`; only resume has Parts in `entry_list` /
`key_value_list` using `.toml`).

> **The boundary between "config-driven" and "closed-set dispatch"
> — three layers; only one is closed-set** (red-team audit point:
> when `propose_schema` adds a Part, does the parser need a Rust
> change):
>
> | Layer | Extensibility | New value requires Rust change? |
> |---|---|---|
> | **type** (6) | **Compile-time closed set** — `ParserRegistry` static dispatch | Yes (add a type = add a Parser impl + recompile) |
> | **Part `role`** | **Config-driven** — parser reads SCHEMA's `parts` list | **No** — a new role is handled as data, provided its `shape` is known |
> | **Part `shape`** (prose / entry_list / key_value_list) | **Compile-time closed set** — parser picks the parse path by shape | Yes (add a shape = add a parse path + recompile) |
>
> So the `15` chapter `propose_schema` adding a **new Part role**
> to a type (reusing a known shape): the parser doesn't change
> Rust, doesn't recompile; purely config-driven — `silan schema
> check` only needs to verify the SCHEMA config is legal. But if
> `propose_schema` introduces a **new shape**: that touches the
> closed set; `schema check` must rule "requires engine code
> change" and mark the proposal as not purely-config-landable
> (`15` §15.2 three-way check, §15.2.1 derivation algorithm
> `needs_engine` case).
> The closed sets are type and shape, not role — earlier docs
> didn't make this explicit; pinned here.

### 1.3.2 The three-phase evolution of the multilingual model

> Part==Identity is the foundation. The full AI-native
> multilingual capability lands in three phases. This design is
> **phase one**, but the structure leaves slots for phases two
> and three.

| Phase | What it does | Status |
|---|---|---|
| **One (this release)** | `PartID` decouples identity from filename; `parts/<role>/meta.toml` lands; `canonical_lang` filled | ✅ pinned in this section |
| **Two** | `meta.toml`'s `translation_of` / `source_hash` / `stale` filled + the validation logic — source change auto-marks translation as stale; supports translation invalidation | 🔲 slots reserved (§1.3.1); logic to implement |
| **Three** | Block-level lineage — split Parts into blocks; each block has variants; paragraph-level semantic identity / incremental translation / alignment | 🔲 future; evaluated after phase two stabilises |

> Why not go straight to a block graph: it's too heavy, and phase
> one (identity decoupling) already solves the **immediately
> exploding** problems (rename breaks the chain / "same idea"
> can't be recognised). Phase two solves stale tracking; phase
> three only then touches the paragraph level. Each phase is a
> minimal change, independently acceptable.

## 1.4 Registries — three levels, each managing one layer

> Under `ResourceNamespace`, the four layers are `Collection →
> Item → Part → File` (§1.3). **Each layer's "what children does
> this level have" is recorded by that level's own registry
> file**. Three registry files; responsibilities strictly
> non-overlapping — one tracks "which", the next level tracks
> "what".

| Registry file | On-disk location | Registers — i.e. "lists the **next-level** entries of this level" |
|---|---|---|
| `CollectionManifest` | `content/resources/{type}/.silan-cache` | Inventory of all **Items** in this Collection (slug + order + status) |
| `ItemManifest` | `content/resources/{type}/{item}/.silan-cache` | Inventory of all **Parts** in this Item (role list) + sync metadata |
| `Part`'s `meta.toml` | `content/resources/{type}/{item}/parts/{role}/meta.toml` | **What this individual Part is**: `part_id` (ULID) / `canonical_lang` / language variants (§1.3.1) |

**Responsibility boundary (load-bearing; no overlap)**:

- `ItemManifest` **only lists the Part role inventory** — it answers "which tabs (overview / progress) does this Item have". It **does not touch** Part internals: it doesn't manage `part_id`, doesn't manage languages, doesn't manage Part body.
- `Part`'s `meta.toml` **manages a single Part's identity and languages** — it answers "what is this overview Part's `part_id`, which language is primary, which translations exist". It **does not know** what other Parts the Item has.
- One sentence: `ItemManifest` manages "which Parts exist"; `meta.toml` manages "what this Part is". `File` (`<lang>.md` or `<lang>.toml`, by shape) has no independent registry — it is covered by the language list of its owning `Part`'s `meta.toml`.

**Data structures** (L2 content; each type's fields complete; no mixing):

```rust
pub enum Manifest {
    Collection(CollectionManifest),  // registers every Item in a Collection
    Item(ItemManifest),              // registers every Part in an Item (role inventory only)
}
// A Part's meta.toml is the Part's own metadata, not a kind of Manifest — it
// belongs to the Part object itself (§1.3.1), carried by the PartMeta type.
```

**Who writes each registry file (final ruling; settled)**:

| File | Who writes | Visibility |
|---|---|---|
| `CollectionManifest` (`.silan-cache`) | **Engine-derived** — generated by scanning `content/`; `silan index rebuild` can fully rebuild it. Neither silan nor tools hand-write. | Crate-private constructor |
| `ItemManifest` (`.silan-cache`) | **Engine-derived** — same; generated by scanning the Item directory's Parts. | Crate-private constructor |
| `Part`'s `meta.toml` | **Editable contract** — silan and agents can write / edit it. But `part_id` **can only be generated by `silan init` / `silan add-part` / the offline-rearrange tool**; `index sync` **never implicitly writes `part_id` back** (otherwise sync turns from read-only into an implicit source-of-truth write, `08` §8.2). `canonical_lang` is human-written. | `PartMeta` is `pub`-constructible |

> **Load-bearing invariant**: `.silan-cache` (both Manifests) are
> **derived artefacts** — deletable and rebuildable from
> `content/`; thus in `.gitignore`, not in source-of-truth git
> history. `meta.toml` is **part of the source of truth** (in git)
> because it carries `part_id`, the stable identity. This
> distinction makes the Manifest types crate-private (engine
> exclusively constructs them); `PartMeta` is `pub` (humans and
> agents edit it directly).
>
> This was the `04` milestones "§1.4 TBD" — closed by the final review.

## 1.5 L3 app — ability objects + public/private visibility

L3 is the **behaviour** layer. Each object **explicitly tags
method visibility**. In Rust this is not a comment convention; it
is `pub` / `pub(crate)` / private. Principle: a trait expresses
only the externally stable contract; parsing details stay in each
concrete struct's private `impl`.

**Rust fact**: a Rust trait **has no "private methods"** — every
method on a trait is part of the trait's public contract. So
`extract_*` / `analyze_*` **do not enter the `Parser` trait**;
they are **private `fn`** inside each concrete parser struct
(`BlogParser` etc.)'s `impl` block. The trait exposes only three
contract methods:

```rust
// L3 silan-viking-app — «trait» Parser, only the stable public face
pub trait Parser {
    fn content_type(&self) -> ContentKind;
    fn parse(&self, item: &Item) -> Result<Parsed, ParseError>;   // sole entry point
    fn validate(&self, parsed: &Parsed) -> Vec<Issue>;            // validation lives here
}

// Implementation details of each concrete parser are private fns on the struct
// — they are not on the trait.
struct BlogParser { /* ... */ }
impl BlogParser {
    fn extract_sections(&self, body: &str) -> Sections { /* private */ }
    fn content_hash(&self, file: &File) -> ContentHash { /* private */ }
    // extract_* / analyze_* / *_hash: all struct-private fns
}
impl Parser for BlogParser { /* only the three contract methods */ }
```

| L3 object | Role | public methods | Private |
|---|---|---|---|
| `«trait» Parser` | Parse-strategy interface | `content_type` / `parse` / `validate` | — (traits have no private methods) |
| Concrete parser struct (`BlogParser` etc.) | Concrete type's parse strategy | impl `Parser`'s three methods | private `fn`s `extract_*` / `analyze_*` / `*_hash` etc. |
| `ParserRegistry` | Parser strategy set | `get(kind) -> Result<&dyn Parser, ParseError>` / `parser_for(item)` | Compile-time closed-set dispatch; no runtime registration |
| `Parsed` | Parser output | Field-only read getters | Constructed by `Parser`; cannot be built externally |
| `«trait» Mapper` | Sync mapping strategy | `content_type` / `map(&Parsed) -> RowSet` | Internal helpers private |
| `MapperRegistry` | Mapper strategy set | `get(kind) -> Result<&dyn Mapper, MapError>` / `mapper_for(parsed)` | Isomorphic to ParserRegistry; compile-time closed-set dispatch |
| `«trait» Sink` | DB-write port | `write(&RowSet)` / `write_batch(RowSetBatch)` | Per-impl internals |
| `SqliteSink` | — | `write` | SQL statements, connection |
| `«trait» Embedder` | — | `embed(&str)` | Model / HTTP details; not on the M5/M6 parser/sync main path |
| `Workspace` (aggregate root) | — | `scan` / `sync` / `query` / `propose` / `publish` | Holds `namespaces: Vec<Box<dyn Namespace>>` (each Namespace then holds Collections) + `relations`; fields not `pub` (construction via `open()`); `canonicalize_relations` is private (§1.8.2) |

### 1.5.Q `Workspace::query` / `Embedder` minimum implementation contract

`recall(query)` needs semantic search, but it must not drag the
M5/M6 parser/sync main line into model selection. Therefore the
query capability is implemented in two layers, and the default
implementation is nailed to SQLite FTS5; it is not left to
implementer choice:

1. **Before M6**: `Workspace::query` provides only structured query (`list` / `read` / field filters); it does not promise semantic similarity.
2. **M7 delivery**: add `QueryIndex` + `Embedder`. The default impl is **SQLite FTS5 lexical index + `NullEmbedder`** — offline-runnable and test-deterministic; an optional `ApiEmbedder` is opt-in via config and is not a default dependency. M7 introduces no new runtime dependencies like Tantivy, Qdrant, LanceDB.

```rust
pub trait Embedder {
    fn embed(&self, text: &str) -> Result<Vec<f32>, QueryError>;
}

pub struct QueryHit {
    pub uri: SilanUri,
    pub title: String,
    pub summary: String,
    pub score: f32,
    pub matched_parts: Vec<String>,
}
```

#### QueryIndex tables and indexed content

`QueryIndex` is a service object in the `silan-viking-app::query`
module; the underlying store reuses `portfolio.db`. M7 adds two
derived query tables, rebuilt / incrementally updated by `sync`:

```sql
CREATE VIRTUAL TABLE query_fts USING fts5(
  uri UNINDEXED,
  kind UNINDEXED,
  title,
  tags,
  headings,
  body,
  status UNINDEXED,
  visibility UNINDEXED,
  updated_at UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TABLE query_embedding (
  uri TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vector BLOB NOT NULL
);
```

- `query_fts.uri` points to an Item or Part URI; Part granularity is preferred, with the Item-level summary as fallback.
- `title` comes from Item title + Part title; `tags` from frontmatter / tag relation; `headings` from markdown headings; `body` is the plain text after stripping frontmatter.
- A single `body` row is truncated to 20k characters to keep one long article from overwhelming FTS; the full content is still read via `read(uri)`.
- `query_embedding` is **optional**. By default, no vectors are written; only when `ApiEmbedder` is enabled does it get written. `vector` is a little-endian `f32` array BLOB; `dim` validates the dimension.

`Workspace::query`'s ranking rule:

1. Query FTS5 first: the BM25 scores on `title/tags/headings/body` are the lexical score. Fixed weighting: title hits ×3, tags ×2, headings ×1.5, body ×1.
2. If an `Embedder` is configured and available, query `query_embedding` for cosine top-N.
3. Fusion uses RRF (reciprocal rank fusion): `1/(60 + lexical_rank)` + `1/(60 + vector_rank)`; without a vector, only the lexical rank is used.
4. If `Embedder` is unavailable or returns an error, degrade to lexical-only and record `embedder="fallback"` on the span; do not let `recall` go down because of model / network failure.
5. The `scope` filter precedes ranking; only the `silan://resources/...` and `silan://agent/...` namespaces are allowed; an unknown namespace returns `invalid_request`.

#### The experience boundary between lexical fallback and semantic recall

M7's default `NullEmbedder` only guarantees **lexical fallback is
usable**; "semantic memory" is not complete. Implementers must
write the capability boundary in three lines:

- Lexical fallback acceptance covers only keyword / title / tag / heading / body-snippet hits. It can answer "where is my old Kubernetes note?", not reliably "did I think this same thing in different words?".
- The end-state experience "a few days later he mentions it; the agent knows it isn't new" depends on a usable `Embedder`. Without `ApiEmbedder` or a future `LocalEmbedder`, the agent can only stumble onto old Items via keywords.
- `Embedder` is an optional adapter, but **it is not a premium-feature optional**. The product positioning must say: offline default = deterministic, testable, keyword recall; semantic memory = enabled when an Embedder is configured.

Acceptance boundary: semantic-recall quality is not in M5/M6; M7
only requires that the known queries in `05` hit the expected
Item, and that they pass in an offline environment too. Switching
to a real local or remote model is a replaceable adapter; it does
not change `Workspace::query` or the MCP `recall` JSON contract
(`03` §3.2). M7 acceptance reports must explicitly state whether
the run uses `NullEmbedder`, `ApiEmbedder`, or `LocalEmbedder`, to
avoid mislabelling lexical fallback as semantic recall.

**General public/private rule** (apply when judging new methods):
- **public** ⟺ a contract others (adapters, callers) depend on. Changing it = breaking compatibility.
- **`pub(crate)`** ⟺ another module in the same crate needs it, but the end user must not see it.
- **private** ⟺ extraction / computation / analysis / IO details. Swapping the impl shouldn't disturb anyone.
- State structs have **no `pub` fields**; construction goes through a constructor / `open()`; dependencies are injected by parameter.

### 1.5.0 Assembly layer — Registry / kind decision / `Parsed` construction boundary

> This section adds how the machine wires itself, not how a parser
> extracts fields internally. Design goals: **closed-set, explicit,
> testable, no lifetime tricks**. The 6 content types are M0
> SCHEMA's closed set; Parts are configurable, but Parser/Mapper
> type dispatch is not runtime-extensible.

#### Where `ContentKind` comes from

`ContentKind` is not guessed by the parser, nor read from a file
by the registry. The decision happens in `Workspace::scan`:

1. `scan` traverses `content/resources/{type}/{item}/`.
2. The `{type}` directory name resolves to `ContentKind`. This is the primary dispatch source.
3. When `Item` is built, the private field `kind: ContentKind` is set; externally only `item.kind()` can read it.
4. The `kind` in frontmatter is a redundant self-check field: if present and inconsistent with the directory kind, the parser reports `fatal: kind_mismatch`; if missing, errors per SCHEMA required rules.

```rust
// silan-viking-content
pub struct Item {
    id: ItemId,
    kind: ContentKind,
    slug: Slug,
    parts: Vec<Part>,
}

impl Item {
    pub fn kind(&self) -> ContentKind { self.kind }
    pub fn parts(&self) -> &[Part] { &self.parts }
}
```

This chain keeps `ParserRegistry` as a pure dispatch object — it
doesn't touch disk, doesn't read frontmatter, doesn't carry schema
validation.

#### Final form of `ParserRegistry`

`ParserRegistry` is an ordinary struct in `silan-viking-app`, not
a trait. It does not provide runtime `register()`. Reason: content
types are a closed set; runtime registration would push errors
from compile time to run time and introduce meaningless
`Box<dyn Parser>` lifetime juggling.

```rust
// silan-viking-app/src/parser/registry.rs
pub struct ParserRegistry {
    idea: IdeaParser,
    blog: BlogParser,
    project: ProjectParser,
    episode: EpisodeParser,
    resume: ResumeParser,
    update: UpdateParser,
}

impl ParserRegistry {
    pub fn new() -> Self {
        Self {
            idea: IdeaParser::default(),
            blog: BlogParser::default(),
            project: ProjectParser::default(),
            episode: EpisodeParser::default(),
            resume: ResumeParser::default(),
            update: UpdateParser::default(),
        }
    }

    pub fn get(&self, kind: ContentKind) -> Result<&dyn Parser, ParseError> {
        Ok(match kind {
            ContentKind::Idea => &self.idea,
            ContentKind::Blog => &self.blog,
            ContentKind::Project => &self.project,
            ContentKind::Episode => &self.episode,
            ContentKind::Resume => &self.resume,
            ContentKind::Update => &self.update,
        })
    }

    pub fn parser_for(&self, item: &Item) -> Result<&dyn Parser, ParseError> {
        self.get(item.kind())
    }
}
```

Missing parsers don't panic. If `ContentKind` later gains a
variant and the registry isn't updated, Rust's match-exhaustiveness
makes compilation fail; if an unknown type directory is read from
disk, the error happens in `Workspace::scan`'s
`ContentKind::try_from_dir_name`, returning
`ScanError::UnknownContentKind`.

#### `Parsed` can only be produced by the parser builder

`Parsed` is the immutable output of a parser, not a DTO anyone in
the crate can assemble. Final rules:

- `Parsed`'s fields are all private; only getters externally.
- `Parsed::builder(...)` and the builder's mutators are visible only inside `crate::parser`.
- Concrete parsers use the builder; `finish()` runs invariant checks once and returns `Parsed`.
- Mappers can only read `Parsed`; they cannot fill fields or modify the parser's output.

```rust
// silan-viking-app/src/parser/parsed.rs
pub struct Parsed {
    kind: ContentKind,
    item_id: ItemId,
    main: LangNeutral,
    langs: BTreeMap<Lang, LangVariant>,
    relations: Vec<RelationDecl>,
}

impl Parsed {
    pub fn kind(&self) -> ContentKind { self.kind }
    pub fn item_id(&self) -> ItemId { self.item_id }
    pub fn main(&self) -> &LangNeutral { &self.main }
    pub fn langs(&self) -> &BTreeMap<Lang, LangVariant> { &self.langs }
    pub fn relations(&self) -> &[RelationDecl] { &self.relations }

    pub(in crate::parser) fn builder(kind: ContentKind, item_id: ItemId) -> ParsedBuilder {
        ParsedBuilder::new(kind, item_id)
    }
}

pub(in crate::parser) struct ParsedBuilder { /* private fields */ }

impl ParsedBuilder {
    pub(in crate::parser) fn put_main(&mut self, key: FieldKey, value: FieldValue);
    pub(in crate::parser) fn put_text(&mut self, lang: Lang, role: PartRole, body: String);
    pub(in crate::parser) fn put_entry(&mut self, lang: Lang, role: PartRole, entry: PartEntry);
    pub(in crate::parser) fn push_relation(&mut self, relation: RelationDecl);
    pub(in crate::parser) fn finish(self) -> Result<Parsed, ParseError>;
}
```

This is cleaner than `Parsed::new` + a string of public `add_*`:
mutable during construction, read-only as a product. The
encapsulation boundary is enforced by Rust module visibility, not
by a comment promise.

#### `MapperRegistry` is isomorphic to ParserRegistry

Mapper is the second strategy family after parser; it too must do
closed-set dispatch. Don't make `Workspace::sync` write
`match kind` twice, and don't make each adapter pick a mapper.

```rust
pub trait Mapper {
    fn content_type(&self) -> ContentKind;
    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError>;
}

pub struct MapperRegistry {
    idea: IdeaMapper,
    blog: BlogMapper,
    project: ProjectMapper,
    episode: EpisodeMapper,
    resume: ResumeMapper,
    update: UpdateMapper,
}

impl MapperRegistry {
    pub fn mapper_for(&self, parsed: &Parsed) -> Result<&dyn Mapper, MapError> {
        self.get(parsed.kind())
    }

    pub fn get(&self, kind: ContentKind) -> Result<&dyn Mapper, MapError> {
        Ok(match kind {
            ContentKind::Idea => &self.idea,
            ContentKind::Blog => &self.blog,
            ContentKind::Project => &self.project,
            ContentKind::Episode => &self.episode,
            ContentKind::Resume => &self.resume,
            ContentKind::Update => &self.update,
        })
    }
}
```

ParserRegistry and MapperRegistry are not merged into a single
giant `PipelineRegistry`: parser belongs to "content file →
Parsed"; mapper belongs to "Parsed → RowSet". Keeping two small
registries, orchestrated by `Workspace`, is clearer than cramming
two stages into one big object.

#### `Workspace` holds the assembled services

`Workspace::open()` is the dependency-assembly point. Adapters do
not new parser / mapper directly.

```rust
pub struct Workspace {
    root: WorkspaceRoot,
    schema: Schema,
    parsers: ParserRegistry,
    mappers: MapperRegistry,
    sink: Box<dyn Sink>,
}

impl Workspace {
    pub fn sync(&self) -> Result<SyncReport, SyncError> {
        let items = self.scan()?;
        let mut batch = RowSetBatch::new();

        for item in items {
            let parser = self.parsers.parser_for(&item)?;
            debug_assert_eq!(parser.content_type(), item.kind());

            let parsed = parser.parse(&item)?;
            let issues = parser.validate(&parsed);
            IssuePolicy::fatal_errors_abort(&issues)?;

            let mapper = self.mappers.mapper_for(&parsed)?;
            debug_assert_eq!(mapper.content_type(), parsed.kind());

            batch.push(mapper.map(&parsed)?);
        }

        self.sink.write_batch(batch)
    }
}
```

This main chain is the M5/M6 acceptance target: `scan -> item.kind
-> parser_for -> parse -> validate -> mapper_for -> map -> sink`.
Missing any one link is "parser/sync design not done".

#### Type-ownership table

| Type | crate / module | Visibility | Notes |
|---|---|---|---|
| `ContentKind` | `silan-viking-content` | `pub` | Closed enum: Blog/Project/Idea/Episode/Resume/Update |
| `Item` / `Part` / `File` | `silan-viking-content` | `pub`, fields private | Data objects; `Item` holds `kind`; `Part` holds `PartShape` |
| `PartShape` | `silan-viking-content` | `pub` | `Prose` / `EntryList` / `KeyValueList`; don't name it bare `Shape` |
| `Parser` / `ParserRegistry` | `silan-viking-app::parser` | `pub` | Parse strategy + closed-set dispatch |
| `Parsed` | `silan-viking-app::parser` | `pub`, read-only | Parser output; the builder is visible only to the parser module |
| `ParsedBuilder` | `silan-viking-app::parser` | `pub(in crate::parser)` | Mutable construction object |
| `PartEntry` | `silan-viking-app::parser` | `pub` getter | Schema-validated entry payload |
| `Issue` / `ParseError` | `silan-viking-app::parser` | `pub` | Parser errors and warnings |
| `Mapper` / `MapperRegistry` | `silan-viking-app::sync` | `pub` | Mapping strategy + closed-set dispatch |
| `RowSet` / `RowSetBatch` | `silan-viking-app::sync` | `pub` getter | Row collection to write; no IO |
| `Sink` / `SqliteSink` | `silan-viking-app::sync` | `pub` | The sole DB-write face |
| `Embedder` | `silan-viking-app::query` | `pub` | Semantic-recall service; not on the M5/M6 parser/sync main path |

### 1.5.1 Validation slice — `ResumeParser` (verify the design with one real parser)

> A design can't stop at abstractions. This section drives the
> `resume` type through end-to-end — turning the abstract `Parser`
> into a concrete impl, **verifying that §1.3 `Part` / §1.5
> public/private / §1.8 `Mapper` truly land**. This slice only
> verifies Rust/OOP shape: closed registry, `Item.kind()`
> dispatch, parser-only builder, mapper-only RowSet. It does not
> inherit the legacy Python parser's method shapes.

> **resume is NOT a single body Part** (final ruling; see 10
> §10.4.5 and 10 §10.1.1 ledger #2). resume is **a single Item +
> multiple Parts**, config-driven: each Part has a `shape` —
> `prose` (free markdown, e.g. `summary`) / `entry_list` (a set
> of homogeneous entries, e.g. education / experience /
> publications / awards / research) / `key_value_list` (skills).
> A `prose` Part's source file is `parts/<role>/<lang>.md`; an
> `entry_list` Part's source file is `parts/<role>/<lang>.toml`
> (TOML array-of-tables; each entry has a stable anchor
> `entry_id = e_<ulid>`). Structured Parts **do not** get a
> dedicated ent table per Part — they land in the generic
> `part_entry` / `part_entry_translation` (see §1.10).

**Rust shape — `ResumeParser` implements the `Parser` trait**:

```rust
// silan-viking-app/src/parser/resume.rs
use silan_viking_content::{ContentKind, Item, PartShape};

/// resume's parser. resume is a single Item + multiple Parts — each Part has a
/// `shape` (prose / entry_list / key_value_list; see §1.3.1 and 10 §10.4.5).
/// A `prose` Part parses markdown body; an `entry_list` Part parses TOML entries.
pub struct ResumeParser;

impl Parser for ResumeParser {
    // ── public contract 1/3: always returns resume ──
    fn content_type(&self) -> ContentKind {
        ContentKind::Resume
    }

    // ── public contract 2/3: sole parse entry point ──
    // resume is multi-Part: iterate each Part and parse per its shape.
    // prose Parts read each language's <lang>.md; entry_list Parts read each
    // language's <lang>.toml (TOML array-of-tables).
    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        if item.kind() != ContentKind::Resume {
            return Err(ParseError::KindMismatch {
                expected: ContentKind::Resume,
                actual: item.kind(),
            });
        }

        let mut p = Parsed::builder(ContentKind::Resume, item.id());
        for part in item.parts() {                    // summary / education / …
            match part.shape() {
                // prose: markdown body (same as blog body)
                PartShape::Prose => {
                    for file in part.files() {        // parts/summary/<lang>.md
                        p.put_text(file.lang(), part.role(), file.content().to_owned());
                    }
                }
                // entry_list: TOML array-of-tables; produce schema-validated entries
                // (with entry_id) after validating against SCHEMA's entry_fields
                PartShape::EntryList => {
                    for file in part.files() {        // parts/education/<lang>.toml
                        let entries = self.parse_entries(part.role(), file)?;
                        for entry in entries {
                            p.put_entry(file.lang(), part.role(), entry);
                        }
                    }
                }
                // key_value_list: TOML top-level category key -> list<string>; skills-only
                PartShape::KeyValueList => {
                    for file in part.files() {        // parts/skills/<lang>.toml
                        let entries = self.parse_key_values(part.role(), file)?;
                        for entry in entries {
                            p.put_entry(file.lang(), part.role(), entry);
                        }
                    }
                }
            }
        }
        // resume's top-level personal info (full_name / email / …) is a single
        // record; it is extracted into `main` from the canonical_lang file;
        // same-named main fields in non-canonical languages only warn — they
        // do not win.
        self.extract_personal_info(item, &mut p)?;
        p.finish()
    }

    // ── public contract 3/3: validate ──
    fn validate(&self, parsed: &Parsed) -> Vec<Issue> {
        let mut issues = Vec::new();
        // personal info of the main-language variant
        let main = parsed.main();
        if main.get("personal.full_name").is_none() {
            issues.push(Issue::error("resume missing full_name"));
        }
        if main.get("personal.email").is_none() {
            issues.push(Issue::warn("resume missing email"));
        }
        // education + experience date-range validity
        for edu in parsed.entries(PartRole::new("education")) {
            if let (Some(s), Some(e)) = (edu.start_date(), edu.end_date()) {
                if s > e { issues.push(Issue::error(format!(
                    "education date range invalid: {}", edu.institution()))); }
            }
        }
        for xp in parsed.entries(PartRole::new("experience")) {
            if let (Some(s), Some(e)) = (xp.start_date(), xp.end_date()) {
                if s > e { issues.push(Issue::error(format!(
                    "experience date range invalid: {}", xp.company()))); }
            }
        }
        issues
    }
}

// ── private fns: implementation details; not on the trait (§1.5) ──
impl ResumeParser {
    fn extract_personal_info(&self, item: &Item, out: &mut ParsedBuilder)
        -> Result<(), ParseError> { /* parse name / email / title / avatar into main */ }
    // parse_entries: parses an entry_list Part's TOML entries; validates against
    //   SCHEMA's entry_fields for that Part; reports entry_field_violation on violations.
    fn parse_entries(&self, role: &str, file: &File)
        -> Result<Vec<PartEntry>, ParseError> { /* parse TOML array-of-tables */ }
    fn parse_key_values(&self, role: &str, file: &File)
        -> Result<Vec<PartEntry>, ParseError> { /* parse TOML key -> list<string> */ }
}
```

**`ResumeMapper` — `Parsed` → `RowSet` (§1.8)**: resume's
top-level personal info lands in ent's `personal_info`
(+translation); the `prose` Part (summary) lands in `item_part`
(+translation); the `entry_list` / `key_value_list` Parts
(education / experience / publications / awards / research /
skills) **all land in the generic `part_entry`
(+`part_entry_translation`)** entries — **no dedicated ent tables
per Part** (final ruling; see 10 §10.4.5, §1.10).
`ResumeMapper::map(&Parsed) -> RowSet` is a pure function; `Sink`
does the DB write.

```rust
// silan-viking-app/src/sync/resume.rs
pub struct ResumeMapper;

impl Mapper for ResumeMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Resume
    }

    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError> {
        if parsed.kind() != ContentKind::Resume {
            return Err(MapError::KindMismatch {
                expected: ContentKind::Resume,
                actual: parsed.kind(),
            });
        }

        let mut rows = RowSet::for_item(parsed.kind(), parsed.item_id());

        rows.push_personal_info(self.personal_info_row(parsed.main())?);

        for (lang, variant) in parsed.langs() {
            rows.push_personal_info_translation(
                self.personal_info_translation_row(*lang, variant)?,
            );
            rows.extend_item_part_translations(
                self.prose_part_rows(*lang, variant)?,
            );
            rows.extend_part_entry_translations(
                self.entry_translation_rows(*lang, variant)?,
            );
        }

        rows.extend_item_parts(self.item_part_identity_rows(parsed)?);
        rows.extend_part_entries(self.entry_identity_rows(parsed)?);
        rows.extend_relations(self.relation_rows(parsed.relations())?);
        Ok(rows)
    }
}

impl ResumeMapper {
    fn personal_info_row(&self, main: &LangNeutral) -> Result<PersonalInfoRow, MapError> { /* ... */ }
    fn item_part_identity_rows(&self, parsed: &Parsed) -> Result<Vec<ItemPartRow>, MapError> { /* ... */ }
    fn entry_identity_rows(&self, parsed: &Parsed) -> Result<Vec<PartEntryRow>, MapError> { /* ... */ }
    fn prose_part_rows(&self, lang: Lang, variant: &LangVariant) -> Result<Vec<ItemPartTranslationRow>, MapError> { /* ... */ }
    fn entry_translation_rows(&self, lang: Lang, variant: &LangVariant) -> Result<Vec<PartEntryTranslationRow>, MapError> { /* ... */ }
}
```

Mapper does not amend parser output and does not do IO. Every
helper is a private fn; the public face is only `content_type` /
`map`. This matches Parser's public/private split.

> **This slice verifies five things**: ① `ParserRegistry`
> dispatches by `Item.kind()`'s closed set; no runtime
> registration needed. ② Three contract methods on `Parser`
> suffice — resume needs no fourth public method. ③ Private
> implementation details are private fns on `impl ResumeParser`;
> they do not pollute the trait (the §1.5 public/private split
> holds). ④ resume is a **single Item + multi-Part** type; the
> `Part` model (§1.3) applies uniformly to multi-Part; the Part's
> `shape` (prose / entry_list / key_value_list) is config-driven
> by SCHEMA — adding a structured Part needs no Rust change and
> no ent table. ⑤ `parse` traverses the multilingual `File`s
> under each `Part`; the parser-only builder produces a read-only
> `Parsed`; `ResumeMapper` purely maps it into `RowSet` —
> `Part` (role) and `File` (language) as two dimensions actually
> run end-to-end in this slice; no language is lost.

> The matching resume scenario tests live in `05-testing.md` §5.3 — `resume_parse_full` / `resume_missing_full_name` / `resume_invalid_date_range`, etc.

## 1.6 Aggregate root, dependency direction, three faces

```
   L4  CliAdapter      McpAdapter      SiteProjector
        (#8)            (#10 #12)       (#11 #12)
          └───────────────┼────────────────┘
                          ▼  call the same methods; no parallel logic
   L3            ┌──────────────────┐
                 │    Workspace     │  Aggregate root = one content/ repo; the sole outward entry
                 │  scan/sync/query │
                 │  propose/publish │
                 └────────┬─────────┘
                          ▼ depend on trait ports (dependency inversion)
                 Parser / Mapper / Sink / Embedder
   L2                     ▼ operate on
                 Collection / Item / File / Relation   (pure data)
   L1                     ▼ compose / impl
                 SilanUri / Meta / Identified …        (pure utility)
```

- Dependencies **strictly downward**. L1 base depends on no crate; L2 depends only on L1; and so on.
- The three adapters (L4) call the same `Workspace` — CLI for silan, MCP for collaborating agents, SiteProjector projecting to the website. This is where the three-sentence end-state lands.

### 1.6.1 `SiteProjector` and crawler artefacts (serves #14)

`SiteProjector` (L4 `silan-viking-site`) projects
`visibility=public` Items into site content. #14 requires:
**generate crawler-visibility artefacts at projection time**.
`SiteProjector` internally holds a `SeoEmitter` that runs on
`silan site build` / `deploy`:

| Artefact | `SeoEmitter` sub-role | Data source |
|---|---|---|
| `sitemap.xml` | List every public-page URL + `lastmod` | The public Items the Workspace queries + each's `updated_at` |
| `robots.txt` | Crawler rules + sitemap pointer | Fixed template |
| JSON-LD | Embed schema.org structured data per page (`BlogPosting` / `Person` / `CreativeWork`) | The Item's `kind` + metadata |
| Pre-rendered HTML | One static HTML snapshot per public page (SPA crawler visibility) | Frontend build artefact + Item content |
| Per-page meta | `<title>` / `<meta description>` / OG / Twitter Card | The Item's L0/L1 summary (`tldr` / `summary`) |

Design points:
- `SeoEmitter` is `SiteProjector`'s **private collaborator**; not a standalone adapter — crawler artefacts are part of "projection", not a separate outward face.
- It only **reads** `Workspace` (queries public Items); it does **not** write the source of truth and does **not** write the database — every artefact lands in the `_deploy/` static directory. Per §1.1, this is L4.
- The trigger points are in `02-cli-service.md`'s `silan site build` / `deploy` (the #14 timing).
- Pre-rendered HTML depends on the frontend build artefact; `SeoEmitter` runs after the frontend `build` — the timing is orchestrated by the `silan site` build pipeline.

## 1.7 Single-tenant and visibility (serves #13)

No user_id; no tenant isolation; no permission matrix. Visibility control has **two layers**:

**First layer — namespace-level `is_publishable()`** (§1.2.1):
- `AgentNamespace` (`silan://agent/`) `is_publishable() == false` — the entire namespace is **unreachable** in `SiteProjector`'s projection logic; agent context never reaches the website.
- `ResourceNamespace` (`silan://resources/`) `is_publishable() == true` — content under it **can** be projected, but whether it is depends on the second layer.

**Second layer — Item-level `visibility`** (an L2 field; meaningful
only inside `resources/`): `private` (default) / `unlisted` /
`public` (final ruling; see 10 §10.3, 10 §10.1.1 ledger #5: drop
`is_public`; uniformly use the `visibility` enum). **Only the
content owner, via `Workspace::publish`, explicitly sets
`public`; only then does `SiteProjector` project the Item** —
agents have no such ability.

Together: the namespace level blocks `agent/` outright (never
published); inside `resources/`, the Item's `visibility` chooses
selective publication. This is "selective deploy"'s "selective"
(#11); it also guarantees that not a word of the agent's private
context leaks out.

## 1.8 Persistence-mapping layer — `Parsed` → database

> This layer is the parser/sync structural boundary: `Parser` only
> produces domain parse results; `Mapper` is the pure mapping from
> result to row-set; `Sink` is the sole IO face.

The Rust side uses an ORM (**`sea-orm`** is selected — async,
plays well with SQLite, lighter compile-time burden than
`diesel`). The chain from `Parser → Sink` is complete, not a
one-liner:

```
L3 app:  Parser ──▶ Parsed ──▶ «trait» Mapper ──▶ RowSet ──▶ «trait» Sink ──▶ portfolio.db
         (parse)   (output)    (output → rows;     (ORM rows)  (write; sole IO)
                               pure function)
                                    │ 6 impls
                       Blog/Project/Idea/Episode/Update/Resume Mapper
```

### 1.8.0 `Parsed` — main + multilingual variants (load-bearing)

> Earlier, `Parsed` was treated as "the result of parsing one
> File", causing the slice's `parse()` to take only one
> `primary_file()` and evaporate half the bilingual content
> (review R1). Root cause: `Parsed` hadn't thought through how to
> carry multilingual. This section pins it from the root.

**First-principles basis**: `portfolio.db`'s ent schema already
gave the standard answer for multilingual — **main tables store
language-agnostic structure; 18 `*_translations` tables store
each language's text by `language_code`** (`blog_posts` +
`blog_post_translations`; `personal_info` +
`personal_info_translations`; …). `Parsed` must **mirror this**:

```rust
// silan-viking-app/src/parsed.rs
pub struct Parsed {
    kind: ContentKind,
    main: LangNeutral,                  // language-agnostic: slug / date / tags /
                                        //   FK / numbers / status …
    langs: BTreeMap<Lang, LangVariant>, // one variant per language
}

pub struct LangVariant {               // all the text of one language
    // title / each text block (resume's 8 blocks; blog body; idea per-Part body …)
}
```

- `Parser::parse` **no longer takes one `File`**; it takes the whole content Item: it iterates **every language `File`** under each `Part` (§1.3 Part×Lang), extracts `main` from any one language (language-agnostic fields), and produces a `LangVariant` per language.
- `Mapper` maps naturally: `main` → main-table row; **each entry of `langs` → one `*_translation` row**. N languages = N translation rows.
- This closes R1 (no language is lost), the root of R2 (`parse` already iterates multilingual), and lets `ResumeMapper`'s "produces translation rows" description **have data to produce**.

> Invariant: `Parsed.langs` contains at least one language (the
> primary). `main`'s language-agnostic fields are read only from
> `canonical_lang` (§1.3.1 / 10 §10.3). If the parser sees a
> non-canonical language file writing `slug` / `date` etc. main
> fields, it ignores them and reports
> `warn: main_field_lang_mismatch`; no cross-language "who wins"
> arbitration.

| L3 object | Responsibility |
|---|---|
| `«trait» Mapper` | `map(&Parsed) -> RowSet` — one parse output → several ORM rows |
| 6 `Mapper` impls | Each knows its own tables (blog → `blog_posts` + `blog_post_translations` + …; update → `recent_updates` + translation) |
| `Parsed` | Parse output = `main` (language-agnostic) + `langs` (multilingual variants); see §1.8.0 |
| `RowSet` | The full row collection for one parse output (main table + N translation rows + tags + …) |
| `entities` (sea-orm Entity) | ent table's Rust ORM definition (see §1.10 source of truth) |
| `«trait» Sink` | `write(&RowSet)` — transactionally write the RowSet to the db |
| `SqliteSink` | The sea-orm impl of `Sink` |

**Why the `Mapper` layer is needed**: `Parsed` (§1.8.0) is the
parser-output shape (main + multilingual variants); `RowSet` is
the database-table shape. A single blog `Parsed` must split into
4+ tables (main table + one translation row per language + tags …).
This "one-to-many table split" is domain mapping logic; it must be
an explicit object. `Mapper` is pure (no IO); `Sink` is pure IO.

### 1.8.1 The relation-write path (fixing a self-contradiction)

> An earlier version said "`Workspace` writes `content_relation`
> directly", violating "`Sink` is the sole DB writer" layering.
> Earlier had this contradiction; corrected as follows:

`Relation` is also a kind of row. The chain keeps `Sink` as the sole DB writer; `Workspace` doesn't touch IO:

- `RowSet` gains a field `relations: Vec<ContentRelationRow>`.
- Each `Parser` parses the `relations` declared in the Item's frontmatter into `Parsed`.
- `Workspace::sync` is responsible for **collecting** relation declarations scattered across `Parsed`s and consolidating them into the corresponding `RowSet` (in-memory; no IO).
- **Writes still go through `Sink::write(&RowSet)`** — the `relations` field and the main-table rows land in `content_relation` inside the same transaction.

Responsibilities: `Parser` parses; `Workspace` collects and consolidates; `Sink` writes. `Workspace` doesn't touch IO.

### 1.8.2 Relation canonicalisation

> Review pointed out: a directed edge is declared by both ends —
> `idea-A`'s frontmatter writes `evolved-into: blog-B`, and
> `blog-B` simultaneously writes `evolved-from: idea-A`. This is
> one physical edge; a human declaring it on both sides is
> **desirable for readability**. But `Workspace` collects two
> `ContentRelationRow` rows for the same edge, hits the `UNIQUE
> INDEX`, and `silan index sync` fails outright.

**Architectural decision: take canonicalisation and consolidate; do not take INSERT OR IGNORE.**

First-principles reason: an edge is physically one. Storing two
rows = letting "one edge" have two truths. INSERT OR IGNORE uses
database tolerance to paper over a semantic error — the cover
eventually leaks elsewhere (e.g. `silan relation graph` exports
will show duplicate edges). Canonicalisation pins "an edge has
exactly one representation" at the collection layer; the table is
always clean.

The rule lands in `Workspace::sync`'s collection step (in-memory; no IO):

1. **Direction canonicalisation**: paired `relation_type` values
   share one canonical direction — `evolved-from` is always flipped
   into the reverse of `evolved-into`; `documents` stays
   unidirectional (it is one-way already); `part-of` stays
   unidirectional. After canonicalisation, the table only stores
   the canonical direction.
2. **Reverse queries** use the `INDEX(to_type, to_id)` from §1.10 revision A — no reverse rows stored.
3. **Dedup**: after canonicalisation, multiple declarations of the same `(from, to, relation_type)` merge into one (first occurrence wins; non-default `sort_order` etc. attached fields take priority).
4. The canonical-direction table is fixed in this chapter's appendix beyond M0 open items. Paired `relation_type`s: `evolved-into ↔ evolved-from`; `supersedes` (one-way); `documents` (one-way); `references` (one-way); `part-of` (one-way).

> Landing site: a private fn `canonicalize_relations(&mut RowSet)`
> on `Workspace`, called after collection and before handing off
> to `Sink`. `Sink` only ever sees the deduped canonical edges.

Implementation-grade pseudo-code:

```rust
fn canonicalize_relations(rows: Vec<ContentRelationRow>) -> Vec<ContentRelationRow> {
    let mut by_key = BTreeMap::<RelationKey, ContentRelationRow>::new();

    for row in rows {
        let canonical = match row.relation_type {
            RelationType::EvolvedFrom => row.reversed(RelationType::EvolvedInto),
            other => row.with_type(other.canonical()),
        };

        let key = RelationKey {
            from_type: canonical.from_type,
            from_id: canonical.from_id.clone(),
            to_type: canonical.to_type,
            to_id: canonical.to_id.clone(),
            relation_type: canonical.relation_type,
        };

        by_key
            .entry(key)
            .and_modify(|existing| existing.merge_metadata_from(&canonical))
            .or_insert(canonical);
    }

    by_key.into_values().collect()
}
```

`merge_metadata_from` can only merge non-semantic fields:

- `sort_order`: both sides have non-default values and differ → a `warn` issue; pick the smaller to keep stability.
- `source_uri`: keep the declaration-source list; used by lint to flag "this relation is declared on both sides".
- `confidence` / `note`: a non-empty value wins; conflict on both sides → a `warn` issue; sync is not blocked.

This way canonicalisation doesn't swallow structural errors:
endpoints missing, illegal type, cross-namespace relations
disallowed — still reported as `fatal` by `Parser::validate` /
the relation validator.

## 1.9 Code-directory layout — four layers map 1:1 onto 7 member crates

> **Crate count (pinned to avoid M1 scaffold errors)**: `engine/`
> is a Cargo **workspace**; the workspace root
> (`engine/Cargo.toml`) is itself **not** a crate; under it are
> the **7 member crates** (base / content / entities / app / cli
> / mcp / site). Throughout the doc we say "7 member crates +
> workspace root", not "8 crates".

```
engine/                              # peer to backend/ and frontend/; a new folder
├── Cargo.toml                       # workspace root (not a crate); contains 7 member crates
├── rust-toolchain.toml
└── crates/
    ├── silan-viking-base/           # ── L1: pure utility; zero silan-viking dep ──
    │   └── src/{lib, uri, meta, hash, lang, slug, traits}.rs
    │
    ├── silan-viking-content/        # ── L2: domain data; depends only on base ──
    │   └── src/{lib, collection, item, file, manifest, relation, series, anthology}.rs
    │
    ├── silan-viking-entities/       # ── L2.5: sea-orm Entity = reverse-generated from ent ──
    │   └── src/{lib, blog, project, idea, resume, relation, ...}.rs
    │
    ├── silan-viking-app/            # ── L3: behaviour; depends on base + content + entities ──
    │   └── src/
    │       ├── {lib, workspace, parsed, rowset, query}.rs
    │       ├── parser/{mod, blog, project, idea, episode, update, resume}.rs
    │       ├── mapper/{mod, blog, project, idea, episode, update, resume}.rs
    │       ├── sink/{mod, sqlite}.rs
    │       └── embed/{mod, api, null}.rs
    │
    ├── silan-viking-cli/            # ── L4: CLI; binary named silan-viking, command named silan ──
    │   └── src/{main, banner}.rs + groups/{mod, content, index, relation, series, site, proposal, mcp}.rs
    │
    ├── silan-viking-mcp/            # ── L4: MCP server ──
    │   └── src/{lib, server, tools}.rs
    │
    └── silan-viking-site/           # ── L4: website projection + crawler artefacts (#14) ──
        └── src/{lib, projector, seo}.rs   # seo.rs = SeoEmitter (§1.6.1)

engine/tests/fixtures/               # cross-crate e2e: a mini content/ repo
```

**Crate dependency graph (strictly downward; cargo guarantees no back-edge at compile time)**:

```
  cli ─┐
  mcp ─┼─▶ app ─▶ entities ─┐
  site ┘      │             ├─▶ base
              └─▶ content ──┘
```

- L1 `base`'s `Cargo.toml` has no `silan-viking-*` dependency.
- `entities` is its own crate (L2.5): a table-schema derived artefact; `app` depends on it, but `content` (pure domain data) **does not** — domain data shouldn't know about the database.
- Adding a new adapter = add an L4 crate; do not touch L1–L3.
- Each crate's `lib.rs` is a facade with only `pub use` — the crate-level gate of §1.5 public/private.

## 1.10 Database schema revisions (after stress-testing the 50 ent tables)

> Stress-tested the 50 ent tables of the current `portfolio.db`:
> round one covered the 6 explicit requirements (revisions A/B/C);
> round two added review of pings / annotations / comments
> (revisions D/E/F); round three added persistence for §1.3 `Part`
> (revision G). The reviews exposed that the schema wasn't yet
> sensible. This section is the revision design — **design and
> doc only; Go code is not changed here**.

### Stress-test conclusions (round one — 6 explicit requirements)

| Requirement | Status | Evidence (verified) |
|---|---|---|
| ① Evolution chain idea→blog→project | ⚠️ Broken at blog→project | `blog_posts.ideas_id` exists, but `projects` has no `idea_id`/`blogpost_id`; `project_relationships` only connects project↔project |
| ② Single piece ↔ series | ✅ Single-series belonging | `blog_posts.series_id` + `series_order` |
| ③ Version control | ❌ No support | The 50 tables have no version / history table |
| ④ Language control | ✅ Most complete | `languages` table + 18 `*_translations` tables |
| ⑤ Comments | ✅ | `comments` uses `entity_type`+`entity_id` polymorphism + `parent_id` nesting |
| ⑥ References | ⚠️ Concept confusion | `comments.referrence_id` (typo), `project_relationships`, `idea_details.references` — three places do their own thing |

**Two root causes**: ① no generic relation table; ② version control is missing.

### Revision A — add the generic relation table `content_relation` (serves ① ⑥)

```
Table content_relation
  id            UUID
  from_type     ENUM(blog, project, idea, episode, update, resume)   -- review: enum, not TEXT
  from_id       UUID
  to_type       ENUM(blog, project, idea, episode, update, resume)   -- review: enum
  to_id         UUID
  relation_type ENUM(evolved_into, evolved_from, documents,           -- review: enum
                     references, supersedes, part_of)
  sort_order    INT      -- review: part_of and other ordered relations use it; default 0
  created_at    TIME

  UNIQUE INDEX (from_type, from_id, to_type, to_id, relation_type)   -- dedup
  INDEX        (from_type, from_id)    -- review: forward query "evolved into what"
  INDEX        (to_type, to_id)        -- review: reverse query "came from where"
```

- Evolution chains and references unified as different values of `relation_type`.
- **Review**: `from_type` / `to_type` / `relation_type` use `ENUM`, not bare `TEXT` — a closed set; illegal values blocked at write time by ent, not by a comment.
- **Review**: forward + reverse indexes; `UNIQUE` deduplicates only, it does not replace the reverse index.
- **Review**: add `sort_order` — `part_of` (belongs-to-a-series) is an ordered relation; the order has a place to live.
- **Obsolete**: the `blog_posts.ideas_id` FK and the `project_relationships` table — both covered by `content_relation`. `comments.referrence_id` is renamed for typo + its semantics re-homed.
- Corresponds to the `Relation` object in §1.3 — fixes the disconnect between "the design has `Relation` but the schema has no table".

### Revision B — version control via Git; `portfolio.db` has no version table

- The source of truth `content/*.md` enters the git repo → git history **is** the version history.
- `portfolio.db` **does not add** a version / history table — history is the source of truth's job; the database is a read-only derived cache; storing history would be a role mismatch.
- Consequence: the website does not display "article history" by default; when silan needs it → `git log` / `git diff`.
- When `silan index sync` writes the db, a lightweight `sync_meta` table records "this db was derived from which content commit" — this is provenance, not version control; the cost is minimal.

### Revision C — loose-collection multi-belonging (serves ②, on demand)

`blog_posts.series_id` is a single FK = a piece belongs to one
series. `Series` suffices; `Anthology` requires a piece to be
referenced by multiple collections — needs a join table
`anthology_member(anthology_id, item_type, item_id, sort_order)`.
**Low priority**: there is no explicit need yet for loose
collections in the db; deferred until needed after M0.

### Supplementary stress test — pings / annotations / comments (round two)

> Round one only covered the 6 explicit requirements; it missed
> the ping and annotation dimensions. This section back-fills the
> review and surfaces 3 real issues, corresponding to revisions D/E/F.

| Dimension | Status | Evidence (verified) |
|---|---|---|
| Ping data | ⚠️ **Schema fragmented** | `request_logs` is a raw `CREATE TABLE` in `svc.go`, **not in ent**; `project_views` is an ent table (with fingerprint / referrer / session_duration); `blog_posts` / `ideas` only have a `view_count` counter; no detail tables |
| Annotation | ❌ **Doesn't exist** | The 50 tables have no annotation table; `comments.attachment_id` is an attachment, not an annotation |
| Comments | ⚠️ Main body usable; historic potholes | `comments` does polymorphism + nesting; but `type` / `entity_type` are bare `String` not enum; `referrence_id` is a typo; `ip_address` / `user_agent` are ping data leaked into the comment table |

### Revision D — the unified interaction table `content_interaction` (serves pings + #15)

The ping schema **cannot stay fragmented**. The current situation has three problems: ① `request_logs` is a raw SQL table sitting outside ent — `sea-orm-cli` can't reverse-generate it; ② only project has the `project_views` detail table; blog / idea have no detail tables; ③ `project_likes` / `comment_likes` are tables **structurally identical** to `project_views` (all of them are `entity_id` + `fingerprint` + `ip` + `ua` + `created_at`) — view and like are the same kind of thing "**one interaction trace by an anonymous visitor**", carved into multiple dedicated tables.

> Review R5 pointed out: the old design absorbed only `view` and
> left `project_likes` / `comment_likes`; the schema was still
> fragmented. **Architectural decision: option A — view and like
> merge into one polymorphic interaction table with `kind`.** A
> single interaction trace; `kind` distinguishes view from like;
> no per-family tables for "view" and "like".

```
Table content_interaction
  id               UUID
  kind             ENUM(view, like)            -- R5: view + like in one table
  entity_type      ENUM(blog, project, idea, episode, ...)   -- polymorphic; enum not TEXT
  entity_id        UUID
  section_anchor   TEXT   NULL  -- #15: section-level ping; the anchor when a specific section is hit; otherwise empty

  -- Visitor identity
  fingerprint      TEXT        -- browser fingerprint (#15 needs to query)
  user_identity_id TEXT   NULL -- logged-in visitor
  ip_address       TEXT        -- (#15 needs to query)
  user_agent       TEXT        -- raw string; kept

  -- Visitor classification (#15) — the classification is done at write time in the Go API; see "Where the classification happens" below
  visitor_kind     ENUM(human, search_crawler, ai_crawler)   -- who came
  crawler_name     TEXT   NULL -- on hit, the specific crawler ID (Googlebot / GPTBot / ExampleAIBot …)

  -- Visit source (#15)
  referrer         TEXT   NULL -- the raw referrer URL
  referrer_kind    ENUM(search, social, ai_chat, direct, internal)
                                -- where it came from; ai_chat = clicked from
                                -- a ChatGPT / Perplexity / etc. AI chat
                                -- interface (final ruling; see 10 §10.1.1
                                -- ledger #8: the whole repo uses ai_chat)

  session_duration INT    NULL -- seconds
  created_at       TIME

  INDEX (entity_type, entity_id)        -- get every interaction of one item
  INDEX (entity_type, entity_id, kind)  -- get views / likes of one item
  INDEX (created_at)                    -- time-window aggregation (daily / weekly)
  INDEX (visitor_kind)                  -- "how many AI crawlers visited" queries
  INDEX (referrer_kind)                 -- "how much traffic from search / AI chat" queries
```

**`visitor_kind` vs `referrer_kind` — complementary; don't mix**:
- `visitor_kind` answers "**who** came": human / search-engine crawler (Googlebot) / AI crawler (GPTBot crawling content). Decided by `user_agent`.
- `referrer_kind` answers "where **from**": search results / social / **link from an AI chat interface** / direct / on-site. Decided by `referrer`.
- AI crawler (`visitor_kind=ai_crawler`) and AI-chat source (`referrer_kind=ai_chat`) are two different things: the former is a bot crawling; the latter is a human clicking a link from ChatGPT. The two fields each own half.

**Where the classification happens (architectural decision)**: the
classification of `visitor_kind` / `crawler_name` /
`referrer_kind` **happens at ping-write time in the Go API** —
the visit happens in the Go backend; `user_agent` / `referrer`
are on hand; classify **at the data origin** once and store the
result. Don't push it back to the Rust query side (recomputing
on every query = wasted work; and the crawler-rule library would
need maintenance in two places). Updating the rule library is a
rare event, not worth the small flexibility of "classify later".
`content_interaction` stores the already-classified result.

**FLAG 5 closed — uniqueness trade-off**: `content_interaction`
is **a detail table; deliberately no `UNIQUE`** — refreshing 100
times from the same fingerprint is 100 rows; the detail keeps the
full trace. Dedup / anti-spam is done in the **aggregation
layer**: `view_count` counter is refreshed from "count after
deduping by `(entity, fingerprint)`", not from a bare `COUNT(*)`.
Full detail; deduped aggregation; responsibility split.

Other points:
- blog / project / idea view + like pings **all flow through this one table**; each content table's `view_count` / `like_count` counter is kept for fast reads, refreshed by aggregating `content_interaction`.
- **Obsolete**: the three dedicated tables `project_views`, `project_likes`, `comment_likes` — all covered by `content_interaction`.
- **`request_logs` absorption**: final ruling (`10` ruling #7) — `request_logs` **becomes a formal ent table on its own**, not merged into `content_interaction` (it is API / access logging; different semantics from content interaction). M0.5 formalises it from raw SQL into an ent table; no longer floating outside ent.
- Ping tables in ent → `sea-orm-cli` can reverse-generate them → the Rust side is unified (per the §1.8 invariant).

### Revision E — add the annotation table (serves annotations)

Annotations come from three sources (reader paragraph annotations
/ owner private notes / agent annotations); **unified into one
table**; the source is distinguished by `author_kind`:

```
Table annotation
  id               UUID
  entity_type      ENUM(blog, project, idea, episode, ...)
  entity_id        UUID
  anchor           TEXT       -- annotation anchor: paragraph id / text selection (M0 settles the anchor format)
  body             TEXT       -- annotation body
  author_kind      ENUM(reader, owner, agent)   -- three sources; visibility and permissions differ
  author_ref       TEXT       -- reader → fingerprint / identity; owner → silan; agent → agent id
  visibility       ENUM(private, unlisted, public) -- owner private notes default private
                                                    -- (final ruling: visibility enum uniform across the repo; see 10 §10.3)
  created_at       TIME
  updated_at       TIME

  INDEX (entity_type, entity_id)   -- get every annotation on one item
```

- `author_kind=reader` → reader paragraph annotation (a comment variant with `anchor`).
- `author_kind=owner` → owner private notes; default `private`; not projected to the website.
- `author_kind=agent` → a collaborating agent's annotation; enters context; complementary to MCP `propose` — `propose` edits content; `annotation` leaves a note beside content without editing the body.
- `anchor`'s concrete format (paragraph id vs character offset) is settled by M0 — depends on the frontend's rendering scheme.

**FLAG 6 closed — responsibility boundary between `annotation`
and `comment`**: both tables could carry "a reader leaves a
message under a paragraph"; we must pin the boundary or M0 SCHEMA
collides:

- **`comment`**: piece-level comments. Has `parent_id` nested discussion, `is_approved` moderation, `likes_count`. Anchored to **the whole Item**.
- **`annotation`**: **paragraph-level** side notes. Has `anchor` (anchors to specific text) and `author_kind`. Anchored to **a paragraph** inside an Item.
- Decision: **has `anchor` (anchored to a paragraph) → `annotation`; anchored to the whole piece → `comment`**.
- `annotation` **does not nest replies** in this release — side notes are single-layer. If "reply to an annotation" is needed later, that reply goes into `comment` (with the annotation id as a `reference`), not into a tree on `annotation` itself. With this drawn, the two tables don't overlap.

### Revision F — fix the legacy `comment` table (serves comments)

The new tables use enums and fix the typo; **the legacy `comment` table must not be left as-is**:

- `comments.type` and `entity_type`: bare `String` → `ENUM` (consistent with `content_relation` and `content_interaction`; closed set; not TEXT).
- `comments.referrence_id`: typo fixed to `reference_id`; semantics re-homed — if it represents "a comment referencing some content", it should go through `content_relation`, and this column is obsolete. M0 confirms its real usage before deciding.
- `comments.ip_address` / `user_agent`: this is **ping data leaked into the comment table**. Comment anti-spam genuinely needs IP — can be kept; but the doc must state "this is for anti-spam, not pings" — the source of truth for pings is `content_interaction`, not the comment table.

### Revision G — the generic `item_part` table (serves §1.3's Part / configurable tabs)

> The current penalty (verified): `idea_details` makes each of
> progress / results / references **a wide-table column**;
> `project_details` is an entirely different set of columns; and
> `project_details` and `project_detail_translations` don't even
> agree on their fields (the main table has
> quick_start/release_notes; the translation table has
> goals/challenges/solutions). **Adding a tab means adding a
> column, editing ent, editing the translation table; the main
> and translation tables also drift.** This is the cost of
> "hard-coding tabs as wide-table columns".

§1.3 introduced `Part` (the tab); §1.3.1 requires the tab set to
be configurable. Wide-column tables **cannot support configurable
tabs** — columns are part of the schema; adding a column is a
schema change. Use a pair of generic tables instead:

> **`item_part` must split into two tables** (final ruling; see
> 11 §11.5). The early design made `item_part` "one row per
> language with `lang` / `body` columns" — squeezing identity
> (`part_id` / `role`) and translation into one row, inconsistent
> with the repo-wide multilingual standard "main tables store
> language-agnostic identity; `*_translation` tables store one
> language per row body" (§1.8.0). Fix: split into `item_part`
> (identity: `part_id` / `role` / `canonical_lang`) +
> `item_part_translation` (one row per language; `body` lives on
> the translation table).

```
Table item_part — a Part's identity (language-agnostic)
  id              UUID
  part_id         TEXT       -- p_<ulid>; from source meta.toml; stable (§1.3.1)
  item_type       ENUM(blog, project, idea, episode, resume, update)
  item_id         UUID
  role            TEXT       -- = the role in §1.3.1 type definition (overview / progress / …)
                             -- not an enum: the role set is SCHEMA-configurable, not a closed constant
  sort_order      INT        -- the front-end display order of tabs (= SCHEMA Part's order)
  canonical_lang  TEXT       -- which language is the source
  created_at      TIME
  updated_at      TIME

  UNIQUE INDEX (part_id)
  UNIQUE INDEX (item_type, item_id, role)   -- one Item, one role, one row
  INDEX        (item_type, item_id)         -- get every tab of one Item

Table item_part_translation — the multilingual variant of a Part body (one row per language)
  id              UUID
  item_part_id    UUID       -- → item_part.id
  language_code   TEXT       -- en / zh / …
  body            TEXT       -- this Part's body in this language
  created_at      TIME

  UNIQUE INDEX (item_part_id, language_code)   -- one Part, one language, one row
```

- An idea's `overview` Part → one row in `item_part` (identity); its `en.md` / `zh.md` → two rows in `item_part_translation` (each language's body).
- **Adding a tab = an extra row in `item_part` + a few extra rows in `item_part_translation` + edit §1.3.1 SCHEMA config; no table-structure change.** This is what truly makes "configurable file tree" (#2, §1.3.1) hold.
- `role` deliberately uses `TEXT` not `ENUM` — **intentionally opposite** to revisions A/D's enum principle: those fields are closed sets; `role` values are SCHEMA-configurable and open; an enum here would lock down configurability. The constraint is validated at write time against the SCHEMA's type definition.
- This pair of tables mirrors §1.8.0's `Parsed` (`main` + `langs`): `item_part` ←→ `main`, `item_part_translation` ←→ each entry of `langs`. Field-by-field detailed design in 11 §11.5.
- **Replacement scope**: the **text-tab fields** of `idea_details` / `project_details` and their translation tables (progress / results / references / quick_start / …) move into `item_part` / `item_part_translation`. But the **structured fields** of `idea_details` (`estimated_duration_months` / `collaboration_needed` / `estimated_budget` etc. — non-text, non-tab attributes) **do not belong to tabs**; keep them in `idea_details` as Item-extension attributes. M0 splits field by field: which is tab body (→ `item_part`); which is structured attribute (kept in `*_details`).

### Revision G′ — `part_entry` for resume's structured Parts + dedicated episode tables

> Per §1.3 and §1.5.1's final rulings: resume is NOT a single
> body Part; episode is NOT a row in `blog_posts`. These two
> rulings each introduce new schema tables — this section is only
> an **existence reference**; the field-by-field design is in
> `11` (M0.5 ent schema PR).

- **`part_entry` + `part_entry_translation`** (for resume's structured Parts): education / experience / publications / awards / research are `entry_list`; skills is `key_value_list`; **no dedicated ent table per Part** — both land uniformly in the generic `part_entry` (language-agnostic fields) + `part_entry_translation` (language-specific fields). Each `entry_list` entry has a stable anchor `entry_id = e_<ulid>`; `key_value_list` uses the category key as its stable entry key. Details in 11 §11.5.1 (final ruling; see 10 §10.4.5, 10 §10.1.1 ledger #2).
- **`episodes` + `episode_series`** (+ their translations): episode is **an independent content type + an independent container series**, not a row in `blog_posts` with `content_type=episode`. `episode_series` is the container series; `episodes` is the episode's main content table. Details in 11 §11.5.2 (final ruling; see 10 §10.4.4, 10 §10.1.1 ledger #1).
- **`recent_updates`**: `update` is the 6th content type; `recent_updates` is its **main content table** (not a derived table, not an aggregate), in the same class as `blog_posts` / `ideas`; rebuilt by sync from markdown. Details in 11 §11.7.1 (final ruling; see 10 §10.4.6, 10 §10.1.1 ledger #3).

### Knock-on effects on §1.8

- `entities` := ent tables
  + **add `content_relation`** (revision A); **`content_interaction`** (D); **`annotation`** (E); **`item_part` + `item_part_translation`** (G, split in two); **`part_entry` + `part_entry_translation`** (G′, resume entry_list); **`episodes` + `episode_series`** (+ their translations, G′, episode becomes its own table);
  + **remove `project_relationships`** / **`project_views`** / **`project_likes`** / **`comment_likes`**, and the resume-only tables `education` / `work_experience` etc. (resume flows through `part_entry`);
  + `comment` fields become enums (F); the text-tab fields of `*_details` move out (G);
  + `recent_updates` is promoted to the `update` type's main content table (details in 11 §11.7.1).
- `RowSet`: contains `relations: Vec<ContentRelationRow>` and `parts` (`item_part` + `item_part_translation` rows; resume's entry_list Parts additionally contain `part_entry` rows) — `Mapper` maps each `Part` of an Item (§1.3) into corresponding table rows.
- Derived vs runtime; the two-class boundary:
  - **Derived data** (rebuilt by `silan index sync` from markdown): main content tables (including `recent_updates`, `episodes`, `episode_series`) + translation + `item_part` / `item_part_translation` (tab bodies) + `part_entry` / `part_entry_translation` (resume entry_list entries) + `content_relation`. These are written by `Sink`.
  - **Runtime data** (written by the Go API at runtime; **not** derived by sync): `content_interaction` (pings); `annotation` (annotations); `comment` — outputs of visitor / agent behaviour.
  `Sink` only touches derived data; runtime data is never touched by sync.
- **The physical home of runtime data — server-only (load-bearing)**: comments / pings are produced by visitors **on the website**; they live only in the **server's** `portfolio.db`. The local machine's `portfolio.db` is rebuilt locally by `sync` from markdown — its runtime tables (`comment` / `content_interaction` / the reader portion of `annotation`) **are empty; this is expected, not a bug**.
  - On a new machine pulling from the server: `git clone` the content repo to get all **content** (markdown source of truth); local `sync` rebuilds the content tables; runtime tables remain empty.
  - To see comments / visit data → `silan stats` / MCP `stats` **query the server remotely**; runtime data is not synced back to local.
  - The result: locally we manage only content creation; runtime data has one home (the server); there is no "whose comments are newest" sync headache.

> The source of truth for the table schema is still Go ent. To
> land revisions A/D/E/F/G/G′, **edit `backend/internal/ent/schema/` first**
> (add `content_relation` / `content_interaction` / `annotation`
> / `item_part` + `item_part_translation` / `part_entry` +
> `part_entry_translation` / `episodes` + `episode_series` (+ their
> translations) + drop `projectrelationship.go` / `projectview.go`
> / `projectlike.go` / `commentlike.go` and the resume-only
> tables `education` / `work_experience` etc. + edit `comment` /
> `recent_updates` + move the tab fields out of `*_details`), then
> `sea-orm-cli` reverse-generates the Rust entities. The
> field-by-field PR design is in `11` (M0.5) — this chapter only
> covers the design and the existence reference, listed as a
> standalone schema-revision PR.

## 1.11 Closed review items and M7 construction rules

Review carry-overs close here. F1/F2/F3 are schema-layer items;
closed by `10`. F4/F5 are on the proposal/capture chain; they do
not block M1–M6 Rust core, but must be implemented per the table
during M7.

| Flag | Issue | Final rule |
|---|---|---|
| F1 | ~~Is `update` a relation endpoint?~~ — Closed: `update` is the 6th content type (final ruling; see 10 §10.4.6); `recent_updates` is its main content table; it is a valid endpoint for `content_relation` | — (closed) |
| F2 | ~~`idea_details.references` (free text) collides with `content_relation`'s `references`~~ — Closed: they are different things, each with its own role — `content_relation.references` is a structured Item↔Item reference edge; the idea's `reference` Part body is free-text reference material (final ruling; see 10 §10.5) | — (closed) |
| F3 | Already resolved in revision A via `sort_order` | — (closed) |
| F4 | The same Part being edited by multiple proposals simultaneously — no lock / no warning (`03` §3.1) | `proposal_meta.toml` must record `base_head_oid` + `touched_parts` (`kind` / `slug` / `part_id` / `lang` / `ext`). When `propose` creates a proposal and finds the same Part already has a pending proposal, the return value and `silan proposal list` flag a conflict risk; creation is not blocked. `accept` must hold `content/.git/silan/locks/proposal-accept.lock`, validate the expected head OID, merge into a temporary worktree, then re-run validation ②; on failure, do not advance main. |
| F5 | `capture` creating a new Item — the source of `slug` is undefined (`03` §3.1) | `capture(note, type, slug?)`: agents may pass `slug`; the engine only accepts `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`; if absent, slugify from title / first sentence into lowercase kebab-case, truncated to 64 chars; on collision, append `-<ulid6>`. The final slug is written into the proposal metadata and returned in the response. |

> F1/F2/F3 are closed (F1: `update` promoted to content type, see 10 §10.4.6; F2: free-text references and structured edges each in their own place, see 10 §10.5); F4/F5 are M7 implementation rules, no longer listed as M0 blockers.
