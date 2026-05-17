//! Runtime statistics — sync from the remote Go API into a local cache, then
//! query the cache (`docs/silan-viking/03` §3.2 #15).
//!
//! Runtime interaction data (views / likes / comments / visitors) is produced
//! only on the production server. The original design had `stats` query the
//! Go API live on every call; this module implements the sync-then-query
//! model instead: [`StatsSync::sync_item`] fetches the four `/api/v1/stats`
//! views over HTTP and writes them into `stats_cache_*` tables of the local
//! `portfolio.db`, each row stamped with `synced_at`. [`StatsCache`] then
//! answers queries from that local cache, offline.
//!
//! The HTTP client is `ureq` — blocking, no async runtime, matching the
//! engine's runtime-free discipline.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

/// A statistics failure.
#[derive(Debug, Error)]
pub enum StatsError {
    /// The local cache database could not be opened or written.
    #[error("stats cache db error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    /// The remote Go API call failed.
    #[error("stats sync HTTP error: {0}")]
    Http(String),
    /// The remote response could not be parsed.
    #[error("stats sync decode error: {0}")]
    Decode(String),
    /// No `[deploy]` server is configured, so there is nothing to sync from.
    #[error("stats sync needs a deployed server: set the API base URL (e.g. [deploy] in silan-viking.toml)")]
    NoServer,
    /// The cache has never been synced.
    #[error("stats cache is empty for `{0}` — run `silan stats sync` first")]
    NotSynced(String),
}

// ── the wire shapes returned by the Go /api/v1/stats endpoints ──────────────

/// `/api/v1/stats` — aggregate counts of one item.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ItemStats {
    /// The content type.
    pub entity_type: String,
    /// The content id.
    pub entity_id: String,
    /// View count.
    pub views: i64,
    /// Like count.
    pub likes: i64,
    /// Comment count.
    pub comments: i64,
}

/// One de-identified visitor row.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct VisitorRow {
    /// Visitor fingerprint.
    pub fingerprint: String,
    /// Network-masked IP.
    pub ip_masked: String,
    /// `human` / `search_crawler` / `ai_crawler`.
    pub visitor_kind: String,
    /// Referrer source kind.
    pub referrer_kind: String,
    /// RFC-3339 timestamp of the last visit.
    pub last_seen_at: String,
}

/// `/api/v1/stats/visitors` response.
#[derive(Debug, Clone, Deserialize)]
struct VisitorsResponse {
    visitors: Vec<VisitorRow>,
}

/// One aggregated count row (crawler kind or referrer source).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CountRow {
    /// The bucket label (visitor kind or source).
    pub label: String,
    /// The number of interactions in this bucket.
    pub count: i64,
}

/// `/api/v1/stats/crawlers` response.
#[derive(Debug, Clone, Deserialize)]
struct CrawlerResponse {
    items: Vec<CrawlerItem>,
}
#[derive(Debug, Clone, Deserialize)]
struct CrawlerItem {
    visitor_kind: String,
    count: i64,
}

/// `/api/v1/stats/sources` response.
#[derive(Debug, Clone, Deserialize)]
struct SourceResponse {
    items: Vec<SourceItem>,
}
#[derive(Debug, Clone, Deserialize)]
struct SourceItem {
    source: String,
    count: i64,
}

// ── the local cache schema ──────────────────────────────────────────────────

/// `CREATE TABLE` statements for the four `stats_cache_*` tables. Every row
/// carries `synced_at` so a query can report cache age.
const CACHE_SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS stats_cache_item (
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    views       INTEGER NOT NULL,
    likes       INTEGER NOT NULL,
    comments    INTEGER NOT NULL,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS stats_cache_visitor (
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    ip_masked     TEXT NOT NULL,
    visitor_kind  TEXT NOT NULL,
    referrer_kind TEXT NOT NULL,
    last_seen_at  TEXT NOT NULL,
    synced_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stats_cache_crawler (
    entity_type  TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    visitor_kind TEXT NOT NULL,
    count        INTEGER NOT NULL,
    synced_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stats_cache_source (
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    source      TEXT NOT NULL,
    count       INTEGER NOT NULL,
    synced_at   TEXT NOT NULL
);
";

/// Ensure the `stats_cache_*` tables exist in `db`.
pub fn ensure_cache_schema(db: &Path) -> Result<(), StatsError> {
    let conn = Connection::open(db)?;
    conn.execute_batch(CACHE_SCHEMA)?;
    Ok(())
}

/// Current UTC time as an RFC-3339-ish `synced_at` stamp.
fn now_stamp() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

// ── the sync side — fetch from the Go API, write the cache ──────────────────

/// Syncs runtime stats from a remote Go API into the local cache.
pub struct StatsSync {
    /// The Go API base URL, e.g. `https://silan.tech`.
    base_url: String,
    /// The local `portfolio.db` path.
    db: std::path::PathBuf,
}

impl StatsSync {
    /// Build a syncer for an API base URL and a local cache database.
    pub fn new(base_url: impl Into<String>, db: impl AsRef<Path>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            db: db.as_ref().to_path_buf(),
        }
    }

    /// GET a JSON resource from the Go API and decode it.
    fn get_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, StatsError> {
        let url = format!("{}{path}", self.base_url);
        let response = ureq::get(&url)
            .call()
            .map_err(|e| StatsError::Http(format!("{url}: {e}")))?;
        response
            .into_json::<T>()
            .map_err(|e| StatsError::Decode(format!("{url}: {e}")))
    }

    /// Sync every stats view for one content item into the local cache.
    /// Each table's rows for this item are replaced (the cache mirrors the
    /// server snapshot at sync time).
    pub fn sync_item(&self, entity_type: &str, entity_id: &str) -> Result<(), StatsError> {
        ensure_cache_schema(&self.db)?;
        let qs = format!("?entity_type={entity_type}&entity_id={entity_id}");

        let item: ItemStats = self.get_json(&format!("/api/v1/stats/{qs}"))?;
        let visitors: VisitorsResponse = self.get_json(&format!("/api/v1/stats/visitors{qs}"))?;
        let crawlers: CrawlerResponse = self.get_json(&format!("/api/v1/stats/crawlers{qs}"))?;
        let sources: SourceResponse = self.get_json(&format!("/api/v1/stats/sources{qs}"))?;

        let stamp = now_stamp();
        let mut conn = Connection::open(&self.db)?;
        let tx = conn.transaction()?;

        // Replace this item's rows in every cache table.
        for table in [
            "stats_cache_item",
            "stats_cache_visitor",
            "stats_cache_crawler",
            "stats_cache_source",
        ] {
            tx.execute(
                &format!("DELETE FROM {table} WHERE entity_type = ?1 AND entity_id = ?2"),
                rusqlite::params![entity_type, entity_id],
            )?;
        }

        tx.execute(
            "INSERT INTO stats_cache_item
             (entity_type, entity_id, views, likes, comments, synced_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                entity_type,
                entity_id,
                item.views,
                item.likes,
                item.comments,
                stamp
            ],
        )?;
        for v in &visitors.visitors {
            tx.execute(
                "INSERT INTO stats_cache_visitor
                 (entity_type, entity_id, fingerprint, ip_masked, visitor_kind,
                  referrer_kind, last_seen_at, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    entity_type,
                    entity_id,
                    v.fingerprint,
                    v.ip_masked,
                    v.visitor_kind,
                    v.referrer_kind,
                    v.last_seen_at,
                    stamp
                ],
            )?;
        }
        for c in &crawlers.items {
            tx.execute(
                "INSERT INTO stats_cache_crawler
                 (entity_type, entity_id, visitor_kind, count, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![entity_type, entity_id, c.visitor_kind, c.count, stamp],
            )?;
        }
        for s in &sources.items {
            tx.execute(
                "INSERT INTO stats_cache_source
                 (entity_type, entity_id, source, count, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![entity_type, entity_id, s.source, s.count, stamp],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

// ── the query side — read the local cache, offline ──────────────────────────

/// Reads runtime stats from the locally-synced cache.
pub struct StatsCache {
    db: std::path::PathBuf,
}

impl StatsCache {
    /// Open the cache backed by a `portfolio.db`.
    pub fn open(db: impl AsRef<Path>) -> Self {
        Self {
            db: db.as_ref().to_path_buf(),
        }
    }

    /// Map a "no such table" error to [`StatsError::NotSynced`] — the cache
    /// tables only exist once `sync` has run, so their absence means "never
    /// synced", not a real DB fault.
    fn map_missing(err: rusqlite::Error, what: &str) -> StatsError {
        let msg = err.to_string();
        if msg.contains("no such table") {
            StatsError::NotSynced(what.to_owned())
        } else {
            StatsError::Sqlite(err)
        }
    }

    /// The cached aggregate counts of one item.
    pub fn item(&self, entity_type: &str, entity_id: &str) -> Result<ItemStats, StatsError> {
        let conn = Connection::open(&self.db)?;
        conn.query_row(
            "SELECT views, likes, comments FROM stats_cache_item
             WHERE entity_type = ?1 AND entity_id = ?2",
            rusqlite::params![entity_type, entity_id],
            |row| {
                Ok(ItemStats {
                    entity_type: entity_type.to_owned(),
                    entity_id: entity_id.to_owned(),
                    views: row.get(0)?,
                    likes: row.get(1)?,
                    comments: row.get(2)?,
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                StatsError::NotSynced(format!("{entity_type}/{entity_id}"))
            }
            other => Self::map_missing(other, &format!("{entity_type}/{entity_id}")),
        })
    }

    /// The cached visitors of one item.
    pub fn visitors(
        &self,
        entity_type: &str,
        entity_id: &str,
    ) -> Result<Vec<VisitorRow>, StatsError> {
        let what = format!("{entity_type}/{entity_id}");
        let conn = Connection::open(&self.db)?;
        let mut stmt = conn
            .prepare(
                "SELECT fingerprint, ip_masked, visitor_kind, referrer_kind, last_seen_at
                 FROM stats_cache_visitor WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY last_seen_at",
            )
            .map_err(|e| Self::map_missing(e, &what))?;
        let rows = stmt
            .query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(VisitorRow {
                    fingerprint: row.get(0)?,
                    ip_masked: row.get(1)?,
                    visitor_kind: row.get(2)?,
                    referrer_kind: row.get(3)?,
                    last_seen_at: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// The cached crawler-kind breakdown of one item.
    pub fn crawlers(
        &self,
        entity_type: &str,
        entity_id: &str,
    ) -> Result<Vec<CountRow>, StatsError> {
        self.count_rows(
            "stats_cache_crawler",
            "visitor_kind",
            entity_type,
            entity_id,
        )
    }

    /// The cached referrer-source breakdown of one item.
    pub fn sources(&self, entity_type: &str, entity_id: &str) -> Result<Vec<CountRow>, StatsError> {
        self.count_rows("stats_cache_source", "source", entity_type, entity_id)
    }

    /// Shared reader for the two `(label, count)` breakdown tables.
    fn count_rows(
        &self,
        table: &str,
        label_col: &str,
        entity_type: &str,
        entity_id: &str,
    ) -> Result<Vec<CountRow>, StatsError> {
        let what = format!("{entity_type}/{entity_id}");
        let conn = Connection::open(&self.db)?;
        // `table` / `label_col` are fixed internal literals, never user input.
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {label_col}, count FROM {table}
                 WHERE entity_type = ?1 AND entity_id = ?2 ORDER BY count DESC"
            ))
            .map_err(|e| Self::map_missing(e, &what))?;
        let rows = stmt
            .query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(CountRow {
                    label: row.get(0)?,
                    count: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_round_trips_an_item() {
        let dir = std::env::temp_dir().join(format!("silan-stats-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("mkdir");
        let db = dir.join("portfolio.db");

        ensure_cache_schema(&db).expect("schema");
        // Write a row directly (simulating a sync) and read it back.
        let conn = Connection::open(&db).expect("open");
        conn.execute(
            "INSERT INTO stats_cache_item
             (entity_type, entity_id, views, likes, comments, synced_at)
             VALUES ('blog', 'abc', 42, 7, 3, '2026-05-17T00:00:00Z')",
            [],
        )
        .expect("insert");
        drop(conn);

        let cache = StatsCache::open(&db);
        let stats = cache.item("blog", "abc").expect("item");
        assert_eq!(stats.views, 42);
        assert_eq!(stats.likes, 7);
        assert_eq!(stats.comments, 3);

        // An un-synced item reports NotSynced, not a silent zero.
        let missing = cache.item("blog", "nope");
        assert!(matches!(missing, Err(StatsError::NotSynced(_))));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
