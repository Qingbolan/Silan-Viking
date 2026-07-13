//! Optional runtime insights stored alongside the content projection.
//!
//! A freshly synchronized local database contains only authored content.
//! Runtime-owned tables appear after serving traffic, so their absence means
//! "no observations yet" rather than a broken workspace.

use crate::model::RuntimeInsights;
use rusqlite::{Connection, OpenFlags};
use std::path::Path;

pub(crate) struct RuntimeInsightsRepository {
    connection: Connection,
}

impl RuntimeInsightsRepository {
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map(|connection| Self { connection })
            .map_err(|error| error.to_string())
    }

    pub(crate) fn snapshot(&self) -> Result<RuntimeInsights, String> {
        let (total_comments, pending_comments) = if self.table_exists("comments")? {
            (
                self.scalar_i64("SELECT COUNT(*) FROM comments")?,
                self.scalar_i64("SELECT COUNT(*) FROM comments WHERE is_approved = 0")?,
            )
        } else {
            (0, 0)
        };
        let (human_interactions, crawler_interactions) =
            if self.table_exists("content_interaction")? {
                (
                    self.scalar_i64(
                        "SELECT COUNT(*) FROM content_interaction WHERE visitor_kind = 'human'",
                    )?,
                    self.scalar_i64(
                        "SELECT COUNT(*) FROM content_interaction WHERE visitor_kind <> 'human'",
                    )?,
                )
            } else {
                (0, 0)
            };

        Ok(RuntimeInsights {
            total_comments,
            pending_comments,
            human_interactions,
            crawler_interactions,
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

    fn scalar_i64(&self, query: &str) -> Result<i64, String> {
        self.connection
            .query_row(query, [], |row| row.get(0))
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_runtime_tables_are_an_empty_snapshot() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("portfolio.db");
        Connection::open(&path).expect("create empty database");

        let repository = RuntimeInsightsRepository::open(path).expect("open insights");

        assert_eq!(
            repository.snapshot().expect("read empty snapshot"),
            RuntimeInsights::default()
        );
    }

    #[test]
    fn runtime_snapshot_counts_available_observations() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("portfolio.db");
        let connection = Connection::open(&path).expect("create database");
        connection
            .execute_batch(
                "
                CREATE TABLE comments (is_approved INTEGER NOT NULL);
                INSERT INTO comments VALUES (0), (1), (0);
                CREATE TABLE content_interaction (visitor_kind TEXT NOT NULL);
                INSERT INTO content_interaction VALUES ('human'), ('crawler'), ('bot');
                ",
            )
            .expect("seed runtime observations");
        drop(connection);

        let repository = RuntimeInsightsRepository::open(path).expect("open insights");

        assert_eq!(
            repository.snapshot().expect("read snapshot"),
            RuntimeInsights {
                total_comments: 3,
                pending_comments: 2,
                human_interactions: 1,
                crawler_interactions: 2,
            }
        );
    }
}
