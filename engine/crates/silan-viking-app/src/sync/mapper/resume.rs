//! `ResumeMapper` — the `Mapper` for the `resume` content type.
//!
//! Per `docs/silan-viking/01` §1.5.1 and `10` §10.4.5, resume maps to:
//!
//! - `personal_info` — the language-neutral personal fields;
//! - `personal_info_translations` — `full_name` / `title` / `current_status`
//!   per language;
//! - `item_part_translation` — the `summary` prose body per language;
//! - `part_entry` — one row per structured entry, carrying the
//!   language-neutral (`shared`) payload;
//! - `part_entry_translation` — one row per (language, entry), carrying the
//!   translatable (`localized`) payload.
//!
//! Crucially, the structured Parts (education / experience / … / skills) do
//! **not** get per-Part ent tables — they all land in the generic
//! `part_entry` family (ruling #2).

use super::table_names;
use super::Mapper;
use crate::parser::{EntryValue, FieldValue, Parsed};
use crate::sync::error::MapError;
use crate::sync::rows::{Row, RowSet, SqlValue};
use silan_viking_content::ContentKind;

/// Resume translatable personal fields (`10` §10.4.5).
const TRANSLATABLE_PERSONAL_FIELDS: [&str; 3] = ["full_name", "title", "current_status"];

/// The mapper for the single `resume` Item.
#[derive(Debug, Default)]
pub struct ResumeMapper;

impl Mapper for ResumeMapper {
    fn content_type(&self) -> ContentKind {
        ContentKind::Resume
    }

    fn map(&self, parsed: &Parsed) -> Result<RowSet, MapError> {
        if parsed.kind() != ContentKind::Resume {
            return Err(MapError::KindMismatch {
                expected: ContentKind::Resume,
                actual: parsed.kind(),
            });
        }
        let mut rows = RowSet::new();
        let item_id = parsed.item_id().as_str().to_owned();

        rows.push(personal_info_row(&item_id, parsed));
        push_personal_info_translations(&item_id, parsed, &mut rows);
        push_item_part_rows(&item_id, parsed, &mut rows);
        push_summary_rows(&item_id, parsed, &mut rows);
        push_entry_rows(&item_id, parsed, &mut rows);

        Ok(rows)
    }
}

/// The `personal_info` main row — the language-neutral personal fields.
fn personal_info_row(item_id: &str, parsed: &Parsed) -> Row {
    let mut row = Row::new(table_names::main_table(ContentKind::Resume))
        .with("id", SqlValue::Text(item_id.to_owned()))
        .with("kind", SqlValue::Text("resume".to_owned()));
    for name in parsed.main().field_names() {
        if let Some(value) = parsed.main().get(name) {
            row = row.with(name.to_owned(), field_sql(value));
        }
    }
    row
}

/// One `personal_info_translations` row per language.
fn push_personal_info_translations(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        let mut row = Row::new(table_names::translation_table(ContentKind::Resume))
            .with("item_id", SqlValue::Text(item_id.to_owned()))
            .with("language_code", SqlValue::Text(lang.to_string()));
        for name in TRANSLATABLE_PERSONAL_FIELDS {
            if let Some(value) = variant.get(name) {
                row = row.with(name.to_owned(), field_sql(value));
            }
        }
        rows.push(row);
    }
}

/// One `item_part` identity row per Part role the resume has — both the
/// prose `summary` and every structured (entry-bearing) Part.
fn push_item_part_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let mut seen: Vec<String> = Vec::new();
    for variant in parsed.langs().values() {
        let roles = variant.prose_roles().chain(variant.entry_roles());
        for role in roles {
            if !seen.contains(&role.to_owned()) {
                seen.push(role.to_owned());
                rows.push(
                    Row::new(table_names::ITEM_PART_TABLE)
                        .with("item_id", SqlValue::Text(item_id.to_owned()))
                        .with("role", SqlValue::Text(role.to_owned())),
                );
            }
        }
    }
}

/// One `item_part_translation` row per language for the `summary` prose Part.
fn push_summary_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        if let Some(body) = variant.prose("summary") {
            rows.push(
                Row::new(table_names::ITEM_PART_TRANSLATION_TABLE)
                    .with("item_id", SqlValue::Text(item_id.to_owned()))
                    .with("language_code", SqlValue::Text(lang.to_string()))
                    .with("role", SqlValue::Text("summary".to_owned()))
                    .with("body", SqlValue::Text(body.to_owned())),
            );
        }
    }
}

/// The `part_entry` and `part_entry_translation` rows for every structured
/// Part of the resume.
fn push_entry_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    // `part_entry` (language-neutral) — emitted once per distinct entry id.
    // The canonical language's variant is the source of the shared payload.
    let mut emitted_shared: Vec<String> = Vec::new();
    for variant in parsed.langs().values() {
        for role in variant.entry_roles() {
            for entry in variant.entries(role) {
                if !emitted_shared.contains(&entry.entry_id().to_owned()) {
                    emitted_shared.push(entry.entry_id().to_owned());
                    let mut row = Row::new(table_names::PART_ENTRY_TABLE)
                        .with("item_id", SqlValue::Text(item_id.to_owned()))
                        .with("role", SqlValue::Text(role.to_owned()))
                        .with("entry_id", SqlValue::Text(entry.entry_id().to_owned()));
                    for (key, value) in entry.shared() {
                        row = row.with(key.clone(), entry_sql(value));
                    }
                    rows.push(row);
                }
            }
        }
    }

    // `part_entry_translation` — one row per (language, entry).
    for (lang, variant) in parsed.langs() {
        for role in variant.entry_roles() {
            for entry in variant.entries(role) {
                let mut row = Row::new(table_names::PART_ENTRY_TRANSLATION_TABLE)
                    .with("item_id", SqlValue::Text(item_id.to_owned()))
                    .with("language_code", SqlValue::Text(lang.to_string()))
                    .with("role", SqlValue::Text(role.to_owned()))
                    .with("entry_id", SqlValue::Text(entry.entry_id().to_owned()));
                for (key, value) in entry.localized() {
                    row = row.with(key.clone(), entry_sql(value));
                }
                rows.push(row);
            }
        }
    }
}

/// Convert a parser [`FieldValue`] into a [`SqlValue`].
fn field_sql(value: &FieldValue) -> SqlValue {
    match value {
        FieldValue::Text(s) => SqlValue::Text(s.clone()),
        FieldValue::Int(i) => SqlValue::Int(*i),
        FieldValue::Float(f) => SqlValue::Float(*f),
        FieldValue::Bool(b) => SqlValue::Bool(*b),
        FieldValue::List(items) => SqlValue::Text(items.join(", ")),
    }
}

/// Convert an [`EntryValue`] into a [`SqlValue`]. A list payload is JSON-ish
/// joined — `part_entry` stores its payload as a column blob in M6; the
/// typed sea-orm shape arrives with M4.
fn entry_sql(value: &EntryValue) -> SqlValue {
    match value {
        EntryValue::Text(s) => SqlValue::Text(s.clone()),
        EntryValue::Int(i) => SqlValue::Int(*i),
        EntryValue::Float(f) => SqlValue::Float(*f),
        EntryValue::Bool(b) => SqlValue::Bool(*b),
        EntryValue::List(items) => SqlValue::Text(items.join("\n")),
    }
}
