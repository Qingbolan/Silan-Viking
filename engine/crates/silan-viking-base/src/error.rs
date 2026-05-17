//! `BaseError` — the typed error for the L1 base layer.
//!
//! Per `docs/silan-viking/09` §9.1: every library crate (L1-L3) returns
//! `Result<T, ThisCrateError>` and never uses `anyhow`. Every variant carries
//! locatable, fixable information — there is no `Other(String)` escape hatch.

use thiserror::Error;

/// All ways a `silan-viking-base` value object can fail to be constructed or
/// parsed.
///
/// What it is NOT: it is not a catch-all for higher layers. `content` errors
/// belong in `ContentError`, parsing errors in `ParseError`. Each variant here
/// is raised by exactly one base value object.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum BaseError {
    /// A `silan://` URI string did not parse. `input` is the offending string;
    /// `reason` states the rule it broke (so the operator can fix it).
    #[error("invalid silan URI `{input}`: {reason}")]
    InvalidUri { input: String, reason: String },

    /// A slug string did not match `^[a-z0-9][a-z0-9-]*$`.
    #[error("invalid slug `{input}`: must match ^[a-z0-9][a-z0-9-]*$")]
    InvalidSlug { input: String },

    /// A language tag was empty or not a lowercase ASCII BCP-47-style tag.
    #[error("invalid language tag `{input}`: expected a lowercase tag like `en` or `zh-hans`")]
    InvalidLang { input: String },

    /// An `ItemId` / `PartId` string carried the wrong prefix or a malformed
    /// ULID body. `expected_prefix` is the prefix the caller required.
    #[error("invalid id `{input}`: expected prefix `{expected_prefix}` followed by a ULID")]
    InvalidId {
        input: String,
        expected_prefix: &'static str,
    },

    /// A content hash string was not the expected 16-char lowercase hex digest.
    #[error("invalid content hash `{input}`: expected a 16-char lowercase hex digest")]
    InvalidHash { input: String },

    /// Two content hashes were compared and found to differ — used by callers
    /// that assert a file has not changed.
    #[error("content hash mismatch: expected `{expected}`, found `{actual}`")]
    HashMismatch { expected: String, actual: String },
}
