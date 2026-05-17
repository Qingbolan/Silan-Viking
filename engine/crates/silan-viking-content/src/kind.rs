//! `ContentKind` — the closed set of the 6 content types.
//!
//! Per `docs/silan-viking/10` §10.4 there are exactly six content types, and
//! per `01` §1.5.0 the `ContentKind` is determined in `Workspace::scan` from
//! the `content/resources/{type}/` directory name — never guessed by a
//! parser. This enum is that closed set; a `match` on it is exhaustive, so
//! adding a seventh type is a compile error everywhere it must be handled.

use crate::error::ContentError;
use std::fmt;
use std::str::FromStr;

/// One of the 6 silan-viking content types.
///
/// Invariant: this set is closed. The `ParserRegistry` / `MapperRegistry`
/// dispatch on it exhaustively (`01` §1.5.0), so a new variant forces every
/// dispatch site to be updated before the code compiles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ContentKind {
    /// A half-formed thought being developed (`ideas/`).
    Idea,
    /// A written article / podcast / vlog / tutorial (`blog/`).
    Blog,
    /// A formed project with progress (`projects/`).
    Project,
    /// One episode of a container series (`episode/`).
    Episode,
    /// The owner's resume — a single Item with multiple Parts (`resume/`).
    Resume,
    /// A timestamped update / changelog entry (`update/`).
    Update,
}

impl ContentKind {
    /// Every variant, in a stable order — useful for iteration in tests and
    /// for building registries.
    pub const ALL: [ContentKind; 6] = [
        ContentKind::Idea,
        ContentKind::Blog,
        ContentKind::Project,
        ContentKind::Episode,
        ContentKind::Resume,
        ContentKind::Update,
    ];

    /// The `content/resources/{dir}/` directory name for this kind.
    ///
    /// `episode` is intentionally singular — it matches the on-disk layout
    /// in `10` §10.4.4.
    pub fn dir_name(self) -> &'static str {
        match self {
            ContentKind::Idea => "ideas",
            ContentKind::Blog => "blog",
            ContentKind::Project => "projects",
            ContentKind::Episode => "episode",
            ContentKind::Resume => "resume",
            ContentKind::Update => "update",
        }
    }

    /// The `kind` enum value used in frontmatter (`10` §10.4).
    ///
    /// This differs from [`dir_name`](Self::dir_name): the frontmatter `kind`
    /// is singular (`idea`), the directory is plural (`ideas`).
    pub fn frontmatter_value(self) -> &'static str {
        match self {
            ContentKind::Idea => "idea",
            ContentKind::Blog => "blog",
            ContentKind::Project => "project",
            ContentKind::Episode => "episode",
            ContentKind::Resume => "resume",
            ContentKind::Update => "update",
        }
    }

    /// Resolve a `content/resources/` directory name to a `ContentKind`.
    ///
    /// This is the dispatch source for `Workspace::scan` (`01` §1.5.0).
    /// Returns [`ContentError::UnknownContentKind`] for any other name.
    pub fn from_dir_name(name: &str) -> Result<Self, ContentError> {
        ContentKind::ALL
            .into_iter()
            .find(|k| k.dir_name() == name)
            .ok_or_else(|| ContentError::UnknownContentKind {
                name: name.to_owned(),
            })
    }

    /// Resolve a frontmatter `kind` value to a `ContentKind`.
    ///
    /// Used by the parser to self-check that the frontmatter `kind` agrees
    /// with the directory the Item was found in.
    pub fn from_frontmatter_value(value: &str) -> Result<Self, ContentError> {
        ContentKind::ALL
            .into_iter()
            .find(|k| k.frontmatter_value() == value)
            .ok_or_else(|| ContentError::UnknownContentKind {
                name: value.to_owned(),
            })
    }
}

impl fmt::Display for ContentKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.frontmatter_value())
    }
}

impl FromStr for ContentKind {
    type Err = ContentError;

    /// Parse from a frontmatter `kind` value.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_frontmatter_value(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_contains_six_distinct_kinds() {
        assert_eq!(ContentKind::ALL.len(), 6);
    }

    #[test]
    fn dir_name_resolves_back_to_the_kind() {
        for kind in ContentKind::ALL {
            assert_eq!(
                ContentKind::from_dir_name(kind.dir_name()).expect("known dir"),
                kind
            );
        }
    }

    #[test]
    fn frontmatter_value_resolves_back_to_the_kind() {
        for kind in ContentKind::ALL {
            assert_eq!(
                ContentKind::from_frontmatter_value(kind.frontmatter_value()).expect("known value"),
                kind
            );
        }
    }

    #[test]
    fn episode_directory_is_singular() {
        assert_eq!(ContentKind::Episode.dir_name(), "episode");
    }

    #[test]
    fn unknown_names_are_rejected() {
        assert!(ContentKind::from_dir_name("articles").is_err());
        assert!(ContentKind::from_frontmatter_value("note").is_err());
    }
}
