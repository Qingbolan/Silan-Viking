//! Frontmatter splitting and typed field coercion — shared parser support.
//!
//! Every prose Part's `<lang>.md` file is `YAML frontmatter + markdown body`.
//! This module splits the two and coerces a frontmatter value into a
//! [`FieldValue`] according to a SCHEMA [`FieldSpec`]'s declared type. It is
//! parser-internal support, not a public API.

use super::error::ParseError;
use super::parsed::FieldValue;
use crate::schema::FieldSpec;

/// The two halves of a prose Part file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontmatterDoc {
    /// The YAML frontmatter block (empty if the file had no `---` fence).
    pub frontmatter: String,
    /// The markdown body after the frontmatter.
    pub body: String,
}

/// Split a `<lang>.md` file into its YAML frontmatter and markdown body.
///
/// A file may legitimately have no frontmatter (a translation file carrying
/// only body text) — in that case `frontmatter` is empty and the whole file
/// is `body`.
pub fn split(text: &str) -> FrontmatterDoc {
    let trimmed = text.strip_prefix('\u{feff}').unwrap_or(text);
    if let Some(rest) = trimmed.strip_prefix("---\n") {
        if let Some(end) = rest.find("\n---\n") {
            return FrontmatterDoc {
                frontmatter: rest[..end].to_owned(),
                body: rest[end + 5..].to_owned(),
            };
        }
        // A file ending exactly at the closing fence (no trailing body).
        if let Some(fm) = rest.strip_suffix("\n---") {
            return FrontmatterDoc {
                frontmatter: fm.to_owned(),
                body: String::new(),
            };
        }
    }
    FrontmatterDoc {
        frontmatter: String::new(),
        body: trimmed.to_owned(),
    }
}

/// Parse a YAML frontmatter block into a mapping.
///
/// Returns [`ParseError::Malformed`] if the block is not valid YAML. An empty
/// block yields an empty mapping.
pub fn parse_yaml(frontmatter: &str, location: &str) -> Result<serde_yaml::Mapping, ParseError> {
    if frontmatter.trim().is_empty() {
        return Ok(serde_yaml::Mapping::new());
    }
    let value: serde_yaml::Value =
        serde_yaml::from_str(frontmatter).map_err(|e| ParseError::Malformed {
            kind: "frontmatter",
            location: location.to_owned(),
            detail: e.to_string(),
        })?;
    match value {
        serde_yaml::Value::Mapping(map) => Ok(map),
        serde_yaml::Value::Null => Ok(serde_yaml::Mapping::new()),
        _ => Err(ParseError::Malformed {
            kind: "frontmatter",
            location: location.to_owned(),
            detail: "frontmatter is not a YAML mapping".to_owned(),
        }),
    }
}

/// Coerce a raw YAML frontmatter value into a [`FieldValue`] according to a
/// field's declared SCHEMA type.
///
/// Returns `None` if the value is absent or null. A value whose YAML shape
/// disagrees with the declared type is coerced on a best-effort basis (an
/// `int` field given a string is read as text) — strict enum / type checks
/// are the job of `Parser::validate`, which produces graded `Issue`s rather
/// than aborting here.
pub fn coerce(map: &serde_yaml::Mapping, spec: &FieldSpec) -> Option<FieldValue> {
    let raw = map.get(serde_yaml::Value::String(spec.name.clone()))?;
    if raw.is_null() {
        return None;
    }
    let decl = spec.type_decl.as_str();

    // List types.
    if decl.starts_with("list<") || decl.starts_with("list ") {
        let items = raw
            .as_sequence()?
            .iter()
            .filter_map(|v| v.as_str().map(str::to_owned))
            .collect();
        return Some(FieldValue::List(items));
    }

    match decl {
        "int" | "ulid" => raw
            .as_i64()
            .map(FieldValue::Int)
            .or_else(|| raw.as_str().map(|s| FieldValue::Text(s.to_owned()))),
        "float" => raw
            .as_f64()
            .map(FieldValue::Float)
            .or_else(|| raw.as_str().map(|s| FieldValue::Text(s.to_owned()))),
        "bool" => raw.as_bool().map(FieldValue::Bool),
        // string / text / slug / date / datetime / enum(...) — all stored as
        // text; their stricter checks belong to `validate`.
        _ => raw.as_str().map(|s| FieldValue::Text(s.to_owned())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_separates_frontmatter_and_body() {
        let doc = split("---\nslug: hello\n---\n# Body\ntext");
        assert_eq!(doc.frontmatter, "slug: hello");
        assert_eq!(doc.body, "# Body\ntext");
    }

    #[test]
    fn split_handles_a_file_with_no_frontmatter() {
        let doc = split("just body text\n");
        assert!(doc.frontmatter.is_empty());
        assert_eq!(doc.body, "just body text\n");
    }

    #[test]
    fn parse_yaml_rejects_malformed_blocks() {
        assert!(parse_yaml("key: : :", "test.md").is_err());
    }

    #[test]
    fn coerce_reads_each_declared_type() {
        let map: serde_yaml::Mapping = serde_yaml::from_str(
            "title: Hello\ncount: 3\nratio: 1.5\nflag: true\ntags:\n  - a\n  - b",
        )
        .expect("valid yaml");

        let text = coerce(&map, &fld("title", "string"));
        assert_eq!(
            text.and_then(|v| v.as_text().map(str::to_owned)).as_deref(),
            Some("Hello")
        );

        assert_eq!(coerce(&map, &fld("count", "int")), Some(FieldValue::Int(3)));
        assert_eq!(
            coerce(&map, &fld("ratio", "float")),
            Some(FieldValue::Float(1.5))
        );
        assert_eq!(
            coerce(&map, &fld("flag", "bool")),
            Some(FieldValue::Bool(true))
        );
        assert_eq!(
            coerce(&map, &fld("tags", "list<string>")),
            Some(FieldValue::List(vec!["a".to_owned(), "b".to_owned()]))
        );
        assert_eq!(coerce(&map, &fld("absent", "string")), None);
    }

    fn fld(name: &str, type_decl: &str) -> FieldSpec {
        FieldSpec {
            name: name.to_owned(),
            type_decl: type_decl.to_owned(),
            required: false,
        }
    }
}
