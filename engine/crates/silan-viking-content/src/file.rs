//! `File` — one language variant (representation) of a [`Part`](crate::Part).
//!
//! Per `docs/silan-viking/01` §1.3, **`File == Representation`**: a File is
//! *not* an identity. It is the bytes of a Part in one language. Its identity
//! is borrowed from the owning Part's `PartId`; the File only knows its own
//! `Lang` and content.
//!
//! The base layer's [`Identified`] / [`HasMeta`] traits are intentionally
//! NOT implemented here — a File has no independent `SilanUri` and no
//! independent `Meta`; it is addressed through its Part.

use silan_viking_base::{ContentHash, Lang};

/// One language variant of a Part.
///
/// Invariant: `hash` is the digest of `body` *as supplied*. The constructor
/// does not recompute it — the caller (the L3 parser) is responsible for
/// passing a hash consistent with `body`. This keeps L2 free of the hashing
/// behaviour while still letting change-detection read a stored hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct File {
    lang: Lang,
    body: String,
    hash: ContentHash,
}

impl File {
    /// Construct a File from its language, raw body, and content hash.
    pub fn new(lang: Lang, body: String, hash: ContentHash) -> Self {
        Self { lang, body, hash }
    }

    /// Construct a File, computing the content hash from `body`.
    ///
    /// The convenient path when the caller has the bytes and wants the hash
    /// derived consistently.
    pub fn with_computed_hash(lang: Lang, body: String) -> Self {
        let hash = ContentHash::of(body.as_bytes());
        Self { lang, body, hash }
    }

    /// The language of this variant.
    pub fn lang(&self) -> &Lang {
        &self.lang
    }

    /// The raw file body — markdown for a prose Part, TOML otherwise.
    pub fn body(&self) -> &str {
        &self.body
    }

    /// The content hash recorded for this variant.
    pub fn hash(&self) -> &ContentHash {
        &self.hash
    }

    /// Whether this File's recorded hash still matches its body — `false`
    /// signals the stored hash is stale relative to the current bytes.
    pub fn hash_is_current(&self) -> bool {
        ContentHash::of(self.body.as_bytes()) == self.hash
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lang(tag: &str) -> Lang {
        Lang::new(tag).expect("valid lang")
    }

    #[test]
    fn computed_hash_matches_body() {
        let file = File::with_computed_hash(lang("en"), "content".to_owned());
        assert!(file.hash_is_current());
    }

    #[test]
    fn supplied_inconsistent_hash_is_detected() {
        let file = File::new(
            lang("en"),
            "real body".to_owned(),
            ContentHash::of(b"something else"),
        );
        assert!(!file.hash_is_current());
    }

    #[test]
    fn exposes_language_and_body() {
        let file = File::with_computed_hash(lang("zh"), "正文".to_owned());
        assert_eq!(file.lang(), &lang("zh"));
        assert_eq!(file.body(), "正文");
    }
}
