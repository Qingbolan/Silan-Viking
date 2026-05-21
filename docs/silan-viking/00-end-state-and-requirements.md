# 00 · End state and requirements

> The first chapter of the silan-viking design — everything is back-cast from here.

## §0.1 End state

silan-viking is not a website, and it is not a content engine.

> **It is silan's one-person context system: it continually captures and
> structures his ideas — from a fleeting spark, to an article in
> progress, to a project that has taken shape — and lets any
> collaborating agent understand him. The personal website is a
> selective outward projection of the mature content inside that
> context.**

### The picture of the end state

silan speaks to a device that has silan-viking installed, or to an
agent that carries this skill. He doesn't "enter content"; he just
**thinks**:

- He voices a half-formed thought → the agent captures it into context.
- A few days later he mentions it again → the agent recognises it isn't
  new, helps him think it through, and it becomes an article.
- It matures → the agent helps him turn it into a project and tracks
  progress.
- He says "this can go public" → the agent **selectively projects** it
  onto the personal website.
- At the same time, any new agent that comes to collaborate → reads
  his context first and understands him on day one.

There is **no "manage the website"** in this picture. The website is a
skin that grows over the context once it is mature. silan only ever
manages "his ideas".

### Three faces

silan-viking = the **carrier** of ideas + a **service layer** of ideas
for agents + a **projection layer** of ideas onto the world.
Mapped to implementation:

- carrier → `content/` + database (see `01-oop-structure.md`)
- service layer → MCP (see `03-mcp-service.md`)
- projection layer → website (`SiteProjector`)

## §0.2 Requirement baseline — confirmed requirements, no new additions

| # | Requirement |
|---|---|
| 1 | markdown as source of truth + SQLite as read-only cache + Docker deployment |
| 2 | Latest content layout: `content/resources/{type}/{item}/parts/<role>/{meta.toml,<lang>.<ext>}` + `content/agent/` + `.silan-cache` registry; **6 types: blog/projects/ideas/episode/resume/update** (see note below) |
| 3 | Single piece → series; two kinds of series coexist (container + collection) |
| 4 | idea→blog→project directed evolution edges (three distinct items + an evolution relation) |
| 5 | Episodes of a container series belong only to the series — they do not appear in the blog list |
| 6 | Rust rewrite under the new `engine/` directory; the Go backend stays and adapts to the new derived library; the legacy Python `silan` is reference / archive only — no runtime fallback, no requirement to be compatible with the legacy on-disk layout |
| 7 | OOP structure; finalise SCHEMA before writing code |
| 8 | CLI style matches EasyNet-Cli (noun-first `<binary> <noun> <verb>`) |
| 9 | Naming: project/binary/crate = `silan-viking` (`silan-viking-*`); user command = `silan`; protocol = `silan://` |
| 10 | The agent can search / update memory / update published content (through proposals) |
| 11 | The agent can maintain the website (lint / draft / summarise + selective deploy) |
| 12 | End state: communicate with a device/agent to capture an idea → assist writing an article → turn it into a project → selectively deploy; meanwhile improve the collaborating agent's understanding of the owner (context enrichment) |
| 13 | Single-tenant — serves only the owner |
| 14 | When `silan site` or MCP deploys, automatically generate frontend crawler-visibility artefacts: sitemap.xml + robots.txt, JSON-LD structured data, pre-rendered static HTML for public pages, per-page meta (including OG / Twitter Card) |
| 15 | CLI and MCP can query live interaction data for a specific item — view / comment stats for an idea/blog page or a chapter; can look up a visitor's browser fingerprint and IP; can identify visitor kind (human / search-engine crawler / AI crawler) and traffic source kind (search / social / AI chat / direct / on-site referral) |
| 16 | A collaborating agent connects through a skill with zero configuration — `silan` can emit a skill bundle; once installed into a Claude agent, the agent auto-discovers silan-viking and, when silan "voices an idea / writes / pushes a project forward", automatically calls it through MCP — no manual MCP wiring required |

> **Design discipline**: every object / command / interface must point
> back to one of the `#` rows above. If it can't, delete it.
> Every chapter in this directory marks which requirement it serves.
>
> **#2 type-count correction**: requirement #2 originally said "5
> types". `update` is in fact a content shape silan was already using
> (Python had an `update_parser`; Go ent had a `recent_updates`
> table); it was dropped when the requirement baseline was first
> gathered. The final ruling is that `update` is the 6th content type
> (see `10` §10.4.6 decision ledger #3). #2 is corrected to 6 types
> accordingly. The container series (`#3`/`#5`) is carried by
> `episode`, which is its own independent type (see `10` §10.4.4
> decision #1).
>
> **#16 retro-addition**: the end-state picture (§0.1) explicitly says
> "speak to an agent **carrying this skill**", but the earlier
> requirement baseline only ran to #15; skill distribution was both
> demanded by the end-state picture and had no corresponding `#` — a
> gap in the baseline. It was added as #16 during review. It is not
> an implementation detail of #12: #12 is "the agent has capture /
> writing / deploy abilities", #16 is "how those abilities reach an
> agent with zero configuration" — a distinct distribution face. The
> `silan skill` command group and the skill bundle artefact point
> back to #16 (see `13-skill-distribution.md`).

## §0.3 Inherited abstractions (read out of Python `silan`, not invented)

silan-viking's OOP isn't a clean-slate design — Python `silan` already
runs a battle-tested set of abstractions; the Rust rewrite translates
and strengthens them, it doesn't start from zero:

- `ParserFactory` — dispatches by content_type (factory pattern)
- `BaseParser` (abstract base) → six concrete parsers: resume / project / blog / idea / update / episode
- `ExtractedContent` — parse result: main_entity + translations + tags + images + hash
- `.silan-cache` — per-collection / per-item YAML registry (`sync_metadata` + file manifest)
- `database_sync_logic/` — SQLAlchemy ORM + 5 sync mixins that write parse results to the database

> The Rust rewrite = express that proven set of abstractions in Rust
> traits / structs + add the CLI and MCP faces. See
> `01-oop-structure.md`.

## §0.4 Whole-disk picture — what is on disk once silan-viking is installed and running

> Directory trees show up in three other chapters (the code tree in
> `01` §1.9, the content tree in `06` §6.2.1, the test repo in `05`
> §5.2). This section is **the assembly box for those three** — one
> top-level picture so a new reader can see "after install, how many
> piles of stuff are on disk, what each is, which is truth and which
> is derived" before diving into details.

A fully running silan-viking has **four piles** on disk across three locations:

```
① Binary             /usr/local/bin/silan         the installed executable (binary
                                                  name silan-viking, enters PATH as silan)

② Global config      ~/.config/silan/             cross-project, set up once at install
                                                  (XDG standard location)
                     └── config.toml              [project].path / [llm] / [mcp]

③ Content project    ~/.silan-viking/             ★ source of truth lives here. Default
                                                  address; --path overrides
                     ├── silan-viking.toml        project config ([identity]/[database]/[deploy]…)
                     ├── .gitignore
                     ├── _deploy/
                     │   └── portfolio.db         ← derived cache: produced by content/ sync, rebuildable
                     └── content/                 ← source of truth: a git repo, markdown lives here
                         ├── SCHEMA.md   index.md   log.md
                         ├── resources/           ← namespace ①: published content
                         │   └── blog/ ideas/ projects/ episode/ resume/ update/
                         │       └── <item>/parts/<role>/<lang>.<ext>  (details: 06 §6.2.3)
                         └── agent/               ← namespace ②: agent context, never published
                             └── project/ notes/ silan/ sessions/   (details: 01 §1.2.1)

   The agent proposal area is not a disk directory — it's a set of git
   branches (proposal/<ulid>) inside the content/ repo, never on main
   (see 03 §3.1).

④ Engine source      <silan-viking repo>/engine/  needed only by engine developers;
                                                  end users don't have this pile
                     └── crates/ silan-viking-{base,content,entities,app,cli,mcp,site}
                                                  (7 member crates + workspace root, details: 01 §1.9)
```

**The four piles, who is who — one line each**:

| Pile | Location | What it is | Who produces it, is it rebuildable |
|---|---|---|---|
| ① binary | `/usr/local/bin/silan` | executable | produced by install |
| ② global config | `~/.config/silan/config.toml` | cross-project config | generated by `silan init` at install time; edited by humans |
| ③a content source of truth | `~/.silan-viking/content/` | **only source of truth**, markdown, git repo | written by humans / edited by agents through proposals |
| ③b derived cache | `~/.silan-viking/_deploy/portfolio.db` | SQLite, consumed read-only by the Go API | produced by `silan index sync` from ③a, **rebuildable at any time** |
| ③c project config | `~/.silan-viking/silan-viking.toml` | project-level config | generated by `silan init`, edited by humans |
| ④ engine source | `engine/crates/` | Rust, 7 member crates (+ workspace root) | only engine developers have it; end users don't |

**Load-bearing judgement — one sentence**: `content/` is the source of
truth, `portfolio.db` is its derived cache and can be rebuilt by
`silan index sync` after deletion; config is two layers (global
`~/.config/silan/` + project `silan-viking.toml`); the engine source
is separate from the user's content project — end users only have
①②③.

> The three detail trees cover their own pieces: **code** → `01`
> §1.9; **content** → `06` §6.2.1; **test repo** → `05` §5.2. This
> section is the main entry to all three — read this picture first
> to know how many piles exist and where each one lives, then drill
> down to the appropriate detail tree as needed.
