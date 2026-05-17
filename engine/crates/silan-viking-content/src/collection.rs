//! `Collection` — one content-type directory.
//!
//! Per `docs/silan-viking/01` §1.3, a `Collection` is one `content/resources/
//! {type}/` directory — exactly one per [`ContentKind`]. It holds the Items
//! of that type and is registered by a collection-level manifest.
//!
//! A `Collection` belongs to the `ResourceNamespace` (`01` §1.3 invariant);
//! the `AgentNamespace` does not use Collections (§1.2.1).
//!
//! A Collection `impl`s the L1 [`Identified`] trait — it has a stable
//! `SilanUri` (`silan://resources/{type}`).

use crate::item::Item;
use crate::kind::ContentKind;
use silan_viking_base::{Identified, SilanUri, Slug};

/// One content-type directory holding the Items of that type.
///
/// Invariant 1: every Item in `items` has `item.kind() == kind` — the
///   constructor [`Collection::new`] enforces this and rejects a mismatch.
/// Invariant 2: `uri` is `silan://resources/{kind.dir_name()}`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Collection {
    kind: ContentKind,
    uri: SilanUri,
    items: Vec<Item>,
}

impl Collection {
    /// Construct a Collection for `kind` at `uri`, holding `items`.
    ///
    /// Returns `Err` with the offending Item slug if any Item's kind does
    /// not match `kind` — a Collection is homogeneous by definition.
    pub fn new(kind: ContentKind, uri: SilanUri, items: Vec<Item>) -> Result<Self, MixedKindError> {
        if let Some(bad) = items.iter().find(|i| i.kind() != kind) {
            return Err(MixedKindError {
                expected: kind,
                found: bad.kind(),
                slug: bad.slug().clone(),
            });
        }
        Ok(Self { kind, uri, items })
    }

    /// The content type of this Collection.
    pub fn kind(&self) -> ContentKind {
        self.kind
    }

    /// The Items in this Collection.
    pub fn items(&self) -> &[Item] {
        &self.items
    }

    /// The Item with a given slug, if present.
    pub fn item(&self, slug: &Slug) -> Option<&Item> {
        self.items.iter().find(|i| i.slug() == slug)
    }

    /// The number of Items in the Collection.
    pub fn len(&self) -> usize {
        self.items.len()
    }

    /// Whether the Collection holds no Items.
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}

impl Identified for Collection {
    fn uri(&self) -> &SilanUri {
        &self.uri
    }
}

/// Raised by [`Collection::new`] when an Item of the wrong kind is supplied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MixedKindError {
    /// The kind the Collection is for.
    pub expected: ContentKind,
    /// The kind of the offending Item.
    pub found: ContentKind,
    /// The slug of the offending Item.
    pub slug: Slug,
}

impl std::fmt::Display for MixedKindError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "collection of `{}` cannot hold `{}` item `{}`",
            self.expected, self.found, self.slug
        )
    }
}

impl std::error::Error for MixedKindError {}

#[cfg(test)]
mod tests {
    use super::*;
    use silan_viking_base::{ContentHash, ItemId, Meta, Namespace};
    use time::macros::datetime;

    fn collection_uri(kind: ContentKind) -> SilanUri {
        SilanUri::new(Namespace::Resources, [kind.dir_name().to_owned()]).expect("valid uri")
    }

    fn item(kind: ContentKind, slug: &str) -> Item {
        let uri = SilanUri::new(
            Namespace::Resources,
            [kind.dir_name().to_owned(), slug.to_owned()],
        )
        .expect("valid uri");
        Item::new(
            ItemId::generate(),
            kind,
            Slug::new(slug).expect("valid slug"),
            uri,
            Meta::new(
                ContentHash::of(slug.as_bytes()),
                datetime!(2026-05-17 0:00 UTC),
            ),
            Vec::new(),
        )
    }

    #[test]
    fn homogeneous_collection_is_accepted() {
        let coll = Collection::new(
            ContentKind::Blog,
            collection_uri(ContentKind::Blog),
            vec![item(ContentKind::Blog, "a"), item(ContentKind::Blog, "b")],
        )
        .expect("homogeneous");
        assert_eq!(coll.len(), 2);
        assert!(coll.item(&Slug::new("a").expect("slug")).is_some());
    }

    #[test]
    fn mixed_kind_collection_is_rejected() {
        let err = Collection::new(
            ContentKind::Blog,
            collection_uri(ContentKind::Blog),
            vec![item(ContentKind::Blog, "a"), item(ContentKind::Idea, "b")],
        )
        .expect_err("mixed kinds must fail");
        assert_eq!(err.expected, ContentKind::Blog);
        assert_eq!(err.found, ContentKind::Idea);
    }

    #[test]
    fn collection_implements_identified() {
        let coll = Collection::new(
            ContentKind::Idea,
            collection_uri(ContentKind::Idea),
            Vec::new(),
        )
        .expect("empty collection");
        assert_eq!(coll.uri().to_string(), "silan://resources/ideas");
    }
}
