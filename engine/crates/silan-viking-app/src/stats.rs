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

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use thiserror::Error;

const STATS_SYNC_TOKEN_ENV: &str = "SILAN_STATS_SYNC_TOKEN";
const DEPLOYED_STATS_TOKEN_ENV: &str = "STATS_SYNC_TOKEN";

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
    #[serde(default)]
    pub ip_address: String,
    /// `human` / `search_crawler` / `ai_crawler`.
    pub visitor_kind: String,
    /// Referrer source kind.
    pub referrer_kind: String,
    #[serde(default)]
    pub referrer: String,
    #[serde(default)]
    pub landing_url: String,
    #[serde(default)]
    pub crawler_name: String,
    #[serde(default)]
    pub country_code: String,
    #[serde(default)]
    pub region_code: String,
    #[serde(default)]
    pub region_name: String,
    #[serde(default)]
    pub city: String,
    #[serde(default)]
    pub postal_code: String,
    #[serde(default)]
    pub place_name: String,
    #[serde(default)]
    pub place_feature_code: String,
    #[serde(default)]
    pub place_distance_km: f64,
    #[serde(default)]
    pub latitude: f64,
    #[serde(default)]
    pub longitude: f64,
    #[serde(default)]
    pub time_zone: String,
    #[serde(default)]
    pub accuracy_radius: i64,
    /// RFC-3339 timestamp of the last visit.
    pub last_seen_at: String,
}

/// How much network detail a visitor listing discloses. Listings are
/// anonymous (visitor fingerprint, kind, referrer, coarse region, time)
/// unless the owner explicitly asks for network information — the masked and
/// raw IP and precise location (city, postal code, place, coordinates).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum VisitorDisclosure {
    #[default]
    Anonymous,
    Network,
}

impl VisitorRow {
    /// This row reduced to what `disclosure` permits.
    pub fn disclosed(mut self, disclosure: VisitorDisclosure) -> Self {
        if disclosure == VisitorDisclosure::Anonymous {
            self.ip_masked.clear();
            self.ip_address.clear();
            self.city.clear();
            self.postal_code.clear();
            self.place_name.clear();
            self.place_feature_code.clear();
            self.place_distance_km = 0.0;
            self.latitude = 0.0;
            self.longitude = 0.0;
            self.accuracy_radius = 0;
        }
        self
    }
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
    #[serde(default)]
    interaction_details_complete: bool,
    items: Vec<SnapshotItem>,
    #[serde(default)]
    countries: Vec<CountryItem>,
}

#[derive(Debug, Clone, Deserialize)]
struct CountryItem {
    country_code: String,
    #[serde(default)]
    region_code: String,
    #[serde(default)]
    region_name: String,
    #[serde(default)]
    city: String,
    #[serde(default)]
    postal_code: String,
    #[serde(default)]
    place_name: String,
    #[serde(default)]
    place_feature_code: String,
    #[serde(default)]
    place_distance_km: f64,
    #[serde(default)]
    latitude: f64,
    #[serde(default)]
    longitude: f64,
    #[serde(default)]
    time_zone: String,
    #[serde(default)]
    accuracy_radius: i64,
    #[serde(default)]
    ip_addresses: Vec<String>,
    count: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct SnapshotItem {
    stats: ItemStats,
    visitors: Vec<VisitorRow>,
    crawlers: Vec<CrawlerItem>,
    sources: Vec<SourceItem>,
    #[serde(default)]
    likers: Vec<InteractionLiker>,
    #[serde(default)]
    comments: Vec<InteractionComment>,
}

/// Public-safe identity information for one content like.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct InteractionLiker {
    pub kind: String,
    #[serde(default)]
    pub country_code: String,
    #[serde(default)]
    pub visitor_number: String,
    #[serde(default)]
    pub avatar_url: String,
    #[serde(default)]
    pub label: String,
}

/// One comment in a content discussion tree.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct InteractionComment {
    pub id: String,
    #[serde(default)]
    pub parent_id: String,
    pub author_name: String,
    #[serde(default)]
    pub author_avatar_url: String,
    #[serde(default)]
    pub auth_provider: String,
    #[serde(default)]
    pub country_code: String,
    pub content: String,
    pub created_at: String,
    #[serde(default)]
    pub likes_count: i64,
    #[serde(default = "default_public")]
    pub is_public: bool,
    #[serde(default)]
    pub replies: Vec<InteractionComment>,
}

fn default_public() -> bool {
    true
}

/// Detailed human interactions cached for one content item.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InteractionDetails {
    pub is_complete: bool,
    pub likers: Vec<InteractionLiker>,
    pub comments: Vec<InteractionComment>,
}

/// Result of one protected comment publication-state mutation.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct CommentVisibility {
    pub comment_id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub is_public: bool,
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
    details_complete INTEGER NOT NULL DEFAULT 0,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS stats_cache_snapshot (
    singleton        INTEGER PRIMARY KEY CHECK (singleton = 1),
    details_complete INTEGER NOT NULL DEFAULT 0,
    synced_at        TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stats_cache_visitor (
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    ip_masked     TEXT NOT NULL,
    ip_address    TEXT NOT NULL DEFAULT '',
    visitor_kind  TEXT NOT NULL,
    referrer_kind TEXT NOT NULL,
    referrer      TEXT NOT NULL DEFAULT '',
    landing_url   TEXT NOT NULL DEFAULT '',
    crawler_name  TEXT NOT NULL DEFAULT '',
    country_code  TEXT NOT NULL DEFAULT '',
    region_code   TEXT NOT NULL DEFAULT '',
    region_name   TEXT NOT NULL DEFAULT '',
    city          TEXT NOT NULL DEFAULT '',
    postal_code   TEXT NOT NULL DEFAULT '',
    place_name    TEXT NOT NULL DEFAULT '',
    place_feature_code TEXT NOT NULL DEFAULT '',
    place_distance_km REAL NOT NULL DEFAULT 0,
    latitude      REAL NOT NULL DEFAULT 0,
    longitude     REAL NOT NULL DEFAULT 0,
    time_zone     TEXT NOT NULL DEFAULT '',
    accuracy_radius INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS stats_cache_liker (
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    position      INTEGER NOT NULL,
    kind          TEXT NOT NULL,
    country_code  TEXT NOT NULL DEFAULT '',
    visitor_number TEXT NOT NULL DEFAULT '',
    avatar_url    TEXT NOT NULL DEFAULT '',
    label         TEXT NOT NULL DEFAULT '',
    synced_at     TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id, position)
);
CREATE TABLE IF NOT EXISTS stats_cache_comment (
    entity_type      TEXT NOT NULL,
    entity_id        TEXT NOT NULL,
    comment_id       TEXT NOT NULL,
    parent_id        TEXT NOT NULL DEFAULT '',
    position         INTEGER NOT NULL,
    author_name      TEXT NOT NULL,
    author_avatar_url TEXT NOT NULL DEFAULT '',
    auth_provider    TEXT NOT NULL DEFAULT '',
    country_code     TEXT NOT NULL DEFAULT '',
    content          TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    likes_count      INTEGER NOT NULL DEFAULT 0,
    is_public        INTEGER NOT NULL DEFAULT 1,
    synced_at        TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id, comment_id)
);
CREATE TABLE IF NOT EXISTS stats_cache_location_v2 (
    country_code TEXT NOT NULL,
    region_code  TEXT NOT NULL,
    region_name  TEXT NOT NULL,
    city         TEXT NOT NULL,
    postal_code  TEXT NOT NULL,
    place_name   TEXT NOT NULL,
    place_feature_code TEXT NOT NULL,
    place_distance_km REAL NOT NULL,
    latitude     REAL NOT NULL,
    longitude    REAL NOT NULL,
    time_zone    TEXT NOT NULL,
    accuracy_radius INTEGER NOT NULL,
    ip_addresses TEXT NOT NULL,
    count        INTEGER NOT NULL,
    synced_at    TEXT NOT NULL,
    PRIMARY KEY (country_code, region_code, region_name, city, postal_code, place_name, place_feature_code, place_distance_km, latitude, longitude, time_zone, accuracy_radius)
);
";

/// Ensure the `stats_cache_*` tables exist in `db`.
pub fn ensure_cache_schema(db: &Path) -> Result<(), StatsError> {
    let mut conn = Connection::open(db)?;
    conn.execute_batch(CACHE_SCHEMA)?;
    for (column, declaration) in [
        ("referrer", "TEXT NOT NULL DEFAULT ''"),
        ("ip_address", "TEXT NOT NULL DEFAULT ''"),
        ("crawler_name", "TEXT NOT NULL DEFAULT ''"),
        ("landing_url", "TEXT NOT NULL DEFAULT ''"),
        ("country_code", "TEXT NOT NULL DEFAULT ''"),
        ("region_code", "TEXT NOT NULL DEFAULT ''"),
        ("region_name", "TEXT NOT NULL DEFAULT ''"),
        ("city", "TEXT NOT NULL DEFAULT ''"),
        ("postal_code", "TEXT NOT NULL DEFAULT ''"),
        ("place_name", "TEXT NOT NULL DEFAULT ''"),
        ("place_feature_code", "TEXT NOT NULL DEFAULT ''"),
        ("place_distance_km", "REAL NOT NULL DEFAULT 0"),
        ("latitude", "REAL NOT NULL DEFAULT 0"),
        ("longitude", "REAL NOT NULL DEFAULT 0"),
        ("time_zone", "TEXT NOT NULL DEFAULT ''"),
        ("accuracy_radius", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        ensure_cache_column(&conn, "stats_cache_visitor", column, declaration)?;
    }
    for (column, declaration) in [
        ("region_code", "TEXT NOT NULL DEFAULT ''"),
        ("region_name", "TEXT NOT NULL DEFAULT ''"),
        ("postal_code", "TEXT NOT NULL DEFAULT ''"),
        ("place_name", "TEXT NOT NULL DEFAULT ''"),
        ("place_feature_code", "TEXT NOT NULL DEFAULT ''"),
        ("place_distance_km", "REAL NOT NULL DEFAULT 0"),
        ("time_zone", "TEXT NOT NULL DEFAULT ''"),
        ("accuracy_radius", "INTEGER NOT NULL DEFAULT 0"),
    ] {
        ensure_cache_column(&conn, "stats_cache_location_v2", column, declaration)?;
    }
    migrate_cache_location_v2_primary_key(&mut conn)?;
    ensure_cache_column(
        &conn,
        "stats_cache_item",
        "details_complete",
        "INTEGER NOT NULL DEFAULT 0",
    )?;
    ensure_cache_column(
        &conn,
        "stats_cache_comment",
        "is_public",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    Ok(())
}

fn ensure_cache_column(
    conn: &Connection,
    table: &str,
    column: &str,
    declaration: &str,
) -> Result<(), StatsError> {
    let columns = conn
        .prepare(&format!("PRAGMA table_info({table})"))?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !columns.iter().any(|existing| existing == column) {
        conn.execute(
            &format!("ALTER TABLE {table} ADD COLUMN {column} {declaration}"),
            [],
        )?;
    }
    Ok(())
}

fn migrate_cache_location_v2_primary_key(conn: &mut Connection) -> Result<(), StatsError> {
    const TABLE: &str = "stats_cache_location_v2";
    const MIGRATION_TABLE: &str = "stats_cache_location_v2_migration_old";
    const EXPECTED_PRIMARY_KEY: &[&str] = &[
        "country_code",
        "region_code",
        "region_name",
        "city",
        "postal_code",
        "place_name",
        "place_feature_code",
        "place_distance_km",
        "latitude",
        "longitude",
        "time_zone",
        "accuracy_radius",
    ];
    let primary_key = cache_table_primary_key(conn, TABLE)?;
    if primary_key == EXPECTED_PRIMARY_KEY {
        return Ok(());
    }

    let tx = conn.transaction()?;
    tx.execute(&format!("DROP TABLE IF EXISTS {MIGRATION_TABLE}"), [])?;
    tx.execute(
        &format!("ALTER TABLE {TABLE} RENAME TO {MIGRATION_TABLE}"),
        [],
    )?;
    tx.execute_batch(CACHE_SCHEMA)?;
    tx.execute(
        &format!(
            "INSERT INTO {TABLE}
             (country_code, region_code, region_name, city, postal_code, place_name,
              place_feature_code, place_distance_km, latitude, longitude, time_zone,
              accuracy_radius, ip_addresses, count, synced_at)
             SELECT country_code, region_code, region_name, city, postal_code, place_name,
                    place_feature_code, place_distance_km, latitude, longitude, time_zone,
                    accuracy_radius, MAX(ip_addresses), SUM(count), MAX(synced_at)
             FROM {MIGRATION_TABLE}
             GROUP BY country_code, region_code, region_name, city, postal_code, place_name,
                      place_feature_code, place_distance_km, latitude, longitude, time_zone,
                      accuracy_radius"
        ),
        [],
    )?;
    tx.execute(&format!("DROP TABLE {MIGRATION_TABLE}"), [])?;
    tx.commit()?;
    Ok(())
}

fn cache_table_primary_key(conn: &Connection, table: &str) -> Result<Vec<String>, StatsError> {
    let mut columns = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut primary_key = columns
        .query_map([], |row| {
            Ok((row.get::<_, i64>(5)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    primary_key.retain(|(ordinal, _)| *ordinal > 0);
    primary_key.sort_by_key(|(ordinal, _)| *ordinal);
    Ok(primary_key.into_iter().map(|(_, column)| column).collect())
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
            "stats_cache_liker",
            "stats_cache_comment",
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
                 (entity_type, entity_id, fingerprint, ip_masked, ip_address, visitor_kind,
                  referrer_kind, referrer, landing_url, crawler_name, country_code,
                  region_code, region_name, city, postal_code, place_name, place_feature_code,
                  place_distance_km, latitude, longitude, time_zone, accuracy_radius,
                  last_seen_at, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
                rusqlite::params![
                    entity_type,
                    entity_id,
                    v.fingerprint,
                    v.ip_masked,
                    v.ip_address,
                    v.visitor_kind,
                    v.referrer_kind,
                    v.referrer,
                    v.landing_url,
                    v.crawler_name,
                    v.country_code,
                    v.region_code,
                    v.region_name,
                    v.city,
                    v.postal_code,
                    v.place_name,
                    v.place_feature_code,
                    v.place_distance_km,
                    v.latitude,
                    v.longitude,
                    v.time_zone,
                    v.accuracy_radius,
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
            "stats_cache_liker",
            "stats_cache_comment",
            "stats_cache_location_v2",
        ] {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }
        for item in &snapshot.items {
            let stats = &item.stats;
            tx.execute(
                "INSERT INTO stats_cache_item
                 (entity_type, entity_id, views, likes, comments, details_complete, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    stats.entity_type,
                    stats.entity_id,
                    stats.views,
                    stats.likes,
                    stats.comments,
                    snapshot.interaction_details_complete,
                    stamp
                ],
            )?;
            for visitor in &item.visitors {
                tx.execute(
                    "INSERT INTO stats_cache_visitor
                     (entity_type, entity_id, fingerprint, ip_masked, ip_address, visitor_kind,
                      referrer_kind, referrer, landing_url, crawler_name, country_code,
                      region_code, region_name, city, postal_code, place_name, place_feature_code,
                      place_distance_km, latitude, longitude, time_zone, accuracy_radius,
                      last_seen_at, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
                    rusqlite::params![
                        stats.entity_type,
                        stats.entity_id,
                        visitor.fingerprint,
                        visitor.ip_masked,
                        visitor.ip_address,
                        visitor.visitor_kind,
                        visitor.referrer_kind,
                        visitor.referrer,
                        visitor.landing_url,
                        visitor.crawler_name,
                        visitor.country_code,
                        visitor.region_code,
                        visitor.region_name,
                        visitor.city,
                        visitor.postal_code,
                        visitor.place_name,
                        visitor.place_feature_code,
                        visitor.place_distance_km,
                        visitor.latitude,
                        visitor.longitude,
                        visitor.time_zone,
                        visitor.accuracy_radius,
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
            for (position, liker) in item.likers.iter().enumerate() {
                tx.execute(
                    "INSERT INTO stats_cache_liker
                     (entity_type, entity_id, position, kind, country_code, visitor_number,
                      avatar_url, label, synced_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    rusqlite::params![
                        stats.entity_type,
                        stats.entity_id,
                        position as i64,
                        liker.kind,
                        liker.country_code,
                        liker.visitor_number,
                        liker.avatar_url,
                        liker.label,
                        stamp
                    ],
                )?;
            }
            let mut comment_position = 0_i64;
            for comment in &item.comments {
                cache_comment_tree(
                    &tx,
                    &stats.entity_type,
                    &stats.entity_id,
                    comment,
                    &stamp,
                    &mut comment_position,
                )?;
            }
        }
        for country in &snapshot.countries {
            tx.execute(
                "INSERT INTO stats_cache_location_v2
                 (country_code, region_code, region_name, city, postal_code, latitude,
                  longitude, time_zone, accuracy_radius, place_name, place_feature_code,
                  place_distance_km, ip_addresses, count, synced_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
                rusqlite::params![
                    country.country_code,
                    country.region_code,
                    country.region_name,
                    country.city,
                    country.postal_code,
                    country.latitude,
                    country.longitude,
                    country.time_zone,
                    country.accuracy_radius,
                    country.place_name,
                    country.place_feature_code,
                    country.place_distance_km,
                    serde_json::to_string(&country.ip_addresses)
                        .map_err(|error| StatsError::Decode(error.to_string()))?,
                    country.count,
                    stamp
                ],
            )?;
        }
        tx.execute(
            "INSERT INTO stats_cache_snapshot (singleton, details_complete, synced_at)
             VALUES (1, ?1, ?2)
             ON CONFLICT(singleton) DO UPDATE SET
               details_complete = excluded.details_complete,
               synced_at = excluded.synced_at",
            rusqlite::params![snapshot.interaction_details_complete, stamp],
        )?;
        tx.commit()?;
        Ok(StatsSyncResult {
            item_count: snapshot.items.len(),
            generated_at: snapshot.generated_at,
            request_count: 1,
        })
    }

    /// Publish or hide one comment through the protected operator API.
    pub fn set_comment_visibility(
        &self,
        comment_id: &str,
        is_public: bool,
    ) -> Result<CommentVisibility, StatsError> {
        let url = format!(
            "{}/api/v1/stats/comments/{comment_id}/visibility",
            self.base_url
        );
        let token = self
            .bearer_token
            .as_ref()
            .ok_or(StatsError::MissingCredential)?;
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(3))
            .timeout_read(Duration::from_secs(8))
            .timeout_write(Duration::from_secs(3))
            .build();
        let response = agent
            .put(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .send_json(serde_json::json!({ "is_public": is_public }))
            .map_err(|error| StatsError::Http(format!("{url}: {error}")))?;
        response
            .into_json::<CommentVisibility>()
            .map_err(|error| StatsError::Decode(format!("{url}: {error}")))
    }
}

fn cache_comment_tree(
    tx: &rusqlite::Transaction<'_>,
    entity_type: &str,
    entity_id: &str,
    comment: &InteractionComment,
    stamp: &str,
    position: &mut i64,
) -> Result<(), StatsError> {
    let current_position = *position;
    *position += 1;
    tx.execute(
        "INSERT INTO stats_cache_comment
         (entity_type, entity_id, comment_id, parent_id, position, author_name,
          author_avatar_url, auth_provider, country_code, content, created_at,
          likes_count, is_public, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            entity_type,
            entity_id,
            comment.id,
            comment.parent_id,
            current_position,
            comment.author_name,
            comment.author_avatar_url,
            comment.auth_provider,
            comment.country_code,
            comment.content,
            comment.created_at,
            comment.likes_count,
            comment.is_public,
            stamp
        ],
    )?;
    for reply in &comment.replies {
        cache_comment_tree(tx, entity_type, entity_id, reply, stamp, position)?;
    }
    Ok(())
}

pub(crate) fn private_api_token() -> Option<String> {
    std::env::var(STATS_SYNC_TOKEN_ENV)
        .ok()
        .and_then(non_empty_token)
}

/// Resolve the private statistics credential for a workspace.
///
/// An explicit client-process variable wins. Desktop applications launched
/// from Finder do not reliably inherit shell exports, so the project-local
/// `.env` is also a credential source. Parse only the two relevant keys
/// instead of mutating the process environment with the rest of the file.
pub fn workspace_stats_sync_token(content_root: &Path) -> Option<String> {
    private_api_token().or_else(|| {
        let project_root = content_root.parent().unwrap_or(content_root);
        dotenv_stats_sync_token(&project_root.join(".env"))
    })
}

fn dotenv_stats_sync_token(path: &Path) -> Option<String> {
    dotenvy::from_path_iter(path)
        .ok()?
        .filter_map(Result::ok)
        .find_map(|(key, value)| {
            matches!(
                key.as_str(),
                STATS_SYNC_TOKEN_ENV | DEPLOYED_STATS_TOKEN_ENV
            )
            .then(|| non_empty_token(value))
            .flatten()
        })
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

    /// The cached visitors of one item, reduced to what `disclosure` permits.
    pub fn visitors(
        &self,
        entity_type: &str,
        entity_id: &str,
        disclosure: VisitorDisclosure,
    ) -> Result<Vec<VisitorRow>, StatsError> {
        let what = format!("{entity_type}/{entity_id}");
        let conn = Connection::open(&self.db)?;
        let mut stmt = conn
            .prepare(
                "SELECT fingerprint, ip_masked, ip_address, visitor_kind, referrer_kind, referrer,
                        landing_url, crawler_name, country_code, region_code, region_name,
                        city, postal_code, place_name, place_feature_code, place_distance_km,
                        latitude, longitude, time_zone, accuracy_radius, last_seen_at
                 FROM stats_cache_visitor WHERE entity_type = ?1 AND entity_id = ?2
                 ORDER BY last_seen_at",
            )
            .map_err(|e| Self::map_missing(e, &what))?;
        let rows = stmt
            .query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(VisitorRow {
                    fingerprint: row.get(0)?,
                    ip_masked: row.get(1)?,
                    ip_address: row.get(2)?,
                    visitor_kind: row.get(3)?,
                    referrer_kind: row.get(4)?,
                    referrer: row.get(5)?,
                    landing_url: row.get(6)?,
                    crawler_name: row.get(7)?,
                    country_code: row.get(8)?,
                    region_code: row.get(9)?,
                    region_name: row.get(10)?,
                    city: row.get(11)?,
                    postal_code: row.get(12)?,
                    place_name: row.get(13)?,
                    place_feature_code: row.get(14)?,
                    place_distance_km: row.get(15)?,
                    latitude: row.get(16)?,
                    longitude: row.get(17)?,
                    time_zone: row.get(18)?,
                    accuracy_radius: row.get(19)?,
                    last_seen_at: row.get(20)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows
            .into_iter()
            .map(|row: VisitorRow| row.disclosed(disclosure))
            .collect())
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

    /// The cached liker identities and recursively reconstructed comment tree.
    pub fn interaction_details(
        &self,
        entity_type: &str,
        entity_id: &str,
    ) -> Result<InteractionDetails, StatsError> {
        ensure_cache_schema(&self.db)?;
        let what = format!("{entity_type}/{entity_id}");
        let conn = Connection::open(&self.db)?;
        let item_completeness = conn
            .query_row(
                "SELECT details_complete FROM stats_cache_item
                 WHERE entity_type = ?1 AND entity_id = ?2",
                rusqlite::params![entity_type, entity_id],
                |row| row.get(0),
            )
            .optional()?;
        let snapshot_completeness = conn
            .query_row(
                "SELECT details_complete FROM stats_cache_snapshot WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(false);
        let is_complete = item_completeness.unwrap_or(snapshot_completeness);
        let mut liker_stmt = conn
            .prepare(
                "SELECT kind, country_code, visitor_number, avatar_url, label
                 FROM stats_cache_liker
                 WHERE entity_type = ?1 AND entity_id = ?2 ORDER BY position",
            )
            .map_err(|error| Self::map_missing(error, &what))?;
        let likers = liker_stmt
            .query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(InteractionLiker {
                    kind: row.get(0)?,
                    country_code: row.get(1)?,
                    visitor_number: row.get(2)?,
                    avatar_url: row.get(3)?,
                    label: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut comment_stmt = conn
            .prepare(
                "SELECT comment_id, parent_id, author_name, author_avatar_url, auth_provider,
                        country_code, content, created_at, likes_count, is_public
                 FROM stats_cache_comment
                 WHERE entity_type = ?1 AND entity_id = ?2 ORDER BY position",
            )
            .map_err(|error| Self::map_missing(error, &what))?;
        let flat_comments = comment_stmt
            .query_map(rusqlite::params![entity_type, entity_id], |row| {
                Ok(InteractionComment {
                    id: row.get(0)?,
                    parent_id: row.get(1)?,
                    author_name: row.get(2)?,
                    author_avatar_url: row.get(3)?,
                    auth_provider: row.get(4)?,
                    country_code: row.get(5)?,
                    content: row.get(6)?,
                    created_at: row.get(7)?,
                    likes_count: row.get(8)?,
                    is_public: row.get(9)?,
                    replies: Vec::new(),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let comments = comment_children(&flat_comments, "");
        Ok(InteractionDetails {
            is_complete,
            likers,
            comments,
        })
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

fn comment_children(comments: &[InteractionComment], parent_id: &str) -> Vec<InteractionComment> {
    comments
        .iter()
        .filter(|comment| comment.parent_id == parent_id)
        .map(|comment| {
            let mut node = comment.clone();
            node.replies = comment_children(comments, &comment.id);
            node
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn read_http_request(stream: &mut TcpStream) -> String {
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .expect("read timeout");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        loop {
            let read = stream.read(&mut buffer).expect("read");
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            if request.len() >= header_end + 4 + content_length {
                break;
            }
        }
        String::from_utf8(request).expect("HTTP request must be UTF-8")
    }

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
            let body = r#"{"generated_at":"2026-07-17T00:00:00Z","interaction_details_complete":true,"items":[{"stats":{"entity_type":"blog","entity_id":"i_one","views":8,"likes":2,"comments":1},"visitors":[],"crawlers":[{"visitor_kind":"ai_crawler","count":3}],"sources":[{"source":"ai_chat","count":2}],"likers":[{"kind":"user","country_code":"SG","avatar_url":"https://example.com/ava.png","label":"Ari Tan"}],"comments":[{"id":"c_root","author_name":"Mei","content":"Root","created_at":"2026-07-17T08:00:00Z","likes_count":2,"is_public":true,"replies":[{"id":"c_reply","parent_id":"c_root","author_name":"Noah","content":"Reply","created_at":"2026-07-17T08:05:00Z","is_public":false,"replies":[]}]}]}],"countries":[{"country_code":"SG","region_code":"","region_name":"","city":"Singapore","postal_code":"","place_name":"Holland Village","place_feature_code":"PPLX","place_distance_km":1.4,"latitude":1.3239,"longitude":103.79,"time_zone":"Asia/Singapore","accuracy_radius":5,"ip_addresses":["203.0.113.8"],"count":7}]}"#;
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
        let interactions = StatsCache::open(&db)
            .interaction_details("blog", "i_one")
            .expect("interaction details");
        assert!(interactions.is_complete);
        assert_eq!(interactions.likers[0].label, "Ari Tan");
        assert_eq!(interactions.comments[0].content, "Root");
        assert!(interactions.comments[0].is_public);
        assert_eq!(interactions.comments[0].replies[0].content, "Reply");
        assert!(!interactions.comments[0].replies[0].is_public);
        let empty_interactions = StatsCache::open(&db)
            .interaction_details("blog", "i_zero")
            .expect("complete snapshot can represent an empty interaction list");
        assert!(empty_interactions.is_complete);
        assert!(empty_interactions.likers.is_empty());
        assert!(empty_interactions.comments.is_empty());
        assert_eq!(
            StatsCache::open(&db)
                .item("blog", "i_one")
                .expect("cache")
                .views,
            8
        );
        let connection = Connection::open(directory.path().join("portfolio.db")).expect("db");
        #[derive(Debug, PartialEq)]
        struct CountryCacheRow {
            country_code: String,
            region_code: String,
            region_name: String,
            city: String,
            postal_code: String,
            latitude: f64,
            longitude: f64,
            time_zone: String,
            place_name: String,
            place_feature_code: String,
            place_distance_km: f64,
            accuracy_radius: i64,
            ip_addresses: String,
            count: i64,
        }
        let country: CountryCacheRow = connection
            .query_row(
                "SELECT country_code, region_code, region_name, city, postal_code,
                        latitude, longitude, time_zone, place_name, place_feature_code,
                        place_distance_km, accuracy_radius, ip_addresses, count
                 FROM stats_cache_location_v2",
                [],
                |row| {
                    Ok(CountryCacheRow {
                        country_code: row.get(0)?,
                        region_code: row.get(1)?,
                        region_name: row.get(2)?,
                        city: row.get(3)?,
                        postal_code: row.get(4)?,
                        latitude: row.get(5)?,
                        longitude: row.get(6)?,
                        time_zone: row.get(7)?,
                        place_name: row.get(8)?,
                        place_feature_code: row.get(9)?,
                        place_distance_km: row.get(10)?,
                        accuracy_radius: row.get(11)?,
                        ip_addresses: row.get(12)?,
                        count: row.get(13)?,
                    })
                },
            )
            .expect("country cache");
        assert_eq!(
            country,
            CountryCacheRow {
                country_code: "SG".to_owned(),
                region_code: String::new(),
                region_name: String::new(),
                city: "Singapore".to_owned(),
                postal_code: String::new(),
                latitude: 1.3239,
                longitude: 103.79,
                time_zone: "Asia/Singapore".to_owned(),
                place_name: "Holland Village".to_owned(),
                place_feature_code: "PPLX".to_owned(),
                place_distance_km: 1.4,
                accuracy_radius: 5,
                ip_addresses: "[\"203.0.113.8\"]".to_owned(),
                count: 7,
            }
        );
    }

    #[test]
    fn legacy_snapshot_is_explicitly_incomplete_for_interaction_details() {
        let snapshot: SnapshotResponse = serde_json::from_str(
            r#"{"generated_at":"2026-07-17T00:00:00Z","items":[],"countries":[]}"#,
        )
        .expect("legacy snapshot");

        assert!(!snapshot.interaction_details_complete);
    }

    #[test]
    fn comment_visibility_uses_the_protected_operator_contract() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let request = read_http_request(&mut stream);
            assert!(request.starts_with("PUT /api/v1/stats/comments/c_root/visibility "));
            assert!(request.contains("\r\nAuthorization: Bearer stats-contract-token\r\n"));
            assert!(request.contains("\"is_public\""));
            assert!(request.contains("false"));
            let body = r#"{"comment_id":"c_root","entity_type":"blog","entity_id":"i_one","is_public":false}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("respond");
        });

        let result = StatsSync::new(
            format!("http://{address}"),
            std::env::temp_dir().join("unused-comment-visibility.db"),
        )
        .with_bearer_token("stats-contract-token")
        .set_comment_visibility("c_root", false)
        .expect("visibility");
        server.join().expect("server");
        assert_eq!(result.comment_id, "c_root");
        assert!(!result.is_public);
    }

    #[test]
    fn legacy_location_cache_primary_key_is_migrated() {
        let directory = tempfile::tempdir().expect("temp");
        let db = directory.path().join("portfolio.db");
        let connection = Connection::open(&db).expect("db");
        connection
            .execute_batch(
                "
                CREATE TABLE stats_cache_location_v2 (
                    country_code TEXT NOT NULL,
                    city TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    ip_addresses TEXT NOT NULL,
                    count INTEGER NOT NULL,
                    synced_at TEXT NOT NULL,
                    PRIMARY KEY (country_code, city, latitude, longitude)
                );
                INSERT INTO stats_cache_location_v2 VALUES
                  ('SG', 'Singapore', 1.3239, 103.79, '[\"203.0.113.8\"]', 7, '2026-07-17T00:00:00Z');
                ",
            )
            .expect("legacy table");
        drop(connection);

        ensure_cache_schema(&db).expect("migrate schema");
        let connection = Connection::open(&db).expect("db");
        let primary_key =
            cache_table_primary_key(&connection, "stats_cache_location_v2").expect("primary key");
        assert_eq!(
            primary_key,
            vec![
                "country_code",
                "region_code",
                "region_name",
                "city",
                "postal_code",
                "place_name",
                "place_feature_code",
                "place_distance_km",
                "latitude",
                "longitude",
                "time_zone",
                "accuracy_radius",
            ]
        );
        connection
            .execute(
                "INSERT INTO stats_cache_location_v2
                 (country_code, region_code, region_name, city, postal_code, place_name,
                  place_feature_code, place_distance_km, latitude, longitude, time_zone,
                  accuracy_radius, ip_addresses, count, synced_at)
                 VALUES ('SG', '', '', 'Singapore', '', 'Holland Village', 'PPLX',
                         1.4, 1.3239, 103.79, 'Asia/Singapore', 5,
                         '[\"203.0.113.9\"]', 3, '2026-07-18T00:00:00Z')",
                [],
            )
            .expect("same city and coordinates can hold a distinct place bucket");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM stats_cache_location_v2", [], |row| {
                row.get(0)
            })
            .expect("row count");
        assert_eq!(count, 2);
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

    #[test]
    fn project_dotenv_parser_reads_only_a_stats_credential() {
        let dir = tempfile::tempdir().expect("tempdir");
        let dotenv = dir.path().join(".env");
        std::fs::write(&dotenv, "UNRELATED=value\nSTATS_SYNC_TOKEN=project-token\n")
            .expect("write dotenv");

        assert_eq!(
            dotenv_stats_sync_token(&dotenv).as_deref(),
            Some("project-token")
        );
        assert!(std::env::var("UNRELATED").is_err());
    }
}
