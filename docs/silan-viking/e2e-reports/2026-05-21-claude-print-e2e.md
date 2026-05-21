# 2026-05-21 · End-to-end experiment with `claude --print` (claude -p)

> One full pass from "zero on disk" to "ready to publish", driven by
> the non-interactive `claude --print` mode talking to a freshly
> compiled `silan-viking` binary — once via plain Bash tool calls,
> once via the `silan-viking` MCP server.
>
> Purpose: validate the GOAL §1 owner-view tape end-to-end against
> the real binary, and surface friction the docs haven't yet recorded.

## Setup

```
Binary:   /tmp/e2e-silan/bin/silan-viking                  (cargo install from current source)
Project:  /tmp/e2e-silan/project                           (--content + --db isolated)
Skill:    /tmp/e2e-silan/skills/{SKILL.md,reference/mcp-tools.md}
MCP cfg:  /tmp/e2e-silan/mcp-config.json                   (claude --mcp-config target)
Driver:   claude --print (CLI version 2.1.146)
```

Every command run against the project pointed at the isolated paths via
`--content` and `--db`; the live repo's own `content/` and `portfolio.db`
were never touched.

## What ran end-to-end

| Stage | Command / actor | Outcome |
|---|---|---|
| A — install | `cargo install --path engine/crates/silan-viking-cli --root /tmp/e2e-silan` | ✅ `silan-viking 0.1.0` on PATH at `/tmp/e2e-silan/bin/silan-viking`. `--help` banner + `doctor` work. |
| B — init | `silan-viking ... init` | ✅ Project laid: `content/{SCHEMA.md, resources/{blog,episode,ideas,projects,resume,update}, agent/}`, `silan-viking.toml`, `git init` + initial commit. |
| C — claude -p (no MCP) | `echo PROMPT \| claude --print --permission-mode acceptEdits --allowedTools 'Read' 'Edit' 'Write' 'Bash'` to create an idea + write 280 chars of real Motivation/Approach + `index sync` | ✅ idea on disk + `items=5 rows=21` in `portfolio.db`. |
| D — skill bundle | `silan-viking skill emit --path /tmp/e2e-silan/skills` | ✅ `SKILL.md` (with the correct description + the natural-language → MCP tier table) + `reference/mcp-tools.md`. |
| D — MCP via `--mcp-config` | `claude --print --mcp-config ...` invoking `mcp__silan-viking__{context_brief, list, capture}` | ✅ Handshake (`schema_version=1`, `content_commit=242e5bd`); `context_brief` + `list` + `capture` all returned cleanly. `capture` produced a `proposal/<ulid>` branch. |
| E — proposal review | `silan-viking proposal show <id>` + `accept` | ✅ accept-merged via `expected_head` ref update; main advanced cleanly. |
| F — index sync | `silan-viking index sync` after accept | ✅ 6 items / 35 rows; ideas / blog / projects / personal_info / *_translations / item_part all populated. |
| F → wrote a real blog | `claude --print --mcp-config ... mcp__silan-viking__propose` writing a 350-char authored blog body | ✅ Proposal landed; CLI accept + sync. Blog `learning-mcp` lives at `resources/blog/learning-mcp/parts/body/en.md`. |
| G — publish + lint | `silan-viking blog publish learning-mcp` + manual `visibility=public` (see bug #3) + `silan-viking content lint` | ⚠️ Publish only flipped `status`, not `visibility` (see bug #3); lint clean (6 info, 1 warn, 0 fatal). |
| H — site build | `silan-viking site build --out ...` | ⚠️ Only emits 3 SEO artefacts (sitemap.xml / robots.txt / site-index.jsonld). No per-page meta, no pre-rendered HTML, no local server (see bugs #4 + #5). |

End-to-end happy path: **runs**. From `cargo install` to `learning-mcp`
ready in `_deploy/portfolio.db` with a real human-authored body, every
step worked.

## Five real bugs found

These are reproducible against `silan-viking 0.1.0` from this branch.

### Bug #1 — `capture(type=idea)` doesn't create a `resources/ideas/<slug>/` Item

**Where**: MCP `capture` tool, when called with `type=idea`.

**Expected (per GOAL §1, USAGE §6, 03 §3.1)**: "voicing a half-formed
thought" → `capture` opens a new Item under
`silan://resources/ideas/<slug>/parts/overview/en.md`, with the note as
the body of the overview Part. The proposal touches `resources/`.

**Actual**: `capture` writes one raw line into
`content/agent/notes/<ulid>.md` and returns `touched=silan://agent/notes/<ulid>`.
No Item is created under `resources/ideas/`. The `type` argument is
accepted but ignored.

**Severity**: high — it directly contradicts the end-state picture in
GOAL §1.2 ("silan voices a half-formed thought → agent captures it
into context → it becomes a new Item"). Today the path is "drop a
plain-text note into agent memory"; the owner has no proposal-shaped
Item to accept and there is no Item URI to anchor later edits to.

**Possible fix locations** (not done in this pass):
- `silan-viking-mcp` `capture` dispatch: when `type` is one of the 6 content kinds, create a real Item scaffold (mirroring `silan idea new <slug>`), then `propose` the body. Reserve `agent/notes` for `type=note` or unkeyed captures.

### Bug #2 — `capture`'s proposal branch is contaminated by uncommitted working-tree edits

**Where**: MCP `capture` (also `propose`, likely — same code path).

**Expected (per 03 §3.1)**: a `capture` / `propose` proposal branch
"only stages `content/agent/**` for `capture` / only stages the touched
Part directory for `propose`"; the proposal branch is identical to
main + the agent's draft, nothing else.

**Actual**: when `capture` ran, the working tree had uncommitted edits
to `resources/ideas/rust-portable-kv/parts/overview/{meta.toml, en.md}`
from a prior `silan-viking idea new` + manual edit. The capture commit
on `proposal/<ulid>` swept those 33 + 5 = 38 lines into the proposal
too, so `proposal show` reports `touched=silan://agent/notes/...` but
`git diff main..proposal` shows three files changed.

**Severity**: medium — the listed `touched` is correct, but the
proposal's actual diff contains files the agent never declared
touching. If the owner accepts on the basis of `touched`, they may
land changes they didn't intend to. `03` §3.1 explicitly says proposal
branches must only contain the agent's draft; this implementation
ignores stash / WIP state.

**Possible fix**:
- Before `capture` / `propose` creates the proposal commit, `git stash` (or refuse to proceed if the working tree isn't clean against `agent/**` for `capture` and the Part dir for `propose`).

### Bug #3 — `silan blog publish` doesn't flip `visibility`

**Where**: `silan-viking blog publish <slug>`.

**Expected (per USAGE §3 table: "blog publish can set status=published and visibility=public in one go"; GOAL §6.5)**: a single `blog publish` is enough for an Item to reach the public site.

**Actual**: `blog publish learning-mcp` only edits the frontmatter
`status: draft → published`. `visibility` stays at `private`. Without a
second manual `sed` (or a hypothetical `silan site publish <uri>`), the
post is `published` but never projected.

**Severity**: medium — it's the most common owner flow ("write blog →
publish → see it live"). Today that flow takes a second step the docs
imply is folded into the first.

**Possible fix**:
- `blog publish` writes both `status: published` and `visibility: public` to the body Part's frontmatter (matching the USAGE table).
- Alternative: rename to `blog draft-to-published` and add a separate `silan site publish <uri>` for the visibility flip (this matches `02-cli-service.md`'s split of `site publish` from `blog publish`; the implementation gap is that `site publish` is missing too — verified by `silan-viking site --help`).

### Bug #4 — `sitemap.xml` includes draft / private Items

**Where**: `silan-viking site build` / `silan-viking-site::SeoEmitter`.

**Expected (per GOAL §7 #14, 01 §1.6.1, 01 §1.7)**: SiteProjector projects only `visibility=public` Items; the sitemap is the public-page URL list.

**Actual**: every Item is listed regardless of `status` or
`visibility`. The fresh project's sitemap contains `first-idea`
(draft/private), `welcome` (draft/private), `first-project`
(draft/private), `resume` (private), `rust-portable-kv`
(draft/private), and the one genuinely public `learning-mcp`.

**Severity**: high (privacy / production correctness). A naive `site
deploy` would publish six URLs that point at content the owner marked
private.

**Possible fix**:
- `SiteProjector::query` filters on `visibility = 'public'` (per 01 §1.7 layer 2) before handing the Item list to `SeoEmitter`.

### Bug #5 — `site preview` does not preview (already documented as GOAL §8.8.2 A1)

**Where**: `silan-viking site preview` (and the related `site status` mis-text).

**Expected**: per USAGE §5 / GOAL §1 / 06 §6.5, `site preview` unpacks
the embedded `frontend.tar.gz` + `backend.tar.gz`, starts a local
instance against `_deploy/portfolio.db`, and lets the owner see their
site in a browser. `site status` reports liveness.

**Actual**:
- `site preview` is aliased to `site build`: it emits the three SEO
  artefacts and exits. No `npm run dev`, no local server, no browser
  preview.
- `site status` errors with `silan site deploy needs a [deploy] section
  in silan-viking.toml` — the text was copied from `deploy` and
  `status` should not hard-depend on `[deploy]`.

**Severity**: high — the engine embeds the full frontend tarball
specifically so a camera-ready user can `silan site preview` to see
their site without a Node toolchain. The current implementation
defeats that promise; for the camera-ready user, `silan init` →
`silan site preview` shows an empty directory.

**Status**: this is the A1 + A3 gap GOAL §8.8.2 already records; this
run reproduces it verbatim. M9's acceptance criterion needs to be
re-stated to include a working `site preview`, then re-tested.

## Friction points (not bugs, but worth noting)

### F1 — `claude --print` + `--allowedTools` variadic eats the prompt

```
# Broken — the prompt is consumed by --allowedTools' variadic positional
claude --print --allowedTools 'Read,Edit,Write' "your prompt here"
# → Error: Input must be provided either through stdin or as a prompt argument
```

The working invocation is to pipe the prompt via stdin:

```
echo "prompt" | claude --print --allowedTools 'Read' 'Edit' 'Write' 'Bash'
```

This isn't a silan-viking bug, but it's a real friction point when
scripting `claude --print` against MCP. Anyone writing an automated
pipeline will hit it. Could be worth a note in `13-skill-distribution`
or `07-playbooks`.

### F2 — `--content` and `--db` are required for non-default project paths

The doc says `silan init` lays the project under `~/.silan-viking/`
by default; an isolated experiment in `/tmp/...` needs both
`--content` and `--db` flags on **every** subsequent CLI invocation,
because cwd-discovery isn't recursive across alternate roots. If
someone runs `silan-viking idea new x` from `/tmp/e2e-silan/project`
expecting cwd discovery, it instead operates against the cwd-found
`content/` from the silan-viking source repo it was compiled from.

Workaround: always pass `--content $PROJ/content --db $PROJ/_deploy/portfolio.db`.

The cleaner fix would be: cwd-discovery climbs `..` until it finds a
`silan-viking.toml` (like `git rev-parse --show-toplevel`).

### F3 — Subagent permission prompts in claude --print

When `claude --print` is given a Bash command pointed at a binary not
in its auto-allowed list, each invocation blocks waiting for a
permission approval the harness can't deliver. The agent ends up
"using my budgeted calls fighting the approval prompts" rather than
making progress.

Workaround: pass the binary's path explicitly to `--allowedTools` or
pre-register it in `~/.claude/settings.json` permissions.

## What this experiment validated

- **GOAL §7 #1** (md→SQLite→Docker baseline): ✅ md → SQLite path proven; Docker not tested in this round.
- **GOAL §7 #2** (6 type + parts/role): ✅ all six type directories present after `init`; one idea + one blog created and synced cleanly.
- **GOAL §7 #6** (Rust engine end-to-end): ✅ `cargo install` from current source → fresh project → MCP server → real content edits — every step run through the new Rust binary, no Python touched.
- **GOAL §7 #10** (agent reads / writes / proposes): ✅ `context_brief` / `list` / `capture` / `propose` all functional through MCP; `accept` lands proposals via `expected_head` ref update; main moved 0 → 3 commits cleanly.
- **GOAL §7 #16** (skill zero-config): ⚠️ The skill bundle is correctly emitted, but Claude's `~/.claude/skills/` auto-discovery wasn't tested in this run — instead `--mcp-config` was used as a direct equivalent. Both reach the same MCP server; the skill bundle's *discoverability layer* still needs a separate camera-ready test.

## What this experiment did **not** validate

- `silan site deploy --confirm` (no `[deploy]` configured; this is a single-host docker pipeline we didn't want to run against the live repo).
- Cross-machine SSH ship.
- `silan stats sync` from a real running backend.
- The `propose_schema` E2 path (not implemented in this build).
- The MCP `--enable-deploy` and `--enable-evolve` gates (only the default-17-tool surface was exercised).

## Suggested follow-ups, ordered by user impact

1. **Bug #1 (`capture` doesn't create Items)** — biggest semantic gap; the agent-flow story in GOAL §1.2 doesn't actually work.
2. **Bug #4 (sitemap leaks drafts)** — privacy / production correctness.
3. **Bug #5 (`site preview` is silent)** — already on the books as A1; promoted by this run.
4. **Bug #3 (`blog publish` half-job)** — affects every owner flow.
5. **Bug #2 (capture sweeps WIP)** — only triggers when the working tree is dirty, but the consequence (silent extra commits) is severe.
6. Add `cd $PROJ`-relative discovery climbing for `silan-viking` so `--content` / `--db` are needed only for non-standard projects.

## Reproducibility

Every command run in this experiment is recoverable from the git log
of this commit + the conversation transcript. The /tmp/e2e-silan
directory is throwaway; recreating it = re-running the steps in the
"What ran end-to-end" table above.
