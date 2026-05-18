//! `Part` — a semantic section of an Item, plus its `PartRole` and `PartShape`.
//!
//! Per `docs/silan-viking/01` §1.3, **`Part == Identity`**: a Part owns a
//! stable `PartId` written into `meta.toml`, so a rename or move of its
//! files never breaks the identity chain. `role` is its semantic *type*
//! (`overview`, `progress`, …); the identity is the `PartId`, not the role
//! and not the filename.
//!
//! A Part contains several [`File`]s — the same semantic section in different
//! languages. Their language relationship is established by **sharing one
//! Part directory**, never by filename-stem similarity (§1.3, the炸点 list).

use crate::file::File;
use silan_viking_base::{Lang, PartId};
use std::fmt;

/// The on-disk shape of a Part's language files (per `10` §10.4.5).
///
/// The shape decides the file extension and the parsing strategy:
/// `Prose` files are `<lang>.md`; `EntryList` and `KeyValueList` files are
/// `<lang>.toml`. Only `resume` uses the two TOML shapes — every Part of
/// `blog` / `idea` / `project` / `episode` / `update` is `Prose`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PartShape {
    /// Free markdown prose — `<lang>.md`. Lands in `item_part`.
    Prose,
    /// An ordered list of homogeneous entries — `<lang>.toml` as TOML
    /// array-of-tables. Lands in `part_entry`.
    EntryList,
    /// A categorised key/value list (skills) — `<lang>.toml` with top-level
    /// category keys. Lands in `part_entry`.
    KeyValueList,
}

impl PartShape {
    /// The language-file extension for this shape (no leading dot).
    pub fn file_extension(self) -> &'static str {
        match self {
            PartShape::Prose => "md",
            PartShape::EntryList | PartShape::KeyValueList => "toml",
        }
    }

    /// Whether files of this shape carry a markdown body (vs. structured TOML).
    pub fn is_prose(self) -> bool {
        matches!(self, PartShape::Prose)
    }

    /// The shape's name as it appears in `SCHEMA.md` and `meta.toml` — the
    /// inverse of the schema parser's `parse_shape`. A single source of truth
    /// for the string, so a `meta.toml` written by the engine round-trips.
    pub fn schema_name(self) -> &'static str {
        match self {
            PartShape::Prose => "prose",
            PartShape::EntryList => "entry_list",
            PartShape::KeyValueList => "key_value_list",
        }
    }
}

/// The semantic role of a Part — its `meta.toml` `type` and the SCHEMA
/// `role` (`overview`, `body`, `education`, …).
///
/// Invariant: a role is non-empty. It is a thin newtype rather than an enum
/// because the set of roles is configuration-driven in `SCHEMA.md` (`01`
/// §1.3.1) — adding a tab must not require a Rust change.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct PartRole(String);

impl PartRole {
    /// Construct a role from a SCHEMA `role` string.
    ///
    /// An empty string is coerced to `"unknown"` rather than panicking — a
    /// malformed role surfaces later as a validation `Issue`, not a crash, so
    /// the L2 layer stays panic-free.
    pub fn new(role: impl Into<String>) -> Self {
        let role = role.into();
        if role.is_empty() {
            Self("unknown".to_owned())
        } else {
            Self(role)
        }
    }

    /// The role as a string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for PartRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// A semantic section of an Item — one front-end tab.
///
/// Invariant 1: `id` is stable for the Part's lifetime; it is never derived
///   from `role` or from a filename.
/// Invariant 2: every [`File`] in `files` is a distinct language variant of
///   *this* Part — the constructor does not enforce uniqueness of `Lang`
///   (that is a validation concern, raised as an `Issue` by the L3 parser),
///   but the domain meaning is "one section, N languages".
/// Invariant 3: `shape` is fixed at construction and dictates how every
///   `File` under this Part is interpreted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Part {
    id: PartId,
    role: PartRole,
    shape: PartShape,
    canonical_lang: Lang,
    files: Vec<File>,
}

impl Part {
    /// Construct a Part from its identity, role, shape, canonical language,
    /// and language files.
    pub fn new(
        id: PartId,
        role: PartRole,
        shape: PartShape,
        canonical_lang: Lang,
        files: Vec<File>,
    ) -> Self {
        Self {
            id,
            role,
            shape,
            canonical_lang,
            files,
        }
    }

    /// The Part's stable identity.
    pub fn id(&self) -> &PartId {
        &self.id
    }

    /// The Part's semantic role.
    pub fn role(&self) -> &PartRole {
        &self.role
    }

    /// The Part's on-disk shape.
    pub fn shape(&self) -> PartShape {
        self.shape
    }

    /// The language designated as the source of language-neutral fields.
    pub fn canonical_lang(&self) -> &Lang {
        &self.canonical_lang
    }

    /// The Part's language files, in the order they were supplied.
    pub fn files(&self) -> &[File] {
        &self.files
    }

    /// The file for a specific language, if present.
    pub fn file_for(&self, lang: &Lang) -> Option<&File> {
        self.files.iter().find(|f| f.lang() == lang)
    }

    /// The file in the canonical language, if present. This is where the
    /// parser reads language-neutral fields from (`01` §1.3.1).
    pub fn canonical_file(&self) -> Option<&File> {
        self.file_for(&self.canonical_lang)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use silan_viking_base::ContentHash;

    fn lang(tag: &str) -> Lang {
        Lang::new(tag).expect("valid lang")
    }

    fn file(tag: &str, body: &str) -> File {
        File::new(lang(tag), body.to_owned(), ContentHash::of(body.as_bytes()))
    }

    #[test]
    fn shape_dictates_extension() {
        assert_eq!(PartShape::Prose.file_extension(), "md");
        assert_eq!(PartShape::EntryList.file_extension(), "toml");
        assert_eq!(PartShape::KeyValueList.file_extension(), "toml");
    }

    #[test]
    fn part_role_coerces_empty_to_unknown() {
        assert_eq!(PartRole::new("").as_str(), "unknown");
        assert_eq!(PartRole::new("overview").as_str(), "overview");
    }

    #[test]
    fn part_resolves_files_by_language() {
        let part = Part::new(
            PartId::generate(),
            PartRole::new("progress"),
            PartShape::Prose,
            lang("en"),
            vec![file("en", "english"), file("zh", "中文")],
        );
        assert_eq!(part.files().len(), 2);
        assert_eq!(part.file_for(&lang("zh")).map(File::body), Some("中文"));
        assert_eq!(part.canonical_file().map(File::body), Some("english"));
        assert!(part.file_for(&lang("fr")).is_none());
    }
}
