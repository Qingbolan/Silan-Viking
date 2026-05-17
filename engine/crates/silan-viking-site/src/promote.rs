//! The deploy promote job (`08` §8.3, `11` §11.11).
//!
//! `deploy` must never overwrite the server's runtime data. `silan index
//! sync` produces a *derived snapshot* DB; `promote` applies that snapshot's
//! derived tables onto the live `portfolio.db` **table by table, in one
//! transaction**, leaving the runtime tables (`comments`,
//! `content_interaction`, `annotation`, `user_identities`, `request_logs`)
//! untouched.
//!
//! The SQL shape is fixed (`11` §11.11): `PRAGMA journal_mode=WAL` +
//! `busy_timeout`, `BEGIN IMMEDIATE`, then `DELETE`+`INSERT` for each derived
//! table, then the `sync_meta.content_commit` marker, then `COMMIT`. Any
//! failure rolls back — the live DB is never left half-new.

use rusqlite::Connection;
use thiserror::Error;

/// The derived-table whitelist — the **only** tables promote may DELETE and
/// rebuild (`11` §11.11 terminal-state whitelist). Runtime tables are absent
/// by construction, so a promote can never touch them.
///
/// Order matters: child/translation tables are deleted before their parents
/// would be — but since promote deletes *all* listed tables before inserting
/// any, FK ordering only matters for the INSERT phase, handled by inserting
/// parents before children below.
pub const DERIVED_TABLES: &[&str] = &[
    // content main tables
    "blog_posts",
    "ideas",
    "projects",
    "personal_info",
    "recent_updates",
    "episode_series",
    "episodes",
    // part bodies and entries
    "item_part",
    "item_part_translation",
    "part_entry",
    "part_entry_translation",
    // relations
    "content_relation",
    // translations
    "blog_post_translations",
    "idea_translations",
    "project_translations",
    "personal_info_translations",
    "recent_update_translations",
    "episode_translations",
    "episode_series_translations",
];

/// The runtime tables promote must never name in its SQL (`11` §11.11). Kept
/// here so [`PromoteError::RuntimeTableInPlan`] can name the offender and so
/// the invariant is testable.
pub const RUNTIME_TABLES: &[&str] = &[
    "comments",
    "content_interaction",
    "annotation",
    "user_identities",
    "request_logs",
];

/// Promote failures. Every variant leaves the live DB in its pre-promote
/// state — promote is all-or-nothing.
#[derive(Debug, Error)]
pub enum PromoteError {
    /// Opening or attaching a database failed.
    #[error("promote database error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    /// The plan named a runtime table — refused before any write.
    #[error("promote plan names runtime table `{0}` — runtime data must not be replaced")]
    RuntimeTableInPlan(String),
    /// The live DB write lock could not be taken within `busy_timeout`.
    #[error("promote could not acquire the write lock; the live database is unchanged")]
    Busy,
}

/// The outcome of a successful promote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromoteReport {
    /// The derived tables that were replaced.
    pub replaced_tables: Vec<String>,
    /// The total rows inserted across all derived tables.
    pub rows_inserted: usize,
    /// The `content_commit` marker written to `sync_meta`.
    pub content_commit: String,
}

/// Apply the derived tables of `snapshot_db` onto `live_db`, transactionally,
/// leaving the runtime tables of `live_db` untouched (`08` §8.3).
///
/// `content_commit` is the `content/` Git commit the snapshot was synced
/// from; it is written last, as the "this batch is complete" marker
/// (`11` §11.11) — monitoring reads only this, never intermediate row counts.
pub fn promote(
    live_db: &str,
    snapshot_db: &str,
    content_commit: &str,
) -> Result<PromoteReport, PromoteError> {
    // Defence in depth: the whitelist is a constant, but assert no runtime
    // table slipped in before opening any connection.
    for table in DERIVED_TABLES {
        if RUNTIME_TABLES.contains(table) {
            return Err(PromoteError::RuntimeTableInPlan((*table).to_owned()));
        }
    }

    let conn = Connection::open(live_db)?;
    // WAL so the Go API's readers are not blocked; bounded busy wait so a
    // contended promote fails cleanly rather than hanging (`11` §11.11).
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.execute(
        "ATTACH DATABASE ?1 AS snapshot",
        rusqlite::params![snapshot_db],
    )?;

    let result = promote_txn(&conn, content_commit);

    // Detach regardless of outcome so the connection is reusable / closeable.
    let _ = conn.execute("DETACH DATABASE snapshot", []);
    result
}

/// The transactional core: one `IMMEDIATE` transaction, all DELETEs then all
/// INSERTs then the marker. A `?` anywhere rolls the whole thing back.
fn promote_txn(conn: &Connection, content_commit: &str) -> Result<PromoteReport, PromoteError> {
    conn.execute_batch("BEGIN IMMEDIATE")?;

    let outcome = (|| -> Result<PromoteReport, PromoteError> {
        // A derived table is replaced only if it exists in *both* the live
        // DB and the snapshot. A live table missing from the snapshot is
        // left alone; a snapshot table missing from the live DB is skipped
        // (the live schema is authoritative for what promote may write).
        let mut replaceable = Vec::new();
        for table in DERIVED_TABLES {
            if has_table(conn, "main", table)? && has_table(conn, "snapshot", table)? {
                replaceable.push(*table);
            }
        }

        // Phase 1 — clear the replaceable tables. Reverse order so a child
        // (translation/entry) table is emptied before its parent.
        for table in replaceable.iter().rev() {
            conn.execute(&format!("DELETE FROM {table}"), [])?;
        }

        // Phase 2 — refill from the attached snapshot, parents first so FK
        // constraints (if enabled) are satisfied.
        let mut rows_inserted = 0usize;
        for table in &replaceable {
            let n = conn.execute(
                &format!("INSERT INTO {table} SELECT * FROM snapshot.{table}"),
                [],
            )?;
            rows_inserted += n;
        }

        // Phase 3 — the completion marker. Monitoring/rollback reads only
        // this (`11` §11.11).
        conn.execute(
            "INSERT INTO sync_meta(key, value) VALUES('content_commit', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![content_commit],
        )?;

        Ok(PromoteReport {
            replaced_tables: replaceable.iter().map(|t| (*t).to_owned()).collect(),
            rows_inserted,
            content_commit: content_commit.to_owned(),
        })
    })();

    match outcome {
        Ok(report) => {
            conn.execute_batch("COMMIT")?;
            Ok(report)
        }
        Err(e) => {
            // Roll back so the live DB keeps its pre-promote state.
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// Whether `schema` (`main` or the attached `snapshot`) has a table.
fn has_table(conn: &Connection, schema: &str, table: &str) -> Result<bool, PromoteError> {
    // `schema` is a fixed internal literal (`main` / `snapshot`), never user
    // input, so interpolating it into the query is safe.
    let count: i64 = conn.query_row(
        &format!("SELECT count(*) FROM {schema}.sqlite_master WHERE type='table' AND name=?1"),
        rusqlite::params![table],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitelist_and_runtime_tables_are_disjoint() {
        for derived in DERIVED_TABLES {
            assert!(
                !RUNTIME_TABLES.contains(derived),
                "`{derived}` must not be both derived and runtime"
            );
        }
    }

    #[test]
    fn promote_replaces_derived_tables_and_keeps_runtime_rows() {
        let dir = std::env::temp_dir().join(format!("silan-promote-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("mkdir");
        let live = dir.join("live.db");
        let snap = dir.join("snapshot.db");

        // A minimal live DB: one derived table + one runtime table + sync_meta.
        {
            let c = Connection::open(&live).expect("open live");
            c.execute_batch(
                "CREATE TABLE blog_posts(id TEXT, slug TEXT);
                 CREATE TABLE comments(id TEXT, body TEXT);
                 CREATE TABLE sync_meta(key TEXT PRIMARY KEY, value TEXT);
                 INSERT INTO blog_posts VALUES('old','old-post');
                 INSERT INTO comments VALUES('c1','a real visitor comment');",
            )
            .expect("seed live");
        }
        // The snapshot only carries derived tables.
        {
            let c = Connection::open(&snap).expect("open snap");
            c.execute_batch(
                "CREATE TABLE blog_posts(id TEXT, slug TEXT);
                 INSERT INTO blog_posts VALUES('new','fresh-post');",
            )
            .expect("seed snap");
        }

        let report = promote(
            live.to_str().expect("path"),
            snap.to_str().expect("path"),
            "commit-abc",
        )
        .expect("promote succeeds");
        assert_eq!(report.content_commit, "commit-abc");

        let c = Connection::open(&live).expect("reopen live");
        // The derived table was replaced.
        let slug: String = c
            .query_row("SELECT slug FROM blog_posts", [], |r| r.get(0))
            .expect("query blog");
        assert_eq!(slug, "fresh-post");
        // The runtime comment survived.
        let comment: String = c
            .query_row("SELECT body FROM comments", [], |r| r.get(0))
            .expect("query comment");
        assert_eq!(comment, "a real visitor comment");
        // The completion marker is set.
        let commit: String = c
            .query_row(
                "SELECT value FROM sync_meta WHERE key='content_commit'",
                [],
                |r| r.get(0),
            )
            .expect("query marker");
        assert_eq!(commit, "commit-abc");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
