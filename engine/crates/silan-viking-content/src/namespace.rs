//! `Namespace` — the two content namespaces.
//!
//! Per `docs/silan-viking/01` §1.2.1, `content/` is two independent content
//! trees under the `silan://` scheme:
//!
//! - [`ResourceNamespace`] — `silan://resources/`, published content.
//! - [`AgentNamespace`]    — `silan://agent/`, agent context, never published.
//!
//! The [`Namespace`] trait is the abstraction; `Workspace` holds one of each.
//! Two load-bearing invariants live here (§1.2.1):
//!
//! 1. `AgentNamespace::is_publishable()` is always `false` — the
//!    `SiteProjector` can never reach agent context.
//! 2. `accepts_direct_write()` decides how an agent edits: `resources/` is
//!    edited via proposals; `agent/` is written directly.

use silan_viking_base::{Namespace as UriNamespace, SilanUri};

/// One content tree under `silan://`.
///
/// Implemented by exactly two types. The trait exposes capability queries
/// (`is_publishable`, `accepts_direct_write`) rather than booleans on a
/// struct, so that "which namespace am I" and "what may I do" are answered
/// through one object.
pub trait Namespace {
    /// The root URI of this namespace (`silan://resources` or `silan://agent`).
    fn root_uri(&self) -> &SilanUri;

    /// The base-layer namespace tag this tree corresponds to.
    fn tag(&self) -> UriNamespace;

    /// Whether content in this namespace may be projected to the website.
    ///
    /// `true` for resources, `false` for agent — agent context never
    /// publishes (invariant 1).
    fn is_publishable(&self) -> bool;

    /// Whether an agent may write this namespace directly (vs. via a proposal).
    ///
    /// `false` for resources (proposals only), `true` for agent (invariant 2).
    fn accepts_direct_write(&self) -> bool;

    /// Whether a given URI belongs to this namespace.
    fn contains(&self, uri: &SilanUri) -> bool {
        uri.namespace() == self.tag()
    }
}

/// `silan://resources/` — published content (blog/ideas/projects/episode/
/// resume/moment).
///
/// Invariant: `is_publishable() == true` and `accepts_direct_write() == false`.
/// These are constants, not fields, so they cannot be misconfigured.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourceNamespace {
    root_uri: SilanUri,
}

impl ResourceNamespace {
    /// Construct the resources namespace. The root URI is fixed to
    /// `silan://resources`.
    pub fn new() -> Self {
        Self {
            // A bare namespace root with no path segments cannot fail to
            // construct; `new` with an empty segment list is always valid.
            root_uri: SilanUri::new(UriNamespace::Resources, std::iter::empty())
                .unwrap_or_else(|_| unreachable!("empty-segment root URI is always valid")),
        }
    }
}

impl Default for ResourceNamespace {
    fn default() -> Self {
        Self::new()
    }
}

impl Namespace for ResourceNamespace {
    fn root_uri(&self) -> &SilanUri {
        &self.root_uri
    }

    fn tag(&self) -> UriNamespace {
        UriNamespace::Resources
    }

    fn is_publishable(&self) -> bool {
        true
    }

    fn accepts_direct_write(&self) -> bool {
        false
    }
}

/// `silan://agent/` — agent context (project understanding, notes, owner
/// model, session summaries). Never published.
///
/// Invariant: `is_publishable() == false` and `accepts_direct_write() == true`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentNamespace {
    root_uri: SilanUri,
}

impl AgentNamespace {
    /// Construct the agent namespace. The root URI is fixed to `silan://agent`.
    pub fn new() -> Self {
        Self {
            root_uri: SilanUri::new(UriNamespace::Agent, std::iter::empty())
                .unwrap_or_else(|_| unreachable!("empty-segment root URI is always valid")),
        }
    }
}

impl Default for AgentNamespace {
    fn default() -> Self {
        Self::new()
    }
}

impl Namespace for AgentNamespace {
    fn root_uri(&self) -> &SilanUri {
        &self.root_uri
    }

    fn tag(&self) -> UriNamespace {
        UriNamespace::Agent
    }

    fn is_publishable(&self) -> bool {
        false
    }

    fn accepts_direct_write(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resources_is_publishable_and_proposal_only() {
        let ns = ResourceNamespace::new();
        assert!(ns.is_publishable());
        assert!(!ns.accepts_direct_write());
        assert_eq!(ns.root_uri().to_string(), "silan://resources");
    }

    #[test]
    fn agent_is_never_publishable_and_directly_writable() {
        let ns = AgentNamespace::new();
        assert!(
            !ns.is_publishable(),
            "invariant 1: agent context never publishes"
        );
        assert!(ns.accepts_direct_write());
        assert_eq!(ns.root_uri().to_string(), "silan://agent");
    }

    #[test]
    fn contains_matches_only_its_own_namespace() {
        let resources = ResourceNamespace::new();
        let agent = AgentNamespace::new();
        let resource_uri: SilanUri = "silan://resources/ideas/x".parse().expect("valid");
        let agent_uri: SilanUri = "silan://agent/notes/y".parse().expect("valid");

        assert!(resources.contains(&resource_uri));
        assert!(!resources.contains(&agent_uri));
        assert!(agent.contains(&agent_uri));
        assert!(!agent.contains(&resource_uri));
    }
}
