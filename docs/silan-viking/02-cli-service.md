# 02 · CLI service surface (`silan …`)

> Serves requirement `#8` (noun-first, matches EasyNet-Cli's `<binary>
> <noun> <verb>`). The CLI is the owner's operation surface. Each
> command is annotated with the requirement it serves.
>
> **The command groups split in two**: ① one **type-specific command
> group** per content type (`idea` / `blog` / `project` / `episode` /
> `resume` / `update`, six in total) — each carries full CRUD + the
> type-specific operations; ② **cross-type / tool groups**
> (`content` / `index` / `relation` / `site` / `stats` / `proposal` /
> `mcp` / `skill`).

---

## I. Type-specific command groups (serve #2 #3 #4 #5)

One noun group per type (`idea` / `blog` / `project` / `episode` /
`resume` / `update`). **The six CRUD verbs are unified**
(`new` / `list` / `show` / `edit` / `rm` / `archive`); the
**type-specific operations differ per group**.

### `silan idea <verb>` — ideas

```
silan idea new <slug>            create a new idea (scaffold the directory + parts/overview/{meta.toml,en.md})
silan idea list                  list every idea (filter with --status hypothesis etc.)
silan idea show <slug>           show one idea (each Part + metadata + evolution relations)
silan idea edit <slug> [part]    open the .md of a Part of the idea (default overview)
silan idea rm <slug>             ★ real delete: drops the whole directory; checks for dangling evolution edges and confirms first
silan idea archive <slug>        offline: idea has no `archived` value, so this command sets status to
                                 concluded (closure) — see the type-specific notes below
# ── idea-specific ──
silan idea status <slug> <state> advance the lifecycle. <state> ∈ the 6 idea.status values
                                 (draft / hypothesis / experimenting / validating /
                                  published / concluded) — see 10-m0-schema-finalisation.md
                                 §10.4. Typical path: draft → hypothesis →
                                 experimenting → validating → published → concluded
silan idea promote <slug> --to blog|project
                                 one-shot evolution: draft a blog or project from this idea
                                 and create the evolution edge automatically (blog→documents, project→evolved-from)
silan idea add-part <slug> <role>   add an optional Part (progress / reference / result)
silan idea add-lang <slug> <lang>   add a language variant to the idea
```

### `silan blog <verb>` — blog post / vlog

```
silan blog new <slug>            create a new blog (scaffold + parts/body/{meta.toml,en.md})
silan blog list                  list every blog (filter with --status / --content-type vlog)
silan blog show <slug>           show one blog
silan blog edit <slug> [lang]    open the .md of one language of the blog (default primary language)
silan blog rm <slug>             ★ real delete: check for dangling evolution edges and confirm first
silan blog archive <slug>        archive
# ── blog-specific ──
silan blog publish <slug>        publish: set status to published (eligible for projection to the website)
silan blog unpublish <slug>      retract: set status back to draft
silan blog add-lang <slug> <lang>   add a language variant (en.md → zh.md …)
```

### `silan project <verb>` — projects

```
silan project new <slug>         create a new project (scaffold + parts/overview/{meta.toml,en.md})
silan project list               list every project (filter with --status active etc.)
silan project show <slug>        show one project (each Part + evolution relations + progress)
silan project edit <slug> [part] open the .md of a Part of the project (default overview)
silan project rm <slug>          ★ real delete: check for dangling evolution edges and confirm first
silan project archive <slug>     archive
# ── project-specific ──
silan project progress <slug>    append a progress entry to the project's progress Part
                                 (auto-creates the progress Part if it doesn't exist, see 07 §7.4)
silan project add-part <slug> <role>   add an optional Part (progress / reference)
silan project add-lang <slug> <lang>   add a language variant
```

### `silan episode <verb>` — independent type: container series + episodes within a series

> episode is an **independent content type and an independent
> container series** (`#5`, 10 §10.4.4 decision #1) — it does not
> depend on blog. On disk:
> `content/resources/episode/<series>/` contains `series.toml` plus
> per-episode `<episode-slug>/parts/body/`. Each episode is an
> independent Item that lands in the `episodes` table (not
> `blog_posts`). The command group expresses two layers at once: the
> `series` sub-verbs manage the series; the rest manage individual
> episodes.

```
# ── series layer (container series) ──
silan episode series new <series>     create a new container series (scaffold + series.toml)
silan episode series list             list every series
silan episode series show <series>    show one series (series overview + ordered episode list)
silan episode series reorder <series> reorder the episodes in a series (episode_number)
silan episode series rm <series>      ★ real delete: removes the entire series (and every episode in it)
silan episode series archive <series> archive a series (status → archived)
# ── episode layer (each episode is its own Item) ──
silan episode new <series> <slug>     add one episode to a series (scaffold + parts/body/{meta.toml,en.md}; episode_number is auto-assigned)
silan episode list [<series>]         list episodes (with <series> given, only list that series')
silan episode show <series> <slug>    show one episode (frontmatter + body)
silan episode edit <series> <slug> [lang]  open this episode's parts/body/<lang>.md (default primary language)
silan episode rm <series> <slug>      ★ real delete: remove one episode
silan episode archive <series> <slug> archive one episode
silan episode add-lang <series> <slug> <lang>   add a language variant to one episode
# ── episode-specific ──
silan episode publish <series> <slug>    publish an episode: status → published
silan episode unpublish <series> <slug>  retract: status → draft
```

### `silan resume <verb>` — resume (single Item · many Parts)

> resume is **a single Item**, but **not a single body Part** — it
> has multiple Parts: `summary` / `education` / `experience` /
> `publications` / `awards` / `research` / `skills`, each with its
> own `shape` (`prose` / `entry_list` / `key_value_list`, see 10
> §10.4.5 decision #2). Therefore `edit` must point at a specific
> Part — it cannot, as in the older design, just open
> `parts/body/<lang>.md`.

```
silan resume show [part]         show the resume (no part: overview of every Part; with part: only that Part)
silan resume edit <part> [lang]  open parts/<part>/<lang>.<ext> (<part> ∈ summary/education/
                                 experience/publications/awards/research/skills; default part = summary)
                                 # <ext> is decided by the Part's shape: prose→.md, entry_list/key_value_list→.toml
silan resume list                list every Part of the resume that exists today and its shape
silan resume add-part <role>     add a Part (role must be one of the optional roles in SCHEMA.md's resume.parts config)
silan resume add-lang <part> <lang>  add a language variant to a Part (drops <lang>.md or .toml under parts/<part>/ per shape)
# resume is a single Item — no new/rm here; silan init already created it; the whole Item is neither created nor removed
# Part granularity is editable (add-part); Part deletion happens via SCHEMA config, not in this command group
```

> The resume `show` / `edit` / `add-lang` all carry a `<part>`
> dimension — the older design assumed resume was a single body Part
> (`silan resume edit [lang]`), which conflicts with the 10 §10.4.5
> "resume is multi-Part" ruling; fixed. `add-part` is for taking a
> Part declared optional (non-required) in SCHEMA.md and actually
> instantiating it on disk.

### `silan update <verb>` — live updates (the 6th type)

> `update` is **the 6th content type** (10 §10.4.6 decision #3) —
> it has its own parser, its own `ContentKind::Update`, its own
> mapper; `recent_updates` is its main content table. It carries a
> lifecycle (`status` ∈ active / ongoing / completed), so the
> type-specific operations mirror the `status`-advance verbs of the
> `idea` group.

```
silan update new <slug>          create a new update (scaffold + parts/body/{meta.toml,en.md})
silan update list                list every update (filter with --status active / --update-type release etc.)
silan update show <slug>         show one update (frontmatter + body + evolution relations)
silan update edit <slug> [lang]  open the .md of one language of the update (default primary language; update has only a body Part)
silan update rm <slug>           ★ real delete: check for dangling evolution edges and confirm first
silan update archive <slug>      archive: status unchanged; visibility no longer projected to the website
# ── update-specific ──
silan update status <slug> <state>  advance the lifecycle: active → ongoing → completed
silan update set-type <slug> <update_type>
                                 set update_type ∈ milestone/achievement/progress/release/
                                 announcement/insight/learning/reflection (8 values, see 10 §10.4.6)
silan update add-lang <slug> <lang> add a language variant
```

> CRUD uniformity: the six verbs `new` / `list` / `show` / `edit` /
> `rm` / `archive` carry **the same name and the same meaning**
> across idea / blog / project / update (resume / episode trim or
> extend dimensions because of their shapes) — learn one group and
> you have the rest. The type-specific operations (`status` /
> `publish` / `progress` / `promote` / `set-type`) are the per-type
> differences, listed separately for each group.
>
> `rm` vs `archive`: `archive` is the day-to-day "take offline"
> (only changes status, content stays); `rm` truly deletes files,
> and **before deletion it always checks for dangling evolution
> edges and asks for a second confirmation** (`#4`, see 07 §7.9).
>
> Which value `archive` sets `status` to is decided by each type's
> `status` enum (`10-m0-schema-finalisation.md` §10.4 is the only
> source of truth): blog / project / episode go to `archived`;
> **idea has no `archived` value, it goes to `concluded`**. The verb
> name is the same; the value mapped depends on the type — the
> engine reads the SCHEMA enum mapping and never hard-codes
> `archived`.

---

## II. Cross-type / tool command groups

### `silan content <verb>` — read-only cross-type browsing (serves #2)

```
silan content ls <uri>     list the contents under a silan:// path (across all types)
silan content tree         hierarchical browse of the whole content/
silan content show <uri>   show any item by silan:// URI (type-agnostic)
```

> The `content` group is **read-only and cross-type** — it is the
> "bird's-eye view of content/". For actual CRUD on a single item,
> use the type-specific groups above. The difference between
> `content show <uri>` and `<type> show <slug>`: the former takes a
> full URI and doesn't need to know the type; the latter is shorter
> when the type is already known.

### `silan index <verb>` — index and sync (serves #1)

```
silan index sync       scan content/ → parse → write portfolio.db (full update chain in 06 §6.4)
silan index rebuild    full rebuild (.silan-cache + derived data, byte-idempotent)
silan index repair     ★ the only command that writes a missing PartID back into meta.toml (explicit write to the source of truth)
silan index lint       health check: dangling evolution edges, missing fields, orphan Items, stale content (serves #11)
silan index status     workspace state: per-Collection item counts, unsynced items
```

> `sync` / `rebuild` are **read-only to the source of truth** (they
> only write derived artefacts): when they encounter a `meta.toml`
> missing a `PartID` they error out and tell you to run `repair`.
> `repair` is the only `index` sub-command that mutates `meta.toml`
> — it promotes "fill in missing IDs" from an implicit side effect
> of sync to an explicit human-triggered action (`08` §8.2 hard
> rule).

### `silan relation <verb>` — evolution relations (serves #4)

```
silan relation link <from> <to> --type <kind>   create a directed edge (write to content_relation)
silan relation show <uri>                       print the forward and reverse relations of one item
silan relation graph                            export the relation graph (data source for the site's knowledge graph)
# kind ∈ evolved-from/into · documents · references · supersedes · part-of
```

### `silan site <verb>` — website projection and operations (serves #11 #14)

```
silan site build       build the frontend + emit crawler artefacts (sitemap / robots / JSON-LD / pre-render / meta, #14)
silan site preview     local preview of the whole site
silan site check       pre-publish health check (broken links / missing images / SCHEMA)
silan site publish <uri>   set an Item's visibility to public (selective publication)
silan site deploy      Docker deploy (--dry-run on by default; --confirm to really deploy); deploys also carry crawler artefacts
silan site rollback    roll back to the previous release
silan site status      live-service health + the content commit that is currently deployed
```

### `silan stats <verb>` — content-interaction data queries (serves #15)

```
silan stats sync <uri>        pull this Item's runtime stats from the production server into the local cache
silan stats show <uri>        the Item's view / like / comment counts (reads the local cache)
silan stats visitors <uri>    visitor details: fingerprint / IP / visitor_kind / referrer_kind
silan stats crawlers <uri>    aggregated by visitor kind: human / search engine / AI crawler; per-crawler scrape count
silan stats sources <uri>     aggregated by source: search / social / AI chat / direct / referral
```

> **`stats` is a sync-then-query model** (owner-decided design
> change — the earlier design was "remote live query"; during
> implementation it was changed to "sync first, then query
> locally"). Runtime data (comments / pings) lives only on the
> production server (`01` §1.8) — the local `portfolio.db`'s
> `content_interaction` table **is empty**. Two-step flow:
> - `silan stats sync <uri>` calls the **stats endpoint of the
>   server's Go API** (`/api/v1/stats/...`) over HTTP and pulls
>   that Item's stats into the local `portfolio.db`'s
>   `stats_cache_*` tables. The server address is taken from
>   `silan-viking.toml`'s `[deploy].api_base`, or derived as
>   `https://<host>` from `[deploy].host`.
> - `stats show / visitors / crawlers / sources <uri>` **reads
>   this local cache** and works offline.
>
> A cache that hasn't been synced gets a clear prompt from the read
> commands: "run `silan stats sync` first". With no `[deploy]`
> configured, `stats sync` errors with "runtime data requires a
> deploy first". The four MCP `#15` tools share the same source as
> the CLI — they read the same local cache (see `03` tier 1).

### `silan proposal <verb>` — human-side review of agent proposals (serves #10, mechanism in 03 §3.1)

```
silan proposal list           list pending proposals; mark failing-validation ones in red
silan proposal show <id>      show the proposal diff (proposal branch vs main) + validation report + conflicting files
silan proposal accept <id>    staging-area merge + validation ② → on pass, advance the main branch pointer to the verified result
silan proposal reject <id>    delete the proposal branch
silan proposal rebase <id>    rebase a stale proposal branch onto the latest main; stop on conflict; resolve and `rebase --continue`
# A proposal = a git branch in the content repo (proposal/<ulid>). accept / reject / rebase are human-only.
```

### `silan mcp <verb>` — the MCP service process (serves #10 #12)

```
silan mcp serve           print the handshake (SCHEMA version, tool surface) for ops to verify
silan mcp serve --stdio   start the stdio JSON-RPC MCP server for an MCP host to drive (06 §6.3)
silan mcp status          readiness probe: binary / SCHEMA / content repo / tool count
```

> `mcp status` does not query a long-running server (there isn't
> one); it is a one-shot local readiness probe that reports
> `binary_found`, `schema_present`, `content_repo`,
> `tools_advertised`, `mcp_available` — same shape as
> `silan skill status`'s diagnostic fields (`13` §13.3).

### `silan skill <verb>` — skill-bundle distribution for collaborating agents (serves #16)

```
silan skill emit     emit a skill bundle to ~/.claude/skills/silan-viking/ (--path overrides the output location)
                     derived from silan-viking.toml + content/SCHEMA.md; overwrites if present
silan skill status   check whether the skill is installed and whether it matches the current project state (ContentHash comparison)
silan skill rm       remove the installed skill bundle
```

> The skill bundle is a **derived artefact**, not the source of
> truth — like `portfolio.db`, it can be rebuilt at any time by
> `silan skill emit`. `silan init` does **not** auto-emit: the
> skill is the optional layer for "let a collaborating agent use
> it", and silan must opt in explicitly (same discipline as
> `site deploy` being off by default). The skill carries no
> abilities itself; it instructs Claude to connect to the
> `silan mcp serve` server — the full mechanism, the SKILL.md
> shape, and the auto-trigger manual live in
> `13-skill-distribution.md`.

### Top-level commands

```
silan init                initialise a project under ~/.silan-viking/ (--path overrides); see 06 §6.2
silan config edit         edit the project config; --global edits ~/.config/silan/config.toml
silan doctor              cross-layer health check
silan completion <shell>  shell completion
silan uninstall           remove the skill + derived files; --purge also drops content/ and config
```

> `uninstall` by default removes only the reproducible parts — the
> installed skill (`~/.claude/skills/silan-viking`) and the
> `_deploy/` derived artefacts — **and preserves `content/`** (the
> source of truth, hand-written by the user, not reproducible).
> `--purge` extends the removal to `content/` and
> `silan-viking.toml`. Before deletion, it lists every path queued
> for removal and waits for confirmation: `--dry-run` lists without
> deleting, `--yes` skips confirmation (for scripts), and the
> `--purge` confirmation requires typing `purge` rather than a
> bare `y`.

---

## Design notes

- **Command group overview**: 6 type-specific groups (`idea` /
  `blog` / `project` / `episode` / `resume` / `update`) + 8 tool
  groups (`content` / `index` / `relation` / `site` / `stats` /
  `proposal` / `mcp` / `skill`) + 5 top-level commands (`init` /
  `config` / `doctor` / `completion` / `uninstall`). (The 6 types
  come from 10 §10.4 decision #3; the `skill` group is in `13`. A
  `schema` group joins at E2, see `04` E2 and `15` §15.2.)
- **Why type-specific groups, not a generic `content --type`**:
  idea / update carry a lifecycle (`status`); blog / episode have
  publishing (`publish`); project has progress maintenance
  (`progress`); resume has a Part dimension on `edit <part>` —
  **these type-specific operations cannot be covered by a generic
  verb**. Type-specific groups let commands match each content's
  real operation; the six CRUD verbs are the same name across
  groups, so learning one group teaches the rest with no extra
  memorisation load.
- The CLI is the owner's operation surface — it does **not** carry
  "the agent understands the owner"; that is MCP's job
  (`03-mcp-service.md`).
- **Human-only verbs**: `site publish`, `proposal accept / reject /
  rebase`, every `rm` — these decide content publication, draft
  merges into the source of truth, and deletion; they are not
  exposed to the agent (#13 safety boundary).
- Code site: `silan-viking-cli/groups/`, one file per noun (`01`
  §1.9).
