//! `ContentHash` — a deterministic digest of a content byte stream.
//!
//! Its single job is **change detection**: `sync` compares the hash of a
//! file's current bytes against the hash recorded in the manifest to decide
//! whether an Item changed. It is not a security primitive — no adversary is
//! defended against — so the base layer deliberately avoids a crypto-hash
//! dependency and uses FNV-1a, a fast, well-defined, non-cryptographic hash.
//!
//! The digest is a 64-bit FNV-1a value rendered as a 16-character lowercase
//! hex string, so it is stable across machines and round-trips through text
//! (it lands in `meta.toml` / manifests verbatim).

use crate::error::BaseError;
use std::fmt;

/// FNV-1a 64-bit offset basis.
const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
/// FNV-1a 64-bit prime.
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
/// The fixed width of a rendered digest, in hex characters.
const DIGEST_HEX_LEN: usize = 16;

/// A 64-bit FNV-1a content digest.
///
/// Invariant: the wrapped string is always exactly 16 lowercase hex
/// characters. [`ContentHash::of`] produces that shape by construction;
/// [`ContentHash::parse`] rejects anything else.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ContentHash(String);

impl ContentHash {
    /// Hash an arbitrary byte slice.
    ///
    /// This is the primary constructor: callers pass file bytes and get back
    /// a digest they can store and later compare.
    pub fn of(bytes: &[u8]) -> Self {
        let mut hash = FNV_OFFSET_BASIS;
        for &byte in bytes {
            hash ^= u64::from(byte);
            hash = hash.wrapping_mul(FNV_PRIME);
        }
        Self(format!("{hash:016x}"))
    }

    /// Parse an existing digest string (e.g. one read back from `meta.toml`).
    ///
    /// Returns [`BaseError::InvalidHash`] unless `raw` is exactly 16 lowercase
    /// hex characters.
    pub fn parse(raw: impl AsRef<str>) -> Result<Self, BaseError> {
        let raw = raw.as_ref();
        let well_formed = raw.len() == DIGEST_HEX_LEN
            && raw
                .chars()
                .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c));
        if well_formed {
            Ok(Self(raw.to_owned()))
        } else {
            Err(BaseError::InvalidHash {
                input: raw.to_owned(),
            })
        }
    }

    /// The digest as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Assert that `self` equals `expected`, returning
    /// [`BaseError::HashMismatch`] if it does not.
    ///
    /// Used by callers that want a typed error (not just a `bool`) when a
    /// file is found to have changed unexpectedly.
    pub fn ensure_matches(&self, expected: &ContentHash) -> Result<(), BaseError> {
        if self == expected {
            Ok(())
        } else {
            Err(BaseError::HashMismatch {
                expected: expected.0.clone(),
                actual: self.0.clone(),
            })
        }
    }
}

impl fmt::Display for ContentHash {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn digest_has_fixed_hex_width() {
        let hash = ContentHash::of(b"hello world");
        assert_eq!(hash.as_str().len(), DIGEST_HEX_LEN);
        assert!(hash.as_str().chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn hashing_is_deterministic() {
        assert_eq!(ContentHash::of(b"same"), ContentHash::of(b"same"));
    }

    #[test]
    fn different_bytes_diverge() {
        assert_ne!(ContentHash::of(b"a"), ContentHash::of(b"b"));
    }

    #[test]
    fn digest_round_trips_through_parse() {
        let hash = ContentHash::of(b"round trip");
        let reparsed = ContentHash::parse(hash.as_str()).expect("valid digest");
        assert_eq!(hash, reparsed);
    }

    #[test]
    fn parse_rejects_malformed_digests() {
        for bad in ["", "xyz", "ABCDEF0123456789", "0123456789abcde"] {
            assert!(ContentHash::parse(bad).is_err(), "{bad} should be rejected");
        }
    }

    #[test]
    fn ensure_matches_reports_mismatch() {
        let a = ContentHash::of(b"left");
        let b = ContentHash::of(b"right");
        assert!(a.ensure_matches(&a).is_ok());
        assert!(matches!(
            a.ensure_matches(&b),
            Err(BaseError::HashMismatch { .. })
        ));
    }
}
