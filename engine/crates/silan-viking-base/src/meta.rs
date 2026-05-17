//! `Meta` — the common metadata block carried by every content object.
//!
//! Per `docs/silan-viking/01` §1.2, the L1 base layer defines the data that
//! is common to all content objects; `Meta` is that data. A `Collection`, an
//! `Item`, and a `Part` each hold a `Meta`, and each `impl`s the [`HasMeta`]
//! trait to expose it.
//!
//! `Meta` is intentionally small: it holds only what is universal — a content
//! hash and timestamps. Type-specific fields (status, visibility, …) live on
//! the L2 content objects, not here, because the base layer must not know
//! what a "status" is.
//!
//! [`HasMeta`]: crate::traits::HasMeta

use crate::hash::ContentHash;
use time::OffsetDateTime;

/// Universal metadata for a content object.
///
/// Invariant: `created_at <= updated_at`. The constructors enforce this;
/// [`Meta::touch`] preserves it by only ever moving `updated_at` forward.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Meta {
    /// Digest of the object's canonical bytes — drives change detection.
    content_hash: ContentHash,
    /// When the object was first created.
    created_at: OffsetDateTime,
    /// When the object was last modified.
    updated_at: OffsetDateTime,
}

impl Meta {
    /// Construct metadata for a freshly created object: `created_at` and
    /// `updated_at` are both `now`.
    pub fn new(content_hash: ContentHash, now: OffsetDateTime) -> Self {
        Self {
            content_hash,
            created_at: now,
            updated_at: now,
        }
    }

    /// Reconstruct metadata from stored values (e.g. read back from a
    /// manifest).
    ///
    /// If `updated_at` precedes `created_at` — a corrupt record — it is
    /// clamped up to `created_at` so the invariant always holds.
    pub fn from_parts(
        content_hash: ContentHash,
        created_at: OffsetDateTime,
        updated_at: OffsetDateTime,
    ) -> Self {
        Self {
            content_hash,
            created_at,
            updated_at: updated_at.max(created_at),
        }
    }

    /// The content hash.
    pub fn content_hash(&self) -> &ContentHash {
        &self.content_hash
    }

    /// The creation timestamp.
    pub fn created_at(&self) -> OffsetDateTime {
        self.created_at
    }

    /// The last-modified timestamp.
    pub fn updated_at(&self) -> OffsetDateTime {
        self.updated_at
    }

    /// Record a modification: adopt a new hash and advance `updated_at`.
    ///
    /// `updated_at` only ever moves forward — if `now` is earlier than the
    /// current `updated_at` (clock skew), the existing value is kept, so the
    /// `created_at <= updated_at` invariant holds.
    pub fn touch(&mut self, content_hash: ContentHash, now: OffsetDateTime) {
        self.content_hash = content_hash;
        self.updated_at = now.max(self.updated_at);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    fn hash() -> ContentHash {
        ContentHash::of(b"meta test")
    }

    #[test]
    fn new_sets_both_timestamps_equal() {
        let now = datetime!(2026-05-17 12:00 UTC);
        let meta = Meta::new(hash(), now);
        assert_eq!(meta.created_at(), meta.updated_at());
    }

    #[test]
    fn from_parts_clamps_inverted_timestamps() {
        let created = datetime!(2026-05-17 12:00 UTC);
        let stale = datetime!(2026-05-01 00:00 UTC);
        let meta = Meta::from_parts(hash(), created, stale);
        assert_eq!(meta.updated_at(), created);
    }

    #[test]
    fn touch_advances_updated_at_only_forward() {
        let created = datetime!(2026-05-17 12:00 UTC);
        let mut meta = Meta::new(hash(), created);

        let later = datetime!(2026-05-18 12:00 UTC);
        meta.touch(ContentHash::of(b"changed"), later);
        assert_eq!(meta.updated_at(), later);

        // A clock-skewed earlier `now` must not move `updated_at` backward.
        let earlier = datetime!(2026-05-01 00:00 UTC);
        meta.touch(ContentHash::of(b"again"), earlier);
        assert_eq!(meta.updated_at(), later);
        // The hash still updates even when the timestamp is held.
        assert_eq!(meta.content_hash(), &ContentHash::of(b"again"));
    }
}
