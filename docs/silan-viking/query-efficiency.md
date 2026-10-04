# Public query and prerender efficiency

## Ownership

- `contentsearch.MatchesParts` owns locale-aware authored-body predicates. It
  composes a database subquery rather than materializing matching IDs in Go.
- `contenttag.MatchesTags` owns AND-of-terms tag predicates. Terms match either
  slug or label; duplicate terms and aliases do not require duplicate tag rows.
- `contenttag.Repository.LookupMany` reads labels for a result page in batches
  of at most 500 unique IDs. Single-item lookup uses the same implementation.
- Blog and Project list handlers count and paginate in SQL. A unique ID is the
  final sort key so equal dates/order values do not make paging nondeterministic.
- Project response mapping is pure. Cover metadata comes from the loaded Ent
  projection; it must not trigger additional raw SQL reads.

## Release-scoped query snapshots

Prerender query snapshots merge identical requests within one release, including
failed requests. They bound loader concurrency (default 8) and retained entries
(default 10,000). Capacity exhaustion fails explicitly; eviction would allow one
release to observe different responses for the same dependency. Loader requests
have a 30-second timeout. The queue uses an amortized constant-time head cursor.

Persistent page cache writes use unique temporary files and atomic rename.
Unchanged renderer fingerprints and page dependencies reuse HTML. Dependency
validation still reads API responses: this is not a backend change feed or a
transactionally consistent snapshot of all public endpoints.

## Verification and remaining work

Tests cover duplicate body matches before pagination, locale fallback, bound
SQL parameters, tag aliases, missing labels, batch boundaries, stable Blog and
Project paging, malformed start dates, and query-snapshot concurrency/failures.
Backend package tests and targeted race tests are required for these owners.

This work does not establish a site-wide high-concurrency SLA. Remaining work
includes measuring end-to-end latency and query counts under load, auditing
other list/search endpoints, validating production-dialect query plans, bounding
response sizes consistently, and designing versioned dependency validation.
Offset pagination still has deep-page scan cost. Independent count/page reads
can observe a concurrent publication between statements; they are not claimed
to be one database snapshot. Contains searches remain substring scans rather
than indexed full-text retrieval.

## Local baseline (2026-10-04)

`go test ./internal/logic/blog -run '^$' -bench BenchmarkBlogListPage -benchmem -benchtime=500ms -count=2`

Apple M4, Darwin arm64, in-memory SQLite; first page of 10 public posts,
1 KB body per post, empty translation/engagement tables, no tag repository.
Fixture setup is excluded. Two runs produced:

| Total posts | Time per request | Go bytes per request | Allocations |
| --- | --- | --- | --- |
| 100 | 114.0–114.4 µs | 69,427 | 1,140 |
| 10,000 | 1,741.1–1,741.2 µs | 69,443 | 1,142 |

This supports bounded application allocations for this page size, not bounded
SQL work or network latency. The time increase warrants an index/query-plan
investigation. No production throughput or concurrency claim follows from this
single-threaded local benchmark.

### Public list indexes

Ent owns composite indexes matching the public list ordering:

- Blog: `(visibility, published_at DESC, id ASC)`.
- Project: `(visibility, sort_order DESC, created_at DESC, id ASC)`.

The generated migration adds these through the existing schema lifecycle.
`TestPublicListIndexesAvoidTemporarySort` checks SQLite query plans for a
covering index and absence of a temporary sorting B-tree. These are default
listing checks, not a claim that all search/filter combinations are indexed.

Repeating the same local benchmark after adding the indexes yielded 101.9–104.2
µs for 100 posts and 299.4–299.6 µs for 10,000 posts, with unchanged allocation
counts. The 10,000-post fixture improved approximately 5.8x. Counting matching
rows still scales with their number. Production dialect plans and migration
cost remain to be verified before making an operational performance claim.

## Shared database connection budget

Service initialization now gives Ent and raw SQL repositories the same pool.
`Database.MaxOpenConnections` defaults to 32 and `MaxIdleConnections` to 8;
zero values in programmatic configuration select those defaults. Idle capacity
is clamped to the open limit. Limits apply across both query entrypoints rather
than independently to each. The Ent client owns pool closure. No connection
lifetime is imposed here, preserving in-memory SQLite database lifetimes.

A race-enabled regression test runs 64 mixed Ent/raw readers through a two-
connection pool, verifies completion without errors, checks zero connections
left in use, and verifies that client closure closes the raw pool too. This
checks resource sharing and concurrency correctness, not production capacity.

## PostgreSQL integration verification

`TestPostgresPublicQueryIntegration` accepts `SILAN_TEST_POSTGRES_DSN` pointing
only at a disposable database. It migrates and seeds that database, then executes
body matching with locale fallback, tag aliases, year fallback, and paginated
Project responses against PostgreSQL. It skips without that explicit test DSN.

Verified locally with PostgreSQL 17 in an isolated Unix-socket cluster. A separate
10,000-row Blog fixture, analyzed before querying, selected
`blogpost_visibility_published_at_id` for the default public first page, with no
Sort node. `EXPLAIN (ANALYZE, BUFFERS)` reported 10 returned rows, 7 shared-buffer
hits and 0.012 ms execution for the page SELECT. This excludes count, mapping,
network and concurrency costs and is not a production latency result.

Snapshot retention also has a 64 MiB default UTF-8 text budget (`maxBytes`).
Excess responses become stable failures for that release rather than retained
values; existing entries remain available. This bounds serialized payload
retention, not JS object overhead or transient network/JSON parsing memory.
Tests cover multibyte text accounting and shared-dependency invalidation across
multiple routes. That cache-unit evidence does not replace a browser-level
content-change deployment test.

Prerender JSON reads now enforce a 16 MiB decoded-body limit while consuming the
stream, before parsing. Oversized Content-Length is rejected early, but the
stream is counted independently because headers can be absent or inaccurate.
Failure cancels the stream and releases its reader. HTTP failures also cancel
unconsumed bodies. Browser interception aborts a failed snapshot API request
instead of issuing a second browser request that would bypass these bounds.
The 30-second fetch deadline covers the response body as well as headers.
Parsing, UTF-8 conversion, stream chunk delivery, and runtime overhead can still
have transient allocations beyond the retained byte count; the limit is not a
whole-process RSS guarantee.

## Full prerender verification (2026-10-04)

An isolated copy of the working frontend was built against the public production
API, then rendered locally. First pass: 84 rendered, 0 reused; 128 unique query
entries, 234 reuse hits, 1,944,613 retained bytes, peak 2 active loaders. A second
pass restored the identical compiled baseline before execution: 84 reused,
0 rendered, with identical query statistics. Both passes validated 82 sitemap
URLs and 3 RSS items. No production artifacts were changed by this check.

This verifies a full unchanged-data run using the resource limits. A real
single-resource change test remains separate from the cache dependency unit
tests; API revalidation still executes 128 unique queries in the unchanged run.

## Local HTTP concurrency check

Run `SILAN_TEST_HTTP_LOAD=1 go test ./internal/handler/blog -run TestConcurrentPublicBlogHTTP -v -count=1`
(and the same command with `-race`) to exercise the actual Blog HTTP handler,
request parser, list logic, shared Ent/raw tag pool, and JSON serialization over
loopback HTTP. The fixture has 1,000 public rows and one private row. Sixty-four
workers each request 20 pages through a four-connection database pool. Every
response is checked for status, count, page length and deterministic first ID.
The test also checks the pool limit and zero in-use connections after completion.

One local non-race run completed 1,280 requests in 188.7 ms: P50 8.10 ms,
P95 17.65 ms, P99 22.29 ms. The pool recorded 6,327 waits totaling 9.79 seconds
across concurrent callers. This is a warm in-memory SQLite/read-only baseline;
it excludes production middleware, TLS, remote storage, writes and deployment
contention. It is not an SLA or evidence of equivalent production throughput.

Moment lists and their related Blog/Project cards now batch tag reads through
`LookupMany` as well. Moment response mapping has no database dependency. Tests
cover canonical-ID tag attachment when relations use slugs and private project
exclusion; targeted race tests and the backend suite pass. The Moment list still
returns all public moments under its existing API contract; this change removes
per-item tag round trips but does not introduce pagination to that endpoint.

Pagination arithmetic is owned by `internal/pagination`. Blog, Project and
Episode use the same overflow-safe offset and integer page-count computation.
Endpoint size policy remains explicit: Episode retains its existing cap of 50;
Blog and Project retain their existing uncapped size behavior. Out-of-range
pages skip row loading. Tests include maximum machine integers and exhaustive
small-page coverage without gaps or overlaps. Episode ordering now also ends
with its unique ID for deterministic ties.

### Single-article change through the complete renderer

A temporary fetch recorder captured the 128 public API responses from an
unchanged run. Replay was restricted to those responses (no missing-response
network fallback); guest fingerprint variants were matched to their recorded
public response. In that isolated fixture, only the English text block of
`make-research-work-findable` was changed, including its equivalent fingerprint
query variant. No production content was written.

With the same compiled baseline and page cache, full prerender reported **82
reused, 2 rendered**: the English and Chinese routes for that article. The
English output contained the marker in rendered HTML outside script elements;
the Chinese visible body did not. Both routes embed bilingual route data, so
both legitimately changed identity. Sitemap and RSS validation passed. This
verifies changed-content propagation and scoped invalidation across the full
browser renderer, while retaining the limitation that dependency validation
still reads all unique API responses.
