//! `PartEntry` — one schema-validated entry of an `entry_list` /
//! `key_value_list` Part.
//!
//! Per `docs/silan-viking/10` §10.4.5, `entry_list` Parts (resume's
//! education, experience, …) hold N homogeneous entries; `key_value_list`
//! Parts (resume's skills) hold categorised lists. Both land in `part_entry`.
//!
//! A `PartEntry` is **not** an unconstrained blob (`10` §10.6
//! `entry_field_violation`): the parser validates each entry against the
//! SCHEMA `entry_fields` contract before producing one, so a `PartEntry` that
//! exists has already satisfied required-field and type checks.
//!
//! The entry splits its data by translatability (per `10` §10.4.5): fields
//! marked `translatable: false` go to `shared` (→ `part_entry.shared_payload`),
//! fields marked `translatable: true` go to `localized`
//! (→ `part_entry_translation.localized_payload`).

use std::collections::BTreeMap;

/// A single value inside a [`PartEntry`] — the parsed form of one TOML value.
#[derive(Debug, Clone, PartialEq)]
pub enum EntryValue {
    /// A string / text value.
    Text(String),
    /// An integer value.
    Int(i64),
    /// A floating-point value.
    Float(f64),
    /// A boolean value.
    Bool(bool),
    /// A list of strings (`list<string>` / `list<text>`).
    List(Vec<String>),
}

impl EntryValue {
    /// The value as a string slice, if it is textual.
    pub fn as_text(&self) -> Option<&str> {
        match self {
            EntryValue::Text(s) => Some(s),
            _ => None,
        }
    }

    /// The value as a list, if it is a list.
    pub fn as_list(&self) -> Option<&[String]> {
        match self {
            EntryValue::List(items) => Some(items),
            _ => None,
        }
    }
}

/// One schema-validated entry of an `entry_list` / `key_value_list` Part.
///
/// Invariant: `entry_id` is a stable `e_<ulid>` anchor (`10` §10.4.5). The
/// same logical entry uses the same `entry_id` across language files, which
/// is how the two TOML blocks are bound as one entry without relying on
/// array index alignment.
#[derive(Debug, Clone, PartialEq)]
pub struct PartEntry {
    entry_id: String,
    /// Language-neutral fields (`translatable: false`).
    shared: BTreeMap<String, EntryValue>,
    /// Language-specific fields (`translatable: true`).
    localized: BTreeMap<String, EntryValue>,
}

impl PartEntry {
    /// Construct a `PartEntry` from its id and its split payloads.
    pub fn new(
        entry_id: impl Into<String>,
        shared: BTreeMap<String, EntryValue>,
        localized: BTreeMap<String, EntryValue>,
    ) -> Self {
        Self {
            entry_id: entry_id.into(),
            shared,
            localized,
        }
    }

    /// The entry's stable `e_<ulid>` anchor.
    pub fn entry_id(&self) -> &str {
        &self.entry_id
    }

    /// The language-neutral fields.
    pub fn shared(&self) -> &BTreeMap<String, EntryValue> {
        &self.shared
    }

    /// The language-specific fields.
    pub fn localized(&self) -> &BTreeMap<String, EntryValue> {
        &self.localized
    }

    /// Look up a field in either payload (shared first, then localized).
    pub fn field(&self, name: &str) -> Option<&EntryValue> {
        self.shared.get(name).or_else(|| self.localized.get(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_lookup_spans_both_payloads() {
        let mut shared = BTreeMap::new();
        shared.insert(
            "start_date".to_owned(),
            EntryValue::Text("2019-08-01".to_owned()),
        );
        let mut localized = BTreeMap::new();
        localized.insert("institution".to_owned(), EntryValue::Text("NUS".to_owned()));
        let entry = PartEntry::new("e_01H8X7", shared, localized);

        assert_eq!(
            entry.field("start_date").and_then(EntryValue::as_text),
            Some("2019-08-01")
        );
        assert_eq!(
            entry.field("institution").and_then(EntryValue::as_text),
            Some("NUS")
        );
        assert!(entry.field("missing").is_none());
    }
}
