//! `silan-viking-content` — L2 domain-data layer.
//!
//! This layer holds the **domain data** of silan-viking: what a Namespace, a
//! Collection, an Item, a Part, a File, a Manifest, a Relation, a Series, and
//! an Anthology *are*. It knows that `blog` and `idea` exist; that makes it
//! the content layer, not the base layer (`docs/silan-viking/01` §1.1).
//!
//! What it is NOT: it does not parse files, does no IO, does no schema
//! validation, and does not know the database exists. Parsing and validation
//! are *behaviour* and live in the L3 `silan-viking-app` `Parser`; the
//! database is L2.5 `silan-viking-entities`. The content layer is pure data.
//!
//! The internal containment is a four-level tree (`ResourceNamespace` only):
//! `Collection(type) -> Item -> Part -> File`. The `AgentNamespace` does NOT
//! follow that chain — it is free-form markdown (§1.2.1).
//!
//! Errors are unified as [`ContentError`] (`thiserror`, per `09` §9.1). No
//! non-test code in this crate uses `unwrap()` / `expect()`.

#![forbid(unsafe_code)]

mod anthology;
mod collection;
mod error;
mod file;
mod item;
mod kind;
mod manifest;
mod namespace;
mod part;
mod relation;
mod series;

pub use anthology::Anthology;
pub use collection::Collection;
pub use error::ContentError;
pub use file::File;
pub use item::Item;
pub use kind::ContentKind;
pub use manifest::{CollectionManifest, ItemManifest, Manifest, PartMeta};
pub use namespace::{AgentNamespace, Namespace, ResourceNamespace};
pub use part::{Part, PartRole, PartShape};
pub use relation::{Relation, RelationType};
pub use series::Series;

// Re-export the base value objects that appear in this crate's public API,
// so downstream crates can name them without depending on `base` directly.
pub use silan_viking_base::{
    ContentHash, HasMeta, Identified, ItemId, Lang, Meta, PartId, SilanUri, Slug,
};
