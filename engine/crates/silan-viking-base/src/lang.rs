//! `Lang` — a content language tag.
//!
//! Every Part can have several language variants (`en.md`, `zh.md`); `Lang`
//! is the value that distinguishes them. It mirrors the `language_code`
//! column of the Go ent `*_translations` tables, so it must round-trip
//! losslessly to a plain string.

use crate::error::BaseError;
use std::fmt;
use std::str::FromStr;

/// A validated language tag (`en`, `zh`, `zh-hans`).
///
/// Invariant 1: the wrapped string is non-empty, lowercase ASCII, and
///   contains only letters and hyphens — a deliberately small subset of
///   BCP-47 sufficient for filename-derived tags.
/// Invariant 2: the tag is stored normalised to lowercase, so two `Lang`
///   values compare equal iff they name the same language.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Lang(String);

impl Lang {
    /// Construct a `Lang`, lowercasing and validating `raw`.
    ///
    /// Returns [`BaseError::InvalidLang`] if `raw` is empty or contains a
    /// character outside `[a-z-]` after lowercasing.
    pub fn new(raw: impl AsRef<str>) -> Result<Self, BaseError> {
        let raw = raw.as_ref();
        let lowered = raw.to_ascii_lowercase();
        let valid = !lowered.is_empty()
            && lowered.chars().all(|c| c.is_ascii_lowercase() || c == '-')
            && !lowered.starts_with('-')
            && !lowered.ends_with('-');
        if valid {
            Ok(Self(lowered))
        } else {
            Err(BaseError::InvalidLang {
                input: raw.to_owned(),
            })
        }
    }

    /// The tag as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for Lang {
    type Err = BaseError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::new(s)
    }
}

impl fmt::Display for Lang {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_and_normalises_tags() {
        assert_eq!(Lang::new("EN").expect("valid").as_str(), "en");
        assert_eq!(Lang::new("zh-Hans").expect("valid").as_str(), "zh-hans");
    }

    #[test]
    fn rejects_malformed_tags() {
        for bad in ["", "en_US", "en ", "-en", "en-", "zh1"] {
            assert!(Lang::new(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn equality_is_case_insensitive() {
        assert_eq!(
            Lang::new("EN").expect("valid"),
            Lang::new("en").expect("valid")
        );
    }
}
