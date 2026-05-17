//! `Anthology` — a loose collection that references scattered Items.
//!
//! Per `docs/silan-viking/01` §1.3, an `Anthology` differs from a [`Series`]:
//! a Series *contains* episodes that belong only to it, whereas an Anthology
//! merely *references* Items that remain independent and may be referenced by
//! several anthologies. `Series` is the container form; `Anthology` is the
//! curatorial form.
//!
//! Naming note (§1.3): `Collection` is the physical type directory;
//! `Anthology` is the curated-set meaning. They do not collide.
//!
//! [`Series`]: crate::Series

use silan_viking_base::{ItemId, Slug};

/// A loose, ordered collection of references to independent Items.
///
/// Invariant: `members` is in curatorial order; an Item referenced here is
/// **not** owned by the anthology — it keeps its own home Collection and may
/// appear in other anthologies.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Anthology {
    slug: Slug,
    title: String,
    members: Vec<ItemId>,
}

impl Anthology {
    /// Construct an anthology from its slug, title, and ordered members.
    pub fn new(slug: Slug, title: String, members: Vec<ItemId>) -> Self {
        Self {
            slug,
            title,
            members,
        }
    }

    /// The anthology slug.
    pub fn slug(&self) -> &Slug {
        &self.slug
    }

    /// The anthology title.
    pub fn title(&self) -> &str {
        &self.title
    }

    /// The referenced Items, in curatorial order.
    pub fn members(&self) -> &[ItemId] {
        &self.members
    }

    /// Whether a given Item is referenced by this anthology.
    pub fn references(&self, item: &ItemId) -> bool {
        self.members.contains(item)
    }

    /// The number of referenced Items.
    pub fn len(&self) -> usize {
        self.members.len()
    }

    /// Whether the anthology references no Items.
    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthology_references_its_members() {
        let a = ItemId::generate();
        let anthology = Anthology::new(
            Slug::new("best-of-2026").expect("valid slug"),
            "Best of 2026".to_owned(),
            vec![a.clone()],
        );
        assert!(anthology.references(&a));
        assert!(!anthology.references(&ItemId::generate()));
        assert_eq!(anthology.len(), 1);
    }
}
