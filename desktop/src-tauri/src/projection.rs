//! SQLite read adapter. Content mutations never enter this module.

use crate::model::{ContentMetrics, DashboardItem, EntitySummary, RawPart, RawTranslation};
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

    pub(crate) fn entity_summary(
        &self,
        entity_type: &str,
        entity_id: &str,
        language: &str,
    ) -> Result<EntitySummary, String> {
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
            "episode" => Some(
                "
                SELECT
                    COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug),
                    e.slug,
                    e.status,
                    e.visibility,
                    e.series_id,
                    s.slug,
                    COALESCE(NULLIF(st.title, ''), NULLIF(s.title, ''), s.slug),
                    e.episode_number
                FROM episodes AS e
                LEFT JOIN episode_translations AS t ON t.episode_id = e.id AND t.language_code = ?1
                LEFT JOIN episode_series AS s ON s.id = e.series_id
                LEFT JOIN episode_series_translations AS st ON st.episode_series_id = s.id AND st.language_code = ?1
                WHERE e.id = ?2
                ",
            ),
            "update" => Some(
                "
                SELECT COALESCE(NULLIF(t.title, ''), NULLIF(e.title, ''), e.slug), e.slug, e.status, e.visibility
                FROM recent_updates AS e
                LEFT JOIN recent_update_translations AS t ON t.recent_update_id = e.id AND t.language_code = ?1
                WHERE e.id = ?2
                ",
            ),
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
                })
            })
            .optional()
            .map_err(|error| error.to_string())
            .map(|summary| summary.unwrap_or_default())
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
}
