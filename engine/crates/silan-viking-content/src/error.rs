//! `ContentError` — the typed error for the L2 content layer.
//!
//! Per `docs/silan-viking/09` §9.1. Every variant names an operator-fixable
//! cause and carries enough context to locate it; there is no `Other(String)`
//! escape hatch. `ContentError` wraps [`BaseError`] when a base value object
//! fails inside a content operation.

use silan_viking_base::BaseError;
use thiserror::Error;

/// All ways a content-layer construction or structural check can fail.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ContentError {
    /// A base value object (URI, slug, id, hash) failed to construct.
    #[error("base value error: {0}")]
    Base(#[from] BaseError),

    /// A directory name did not correspond to one of the 6 content types.
    #[error(
        "unknown content type `{name}`; expected one of blog/project/idea/episode/resume/update"
    )]
    UnknownContentKind { name: String },

    /// A manifest's recorded structure was internally inconsistent — e.g. it
    /// listed the same Part role twice, or referenced a missing field.
    #[error("malformed manifest for `{owner}`: {reason}")]
    MalformedManifest { owner: String, reason: String },

    /// A Part was found that does not belong to any Item — a structural
    /// orphan the content tree cannot place.
    #[error("orphan part `{part_id}`: not registered under any item")]
    OrphanPart { part_id: String },

    /// A Relation endpoint pointed at content that does not exist in the
    /// scanned tree.
    #[error("dangling relation `{relation_type}` from `{from}` to missing `{to}`")]
    DanglingRelation {
        relation_type: String,
        from: String,
        to: String,
    },

    /// A Collection or Item was handed content from the wrong namespace —
    /// e.g. an Item with a `silan://agent/...` URI placed in a Collection.
    #[error("namespace mismatch: `{uri}` does not belong to namespace `{expected}`")]
    NamespaceMismatch { uri: String, expected: String },
}
