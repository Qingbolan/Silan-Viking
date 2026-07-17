//! Website insight use cases over source content, runtime observations, and
//! the locally cached remote statistics snapshot.

use crate::{api_base_url, StatsSync, StatsSyncResult, WorkspaceContent, WorkspaceContentError};
use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum WebsiteInsightsError {
    #[error(transparent)]
    Workspace(#[from] WorkspaceContentError),
    #[error("insights storage error: {0}")]
    Storage(#[from] rusqlite::Error),
    #[error("remote statistics error: {0}")]
    Stats(#[from] crate::StatsError),
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct DashboardSnapshot {
    pub stats: StatsSummary,
    pub crawlers: CrawlerSummary,
    pub ai_referrals: AiReferralSummary,
    pub comments: CommentSummary,
    pub freshness: StatsFreshness,
    pub traffic: TrafficDetail,
    pub recent_content: Vec<RecentContentItem>,
    pub attention: Vec<AttentionItem>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct TrafficDetail {
    pub today_visits: i64,
    pub daily_visits: Vec<DailyTraffic>,
    pub top_content: Vec<TopContentItem>,
    pub top_sources: Vec<TrafficSource>,
    pub top_countries: Vec<TrafficCountry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DailyTraffic {
    pub date: String,
    pub visits: i64,
    pub content: Vec<DailyContentTraffic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DailyContentTraffic {
    pub content_type: String,
    pub title: String,
    pub visits: i64,
    pub comments: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TopContentItem {
    pub content_type: String,
    pub title: String,
    pub views: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TrafficSource {
    pub source: String,
    pub visits: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TrafficCountry {
    pub country_code: String,
    pub visits: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct StatsSummary {
    pub views: i64,
    pub likes: i64,
    pub comments: i64,
    pub human_interactions: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct CrawlerSummary {
    pub total: i64,
    pub ai: i64,
    pub search: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct AiReferralSummary {
    pub visits: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct CommentSummary {
    pub total: i64,
    pub pending: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct StatsFreshness {
    pub state: FreshnessState,
    pub synced_at: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessState {
    #[default]
    NeverSynced,
    Current,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RecentContentItem {
    pub content_type: String,
    pub document_id: String,
    pub title: String,
    pub slug: String,
    pub status: String,
    pub visibility: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AttentionItem {
    pub kind: AttentionKind,
    pub severity: AttentionSeverity,
    pub label: String,
    pub detail: String,
    pub document_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AttentionKind {
    StatsFreshness,
    PendingComments,
    PrivatePublishedContent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AttentionSeverity {
    Info,
    Warning,
}

pub struct WebsiteInsights {
    content_root: PathBuf,
    db_path: PathBuf,
}

impl WebsiteInsights {
    pub fn open(
        content_root: impl AsRef<Path>,
        db_path: impl AsRef<Path>,
    ) -> Result<Self, WebsiteInsightsError> {
        WorkspaceContent::open(content_root.as_ref())?;
        Ok(Self {
            content_root: content_root.as_ref().to_path_buf(),
            db_path: db_path.as_ref().to_path_buf(),
        })
    }

    pub fn dashboard_snapshot(&self) -> Result<DashboardSnapshot, WebsiteInsightsError> {
        let connection =
            Connection::open_with_flags(&self.db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let stats = cached_stats(&connection)?;
        let comments = runtime_comments(&connection)?;
        let freshness = cached_freshness(&connection)?;
        let workspace = WorkspaceContent::open(&self.content_root)?;
        let mut recent_content = workspace
            .editable_documents()?
            .into_iter()
            .map(|document| RecentContentItem {
                content_type: document.content_type,
                document_id: document.id,
                title: document.title,
                slug: document.slug,
                status: document.status,
                visibility: document.visibility,
                updated_at: document.updated_at,
            })
            .collect::<Vec<_>>();
        recent_content.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

        let crawlers = cached_crawlers(&connection)?;
        let ai_referrals = cached_ai_referrals(&connection)?;
        let traffic = cached_traffic(&connection, &recent_content)?;
        recent_content.truncate(8);
        let mut snapshot = DashboardSnapshot {
            stats,
            crawlers,
            ai_referrals,
            comments,
            freshness,
            traffic,
            recent_content,
            attention: Vec::new(),
        };
        snapshot.attention = attention_for(&snapshot);
        Ok(snapshot)
    }

    pub fn sync_remote_stats(&self) -> Result<StatsSyncResult, WebsiteInsightsError> {
        let base_url = api_base_url(&self.content_root)?;
        Ok(StatsSync::new(base_url, &self.db_path).sync_snapshot()?)
    }

    pub fn needs_attention(&self) -> Result<Vec<AttentionItem>, WebsiteInsightsError> {
        Ok(self.dashboard_snapshot()?.attention)
    }
}

fn cached_traffic(
    connection: &Connection,
    content: &[RecentContentItem],
) -> Result<TrafficDetail, rusqlite::Error> {
    let titles = content
        .iter()
        .map(|item| {
            (
                (item.content_type.as_str(), item.document_id.as_str()),
                item.title.as_str(),
            )
        })
        .collect::<std::collections::HashMap<_, _>>();
    let mut comment_counts = std::collections::HashMap::<(String, String), i64>::new();
    if table_exists(connection, "stats_cache_item")? {
        let mut statement =
            connection.prepare("SELECT entity_type, entity_id, comments FROM stats_cache_item")?;
        for row in statement.query_map([], |row| {
            Ok((
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                row.get::<_, i64>(2)?,
            ))
        })? {
            let (key, comments) = row?;
            comment_counts.insert(key, comments);
        }
    }
    let today_visits = if table_exists(connection, "stats_cache_visitor")? {
        scalar(
            connection,
            "SELECT COUNT(*) FROM stats_cache_visitor
             WHERE visitor_kind = 'human' AND date(last_seen_at) = date('now')",
        )?
    } else {
        0
    };
    let mut daily_visits = Vec::new();
    if table_exists(connection, "stats_cache_visitor")? {
        let mut statement = connection.prepare(
            "SELECT date(last_seen_at) AS visit_date, entity_type, entity_id, COUNT(*) AS visits
             FROM stats_cache_visitor
             WHERE visitor_kind = 'human' AND date(last_seen_at) >= date('now', '-1 year')
             GROUP BY visit_date, entity_type, entity_id
             ORDER BY visit_date, visits DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })?;
        for row in rows {
            let (date, content_type, entity_id, visits) = row?;
            if daily_visits
                .last()
                .is_none_or(|day: &DailyTraffic| day.date != date)
            {
                daily_visits.push(DailyTraffic {
                    date: date.clone(),
                    visits: 0,
                    content: Vec::new(),
                });
            }
            let day = daily_visits.last_mut().expect("daily traffic day");
            day.visits += visits;
            day.content.push(DailyContentTraffic {
                title: titles
                    .get(&(content_type.as_str(), entity_id.as_str()))
                    .copied()
                    .unwrap_or(entity_id.as_str())
                    .to_owned(),
                comments: comment_counts
                    .get(&(content_type.clone(), entity_id))
                    .copied()
                    .unwrap_or(0),
                content_type,
                visits,
            });
        }
    }
    let mut top_sources = Vec::new();
    if table_exists(connection, "stats_cache_source")? {
        let mut statement = connection.prepare(
            "SELECT source, COALESCE(SUM(count), 0) AS visits
             FROM stats_cache_source GROUP BY source ORDER BY visits DESC LIMIT 4",
        )?;
        top_sources = statement
            .query_map([], |row| {
                Ok(TrafficSource {
                    source: row.get(0)?,
                    visits: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    let mut top_content = Vec::new();
    if table_exists(connection, "stats_cache_item")? {
        let mut statement = connection.prepare(
            "SELECT entity_type, entity_id, views
             FROM stats_cache_item ORDER BY views DESC LIMIT 4",
        )?;
        top_content = statement
            .query_map([], |row| {
                let content_type: String = row.get(0)?;
                let entity_id: String = row.get(1)?;
                let title = titles
                    .get(&(content_type.as_str(), entity_id.as_str()))
                    .copied()
                    .unwrap_or(entity_id.as_str())
                    .to_owned();
                Ok(TopContentItem {
                    content_type,
                    title,
                    views: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    let mut top_countries = Vec::new();
    if table_exists(connection, "stats_cache_country")? {
        let mut statement = connection.prepare(
            "SELECT country_code, count FROM stats_cache_country
             ORDER BY count DESC, country_code ASC LIMIT 4",
        )?;
        top_countries = statement
            .query_map([], |row| {
                Ok(TrafficCountry {
                    country_code: row.get(0)?,
                    visits: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(TrafficDetail {
        today_visits,
        daily_visits,
        top_content,
        top_sources,
        top_countries,
    })
}

fn cached_stats(connection: &Connection) -> Result<StatsSummary, rusqlite::Error> {
    if !table_exists(connection, "stats_cache_item")? {
        return Ok(StatsSummary::default());
    }
    connection
        .query_row(
            "SELECT COALESCE(SUM(views), 0), COALESCE(SUM(likes), 0),
                COALESCE(SUM(comments), 0)
         FROM stats_cache_item",
            [],
            |row| {
                Ok(StatsSummary {
                    views: row.get(0)?,
                    likes: row.get(1)?,
                    comments: row.get(2)?,
                    human_interactions: 0,
                })
            },
        )
        .and_then(|mut summary| {
            if table_exists(connection, "stats_cache_crawler")? {
                summary.human_interactions = scalar(
                    connection,
                    "SELECT COALESCE(SUM(count), 0) FROM stats_cache_crawler
                 WHERE visitor_kind = 'human'",
                )?;
            }
            Ok(summary)
        })
}

fn cached_crawlers(connection: &Connection) -> Result<CrawlerSummary, rusqlite::Error> {
    if !table_exists(connection, "stats_cache_crawler")? {
        return Ok(CrawlerSummary::default());
    }
    let ai = scalar(
        connection,
        "SELECT COALESCE(SUM(count), 0) FROM stats_cache_crawler
         WHERE visitor_kind = 'ai_crawler'",
    )?;
    let search = scalar(
        connection,
        "SELECT COALESCE(SUM(count), 0) FROM stats_cache_crawler
         WHERE visitor_kind = 'search_crawler'",
    )?;
    Ok(CrawlerSummary {
        total: ai + search,
        ai,
        search,
    })
}

fn cached_ai_referrals(connection: &Connection) -> Result<AiReferralSummary, rusqlite::Error> {
    if !table_exists(connection, "stats_cache_source")? {
        return Ok(AiReferralSummary::default());
    }
    Ok(AiReferralSummary {
        visits: scalar(
            connection,
            "SELECT COALESCE(SUM(count), 0) FROM stats_cache_source
             WHERE source = 'ai_chat'",
        )?,
    })
}

fn runtime_comments(connection: &Connection) -> Result<CommentSummary, rusqlite::Error> {
    if !table_exists(connection, "comments")? {
        return Ok(CommentSummary::default());
    }
    Ok(CommentSummary {
        total: scalar(connection, "SELECT COUNT(*) FROM comments")?,
        pending: scalar(
            connection,
            "SELECT COUNT(*) FROM comments WHERE is_approved = 0",
        )?,
    })
}

fn cached_freshness(connection: &Connection) -> Result<StatsFreshness, rusqlite::Error> {
    if !table_exists(connection, "stats_cache_item")? {
        return Ok(StatsFreshness::default());
    }
    let synced_at: Option<String> =
        connection.query_row("SELECT MAX(synced_at) FROM stats_cache_item", [], |row| {
            row.get(0)
        })?;
    Ok(StatsFreshness {
        state: if synced_at.is_some() {
            FreshnessState::Current
        } else {
            FreshnessState::NeverSynced
        },
        synced_at,
    })
}

fn attention_for(snapshot: &DashboardSnapshot) -> Vec<AttentionItem> {
    let mut attention = Vec::new();
    if snapshot.freshness.state == FreshnessState::NeverSynced {
        attention.push(AttentionItem {
            kind: AttentionKind::StatsFreshness,
            severity: AttentionSeverity::Info,
            label: "Remote statistics have not been synced".to_owned(),
            detail: "Run the full-site snapshot sync to populate live evidence.".to_owned(),
            document_id: None,
        });
    }
    if snapshot.comments.pending > 0 {
        attention.push(AttentionItem {
            kind: AttentionKind::PendingComments,
            severity: AttentionSeverity::Warning,
            label: format!("{} comments need review", snapshot.comments.pending),
            detail: "Moderation observations are available in the runtime insight store."
                .to_owned(),
            document_id: None,
        });
    }
    attention.extend(
        snapshot
            .recent_content
            .iter()
            .filter(|item| item.status == "published" && item.visibility != "public")
            .map(|item| AttentionItem {
                kind: AttentionKind::PrivatePublishedContent,
                severity: AttentionSeverity::Info,
                label: format!("{} is published but not public", item.title),
                detail: "Lifecycle and visibility are independent; confirm this is intentional."
                    .to_owned(),
                document_id: Some(item.document_id.clone()),
            }),
    );
    attention
}

fn table_exists(connection: &Connection, name: &str) -> Result<bool, rusqlite::Error> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [name],
        |row| row.get(0),
    )
}

fn scalar(connection: &Connection, query: &str) -> Result<i64, rusqlite::Error> {
    connection.query_row(query, [], |row| row.get(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_workspace() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let directory = tempfile::tempdir().expect("temp workspace");
        let content = directory.path().join("content");
        std::fs::create_dir_all(content.join("resources")).expect("resources");
        let schema = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../content/SCHEMA.md");
        std::fs::copy(schema, content.join("SCHEMA.md")).expect("schema");
        let db = directory.path().join("portfolio.db");
        Connection::open(&db).expect("database");
        (directory, content, db)
    }

    #[test]
    fn empty_runtime_and_cache_are_explicitly_never_synced() {
        let (_directory, content, db) = empty_workspace();
        let snapshot = WebsiteInsights::open(content, db)
            .expect("open insights")
            .dashboard_snapshot()
            .expect("snapshot");
        assert_eq!(snapshot.freshness.state, FreshnessState::NeverSynced);
        assert_eq!(snapshot.stats, StatsSummary::default());
        assert!(snapshot
            .attention
            .iter()
            .any(|item| item.kind == AttentionKind::StatsFreshness));
    }

    #[test]
    fn dashboard_aggregates_cache_without_exposing_storage_shapes() {
        let (_directory, content, db) = empty_workspace();
        crate::stats::ensure_cache_schema(&db).expect("cache schema");
        let connection = Connection::open(&db).expect("database");
        connection
            .execute_batch(
                "
                INSERT INTO stats_cache_item VALUES
                  ('blog', 'i_one', 12, 3, 2, '2026-07-17T00:00:00Z');
                INSERT INTO stats_cache_crawler VALUES
                  ('blog', 'i_one', 'human', 9, '2026-07-17T00:00:00Z'),
                  ('blog', 'i_one', 'ai_crawler', 2, '2026-07-17T00:00:00Z');
                INSERT INTO stats_cache_source VALUES
                  ('blog', 'i_one', 'ai_chat', 4, '2026-07-17T00:00:00Z');
                INSERT INTO stats_cache_country VALUES
                  ('SG', 7, '2026-07-17T00:00:00Z');
                CREATE TABLE comments (is_approved INTEGER NOT NULL);
                INSERT INTO comments VALUES (0), (1);
                ",
            )
            .expect("seed observations");
        drop(connection);
        let snapshot = WebsiteInsights::open(content, db)
            .expect("open insights")
            .dashboard_snapshot()
            .expect("snapshot");
        assert_eq!(snapshot.stats.views, 12);
        assert_eq!(snapshot.stats.human_interactions, 9);
        assert_eq!(snapshot.crawlers.ai, 2);
        assert_eq!(snapshot.ai_referrals.visits, 4);
        assert_eq!(
            snapshot.traffic.top_countries,
            vec![TrafficCountry {
                country_code: "SG".to_owned(),
                visits: 7,
            }]
        );
        assert_eq!(snapshot.comments.pending, 1);
        assert_eq!(snapshot.freshness.state, FreshnessState::Current);
    }
}
