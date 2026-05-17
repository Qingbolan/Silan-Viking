//! `Slug` — a URL-safe identifier segment.
//!
//! A slug is the stable, human-typed handle of an Item (`rust-context-engine`).
//! It is the last path segment of a `SilanUri` and a `UNIQUE` column on every
//! content main table, so its shape must be pinned: `^[a-z0-9][a-z0-9-]*$`
//! (lowercase ASCII, digits and hyphens, no leading hyphen).

use crate::error::BaseError;
use std::fmt;
use std::str::FromStr;

/// A validated slug.
///
/// Invariant 1: the wrapped string always matches `^[a-z0-9][a-z0-9-]*$`.
///   The only construction path is [`Slug::new`] / [`Slug::from_str`], both of
///   which reject anything else, so no other code can hold an invalid `Slug`.
/// Invariant 2: a `Slug` is never empty (the regex requires one leading char).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Slug(String);

impl Slug {
    /// Construct a `Slug`, validating the pattern.
    ///
    /// Returns [`BaseError::InvalidSlug`] if `raw` has an uppercase letter, a
    /// leading hyphen, a disallowed character, or is empty.
    pub fn new(raw: impl Into<String>) -> Result<Self, BaseError> {
        let raw = raw.into();
        if Self::is_valid(&raw) {
            Ok(Self(raw))
        } else {
            Err(BaseError::InvalidSlug { input: raw })
        }
    }

    /// The slug as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Consume the `Slug`, returning the owned inner string.
    pub fn into_inner(self) -> String {
        self.0
    }

    /// Whether `raw` matches the slug pattern. Kept private-to-crate so the
    /// rule has exactly one definition.
    fn is_valid(raw: &str) -> bool {
        let mut chars = raw.chars();
        match chars.next() {
            // First char: lowercase letter or digit (no leading hyphen).
            Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
            _ => return false,
        }
        // Remaining chars: lowercase letter, digit, or hyphen.
        chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    }
}

impl FromStr for Slug {
    type Err = BaseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}

impl fmt::Display for Slug {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_well_formed_slugs() {
        for ok in ["rust-context-engine", "blog", "x", "a1", "2024-recap"] {
            assert!(Slug::new(ok).is_ok(), "{ok} should be a valid slug");
        }
    }

    #[test]
    fn rejects_malformed_slugs() {
        for bad in [
            "",
            "-leading",
            "Upper",
            "has space",
            "trailing_underscore",
            "zh.Hans",
        ] {
            assert!(Slug::new(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn round_trips_through_display_and_from_str() {
        let slug: Slug = "rust-context-engine".parse().expect("valid slug");
        assert_eq!(slug.to_string(), "rust-context-engine");
        assert_eq!(slug.as_str(), "rust-context-engine");
    }
}
