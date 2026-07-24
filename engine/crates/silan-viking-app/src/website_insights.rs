//! Website insight use cases over source content, runtime observations, and
//! the locally cached remote statistics snapshot.

use crate::{
    api_base_url, workspace_stats_sync_token, StatsSync, StatsSyncResult, WorkspaceContent,
    WorkspaceContentError,
};
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
    pub daily_seo_visits: Vec<DailyTraffic>,
    pub daily_geo_visits: Vec<DailyTraffic>,
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
    pub evidence: Vec<TrafficEvidence>,
    pub visitors: Vec<VisitorLocation>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VisitorLocation {
    pub country_code: String,
    pub region_code: String,
    pub region_name: String,
    pub city: String,
    pub postal_code: String,
    pub place_name: String,
    pub place_feature_code: String,
    pub place_distance_km: String,
    pub latitude: String,
    pub longitude: String,
    pub time_zone: String,
    pub accuracy_radius: i64,
    pub ip_addresses: Vec<String>,
    pub visits: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TrafficEvidence {
    pub agent: String,
    pub event: String,
    pub subject_kind: Option<String>,
    pub subject: Option<String>,
    pub visits: i64,
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
    pub region_code: String,
    pub region_name: String,
    pub city: String,
    pub postal_code: String,
    pub place_name: String,
    pub place_feature_code: String,
    pub place_distance_km: String,
    pub latitude: String,
    pub longitude: String,
    pub time_zone: String,
    pub accuracy_radius: i64,
    pub ip_addresses: Vec<String>,
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
        crate::stats::ensure_cache_schema(db_path.as_ref())?;
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
        let mut sync = StatsSync::new(base_url, &self.db_path);
        if let Some(token) = workspace_stats_sync_token(&self.content_root) {
            sync = sync.with_bearer_token(token);
        }
        Ok(sync.sync_snapshot()?)
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
             WHERE visitor_kind = 'human'
               AND date(last_seen_at, '+8 hours') = date('now', '+8 hours')",
        )?
    } else {
        0
    };
    let daily_visits = daily_acquisition(
        connection,
        &titles,
        &comment_counts,
        "visitor_kind = 'human'",
        AcquisitionKind::Human,
    )?;
    let daily_seo_visits = daily_acquisition(
        connection,
        &titles,
        &comment_counts,
        "(referrer_kind = 'search' OR visitor_kind = 'search_crawler')",
        AcquisitionKind::Seo,
    )?;
    let daily_geo_visits = daily_acquisition(
        connection,
        &titles,
        &comment_counts,
        "(referrer_kind = 'ai_chat' OR visitor_kind = 'ai_crawler')",
        AcquisitionKind::Geo,
    )?;
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
             FROM stats_cache_item ORDER BY views DESC",
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
    if table_exists(connection, "stats_cache_location_v2")? {
        let mut statement = connection.prepare(
            "SELECT country_code, region_code, region_name, city, postal_code, place_name,
                    place_feature_code, place_distance_km, latitude, longitude, time_zone,
                    accuracy_radius, ip_addresses, count
             FROM stats_cache_location_v2
             ORDER BY count DESC, country_code ASC LIMIT 4",
        )?;
        top_countries = statement
            .query_map([], |row| {
                let place_distance: f64 = row.get(7)?;
                let latitude: f64 = row.get(8)?;
                let longitude: f64 = row.get(9)?;
                let ip_addresses: String = row.get(12)?;
                Ok(TrafficCountry {
                    country_code: row.get(0)?,
                    region_code: row.get(1)?,
                    region_name: row.get(2)?,
                    city: row.get(3)?,
                    postal_code: row.get(4)?,
                    place_name: row.get(5)?,
                    place_feature_code: row.get(6)?,
                    place_distance_km: format_distance(place_distance),
                    latitude: format_coordinate(latitude),
                    longitude: format_coordinate(longitude),
                    time_zone: row.get(10)?,
                    accuracy_radius: row.get(11)?,
                    ip_addresses: serde_json::from_str(&ip_addresses).unwrap_or_default(),
                    visits: row.get(13)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
    }
    Ok(TrafficDetail {
        today_visits,
        daily_visits,
        daily_seo_visits,
        daily_geo_visits,
        top_content,
        top_sources,
        top_countries,
    })
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AcquisitionKind {
    Human,
    Seo,
    Geo,
}

fn daily_acquisition(
    connection: &Connection,
    titles: &std::collections::HashMap<(&str, &str), &str>,
    comment_counts: &std::collections::HashMap<(String, String), i64>,
    filter: &str,
    kind: AcquisitionKind,
) -> Result<Vec<DailyTraffic>, rusqlite::Error> {
    if !table_exists(connection, "stats_cache_visitor")? {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT date(last_seen_at, '+8 hours'), entity_type, entity_id, visitor_kind,
                referrer_kind, referrer, landing_url, crawler_name, ip_masked,
                country_code, region_code, region_name, city, postal_code, place_name,
                place_feature_code, place_distance_km, latitude, longitude, time_zone,
                accuracy_radius, COUNT(*)
         FROM stats_cache_visitor
         WHERE {filter}
           AND date(last_seen_at, '+8 hours') >= date('now', '+8 hours', '-1 year')
         GROUP BY date(last_seen_at, '+8 hours'), entity_type, entity_id, visitor_kind,
                  referrer_kind, referrer, landing_url, crawler_name, ip_masked,
                  country_code, region_code, region_name, city, postal_code, place_name,
                  place_feature_code, place_distance_km, latitude, longitude, time_zone,
                  accuracy_radius
         ORDER BY date(last_seen_at, '+8 hours'), COUNT(*) DESC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, String>(12)?,
            row.get::<_, String>(13)?,
            row.get::<_, String>(14)?,
            row.get::<_, String>(15)?,
            row.get::<_, f64>(16)?,
            row.get::<_, f64>(17)?,
            row.get::<_, f64>(18)?,
            row.get::<_, String>(19)?,
            row.get::<_, i64>(20)?,
            row.get::<_, i64>(21)?,
        ))
    })?;
    let mut days = Vec::<DailyTraffic>::new();
    for row in rows {
        let (
            date,
            content_type,
            entity_id,
            visitor_kind,
            referrer_kind,
            referrer,
            landing_url,
            crawler_name,
            ip_masked,
            country_code,
            region_code,
            region_name,
            city,
            postal_code,
            place_name,
            place_feature_code,
            place_distance,
            latitude,
            longitude,
            time_zone,
            accuracy_radius,
            visits,
        ) = row?;
        if days.last().is_none_or(|day| day.date != date) {
            days.push(DailyTraffic {
                date: date.clone(),
                visits: 0,
                content: Vec::new(),
            });
        }
        let day = days.last_mut().expect("daily acquisition day");
        day.visits += visits;
        let content = day.content.iter_mut().find(|item| {
            item.content_type == content_type
                && item.title
                    == titles
                        .get(&(content_type.as_str(), entity_id.as_str()))
                        .copied()
                        .unwrap_or(entity_id.as_str())
        });
        let evidence = (kind != AcquisitionKind::Human).then(|| {
            acquisition_evidence(
                kind,
                &visitor_kind,
                &referrer_kind,
                &referrer,
                &landing_url,
                &crawler_name,
                visits,
            )
        });
        let visitor = (kind == AcquisitionKind::Human).then(|| VisitorLocation {
            country_code,
            region_code,
            region_name,
            city,
            postal_code,
            place_name,
            place_feature_code,
            place_distance_km: format_distance(place_distance),
            latitude: format_coordinate(latitude),
            longitude: format_coordinate(longitude),
            time_zone,
            accuracy_radius,
            ip_addresses: (!ip_masked.is_empty())
                .then_some(ip_masked)
                .into_iter()
                .collect(),
            visits,
        });
        if let Some(content) = content {
            content.visits += visits;
            if let Some(evidence) = evidence {
                merge_traffic_evidence(&mut content.evidence, evidence);
            }
            if let Some(visitor) = visitor {
                merge_visitor_location(&mut content.visitors, visitor);
            }
        } else {
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
                evidence: evidence.into_iter().collect(),
                visitors: visitor.into_iter().collect(),
            });
        }
    }
    Ok(days)
}

fn format_coordinate(value: f64) -> String {
    if value == 0.0 {
        String::new()
    } else {
        format!("{value:.4}")
    }
}

fn format_distance(value: f64) -> String {
    if value <= 0.0 {
        String::new()
    } else {
        format!("{value:.1}")
    }
}

fn merge_visitor_location(locations: &mut Vec<VisitorLocation>, visitor: VisitorLocation) {
    if let Some(existing) = locations.iter_mut().find(|location| {
        location.country_code == visitor.country_code
            && location.region_code == visitor.region_code
            && location.region_name == visitor.region_name
            && location.city == visitor.city
            && location.postal_code == visitor.postal_code
            && location.place_name == visitor.place_name
            && location.place_feature_code == visitor.place_feature_code
            && location.place_distance_km == visitor.place_distance_km
            && location.latitude == visitor.latitude
            && location.longitude == visitor.longitude
            && location.time_zone == visitor.time_zone
            && location.accuracy_radius == visitor.accuracy_radius
    }) {
        existing.visits += visitor.visits;
        for ip in visitor.ip_addresses {
            if !existing.ip_addresses.contains(&ip) {
                existing.ip_addresses.push(ip);
            }
        }
        return;
    }
    locations.push(visitor);
}

fn merge_traffic_evidence(evidence: &mut Vec<TrafficEvidence>, incoming: TrafficEvidence) {
    if let Some(existing) = evidence.iter_mut().find(|item| {
        item.agent == incoming.agent
            && item.event == incoming.event
            && item.subject_kind == incoming.subject_kind
            && item.subject == incoming.subject
    }) {
        existing.visits += incoming.visits;
    } else {
        evidence.push(incoming);
    }
}

fn acquisition_evidence(
    kind: AcquisitionKind,
    visitor_kind: &str,
    referrer_kind: &str,
    referrer: &str,
    landing_url: &str,
    crawler_name: &str,
    visits: i64,
) -> TrafficEvidence {
    const SEARCH_QUERY_KEYS: &[&str] = &[
        "q",
        "query",
        "p",
        "wd",
        "text",
        "search",
        "search_query",
        "search_term",
        "searchterm",
    ];
    const KEYWORD_KEYS: &[&str] = &["utm_term", "keyword", "keywords"];
    const AI_QUERY_KEYS: &[&str] = &["geo_query", "ai_query", "prompt", "question"];

    let parsed = url::Url::parse(referrer).ok();
    let landing = parse_landing_url(landing_url);
    let source = (!crawler_name.is_empty() && visitor_kind.ends_with("_crawler"))
        .then(|| crawler_name.to_owned())
        .or_else(|| {
            parsed
                .as_ref()
                .and_then(url::Url::host_str)
                .map(|host| host.trim_start_matches("www.").to_owned())
        })
        .or_else(|| landing_query_value(landing.as_ref(), &["utm_source"]))
        .unwrap_or_else(|| {
            if !crawler_name.is_empty() {
                crawler_name.to_owned()
            } else if visitor_kind.ends_with("_crawler") {
                visitor_kind.replace('_', " ")
            } else {
                referrer_kind.replace('_', " ")
            }
        });
    let agent = display_agent_name(&source);
    let search_query = first_query_value(parsed.as_ref(), landing.as_ref(), SEARCH_QUERY_KEYS);
    let keyword = first_query_value(parsed.as_ref(), landing.as_ref(), KEYWORD_KEYS);
    // Answer engines use both AI-specific keys (`prompt`, `question`) and the
    // same provider-specific search keys as SEO (`wd`, `search`, `p`, ...).
    // Reuse the normalized search term so GEO and SEO cannot drift apart.
    let ai_query = first_query_value(parsed.as_ref(), landing.as_ref(), AI_QUERY_KEYS)
        .or_else(|| search_query.clone());
    let attribution_topic = landing_query_value(
        landing.as_ref(),
        &["prompt_topic", "utm_campaign", "utm_content"],
    );
    let page = landing.as_ref().map(page_topic);
    let event = match kind {
        AcquisitionKind::Geo if visitor_kind == "ai_crawler" => {
            match crawler_name.to_ascii_lowercase().as_str() {
                "chatgpt-user" | "claude-user" | "perplexity-user" | "doubao-user"
                | "kimi-user" => "User-requested fetch",
                "oai-searchbot" | "claude-searchbot" | "perplexitybot" | "kimi-searchbot" => {
                    "AI search indexing"
                }
                "gptbot" | "claudebot" | "kimibot" => "Model training crawl",
                _ => "AI crawl",
            }
            .to_owned()
        }
        AcquisitionKind::Geo => "Referral click".to_owned(),
        AcquisitionKind::Seo => if visitor_kind == "search_crawler" {
            "Search indexing"
        } else {
            "Search referral"
        }
        .to_owned(),
        AcquisitionKind::Human => "Visit".to_owned(),
    };
    let selected_subject = match kind {
        AcquisitionKind::Geo => ai_query
            .map(|value| ("ai_query", value))
            .or_else(|| keyword.map(|value| ("keyword", value)))
            .or_else(|| attribution_topic.map(|value| ("attributed_topic", value)))
            .or_else(|| {
                page.map(|value| {
                    if visitor_kind == "ai_crawler" {
                        ("page", value)
                    } else {
                        ("landing_page", value)
                    }
                })
            }),
        AcquisitionKind::Seo => search_query
            .map(|value| ("search_query", value))
            .or_else(|| keyword.map(|value| ("keyword", value)))
            .or_else(|| page.map(|value| ("landing_page", value))),
        AcquisitionKind::Human => None,
    };
    let (subject_kind, subject) = selected_subject
        .map(|(subject_kind, subject)| (subject_kind.to_owned(), subject))
        .unzip();
    TrafficEvidence {
        agent,
        event,
        subject_kind,
        subject,
        visits,
    }
}

fn parse_landing_url(raw: &str) -> Option<url::Url> {
    if raw.trim().is_empty() {
        return None;
    }
    url::Url::parse(raw).ok().or_else(|| {
        let base = url::Url::parse("https://silan.tech").ok()?;
        base.join(raw).ok()
    })
}

fn page_topic(url: &url::Url) -> String {
    let segments = url
        .path_segments()
        .map(|parts| parts.filter(|part| !part.is_empty()).collect::<Vec<_>>())
        .unwrap_or_default();
    match segments.as_slice() {
        [] | ["index.html"] => "Homepage".to_owned(),
        ["blog"] => "Blog".to_owned(),
        ["projects"] => "Projects".to_owned(),
        ["ideas"] => "Ideas".to_owned(),
        ["moments"] => "Moments".to_owned(),
        ["blog", slug] => format!("Blog · {}", humanize_topic(slug)),
        ["projects", slug] => format!("Project · {}", humanize_topic(slug)),
        ["ideas", slug] => format!("Idea · {}", humanize_topic(slug)),
        _ => humanize_topic(segments.last().copied().unwrap_or("unknown")),
    }
}

fn humanize_topic(value: &str) -> String {
    value
        .split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn display_agent_name(source: &str) -> String {
    match source.to_ascii_lowercase().as_str() {
        "chatgpt-user" => "ChatGPT User".to_owned(),
        "chatgpt.com" | "chatgpt" => "ChatGPT Referral".to_owned(),
        "oai-searchbot" => "OAI SearchBot".to_owned(),
        "gptbot" => "GPTBot".to_owned(),
        "claudebot" => "ClaudeBot".to_owned(),
        "claude-user" => "Claude User".to_owned(),
        "claude-searchbot" => "Claude SearchBot".to_owned(),
        "claude.ai" | "claude" => "Claude Referral".to_owned(),
        "perplexitybot" | "perplexity.ai" | "perplexity" => "Perplexity".to_owned(),
        "perplexity-user" => "Perplexity User".to_owned(),
        "deepseekbot" => "DeepSeek".to_owned(),
        "chat.deepseek.com" | "deepseek.com" => "DeepSeek Referral".to_owned(),
        "doubaobot" => "Doubao".to_owned(),
        "doubao-user" => "Doubao User".to_owned(),
        "bytedance bytespider" | "bytespider" => "ByteDance Bytespider".to_owned(),
        "doubao.com" => "Doubao Referral".to_owned(),
        "kimibot" => "KimiBot".to_owned(),
        "kimi-user" => "Kimi User".to_owned(),
        "kimi-searchbot" => "Kimi SearchBot".to_owned(),
        "kimi.com" | "kimi.moonshot.cn" => "Kimi Referral".to_owned(),
        "chatglm-spider" => "ChatGLM Spider".to_owned(),
        "chatglm.cn" | "chat.z.ai" | "zhipuai.cn" => "ChatGLM Referral".to_owned(),
        "google-extended" | "gemini.google.com" | "gemini" => "Gemini".to_owned(),
        _ => source.to_owned(),
    }
}

fn landing_query_value(url: Option<&url::Url>, keys: &[&str]) -> Option<String> {
    url_query_value(url, keys)
}

fn first_query_value(
    referrer: Option<&url::Url>,
    landing: Option<&url::Url>,
    keys: &[&str],
) -> Option<String> {
    url_query_value(referrer, keys).or_else(|| landing_query_value(landing, keys))
}

fn url_query_value(url: Option<&url::Url>, keys: &[&str]) -> Option<String> {
    let url = url?;
    url.query_pairs().find_map(|(name, value)| {
        keys.iter()
            .any(|key| name.eq_ignore_ascii_case(key))
            .then(|| normalize_evidence_subject(&value))
            .flatten()
    })
}

fn normalize_evidence_subject(value: &str) -> Option<String> {
    const MAX_SUBJECT_CHARS: usize = 240;
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.chars().take(MAX_SUBJECT_CHARS).collect())
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
                INSERT INTO stats_cache_location_v2 VALUES
                  ('SG', '', '', 'Singapore', '', 'Holland Village', 'PPLX', 1.4, 1.3239, 103.79, 'Asia/Singapore', 5, '[\"203.0.113.8\"]', 7, '2026-07-17T00:00:00Z');
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
                region_code: String::new(),
                region_name: String::new(),
                city: "Singapore".to_owned(),
                postal_code: String::new(),
                place_name: "Holland Village".to_owned(),
                place_feature_code: "PPLX".to_owned(),
                place_distance_km: "1.4".to_owned(),
                latitude: "1.3239".to_owned(),
                longitude: "103.7900".to_owned(),
                time_zone: "Asia/Singapore".to_owned(),
                accuracy_radius: 5,
                ip_addresses: vec!["203.0.113.8".to_owned()],
                visits: 7,
            }]
        );
        assert_eq!(snapshot.comments.pending, 1);
        assert_eq!(snapshot.freshness.state, FreshnessState::Current);
    }

    #[test]
    fn acquisition_evidence_extracts_search_keywords_and_ai_sources() {
        let search = acquisition_evidence(
            AcquisitionKind::Seo,
            "human",
            "search",
            "https://www.google.com/search?q=personal+context+system",
            "",
            "",
            3,
        );
        assert_eq!(search.agent, "google.com");
        assert_eq!(search.event, "Search referral");
        assert_eq!(search.subject.as_deref(), Some("personal context system"));
        assert_eq!(search.visits, 3);

        let yahoo_search = acquisition_evidence(
            AcquisitionKind::Seo,
            "human",
            "search",
            "https://search.yahoo.com/search?p=typed+state+machines",
            "",
            "",
            1,
        );
        assert_eq!(yahoo_search.subject_kind.as_deref(), Some("search_query"));
        assert_eq!(
            yahoo_search.subject.as_deref(),
            Some("typed state machines")
        );

        let tracked_keyword = acquisition_evidence(
            AcquisitionKind::Seo,
            "human",
            "search",
            "https://www.google.com/",
            "/blog/runtime?UTM_TERM=agent+runtime",
            "",
            1,
        );
        assert_eq!(tracked_keyword.subject_kind.as_deref(), Some("keyword"));
        assert_eq!(tracked_keyword.subject.as_deref(), Some("agent runtime"));

        let geo = acquisition_evidence(
            AcquisitionKind::Geo,
            "human",
            "ai_chat",
            "https://chatgpt.com/",
            "",
            "",
            1,
        );
        assert_eq!(geo.agent, "ChatGPT Referral");
        assert_eq!(geo.event, "Referral click");
        assert_eq!(geo.subject, None);

        let geo_query = acquisition_evidence(
            AcquisitionKind::Geo,
            "human",
            "ai_chat",
            "https://claude.ai/",
            "/?AI_QUERY=how+does+agent+memory+work",
            "",
            1,
        );
        assert_eq!(geo_query.subject_kind.as_deref(), Some("ai_query"));
        assert_eq!(
            geo_query.subject.as_deref(),
            Some("how does agent memory work")
        );

        let crawler = acquisition_evidence(
            AcquisitionKind::Geo,
            "ai_crawler",
            "direct",
            "",
            "",
            "GPTBot",
            2,
        );
        assert_eq!(crawler.agent, "GPTBot");
        assert_eq!(crawler.event, "Model training crawl");
        assert_eq!(crawler.subject, None);

        let crawler_with_self_referrer = acquisition_evidence(
            AcquisitionKind::Geo,
            "ai_crawler",
            "direct",
            "https://silan.tech/ideas",
            "/",
            "GPTBot",
            38,
        );
        assert_eq!(crawler_with_self_referrer.agent, "GPTBot");
        assert_eq!(crawler_with_self_referrer.event, "Model training crawl");

        let attributed_geo = acquisition_evidence(
            AcquisitionKind::Geo,
            "human",
            "ai_chat",
            "",
            "https://silan.tech/?utm_source=chatgpt&utm_medium=ai&prompt_topic=agent+memory",
            "",
            1,
        );
        assert_eq!(attributed_geo.agent, "ChatGPT Referral");
        assert_eq!(attributed_geo.event, "Referral click");
        assert_eq!(
            attributed_geo.subject_kind.as_deref(),
            Some("attributed_topic")
        );
        assert_eq!(attributed_geo.subject.as_deref(), Some("agent memory"));

        let chatgpt_page = acquisition_evidence(
            AcquisitionKind::Geo,
            "ai_crawler",
            "direct",
            "",
            "/moments/",
            "chatgpt-user",
            2,
        );
        assert_eq!(chatgpt_page.agent, "ChatGPT User");
        assert_eq!(chatgpt_page.event, "User-requested fetch");
        assert_eq!(chatgpt_page.subject_kind.as_deref(), Some("page"));
        assert_eq!(chatgpt_page.subject.as_deref(), Some("Moments"));

        let claude_user = acquisition_evidence(
            AcquisitionKind::Geo,
            "ai_crawler",
            "direct",
            "",
            "/blog/agent-memory",
            "Claude-User",
            1,
        );
        assert_eq!(claude_user.agent, "Claude User");
        assert_eq!(claude_user.event, "User-requested fetch");

        let kimi_search = acquisition_evidence(
            AcquisitionKind::Geo,
            "ai_crawler",
            "direct",
            "",
            "/blog/agent-memory?search=agent+memory+runtime",
            "Kimi-SearchBot",
            1,
        );
        assert_eq!(kimi_search.agent, "Kimi SearchBot");
        assert_eq!(kimi_search.event, "AI search indexing");
        assert_eq!(kimi_search.subject_kind.as_deref(), Some("ai_query"));
        assert_eq!(kimi_search.subject.as_deref(), Some("agent memory runtime"));

        let doubao_referral = acquisition_evidence(
            AcquisitionKind::Geo,
            "human",
            "ai_chat",
            "https://www.doubao.com/chat/",
            "/blog/agent-memory",
            "",
            1,
        );
        assert_eq!(doubao_referral.agent, "Doubao Referral");

        let chatglm_crawler = acquisition_evidence(
            AcquisitionKind::Geo,
            "ai_crawler",
            "direct",
            "",
            "/blog/agent-memory?wd=typed+agent+state",
            "ChatGLM-Spider",
            1,
        );
        assert_eq!(chatglm_crawler.agent, "ChatGLM Spider");
        assert_eq!(chatglm_crawler.event, "AI crawl");
        assert_eq!(chatglm_crawler.subject_kind.as_deref(), Some("ai_query"));
        assert_eq!(
            chatglm_crawler.subject.as_deref(),
            Some("typed agent state")
        );
    }
}
