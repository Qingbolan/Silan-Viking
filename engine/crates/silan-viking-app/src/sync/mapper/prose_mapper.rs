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

use super::media_uri;
use super::table_names;
use crate::parser::{FieldValue, Parsed};
use crate::schema::{FieldColumn, TypeSpec};
use crate::sync::error::MapError;
use crate::sync::rows::{Row, RowSet, SqlValue};
use silan_viking_content::ContentKind;

/// The shared prose-type mapping engine.
pub struct ProseMapper;

impl ProseMapper {
    /// Map a prose-type `Parsed` into its full `RowSet`, routing every
    /// frontmatter field to its table/column per `type_spec` (the SCHEMA).
    pub fn map(
        expected: ContentKind,
        parsed: &Parsed,
        type_spec: &TypeSpec,
    ) -> Result<RowSet, MapError> {
        if parsed.kind() != expected {
            return Err(MapError::KindMismatch {
                expected,
                actual: parsed.kind(),
            });
        }
        let mut rows = RowSet::new();
        let item_id = parsed.item_id().as_str().to_owned();

        rows.push(main_row(expected, &item_id, parsed, type_spec));
        push_translation_rows(expected, &item_id, parsed, &mut rows);
        push_item_part_rows(expected, &item_id, parsed, &mut rows);
        push_part_rows(parsed, &mut rows);
        push_relation_rows(expected, parsed, &mut rows);
        push_tag_rows(expected, &item_id, parsed, &mut rows);

        Ok(rows)
    }
}

/// Build the content main-table row from the language-neutral fields.
///
/// Every field is routed by its SCHEMA `FieldColumn`, so the SCHEMA — not a
/// hardcoded table in this file — decides what lands where:
///
/// - `FieldColumn::Main(col)` — written to the main table under `col` (which
///   is why `category` → `category_id` and `series` → `series_id` work
///   without a special case);
/// - `FieldColumn::Side`     — belongs to a `*_details` side table, not the
///   main row; skipped here (side-table emission is a separate mapper step);
/// - `FieldColumn::FanOut`   — a list field with its own table (`content_tag`,
///   `content_relation`); routed by `push_tag_rows` / `push_relation_rows`;
/// - `FieldColumn::None`     — type discriminators (`kind`); not a column.
///
/// A field with no SCHEMA spec at all is skipped — an unknown frontmatter key
/// must never become a column the Entity layer does not declare (which the
/// sink's schema gate would reject, aborting the sync).
fn main_row(kind: ContentKind, item_id: &str, parsed: &Parsed, type_spec: &TypeSpec) -> Row {
    let mut row =
        Row::new(table_names::main_table(kind)).with("id", SqlValue::Text(item_id.to_owned()));
    for name in parsed.main().field_names() {
        let Some(field_spec) = type_spec.field(name) else {
            continue; // a frontmatter key the SCHEMA does not declare
        };
        let FieldColumn::Main(column) = &field_spec.column else {
            continue; // Side / FanOut / None — not a main-table column
        };
        if let Some(value) = parsed.main().get(name) {
            row = row.with(column.clone(), sql_value(value));
        }
    }
    row
}

/// Build one translation row per language, carrying that language's
/// translatable scalar fields.
fn push_translation_rows(kind: ContentKind, item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        // The translation row points back at its main row via the
        // type-specific FK column (`blog_post_id`, `idea_id`, …) — the
        // column the reverse-generated Entity carries (`11` §11).
        // `id` is derived deterministically from (parent Item, language) —
        // the row's natural key — so a pure-function `Mapper` needs no
        // DB-minted id and incremental-sync hashes stay stable.
        let mut row = Row::new(table_names::translation_table(kind))
            .with("id", SqlValue::Text(format!("{item_id}_{lang}")))
            .with(
                table_names::translation_fk(kind),
                SqlValue::Text(item_id.to_owned()),
            )
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
/// `item_part` holds the Part identity (revision G, `01` §1.10 / `11` §11.5).
/// Its columns match the `silan-viking-entities` Entity: `id` is the stable
/// `part_id` (`01` §1.4 — minted at scaffold, read from `meta.toml`); the
/// `part_id` column carries it too (the Entity's `unique` natural key);
/// `entity_type` / `entity_id` locate the owning Item.
fn push_item_part_rows(kind: ContentKind, item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let mut seen: Vec<String> = Vec::new();
    for variant in parsed.langs().values() {
        for (order, role) in variant.prose_roles().enumerate() {
            if seen.contains(&role.to_owned()) {
                continue;
            }
            seen.push(role.to_owned());
            // `id` = `part_id`: the Part's stable identity doubles as the
            // row's primary key, so `item_part_translation` can point at it
            // by a value a pure-function `Mapper` can compute (no DB-minted
            // UUID needed). A role whose `meta.toml` lacked `part_id` falls
            // back to the role name — still deterministic within the Item.
            let part_id = parsed
                .part_id(role)
                .map(|p| p.as_str().to_owned())
                .unwrap_or_else(|| role.to_owned());
            // `canonical_lang`: the first language is the canonical one for
            // M6's purposes; the Part's own `meta.toml` carries the truth,
            // threaded once the parser exposes it per Part.
            let canonical_lang = parsed
                .languages()
                .next()
                .map(ToString::to_string)
                .unwrap_or_default();
            rows.push(
                Row::new(table_names::ITEM_PART_TABLE)
                    .with("id", SqlValue::Text(part_id.clone()))
                    .with("part_id", SqlValue::Text(part_id))
                    .with(
                        "entity_type",
                        SqlValue::Text(kind.frontmatter_value().to_owned()),
                    )
                    .with("entity_id", SqlValue::Text(item_id.to_owned()))
                    .with("role", SqlValue::Text(role.to_owned()))
                    .with("sort_order", SqlValue::Int(order as i64))
                    .with("canonical_lang", SqlValue::Text(canonical_lang)),
            );
        }
    }
}

/// Build one `item_part_translation` row per (language, prose Part body).
///
/// Columns match the Entity (`11` §11.5): `item_part_id` is the parent
/// `item_part`'s id (= the Part's `part_id`); `role` is **not** a column here
/// — it lives on `item_part`, not on the translation.
fn push_part_rows(parsed: &Parsed, rows: &mut RowSet) {
    for (lang, variant) in parsed.langs() {
        for role in variant.prose_roles() {
            let Some(body) = variant.prose(role) else {
                continue;
            };
            let item_part_id = parsed
                .part_id(role)
                .map(|p| p.as_str().to_owned())
                .unwrap_or_else(|| role.to_owned());
            // `id` derived from (parent `item_part`, language) — the row's
            // natural key — same rationale as the translation rows above.
            // The body's `silan://` resource references (Markdown images and
            // links) are rewritten to the `/api/v1/media/…` paths the backend
            // serves, so the stored prose needs no resolution at read time.
            rows.push(
                Row::new(table_names::ITEM_PART_TRANSLATION_TABLE)
                    .with("id", SqlValue::Text(format!("{item_part_id}_{lang}")))
                    .with("item_part_id", SqlValue::Text(item_part_id))
                    .with("language_code", SqlValue::Text(lang.to_string()))
                    .with("body", SqlValue::Text(media_uri::rewrite_prose(body))),
            );
        }
    }
}

/// Resolve a content `silan://resources/<type-dir>/<slug>` URI into its
/// `(entity_type, entity_id)` pair for `content_relation`. `entity_type` is
/// the frontmatter enum value (`blog`/`idea`/…); `entity_id` is the Item
/// slug — a stable natural key a pure-function `Mapper` can compute (the same
/// rationale as `item_part.id` = `part_id`). An unrecognised URI shape yields
/// the raw segments, so a malformed relation is visible rather than silent.
fn uri_type_and_id(uri: &silan_viking_base::SilanUri) -> (String, String) {
    let segments = uri.segments();
    let entity_type = segments
        .first()
        .and_then(|dir| silan_viking_content::ContentKind::from_dir_name(dir).ok())
        .map(|k| k.frontmatter_value().to_owned())
        .unwrap_or_else(|| segments.first().cloned().unwrap_or_default());
    let entity_id = segments.get(1).cloned().unwrap_or_default();
    (entity_type, entity_id)
}

/// Build one `content_relation` row per declared relation, in canonical form.
///
/// Columns match the Entity (`11` §11.2): the edge endpoints are stored as
/// `(from_type, from_id)` / `(to_type, to_id)` — type enum + Item id — not as
/// opaque URIs.
fn push_relation_rows(kind: ContentKind, parsed: &Parsed, rows: &mut RowSet) {
    for relation in parsed.relations() {
        let canonical = relation.canonicalized();
        let (to_type, to_id) = uri_type_and_id(canonical.to());
        let from_id = parsed.main().text("slug").unwrap_or_default().to_owned();
        let from_type = kind.frontmatter_value().to_owned();
        let relation_type = canonical.relation_type().as_str().to_owned();
        // `id` is the edge's natural key — the endpoints plus the relation
        // kind — so re-syncing rebuilds the same row deterministically.
        let id = format!("{from_type}_{from_id}_{to_type}_{to_id}_{relation_type}");
        rows.push(
            Row::new(table_names::CONTENT_RELATION_TABLE)
                .with("id", SqlValue::Text(id))
                .with("from_type", SqlValue::Text(from_type))
                .with("from_id", SqlValue::Text(from_id))
                .with("to_type", SqlValue::Text(to_type))
                .with("to_id", SqlValue::Text(to_id))
                .with("relation_type", SqlValue::Text(relation_type))
                .with(
                    "sort_order",
                    canonical.sort_order().map_or(SqlValue::Null, SqlValue::Int),
                ),
        );
    }
}

/// Build the tag rows: one `tag` entity row per distinct tag slug, and one
/// `content_tag` association row per (Item, tag).
///
/// `tags` reaches `parsed.main()` as a `FieldValue::List` (the parser does not
/// special-case it). `main_row` skips it via [`JOIN_TABLE_FIELDS`]; this fn
/// fans it out. The `tag` table is shared across all 6 types — `tag.id` is the
/// normalised slug, so the same tag from a blog and an idea is one row, and a
/// later sync's `DELETE`+re-`INSERT` rebuilds it identically (idempotent).
fn push_tag_rows(kind: ContentKind, item_id: &str, parsed: &Parsed, rows: &mut RowSet) {
    let Some(FieldValue::List(tags)) = parsed.main().get("tags") else {
        return;
    };
    let entity_type = kind.frontmatter_value();
    // The Item's stable slug — the natural key `content_tag` carries (the
    // same stable-natural-key rationale as `content_relation.from_id`).
    let entity_slug = parsed.main().text("slug").unwrap_or_default().to_owned();
    let mut seen: Vec<String> = Vec::new();
    for label in tags {
        let slug = tag_slug(label);
        if slug.is_empty() {
            continue; // a label that normalises to nothing — skip it
        }
        // One `tag` entity row per distinct slug across this Item's list.
        // Cross-Item dedup is the sink's job: every sync writes the same
        // `(id)` row, so an idempotent `DELETE`+`INSERT` collapses them.
        if !seen.contains(&slug) {
            seen.push(slug.clone());
            rows.push(
                Row::new(table_names::TAG_TABLE)
                    .with("id", SqlValue::Text(slug.clone()))
                    .with("slug", SqlValue::Text(slug.clone()))
                    .with("label", SqlValue::Text(label.clone())),
            );
            rows.push(
                Row::new(table_names::CONTENT_TAG_TABLE)
                    .with("tag_id", SqlValue::Text(slug.clone()))
                    .with("entity_type", SqlValue::Text(entity_type.to_owned()))
                    .with("entity_id", SqlValue::Text(item_id.to_owned()))
                    .with("entity_slug", SqlValue::Text(entity_slug.clone())),
            );
        }
    }
}

/// Normalise a free-text tag label into a stable slug — the `tag` table's
/// identity. Lowercases, maps every run of non-alphanumeric characters to a
/// single `-`, and trims leading/trailing `-`. `"AI / ML"` → `"ai-ml"`.
fn tag_slug(label: &str) -> String {
    let mut slug = String::with_capacity(label.len());
    let mut prev_dash = true; // true so a leading separator run is dropped
    for ch in label.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    slug
}

/// Convert a parser [`FieldValue`] into a [`SqlValue`]. Scalars map directly;
/// a `List` that reaches here is a non-join list field and is joined with
/// `, ` (join-table lists — `tags` — are routed away by [`JOIN_TABLE_FIELDS`]
/// before `sql_value` is ever called on them).
///
/// A `Text` value is passed through [`media_uri::rewrite_reference`]: a field
/// holding a `silan://resources/…` resource reference (`featured_image_url`,
/// `thumbnail_url`, …) is rewritten to its `/api/v1/media/…` path, and every
/// other string is returned verbatim (the rewrite is a prefix-gated no-op).
fn sql_value(value: &FieldValue) -> SqlValue {
    match value {
        FieldValue::Text(s) => SqlValue::Text(media_uri::rewrite_reference(s)),
        FieldValue::Int(i) => SqlValue::Int(*i),
        FieldValue::Float(f) => SqlValue::Float(*f),
        FieldValue::Bool(b) => SqlValue::Bool(*b),
        FieldValue::List(items) => SqlValue::Text(items.join(", ")),
        // Record lists fan out to side tables, never a scalar column.
        FieldValue::Records(_) => SqlValue::Null,
    }
}
