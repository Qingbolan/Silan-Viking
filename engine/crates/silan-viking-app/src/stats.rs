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
use std::time::Duration;
use thiserror::Error;

const STATS_SYNC_TOKEN_ENV: &str = "SILAN_STATS_SYNC_TOKEN";

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
    /// Private statistics require an operator-provided machine credential.
    #[error("stats sync needs SILAN_STATS_SYNC_TOKEN")]
    MissingCredential,
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

#[derive(Debug, Clone, Deserialize)]
struct SnapshotResponse {
    generated_at: String,
    items: Vec<SnapshotItem>,
    #[serde(default)]
    countries: Vec<CountryItem>,
}

#[derive(Debug, Clone, Deserialize)]
struct CountryItem {
    country_code: String,
    #[serde(default)]
    city: String,
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
    count: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct SnapshotItem {
    stats: ItemStats,
    visitors: Vec<VisitorRow>,
    crawlers: Vec<CrawlerItem>,
    sources: Vec<SourceItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StatsSyncResult {
    pub item_count: usize,
    pub generated_at: String,
    pub request_count: usize,
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
CREATE TABLE IF NOT EXISTS stats_cache_location (
    country_code TEXT NOT NULL,
    city         TEXT NOT NULL,
    latitude     REAL NOT NULL,
    longitude    REAL NOT NULL,
    count        INTEGER NOT NULL,
    synced_at    TEXT NOT NULL,
    PRIMARY KEY (country_code, city, latitude, longitude)
);
";

/// Ensure the `stats_cache_*` tables exist in `db`.
pub fn ensure_cache_schema(db: &Path) -> Result<(), StatsError> {
    let conn = Connection::open(db)?;
    conn.execute_batch(CACHE_SCHEMA)?;
    Ok(())
}

/// Resolve the deployed Go API base URL from `<project_root>/silan-viking.toml`.
///
/// `content_root` is the workspace's `content/` directory; the project root
/// is its parent. `[deploy].api_base` wins if set. Otherwise the public site
/// URL is used; `[deploy].host` is only a final fallback because it is often an
/// SSH target rather than the TLS hostname users visit.
pub fn api_base_url(content_root: &Path) -> Result<String, StatsError> {
    let project_root = content_root.parent().unwrap_or(content_root);
    let config_path = project_root.join("silan-viking.toml");
    let text = std::fs::read_to_string(&config_path).map_err(|_| StatsError::NoServer)?;
    let config: toml::Value = text
        .parse()
        .map_err(|e| StatsError::Decode(format!("{}: {e}", config_path.display())))?;
    let deploy = config.get("deploy");
    if let Some(base) = deploy
        .and_then(|d| d.get("api_base"))
        .and_then(|v| v.as_str())
    {
        return Ok(base.trim_end_matches('/').to_owned());
    }
    if let Some(public_url) = deploy
        .and_then(|d| d.get("public_url"))
        .and_then(|v| v.as_str())
    {
        return Ok(public_url.trim_end_matches('/').to_owned());
    }
    if let Some(host) = deploy.and_then(|d| d.get("host")).and_then(|v| v.as_str()) {
        return Ok(format!("https://{host}"));
    }
    Err(StatsError::NoServer)
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
    bearer_token: Option<String>,
}

impl StatsSync {
    /// Build a syncer for an API base URL and a local cache database.
    pub fn new(base_url: impl Into<String>, db: impl AsRef<Path>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_owned(),
            db: db.as_ref().to_path_buf(),
            bearer_token: private_api_token(),
        }
    }

    /// Override the runtime token, primarily for an explicit embedding or
    /// deterministic HTTP contract test.
    pub fn with_bearer_token(mut self, token: impl Into<String>) -> Self {
        self.bearer_token = non_empty_token(token.into());
        self
    }

    /// GET a JSON resource from the Go API and decode it.
    fn get_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T, StatsError> {
        let url = format!("{}{path}", self.base_url);
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(StatsError::MissingCredential)?;
        // Statistics are an interactive Desktop refresh, not a background
        // crawler. Bound failure latency explicitly; ureq's broad defaults
        // can otherwise leave the UI waiting for roughly a minute on a
        // broken route even though the healthy snapshot normally takes
        // around one second.
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(3))
            .timeout_read(Duration::from_secs(8))
            .timeout_write(Duration::from_secs(3))
            .build();
        let mut request = agent.get(&url);
        request = request.set("Authorization", &format!("Bearer {token}"));
        let response = request
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

    /// Fetch and persist one full-site snapshot in a single HTTP request.
    pub fn sync_snapshot(&self) -> Result<StatsSyncResult, StatsError> {
        ensure_cache_schema(&self.db)?;
        let snapshot: SnapshotResponse = self.get_json("/api/v1/stats/snapshot")?;
        let stamp = now_stamp();
        let mut conn = Connection::open(&self.db)?;
        let tx = conn.transaction()?;
        for table in [
            "stats_cache_item",
            "stats_cache_visitor",
            "stats_cache_crawler",
            "stats_cache_source",
            "stats_cache_location",
        ] {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }
        for item in &snapshot.items {
            let stats = &item.stats;
            tx.execute(
                "INSERT INTO stats_cache_item
                 (entity_type, entity_id, views, likes, comments, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    stats.entity_type,
                    stats.entity_id,
                    stats.views,
                    stats.likes,
                    stats.comments,
                    stamp
                ],
            )?;
            for visitor in &item.visitors {
                tx.execute(
                    "INSERT INTO stats_cache_visitor
                     (entity_type, entity_id, fingerprint, ip_masked, visitor_kind,
                      referrer_kind, last_seen_at, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![
                        stats.entity_type,
                        stats.entity_id,
                        visitor.fingerprint,
                        visitor.ip_masked,
                        visitor.visitor_kind,
                        visitor.referrer_kind,
                        visitor.last_seen_at,
                        stamp
                    ],
                )?;
            }
            for crawler in &item.crawlers {
                tx.execute(
                    "INSERT INTO stats_cache_crawler
                     (entity_type, entity_id, visitor_kind, count, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![
                        stats.entity_type,
                        stats.entity_id,
                        crawler.visitor_kind,
                        crawler.count,
                        stamp
                    ],
                )?;
            }
            for source in &item.sources {
                tx.execute(
                    "INSERT INTO stats_cache_source
                     (entity_type, entity_id, source, count, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![
                        stats.entity_type,
                        stats.entity_id,
                        source.source,
                        source.count,
                        stamp
                    ],
                )?;
            }
        }
        for country in &snapshot.countries {
            tx.execute(
                "INSERT INTO stats_cache_location
                 (country_code, city, latitude, longitude, count, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    country.country_code,
                    country.city,
                    country.latitude,
                    country.longitude,
                    country.count,
                    stamp
                ],
            )?;
        }
        tx.commit()?;
        Ok(StatsSyncResult {
            item_count: snapshot.items.len(),
            generated_at: snapshot.generated_at,
            request_count: 1,
        })
    }
}

pub(crate) fn private_api_token() -> Option<String> {
    std::env::var(STATS_SYNC_TOKEN_ENV)
        .ok()
        .and_then(non_empty_token)
}

fn non_empty_token(token: String) -> Option<String> {
    let token = token.trim();
    (!token.is_empty()).then(|| token.to_owned())
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
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

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

    #[test]
    fn full_site_sync_uses_exactly_one_http_request() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let requests = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&requests);
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read");
            let request = String::from_utf8_lossy(&request[..read]);
            assert!(request.starts_with("GET /api/v1/stats/snapshot "));
            assert!(request.contains("\r\nAuthorization: Bearer stats-contract-token\r\n"));
            observed.fetch_add(1, Ordering::SeqCst);
            let body = r#"{"generated_at":"2026-07-17T00:00:00Z","items":[{"stats":{"entity_type":"blog","entity_id":"i_one","views":8,"likes":2,"comments":1},"visitors":[],"crawlers":[{"visitor_kind":"ai_crawler","count":3}],"sources":[{"source":"ai_chat","count":2}]}],"countries":[{"country_code":"SG","city":"Singapore","latitude":1.3,"longitude":103.9,"count":7}]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("respond");
        });

        let directory = tempfile::tempdir().expect("temp");
        let db = directory.path().join("portfolio.db");
        let result = StatsSync::new(format!("http://{address}"), &db)
            .with_bearer_token("stats-contract-token")
            .sync_snapshot()
            .expect("sync");
        server.join().expect("server");
        assert_eq!(requests.load(Ordering::SeqCst), 1);
        assert_eq!(result.request_count, 1);
        assert_eq!(result.item_count, 1);
        assert_eq!(
            StatsCache::open(db)
                .item("blog", "i_one")
                .expect("cache")
                .views,
            8
        );
        let connection = Connection::open(directory.path().join("portfolio.db")).expect("db");
        let country: (String, String, f64, f64, i64) = connection
            .query_row(
                "SELECT country_code, city, latitude, longitude, count FROM stats_cache_location",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .expect("country cache");
        assert_eq!(country, ("SG".to_owned(), "Singapore".to_owned(), 1.3, 103.9, 7));
    }

    #[test]
    fn private_stats_fail_before_http_without_a_credential() {
        let directory = tempfile::tempdir().expect("temp");
        let result = StatsSync::new("http://127.0.0.1:1", directory.path().join("portfolio.db"))
            .with_bearer_token("")
            .sync_snapshot();
        assert!(matches!(result, Err(StatsError::MissingCredential)));
    }

    #[test]
    fn api_base_url_prefers_explicit_api_base_over_host() {
        let dir = std::env::temp_dir().join(format!("silan-api-base-{}", std::process::id()));
        let content_root = dir.join("content");
        std::fs::create_dir_all(&content_root).expect("mkdir");
        std::fs::write(
            dir.join("silan-viking.toml"),
            "[deploy]\nhost = \"example.com\"\napi_base = \"https://api.example.com/\"\n",
        )
        .expect("write config");

        assert_eq!(
            api_base_url(&content_root).expect("resolve base url"),
            "https://api.example.com"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn api_base_url_uses_public_url_before_ssh_host() {
        let dir =
            std::env::temp_dir().join(format!("silan-api-base-public-{}", std::process::id()));
        let content_root = dir.join("content");
        std::fs::create_dir_all(&content_root).expect("mkdir");
        std::fs::write(
            dir.join("silan-viking.toml"),
            "[deploy]\nhost = \"198.51.100.7\"\npublic_url = \"https://silan.tech/\"\n",
        )
        .expect("write config");

        assert_eq!(
            api_base_url(&content_root).expect("resolve base url"),
            "https://silan.tech"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn api_base_url_derives_https_from_host_when_api_base_is_absent() {
        let dir = std::env::temp_dir().join(format!("silan-api-base-host-{}", std::process::id()));
        let content_root = dir.join("content");
        std::fs::create_dir_all(&content_root).expect("mkdir");
        std::fs::write(
            dir.join("silan-viking.toml"),
            "[deploy]\nhost = \"198.51.100.7\"\n",
        )
        .expect("write config");

        assert_eq!(
            api_base_url(&content_root).expect("resolve base url"),
            "https://198.51.100.7"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn api_base_url_reports_no_server_when_config_is_missing() {
        let dir =
            std::env::temp_dir().join(format!("silan-api-base-missing-{}", std::process::id()));
        let content_root = dir.join("content");
        std::fs::create_dir_all(&content_root).expect("mkdir");

        assert!(matches!(
            api_base_url(&content_root),
            Err(StatsError::NoServer)
        ));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
