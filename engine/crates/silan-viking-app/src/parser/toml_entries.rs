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
/// Each entry's stable `entry_id` is read from the `entry_id` key; if
/// absent, a deterministic `e:<role>:<index>` id is derived (see
/// `build_entry`) so an author who hand-writes entries without ids
/// still gets a unique, stable anchor per entry.
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
    // `entry_id` is the entry's stable anchor. If the author wrote one,
    // use it verbatim. If not, derive a deterministic `e:<role>:<index>`
    // id — deterministic so the same entry keeps the same id across
    // re-syncs and across language files (the stability `entry_id`
    // exists for), and never empty so multiple entries cannot collide
    // on a blank `part_entry_id` in `part_entry_translation`. This
    // mirrors how `key_value_list` already derives `kv:<category>`.
    let entry_id = table
        .get("entry_id")
        .and_then(toml::Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("e:{role}:{index}"));

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
/// The current source shape is an `[[entry]]` list carrying a stable
/// `entry_id`, localized `category`, and localized `items`. Stable identity
/// is essential because translated category labels are not identities:
/// `Languages` and `编程语言` are the same logical entry.
///
/// The former top-level `"Category" = [...]` map remains readable so existing
/// workspaces can migrate on their next Desktop save, but all writers emit
/// the identity-bearing shape.
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

    if let Some(value) = table.get("entry") {
        let source_entries = value
            .as_array()
            .ok_or_else(|| ParseError::MalformedEntries {
                item: item_slug.to_owned(),
                role: role.to_owned(),
                detail: "`entry` must be an array of tables".to_owned(),
            })?;
        let mut entries = Vec::with_capacity(source_entries.len());
        for (index, value) in source_entries.iter().enumerate() {
            let source = value
                .as_table()
                .ok_or_else(|| ParseError::MalformedEntries {
                    item: item_slug.to_owned(),
                    role: role.to_owned(),
                    detail: format!("entry {index} must be a table"),
                })?;
            let entry_id = source
                .get("entry_id")
                .and_then(toml::Value::as_str)
                .filter(|id| !id.trim().is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| format!("kv:{role}:{index}"));
            let category = source
                .get("category")
                .and_then(toml::Value::as_str)
                .ok_or_else(|| ParseError::MalformedEntries {
                    item: item_slug.to_owned(),
                    role: role.to_owned(),
                    detail: format!("entry `{entry_id}` requires string `category`"),
                })?;
            let items = source
                .get("items")
                .and_then(toml::Value::as_array)
                .ok_or_else(|| ParseError::MalformedEntries {
                    item: item_slug.to_owned(),
                    role: role.to_owned(),
                    detail: format!("entry `{entry_id}` requires array `items`"),
                })?
                .iter()
                .filter_map(|item| item.as_str().map(str::to_owned))
                .collect();
            let mut localized = BTreeMap::new();
            localized.insert("category".to_owned(), EntryValue::Text(category.to_owned()));
            localized.insert("items".to_owned(), EntryValue::List(items));
            entries.push(PartEntry::new(entry_id, BTreeMap::new(), localized));
        }
        return Ok(entries);
    }

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
    fn entries_without_entry_id_get_a_deterministic_unique_id() {
        // An author hand-writing entries omits `entry_id`. Each entry
        // must still get a unique, stable anchor — otherwise multiple
        // entries collide on a blank `part_entry_id` in
        // `part_entry_translation` and `promote` fails its UNIQUE
        // constraint.
        let body = r#"
[[entry]]
institution = "NUS"

[[entry]]
institution = "MIT"
"#;
        let specs = [field("institution", true, true)];
        let entries =
            parse_entry_list("resume", "education", body, &specs).expect("valid entry list");
        assert_eq!(entries[0].entry_id(), "e:education:0");
        assert_eq!(entries[1].entry_id(), "e:education:1");
        assert_ne!(entries[0].entry_id(), entries[1].entry_id());
    }

    #[test]
    fn an_empty_entry_id_string_is_treated_as_absent() {
        // A blank `entry_id = ""` must not be taken verbatim — it would
        // reintroduce the collision. It falls back to the derived id.
        let body = "[[entry]]\nentry_id = \"\"\ninstitution = \"NUS\"\n";
        let specs = [field("institution", true, true)];
        let entries =
            parse_entry_list("resume", "education", body, &specs).expect("valid entry list");
        assert_eq!(entries[0].entry_id(), "e:education:0");
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
    fn parses_identity_bearing_key_value_entries_across_languages() {
        let en = r#"
[[entry]]
entry_id = "skill-languages"
category = "Languages"
items = ["Rust", "Go"]
"#;
        let zh = r#"
[[entry]]
entry_id = "skill-languages"
category = "编程语言"
items = ["Rust", "Go"]
"#;
        let en_entries = parse_key_value_list("resume", "skills", en).expect("valid English");
        let zh_entries = parse_key_value_list("resume", "skills", zh).expect("valid Chinese");
        assert_eq!(en_entries[0].entry_id(), "skill-languages");
        assert_eq!(zh_entries[0].entry_id(), "skill-languages");
        assert_ne!(
            en_entries[0].localized().get("category"),
            zh_entries[0].localized().get("category")
        );
    }

    #[test]
    fn key_value_list_rejects_a_non_list_value() {
        assert!(parse_key_value_list("resume", "skills", "Languages = \"Rust\"").is_err());
    }
}
