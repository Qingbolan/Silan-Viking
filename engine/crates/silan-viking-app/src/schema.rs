//! `Schema` — the parsed, in-memory model of `content/SCHEMA.md`.
//!
//! Per `docs/silan-viking/10`, `SCHEMA.md` is the single content contract.
//! `Schema` loads the fenced ```yaml``` block of that file and exposes, for
//! each of the 6 content types, the frontmatter field specs and the Part
//! list (with shapes and `entry_fields`). The parsers consult `Schema` so
//! that "what fields does an idea have" is configuration, not Rust code
//! (`01` §1.3.1).
//!
//! This module does no content parsing itself — it only models the contract.

use silan_viking_content::{ContentKind, PartShape};
use std::collections::BTreeMap;
use thiserror::Error;

/// The `version:` value this build of the engine understands.
pub const SUPPORTED_SCHEMA_VERSION: u64 = 1;

/// All ways loading `SCHEMA.md` can fail.
#[derive(Debug, Error)]
pub enum SchemaError {
    /// The file did not contain a fenced ```yaml``` block.
    #[error("SCHEMA.md contains no fenced ```yaml``` block")]
    NoYamlBlock,

    /// The YAML block did not parse.
    #[error("SCHEMA.md YAML is malformed: {0}")]
    MalformedYaml(String),

    /// The `version:` was absent or not the supported version.
    #[error("SCHEMA.md version `{found}` is unsupported; this engine supports version {SUPPORTED_SCHEMA_VERSION}")]
    UnsupportedVersion { found: String },

    /// A required structural section was missing.
    #[error("SCHEMA.md is missing the required `{section}` section")]
    MissingSection { section: &'static str },

    /// A required key of a `types.<name>` block was missing (e.g. its
    /// `main_table`).
    #[error("SCHEMA.md type block `{0}` is incomplete")]
    MalformedType(String),

    /// A type declared in SCHEMA.md was not one of the 6 known content types.
    #[error("SCHEMA.md declares unknown content type `{name}`")]
    UnknownType { name: String },

    /// A Part declared a `shape` that is not prose/entry_list/key_value_list.
    #[error("SCHEMA.md type `{type_name}` part `{role}` has unknown shape `{shape}`")]
    UnknownShape {
        type_name: String,
        role: String,
        shape: String,
    },
}

/// Where a frontmatter field's value is written in the database — the parsed,
/// classified form of a field's SCHEMA `column:` attribute.
///
/// `column:` has three shapes in `SCHEMA.md`, plus absent. Classifying them
/// here, against the type's `main_table`, makes the SCHEMA the single source
/// of truth for routing — so `ProseMapper` never re-hardcodes a column name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FieldColumn {
    /// `column:` absent (or `null`) — the field is not written to any table.
    /// Type discriminators (`kind`) are the typical case.
    None,
    /// `column: "<main_table>.<col>"` — a column of the type's own main table.
    /// Holds the bare column name (`category_id`, not `blog_posts.category_id`).
    Main(String),
    /// `column: "<other_table>.<col>"` — a column of a *side* table
    /// (`idea_details`, `project_details`), not the main table.
    Side {
        /// The side table name.
        table: String,
        /// The bare column name within it.
        column: String,
    },
    /// `column: "<table>"` — a bare table name, no dot: the field is a list
    /// that fans out into its own table (`content_tag`, `content_relation`,
    /// `project_technologies`).
    FanOut(String),
}

/// The spec of one frontmatter field of a content type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldSpec {
    /// The field name as it appears in frontmatter.
    pub name: String,
    /// The declared field type string (`slug`, `enum(...)`, `list<string>`).
    pub type_decl: String,
    /// Whether the field is required.
    pub required: bool,
    /// Where the field's value lands in the database (parsed from `column:`).
    pub column: FieldColumn,
}

impl FieldSpec {
    /// Whether the field's declared type is an `enum(...)`, and if so the set
    /// of legal values.
    pub fn enum_values(&self) -> Option<Vec<&str>> {
        let inner = self
            .type_decl
            .strip_prefix("enum(")
            .and_then(|s| s.strip_suffix(')'))?;
        Some(inner.split(',').map(str::trim).collect())
    }
}

/// The spec of one `entry_field` of an `entry_list` Part.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntryFieldSpec {
    /// The entry field name.
    pub name: String,
    /// The declared field type string.
    pub type_decl: String,
    /// Whether the entry field is required.
    pub required: bool,
    /// Whether the field is translatable (`true` → `part_entry_translation`).
    pub translatable: bool,
}

/// The spec of one Part of a content type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartSpec {
    /// The Part role (`overview`, `body`, `education`).
    pub role: String,
    /// Whether the Part is required for a valid Item.
    pub required: bool,
    /// The Part's presentation order.
    pub order: i64,
    /// The Part's on-disk shape.
    pub shape: PartShape,
    /// The `entry_fields` contract — non-empty only for `entry_list` Parts.
    pub entry_fields: Vec<EntryFieldSpec>,
}

/// The spec of one content type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeSpec {
    /// Which content type this is.
    pub kind: ContentKind,
    /// The type's main database table (`main_table:` in `SCHEMA.md`) — e.g.
    /// `blog_posts` for `blog`. A field whose `column:` table equals this is
    /// a main-table column; any other table is a side table.
    pub main_table: String,
    /// The frontmatter field specs.
    pub fields: Vec<FieldSpec>,
    /// The Part specs, in declaration order.
    pub parts: Vec<PartSpec>,
}

impl TypeSpec {
    /// The field spec for a named frontmatter field, if declared.
    pub fn field(&self, name: &str) -> Option<&FieldSpec> {
        self.fields.iter().find(|f| f.name == name)
    }

    /// The required frontmatter field names.
    pub fn required_fields(&self) -> impl Iterator<Item = &str> {
        self.fields
            .iter()
            .filter(|f| f.required)
            .map(|f| f.name.as_str())
    }

    /// The Part spec for a named role, if declared.
    pub fn part(&self, role: &str) -> Option<&PartSpec> {
        self.parts.iter().find(|p| p.role == role)
    }

    /// The required Part roles.
    pub fn required_parts(&self) -> impl Iterator<Item = &str> {
        self.parts
            .iter()
            .filter(|p| p.required)
            .map(|p| p.role.as_str())
    }
}

/// The parsed `content/SCHEMA.md` contract.
///
/// Invariant: `types` contains exactly the 6 content types after a
/// successful [`Schema::parse`] — a missing or unknown type is an error.
#[derive(Debug, Clone)]
pub struct Schema {
    version: u64,
    types: BTreeMap<ContentKind, TypeSpec>,
}

impl Schema {
    /// Parse a `SCHEMA.md` file's full text.
    ///
    /// Extracts the fenced ```yaml``` block, parses it, validates the
    /// version, and builds a [`TypeSpec`] for each content type.
    pub fn parse(markdown: &str) -> Result<Self, SchemaError> {
        let yaml = extract_yaml_block(markdown).ok_or(SchemaError::NoYamlBlock)?;
        let doc: serde_yaml::Value =
            serde_yaml::from_str(&yaml).map_err(|e| SchemaError::MalformedYaml(e.to_string()))?;

        let version = doc
            .get("version")
            .and_then(|v| v.as_u64())
            .ok_or(SchemaError::MissingSection { section: "version" })?;
        if version != SUPPORTED_SCHEMA_VERSION {
            return Err(SchemaError::UnsupportedVersion {
                found: version.to_string(),
            });
        }

        let types_node = doc
            .get("types")
            .and_then(|v| v.as_mapping())
            .ok_or(SchemaError::MissingSection { section: "types" })?;

        let mut types = BTreeMap::new();
        for (name_node, spec_node) in types_node {
            let name = name_node
                .as_str()
                .ok_or(SchemaError::MissingSection { section: "types" })?;
            let kind = ContentKind::from_frontmatter_value(name).map_err(|_| {
                SchemaError::UnknownType {
                    name: name.to_owned(),
                }
            })?;
            let type_spec = parse_type_spec(kind, name, spec_node)?;
            types.insert(kind, type_spec);
        }

        for kind in ContentKind::ALL {
            if !types.contains_key(&kind) {
                return Err(SchemaError::UnknownType {
                    name: format!("missing type `{}`", kind.frontmatter_value()),
                });
            }
        }

        Ok(Self { version, types })
    }

    /// The schema version.
    pub fn version(&self) -> u64 {
        self.version
    }

    /// The spec for a content type. Always `Some` for any [`ContentKind`]
    /// after a successful parse (the invariant).
    pub fn type_spec(&self, kind: ContentKind) -> Option<&TypeSpec> {
        self.types.get(&kind)
    }
}

/// Extract the first fenced ```yaml``` block from a markdown document.
///
/// Returns `None` if there is no opening ```yaml``` fence, or an opening
/// fence with no matching closing fence (a malformed block).
fn extract_yaml_block(markdown: &str) -> Option<String> {
    let mut lines = markdown.lines();
    let mut opened = false;
    for line in lines.by_ref() {
        if line.trim_start().starts_with("```yaml") {
            opened = true;
            break;
        }
    }
    if !opened {
        return None;
    }
    let mut buffer = String::new();
    for line in lines {
        if line.trim_start().starts_with("```") {
            return Some(buffer);
        }
        buffer.push_str(line);
        buffer.push('\n');
    }
    // Opening fence with no closing fence — malformed.
    None
}

/// Parse a `PartShape` from its SCHEMA string.
fn parse_shape(raw: &str, type_name: &str, role: &str) -> Result<PartShape, SchemaError> {
    match raw {
        "prose" => Ok(PartShape::Prose),
        "entry_list" => Ok(PartShape::EntryList),
        "key_value_list" => Ok(PartShape::KeyValueList),
        other => Err(SchemaError::UnknownShape {
            type_name: type_name.to_owned(),
            role: role.to_owned(),
            shape: other.to_owned(),
        }),
    }
}

/// Parse one type's spec node.
fn parse_type_spec(
    kind: ContentKind,
    name: &str,
    node: &serde_yaml::Value,
) -> Result<TypeSpec, SchemaError> {
    // `main_table` is needed to classify each field's `column:` — a column on
    // this table is `Main`, a column on any other table is `Side`.
    let main_table = node
        .get("main_table")
        .and_then(|v| v.as_str())
        .ok_or_else(|| SchemaError::MalformedType(format!("{name} (missing main_table)")))?
        .to_owned();

    let fields = node
        .get("fields")
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|n| parse_field_spec(n, &main_table))
                .collect()
        })
        .unwrap_or_default();

    let mut parts = Vec::new();
    if let Some(seq) = node.get("parts").and_then(|v| v.as_sequence()) {
        for part_node in seq {
            parts.push(parse_part_spec(name, part_node)?);
        }
    }

    Ok(TypeSpec {
        kind,
        main_table,
        fields,
        parts,
    })
}

/// Parse one frontmatter field spec node. Returns `None` for a malformed
/// entry rather than failing the whole load — a field without a name is
/// simply skipped (it cannot be referenced anyway).
fn parse_field_spec(node: &serde_yaml::Value, main_table: &str) -> Option<FieldSpec> {
    let name = node.get("name")?.as_str()?.to_owned();
    let type_decl = node
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("string")
        .to_owned();
    let required = node
        .get("required")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let column = parse_field_column(node.get("column"), main_table);
    Some(FieldSpec {
        name,
        type_decl,
        required,
        column,
    })
}

/// Classify a field's `column:` attribute into a [`FieldColumn`].
///
/// - absent / `null`            -> `None`
/// - `"<table>"` (no dot)       -> `FanOut`
/// - `"<main_table>.<col>"`     -> `Main`
/// - `"<other_table>.<col>"`    -> `Side`
fn parse_field_column(node: Option<&serde_yaml::Value>, main_table: &str) -> FieldColumn {
    let raw = match node.and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return FieldColumn::None,
    };
    match raw.split_once('.') {
        None => FieldColumn::FanOut(raw.to_owned()),
        Some((table, column)) if table == main_table => FieldColumn::Main(column.to_owned()),
        Some((table, column)) => FieldColumn::Side {
            table: table.to_owned(),
            column: column.to_owned(),
        },
    }
}

/// Parse one Part spec node.
fn parse_part_spec(type_name: &str, node: &serde_yaml::Value) -> Result<PartSpec, SchemaError> {
    let role = node
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_owned();
    let required = node
        .get("required")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let order = node.get("order").and_then(|v| v.as_i64()).unwrap_or(0);
    let shape_raw = node
        .get("shape")
        .and_then(|v| v.as_str())
        .unwrap_or("prose");
    let shape = parse_shape(shape_raw, type_name, &role)?;

    let entry_fields = node
        .get("entry_fields")
        .and_then(|v| v.as_sequence())
        .map(|seq| seq.iter().filter_map(parse_entry_field_spec).collect())
        .unwrap_or_default();

    Ok(PartSpec {
        role,
        required,
        order,
        shape,
        entry_fields,
    })
}

/// Parse one `entry_field` spec node.
fn parse_entry_field_spec(node: &serde_yaml::Value) -> Option<EntryFieldSpec> {
    let name = node.get("name")?.as_str()?.to_owned();
    let type_decl = node
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("string")
        .to_owned();
    let required = node
        .get("required")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let translatable = node
        .get("translatable")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    Some(EntryFieldSpec {
        name,
        type_decl,
        required,
        translatable,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Load the real `content/SCHEMA.md` from the repository root.
    fn real_schema() -> Schema {
        let text = include_str!("../../../../content/SCHEMA.md");
        Schema::parse(text).expect("the repo SCHEMA.md must parse")
    }

    #[test]
    fn the_repo_schema_parses_at_version_one() {
        assert_eq!(real_schema().version(), 1);
    }

    #[test]
    fn every_content_kind_has_a_type_spec() {
        let schema = real_schema();
        for kind in ContentKind::ALL {
            assert!(
                schema.type_spec(kind).is_some(),
                "{kind} must have a TypeSpec"
            );
        }
    }

    #[test]
    fn moment_has_body_required() {
        let schema = real_schema();
        let moment = schema.type_spec(ContentKind::Moment).expect("moment spec");
        assert!(moment.part("body").expect("body").required);
    }

    #[test]
    fn blog_status_field_is_a_three_value_enum() {
        let schema = real_schema();
        let blog = schema.type_spec(ContentKind::Blog).expect("blog spec");
        let status = blog.field("status").expect("status field");
        let values = status.enum_values().expect("status is an enum");
        assert_eq!(values, ["draft", "published", "archived"]);
    }

    #[test]
    fn resume_education_is_an_entry_list_with_entry_fields() {
        let schema = real_schema();
        let resume = schema.type_spec(ContentKind::Resume).expect("resume spec");
        let education = resume.part("education").expect("education part");
        assert_eq!(education.shape, PartShape::EntryList);
        let institution = education
            .entry_fields
            .iter()
            .find(|f| f.name == "institution")
            .expect("institution entry field");
        assert!(institution.required);
        assert!(institution.translatable);
    }

    #[test]
    fn resume_skills_is_a_key_value_list() {
        let schema = real_schema();
        let resume = schema.type_spec(ContentKind::Resume).expect("resume spec");
        assert_eq!(
            resume.part("skills").expect("skills part").shape,
            PartShape::KeyValueList
        );
    }

    #[test]
    fn rejects_a_document_without_a_yaml_block() {
        assert!(matches!(
            Schema::parse("# just prose, no fence"),
            Err(SchemaError::NoYamlBlock)
        ));
    }
}
