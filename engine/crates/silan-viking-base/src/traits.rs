//! `Identified` and `HasMeta` — the L1 capability traits.
//!
//! Per `docs/silan-viking/01` §1.2, "content inherits base" is realised in
//! Rust by defining behaviour-contract traits here in L1 and having the L2
//! `content` types `impl` them. These two traits are exactly that contract:
//!
//! - [`Identified`] — "this object has a stable `SilanUri`".
//! - [`HasMeta`]   — "this object carries a [`Meta`] block".
//!
//! What they are NOT: they carry no validation and no parsing. Validation is
//! behaviour and lives in the L3 `Parser` (§1.2). These traits are pure data
//! accessors, which is why they belong in the base layer.

use crate::meta::Meta;
use crate::uri::SilanUri;

/// An object that has a stable content address.
///
/// Implemented by `Collection`, `Item`, and `File` in the L2 content layer.
/// The returned URI is the object's identity for addressing purposes — it
/// does not change for the lifetime of the object.
pub trait Identified {
    /// The object's `silan://` URI.
    fn uri(&self) -> &SilanUri;
}

/// An object that carries a [`Meta`] block.
///
/// Implemented by every content object that has a content hash and
/// timestamps. Kept separate from [`Identified`] because the two are
/// orthogonal: a future object could have a URI but no `Meta`, or vice
/// versa, and the data family should not force a single ancestor.
pub trait HasMeta {
    /// The object's metadata block.
    fn meta(&self) -> &Meta;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hash::ContentHash;
    use crate::uri::{Namespace, SilanUri};
    use time::macros::datetime;

    /// A minimal stand-in proving the traits are object-safe and composable —
    /// the real implementors live in `silan-viking-content`.
    struct Probe {
        uri: SilanUri,
        meta: Meta,
    }

    impl Identified for Probe {
        fn uri(&self) -> &SilanUri {
            &self.uri
        }
    }

    impl HasMeta for Probe {
        fn meta(&self) -> &Meta {
            &self.meta
        }
    }

    #[test]
    fn a_type_can_implement_both_traits() {
        let probe = Probe {
            uri: SilanUri::new(Namespace::Resources, ["ideas".to_owned()]).expect("valid uri"),
            meta: Meta::new(ContentHash::of(b"x"), datetime!(2026-05-17 0:00 UTC)),
        };
        assert_eq!(probe.uri().namespace(), Namespace::Resources);
        assert_eq!(probe.meta().content_hash(), &ContentHash::of(b"x"));
    }

    #[test]
    fn traits_are_object_safe() {
        // If either trait were not object-safe this would not compile.
        fn _take(_: &dyn Identified, _: &dyn HasMeta) {}
    }
}
