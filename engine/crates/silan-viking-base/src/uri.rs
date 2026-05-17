//! `SilanUri` — the `silan://` content address.
//!
//! Every addressable thing in silan-viking has a `SilanUri`. The scheme is
//! `silan://`, the authority is one of two namespaces, and the path locates
//! a Collection / Item / Part within it:
//!
//! ```text
//!   silan://resources/ideas/rust-context-engine
//!   silan://resources/ideas/rust-context-engine/overview      (a Part)
//!   silan://agent/notes/2026-recap
//! ```
//!
//! This is an L1 value object: it only parses and renders the address. It
//! does not know whether the target exists — that is the content layer's job.

use crate::error::BaseError;
use std::fmt;
use std::str::FromStr;

/// The fixed `silan://` scheme prefix.
const SCHEME: &str = "silan://";

/// The two content namespaces (per `docs/silan-viking/01` §1.2.1).
///
/// A namespace is the authority component of a `SilanUri`. The publishability
/// and direct-write rules live on the L2 `Namespace` trait; this enum is just
/// the L1 name, so the URI parser can validate the authority without knowing
/// those rules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Namespace {
    /// `silan://resources/` — published content.
    Resources,
    /// `silan://agent/` — agent context, never published.
    Agent,
}

impl Namespace {
    /// The authority string as it appears in a URI.
    pub fn as_str(self) -> &'static str {
        match self {
            Namespace::Resources => "resources",
            Namespace::Agent => "agent",
        }
    }

    /// Parse a namespace authority string.
    fn parse(raw: &str) -> Option<Self> {
        match raw {
            "resources" => Some(Namespace::Resources),
            "agent" => Some(Namespace::Agent),
            _ => None,
        }
    }
}

impl fmt::Display for Namespace {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A parsed `silan://` URI.
///
/// Invariant 1: `namespace` is always one of the two known namespaces — an
///   unknown authority is rejected at parse time.
/// Invariant 2: `segments` never contains an empty string and never contains
///   a `/` — the parser splits on `/` and rejects empty segments, so the URI
///   re-renders to exactly the string it was parsed from.
/// Invariant 3: `segments` may be empty, denoting the namespace root
///   (`silan://resources`).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SilanUri {
    namespace: Namespace,
    segments: Vec<String>,
}

impl SilanUri {
    /// Build a URI from a namespace and its path segments.
    ///
    /// Returns [`BaseError::InvalidUri`] if any segment is empty or contains a
    /// `/`, since such a value could not be parsed back.
    pub fn new(
        namespace: Namespace,
        segments: impl IntoIterator<Item = String>,
    ) -> Result<Self, BaseError> {
        let segments: Vec<String> = segments.into_iter().collect();
        for segment in &segments {
            if segment.is_empty() || segment.contains('/') {
                return Err(BaseError::InvalidUri {
                    input: segments.join("/"),
                    reason: format!("path segment `{segment}` is empty or contains `/`"),
                });
            }
        }
        Ok(Self {
            namespace,
            segments,
        })
    }

    /// The namespace (authority) of this URI.
    pub fn namespace(&self) -> Namespace {
        self.namespace
    }

    /// The path segments below the namespace, in order.
    pub fn segments(&self) -> &[String] {
        &self.segments
    }

    /// The last path segment, if any — typically the Item slug or Part role.
    pub fn last_segment(&self) -> Option<&str> {
        self.segments.last().map(String::as_str)
    }

    /// Append a segment, returning a new URI (the receiver is unchanged).
    ///
    /// Used to descend from an Item URI to one of its Part URIs.
    pub fn child(&self, segment: impl Into<String>) -> Result<Self, BaseError> {
        let mut segments = self.segments.clone();
        segments.push(segment.into());
        Self::new(self.namespace, segments)
    }
}

impl FromStr for SilanUri {
    type Err = BaseError;

    /// Parse a `silan://namespace/seg/seg/...` string.
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let rest = s
            .strip_prefix(SCHEME)
            .ok_or_else(|| BaseError::InvalidUri {
                input: s.to_owned(),
                reason: format!("must start with `{SCHEME}`"),
            })?;

        let mut parts = rest.splitn(2, '/');
        let authority = parts.next().unwrap_or_default();
        let namespace = Namespace::parse(authority).ok_or_else(|| BaseError::InvalidUri {
            input: s.to_owned(),
            reason: format!("unknown namespace `{authority}`; expected `resources` or `agent`"),
        })?;

        let segments: Vec<String> = match parts.next() {
            // A trailing `silan://resources` with no path is the namespace root.
            None | Some("") => Vec::new(),
            Some(path) => path.split('/').map(str::to_owned).collect(),
        };

        Self::new(namespace, segments)
    }
}

impl fmt::Display for SilanUri {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{SCHEME}{}", self.namespace)?;
        for segment in &self.segments {
            write!(f, "/{segment}")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_full_item_uri() {
        let uri: SilanUri = "silan://resources/ideas/rust-context-engine"
            .parse()
            .expect("valid uri");
        assert_eq!(uri.namespace(), Namespace::Resources);
        assert_eq!(uri.segments(), ["ideas", "rust-context-engine"]);
        assert_eq!(uri.last_segment(), Some("rust-context-engine"));
    }

    #[test]
    fn parses_the_agent_namespace() {
        let uri: SilanUri = "silan://agent/notes/recap".parse().expect("valid uri");
        assert_eq!(uri.namespace(), Namespace::Agent);
    }

    #[test]
    fn parses_a_bare_namespace_root() {
        let uri: SilanUri = "silan://resources".parse().expect("valid uri");
        assert!(uri.segments().is_empty());
    }

    #[test]
    fn rejects_wrong_scheme_and_unknown_namespace() {
        assert!("https://resources/x".parse::<SilanUri>().is_err());
        assert!("silan://unknown/x".parse::<SilanUri>().is_err());
    }

    #[test]
    fn rejects_empty_path_segments() {
        // The double slash yields an empty segment.
        assert!("silan://resources/ideas//x".parse::<SilanUri>().is_err());
    }

    #[test]
    fn round_trips_through_display() {
        let text = "silan://resources/ideas/rust-context-engine/overview";
        let uri: SilanUri = text.parse().expect("valid uri");
        assert_eq!(uri.to_string(), text);
    }

    #[test]
    fn child_descends_one_segment() {
        let item: SilanUri = "silan://resources/ideas/rce".parse().expect("valid");
        let part = item.child("overview").expect("valid child");
        assert_eq!(part.to_string(), "silan://resources/ideas/rce/overview");
    }
}
