//! `ItemId` and `PartId` — the stable, engine-generated identities.
//!
//! Per `docs/silan-viking/01` §1.3, a Part's identity is **not** its filename:
//! it is a `PartId` (`p_<ulid>`) written into `meta.toml` that survives any
//! rename or move. An Item likewise carries an `ItemId` (`i_<ulid>`). The
//! engine generates these; `index sync` never silently writes them back.
//!
//! Both are ULID-backed: a ULID is lexicographically sortable by creation
//! time, which is why the engine prefers it over a random UUID for content
//! identities (deterministic ordering in manifests and diffs).

use crate::error::BaseError;
use std::fmt;
use ulid::Ulid;

/// Generate a fresh ULID body string. Centralised so every id type uses the
/// same generator and the same uppercase Crockford-base32 representation.
fn fresh_ulid() -> String {
    Ulid::new().to_string()
}

/// Validate that `body` is a syntactically well-formed ULID.
fn is_ulid_body(body: &str) -> bool {
    Ulid::from_string(body).is_ok()
}

/// Macro: define a prefixed-ULID identity type with construction, parsing,
/// and `Display`. Both `ItemId` and `PartId` are structurally identical —
/// only the prefix differs — so the shape is written once.
macro_rules! prefixed_id {
    ($(#[$doc:meta])* $name:ident, $prefix:literal) => {
        $(#[$doc])*
        ///
        /// Invariant: the wrapped string is always `PREFIX` followed by a
        /// valid ULID body. The construction and parsing paths are the only
        /// ways to obtain one, and both enforce this.
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(String);

        impl $name {
            /// The id prefix (`"i_"` for items, `"p_"` for parts).
            pub const PREFIX: &'static str = $prefix;

            /// Generate a brand-new id with a fresh ULID body.
            pub fn generate() -> Self {
                Self(format!("{}{}", $prefix, fresh_ulid()))
            }

            /// Parse an existing id string, validating prefix and ULID body.
            ///
            /// Returns [`BaseError::InvalidId`] if the prefix is wrong or the
            /// body is not a valid ULID.
            pub fn parse(raw: impl AsRef<str>) -> Result<Self, BaseError> {
                let raw = raw.as_ref();
                let body = raw.strip_prefix($prefix).filter(|b| is_ulid_body(b));
                match body {
                    Some(_) => Ok(Self(raw.to_owned())),
                    None => Err(BaseError::InvalidId {
                        input: raw.to_owned(),
                        expected_prefix: $prefix,
                    }),
                }
            }

            /// The id as a string slice (prefix included).
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl std::str::FromStr for $name {
            type Err = BaseError;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Self::parse(s)
            }
        }
    };
}

prefixed_id! {
    /// The identity of an Item (`i_<ulid>`) — one content entry.
    ItemId, "i_"
}

prefixed_id! {
    /// The identity of a Part (`p_<ulid>`) — one semantic section / tab of an
    /// Item, stable across filename changes.
    PartId, "p_"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_ids_carry_the_right_prefix() {
        assert!(ItemId::generate().as_str().starts_with("i_"));
        assert!(PartId::generate().as_str().starts_with("p_"));
    }

    #[test]
    fn generated_ids_round_trip_through_parse() {
        let item = ItemId::generate();
        assert_eq!(ItemId::parse(item.as_str()).expect("valid"), item);
        let part = PartId::generate();
        assert_eq!(PartId::parse(part.as_str()).expect("valid"), part);
    }

    #[test]
    fn parse_rejects_wrong_prefix() {
        let part = PartId::generate();
        // A part id is not a valid item id.
        assert!(ItemId::parse(part.as_str()).is_err());
    }

    #[test]
    fn parse_rejects_malformed_body() {
        assert!(ItemId::parse("i_not-a-ulid").is_err());
        assert!(PartId::parse("p_").is_err());
        assert!(ItemId::parse("01H8X7K9").is_err());
    }
}
