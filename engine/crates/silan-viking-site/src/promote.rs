//! The deploy promote job (`08` §8.3, `11` §11.11).
//!
//! `deploy` must never overwrite the server's runtime data. `silan index
//! sync` produces a *derived snapshot* DB; `promote` applies that snapshot's
//! derived tables onto the live `portfolio.db` **table by table, in one
//! transaction**, leaving the runtime tables (`comments`,
//! `content_interaction`, `annotation`, `user_identities`, `request_logs`)
//! `comment_likes`, `project_likes`, `project_views`, `contact_messages`,
//! `content_interaction`, `annotation`, `user_identities`, `users`,
//! `request_logs` and runtime stats caches) untouched.
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
    // resume side tables — `social_links` rows belong to `personal_info`;
    // it is derived from the résumé's frontmatter, so promote replaces it
    // alongside its parent. (Omitting it left the live `social_links` table
    // forever empty even though `index sync` populated the snapshot.)
    "social_links",
    // relations
    "content_relation",
    // tags — the tag entities and their per-Item associations
    "tag",
    "content_tag",
    // translations
    "blog_post_translations",
    "idea_translations",
    "project_translations",
    "personal_info_translations",
    "recent_update_translations",
    "episode_translations",
    "episode_series_translations",
    // provenance — the single-row sync digest; promote stamps content_commit
    // onto it as the "batch complete" marker (`11` §11.11).
    "sync_meta",
];

/// The runtime tables promote must never name in its SQL (`11` §11.11). Kept
/// here so [`PromoteError::RuntimeTableInPlan`] can name the offender and so
/// the invariant is testable.
pub const RUNTIME_TABLES: &[&str] = &[
    "comments",
    "comment_likes",
    "project_likes",
    "project_views",
    "contact_messages",
    "content_interaction",
    "annotation",
    "user_identities",
    "users",
    "request_logs",
    "stats_cache_crawler",
    "stats_cache_item",
    "stats_cache_source",
    "stats_cache_visitor",
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
    // Defer FK enforcement to COMMIT time: promote replaces a whole graph of
    // derived tables, so mid-transaction a child can transiently reference a
    // parent not yet re-inserted. The check still runs at COMMIT — a genuine
    // dangling reference rolls the whole promote back. `defer_foreign_keys`
    // is per-transaction and resets automatically.
    conn.execute_batch("PRAGMA defer_foreign_keys = ON")?;

    let outcome = (|| -> Result<PromoteReport, PromoteError> {
        // Every whitelisted derived table present in the snapshot is
        // replaceable. The snapshot is authoritative for derived-table shape
        // (it is `index sync`'s output); a derived table missing from the
        // live DB — a fresh deploy, or the Go migration not creating content
        // tables — is CREATEd from the snapshot's own DDL. A live table not
        // in the snapshot is left alone. Runtime tables are never in
        // DERIVED_TABLES, so they are untouched by construction (`08` §8.3).
        let mut replaceable = Vec::new();
        for table in DERIVED_TABLES {
            if !has_table(conn, "snapshot", table)? {
                continue;
            }
            if !has_table(conn, "main", table)? {
                // Copy the snapshot's CREATE TABLE statement verbatim so the
                // live derived table matches the engine's schema exactly.
                let ddl: String = conn.query_row(
                    "SELECT sql FROM snapshot.sqlite_master WHERE type='table' AND name=?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )?;
                conn.execute_batch(&ddl)?;
            } else {
                add_missing_snapshot_columns(conn, table)?;
            }
            replaceable.push(*table);
        }

        // Phase 1 — clear the replaceable tables. Reverse order so a child
        // (translation/entry) table is emptied before its parent.
        for table in replaceable.iter().rev() {
            conn.execute(&format!("DELETE FROM {table}"), [])?;
        }

        // Phase 2 — refill from the attached snapshot, parents first so FK
        // constraints (if enabled) are satisfied. The INSERT is column-explicit
        // (target column ← SELECT expression) so it is correct even when the
        // live table — created by the Go ent migration — has a different
        // column order, extra columns, or NOT NULL columns the engine never
        // fills (those get a type-appropriate fallback; see `column_plan`).
        let mut rows_inserted = 0usize;
        for table in &replaceable {
            let plan = column_plan(conn, table)?;
            if plan.is_empty() {
                continue;
            }
            let target = plan
                .iter()
                .map(|(col, _)| format!("\"{col}\""))
                .collect::<Vec<_>>()
                .join(", ");
            let exprs = plan
                .iter()
                .map(|(_, expr)| expr.clone())
                .collect::<Vec<_>>()
                .join(", ");
            let n = conn.execute(
                &format!("INSERT INTO {table} ({target}) SELECT {exprs} FROM snapshot.{table}"),
                [],
            )?;
            rows_inserted += n;
        }

        // Phase 3 — the completion marker. `sync_meta` now holds the synced
        // row (content_hash / items_total) from the snapshot; stamp the
        // deploy's content_commit onto it. Monitoring/rollback reads only
        // this column (`11` §11.11).
        let stamped = conn.execute(
            "UPDATE sync_meta SET content_commit = ?1",
            rusqlite::params![content_commit],
        )?;
        // A snapshot with no sync_meta row (an empty content tree) still gets
        // a marker so monitoring sees the deploy.
        if stamped == 0 {
            conn.execute(
                "INSERT INTO sync_meta(content_hash, items_total, content_commit)
                 VALUES('', 0, ?1)",
                rusqlite::params![content_commit],
            )?;
        }

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

/// Add snapshot-only columns to an existing live derived table.
///
/// Deploy promotion treats the `index sync` snapshot as authoritative for
/// derived-table shape. Runtime tables are never passed here. SQLite cannot
/// replace a table's full schema without rebuilding indexes and constraints,
/// but additive projection columns are exactly what content schema evolution
/// needs; adding them before the insert plan lets new fields deploy without
/// discarding runtime-owned tables.
fn add_missing_snapshot_columns(conn: &Connection, table: &str) -> Result<(), PromoteError> {
    let snapshot_cols = table_columns(conn, "snapshot", table)?;
    let live_cols = table_columns(conn, "main", table)?;
    for col in snapshot_cols {
        if live_cols.iter().any(|live| live.name == col.name) {
            continue;
        }
        conn.execute(
            &format!(
                "ALTER TABLE {table} ADD COLUMN \"{}\" {}",
                col.name,
                column_type_sql(&col.decl_type)
            ),
            [],
        )?;
    }
    Ok(())
}

/// Information promote needs about a column.
struct TableColumn {
    name: String,
    /// SQLite declared type, lower-cased (`text`, `integer`, `datetime`, …).
    decl_type: String,
    not_null: bool,
    has_default: bool,
}

fn table_columns(
    conn: &Connection,
    schema: &str,
    table: &str,
) -> Result<Vec<TableColumn>, PromoteError> {
    let mut stmt = conn.prepare(&format!("PRAGMA {schema}.table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| {
            Ok(TableColumn {
                name: row.get::<_, String>(1)?,
                decl_type: row.get::<_, String>(2)?.to_ascii_lowercase(),
                not_null: row.get::<_, i64>(3)? != 0,
                has_default: row.get::<_, Option<String>>(4)?.is_some(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(PromoteError::from)?;
    Ok(columns)
}

fn column_type_sql(decl_type: &str) -> &str {
    if decl_type.trim().is_empty() {
        ""
    } else {
        decl_type
    }
}

/// Plan how promote fills a derived table: a list of
/// `(target_column, select_expression)` pairs feeding one
/// `INSERT INTO t (target...) SELECT expr... FROM snapshot.t`.
///
/// For each column the live table has:
/// - Not in the snapshot → omitted (the live default / NULL applies).
/// - In the snapshot, normally → copied verbatim (`"col"`).
/// - In the snapshot but all-NULL there, and the live column is NOT NULL:
///   the engine declares the column but never fills it. If the live column
///   has a DEFAULT, omit it (the default applies). If it has no DEFAULT
///   (e.g. ent's `Default(time.Now)` emits no SQL default), substitute a
///   type-appropriate literal so the NOT NULL constraint is satisfied —
///   `CURRENT_TIMESTAMP` for date/time columns, `0` for numerics, `''`
///   otherwise. This keeps promote all-or-nothing without the engine having
///   to author every structural column.
///
/// `table` is a `DERIVED_TABLES` literal, never user input.
fn column_plan(conn: &Connection, table: &str) -> Result<Vec<(String, String)>, PromoteError> {
    let snapshot_cols: Vec<String> = table_columns(conn, "snapshot", table)?
        .into_iter()
        .map(|col| col.name)
        .collect();
    let live_cols = table_columns(conn, "main", table)?;

    let mut plan = Vec::new();
    for col in live_cols {
        if !snapshot_cols.contains(&col.name) {
            continue; // live-only column — keeps its own default / NULL
        }
        let quoted = format!("\"{}\"", col.name);
        if col.not_null {
            let all_null: bool = conn.query_row(
                &format!("SELECT count(*) = 0 FROM snapshot.{table} WHERE {quoted} IS NOT NULL"),
                [],
                |row| row.get(0),
            )?;
            if all_null && col.has_default {
                continue; // every value is NULL — defer to the live DEFAULT
            }
            // NOT NULL column: guard every row against a NULL the constraint
            // would reject — COALESCE to a type-appropriate fallback. (When
            // the column is fully populated this is a harmless no-op.)
            let fallback = null_fallback(&col.decl_type);
            plan.push((col.name.clone(), format!("COALESCE({quoted}, {fallback})")));
            continue;
        }
        plan.push((col.name.clone(), quoted));
    }
    Ok(plan)
}

/// A SQL literal used in place of NULL for a NOT-NULL column the engine
/// leaves empty, chosen by the column's declared type affinity.
fn null_fallback(decl_type: &str) -> String {
    if decl_type.contains("date") || decl_type.contains("time") {
        "CURRENT_TIMESTAMP".to_owned()
    } else if decl_type.contains("int")
        || decl_type.contains("real")
        || decl_type.contains("floa")
        || decl_type.contains("doub")
        || decl_type.contains("num")
        || decl_type.contains("bool")
    {
        "0".to_owned()
    } else {
        "''".to_owned()
    }
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

        // A minimal live DB: one derived table plus every runtime table. Like the
        // Go-migrated production DB, it has NO `sync_meta` — promote creates
        // it (the regression behind the M9 e2e schema-drift fix).
        {
            let c = Connection::open(&live).expect("open live");
            c.execute_batch(
                "CREATE TABLE blog_posts(id TEXT, slug TEXT);
                 INSERT INTO blog_posts VALUES('old','old-post');",
            )
            .expect("seed derived live row");
            for table in RUNTIME_TABLES {
                c.execute_batch(&format!(
                    "CREATE TABLE {table}(id TEXT, value TEXT); \
                     INSERT INTO {table} VALUES('runtime-id', 'runtime-value');"
                ))
                .unwrap_or_else(|e| panic!("seed runtime table {table}: {e}"));
            }
        }
        // The snapshot carries the derived tables + the engine's sync_meta
        // (content_hash / items_total / content_commit), as `index sync` writes it.
        {
            let c = Connection::open(&snap).expect("open snap");
            c.execute_batch(
                "CREATE TABLE blog_posts(id TEXT, slug TEXT);
                 CREATE TABLE sync_meta(content_hash TEXT, items_total INTEGER, content_commit TEXT);
                 INSERT INTO blog_posts VALUES('new','fresh-post');
                 INSERT INTO sync_meta VALUES('hash-123', 1, '');",
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
        // Every runtime fact survived.
        for table in RUNTIME_TABLES {
            let value: String = c
                .query_row(&format!("SELECT value FROM {table}"), [], |r| r.get(0))
                .unwrap_or_else(|e| panic!("query runtime table {table}: {e}"));
            assert_eq!(value, "runtime-value", "runtime table {table} changed");
        }
        // The completion marker is stamped onto the synced sync_meta row,
        // which also carries the snapshot's content_hash.
        let (commit, hash): (String, String) = c
            .query_row(
                "SELECT content_commit, content_hash FROM sync_meta",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .expect("query marker");
        assert_eq!(commit, "commit-abc");
        assert_eq!(hash, "hash-123");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn promote_adds_new_snapshot_columns_to_existing_derived_tables() {
        let dir =
            std::env::temp_dir().join(format!("silan-promote-schema-drift-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");
        let live = dir.join("live.db");
        let snap = dir.join("snapshot.db");

        {
            let c = Connection::open(&live).expect("open live");
            c.execute_batch(
                "CREATE TABLE episode_series(id TEXT, slug TEXT, title TEXT, status TEXT);
                 INSERT INTO episode_series VALUES('old','old-series','Old','ongoing');",
            )
            .expect("seed old live shape");
        }
        {
            let c = Connection::open(&snap).expect("open snap");
            c.execute_batch(
                "CREATE TABLE episode_series(id TEXT, slug TEXT, title TEXT, cover_url TEXT, status TEXT);
                 CREATE TABLE sync_meta(content_hash TEXT, items_total INTEGER, content_commit TEXT);
                 INSERT INTO episode_series VALUES('new','fresh-series','Fresh','/api/v1/media?f=episode/fresh/assets/cover.png','completed');
                 INSERT INTO sync_meta VALUES('hash-456', 1, '');",
            )
            .expect("seed snapshot shape");
        }

        promote(
            live.to_str().expect("path"),
            snap.to_str().expect("path"),
            "commit-schema",
        )
        .expect("promote succeeds");

        let c = Connection::open(&live).expect("reopen live");
        let has_cover: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('episode_series') WHERE name = 'cover_url')",
                [],
                |r| r.get(0),
            )
            .expect("schema query");
        assert!(has_cover);
        let projected: (String, String) = c
            .query_row("SELECT slug, cover_url FROM episode_series", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .expect("query promoted row");
        assert_eq!(
            projected,
            (
                "fresh-series".to_owned(),
                "/api/v1/media?f=episode/fresh/assets/cover.png".to_owned(),
            )
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
