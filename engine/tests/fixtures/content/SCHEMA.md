# content/SCHEMA.md

> The silan-viking content contract. This file is the single source of truth
> shared by parser / CLI / MCP / test fixtures. The engine only parses the
> fenced ` ```yaml ` block below; the markdown prose is for human readers.
>
> Design basis: `docs/silan-viking/10-M0-SCHEMA定稿.md`. Each field is tagged
> with its factual origin: `[py]` (field read by the current Python parser),
> `[ent]` (field on the current Go ent schema), `[new]` (introduced by this
> design). A field without a `[new]` tag may not appear out of nowhere.

## Top-level structure

`SCHEMA.md` is a YAML document with six sections — `namespaces`,
`field_types`, `types`, `relations`, `errors` — plus the `version` and
`layout` scalars (see `docs/silan-viking/10` §10.2).

Every Item directory also contains an `item.toml` with a lifetime-stable
`item_id = "i_<ulid>"`. The CLI creates it when scaffolding the Item; sync
only reads it. Rebuilding the projection must never mint a new identity,
because comments, likes and views reference that id.

```yaml
version: 1
layout: latest-only

# ---------------------------------------------------------------------------
# namespaces — the two content namespaces (per 01 §1.2.1, 08 §8.2)
# ---------------------------------------------------------------------------
namespaces:
  resources:
    root: content/resources
    publishable: true
    direct_agent_write: false      # agents change published content via proposals only
  agent:
    root: content/agent
    publishable: false             # the SiteProjector never touches this
    direct_agent_write: true       # agents write here directly via ctx_write

# ---------------------------------------------------------------------------
# field_types — the field type vocabulary (the parser's type contract, 10 §10.2.2)
# ---------------------------------------------------------------------------
field_types:
  string:   { repr: "TOML/frontmatter string", rust: String }
  text:     { repr: "markdown body block",      rust: String }
  int:      { repr: "TOML integer",             rust: i64 }
  float:    { repr: "TOML float",               rust: f64 }
  bool:     { repr: "TOML boolean",             rust: bool }
  date:     { repr: "YYYY-MM-DD",               rust: "time::Date",           rule: iso8601-date }
  datetime: { repr: "RFC-3339",                 rust: "time::OffsetDateTime", rule: rfc3339 }
  slug:     { repr: "string",                   rust: Slug,    rule: "^[a-z0-9][a-z0-9-]*$" }
  ulid:     { repr: "prefix + ULID",            rust: "PartId|ItemId",        rule: "p_/i_/e_ prefix" }
  enum:     { repr: "string",                   rust: "dedicated enum",       rule: "member of value set" }
  list:     { repr: "TOML array",               rust: "Vec<T>" }

# ---------------------------------------------------------------------------
# types — the 6 content types (per 10 §10.4).
#   Each type declares `fields` (frontmatter fields) and `parts` (Part list).
#   Field attributes: type / required / default / source / column.
#   Part attributes:  role / required / order / shape (default prose).
# ---------------------------------------------------------------------------
types:

  # -- idea -------------------------------------------------------------------
  idea:
    main_table: ideas
    fields:
      - { name: slug,                       type: slug,                                 required: true,  default: null,    source: "py,ent", column: "ideas.slug" }
      - { name: title,                      type: string,                               required: true,  default: null,    source: "py,ent", column: "ideas.title" }
      - { name: kind,                       type: "enum(idea)",                         required: true,  default: idea,    source: new,      column: null }
      - { name: status,                     type: "enum(draft,hypothesis,experimenting,validating,published,concluded)", required: true, default: draft, source: "py,ent", column: "ideas.status" }
      - { name: visibility,                 type: "enum(private,unlisted,public)",      required: true,  default: private, source: new,      column: "ideas.visibility" }
      - { name: priority,                   type: "enum(high,medium,low)",              required: false, default: medium,  source: py,       column: "idea_details.priority" }
      - { name: category,                   type: string,                               required: false, default: null,    source: "py,ent", column: "ideas.category" }
      - { name: abstract,                   type: text,                                 required: false, default: null,    source: "py,ent", column: "ideas.abstract" }
      - { name: collaboration_needed,       type: bool,                                 required: false, default: false,   source: "py,ent", column: "idea_details.collaboration_needed" }
      - { name: funding_required,           type: bool,                                 required: false, default: false,   source: "py,ent", column: "idea_details.funding_required" }
      - { name: estimated_duration_months,  type: int,                                  required: false, default: null,    source: "py,ent", column: "idea_details.estimated_duration_months" }
      - { name: estimated_budget,           type: float,                                required: false, default: null,    source: "py,ent", column: "idea_details.estimated_budget" }
      - { name: relations,                  type: "list<relation>",                     required: false, default: [],      source: new,      column: "content_relation" }
    parts:
      - { role: overview,  required: true,  order: 10, shape: prose }
      - { role: progress,  required: false, order: 20, shape: prose }
      - { role: reference, required: false, order: 30, shape: prose }
      - { role: result,    required: false, order: 40, shape: prose }

  # -- blog -------------------------------------------------------------------
  blog:
    main_table: blog_posts
    fields:
      - { name: slug,               type: slug,                                required: true,  default: null,    source: "py,ent", column: "blog_posts.slug" }
      - { name: title,              type: string,                              required: true,  default: null,    source: "py,ent", column: "blog_posts.title" }
      - { name: kind,               type: "enum(blog)",                        required: true,  default: blog,    source: new,      column: null }
      - { name: content_type,       type: "enum(article,podcast,vlog,tutorial)", required: false, default: article, source: "py,ent", column: "blog_posts.content_type" }
      - { name: status,             type: "enum(draft,published,archived)",    required: true,  default: draft,   source: "py,ent", column: "blog_posts.status" }
      - { name: visibility,         type: "enum(private,unlisted,public)",     required: true,  default: private, source: new,      column: "blog_posts.visibility" }
      - { name: excerpt,            type: text,                                 required: false, default: null,    source: "py,ent", column: "blog_posts.excerpt" }
      - { name: is_featured,        type: bool,                                 required: false, default: false,   source: "py,ent", column: "blog_posts.is_featured" }
      - { name: featured_image_url, type: string,                               required: false, default: null,    source: "py,ent", column: "blog_posts.featured_image_url" }
      - { name: published_at,       type: datetime,                             required: false, default: null,    source: "py,ent", column: "blog_posts.published_at" }
      - { name: category,          type: string,                               required: false, default: null,    source: "py,ent", column: "blog_posts.category_id" }
      - { name: tags,               type: "list<string>",                      required: false, default: [],      source: "py,ent", column: "content_tag" }
      - { name: series,             type: "string(slug)",                      required: false, default: null,    source: "py,ent", column: "blog_posts.series_id" }
      - { name: series_order,       type: int,                                  required: false, default: null,    source: "py,ent", column: "blog_posts.series_order" }
      - { name: relations,          type: "list<relation>",                    required: false, default: [],      source: new,      column: "content_relation" }
    parts:
      - { role: body, required: true, order: 10, shape: prose }

  # -- project ----------------------------------------------------------------
  project:
    main_table: projects
    fields:
      - { name: slug,               type: slug,                                       required: true,  default: null,            source: "py,ent", column: "projects.slug" }
      - { name: title,              type: string,                                     required: true,  default: null,            source: "py,ent", column: "projects.title" }
      - { name: kind,               type: "enum(project)",                            required: true,  default: project,         source: new,      column: null }
      - { name: status,             type: "enum(active,completed,paused,cancelled)",  required: true,  default: active,          source: "py,ent", column: "projects.status" }
      - { name: visibility,         type: "enum(private,unlisted,public)",            required: true,  default: private,         source: new,      column: "projects.visibility" }
      - { name: description,        type: text,                                       required: false, default: null,            source: "py,ent", column: "projects.description" }
      - { name: project_type,       type: string,                                     required: false, default: "Web Application", source: "py,ent", column: "projects.project_type" }
      - { name: start_date,         type: date,                                       required: false, default: null,            source: "py,ent", column: "projects.start_date" }
      - { name: end_date,           type: date,                                       required: false, default: null,            source: "py,ent", column: "projects.end_date" }
      - { name: is_featured,        type: bool,                                       required: false, default: false,           source: "py,ent", column: "projects.is_featured" }
      - { name: github_url,         type: string,                                     required: false, default: null,            source: "py,ent", column: "projects.github_url" }
      - { name: demo_url,           type: string,                                     required: false, default: null,            source: "py,ent", column: "projects.demo_url" }
      - { name: documentation_url,  type: string,                                     required: false, default: null,            source: "py,ent", column: "projects.documentation_url" }
      - { name: thumbnail_url,      type: string,                                     required: false, default: null,            source: "py,ent", column: "projects.thumbnail_url" }
      - { name: cover_source_type,  type: "enum(image,website)",                     required: false, default: image,           source: new,      column: "projects.cover_source_type" }
      - { name: cover_website_url,  type: string,                                     required: false, default: null,            source: new,      column: "projects.cover_website_url" }
      - { name: tech_stack,         type: "list<string>",                            required: false, default: [],              source: "py,ent", column: "project_technologies" }
      - { name: license,           type: "string(SPDX)",                            required: false, default: null,            source: "py,ent", column: "project_details.license" }
      - { name: version,           type: string,                                     required: false, default: null,            source: "py,ent", column: "project_details.version" }
      - { name: tags,               type: "list<string>",                            required: false, default: [],              source: "py,ent", column: "content_tag" }
      - { name: relations,          type: "list<relation>",                          required: false, default: [],              source: new,      column: "content_relation" }
    parts:
      - { role: overview,      required: true,  order: 10, shape: prose }
      - { role: goals,         required: false, order: 20, shape: prose }
      - { role: challenges,    required: false, order: 30, shape: prose }
      - { role: solutions,     required: false, order: 40, shape: prose }
      - { role: lessons,       required: false, order: 50, shape: prose }
      - { role: quick_start,   required: false, order: 60, shape: prose }
      - { role: release_notes, required: false, order: 70, shape: prose }

  # -- episode — standalone type + container series (per 10 §10.4.4 ruling #1) -
  episode:
    main_table: episodes
    series:
      file: series.toml
      table: episode_series
      fields:
        - { name: series_id,   type: ulid,                                  required: true,  default: "engine-generated", source: new, column: "episode_series.id" }
        - { name: title,       type: string,                                required: true,  default: null,               source: py,  column: "episode_series.title" }
        - { name: slug,        type: slug,                                  required: true,  default: null,               source: py,  column: "episode_series.slug" }
        - { name: description, type: text,                                  required: false, default: null,               source: py,  column: "episode_series.description" }
        - { name: cover_url,   type: string,                                required: false, default: null,               source: py,  column: "episode_series.cover_url" }
        - { name: status,      type: "enum(ongoing,completed,archived)",    required: true,  default: ongoing,            source: py,  column: "episode_series.status" }
    fields:
      - { name: slug,             type: slug,                              required: true,  default: null,    source: py,  column: "episodes.slug" }
      - { name: title,            type: string,                            required: true,  default: null,    source: py,  column: "episodes.title" }
      - { name: kind,             type: "enum(episode)",                   required: true,  default: episode, source: new, column: null }
      - { name: series,           type: "string(slug)",                    required: true,  default: null,    source: py,  column: "episodes.series_id" }
      - { name: episode_number,   type: int,                               required: true,  default: null,    source: py,  column: "episodes.episode_number" }
      - { name: status,           type: "enum(draft,published,archived)",  required: true,  default: draft,   source: py,  column: "episodes.status" }
      - { name: visibility,       type: "enum(private,unlisted,public)",   required: true,  default: private, source: new, column: "episodes.visibility" }
      - { name: published_at,     type: datetime,                          required: false, default: null,    source: py,  column: "episodes.published_at" }
      - { name: duration_minutes, type: int,                               required: false, default: null,    source: py,  column: "episodes.duration_minutes" }
      - { name: relations,        type: "list<relation>",                  required: false, default: [],      source: new, column: "content_relation" }
    parts:
      - { role: body, required: true, order: 10, shape: prose }

  # -- moment — the 6th type (per 10 §10.4.6 ruling #3) -----------------------
  moment:
    main_table: moments
    fields:
      - { name: slug,        type: slug,                                                                  required: true,  default: null,    source: py,       column: "moments.slug" }
      - { name: title,       type: string,                                                                required: true,  default: null,    source: "py,ent", column: "moments.title" }
      - { name: kind,        type: "enum(moment)",                                                        required: true,  default: moment,  source: new,      column: null }
      - { name: moment_type, type: "enum(milestone,achievement,progress,release,announcement,insight,learning,reflection)", required: true, default: progress, source: py, column: "moments.moment_type" }
      - { name: status,      type: "enum(active,ongoing,completed)",                                      required: true,  default: active,  source: "py,ent", column: "moments.status" }
      - { name: priority,    type: "enum(high,medium,low)",                                               required: false, default: medium,  source: "py,ent", column: "moments.priority" }
      - { name: pinned,      type: bool,                                                                  required: false, default: false,   source: "py,ent", column: "moments.pinned" }
      - { name: visibility,  type: "enum(private,unlisted,public)",                                       required: true,  default: private, source: new,      column: "moments.visibility" }
      - { name: date,        type: date,                                                                  required: true,  default: null,    source: "py,ent", column: "moments.date" }
      - { name: tags,        type: "list<string>",                                                       required: false, default: [],      source: "py,ent", column: "content_tag" }
      - { name: relations,   type: "list<relation>",                                                     required: false, default: [],      source: new,      column: "content_relation" }
    parts:
      - { role: body, required: true, order: 10, shape: prose }

  # -- resume — single Item + multiple Parts, config-driven entry_list
  #    (per 10 §10.4.5 ruling #2) ---------------------------------------------
  resume:
    main_table: personal_info
    fields:
      - { name: full_name,      type: string,                            required: true,  default: null,    source: "py,ent", column: "personal_info.full_name" }
      - { name: title,          type: string,                            required: true,  default: null,    source: "py,ent", column: "personal_info.title" }
      - { name: kind,           type: "enum(resume)",                    required: true,  default: resume,  source: new,      column: null }
      - { name: visibility,     type: "enum(private,unlisted,public)",   required: true,  default: private, source: new,      column: null }
      - { name: current_status, type: text,                              required: false, default: null,    source: "py,ent", column: "personal_info.current_status" }
      - { name: email,          type: string,                            required: false, default: null,    source: "py,ent", column: "personal_info.email" }
      - { name: phone,          type: string,                            required: false, default: null,    source: "py,ent", column: "personal_info.phone" }
      - { name: location,       type: string,                            required: false, default: null,    source: "py,ent", column: "personal_info.location" }
      - { name: website,        type: string,                            required: false, default: null,    source: "py,ent", column: "personal_info.website" }
      - { name: avatar_url,     type: string,                            required: false, default: null,    source: "py,ent", column: "personal_info.avatar_url" }
      - { name: social_links,   type: "list<{platform,url,display_name}>", required: false, default: [],    source: "py,ent", column: "personal_info.social_links" }
    # The resume parts use BLOCK YAML (not flow `{ }`) because `entry_list`
    # parts carry an `entry_fields` block sequence — a flow mapping cannot
    # contain a block sequence.
    parts:
      - role: summary
        required: true
        order: 10
        shape: prose
      - role: education
        required: false
        order: 20
        shape: entry_list
        entry_fields:
          - { name: institution,          type: string,       required: true,  translatable: true }
          - { name: degree,               type: string,       required: true,  translatable: true }
          - { name: field_of_study,       type: string,       required: false, translatable: true }
          - { name: start_date,           type: date,         required: false, translatable: false }
          - { name: end_date,             type: date,         required: false, translatable: false }
          - { name: is_current,           type: bool,         required: false, translatable: false }
          - { name: gpa,                  type: string,       required: false, translatable: false }
          - { name: location,             type: string,       required: false, translatable: true }
          - { name: institution_website,  type: string,       required: false, translatable: false }
          - { name: institution_logo_url, type: string,       required: false, translatable: false }
          - { name: details,              type: "list<text>", required: false, translatable: true }
      - role: experience
        required: false
        order: 30
        shape: entry_list
        entry_fields:
          - { name: company,          type: string,       required: true,  translatable: true }
          - { name: position,         type: string,       required: true,  translatable: true }
          - { name: start_date,       type: date,         required: false, translatable: false }
          - { name: end_date,         type: date,         required: false, translatable: false }
          - { name: is_current,       type: bool,         required: false, translatable: false }
          - { name: location,         type: string,       required: false, translatable: true }
          - { name: company_website,  type: string,       required: false, translatable: false }
          - { name: company_logo_url, type: string,       required: false, translatable: false }
          - { name: details,          type: "list<text>", required: false, translatable: true }
      - role: publications
        required: false
        order: 40
        shape: entry_list
        entry_fields:
          - { name: title,            type: string,         required: true,  translatable: true }
          - { name: authors,          type: "list<string>", required: false, translatable: false }
          - { name: journal_name,     type: string,         required: false, translatable: true }
          - { name: conference_name,  type: string,         required: false, translatable: true }
          - { name: conference_full_name, type: string,     required: false, translatable: true }
          - { name: conference_url,   type: string,         required: false, translatable: false }
          - { name: conference_location, type: string,      required: false, translatable: true }
          - { name: ccf_rank,         type: "enum(A,B,C)", required: false, translatable: false }
          - { name: publication_type, type: "enum(journal,conference,workshop,preprint)", required: false, translatable: false }
          - { name: publication_date, type: date,           required: false, translatable: false }
          - { name: doi,              type: string,         required: false, translatable: false }
          - { name: url,              type: string,         required: false, translatable: false }
          - { name: pdf_url,          type: string,         required: false, translatable: false }
          - { name: github_url,       type: string,         required: false, translatable: false }
          - { name: slides_url,       type: string,         required: false, translatable: false }
          - { name: citation_count,   type: int,            required: false, translatable: false }
          - { name: is_peer_reviewed, type: bool,           required: false, translatable: false }
          - { name: sort_order,       type: int,            required: false, translatable: false }
      - role: awards
        required: false
        order: 50
        shape: entry_list
        entry_fields:
          - { name: title,                 type: string, required: true,  translatable: true }
          - { name: awarding_organization, type: string, required: true,  translatable: true }
          - { name: award_date,            type: date,   required: false, translatable: false }
          - { name: award_type,            type: string, required: false, translatable: true }
          - { name: amount,                type: float,  required: false, translatable: false }
          - { name: description,           type: text,   required: false, translatable: true }
          - { name: url,                   type: string, required: false, translatable: false }
          - { name: certificate_url,       type: string, required: false, translatable: false }
          - { name: sort_order,            type: int,    required: false, translatable: false }
      - role: research
        required: false
        order: 60
        shape: entry_list
        entry_fields:
          - { name: title,          type: string,       required: true,  translatable: true }
          - { name: start_date,     type: date,         required: false, translatable: false }
          - { name: end_date,       type: date,         required: false, translatable: false }
          - { name: is_ongoing,     type: bool,         required: false, translatable: false }
          - { name: location,       type: string,       required: false, translatable: true }
          - { name: research_type,  type: string,       required: false, translatable: true }
          - { name: funding_source, type: string,       required: false, translatable: true }
          - { name: funding_amount, type: float,        required: false, translatable: false }
          - { name: details,        type: "list<text>", required: false, translatable: true }
          - { name: sort_order,     type: int,          required: false, translatable: false }
      - role: skills
        required: false
        order: 70
        shape: key_value_list

# ---------------------------------------------------------------------------
# relations — relation types and canonicalization (per 10 §10.5, 01 §1.8.2)
# ---------------------------------------------------------------------------
relations:
  types: [evolved_into, evolved_from, documents, references, supersedes, part_of]
  canonical:
    evolved_from: { store_as: evolved_into, flip: true }
    evolved_into: { store_as: evolved_into, flip: false }
    documents:    { store_as: documents,    flip: false }
    references:   { store_as: references,   flip: false }
    supersedes:   { store_as: supersedes,   flip: false }
    part_of:      { store_as: part_of,      flip: false }
  ordered: [part_of]

# ---------------------------------------------------------------------------
# errors — validation error severity levels (per 10 §10.6)
# ---------------------------------------------------------------------------
errors:
  fatal:
    - missing_required_frontmatter
    - invalid_enum_value
    - kind_mismatch
    - slug_pattern_violation
    - missing_required_part
    - missing_part_id
    - relation_target_not_found
    - entry_field_violation
  warn:
    - main_field_lang_mismatch
    - empty_optional_part_dir
    - unknown_frontmatter_field
  info:
    - canonical_lang_only
```

## Field placement rules (how the parser decides where a field is read from / written to)

1. **Structured, enumerable, indexable** fields go in the frontmatter and land
   as columns of the content main table.
2. **Long prose text in a prose Part** goes in the Part body (`.md`) and lands
   in the `item_part` table.
3. **Identity and translation metadata** go in `parts/<role>/meta.toml` and
   land as identity columns of `item_part`.
4. **`entry_list` / `key_value_list` Parts** have no markdown body; they are
   read from `<lang>.toml` and land in `part_entry` + `part_entry_translation`.
5. **Language-neutral fields are read only from `canonical_lang`**; if a
   non-canonical file also writes such a field, the value is ignored and a
   `warn: main_field_lang_mismatch` is raised.
6. **`status` and `visibility` are never merged** — `status` is the lifecycle,
   `visibility` is the visibility; only `visibility=public` lets the
   `SiteProjector` project an Item.
