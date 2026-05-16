---
name: silan-blog
description: Manage and update the Silan Personal Website portfolio/blog platform — create and edit content (blog posts, projects, ideas, episodes, resume), sync markdown content to the database, run the Go backend and React frontend, and configure databases. Use whenever the user wants to add, edit, publish, or update content on their personal website, run the `silan` CLI, sync content to a database, or start/build the backend or frontend of this project.
---

# Silan Personal Website — Content Management & Update

This project is an AI-powered personal portfolio/blog platform with three layers:

- **Python CLI (`silan`)** — file-based content management + markdown→database sync. Source: `silan-personal-website/`
- **Go backend** — Go-Zero microservices serving content over REST. Source: `backend/`
- **React frontend** — TypeScript + Vite + Tailwind UI. Source: `frontend/`

The core workflow is **file-first**: you write Markdown content in a `content/` directory, then `silan db-sync` pushes it into a database that the backend serves to the frontend.

## When to use this skill

Use it for any request about adding/editing/publishing content, running the `silan` CLI, syncing to a database, or building/running the backend or frontend.

## First step: orient yourself

Before acting, determine what the user has:

1. Check if `silan` CLI is installed: `silan --version` (if not, see [Setup](#setup)).
2. Locate the content root — look for a `content/` directory or a `silan.yaml` config file. Content lives in a portfolio project created by `silan init`, **not** necessarily in this repo's root.
3. Check sync state with `silan status` and the `.silan_last_sync.json` file.

If anything is ambiguous (which content type, which language, which database), ask the user before making changes.

## Core workflows

### Create new content

```bash
silan new <type> <name> [options]
# type: blog | project | idea | episode | resume
```

Common options: `--title`, `--description`, `--category`, `--tag` (repeatable), `--language en|zh|both`, `--status`, `--type` (subtype, e.g. `vlog`, `tutorial`).

```bash
silan new blog "my-post" --title "My First Post" --tag ai --tag tutorial
silan new project "ai-platform" --title "AI Platform" --language both
silan new idea "research-concept" --description "A new research direction"
```

This scaffolds a directory under `content/<type>/<name>/` with templated Markdown files and a `.silan-cache` config. See `references/content-structure.md` for the exact file layout per type.

### Edit existing content

```bash
silan edit --type <type> --name <name> --part <part>
# part: readme | notes | references | timeline | quickstart |
#       dependencies | releases | structure | license
silan edit --file content/ideas/my-idea/README.md   # or edit a direct path
```

You can also edit the Markdown files directly with the Edit/Write tools. Preserve the YAML frontmatter block (`---...---`) at the top — it drives database fields. See `references/frontmatter.md`.

### Discover content

```bash
silan ls [type]              # list content items
silan show <type> <name>     # show one item's details
silan search "<query>"       # full-text search across content
silan status                 # project + sync status
```

### Sync content to the database (publish updates)

After creating or editing content, sync it so the live site reflects changes:

```bash
silan db-config interactive   # one-time: configure DB connection
silan db-sync --dry-run       # preview what will change — always do this first
silan db-sync                 # apply the sync
silan db-sync --create-tables # first sync: also create schema
```

Database types: `sqlite` (default, local dev), `mysql` (production), `postgresql`. Config is cached after the first run; `silan db-sync` reuses it. **Always run `--dry-run` before a real sync** and confirm the diff with the user when changes are non-trivial.

### Run / build backend and frontend

```bash
silan backend start --db-type sqlite --db-path portfolio.db
silan backend status | stop | logs
silan backend install         # build the Go binary

silan frontend install        # install static frontend
silan frontend install --dev  # install full dev project
```

For local frontend dev directly in this repo: `cd frontend && npm install && npm run dev`.

## Editing the React frontend

The frontend in `frontend/src/` is a standard React 18 + TypeScript + Vite + Tailwind app. Components are organized by feature (`components/Resume/`, `components/BlogStack/`, `components/ProjectGallery/`, `components/IdeaPage/`). When changing UI, match the existing component patterns, run `npm run build` / lint to verify, and keep i18n (`src/i18n/`, English + Chinese) in sync.

## Critical guidance

- **Content is the source of truth.** Edit Markdown files, then sync — do not edit the database directly.
- **Never lose frontmatter.** The `---...---` YAML block at the top of content files maps to DB columns.
- **Always `--dry-run` first** before `silan db-sync`, and surface the diff to the user.
- **Multi-language**: `en.md` / `zh.md` filename variants, or `--language both`. Keep both versions consistent when the user maintains a bilingual site.
- Syncing to a **production** MySQL/PostgreSQL database is an outward-facing change — confirm with the user before running it.
- If `silan` is not installed or no `content/` directory exists, the user needs setup first — don't guess paths.

## Setup

```bash
pip install silan-personal-website        # install the CLI
silan skill install                       # install/refresh this skill itself
silan init my-portfolio                   # scaffold a new portfolio
cd my-portfolio
```

This skill ships inside the `silan` package. `silan skill install` copies it into
`~/.claude/skills/` (use `--project` for `./.claude/skills` to share via the repo,
`--force` to overwrite). Run `silan skill status` to see install state.

Requirements: Python 3.9+, Go 1.23+ (backend), Node.js 18+ (frontend).

## Reference files

- `references/content-structure.md` — directory layout and files for each content type
- `references/frontmatter.md` — YAML frontmatter fields per content type
- `references/cli-commands.md` — full `silan` CLI command reference
