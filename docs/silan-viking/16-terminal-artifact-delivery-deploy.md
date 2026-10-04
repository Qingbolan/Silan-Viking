# 16 · Unified content release and code delivery architecture

> Decision owner: Silan.Hu · Status: settled · Revised: 2026-09-09

## 16.1 Decision

Production has one content promotion authority and one code deployment target:

- Content is released through the authenticated Go `/api/v1/content/deploy`
  transaction.
- Production code targets the managed Nginx/systemd installation.
- Docker Compose is a local preview adapter, not a production deployment mode.
- The CLI does not embed frontend, backend, or deploy source trees.

The public commands remain stable. `site update-content` and
`site deploy --what=content` are two CLI spellings for the same Rust
`DeliveryControl` use case.

## 16.2 Ownership boundaries

```text
content/ Git revision
  -> Rust validation and SQLite projection
  -> versioned HTTPS bundle
  -> Go content deployment state machine
  -> PostgreSQL projection + media generation
  -> frontend prerender
  -> immutable static release
  -> verification response
```

| Boundary | Owner | Invariant |
|---|---|---|
| Authored research | `content/` Git repository | Public resources must be clean and committed before release. |
| Local projection | Rust application layer | SQLite is disposable and stamped with the full content commit. |
| Production promotion | Go content-deploy service | Clients cannot write production tables or media over SSH. |
| Static public output | Frontend publisher | Sitemap, RSS, robots, localized HTML, JSON-LD and `llms.txt` have one production owner. |
| Runtime facts | PostgreSQL/runtime API | Comments, visits and authentication are not transported in content bundles. |
| Public-source recovery | Versioned production release | A checksum-bound `SCHEMA.md` + `resources/` archive can rebuild a lost public authoring tree. |
| Private authoring context | Private content Git remote | `agent/` and the original Git history never enter a production release. |
| Local preview | Docker Compose | Preview state is disposable and never becomes a production fallback. |

## 16.3 Content release state machine

```text
receiving -> validated -> promoting -> verifying -> rendering -> complete
      \____________ any non-terminal failure _____________/ -> failed
```

The server serializes content transactions with a process mutex. Static
publication has a separate filesystem lock. A successful response means:

1. Bundle checksum, schema version and embedded projection provenance match.
2. Required media exists and the desired media generation is live.
3. PostgreSQL reports the expected content hash and commit.
4. The frontend rendered from the current immutable code baseline.
5. Sitemap and RSS are well-formed and cover the content routes used to build them.
6. The static publisher emitted and promoted a verified release identifier, then
   fetched the public Sitemap, RSS and release manifest with matching content provenance.

No normal content release stops the API, downloads the live database, uploads a
replacement database, or mirrors media through SSH.

## 16.4 Build versus render

Frontend publication has four explicit operations:

| Operation | Purpose |
|---|---|
| `prepare` | Install the pinned Node dependencies and Chromium runtime. |
| `compile` | Run TypeScript/Vite once and install an immutable code baseline. |
| `publish` | Restore that baseline, prerender current content, verify Sitemap/RSS coverage, atomically promote, then verify the public release. |
| `build` | Compile and publish for a frontend-only code release. |

A content release invokes only `publish`. Therefore editing a paper, project,
or research page does not recompile application code.

Prerendering keeps a persistent cache in `$SILAN_FRONTEND_STATE_ROOT/cache/prerender`.
Each page records its HTML integrity hash, renderer identity (compiled assets,
configuration, renderer code and site profile), embedded route data, and the
public API/list responses actually read by that page. Unchanged pages reuse
HTML; changed or unavailable dependencies force rendering. Code/asset changes
conservatively invalidate every page; component-level build dependency tracking
is not implemented. Current route discovery remains authoritative, so deleted
routes are never restored from the cache. Sitemap and feed verification always
run, including when every page is reused.

A per-release query snapshot deduplicates identical public JSON requests across
route discovery, rendering and SEO exports. Public prerendering does not request
personal login sessions. Failed or untracked data requests prevent cache reuse.
This reduces repeated reads and browser rendering; it does not implement an API
change feed or avoid querying each unique dependency to validate freshness.

Every static generation writes `release-manifest.json` with the content commit,
content hash, schema version, project code commit, frontend artifact digest,
release ID and generation time.

## 16.5 Code artifact rule

Frontend and backend transports materialize component trees with `git archive`
from one committed project revision. They do not rsync the mutable worktree.
This gives code delivery a stable provenance boundary and prevents unrelated
local edits from leaking into production.

Backend code is cross-compiled locally using Go and Zig, with CGO enabled and
musl linked statically. The target is discovered with read-only `uname` over SSH;
Linux x86_64 and aarch64 are supported. Both the API and sqlite2pg importer must
build from the committed source and pass ELF architecture/static-link checks
before any remote mutation (including for `--what=all`). Go and Zig must be on
local PATH. Missing tools, unsupported targets, or compilation failures stop the
release; there is no remote compilation fallback.

The transport uploads only the binaries, verifies checksums, stages both files,
then installs each using a same-filesystem atomic rename. Restart and health
checks follow. The server needs neither Go nor a C compiler for backend delivery.
Frontend compilation and rendering still use the managed server browser runtime.

Backend delivery phases are `probe -> local build -> validate -> upload ->
install -> restart -> verify`. Failure before upload leaves live files unchanged;
failure during upload leaves live binaries unchanged. Installation uses atomic
rename per executable, not a transaction spanning both destination files.

## 16.6 Public behavior

- `silan site update-content --confirm`: authenticated content release.
- `silan site deploy --what=content --confirm`: same use case.
- `silan site deploy --what=frontend --confirm`: committed frontend artifact,
  compile baseline, render and publish.
- `silan site deploy --what=backend --confirm`: committed backend artifact,
  local cross-build, binary upload, restart and health-check.
- `silan site deploy --what=all --confirm`: install matching code artifacts,
  compile the frontend baseline, then finish through the content transaction.
- `silan site preview --confirm`: disposable local Docker stack.
- `silan site recover --from https://silan.tech --to ./content`: authenticated,
  configuration-free recovery of the exact public authored source attached to
  the live content release. The client verifies release provenance, archive
  checksum and path safety before atomically activating a new Git repository.

## 16.7 New-device and disaster recovery

The complete private workspace moves between devices through the private
content Git remote. Production recovery is a separate, deliberately narrower
state machine for the case where no usable checkout or backup remains:

```text
authenticate -> download -> verify provenance -> stage -> validate -> initialize Git -> activate
       \________________________ any failure ________________________/ -> destination unchanged
```

Every current-format content release archives the committed public source,
not the mutable deployment worktree. The authenticated
`GET /api/v1/content/source` response binds the archive to the deployed content
commit and SHA-256 digest. The client accepts an absent or empty destination,
rejects private/unsafe archive paths and leaves the destination unchanged until
all validation and Git initialization succeeds.

## 16.8 Removed architecture

The following paths are intentionally obsolete and must not be reintroduced as
fallbacks:

- backend source uploads and production-host Go/CGO compilation;
- embedding recursive frontend/backend source tarballs in the CLI build;
- Docker image shipping as an alternative production strategy;
- SSH content promotion, live SQLite download, operator-side table promotion,
  whole-database upload, and API stop/start;
- content-triggered `tsc` or Vite compilation;
- production selection between Rust-generated and frontend-generated SEO files.
