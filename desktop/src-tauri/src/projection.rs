//! SQLite read adapter. Content mutations never enter this module.

use crate::model::{
    ContentMetrics, DashboardItem, DeployedStats, EntitySummary, RawPart, RawTranslation,
    EntityCount, ResumeEntry, ResumeSection,
};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use std::path::Path;

pub(crate) struct ProjectionRepository {
    connection: Connection,
}

impl ProjectionRepository {
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map(|connection| Self { connection })
            .map_err(|error| error.to_string())
    }

    pub(crate) fn content_metrics(&self) -> Result<ContentMetrics, String> {
        Ok(ContentMetrics {
            total_views: self.scalar_i64(
                "
                SELECT
                    (SELECT COALESCE(SUM(view_count), 0) FROM blog_posts) +
                    (SELECT COALESCE(SUM(view_count), 0) FROM projects) +
                    (SELECT COALESCE(SUM(view_count), 0) FROM ideas)
                ",
            )?,
            total_likes: self.scalar_i64(
                "
                SELECT
                    (SELECT COALESCE(SUM(like_count), 0) FROM blog_posts) +
                    (SELECT COALESCE(SUM(like_count), 0) FROM projects) +
                    (SELECT COALESCE(SUM(like_count), 0) FROM ideas)
                ",
            )?,
            recent_items: self.recent_items()?,
        })
    }

    /// Aggregate `stats_cache_item` totals synced from the deployed server.
    /// The cache table only exists after `sync_stats` has run at least once,
    /// so its absence means "never synced", not a broken workspace.
    pub(crate) fn deployed_stats(&self) -> Result<DeployedStats, String> {
        if !self.table_exists("stats_cache_item")? {
            return Ok(DeployedStats::default());
        }
        let (views, likes, comments, synced_at) = self
            .connection
            .query_row(
                "
                SELECT
                    COALESCE(SUM(views), 0),
                    COALESCE(SUM(likes), 0),
                    COALESCE(SUM(comments), 0),
                    MAX(synced_at)
                FROM stats_cache_item
                ",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|error| error.to_string())?;

        let (human_interactions, ai_crawler_interactions, search_crawler_interactions) = if self
            .table_exists("stats_cache_crawler")?
        {
            (
                self.scalar_i64(
                    "SELECT COALESCE(SUM(count), 0) FROM stats_cache_crawler WHERE visitor_kind = 'human'",
                )?,
                self.scalar_i64(
                    "SELECT COALESCE(SUM(count), 0) FROM stats_cache_crawler WHERE visitor_kind = 'ai_crawler'",
                )?,
                self.scalar_i64(
                    "SELECT COALESCE(SUM(count), 0) FROM stats_cache_crawler WHERE visitor_kind = 'search_crawler'",
                )?,
            )
        } else {
            (0, 0, 0)
        };
        let ai_chat_referrals = if self.table_exists("stats_cache_source")? {
            self.scalar_i64(
                "SELECT COALESCE(SUM(count), 0) FROM stats_cache_source WHERE source = 'ai_chat'",
            )?
        } else {
            0
        };

        Ok(DeployedStats {
            views,
            likes,
            comments,
            human_interactions,
            ai_crawler_interactions,
            search_crawler_interactions,
            ai_chat_referrals,
            synced_at,
        })
    }

    fn table_exists(&self, name: &str) -> Result<bool, String> {
        self.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                [name],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())
    }

    fn column_exists(&self, table: &str, column: &str) -> Result<bool, String> {
        let table = match table {
            "recent_updates" => table,
            "episode_series" => table,
            other => return Err(format!("unsupported schema inspection table `{other}`")),
        };
        self.connection
            .query_row(
                &format!(
                    "SELECT EXISTS(SELECT 1 FROM pragma_table_info('{table}') WHERE name = ?1)"
                ),
                [column],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())
    }

    pub(crate) fn all_parts(&self) -> Result<Vec<RawPart>, String> {
        let mut statement = self
            .connection
            .prepare(
                "
                SELECT
                    ip.id,
                    ip.part_id,
                    ip.entity_type,
                    ip.entity_id,
                    ip.role,
                    ip.canonical_lang,
                    COALESCE(CAST(ip.updated_at AS TEXT), '')
                FROM item_part AS ip
                LEFT JOIN episodes AS ep ON ip.entity_type = 'episode' AND ep.id = ip.entity_id
                ORDER BY
                    ip.entity_type,
                    CASE WHEN ip.entity_type = 'episode' THEN ep.series_id ELSE ip.entity_id END,
                    CASE WHEN ip.entity_type = 'episode' THEN ep.episode_number ELSE ip.sort_order END,
                    ip.sort_order
                ",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], raw_part_from_row)
            .map_err(|error| error.to_string())?;

        let mut parts = Vec::new();
        for row in rows {
            let mut part = row.map_err(|error| error.to_string())?;
            part.translations = self.translations(&part.id)?;
            parts.push(part);
        }
        Ok(parts)
    }

    pub(crate) fn entity_counts(&self) -> Result<Vec<EntityCount>, String> {
        let mut statement = self
            .connection
            .prepare(
                "
                SELECT entity_type, COUNT(DISTINCT entity_id)
                FROM item_part
                GROUP BY entity_type
                ",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(EntityCount {
                    entity_type: row.get(0)?,
                    count: row.get(1)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub(crate) fn part(&self, id: &str) -> Result<RawPart, String> {
        let mut part = self
            .connection
            .query_row(
                "
                SELECT
                    ip.id,
                    ip.part_id,
                    ip.entity_type,
                    ip.entity_id,
                    ip.role,
                    ip.canonical_lang,
                    COALESCE(CAST(ip.updated_at AS TEXT), '')
                FROM item_part AS ip
                WHERE ip.id = ?1
                ",
                params![id],
                raw_part_from_row,
            )
            .map_err(|error| error.to_string())?;
        part.translations = self.translations(&part.id)?;
        Ok(part)
    }

    pub(crate) fn part_by_stable_id(&self, part_id: &str) -> Result<RawPart, String> {
        let mut part = self
            .connection
            .query_row(
                "
                SELECT
                    ip.id,
                    ip.part_id,
                    ip.entity_type,
                    ip.entity_id,
                    ip.role,
                    ip.canonical_lang,
                    COALESCE(CAST(ip.updated_at AS TEXT), '')
                FROM item_part AS ip
                WHERE ip.part_id = ?1
                ",
                params![part_id],
                raw_part_from_row,
            )
            .map_err(|error| error.to_string())?;
        part.translations = self.translations(&part.id)?;
        Ok(part)
    }

    pub(crate) fn part_for_translation(&self, translation_id: &str) -> Result<RawPart, String> {
        let mut part = self
            .connection
            .query_row(
                "
                SELECT
                    ip.id,
                    ip.part_id,
                    ip.entity_type,
                    ip.entity_id,
                    ip.role,
                    ip.canonical_lang,
                    COALESCE(CAST(ip.updated_at AS TEXT), '')
                FROM item_part_translation AS ipt
                INNER JOIN item_part AS ip ON ip.id = ipt.item_part_id
                WHERE ipt.id = ?1
                ",
                params![translation_id],
                raw_part_from_row,
            )
            .map_err(|error| error.to_string())?;
        part.translations = self.translations(&part.id)?;
        Ok(part)
    }

    /// The entity's authored cover image, when the content declares one
    /// (`featured_image` on blog posts, `thumbnail` on projects). Returns
    /// `None` for kinds without a cover concept and for empty values.
    pub(crate) fn cover_url(
        &self,
        entity_type: &str,
        entity_id: &str,
    ) -> Result<Option<String>, String> {
        let query = match entity_type {
            "blog" => "SELECT featured_image_url FROM blog_posts WHERE id = ?1",
            "project" => "SELECT thumbnail_url FROM projects WHERE id = ?1",
            _ => return Ok(None),
        };
        self.connection
            .query_row(query, params![entity_id], |row| {
                row.get::<_, Option<String>>(0)
            })
            .optional()
            .map_err(|error| error.to_string())
            .map(|value| value.flatten().filter(|url| !url.is_empty()))
    }

    pub(crate) fn entity_summary(
        &self,
        entity_type: &str,
        entity_id: &str,
        language: &str,
    ) -> Result<EntitySummary, String> {
        let update_has_pinned = if entity_type == "update" {
            self.column_exists("recent_updates", "pinned")?
        } else {
            false
        };
        let update_pinned_projection = if update_has_pinned {
            "COALESCE(e.pinned, 0)"
        } else {
            "0"
        };
        let series_has_cover = if entity_type == "episode" {
            self.column_exists("episode_series", "cover_url")?
        } else {
            false
        };
        let series_cover_projection = if series_has_cover {
            "COALESCE(NULLIF(s.cover_url, ''), '')"
        } else {
            "''"
        };
        let update_query = format!(
            "
            SELECT
                COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug),
                e.slug,
                e.status,
                e.visibility,
                NULL,
                NULL,
                NULL,
                NULL,
                COALESCE(CAST(e.date AS TEXT), ''),
                {update_pinned_projection}
            FROM recent_updates AS e
            LEFT JOIN recent_update_translations AS t ON t.recent_update_id = e.id AND t.language_code = ?1
            WHERE e.id = ?2
            "
        );
        let episode_query = format!(
            "
            SELECT
                COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug),
                e.slug,
                e.status,
                e.visibility,
                e.series_id,
                s.slug,
                COALESCE(NULLIF(st.title, ''), NULLIF(s.title, ''), s.slug),
                e.episode_number,
                COALESCE(NULLIF(st.description, ''), NULLIF(s.description, '')),
                {series_cover_projection}
            FROM episodes AS e
            LEFT JOIN episode_translations AS t ON t.episode_id = e.id AND t.language_code = ?1
            LEFT JOIN episode_series AS s ON s.id = e.series_id
            LEFT JOIN episode_series_translations AS st ON st.episode_series_id = s.id AND st.language_code = ?1
            WHERE e.id = ?2
            "
        );
        let query = match entity_type {
            "blog" => Some(
                "
                SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
                FROM blog_posts AS e
                LEFT JOIN blog_post_translations AS t ON t.blog_post_id = e.id AND t.language_code = ?1
                WHERE e.id = ?2
                ",
            ),
            "project" => Some(
                "
                SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
                FROM projects AS e
                LEFT JOIN project_translations AS t ON t.project_id = e.id AND t.language_code = ?1
                WHERE e.id = ?2
                ",
            ),
            "idea" => Some(
                "
                SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
                FROM ideas AS e
                LEFT JOIN idea_translations AS t ON t.idea_id = e.id AND t.language_code = ?1
                WHERE e.id = ?2
                ",
            ),
            "episode" => Some(episode_query.as_str()),
            "update" => Some(update_query.as_str()),
            "resume" => {
                return Ok(EntitySummary {
                    title: "Resume".to_owned(),
                    slug: "resume".to_owned(),
                    ..EntitySummary::default()
                });
            }
            _ => None,
        };
        let Some(query) = query else {
            return Ok(EntitySummary::default());
        };

        self.connection
            .query_row(query, params![language, entity_id], |row| {
                Ok(EntitySummary {
                    title: row.get::<_, Option<String>>(0)?.unwrap_or_default(),
                    slug: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    status: row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    visibility: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
                    series_id: row.get::<_, Option<String>>(4).ok().flatten(),
                    series_slug: row.get::<_, Option<String>>(5).ok().flatten(),
                    series_title: row.get::<_, Option<String>>(6).ok().flatten(),
                    episode_number: row.get::<_, Option<i64>>(7).ok().flatten(),
                    series_description: if entity_type == "episode" {
                        row.get::<_, Option<String>>(8).ok().flatten()
                    } else {
                        None
                    },
                    series_cover_url: if entity_type == "episode" {
                        row.get::<_, Option<String>>(9).ok().flatten()
                    } else {
                        None
                    },
                    date: if entity_type == "update" {
                        row.get::<_, Option<String>>(8).ok().flatten()
                    } else {
                        None
                    },
                    pinned: if entity_type == "update" {
                        row.get::<_, Option<i64>>(9).ok().flatten().unwrap_or(0) != 0
                    } else {
                        false
                    },
                })
            })
            .optional()
            .map_err(|error| error.to_string())
            .map(|summary| summary.unwrap_or_default())
    }

    /// Structured Resume parts (education/experience/awards/publications/
    /// research/skills), read from the generic `part_entry` /
    /// `part_entry_translation` sync tables rather than re-parsing TOML —
    /// the engine already flattens `entry_list` / `key_value_list` shapes
    /// into these tables during `index sync`. `overview` and `summary` are
    /// plain Markdown and stay out of this view; they're edited through the
    /// normal `EditorDocument` path instead.
    pub(crate) fn resume_sections(&self, language: &str) -> Result<Vec<ResumeSection>, String> {
        const ENTRY_LIST_ROLES: &[&str] = &[
            "education",
            "experience",
            "awards",
            "publications",
            "research",
            "expectations",
        ];
        const KEY_VALUE_ROLES: &[&str] = &["skills"];

        let mut statement = self
            .connection
            .prepare(
                "
                SELECT id, role, canonical_lang
                FROM item_part
                WHERE entity_type = 'resume'
                ORDER BY sort_order, role
                ",
            )
            .map_err(|error| error.to_string())?;
        let parts = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        let mut sections = Vec::new();
        for (item_part_id, role, canonical_lang) in parts {
            let shape = if KEY_VALUE_ROLES.contains(&role.as_str()) {
                "key_value_list"
            } else if ENTRY_LIST_ROLES.contains(&role.as_str()) {
                "entry_list"
            } else {
                continue;
            };
            let entries = self.resume_entries(&item_part_id, language, &canonical_lang)?;
            sections.push(ResumeSection {
                role,
                shape: shape.to_owned(),
                canonical_language: canonical_lang,
                entries,
            });
        }
        Ok(sections)
    }

    fn resume_entries(
        &self,
        item_part_id: &str,
        language: &str,
        canonical_lang: &str,
    ) -> Result<Vec<ResumeEntry>, String> {
        let mut statement = self
            .connection
            .prepare(
                "
                SELECT
                    pe.entry_id,
                    pe.sort_order,
                    pe.shared_payload,
                    COALESCE(t.localized_payload, ct.localized_payload, '{}')
                FROM part_entry AS pe
                LEFT JOIN part_entry_translation AS t
                    ON t.part_entry_id = pe.id AND t.language_code = ?2
                LEFT JOIN part_entry_translation AS ct
                    ON ct.part_entry_id = pe.id AND ct.language_code = ?3
                WHERE pe.item_part_id = ?1
                ORDER BY pe.sort_order
                ",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![item_part_id, language, canonical_lang], |row| {
                let shared_json: String = row.get(2)?;
                let localized_json: String = row.get(3)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    shared_json,
                    localized_json,
                ))
            })
            .map_err(|error| error.to_string())?;

        let mut entries = Vec::new();
        for row in rows {
            let (entry_id, sort_order, shared_json, localized_json) =
                row.map_err(|error| error.to_string())?;
            entries.push(ResumeEntry {
                entry_id,
                sort_order,
                shared: serde_json::from_str(&shared_json).unwrap_or(serde_json::Value::Null),
                localized: serde_json::from_str(&localized_json).unwrap_or(serde_json::Value::Null),
            });
        }
        Ok(entries)
    }

    fn scalar_i64(&self, query: &str) -> Result<i64, String> {
        self.connection
            .query_row(query, [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }

    fn recent_items(&self) -> Result<Vec<DashboardItem>, String> {
        let mut statement = self
            .connection
            .prepare(
                "
                SELECT entity_type, title, slug, status, visibility, updated_at
                FROM (
                    SELECT 'blog' AS entity_type, COALESCE(NULLIF(title, ''), slug) AS title, slug, status, visibility, COALESCE(CAST(updated_at AS TEXT), '') AS updated_at FROM blog_posts
                    UNION ALL
                    SELECT 'project', COALESCE(NULLIF(title, ''), slug), slug, status, visibility, COALESCE(CAST(updated_at AS TEXT), '') FROM projects
                    UNION ALL
                    SELECT 'idea', COALESCE(NULLIF(title, ''), slug), slug, status, visibility, COALESCE(CAST(updated_at AS TEXT), '') FROM ideas
                    UNION ALL
                    SELECT 'episode', COALESCE(NULLIF(title, ''), slug), slug, status, visibility, COALESCE(CAST(updated_at AS TEXT), '') FROM episodes
                    UNION ALL
                    SELECT 'update', COALESCE(NULLIF(title, ''), slug), slug, status, visibility, COALESCE(CAST(updated_at AS TEXT), '') FROM recent_updates
                )
                ORDER BY updated_at DESC
                LIMIT 8
                ",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(DashboardItem {
                    entity_type: row.get(0)?,
                    title: row.get(1)?,
                    slug: row.get(2)?,
                    status: row.get(3)?,
                    visibility: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    fn translations(&self, item_part_id: &str) -> Result<Vec<RawTranslation>, String> {
        let mut statement = self
            .connection
            .prepare(
                "
                SELECT id, language_code
                FROM item_part_translation
                WHERE item_part_id = ?1
                ORDER BY language_code
                ",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![item_part_id], |row| {
                Ok(RawTranslation {
                    id: row.get(0)?,
                    language: row.get(1)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }
}

fn raw_part_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RawPart> {
    Ok(RawPart {
        id: row.get(0)?,
        part_id: row.get(1)?,
        entity_type: row.get(2)?,
        entity_id: row.get(3)?,
        role: row.get(4)?,
        canonical_language: row.get(5)?,
        updated_at: row.get(6)?,
        translations: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projection_connection_cannot_mutate_the_database() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("portfolio.db");
        Connection::open(&path)
            .expect("create database")
            .execute("CREATE TABLE marker (id INTEGER)", [])
            .expect("create marker table");

        let repository = ProjectionRepository::open(&path).expect("open projection");
        let write = repository
            .connection
            .execute("INSERT INTO marker (id) VALUES (1)", []);

        assert!(write.is_err(), "the projection adapter must be read-only");
    }

    #[test]
    fn deployed_stats_are_empty_before_the_cache_table_exists() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("portfolio.db");
        Connection::open(&path).expect("create empty database");

        let repository = ProjectionRepository::open(&path).expect("open projection");
        let stats = repository.deployed_stats().expect("read deployed stats");

        assert_eq!(stats.views, 0);
        assert_eq!(stats.likes, 0);
        assert_eq!(stats.comments, 0);
        assert_eq!(stats.synced_at, None);
    }

    #[test]
    fn deployed_stats_sum_across_every_cached_item() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("portfolio.db");
        let connection = Connection::open(&path).expect("create database");
        connection
            .execute_batch(
                "
                CREATE TABLE stats_cache_item (
                    entity_type TEXT NOT NULL,
                    entity_id   TEXT NOT NULL,
                    views       INTEGER NOT NULL,
                    likes       INTEGER NOT NULL,
                    comments    INTEGER NOT NULL,
                    synced_at   TEXT NOT NULL,
                    PRIMARY KEY (entity_type, entity_id)
                );
                INSERT INTO stats_cache_item VALUES
                    ('blog', 'a', 10, 2, 1, '2026-07-14T10:00:00Z'),
                    ('project', 'b', 5, 1, 0, '2026-07-14T10:05:00Z');
                ",
            )
            .expect("seed cache");
        drop(connection);

        let repository = ProjectionRepository::open(&path).expect("open projection");
        let stats = repository.deployed_stats().expect("read deployed stats");

        assert_eq!(stats.views, 15);
        assert_eq!(stats.likes, 3);
        assert_eq!(stats.comments, 1);
        assert_eq!(stats.synced_at.as_deref(), Some("2026-07-14T10:05:00Z"));
    }
}
