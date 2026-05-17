//! `ParseError` and `Issue` — the parser layer's error and diagnostic types.
//!
//! Per `docs/silan-viking/09` §9.1 and `10` §10.6, parsing distinguishes two
//! things:
//!
//! - [`ParseError`] — a hard failure that aborts parsing of the Item. Every
//!   variant names a locatable, fixable cause.
//! - [`Issue`] — a graded diagnostic (`fatal` / `warn` / `info`) collected by
//!   `Parser::validate`. A `fatal` Issue keeps the Item out of the `RowSet`;
//!   a `warn` / `info` Issue does not abort the sync.
//!
//! `ParseError` is for failures that prevent producing a `Parsed` at all
//! (malformed TOML, kind mismatch); `Issue` is for content that parsed but
//! violates the SCHEMA contract.

use silan_viking_content::{ContentError, ContentKind};
use thiserror::Error;

/// A hard parse failure for one Item.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ParseError {
    /// The frontmatter `kind` did not match the directory the Item was found
    /// in (`10` §10.6 `kind_mismatch`).
    #[error("kind mismatch: directory says `{expected}`, frontmatter says `{actual}`")]
    KindMismatch {
        expected: ContentKind,
        actual: ContentKind,
    },

    /// A required Part was absent (`10` §10.6 `missing_required_part`).
    #[error("item `{item}` is missing required part `{role}`")]
    MissingRequiredPart { item: String, role: String },

    /// A file's frontmatter or TOML body could not be parsed.
    #[error("malformed `{kind}` in `{location}`: {detail}")]
    Malformed {
        kind: &'static str,
        location: String,
        detail: String,
    },

    /// A Part with an `entry_list` / `key_value_list` shape had a body that
    /// was not valid TOML for that shape.
    #[error("malformed entry data in part `{role}` of `{item}`: {detail}")]
    MalformedEntries {
        item: String,
        role: String,
        detail: String,
    },

    /// A content-layer construction failed during parsing.
    #[error("content error while parsing `{item}`: {source}")]
    Content {
        item: String,
        #[source]
        source: ContentError,
    },
}

/// The severity of an [`Issue`] — the three levels of `SCHEMA.md` `errors`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Severity {
    /// Blocks the Item from the `RowSet`; `sync` reports and aborts.
    Fatal,
    /// Does not block; summarised at the end of `sync`.
    Warn,
    /// Recorded only; never affects `sync`.
    Info,
}

impl Severity {
    /// The wire string for this severity.
    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Fatal => "fatal",
            Severity::Warn => "warn",
            Severity::Info => "info",
        }
    }
}

/// A graded validation diagnostic produced by `Parser::validate`.
///
/// Each Issue carries a stable `rule` name (one of the `SCHEMA.md` `errors`
/// identifiers) so a caller can group or filter diagnostics without string
/// matching on the message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    severity: Severity,
    rule: &'static str,
    message: String,
}

impl Issue {
    /// Construct a `fatal` Issue for a named SCHEMA rule.
    pub fn fatal(rule: &'static str, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Fatal,
            rule,
            message: message.into(),
        }
    }

    /// Construct a `warn` Issue for a named SCHEMA rule.
    pub fn warn(rule: &'static str, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Warn,
            rule,
            message: message.into(),
        }
    }

    /// Construct an `info` Issue for a named SCHEMA rule.
    pub fn info(rule: &'static str, message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Info,
            rule,
            message: message.into(),
        }
    }

    /// The Issue's severity.
    pub fn severity(&self) -> Severity {
        self.severity
    }

    /// The `SCHEMA.md` rule name this Issue reports.
    pub fn rule(&self) -> &'static str {
        self.rule
    }

    /// The human-readable message.
    pub fn message(&self) -> &str {
        &self.message
    }

    /// Whether this Issue is fatal.
    pub fn is_fatal(&self) -> bool {
        self.severity == Severity::Fatal
    }
}

/// The policy that turns a set of [`Issue`]s into an abort decision.
///
/// Per `10` §10.6, a `fatal` Issue makes `sync` all-or-nothing for that Item.
pub struct IssuePolicy;

impl IssuePolicy {
    /// Whether any Issue in the slice is fatal.
    pub fn has_fatal(issues: &[Issue]) -> bool {
        issues.iter().any(Issue::is_fatal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severity_orders_fatal_first() {
        assert!(Severity::Fatal < Severity::Warn);
        assert!(Severity::Warn < Severity::Info);
    }

    #[test]
    fn issue_policy_detects_a_fatal_issue() {
        let issues = vec![
            Issue::warn("empty_optional_part_dir", "x"),
            Issue::fatal("missing_required_part", "y"),
        ];
        assert!(IssuePolicy::has_fatal(&issues));
    }

    #[test]
    fn issue_policy_passes_when_no_fatal() {
        let issues = vec![Issue::info("canonical_lang_only", "x")];
        assert!(!IssuePolicy::has_fatal(&issues));
    }
}
