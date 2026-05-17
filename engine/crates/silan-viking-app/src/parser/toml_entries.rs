//! TOML entry parsing — turns an `entry_list` / `key_value_list` Part file
//! into schema-validated [`PartEntry`]s.
//!
//! Per `docs/silan-viking/10` §10.4.5:
//!
//! - an `entry_list` file is TOML array-of-tables: each `[[entry]]` block is
//!   one entry, validated against the Part's `entry_fields`;
//! - a `key_value_list` file (skills) is TOML with top-level category keys
//!   mapping to string lists; each category becomes one entry.
//!
//! Fields split by translatability (`10` §10.4.5): `translatable: false` →
//! `PartEntry::shared`, `translatable: true` → `PartEntry::localized`.

use super::entry::{EntryValue, PartEntry};
use super::error::ParseError;
use crate::schema::EntryFieldSpec;
use std::collections::BTreeMap;

/// Parse an `entry_list` Part file body into entries.
///
/// `entry_fields` is the SCHEMA contract for this Part. A missing required
/// field or a malformed document is a [`ParseError::MalformedEntries`].
/// Each entry's stable `entry_id` is read from the `entry_id` key; if absent,
/// a placeholder is left empty so a higher layer (`silan` CLI / offline
/// re-layout) can fill it — the parser never silently mints one.
pub fn parse_entry_list(
    item_slug: &str,
    role: &str,
    body: &str,
    entry_fields: &[EntryFieldSpec],
) -> Result<Vec<PartEntry>, ParseError> {
    let doc: toml::Value = toml::from_str(body).map_err(|e| ParseError::MalformedEntries {
        item: item_slug.to_owned(),
        role: role.to_owned(),
        detail: e.to_string(),
    })?;

    let raw_entries = doc
        .get("entry")
        .and_then(toml::Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut entries = Vec::with_capacity(raw_entries.len());
    for (index, raw) in raw_entries.into_iter().enumerate() {
        let table = raw
            .as_table()
            .cloned()
            .ok_or_else(|| ParseError::MalformedEntries {
                item: item_slug.to_owned(),
                role: role.to_owned(),
                detail: format!("entry #{index} is not a table"),
            })?;
        entries.push(build_entry(item_slug, role, index, &table, entry_fields)?);
    }
    Ok(entries)
}

/// Build one validated [`PartEntry`] from a TOML table.
fn build_entry(
    item_slug: &str,
    role: &str,
    index: usize,
    table: &toml::value::Table,
    entry_fields: &[EntryFieldSpec],
) -> Result<PartEntry, ParseError> {
    let entry_id = table
        .get("entry_id")
        .and_then(toml::Value::as_str)
        .unwrap_or("")
        .to_owned();

    let mut shared = BTreeMap::new();
    let mut localized = BTreeMap::new();

    for spec in entry_fields {
        let raw = table.get(&spec.name);
        match raw {
            None => {
                if spec.required {
                    return Err(ParseError::MalformedEntries {
                        item: item_slug.to_owned(),
                        role: role.to_owned(),
                        detail: format!("entry #{index} is missing required field `{}`", spec.name),
                    });
                }
            }
            Some(value) => {
                let coerced = coerce_toml(value).ok_or_else(|| ParseError::MalformedEntries {
                    item: item_slug.to_owned(),
                    role: role.to_owned(),
                    detail: format!(
                        "entry #{index} field `{}` has an unsupported value type",
                        spec.name
                    ),
                })?;
                if spec.translatable {
                    localized.insert(spec.name.clone(), coerced);
                } else {
                    shared.insert(spec.name.clone(), coerced);
                }
            }
        }
    }

    Ok(PartEntry::new(entry_id, shared, localized))
}

/// Parse a `key_value_list` Part file body (skills) into entries.
///
/// Each top-level key is a category; its value is a list of strings. One
/// entry is produced per category, with `category` and `items` in the
/// localized payload (`10` §10.4.5: the category label is language-specific).
pub fn parse_key_value_list(
    item_slug: &str,
    role: &str,
    body: &str,
) -> Result<Vec<PartEntry>, ParseError> {
    let doc: toml::Value = toml::from_str(body).map_err(|e| ParseError::MalformedEntries {
        item: item_slug.to_owned(),
        role: role.to_owned(),
        detail: e.to_string(),
    })?;

    let table = doc.as_table().ok_or_else(|| ParseError::MalformedEntries {
        item: item_slug.to_owned(),
        role: role.to_owned(),
        detail: "key_value_list file is not a TOML table".to_owned(),
    })?;

    let mut entries = Vec::with_capacity(table.len());
    for (category, value) in table {
        let items: Vec<String> = value
            .as_array()
            .ok_or_else(|| ParseError::MalformedEntries {
                item: item_slug.to_owned(),
                role: role.to_owned(),
                detail: format!("category `{category}` must map to a list"),
            })?
            .iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect();

        let mut localized = BTreeMap::new();
        localized.insert("category".to_owned(), EntryValue::Text(category.clone()));
        localized.insert("items".to_owned(), EntryValue::List(items));
        // The category key itself is the stable anchor for a skills entry.
        entries.push(PartEntry::new(
            format!("kv:{category}"),
            BTreeMap::new(),
            localized,
        ));
    }
    Ok(entries)
}

/// Coerce a TOML value into an [`EntryValue`]. Returns `None` for a value
/// shape the entry model does not support (e.g. a nested table).
fn coerce_toml(value: &toml::Value) -> Option<EntryValue> {
    match value {
        toml::Value::String(s) => Some(EntryValue::Text(s.clone())),
        toml::Value::Integer(i) => Some(EntryValue::Int(*i)),
        toml::Value::Float(f) => Some(EntryValue::Float(*f)),
        toml::Value::Boolean(b) => Some(EntryValue::Bool(*b)),
        toml::Value::Datetime(d) => Some(EntryValue::Text(d.to_string())),
        toml::Value::Array(items) => Some(EntryValue::List(
            items
                .iter()
                .filter_map(|v| match v {
                    toml::Value::String(s) => Some(s.clone()),
                    toml::Value::Integer(i) => Some(i.to_string()),
                    _ => None,
                })
                .collect(),
        )),
        toml::Value::Table(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(name: &str, required: bool, translatable: bool) -> EntryFieldSpec {
        EntryFieldSpec {
            name: name.to_owned(),
            type_decl: "string".to_owned(),
            required,
            translatable,
        }
    }

    #[test]
    fn parses_an_entry_list_splitting_by_translatability() {
        let body = r#"
[[entry]]
entry_id = "e_01H8X7"
institution = "NUS"
start_date = "2019-08-01"

[[entry]]
entry_id = "e_01H8X8"
institution = "MIT"
"#;
        let specs = [
            field("institution", true, true),
            field("start_date", false, false),
        ];
        let entries =
            parse_entry_list("resume", "education", body, &specs).expect("valid entry list");
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].entry_id(), "e_01H8X7");
        // `institution` is translatable → localized.
        assert!(entries[0].localized().contains_key("institution"));
        // `start_date` is language-neutral → shared.
        assert!(entries[0].shared().contains_key("start_date"));
    }

    #[test]
    fn entry_list_rejects_a_missing_required_field() {
        let body = "[[entry]]\nentry_id = \"e_1\"\n";
        let specs = [field("institution", true, true)];
        assert!(parse_entry_list("resume", "education", body, &specs).is_err());
    }

    #[test]
    fn parses_a_key_value_list() {
        let body = "Languages = [\"Rust\", \"Go\"]\nSystems = [\"Linux\"]\n";
        let entries = parse_key_value_list("resume", "skills", body).expect("valid key value list");
        assert_eq!(entries.len(), 2);
        let langs = entries
            .iter()
            .find(|e| e.entry_id() == "kv:Languages")
            .expect("Languages entry");
        assert_eq!(
            langs.localized().get("items").and_then(EntryValue::as_list),
            Some(["Rust".to_owned(), "Go".to_owned()].as_slice())
        );
    }

    #[test]
    fn key_value_list_rejects_a_non_list_value() {
        assert!(parse_key_value_list("resume", "skills", "Languages = \"Rust\"").is_err());
    }
}
