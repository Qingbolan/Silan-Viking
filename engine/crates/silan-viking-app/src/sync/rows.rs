//! `Row`, `RowSet`, `RowSetBatch` — the database-shaped product of a `Mapper`.
//!
//! Per `docs/silan-viking/01` §1.8, a `Mapper` turns one `Parsed` into a
//! `RowSet` — the set of all table rows that Item produces (main row + N
//! translation rows + Part rows + entry rows + relation rows). A `RowSet` is
//! pure data: no IO. The `Sink` is the only thing that writes it.
//!
//! Until the sea-orm Entities are reverse-generated (milestone M4), a `Row`
//! is represented generically as a table name plus an ordered column map.
//! This keeps M6 fully implementable and testable against the SCHEMA without
//! the Go ent schema; when M4 lands, the typed Entities slot in behind the
//! same `RowSet` contract and the `Mapper` / `Sink` split is unchanged.

use std::collections::BTreeMap;

/// A single column value bound for a SQL `INSERT`.
#[derive(Debug, Clone, PartialEq)]
pub enum SqlValue {
    /// A textual value.
    Text(String),
    /// An integer value.
    Int(i64),
    /// A floating-point value.
    Float(f64),
    /// A boolean value (written as 0/1 in SQLite).
    Bool(bool),
    /// A SQL `NULL`.
    Null,
}

impl SqlValue {
    /// Wrap an optional string: `Some` → `Text`, `None` → `Null`.
    pub fn text_or_null(value: Option<impl Into<String>>) -> Self {
        match value {
            Some(s) => SqlValue::Text(s.into()),
            None => SqlValue::Null,
        }
    }
}

/// One database row: a target table plus its column values, kept in a
/// `BTreeMap` so column order is deterministic (stable test snapshots).
#[derive(Debug, Clone, PartialEq)]
pub struct Row {
    table: String,
    columns: BTreeMap<String, SqlValue>,
}

impl Row {
    /// Begin a row for `table`.
    pub fn new(table: impl Into<String>) -> Self {
        Self {
            table: table.into(),
            columns: BTreeMap::new(),
        }
    }

    /// Set a column value, returning `self` for chaining.
    #[must_use]
    pub fn with(mut self, column: impl Into<String>, value: SqlValue) -> Self {
        self.columns.insert(column.into(), value);
        self
    }

    /// The target table name.
    pub fn table(&self) -> &str {
        &self.table
    }

    /// The column values.
    pub fn columns(&self) -> &BTreeMap<String, SqlValue> {
        &self.columns
    }
}

/// Every row produced by one Item (`01` §1.8 — main + translations + parts +
/// entries + relations).
///
/// Invariant: `relations` is filled by the `Workspace`'s collection step,
/// not by the `Mapper` directly — a `Mapper` may push relation rows it
/// derived from its `Parsed`, but cross-Item canonicalisation happens before
/// the `Sink` sees them (`01` §1.8.1 / §1.8.2).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RowSet {
    rows: Vec<Row>,
}

impl RowSet {
    /// An empty row set.
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a row.
    pub fn push(&mut self, row: Row) {
        self.rows.push(row);
    }

    /// Append every row of another set.
    pub fn extend(&mut self, other: RowSet) {
        self.rows.extend(other.rows);
    }

    /// All rows.
    pub fn rows(&self) -> &[Row] {
        &self.rows
    }

    /// The rows targeting a given table — convenience for assertions.
    pub fn rows_for<'a>(&'a self, table: &'a str) -> impl Iterator<Item = &'a Row> {
        self.rows.iter().filter(move |r| r.table() == table)
    }

    /// The number of rows.
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    /// Whether the set is empty.
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}

/// The accumulated row sets of every Item in one sync.
#[derive(Debug, Clone, Default)]
pub struct RowSetBatch {
    rows: Vec<Row>,
}

impl RowSetBatch {
    /// An empty batch.
    pub fn new() -> Self {
        Self::default()
    }

    /// Fold one Item's `RowSet` into the batch.
    pub fn push(&mut self, set: RowSet) {
        self.rows.extend(set.rows);
    }

    /// Collapse the rows of `table` so each distinct value of `key_column`
    /// appears once, keeping the first occurrence.
    ///
    /// A cross-type entity table (`tag`) gets one row per Item that uses the
    /// entity — five blog posts tagged `easynet` each emit a `tag` row with
    /// `id = "easynet"`. They are identical by construction, but the sink's
    /// plain `INSERT` would write five rows and a later `content_tag` JOIN
    /// would fan out into duplicates. Folding by the key column here keeps
    /// one row per entity. Rows of other tables, and rows missing the key
    /// column, are left untouched.
    pub fn dedup_table_by(&mut self, table: &str, key_column: &str) {
        let mut seen: Vec<String> = Vec::new();
        self.rows.retain(|row| {
            if row.table() != table {
                return true;
            }
            match row.columns().get(key_column) {
                Some(SqlValue::Text(key)) => {
                    if seen.contains(key) {
                        false
                    } else {
                        seen.push(key.clone());
                        true
                    }
                }
                // A `tag` row with no/!text key is malformed — keep it so the
                // anomaly is visible rather than silently dropped.
                _ => true,
            }
        });
    }

    /// All rows accumulated so far.
    pub fn rows(&self) -> &[Row] {
        &self.rows
    }

    /// The rows targeting a given table.
    pub fn rows_for<'a>(&'a self, table: &'a str) -> impl Iterator<Item = &'a Row> {
        self.rows.iter().filter(move |r| r.table() == table)
    }

    /// The number of rows.
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    /// Whether the batch is empty.
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn row_builds_with_chained_columns() {
        let row = Row::new("blog_posts")
            .with("slug", SqlValue::Text("hello".to_owned()))
            .with("is_featured", SqlValue::Bool(true));
        assert_eq!(row.table(), "blog_posts");
        assert_eq!(row.columns().len(), 2);
    }

    #[test]
    fn rowset_filters_by_table() {
        let mut set = RowSet::new();
        set.push(Row::new("blog_posts").with("slug", SqlValue::Text("a".to_owned())));
        set.push(Row::new("blog_post_translations").with("lang", SqlValue::Text("en".to_owned())));
        assert_eq!(set.rows_for("blog_posts").count(), 1);
        assert_eq!(set.len(), 2);
    }

    #[test]
    fn text_or_null_maps_option() {
        assert_eq!(
            SqlValue::text_or_null(Some("x")),
            SqlValue::Text("x".to_owned())
        );
        assert_eq!(SqlValue::text_or_null(None::<String>), SqlValue::Null);
    }

    #[test]
    fn dedup_table_by_collapses_tag_rows_and_keeps_associations() {
        let mut batch = RowSetBatch::new();
        let mut set = RowSet::new();
        // Two Items both tagged `easynet` → two identical `tag` rows, plus
        // their two distinct `content_tag` association rows.
        set.push(Row::new("tag").with("id", SqlValue::Text("easynet".to_owned())));
        set.push(Row::new("tag").with("id", SqlValue::Text("rust".to_owned())));
        set.push(Row::new("tag").with("id", SqlValue::Text("easynet".to_owned())));
        set.push(Row::new("content_tag").with("entity_id", SqlValue::Text("a".to_owned())));
        set.push(Row::new("content_tag").with("entity_id", SqlValue::Text("b".to_owned())));
        batch.push(set);

        batch.dedup_table_by("tag", "id");

        // `tag` folded to one row per id; `content_tag` rows untouched.
        assert_eq!(batch.rows_for("tag").count(), 2);
        assert_eq!(batch.rows_for("content_tag").count(), 2);
    }
}
