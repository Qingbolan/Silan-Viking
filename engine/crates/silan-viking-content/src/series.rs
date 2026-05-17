//! `Series` — a container series of episodes.
//!
//! Per `docs/silan-viking/01` §1.3 and `10` §10.4.4 (ruling #1), a `Series`
//! is the **container** form: an ordered set of `episode` Items that belong
//! strongly to the series. Because `episode` is its own content type with
//! its own table, episodes structurally never appear in the blog listing —
//! the invariant is guaranteed by the type system, not by a `WHERE` filter.
//!
//! `Series` holds only the series identity and the ordered membership; the
//! episode Items themselves are owned by the `episode` Collection.

use silan_viking_base::{ItemId, Slug};

/// The lifecycle status of a container series (`SCHEMA.md` episode.series).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeriesStatus {
    /// The series is still receiving new episodes.
    Ongoing,
    /// The series is finished.
    Completed,
    /// The series is retired.
    Archived,
}

impl SeriesStatus {
    /// The wire string for this status.
    pub fn as_str(self) -> &'static str {
        match self {
            SeriesStatus::Ongoing => "ongoing",
            SeriesStatus::Completed => "completed",
            SeriesStatus::Archived => "archived",
        }
    }
}

/// A container series of episodes.
///
/// Invariant 1: `members` is the episode membership in presentation order;
///   index 0 is the first episode.
/// Invariant 2: every `ItemId` in `members` denotes an `episode`-kind Item.
///   This is not re-checked here — the scanner builds the list from the
///   `episode/<series-slug>/` directory, so the kind is structural.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Series {
    slug: Slug,
    title: String,
    status: SeriesStatus,
    members: Vec<ItemId>,
}

impl Series {
    /// Construct a series from its slug, title, status, and ordered members.
    pub fn new(slug: Slug, title: String, status: SeriesStatus, members: Vec<ItemId>) -> Self {
        Self {
            slug,
            title,
            status,
            members,
        }
    }

    /// The series slug.
    pub fn slug(&self) -> &Slug {
        &self.slug
    }

    /// The series title.
    pub fn title(&self) -> &str {
        &self.title
    }

    /// The series status.
    pub fn status(&self) -> SeriesStatus {
        self.status
    }

    /// The episode membership, in presentation order.
    pub fn members(&self) -> &[ItemId] {
        &self.members
    }

    /// The number of episodes in the series.
    pub fn len(&self) -> usize {
        self.members.len()
    }

    /// Whether the series has no episodes yet.
    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }

    /// The 1-based ordinal of an episode within the series, if it is a member.
    pub fn ordinal_of(&self, episode: &ItemId) -> Option<usize> {
        self.members
            .iter()
            .position(|m| m == episode)
            .map(|i| i + 1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinal_is_one_based() {
        let a = ItemId::generate();
        let b = ItemId::generate();
        let series = Series::new(
            Slug::new("tutorial-series").expect("valid slug"),
            "Tutorial Series".to_owned(),
            SeriesStatus::Ongoing,
            vec![a.clone(), b.clone()],
        );
        assert_eq!(series.ordinal_of(&a), Some(1));
        assert_eq!(series.ordinal_of(&b), Some(2));
        assert_eq!(series.ordinal_of(&ItemId::generate()), None);
    }

    #[test]
    fn empty_series_reports_empty() {
        let series = Series::new(
            Slug::new("empty").expect("valid slug"),
            "Empty".to_owned(),
            SeriesStatus::Ongoing,
            Vec::new(),
        );
        assert!(series.is_empty());
        assert_eq!(series.len(), 0);
    }
}
