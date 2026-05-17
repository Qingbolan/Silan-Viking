//! `Relation` — a directed, typed edge between two content URIs.
//!
//! Per `docs/silan-viking/01` §1.3 / §1.10 (revision A), relations model the
//! evolution chain (idea → blog → project) and references as the values of a
//! closed `RelationType` enum. The L2 layer holds the *data* of an edge; the
//! L3 `Workspace` is responsible for canonicalisation and writing it to the
//! `content_relation` table (§1.8.1 / §1.8.2).

use silan_viking_base::SilanUri;
use std::fmt;
use std::str::FromStr;

/// The closed set of relation types (per `SCHEMA.md` `relations.types` and
/// `01` §1.10 revision A).
///
/// Invariant: this set is closed and matches the `content_relation`
/// `relation_type` ENUM, so an illegal type cannot be persisted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RelationType {
    /// `from` evolved into `to` (idea → blog → project).
    EvolvedInto,
    /// `from` evolved from `to` — the reverse declaration of `EvolvedInto`.
    EvolvedFrom,
    /// `from` documents `to` (a blog post documenting a project).
    Documents,
    /// `from` references `to` (a structured citation edge).
    References,
    /// `from` supersedes `to` (a newer entry replacing an older one).
    Supersedes,
    /// `from` is part of `to` (membership in a series / anthology).
    PartOf,
}

impl RelationType {
    /// Every variant, in a stable order.
    pub const ALL: [RelationType; 6] = [
        RelationType::EvolvedInto,
        RelationType::EvolvedFrom,
        RelationType::Documents,
        RelationType::References,
        RelationType::Supersedes,
        RelationType::PartOf,
    ];

    /// The wire string for this type — matches `SCHEMA.md` `relations.types`.
    pub fn as_str(self) -> &'static str {
        match self {
            RelationType::EvolvedInto => "evolved_into",
            RelationType::EvolvedFrom => "evolved_from",
            RelationType::Documents => "documents",
            RelationType::References => "references",
            RelationType::Supersedes => "supersedes",
            RelationType::PartOf => "part_of",
        }
    }

    /// Whether this relation type is order-sensitive (`SCHEMA.md`
    /// `relations.ordered`). Ordered edges carry a `sort_order`.
    pub fn is_ordered(self) -> bool {
        matches!(self, RelationType::PartOf)
    }

    /// The canonical storage form of this type (per `SCHEMA.md`
    /// `relations.canonical` and `01` §1.8.2).
    ///
    /// `EvolvedFrom` canonicalises to `EvolvedInto` with the endpoints
    /// flipped; every other type stores as itself. The `bool` is the `flip`
    /// flag: `true` means the caller must swap `from` and `to`.
    pub fn canonical(self) -> (RelationType, bool) {
        match self {
            RelationType::EvolvedFrom => (RelationType::EvolvedInto, true),
            other => (other, false),
        }
    }
}

impl fmt::Display for RelationType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for RelationType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        RelationType::ALL
            .into_iter()
            .find(|t| t.as_str() == s)
            .ok_or(())
    }
}

/// A directed, typed edge between two content URIs.
///
/// Invariant: `from` and `to` are valid `SilanUri`s. The `Relation` itself
/// does not check that the endpoints *exist* — a dangling endpoint is a
/// validation concern raised as [`ContentError::DanglingRelation`] by the
/// resolver, not a construction failure here.
///
/// [`ContentError::DanglingRelation`]: crate::ContentError::DanglingRelation
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relation {
    from: SilanUri,
    to: SilanUri,
    relation_type: RelationType,
    /// Position among siblings for ordered relation types; `None` otherwise.
    sort_order: Option<i64>,
}

impl Relation {
    /// Construct an edge. `sort_order` is meaningful only when
    /// `relation_type.is_ordered()`.
    pub fn new(
        from: SilanUri,
        to: SilanUri,
        relation_type: RelationType,
        sort_order: Option<i64>,
    ) -> Self {
        Self {
            from,
            to,
            relation_type,
            sort_order,
        }
    }

    /// The edge's source URI.
    pub fn from(&self) -> &SilanUri {
        &self.from
    }

    /// The edge's target URI.
    pub fn to(&self) -> &SilanUri {
        &self.to
    }

    /// The edge's type.
    pub fn relation_type(&self) -> RelationType {
        self.relation_type
    }

    /// The sort order, for ordered relation types.
    pub fn sort_order(&self) -> Option<i64> {
        self.sort_order
    }

    /// Return this edge in canonical form (per `01` §1.8.2): the type is
    /// canonicalised and, if the `flip` flag is set, the endpoints are
    /// swapped. This is what the `Workspace` stores so one physical edge has
    /// exactly one row.
    pub fn canonicalized(&self) -> Relation {
        let (canonical_type, flip) = self.relation_type.canonical();
        let (from, to) = if flip {
            (self.to.clone(), self.from.clone())
        } else {
            (self.from.clone(), self.to.clone())
        };
        Relation {
            from,
            to,
            relation_type: canonical_type,
            sort_order: self.sort_order,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use silan_viking_base::Namespace;

    fn uri(slug: &str) -> SilanUri {
        SilanUri::new(Namespace::Resources, ["ideas".to_owned(), slug.to_owned()])
            .expect("valid uri")
    }

    #[test]
    fn relation_type_wire_strings_round_trip() {
        for t in RelationType::ALL {
            assert_eq!(t.as_str().parse::<RelationType>(), Ok(t));
        }
    }

    #[test]
    fn only_part_of_is_ordered() {
        for t in RelationType::ALL {
            assert_eq!(t.is_ordered(), t == RelationType::PartOf);
        }
    }

    #[test]
    fn evolved_from_canonicalises_with_a_flip() {
        let edge = Relation::new(uri("a"), uri("b"), RelationType::EvolvedFrom, None);
        let canon = edge.canonicalized();
        assert_eq!(canon.relation_type(), RelationType::EvolvedInto);
        // The endpoints are swapped so the stored direction is consistent.
        assert_eq!(canon.from(), &uri("b"));
        assert_eq!(canon.to(), &uri("a"));
    }

    #[test]
    fn documents_canonicalises_without_a_flip() {
        let edge = Relation::new(uri("a"), uri("b"), RelationType::Documents, None);
        let canon = edge.canonicalized();
        assert_eq!(canon.from(), &uri("a"));
        assert_eq!(canon.to(), &uri("b"));
    }
}
