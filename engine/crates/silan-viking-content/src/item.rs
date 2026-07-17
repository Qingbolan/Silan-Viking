//! `Item` — one content entry.
//!
//! Per `docs/silan-viking/01` §1.3 / §1.5.0, an Item is a directory holding
//! several [`Part`]s and one Item-level manifest. It carries a private
//! `kind: ContentKind` set by `Workspace::scan` from the directory it was
//! found in — the kind is never guessed by a parser.
//!
//! An Item `impl`s the L1 [`Identified`] / [`HasMeta`] traits — it has a
//! stable `SilanUri` and a `Meta`. That is "content inherits base" (§1.2).

use crate::kind::ContentKind;
use crate::part::{Part, PartRole};
use silan_viking_base::{HasMeta, Identified, ItemId, Meta, SilanUri, Slug};

/// One content entry — an idea, a blog post, a project, an episode, the
/// resume, or an moment.
///
/// Invariant 1: `kind` is fixed at construction (the scan-time directory
///   dispatch). External code can only read it via [`Item::kind`].
/// Invariant 2: `uri` always lies in the `resources` namespace — an Item is
///   published content; agent context is not modelled as `Item`s (§1.2.1).
/// Invariant 3: `slug` equals the last segment of `uri`. The constructor is
///   the only build path and is fed both consistently by the scanner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    id: ItemId,
    kind: ContentKind,
    slug: Slug,
    uri: SilanUri,
    meta: Meta,
    parts: Vec<Part>,
}

impl Item {
    /// Construct an Item from its identity, kind, slug, URI, metadata, and
    /// Parts.
    ///
    /// The caller (`Workspace::scan`) is responsible for supplying a `uri`
    /// whose last segment is `slug` and whose namespace is `resources`.
    pub fn new(
        id: ItemId,
        kind: ContentKind,
        slug: Slug,
        uri: SilanUri,
        meta: Meta,
        parts: Vec<Part>,
    ) -> Self {
        Self {
            id,
            kind,
            slug,
            uri,
            meta,
            parts,
        }
    }

    /// The Item's stable identity.
    pub fn id(&self) -> &ItemId {
        &self.id
    }

    /// The Item's content type — the dispatch key for `ParserRegistry` and
    /// `MapperRegistry`.
    pub fn kind(&self) -> ContentKind {
        self.kind
    }

    /// The Item's slug.
    pub fn slug(&self) -> &Slug {
        &self.slug
    }

    /// The Item's Parts, in the order they were supplied.
    pub fn parts(&self) -> &[Part] {
        &self.parts
    }

    /// The Part with a given role, if present.
    pub fn part(&self, role: &PartRole) -> Option<&Part> {
        self.parts.iter().find(|p| p.role() == role)
    }

    /// Whether the Item has a Part with the given role.
    pub fn has_part(&self, role: &PartRole) -> bool {
        self.part(role).is_some()
    }
}

impl Identified for Item {
    fn uri(&self) -> &SilanUri {
        &self.uri
    }
}

impl HasMeta for Item {
    fn meta(&self) -> &Meta {
        &self.meta
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::part::PartShape;
    use silan_viking_base::{ContentHash, Lang, Namespace, PartId};
    use time::macros::datetime;

    fn item_with_parts(parts: Vec<Part>) -> Item {
        let uri = SilanUri::new(Namespace::Resources, ["ideas".to_owned(), "rce".to_owned()])
            .expect("valid uri");
        Item::new(
            ItemId::generate(),
            ContentKind::Idea,
            Slug::new("rce").expect("valid slug"),
            uri,
            Meta::new(ContentHash::of(b"item"), datetime!(2026-05-17 0:00 UTC)),
            parts,
        )
    }

    fn part(role: &str) -> Part {
        Part::new(
            PartId::generate(),
            PartRole::new(role),
            PartShape::Prose,
            Lang::new("en").expect("valid lang"),
            Vec::new(),
        )
    }

    #[test]
    fn kind_is_readable_and_fixed() {
        let item = item_with_parts(Vec::new());
        assert_eq!(item.kind(), ContentKind::Idea);
    }

    #[test]
    fn parts_are_resolved_by_role() {
        let item = item_with_parts(vec![part("overview"), part("progress")]);
        assert!(item.has_part(&PartRole::new("overview")));
        assert!(item.has_part(&PartRole::new("progress")));
        assert!(!item.has_part(&PartRole::new("result")));
    }

    #[test]
    fn item_implements_base_traits() {
        let item = item_with_parts(Vec::new());
        assert_eq!(item.uri().namespace(), Namespace::Resources);
        assert_eq!(item.meta().content_hash(), &ContentHash::of(b"item"));
    }
}
