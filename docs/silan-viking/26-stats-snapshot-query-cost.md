# Desktop statistics refresh: query cost

Desktop dashboard refresh and interaction-panel sync call `sync_stats`, which
uses the engine's `StatsClient::sync_snapshot` and `GET /api/v1/stats/snapshot`.
The endpoint still returns a complete snapshot; this is not an incremental
protocol change.

The former implementation first loaded all interactions and comments, then
queried the same tables repeatedly for each content item to calculate counts,
visitors, crawler/source breakdowns, likers, and comments. Visitor projection
also queried request history even when interactions already contained geography,
with repeated addresses in the SQL `IN` list. Finally, country aggregation loaded
and sorted all eligible historical request records in Go.

The snapshot now groups the loaded interactions and comments once, reuses the
individual endpoints' projection functions, and batches project counts through
the engagement owner. Existing public moderation and identity projections remain
the owners of comment trees and liker identities.

Request-log geography is reduced in SQL to the most recent eligible row per IP.
Eligibility filtering happens before ranking; bot, unknown-country, and statistics
requests cannot displace a human visit in the country distribution. Ties use the
request ID. Historical interaction enrichment only queries missing geography,
deduplicates IP parameters, retains the existing per-item time window, and uses
the same SQL reduction.

`TestSnapshotQueryBudgetDoesNotGrowWithAnonymousContent` verifies three SELECTs
for both one and 100 non-project items with anonymous likes and complete geography.
Authenticated identities, project likers, comment author profiles, and historical
geography may require additional lookups. Complete interaction output remains
proportional to interaction history, and the database still evaluates eligible
request history for country aggregation; this change does not claim constant-time
refresh or establish a production CPU measurement.

Validation lives in `backend/internal/logic/stats/statslogic_test.go`, including
snapshot/individual endpoint equivalence, project counts, private replies,
country eligibility and timestamp ties, and repeated legacy IPs. Run
`cd backend && go test ./...` before delivery.
