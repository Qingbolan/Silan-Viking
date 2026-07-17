//! `Sink` — the database write port, and its SQLite implementation.
//!
//! Per `docs/silan-viking/01` §1.8, the `Sink` is the **only** thing that
//! does database IO. A `Mapper` produces `RowSet`s by pure function; the
//! `Sink` writes them. `SqliteSink` writes `portfolio.db`.
//!
//! The write is transactional and all-or-nothing (`10` §10.6, `01` §3.1):
//! either every row of the batch lands or none does. `SqliteSink` also
//! records `sync_meta` (`01` §1.10 revision B / `09` §9.2.3) — the
//! provenance row stating when the database was last derived.
//!
//! Because the sea-orm Entities are not generated until M4, `SqliteSink`
//! derives each table's schema from the `Row`s it is given (a column is
//! `TEXT` / `INTEGER` / `REAL` per its first observed `SqlValue`). When M4
//! lands, a typed sea-orm sink replaces this behind the same `Sink` trait.

use super::error::SyncError;
use super::rows::{RowSetBatch, SqlValue};
use rusqlite::Connection;
use std::collections::BTreeMap;
use std::path::Path;

/// The database write port.
///
/// One method, `write_batch`: a full batch goes in atomically. There is no
/// per-row `write` — a sync is all-or-nothing, so a partial write API would
/// be a footgun.
pub trait Sink {
    /// Write a full batch transactionally. On any error nothing is committed.
    fn write_batch(&mut self, batch: &RowSetBatch) -> Result<(), SyncError>;
}

/// A `Sink` backed by a SQLite `portfolio.db`.
pub struct SqliteSink {
    conn: Connection,
}

impl SqliteSink {
    /// Open (creating if absent) the SQLite database at `path`.
    ///
    /// Sets WAL mode and a busy timeout (`11` §11.11) so a concurrent reader
    /// — the Go API — does not block the writer.
    pub fn open(path: &Path) -> Result<Self, SyncError> {
        // The configured db path may sit under a not-yet-created dir (e.g.
        // `_deploy/portfolio.db`). Create the parent so the first `sync` on a
        // fresh project succeeds without a manual `mkdir`.
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(SyncError::db)?;
            }
        }
        let conn = Connection::open(path)?;
        Self::configure(&conn)?;
        Ok(Self { conn })
    }

    /// Open an in-memory database — used by tests for a fast, isolated sink.
    pub fn open_in_memory() -> Result<Self, SyncError> {
        let conn = Connection::open_in_memory()?;
        Self::configure(&conn)?;
        Ok(Self { conn })
    }

    /// Apply the connection-level settings every `SqliteSink` needs.
    fn configure(conn: &Connection) -> Result<(), SyncError> {
        // WAL keeps readers unblocked during the sync write (`11` §11.11).
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(())
    }

    /// Read the `sync_meta.content_hash` recorded by the last sync, if any —
    /// used by incremental sync to decide whether anything changed.
    pub fn last_sync_hash(&self) -> Result<Option<String>, SyncError> {
        let exists: bool = self
            .conn
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_meta'",
                [],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Ok(None);
        }
        let hash = self
            .conn
            .query_row(
                "SELECT content_hash FROM sync_meta ORDER BY rowid DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok();
        Ok(hash)
    }

    /// Borrow the underlying connection — for tests that assert row contents.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }

    /// Mutably borrow the connection — for tests that need to seed schema
    /// (e.g. pre-create a foreign-keyed table) before a `write_batch`.
    #[cfg(test)]
    pub fn connection_mut(&mut self) -> &mut Connection {
        &mut self.conn
    }
}

impl Sink for SqliteSink {
    fn write_batch(&mut self, batch: &RowSetBatch) -> Result<(), SyncError> {
        let tx = self.conn.transaction()?;

        // A sync rewrites whole tables: Phase 1 `DELETE`s each table and
        // Phase 2 re-`INSERT`s its rows. When the target db's tables carry
        // foreign keys, the *intermediate* state inside the transaction
        // necessarily violates them (a child row inserted before its parent,
        // or a parent deleted before its children) — order alone cannot fix
        // it because tables are processed in `BTreeMap` key order. Deferring
        // foreign-key enforcement to `COMMIT` lets the batch land in any
        // order; integrity is still checked once, against the final, fully
        // rewritten database. The pragma resets per transaction, so it is set
        // here rather than in `configure`.
        tx.pragma_update(None, "defer_foreign_keys", true)?;

        // Phase 0: schema gate. For any table that is a generated
        // `silan-viking-entities` Entity, the columns a `Mapper` wrote must
        // be a subset of what the Entity declares — otherwise the Mapper and
        // the schema disagree and the sync aborts (`11` truth-source
        // discipline). Tables not in the Entity layer (`sync_meta`, the
        // `tag` / `content_tag` join tables) are engine-internal derived
        // tables with no Entity; they pass through.
        //
        // Every drift in the batch is collected and reported together, so a
        // mapper can be realigned to the schema in a single pass rather than
        // one failed sync per offending column.
        let table_columns = collect_table_columns(batch);
        let mut drift: Vec<(String, String)> = Vec::new();
        for (table, columns) in &table_columns {
            if let Some(authoritative) = silan_viking_entities::table_columns(table) {
                for column in columns {
                    if !authoritative.iter().any(|c| c == column) {
                        drift.push((table.clone(), column.clone()));
                    }
                }
            }
        }
        if !drift.is_empty() {
            return Err(SyncError::SchemaDrift(drift));
        }

        // Phase 1a: ensure every projection-owned Entity table exists, even
        // ones the
        // batch carries zero rows for. Before this step, an entity-backed
        // table whose mapper produced no rows (e.g. `content_relation` when
        // the workspace has no relations) was never CREATE'd; after a
        // `silan index rebuild` (which starts from an empty db) that table
        // didn't exist at all, and a downstream `SELECT count(*) FROM
        // content_relation` crashed with "no such table". The fix
        // pre-creates every entity table from its authoritative column
        // set, so the on-disk schema always matches the Entity layer
        // regardless of which kinds happen to have rows this sync.
        // (V2-7 from 2026-05-22 e2e.)
        // Runtime-owned tables are intentionally outside this set and remain
        // untouched across syncs.
        for (table, columns) in silan_viking_entities::all_projection_tables() {
            create_table(&tx, &table, &columns)?;
            tx.execute(&format!("DELETE FROM \"{table}\""), [])?;
        }

        // Phase 1b: ensure every table the batch references exists. An
        // Entity-backed table that *also* shows up in the batch was already
        // created above with its authoritative columns; a non-Entity table
        // (`sync_meta`, the engine-internal join tables) is built from the
        // observed columns here.
        for (table, columns) in &table_columns {
            if silan_viking_entities::table_columns(table).is_some() {
                // Already created from authoritative columns in Phase 1a.
                continue;
            }
            create_table(&tx, table, columns)?;
            // Replace, not append: a sync derives the whole table afresh.
            tx.execute(&format!("DELETE FROM \"{table}\""), [])?;
        }

        // Phase 2: insert every row.
        for row in batch.rows() {
            insert_row(&tx, row)?;
        }

        // Moments is a one-way domain migration. Once the new projection is
        // complete, remove the obsolete legacy tables in the same
        // transaction so readers can never observe two competing models.
        tx.execute("DROP TABLE IF EXISTS recent_update_translations", [])?;
        tx.execute("DROP TABLE IF EXISTS recent_updates", [])?;

        tx.commit()?;
        Ok(())
    }
}

/// Gather, per table, the union of every column name any row uses for it.
fn collect_table_columns(batch: &RowSetBatch) -> BTreeMap<String, Vec<String>> {
    let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for row in batch.rows() {
        let columns = map.entry(row.table().to_owned()).or_default();
        for name in row.columns().keys() {
            if !columns.contains(name) {
                columns.push(name.clone());
            }
        }
    }
    map
}

/// Create a table if it does not exist, with every column typed `TEXT` — the
/// generic shape sufficient for a read-only derived cache. `INTEGER` / `REAL`
/// values still store losslessly in a `TEXT`-affinity SQLite column.
fn create_table(
    tx: &rusqlite::Transaction<'_>,
    table: &str,
    columns: &[String],
) -> Result<(), SyncError> {
    if columns.is_empty() {
        return Ok(());
    }
    let column_defs = columns
        .iter()
        .map(|c| format!("\"{c}\""))
        .collect::<Vec<_>>()
        .join(", ");
    tx.execute(
        &format!("CREATE TABLE IF NOT EXISTS \"{table}\" ({column_defs})"),
        [],
    )?;
    // A table created on an earlier sync may lack a column a later row uses;
    // add any missing column so the insert below cannot fail.
    let existing = existing_columns(tx, table)?;
    for column in columns {
        if !existing.contains(column) {
            tx.execute(
                &format!("ALTER TABLE \"{table}\" ADD COLUMN \"{column}\""),
                [],
            )?;
        }
    }
    Ok(())
}

/// The column names a table already has.
fn existing_columns(tx: &rusqlite::Transaction<'_>, table: &str) -> Result<Vec<String>, SyncError> {
    let mut stmt = tx.prepare(&format!("PRAGMA table_info(\"{table}\")"))?;
    let names = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(names)
}

/// Insert one row into its table.
fn insert_row(tx: &rusqlite::Transaction<'_>, row: &super::rows::Row) -> Result<(), SyncError> {
    if row.columns().is_empty() {
        return Ok(());
    }
    let names: Vec<&String> = row.columns().keys().collect();
    let placeholders = (1..=names.len())
        .map(|i| format!("?{i}"))
        .collect::<Vec<_>>()
        .join(", ");
    let column_list = names
        .iter()
        .map(|n| format!("\"{n}\""))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "INSERT INTO \"{}\" ({column_list}) VALUES ({placeholders})",
        row.table()
    );

    let values: Vec<rusqlite::types::Value> = row.columns().values().map(to_sqlite_value).collect();
    let params: Vec<&dyn rusqlite::ToSql> =
        values.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
    tx.execute(&sql, params.as_slice())?;
    Ok(())
}

/// Convert a [`SqlValue`] into a rusqlite-bindable value.
fn to_sqlite_value(value: &SqlValue) -> rusqlite::types::Value {
    use rusqlite::types::Value;
    match value {
        SqlValue::Text(s) => Value::Text(s.clone()),
        SqlValue::Int(i) => Value::Integer(*i),
        SqlValue::Float(f) => Value::Real(*f),
        SqlValue::Bool(b) => Value::Integer(i64::from(*b)),
        SqlValue::Null => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::rows::{Row, RowSet};

    #[test]
    fn write_batch_creates_tables_and_inserts_rows() {
        let mut sink = SqliteSink::open_in_memory().expect("in-memory db");
        let mut set = RowSet::new();
        set.push(
            Row::new("blog_posts")
                .with("id", SqlValue::Text("i_1".to_owned()))
                .with("slug", SqlValue::Text("hello".to_owned())),
        );
        let mut batch = RowSetBatch::new();
        batch.push(set);

        sink.write_batch(&batch).expect("write succeeds");

        let slug: String = sink
            .connection()
            .query_row("SELECT slug FROM blog_posts WHERE id = 'i_1'", [], |r| {
                r.get(0)
            })
            .expect("row present");
        assert_eq!(slug, "hello");
    }

    #[test]
    fn write_batch_rewrites_foreign_keyed_tables() {
        // Regression for P8: when the target db's tables carry foreign keys,
        // a sync's DELETE-then-INSERT cycle hits an intermediate state that
        // violates them — tables are processed in BTreeMap key order, so the
        // child table (`a_child`) is rewritten before its parent (`b_parent`).
        // `defer_foreign_keys` must let the batch commit anyway, with FK
        // integrity checked once at COMMIT against the final database.
        let mut sink = SqliteSink::open_in_memory().expect("in-memory db");

        // Seed a parent/child pair with a real FK, and turn FK enforcement
        // ON — SQLite defaults it off, and a production `portfolio.db` may
        // have it enabled. `write_batch`'s `CREATE TABLE IF NOT EXISTS` then
        // reuses these definitions.
        sink.connection_mut()
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE b_parent (id TEXT PRIMARY KEY);
                 CREATE TABLE a_child (id TEXT PRIMARY KEY, \
                     parent_id TEXT REFERENCES b_parent(id));",
            )
            .expect("seed FK schema");

        // One batch, child row and parent row. BTreeMap orders `a_child`
        // before `b_parent`, so the child is inserted first.
        let mut set = RowSet::new();
        set.push(
            Row::new("a_child")
                .with("id", SqlValue::Text("c1".to_owned()))
                .with("parent_id", SqlValue::Text("p1".to_owned())),
        );
        set.push(Row::new("b_parent").with("id", SqlValue::Text("p1".to_owned())));
        let mut batch = RowSetBatch::new();
        batch.push(set);

        sink.write_batch(&batch)
            .expect("a foreign-keyed batch must commit with deferred FK checks");

        let linked: String = sink
            .connection()
            .query_row("SELECT parent_id FROM a_child WHERE id = 'c1'", [], |r| {
                r.get(0)
            })
            .expect("child row present");
        assert_eq!(linked, "p1");
    }

    #[test]
    fn write_batch_replaces_previous_rows() {
        let mut sink = SqliteSink::open_in_memory().expect("in-memory db");

        let mut first = RowSet::new();
        first.push(Row::new("ideas").with("id", SqlValue::Text("i_old".to_owned())));
        let mut batch1 = RowSetBatch::new();
        batch1.push(first);
        sink.write_batch(&batch1).expect("first write");

        let mut second = RowSet::new();
        second.push(Row::new("ideas").with("id", SqlValue::Text("i_new".to_owned())));
        let mut batch2 = RowSetBatch::new();
        batch2.push(second);
        sink.write_batch(&batch2).expect("second write");

        let count: i64 = sink
            .connection()
            .query_row("SELECT COUNT(*) FROM ideas", [], |r| r.get(0))
            .expect("count");
        assert_eq!(count, 1, "a sync derives the whole table afresh");
    }

    #[test]
    fn write_batch_preserves_runtime_owned_rows() {
        let mut sink = SqliteSink::open_in_memory().expect("in-memory db");
        sink.connection_mut()
            .execute_batch(
                "CREATE TABLE comments (id TEXT PRIMARY KEY, content TEXT);\n                 INSERT INTO comments (id, content) VALUES ('visitor-1', 'keep me');",
            )
            .expect("seed runtime row");

        let mut set = RowSet::new();
        set.push(Row::new("ideas").with("id", SqlValue::Text("i_new".to_owned())));
        let mut batch = RowSetBatch::new();
        batch.push(set);
        sink.write_batch(&batch).expect("content sync");

        let content: String = sink
            .connection()
            .query_row(
                "SELECT content FROM comments WHERE id='visitor-1'",
                [],
                |row| row.get(0),
            )
            .expect("runtime row survives");
        assert_eq!(content, "keep me");
    }
}
