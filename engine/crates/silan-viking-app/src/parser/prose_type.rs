//! `ProseTypeParser` — the shared parsing engine for the 5 prose content
//! types (idea / blog / project / episode / update).
//!
//! All five are structurally identical (`docs/silan-viking/01` §1.3): each is
//! an Item whose every Part is `prose`. They differ only in *which* SCHEMA
//! type they are. Rather than five near-identical parsers, the shared
//! algorithm lives here and the five `Parser` implementations are thin
//! delegators that pass their [`ContentKind`].
//!
//! `resume` is **not** a prose type — it has `entry_list` / `key_value_list`
//! Parts — so it has its own parser (`resume.rs`), not this engine.

use super::error::{Issue, ParseError};
use super::frontmatter;
use super::parsed::{Parsed, ParsedBuilder};
use crate::schema::{Schema, TypeSpec};
use silan_viking_content::{ContentKind, Identified, Item, Part};

/// Whether a SCHEMA field is translatable (lands in a `*_translation` row)
/// or language-neutral (lands in the main table).
///
/// Per `10` §10.3: `title` and any `text`-typed field carry per-language
/// content; everything else (slug, status, dates, enums, urls, bools,
/// numbers, lists) is language-neutral. `relations` is handled separately
/// and never flows through this classifier.
fn is_translatable(field_name: &str, type_decl: &str) -> bool {
    field_name == "title" || type_decl == "text"
}

/// The shared prose-type parsing engine.
///
/// It holds a reference to the loaded [`Schema`]; each call is driven by the
/// `Item` it is given and the `Item`'s kind selects the [`TypeSpec`].
pub struct ProseTypeParser<'s> {
    schema: &'s Schema,
}

impl<'s> ProseTypeParser<'s> {
    /// Build the engine over a loaded schema.
    pub fn new(schema: &'s Schema) -> Self {
        Self { schema }
    }

    /// Parse a prose-type Item into a [`Parsed`].
    ///
    /// Algorithm (`01` §1.8.0):
    /// 1. find the canonical-language file of the first Part and read the
    ///    frontmatter from it;
    /// 2. split frontmatter fields into language-neutral (`main`) and
    ///    translatable (per-language) by [`is_translatable`];
    /// 3. for every Part, store each language's body as a prose body;
    /// 4. collect declared `relations`.
    pub fn parse(&self, expected: ContentKind, item: &Item) -> Result<Parsed, ParseError> {
        if item.kind() != expected {
            return Err(ParseError::KindMismatch {
                expected,
                actual: item.kind(),
            });
        }
        let spec = self
            .schema
            .type_spec(expected)
            .ok_or_else(|| ParseError::Malformed {
                kind: "schema",
                location: expected.frontmatter_value().to_owned(),
                detail: "no TypeSpec for this content kind".to_owned(),
            })?;

        let mut builder = Parsed::builder(expected, item.id().clone());

        // The frontmatter source is the canonical file of the main Part —
        // the first Part in SCHEMA order that the Item actually has.
        let main_part = self.locate_main_part(spec, item);
        if let Some(part) = main_part {
            self.read_frontmatter(spec, item, part, &mut builder)?;
        }

        // Every Part contributes its prose bodies, one per language.
        for part in item.parts() {
            for file in part.files() {
                let doc = frontmatter::split(file.body());
                builder.put_prose(file.lang().clone(), part.role().to_string(), doc.body);
            }
            // A Part with no files still must not vanish — but with no files
            // there is no language to register; that is a `validate` concern.
        }

        // Relations declared in the Item frontmatter.
        if let Some(part) = main_part {
            self.read_relations(item, part, &mut builder)?;
        }

        builder.finish().map_err(|detail| ParseError::Malformed {
            kind: "parsed",
            location: item.slug().to_string(),
            detail: detail.to_owned(),
        })
    }

    /// Find the Part that carries the Item-level frontmatter — the first Part
    /// declared in the SCHEMA that the Item actually has.
    fn locate_main_part<'i>(&self, spec: &TypeSpec, item: &'i Item) -> Option<&'i Part> {
        for part_spec in &spec.parts {
            if let Some(part) = item
                .parts()
                .iter()
                .find(|p| p.role().as_str() == part_spec.role)
            {
                return Some(part);
            }
        }
        item.parts().first()
    }

    /// Read the frontmatter of `part`'s canonical file and distribute its
    /// fields into the builder's `main` and per-language slots.
    fn read_frontmatter(
        &self,
        spec: &TypeSpec,
        item: &Item,
        part: &Part,
        builder: &mut ParsedBuilder,
    ) -> Result<(), ParseError> {
        let location = format!(
            "{}/{}/parts/{}",
            item.kind().dir_name(),
            item.slug(),
            part.role()
        );

        // Read the canonical-language frontmatter (the main source, §1.3.1).
        if let Some(canonical) = part.canonical_file() {
            let doc = frontmatter::split(canonical.body());
            let map = frontmatter::parse_yaml(&doc.frontmatter, &location)?;
            for field in &spec.fields {
                if field.name == "relations" {
                    continue;
                }
                if let Some(value) = frontmatter::coerce(&map, field) {
                    if is_translatable(&field.name, &field.type_decl) {
                        builder.put_lang_field(
                            part.canonical_lang().clone(),
                            field.name.clone(),
                            value,
                        );
                    } else {
                        builder.put_main(field.name.clone(), value);
                    }
                }
            }
        }

        // Non-canonical languages contribute only their translatable fields
        // (`title`). Their language-neutral fields are ignored by design
        // (`10` §10.3); `validate` raises `main_field_lang_mismatch` if any.
        for file in part.files() {
            if file.lang() == part.canonical_lang() {
                continue;
            }
            let doc = frontmatter::split(file.body());
            let map = frontmatter::parse_yaml(&doc.frontmatter, &location)?;
            for field in &spec.fields {
                if field.name == "relations" {
                    continue;
                }
                if !is_translatable(&field.name, &field.type_decl) {
                    continue;
                }
                if let Some(value) = frontmatter::coerce(&map, field) {
                    builder.put_lang_field(file.lang().clone(), field.name.clone(), value);
                }
            }
            // Register the language even if it had no recognised field, so a
            // body-only translation still appears in `Parsed.langs`.
            builder.touch_lang(file.lang().clone());
        }

        Ok(())
    }

    /// Read the `relations` list from `part`'s canonical frontmatter and push
    /// each declared edge into the builder.
    fn read_relations(
        &self,
        item: &Item,
        part: &Part,
        builder: &mut ParsedBuilder,
    ) -> Result<(), ParseError> {
        let Some(canonical) = part.canonical_file() else {
            return Ok(());
        };
        let location = format!("{}/{}", item.kind().dir_name(), item.slug());
        let doc = frontmatter::split(canonical.body());
        let map = frontmatter::parse_yaml(&doc.frontmatter, &location)?;

        let Some(seq) = map
            .get(serde_yaml::Value::String("relations".to_owned()))
            .and_then(|v| v.as_sequence())
        else {
            return Ok(());
        };

        for raw in seq {
            let edge = super::relations::parse_relation_decl(item.uri(), raw, &location)?;
            builder.push_relation(edge);
        }
        Ok(())
    }
}

/// Shared `validate` for prose types: check required frontmatter fields,
/// required Parts, and enum legality. Returns graded [`Issue`]s.
pub fn validate_prose(schema: &Schema, item: &Item, parsed: &Parsed) -> Vec<Issue> {
    let mut issues = Vec::new();
    let Some(spec) = schema.type_spec(parsed.kind()) else {
        return issues;
    };

    // Required frontmatter fields must be present in `main` or some language.
    for required in spec.required_fields() {
        if required == "relations" || required == "kind" {
            continue;
        }
        let in_main = parsed.main().get(required).is_some();
        let in_lang = parsed.langs().values().any(|v| v.get(required).is_some());
        if !in_main && !in_lang {
            issues.push(Issue::fatal(
                "missing_required_frontmatter",
                format!("`{}` is missing required field `{required}`", item.slug()),
            ));
        }
    }

    // Required Parts must be present on the Item.
    for required in spec.required_parts() {
        let present = item.parts().iter().any(|p| p.role().as_str() == required);
        if !present {
            issues.push(Issue::fatal(
                "missing_required_part",
                format!("`{}` is missing required part `{required}`", item.slug()),
            ));
        }
    }

    // Enum fields must hold a legal value.
    for field in &spec.fields {
        let Some(values) = field.enum_values() else {
            continue;
        };
        let observed = parsed
            .main()
            .text(&field.name)
            .or_else(|| parsed.langs().values().find_map(|v| v.text(&field.name)));
        if let Some(actual) = observed {
            if !values.contains(&actual) {
                issues.push(Issue::fatal(
                    "invalid_enum_value",
                    format!(
                        "`{}` field `{}` has illegal value `{actual}`; expected one of {:?}",
                        item.slug(),
                        field.name,
                        values
                    ),
                ));
            }
        }
    }

    // A Part with only its canonical language is informational, not a fault.
    for part in item.parts() {
        if part.files().len() == 1 {
            issues.push(Issue::info(
                "canonical_lang_only",
                format!(
                    "part `{}` of `{}` has no translation",
                    part.role(),
                    item.slug()
                ),
            ));
        }
    }

    issues
}
