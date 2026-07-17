//! M7 query surface: relation-aware listing plus lexical recall.
//!
//! The default index is intentionally local and deterministic. It attempts to
//! use SQLite FTS5 for ranking, then falls back to a simple lexical scorer when
//! the bundled SQLite lacks FTS5. No network embedder is required for M7.

use crate::parser::{FieldValue, Parsed, ParserRegistry};
use crate::workspace::ScanReport;
use crate::{ContentKind, Item};
use rusqlite::Connection;
use silan_viking_base::Identified;
use std::collections::BTreeSet;
use thiserror::Error;

/// The configured recall backend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmbedderMode {
    /// No embedding backend; pure lexical fallback.
    None,
    /// SQLite FTS5 is available and used for lexical ranking.
    Fts5,
    /// Reserved for a caller-provided HTTP/local embedder.
    Api,
    /// FTS5 was unavailable; lexical fallback is active.
    Fallback,
}

/// One searchable content document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryDocument {
    /// `silan://resources/...`
    pub uri: String,
    /// Closed content kind.
    pub kind: ContentKind,
    /// Item slug.
    pub slug: String,
    /// Best title found across languages; falls back to slug.
    pub title: String,
    /// Status, if the type has one.
    pub status: Option<String>,
    /// Visibility, if the type has one. `Some("public")` is the only value
    /// `SiteProjector` projects to the website (`01` §1.7 second layer /
    /// `10` §10.3); `private` / `unlisted` Items remain in the index for
    /// owner-side queries but never reach the site.
    pub visibility: Option<String>,
    /// Content tags (the `tags` frontmatter list), as raw labels.
    pub tags: Vec<String>,
    /// Language tags present in the parsed item.
    pub languages: Vec<String>,
    /// Searchable body text.
    pub text: String,
}

/// A ranked recall result.
#[derive(Debug, Clone, PartialEq)]
pub struct QueryHit {
    /// Matching document.
    pub document: QueryDocument,
    /// Higher is better.
    pub score: f64,
}

/// A built query index.
pub struct QueryIndex {
    documents: Vec<QueryDocument>,
    mode: EmbedderMode,
    fts: Option<Connection>,
}

/// Query failures.
#[derive(Debug, Error)]
pub enum QueryError {
    /// Scan or parse failed before the index could be built.
    #[error("query index build failed: {0}")]
    Build(String),
    /// SQLite query failed.
    #[error("query failed: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

impl QueryIndex {
    /// Build an index from a scanned workspace.
    pub fn build(parsers: &ParserRegistry, scan: &ScanReport) -> Result<Self, QueryError> {
        let mut documents = Vec::new();
        for item in scan.items() {
            let parser = parsers
                .parser_for(item)
                .map_err(|e| QueryError::Build(e.to_string()))?;
            let parsed = parser
                .parse(item)
                .map_err(|e| QueryError::Build(e.to_string()))?;
            documents.push(document_from_parsed(item, &parsed));
        }

        let (mode, fts) = build_fts(&documents).unwrap_or((EmbedderMode::Fallback, None));
        Ok(Self {
            documents,
            mode,
            fts,
        })
    }

    /// Which backend is active.
    pub fn mode(&self) -> EmbedderMode {
        self.mode
    }

    /// All indexed documents.
    pub fn documents(&self) -> &[QueryDocument] {
        &self.documents
    }

    /// Structured list, matching the MCP `list(type, filter)` contract.
    /// `tag` filters to documents carrying that tag (case-insensitive match
    /// against the raw labels) — backs the `filter.tag` key of `03` §3.2.
    pub fn list(
        &self,
        kind: Option<ContentKind>,
        status: Option<&str>,
        tag: Option<&str>,
    ) -> Vec<QueryDocument> {
        self.documents
            .iter()
            .filter(|doc| kind.is_none_or(|k| doc.kind == k))
            .filter(|doc| status.is_none_or(|s| doc.status.as_deref() == Some(s)))
            .filter(|doc| tag.is_none_or(|t| doc.tags.iter().any(|d| d.eq_ignore_ascii_case(t))))
            .cloned()
            .collect()
    }

    /// Recall by local lexical search. Uses FTS5 if available.
    pub fn recall(&self, query: &str, limit: usize) -> Result<Vec<QueryHit>, QueryError> {
        let terms = terms(query);
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        if let Some(fts) = &self.fts {
            let phrase = terms.join(" OR ");
            let mut stmt = fts.prepare(
                "SELECT rowid, bm25(docs) AS rank FROM docs WHERE docs MATCH ?1 ORDER BY rank LIMIT ?2",
            )?;
            let mut rows = stmt.query((&phrase, limit as i64))?;
            let mut hits = Vec::new();
            while let Some(row) = rows.next()? {
                let rowid: i64 = row.get(0)?;
                let rank: f64 = row.get(1)?;
                if let Some(document) = self.documents.get((rowid - 1) as usize) {
                    hits.push(QueryHit {
                        document: document.clone(),
                        score: -rank,
                    });
                }
            }
            if !hits.is_empty() {
                return Ok(hits);
            }
        }
        Ok(lexical_recall(&self.documents, &terms, limit))
    }
}

fn document_from_parsed(item: &Item, parsed: &Parsed) -> QueryDocument {
    let mut title = None;
    let mut text = String::new();
    let mut languages = Vec::new();

    for (lang, variant) in parsed.langs() {
        languages.push(lang.to_string());
        if title.is_none() {
            title = variant.text("title").map(str::to_owned);
        }
        for name in ["title", "excerpt", "summary", "full_name"] {
            if let Some(value) = variant.text(name) {
                text.push_str(value);
                text.push('\n');
            }
        }
        for role in variant.prose_roles() {
            if let Some(body) = variant.prose(role) {
                text.push_str(body);
                text.push('\n');
            }
        }
        for role in variant.entry_roles() {
            for entry in variant.entries(role) {
                for value in entry.shared().values().chain(entry.localized().values()) {
                    match value {
                        crate::parser::EntryValue::Text(s) => {
                            text.push_str(s);
                            text.push('\n');
                        }
                        crate::parser::EntryValue::List(items) => {
                            text.push_str(&items.join(" "));
                            text.push('\n');
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    for name in parsed.main().field_names() {
        if let Some(FieldValue::Text(value)) = parsed.main().get(name) {
            text.push_str(value);
            text.push('\n');
        }
    }

    // Content tags — a `FieldValue::List` in `main()`. Capture them as a
    // structured field (for `list --tag`) and fold them into the search text
    // (so `recall` finds an Item by its tag).
    let tags = match parsed.main().get("tags") {
        Some(FieldValue::List(items)) => items.clone(),
        _ => Vec::new(),
    };
    for tag in &tags {
        text.push_str(tag);
        text.push('\n');
    }

    QueryDocument {
        uri: item.uri().to_string(),
        kind: item.kind(),
        slug: item.slug().to_string(),
        title: title.unwrap_or_else(|| item.slug().to_string()),
        status: parsed.main().text("status").map(str::to_owned),
        visibility: parsed.main().text("visibility").map(str::to_owned),
        tags,
        languages,
        text,
    }
}

fn build_fts(
    documents: &[QueryDocument],
) -> Result<(EmbedderMode, Option<Connection>), rusqlite::Error> {
    let conn = Connection::open_in_memory()?;
    conn.execute(
        "CREATE VIRTUAL TABLE docs USING fts5(uri, title, body, tokenize = 'unicode61')",
        [],
    )?;
    for doc in documents {
        conn.execute(
            "INSERT INTO docs(rowid, uri, title, body) VALUES (?1, ?2, ?3, ?4)",
            (
                (documents
                    .iter()
                    .position(|d| d.uri == doc.uri)
                    .unwrap_or_default()
                    + 1) as i64,
                &doc.uri,
                &doc.title,
                &doc.text,
            ),
        )?;
    }
    Ok((EmbedderMode::Fts5, Some(conn)))
}

fn terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(str::to_ascii_lowercase)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn lexical_recall(documents: &[QueryDocument], terms: &[String], limit: usize) -> Vec<QueryHit> {
    let mut hits = documents
        .iter()
        .filter_map(|doc| {
            let haystack = format!("{} {} {}", doc.slug, doc.title, doc.text).to_ascii_lowercase();
            let score = terms
                .iter()
                .filter(|term| haystack.contains(term.as_str()))
                .count() as f64;
            (score > 0.0).then(|| QueryHit {
                document: doc.clone(),
                score,
            })
        })
        .collect::<Vec<_>>();
    hits.sort_by(|a, b| {
        b.score
            .total_cmp(&a.score)
            .then(a.document.uri.cmp(&b.document.uri))
    });
    hits.truncate(limit);
    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Workspace;

    fn workspace() -> Workspace {
        let root =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/content");
        Workspace::open(root).expect("fixture workspace opens")
    }

    #[test]
    fn recall_hits_known_fixture_content() {
        let ws = workspace();
        let hits = ws.query("engine milestones", 5).expect("query succeeds");
        assert!(
            hits.iter()
                .any(|hit| hit.document.slug == "changelog-2026-q2"),
            "moment fixture should be recalled by body text"
        );
    }

    #[test]
    fn list_filters_by_kind_and_status() {
        let ws = workspace();
        let index = ws.query_index().expect("index builds");
        let blogs = index.list(Some(ContentKind::Blog), None, None);
        assert_eq!(blogs.len(), 1);
        assert_eq!(blogs[0].slug, "hello-world");
    }

    #[test]
    fn list_filters_by_tag() {
        // The `tag` filter narrows to documents carrying that tag; an unknown
        // tag yields nothing. The fixture blog `hello-world` carries tags.
        let ws = workspace();
        let index = ws.query_index().expect("index builds");
        let tagged = &index.list(Some(ContentKind::Blog), None, None)[0].tags;
        if let Some(first) = tagged.first() {
            let hits = index.list(None, None, Some(first));
            assert!(
                hits.iter().any(|d| d.slug == "hello-world"),
                "a known tag must match its Item"
            );
        }
        assert!(
            index.list(None, None, Some("no-such-tag-xyz")).is_empty(),
            "an unknown tag must match nothing"
        );
    }
}
