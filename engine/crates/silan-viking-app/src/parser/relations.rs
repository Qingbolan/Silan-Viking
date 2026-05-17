//! Relation-declaration parsing — shared parser support.
//!
//! Per `docs/silan-viking/10` §10.5, an Item's frontmatter `relations` list
//! holds entries of the form `{ type: evolved_from, to: "silan://..." }`.
//! This module turns one such YAML entry into a [`Relation`] whose `from` is
//! the declaring Item's URI.
//!
//! Canonicalisation (`01` §1.8.2) is deliberately NOT done here — the parser
//! records the relation as declared; the `Workspace` canonicalises when it
//! collects edges across all Items.

use super::error::ParseError;
use silan_viking_content::{Relation, RelationType, SilanUri};

/// Parse one frontmatter `relations` entry into a [`Relation`].
///
/// `from` is the URI of the Item that declared the relation. Returns
/// [`ParseError::Malformed`] if the entry is not a mapping, lacks `type` /
/// `to`, names an unknown relation type, or has an unparsable `to` URI.
pub fn parse_relation_decl(
    from: &SilanUri,
    raw: &serde_yaml::Value,
    location: &str,
) -> Result<Relation, ParseError> {
    let map = raw.as_mapping().ok_or_else(|| ParseError::Malformed {
        kind: "relation",
        location: location.to_owned(),
        detail: "a relations entry must be a mapping".to_owned(),
    })?;

    let type_str = map
        .get(serde_yaml::Value::String("type".to_owned()))
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::Malformed {
            kind: "relation",
            location: location.to_owned(),
            detail: "a relations entry needs a `type` field".to_owned(),
        })?;

    let relation_type = type_str
        .parse::<RelationType>()
        .map_err(|()| ParseError::Malformed {
            kind: "relation",
            location: location.to_owned(),
            detail: format!("unknown relation type `{type_str}`"),
        })?;

    let to_str = map
        .get(serde_yaml::Value::String("to".to_owned()))
        .and_then(|v| v.as_str())
        .ok_or_else(|| ParseError::Malformed {
            kind: "relation",
            location: location.to_owned(),
            detail: "a relations entry needs a `to` field".to_owned(),
        })?;

    let to = to_str
        .parse::<SilanUri>()
        .map_err(|e| ParseError::Malformed {
            kind: "relation",
            location: location.to_owned(),
            detail: format!("relation target `{to_str}` is not a valid URI: {e}"),
        })?;

    let sort_order = map
        .get(serde_yaml::Value::String("sort_order".to_owned()))
        .and_then(|v| v.as_i64());

    Ok(Relation::new(from.clone(), to, relation_type, sort_order))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn from_uri() -> SilanUri {
        "silan://resources/ideas/source".parse().expect("valid")
    }

    fn yaml(text: &str) -> serde_yaml::Value {
        serde_yaml::from_str(text).expect("valid yaml")
    }

    #[test]
    fn parses_a_well_formed_relation() {
        let raw = yaml("{ type: evolved_into, to: \"silan://resources/blog/target\" }");
        let rel = parse_relation_decl(&from_uri(), &raw, "test").expect("valid relation");
        assert_eq!(rel.relation_type(), RelationType::EvolvedInto);
        assert_eq!(rel.from(), &from_uri());
        assert_eq!(rel.to().to_string(), "silan://resources/blog/target");
    }

    #[test]
    fn rejects_unknown_relation_type() {
        let raw = yaml("{ type: invented, to: \"silan://resources/blog/t\" }");
        assert!(parse_relation_decl(&from_uri(), &raw, "test").is_err());
    }

    #[test]
    fn rejects_missing_target() {
        let raw = yaml("{ type: documents }");
        assert!(parse_relation_decl(&from_uri(), &raw, "test").is_err());
    }

    #[test]
    fn rejects_a_bad_target_uri() {
        let raw = yaml("{ type: references, to: \"http://example.com\" }");
        assert!(parse_relation_decl(&from_uri(), &raw, "test").is_err());
    }
}
