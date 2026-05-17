//! `ProseMapper` — the shared `Mapper` engine for the 5 prose content types.
//!
//! Per `docs/silan-viking/01` §1.8, a prose-type `Parsed` maps to:
//!
//! - one **main-table row** — `item_id` plus the language-neutral fields;
//! - one **translation row per language** — `item_id` + `language_code` plus
//!   that language's translatable fields (`title`, …);
//! - one **`item_part_translation` row per (language, prose Part)** — the
//!   prose body;
//! - one **`content_relation` row per declared relation**.
//!
//! All five prose types (idea / blog / project / episode / update) share
//! this engine; resume has its own mapper.

use super::table_names;
use crate::parser::{FieldValue, Parsed};
use crate::sync::error::MapError;
use crate::sync::rows::{Row, RowSet, SqlValue};
use silan_viking_content::ContentKind;

/// The shared prose-type mapping engine.
pub struct ProseMapper;

impl ProseMapper {
    /// Map a prose-type `Parsed` into its full `RowSet`.
    pub fn map(expected: ContentKind, parsed: &Parsed) -> Result<RowSet, MapError> {
        if parsed.kind() != expected {
            return Err(MapError::KindMismatch {
                expected,
                actual: parsed.kind(),
            });
        }
        let mut rows = RowSet::new();
        let item_id = parsed.item_id().as_str().to_owned();

        rows.push(main_row(expected, &item_id, parsed));
        push_translation_rows(expected, &item_id, parsed, &mut rows);
        push_item_part_rows(&item_id, parsed, &mut rows);
        push_part_rows(&item_id, parsed, &mut rows);
        push_relation_rows(&item_id, parsed, &mut rows);

        Ok(rows)
    }
}

/// Build the content main-table row from the language-neutral fields.
fn main_row(kind: ContentKind, item_id: &str, parsed: &Parsed) -> Row {
    let mut row = Row::new(table_names::main_table(kind))
        .with("id", SqlValue::Text(item_id.to_owned()))
        .with("kind", SqlValue::Text(kind.frontmatter_value().to_owned()));
    for name in parsed.main().field_names() {
        if let Some(value) = parsed.main().get(name) {
            row = row.with(name.to_owned(), sql_value(value));
        }
    }
    row
}

/// Build one translation row per language, carrying that language's
/// translatable scalar fields.
fn push_translation_rows(kind: ContentKind, item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        let mut row = Row::new(table_names::translation_table(kind))
            .with("item_id", SqlValue::Text(item_id.to_owned()))
            .with("language_code", SqlValue::Text(lang.to_string()));
        // The translatable scalar fields of this language (`title`, …).
        for name in ["title", "excerpt", "abstract", "description"] {
            if let Some(value) = variant.get(name) {
                row = row.with(name.to_owned(), sql_value(value));
            }
        }
        rows.push(row);
    }
}

/// Build one `item_part` identity row per Part role the Item has prose for.
///
/// `item_part` holds the Part identity (revision G, `01` §1.10). In M6 the
/// natural key `(item_id, role)` identifies the Part; the `PartId` ULID
/// column is populated once the parser threads `PartId` through `Parsed`.
fn push_item_part_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let mut seen: Vec<String> = Vec::new();
    for variant in parsed.langs().values() {
        for role in variant.prose_roles() {
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

/// Build one `item_part_translation` row per (language, prose Part body).
fn push_part_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        for role in variant.prose_roles() {
            if let Some(body) = variant.prose(role) {
                rows.push(
                    Row::new(table_names::ITEM_PART_TRANSLATION_TABLE)
                        .with("item_id", SqlValue::Text(item_id.to_owned()))
                        .with("language_code", SqlValue::Text(lang.to_string()))
                        .with("role", SqlValue::Text(role.to_owned()))
                        .with("body", SqlValue::Text(body.to_owned())),
                );
            }
        }
    }
}

/// Build one `content_relation` row per declared relation, in canonical form.
fn push_relation_rows(item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for relation in parsed.relations() {
        let canonical = relation.canonicalized();
        rows.push(
            Row::new(table_names::CONTENT_RELATION_TABLE)
                .with("from_id", SqlValue::Text(item_id.to_owned()))
                .with("from_uri", SqlValue::Text(canonical.from().to_string()))
                .with("to_uri", SqlValue::Text(canonical.to().to_string()))
                .with(
                    "relation_type",
                    SqlValue::Text(canonical.relation_type().as_str().to_owned()),
                )
                .with(
                    "sort_order",
                    canonical.sort_order().map_or(SqlValue::Null, SqlValue::Int),
                ),
        );
    }
}

/// Convert a parser [`FieldValue`] into a [`SqlValue`]. Lists are joined with
/// `, ` — a content main table column is scalar; list fields that need their
/// own join table are a post-M6 concern (`SCHEMA.md` notes `blog_post_tags`).
fn sql_value(value: &FieldValue) -> SqlValue {
    match value {
        FieldValue::Text(s) => SqlValue::Text(s.clone()),
        FieldValue::Int(i) => SqlValue::Int(*i),
        FieldValue::Float(f) => SqlValue::Float(*f),
        FieldValue::Bool(b) => SqlValue::Bool(*b),
        FieldValue::List(items) => SqlValue::Text(items.join(", ")),
    }
}
