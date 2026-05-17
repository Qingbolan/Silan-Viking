//! `ResumeParser` — the `Parser` for the `resume` content type.
//!
//! Per `docs/silan-viking/01` §1.5.1 and `10` §10.4.5, `resume` is the one
//! type that is **not** a prose type: it is a single Item with several Parts,
//! each carrying a `shape`:
//!
//! - `prose` (`summary`) — markdown `<lang>.md`, parsed like a blog body;
//! - `entry_list` (education / experience / …) — TOML array-of-tables;
//! - `key_value_list` (`skills`) — TOML category → string-list.
//!
//! The top-level personal info (`full_name`, `email`, …) is read from the
//! `summary` Part's frontmatter into the language-neutral `main`, with
//! translatable fields (`full_name`, `title`, `current_status`) split per
//! language.
//!
//! This parser carries its own extraction `fn`s as private methods (`01`
//! §1.5); the trait surface is the same three contract methods.

use super::entry::EntryValue;
use super::error::{Issue, ParseError};
use super::frontmatter;
use super::parsed::{Parsed, ParsedBuilder};
use super::toml_entries;
use super::Parser;
use crate::schema::Schema;
use silan_viking_content::{ContentKind, Item, Part, PartRole, PartShape};
use std::sync::Arc;

/// Resume frontmatter fields that carry per-language content (`10` §10.4.5):
/// these are split into each `LangVariant`, the rest into `main`.
const TRANSLATABLE_PERSONAL_FIELDS: [&str; 3] = ["full_name", "title", "current_status"];

/// The parser for the single `resume` Item.
pub struct ResumeParser {
    schema: Arc<Schema>,
}

impl ResumeParser {
    /// Build the parser over the loaded schema.
    pub fn new(schema: Arc<Schema>) -> Self {
        Self { schema }
    }

    /// Read the personal-info frontmatter from the `summary` Part and
    /// distribute it into `main` (language-neutral) and per-language slots.
    fn extract_personal_info(
        &self,
        item: &Item,
        summary: &Part,
        builder: &mut ParsedBuilder,
    ) -> Result<(), ParseError> {
        let spec =
            self.schema
                .type_spec(ContentKind::Resume)
                .ok_or_else(|| ParseError::Malformed {
                    kind: "schema",
                    location: "resume".to_owned(),
                    detail: "no resume TypeSpec".to_owned(),
                })?;
        let location = format!("resume/{}/parts/summary", item.slug());

        if let Some(canonical) = summary.canonical_file() {
            let doc = frontmatter::split(canonical.body());
            let map = frontmatter::parse_yaml(&doc.frontmatter, &location)?;
            for field in &spec.fields {
                if field.name == "kind" {
                    continue;
                }
                if let Some(value) = frontmatter::coerce(&map, field) {
                    if TRANSLATABLE_PERSONAL_FIELDS.contains(&field.name.as_str()) {
                        builder.put_lang_field(
                            summary.canonical_lang().clone(),
                            field.name.clone(),
                            value,
                        );
                    } else {
                        builder.put_main(field.name.clone(), value);
                    }
                }
            }
        }

        // Non-canonical languages contribute only translatable personal fields.
        for file in summary.files() {
            if file.lang() == summary.canonical_lang() {
                continue;
            }
            let doc = frontmatter::split(file.body());
            let map = frontmatter::parse_yaml(&doc.frontmatter, &location)?;
            for name in TRANSLATABLE_PERSONAL_FIELDS {
                if let Some(spec_field) = spec.field(name) {
                    if let Some(value) = frontmatter::coerce(&map, spec_field) {
                        builder.put_lang_field(file.lang().clone(), name, value);
                    }
                }
            }
            builder.touch_lang(file.lang().clone());
        }
        Ok(())
    }

    /// Parse one `entry_list` Part: read each language file's TOML entries
    /// against the Part's SCHEMA `entry_fields`.
    fn parse_entry_list_part(
        &self,
        item: &Item,
        part: &Part,
        builder: &mut ParsedBuilder,
    ) -> Result<(), ParseError> {
        let entry_fields = self
            .schema
            .type_spec(ContentKind::Resume)
            .and_then(|s| s.part(part.role().as_str()))
            .map(|p| p.entry_fields.clone())
            .unwrap_or_default();

        for file in part.files() {
            let entries = toml_entries::parse_entry_list(
                item.slug().as_str(),
                part.role().as_str(),
                file.body(),
                &entry_fields,
            )?;
            for entry in entries {
                builder.put_entry(file.lang().clone(), part.role().to_string(), entry);
            }
            builder.touch_lang(file.lang().clone());
        }
        Ok(())
    }

    /// Parse the `key_value_list` `skills` Part.
    fn parse_key_value_part(
        &self,
        item: &Item,
        part: &Part,
        builder: &mut ParsedBuilder,
    ) -> Result<(), ParseError> {
        for file in part.files() {
            let entries = toml_entries::parse_key_value_list(
                item.slug().as_str(),
                part.role().as_str(),
                file.body(),
            )?;
            for entry in entries {
                builder.put_entry(file.lang().clone(), part.role().to_string(), entry);
            }
            builder.touch_lang(file.lang().clone());
        }
        Ok(())
    }
}

impl Parser for ResumeParser {
    fn content_type(&self) -> ContentKind {
        ContentKind::Resume
    }

    fn parse(&self, item: &Item) -> Result<Parsed, ParseError> {
        if item.kind() != ContentKind::Resume {
            return Err(ParseError::KindMismatch {
                expected: ContentKind::Resume,
                actual: item.kind(),
            });
        }

        let mut builder = Parsed::builder(ContentKind::Resume, item.id().clone());

        for part in item.parts() {
            // Every resume Part — prose or structured — carries its stable
            // `PartId` from `meta.toml` (`01` §1.3 / §1.4).
            builder.put_part_id(part.role().to_string(), part.id().clone());
            match part.shape() {
                PartShape::Prose => {
                    // The `summary` prose Part: its body lands per language.
                    for file in part.files() {
                        let doc = frontmatter::split(file.body());
                        builder.put_prose(file.lang().clone(), part.role().to_string(), doc.body);
                    }
                }
                PartShape::EntryList => {
                    self.parse_entry_list_part(item, part, &mut builder)?;
                }
                PartShape::KeyValueList => {
                    self.parse_key_value_part(item, part, &mut builder)?;
                }
            }
        }

        // Personal info comes from the `summary` Part's frontmatter.
        if let Some(summary) = item.part(&PartRole::new("summary")) {
            self.extract_personal_info(item, summary, &mut builder)?;
        }

        builder.finish().map_err(|detail| ParseError::Malformed {
            kind: "parsed",
            location: item.slug().to_string(),
            detail: detail.to_owned(),
        })
    }

    fn validate(&self, item: &Item, parsed: &Parsed) -> Vec<Issue> {
        let mut issues = Vec::new();

        // `full_name` is required (fatal); `email` absence is only a warning
        // (`05` §5.2 resume boundary fixtures).
        let has_full_name = parsed
            .langs()
            .values()
            .any(|v| v.get("full_name").is_some());
        if !has_full_name {
            issues.push(Issue::fatal(
                "missing_required_frontmatter",
                format!("resume `{}` is missing full_name", item.slug()),
            ));
        }
        if parsed.main().get("email").is_none() {
            issues.push(Issue::warn(
                "unknown_frontmatter_field",
                format!("resume `{}` has no email", item.slug()),
            ));
        }

        // education / experience entry date ranges must not be inverted.
        for role in ["education", "experience"] {
            for entry in parsed.entries_of(&PartRole::new(role)) {
                let start = entry.shared().get("start_date").and_then(field_text);
                let end = entry.shared().get("end_date").and_then(field_text);
                if let (Some(s), Some(e)) = (start, end) {
                    if s > e {
                        issues.push(Issue::fatal(
                            "entry_field_violation",
                            format!(
                                "resume `{}` {role} entry `{}` has start_date after end_date",
                                item.slug(),
                                entry.entry_id()
                            ),
                        ));
                    }
                }
            }
        }

        // The required `summary` Part must be present.
        if !item.parts().iter().any(|p| p.role().as_str() == "summary") {
            issues.push(Issue::fatal(
                "missing_required_part",
                format!("resume `{}` is missing the summary part", item.slug()),
            ));
        }

        issues
    }
}

/// Read an [`EntryValue`] as a string slice, for date comparison.
fn field_text(value: &EntryValue) -> Option<&str> {
    value.as_text()
}
