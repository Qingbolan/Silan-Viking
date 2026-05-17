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
        push_social_links_rows(&item_id, parsed, &mut rows);
        push_item_part_rows(&item_id, parsed, &mut rows);
        push_summary_rows(&item_id, parsed, &mut rows);
        push_entry_rows(&item_id, parsed, &mut rows);

        Ok(rows)
    }
}

/// Frontmatter fields that must not become a `personal_info` column.
/// - `kind` is the type discriminator (no column — `personal_info` is the
///   resume's own table).
/// - `visibility`: `10` §10.4.5 gives resume a `visibility`, but the Go ent
///   `personal_info` table has no such column. This is a known small gap
///   between `10` and the Go ent schema, deferred to M0.5a (where resume's
///   `visibility` placement is decided — `personal_info` column vs the
///   resume Item's manifest). Skipped here so sync stays drift-free.
/// - `social_links`: a `list<{...}>` field — it fans out into the
///   `social_links` side table via [`push_social_links_rows`], it is not a
///   `personal_info` column.
const SKIP_PERSONAL_FIELDS: &[&str] = &["kind", "visibility", "social_links"];

/// The `personal_info` main row — the language-neutral personal fields.
fn personal_info_row(item_id: &str, parsed: &Parsed) -> Row {
    let mut row = Row::new(table_names::main_table(ContentKind::Resume))
        .with("id", SqlValue::Text(item_id.to_owned()));
    for name in parsed.main().field_names() {
        if SKIP_PERSONAL_FIELDS.contains(&name) {
            continue;
        }
        if let Some(value) = parsed.main().get(name) {
            row = row.with(name.to_owned(), field_sql(value));
        }
    }
    row
}

/// One `personal_info_translations` row per language.
fn push_personal_info_translations(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        // `id` derived from (Item, language) — the row's natural key.
        let mut row = Row::new(table_names::translation_table(ContentKind::Resume))
            .with("id", SqlValue::Text(format!("{item_id}_{lang}")))
            .with(
                table_names::translation_fk(ContentKind::Resume),
                SqlValue::Text(item_id.to_owned()),
            )
            .with("language_code", SqlValue::Text(lang.to_string()));
        for name in TRANSLATABLE_PERSONAL_FIELDS {
            if let Some(value) = variant.get(name) {
                row = row.with(name.to_owned(), field_sql(value));
            }
        }
        rows.push(row);
    }
}

/// One `social_links` row per entry of the resume's `social_links` field.
///
/// `social_links` is a `list<{platform,url,display_name}>` frontmatter field
/// — language-neutral, so it is read from `parsed.main()`. Each record fans
/// out into the `social_links` side table, owned by the `personal_info` row
/// via `personal_info_id`. `id` is derived from (Item, index) so a re-sync
/// rebuilds the same rows deterministically; `created_at` is left to the
/// DB default.
fn push_social_links_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let Some(records) = parsed.main().get("social_links").and_then(FieldValue::as_records) else {
        return;
    };
    for (index, record) in records.iter().enumerate() {
        // platform + url are the meaningful columns; skip a record missing
        // either, rather than writing a half-empty row.
        let (Some(platform), Some(url)) = (record.get("platform"), record.get("url")) else {
            continue;
        };
        let mut row = Row::new(table_names::SOCIAL_LINKS_TABLE)
            .with("id", SqlValue::Text(format!("{item_id}_social_{index}")))
            .with("personal_info_id", SqlValue::Text(item_id.to_owned()))
            .with("platform", SqlValue::Text(platform.clone()))
            .with("url", SqlValue::Text(url.clone()))
            .with("sort_order", SqlValue::Int(index as i64));
        if let Some(display) = record.get("display_name") {
            row = row.with("display_name", SqlValue::Text(display.clone()));
        }
        rows.push(row);
    }
}

/// One `item_part` identity row per Part role the resume has — both the
/// prose `summary` and every structured (entry-bearing) Part. Columns match
/// the Entity (`11` §11.5); `id` = the Part's stable `part_id`.
fn push_item_part_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let canonical_lang = parsed
        .languages()
        .next()
        .map(ToString::to_string)
        .unwrap_or_default();
    let mut seen: Vec<String> = Vec::new();
    for variant in parsed.langs().values() {
        let roles = variant.prose_roles().chain(variant.entry_roles());
        for (order, role) in roles.enumerate() {
            if seen.contains(&role.to_owned()) {
                continue;
            }
            seen.push(role.to_owned());
            let part_id = parsed
                .part_id(role)
                .map(|p| p.as_str().to_owned())
                .unwrap_or_else(|| role.to_owned());
            rows.push(
                Row::new(table_names::ITEM_PART_TABLE)
                    .with("id", SqlValue::Text(part_id.clone()))
                    .with("part_id", SqlValue::Text(part_id))
                    .with("entity_type", SqlValue::Text("resume".to_owned()))
                    .with("entity_id", SqlValue::Text(item_id.to_owned()))
                    .with("role", SqlValue::Text(role.to_owned()))
                    .with("sort_order", SqlValue::Int(order as i64))
                    .with("canonical_lang", SqlValue::Text(canonical_lang.clone())),
            );
        }
    }
}

/// One `item_part_translation` row per language for the `summary` prose Part.
/// `item_part_id` is the `summary` Part's stable `part_id` (`11` §11.5).
fn push_summary_rows(_item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let summary_part_id = parsed
        .part_id("summary")
        .map(|p| p.as_str().to_owned())
        .unwrap_or_else(|| "summary".to_owned());
    for (lang, variant) in parsed.langs() {
        if let Some(body) = variant.prose("summary") {
            rows.push(
                Row::new(table_names::ITEM_PART_TRANSLATION_TABLE)
                    .with(
                        "id",
                        SqlValue::Text(format!("{summary_part_id}_{lang}")),
                    )
                    .with("item_part_id", SqlValue::Text(summary_part_id.clone()))
                    .with("language_code", SqlValue::Text(lang.to_string()))
                    .with("body", SqlValue::Text(body.to_owned())),
            );
        }
    }
}

/// The `part_entry` and `part_entry_translation` rows for every structured
/// Part of the resume. Columns match the Entity (`11` §11.5.1): the payload
/// is one JSON column (`shared_payload` / `localized_payload`), not one
/// column per entry field; `part_entry.id` and the translation's
/// `part_entry_id` are the entry's stable `entry_id`; `item_part_id` is the
/// owning Part's `part_id`.
fn push_entry_rows(_item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    // `part_entry` (language-neutral) — emitted once per distinct entry id.
    let mut emitted_shared: Vec<String> = Vec::new();
    for variant in parsed.langs().values() {
        for role in variant.entry_roles() {
            let item_part_id = parsed
                .part_id(role)
                .map(|p| p.as_str().to_owned())
                .unwrap_or_else(|| role.to_owned());
            for (order, entry) in variant.entries(role).iter().enumerate() {
                if emitted_shared.contains(&entry.entry_id().to_owned()) {
                    continue;
                }
                emitted_shared.push(entry.entry_id().to_owned());
                rows.push(
                    Row::new(table_names::PART_ENTRY_TABLE)
                        .with("id", SqlValue::Text(entry.entry_id().to_owned()))
                        .with("entry_id", SqlValue::Text(entry.entry_id().to_owned()))
                        .with("item_part_id", SqlValue::Text(item_part_id.clone()))
                        .with("sort_order", SqlValue::Int(order as i64))
                        .with(
                            "shared_payload",
                            SqlValue::Text(payload_json(entry.shared())),
                        ),
                );
            }
        }
    }

    // `part_entry_translation` — one row per (language, entry).
    for (lang, variant) in parsed.langs() {
        for role in variant.entry_roles() {
            for entry in variant.entries(role) {
                // `id` derived from (entry, language) — the row's natural key.
                rows.push(
                    Row::new(table_names::PART_ENTRY_TRANSLATION_TABLE)
                        .with(
                            "id",
                            SqlValue::Text(format!("{}_{lang}", entry.entry_id())),
                        )
                        .with("part_entry_id", SqlValue::Text(entry.entry_id().to_owned()))
                        .with("language_code", SqlValue::Text(lang.to_string()))
                        .with(
                            "localized_payload",
                            SqlValue::Text(payload_json(entry.localized())),
                        ),
                );
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
        // A record list fans out to a side table — it is never a scalar
        // main-table column, so it carries no SqlValue here.
        FieldValue::Records(_) => SqlValue::Null,
    }
}

/// Convert an [`EntryValue`] into a `serde_json::Value` — one field of a
/// `part_entry` payload object.
fn entry_json(value: &EntryValue) -> serde_json::Value {
    match value {
        EntryValue::Text(s) => serde_json::Value::String(s.clone()),
        EntryValue::Int(i) => serde_json::Value::from(*i),
        EntryValue::Float(f) => serde_json::Value::from(*f),
        EntryValue::Bool(b) => serde_json::Value::Bool(*b),
        EntryValue::List(items) => {
            serde_json::Value::Array(items.iter().cloned().map(serde_json::Value::String).collect())
        }
    }
}

/// Serialise an entry's `(key → EntryValue)` map into one JSON-object string —
/// the `shared_payload` / `localized_payload` column of `part_entry` /
/// `part_entry_translation` (`11` §11.5.1: the payload is SCHEMA-validated
/// typed JSON, one column, not one column per entry field).
fn payload_json(pairs: &std::collections::BTreeMap<String, EntryValue>) -> String {
    let map: serde_json::Map<String, serde_json::Value> = pairs
        .iter()
        .map(|(key, value)| (key.clone(), entry_json(value)))
        .collect();
    serde_json::Value::Object(map).to_string()
}
