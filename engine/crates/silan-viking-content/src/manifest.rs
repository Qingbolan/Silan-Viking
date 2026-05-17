//! Manifests — the three-level registry, plus `PartMeta`.
//!
//! Per `docs/silan-viking/01` §1.4, the content tree has three registry
//! files, with strictly non-overlapping responsibilities:
//!
//! - [`CollectionManifest`] (`content/resources/{type}/.silan-cache`) —
//!   lists every **Item** under a Collection.
//! - [`ItemManifest`] (`content/resources/{type}/{item}/.silan-cache`) —
//!   lists every **Part role** under an Item, plus sync metadata.
//! - [`PartMeta`] (`parts/{role}/meta.toml`) — the identity of a single Part.
//!
//! The two `.silan-cache` manifests are **engine-derived** (rebuildable, in
//! `.gitignore`); `PartMeta` is an **editable contract** (in Git, holds the
//! stable `part_id`). That distinction is why [`Manifest`] construction is
//! crate-private-ish in spirit while `PartMeta` is freely constructible
//! (§1.4 ruling).
//!
//! These are pure data — no IO, no parsing. The L3 layer reads/writes the
//! actual files.

use crate::kind::ContentKind;
use crate::part::{PartRole, PartShape};
use silan_viking_base::{ContentHash, Lang, PartId, Slug};

/// The identity-and-translation metadata of a single Part — the parsed
/// content of `parts/{role}/meta.toml` (`01` §1.3.1).
///
/// Invariant: `part_id` is engine-generated and never derived from `role` or
/// a filename. `canonical_lang` names the language the Part's
/// language-neutral fields are read from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartMeta {
    part_id: PartId,
    role: PartRole,
    shape: PartShape,
    canonical_lang: Lang,
}

impl PartMeta {
    /// Construct Part metadata.
    pub fn new(part_id: PartId, role: PartRole, shape: PartShape, canonical_lang: Lang) -> Self {
        Self {
            part_id,
            role,
            shape,
            canonical_lang,
        }
    }

    /// The Part's stable identity.
    pub fn part_id(&self) -> &PartId {
        &self.part_id
    }

    /// The Part's semantic role.
    pub fn role(&self) -> &PartRole {
        &self.role
    }

    /// The Part's on-disk shape.
    pub fn shape(&self) -> PartShape {
        self.shape
    }

    /// The Part's canonical language.
    pub fn canonical_lang(&self) -> &Lang {
        &self.canonical_lang
    }
}

/// One entry in a [`CollectionManifest`] — a registered Item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectionEntry {
    /// The Item's slug.
    pub slug: Slug,
    /// The Item's presentation sort key (lower sorts first).
    pub sort_order: i64,
    /// The Item's lifecycle status string (kept opaque at L2 — the parser
    /// owns the per-type enum).
    pub status: String,
}

/// Registers every Item under one Collection (`01` §1.4).
///
/// This manifest answers only "which Items exist in this type" — it does not
/// reach into an Item's Parts. It is engine-derived from a directory scan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CollectionManifest {
    kind: ContentKind,
    entries: Vec<CollectionEntry>,
}

impl CollectionManifest {
    /// Construct a Collection manifest for `kind` with the given entries.
    pub fn new(kind: ContentKind, entries: Vec<CollectionEntry>) -> Self {
        Self { kind, entries }
    }

    /// The content type this manifest registers.
    pub fn kind(&self) -> ContentKind {
        self.kind
    }

    /// The registered Item entries.
    pub fn entries(&self) -> &[CollectionEntry] {
        &self.entries
    }

    /// Whether an Item with the given slug is registered.
    pub fn registers(&self, slug: &Slug) -> bool {
        self.entries.iter().any(|e| &e.slug == slug)
    }
}

/// Sync provenance recorded in an [`ItemManifest`] (`01` §1.4, `09` §9.2.3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncMetadata {
    /// Digest of the Item's combined content at the last successful sync.
    pub content_hash: ContentHash,
}

/// Registers every Part role under one Item, plus sync metadata (`01` §1.4).
///
/// Invariant: `roles` lists each Part role of the Item **at most once** —
/// [`ItemManifest::new`] de-duplicates and reports a duplicate as a
/// [`ContentError::MalformedManifest`]. It deliberately does NOT carry
/// `part_id`s or languages — those belong to each Part's `PartMeta`.
///
/// [`ContentError::MalformedManifest`]: crate::ContentError::MalformedManifest
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemManifest {
    item_slug: Slug,
    roles: Vec<PartRole>,
    sync: Option<SyncMetadata>,
}

impl ItemManifest {
    /// Construct an Item manifest from the Item slug, its Part roles, and
    /// optional sync metadata.
    ///
    /// Returns [`ContentError::MalformedManifest`] if a role appears twice —
    /// an Item cannot have two Parts of the same role.
    ///
    /// [`ContentError::MalformedManifest`]: crate::ContentError::MalformedManifest
    pub fn new(
        item_slug: Slug,
        roles: Vec<PartRole>,
        sync: Option<SyncMetadata>,
    ) -> Result<Self, crate::ContentError> {
        let mut seen: Vec<&PartRole> = Vec::with_capacity(roles.len());
        for role in &roles {
            if seen.contains(&role) {
                return Err(crate::ContentError::MalformedManifest {
                    owner: item_slug.to_string(),
                    reason: format!("part role `{role}` listed more than once"),
                });
            }
            seen.push(role);
        }
        Ok(Self {
            item_slug,
            roles,
            sync,
        })
    }

    /// The slug of the Item this manifest registers.
    pub fn item_slug(&self) -> &Slug {
        &self.item_slug
    }

    /// The Part roles registered for the Item.
    pub fn roles(&self) -> &[PartRole] {
        &self.roles
    }

    /// The sync provenance, if the Item has been synced.
    pub fn sync(&self) -> Option<&SyncMetadata> {
        self.sync.as_ref()
    }

    /// Whether a Part with the given role is registered.
    pub fn registers(&self, role: &PartRole) -> bool {
        self.roles.contains(role)
    }
}

/// Either of the two engine-derived `.silan-cache` manifests (`01` §1.4).
///
/// `PartMeta` is intentionally **not** a variant — it is a Part's own
/// metadata, an editable Git-tracked contract, not a derived registry file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Manifest {
    /// Registers the Items of one Collection.
    Collection(CollectionManifest),
    /// Registers the Part roles of one Item.
    Item(ItemManifest),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slug(s: &str) -> Slug {
        Slug::new(s).expect("valid slug")
    }

    #[test]
    fn collection_manifest_reports_registration() {
        let manifest = CollectionManifest::new(
            ContentKind::Blog,
            vec![CollectionEntry {
                slug: slug("hello-world"),
                sort_order: 0,
                status: "published".to_owned(),
            }],
        );
        assert!(manifest.registers(&slug("hello-world")));
        assert!(!manifest.registers(&slug("missing")));
    }

    #[test]
    fn item_manifest_accepts_distinct_roles() {
        let manifest = ItemManifest::new(
            slug("multi-tab-idea"),
            vec![PartRole::new("overview"), PartRole::new("progress")],
            None,
        )
        .expect("distinct roles");
        assert!(manifest.registers(&PartRole::new("overview")));
        assert_eq!(manifest.roles().len(), 2);
    }

    #[test]
    fn item_manifest_rejects_duplicate_roles() {
        let err = ItemManifest::new(
            slug("bad-idea"),
            vec![PartRole::new("overview"), PartRole::new("overview")],
            None,
        )
        .expect_err("duplicate role must fail");
        assert!(matches!(err, crate::ContentError::MalformedManifest { .. }));
    }
}
