# `silan` CLI Command Reference

Run `silan help [topic]` for in-tool help. `-v` / `--verbose` enables verbose output on any command.

## Project setup

```bash
silan init <project_name> [--language en|zh|both] [--with-backend]
```
Scaffolds a new portfolio project with content templates. `--with-backend` also adds Go backend config.

## Skill management

```bash
silan skill install [--name <skill>] [--project] [--force]
silan skill uninstall --name <skill> [--project]
silan skill status            # show bundled skills and install state
```
Installs the bundled Claude Code skill (`silan-blog`) so AI assistants can manage
the site. Default target is `~/.claude/skills`; `--project` targets `./.claude/skills`
(shareable via the repo); `--force` overwrites an existing install.

## Content creation

```bash
silan new <type> <name> [options]
```
- `type`: `blog` | `project` | `idea` | `episode` | `resume`
- Options: `--title`, `--description`, `--category`, `--tag <t>` (repeatable),
  `--language en|zh|both`, `--status <s>`, `--type <subtype>`

```bash
silan projects create        # interactive project scaffold
silan ideas create           # interactive idea scaffold
```

## Content editing & discovery

```bash
silan edit --type <type> --name <name> --part <part> [--editor <ed>]
silan edit --file <path>
#   part: readme | notes | references | timeline | quickstart |
#         dependencies | releases | structure | license
silan append --type <type> --name <name> --part <part>   # append to a file
silan write ...                                          # write content to a file

silan ls [type]              # list content items
silan show <type> <name>     # show item details
silan search "<query>"       # search across all content
silan status                 # project + sync status
```

## Database sync

```bash
silan db-sync [options]
#   --db-type mysql|postgresql|sqlite
#   --host --port --user --password --database   (MySQL/PostgreSQL)
#   --db-path portfolio.db                       (SQLite)
#   --dry-run            preview changes only
#   --create-tables      create tables if missing
#   --start-backend      start backend after sync
#   --use-cache          reuse cached DB config (default on)

silan db-config --action <action>
#   action: show | set | cache | load-cache | clear-cache |
#           interactive | last-sync | clear-all
```

Recommended publish flow:
```bash
silan db-sync --dry-run     # 1. preview
silan db-sync               # 2. apply
```
First-ever sync: add `--create-tables`.

## Backend management

```bash
silan backend start [--db-type sqlite --db-path portfolio.db]
silan backend stop
silan backend status
silan backend logs
silan backend install        # build the Go binary
```

## Frontend management

```bash
silan frontend install        # install static frontend files
silan frontend install --dev  # install full development project
```

## Configuration file: `silan.yaml`

Lives in the project directory:

```yaml
project:
  name: "My Portfolio"
  language: "en"
database:
  type: "sqlite"
  path: "portfolio.db"
auth:
  google_client_id: "your-client-id"
content_types:
  - blog
  - projects
  - ideas
  - resume
  - episode
```
