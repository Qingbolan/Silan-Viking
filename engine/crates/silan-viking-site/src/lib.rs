//! `silan-viking-site` — M9 website projection, crawler artifacts, and the
//! deploy promote job.
//!
//! - [`SiteProjector`] / [`SeoEmitter`] — project content into sitemap /
//!   robots / JSON-LD crawler artifacts.
//! - [`promote`] — the `08` §8.3 deploy promote: replace the live database's
//!   derived tables transactionally, leaving runtime data untouched.

pub mod promote;

pub use promote::{promote, PromoteError, PromoteReport, DERIVED_TABLES, RUNTIME_TABLES};

use serde::Serialize;
use silan_viking_app::{QueryDocument, Workspace};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// A projected public page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SitePage {
    /// Source `silan://` URI.
    pub source_uri: String,
    /// Public URL path.
    pub path: String,
    /// SEO title.
    pub title: String,
}

/// Output report for `silan site build`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SiteBuildReport {
    /// Number of pages projected.
    pub pages: usize,
    /// Generated artifact paths.
    pub artifacts: Vec<PathBuf>,
}

/// Site projection errors.
#[derive(Debug, Error)]
pub enum SiteError {
    /// Workspace failed.
    #[error("{0}")]
    Workspace(String),
    /// IO failed.
    #[error("{0}")]
    Io(String),
}

/// Projects content items into crawlable artifacts.
pub struct SiteProjector {
    base_url: String,
}

impl SiteProjector {
    /// Create a projector for a public base URL.
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into().trim_end_matches('/').to_owned(),
        }
    }

    /// Build sitemap, robots, and JSON-LD metadata into `out_dir`.
    pub fn build(&self, content_root: &Path, out_dir: &Path) -> Result<SiteBuildReport, SiteError> {
        let ws = Workspace::open(content_root).map_err(|e| SiteError::Workspace(e.to_string()))?;
        let index = ws
            .query_index()
            .map_err(|e| SiteError::Workspace(e.to_string()))?;
        let pages = index
            .documents()
            .iter()
            .map(page_from_document)
            .collect::<Vec<_>>();

        fs::create_dir_all(out_dir).map_err(|e| SiteError::Io(e.to_string()))?;
        let sitemap = out_dir.join("sitemap.xml");
        let robots = out_dir.join("robots.txt");
        let jsonld = out_dir.join("site-index.jsonld");

        fs::write(&sitemap, self.sitemap(&pages)).map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&robots, self.robots()).map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&jsonld, SeoEmitter::json_ld(&self.base_url, &pages))
            .map_err(|e| SiteError::Io(e.to_string()))?;

        Ok(SiteBuildReport {
            pages: pages.len(),
            artifacts: vec![sitemap, robots, jsonld],
        })
    }

    fn sitemap(&self, pages: &[SitePage]) -> String {
        let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        for page in pages {
            xml.push_str("  <url><loc>");
            xml.push_str(&self.base_url);
            xml.push_str(&page.path);
            xml.push_str("</loc></url>\n");
        }
        xml.push_str("</urlset>\n");
        xml
    }

    fn robots(&self) -> String {
        format!(
            "User-agent: *\nAllow: /\nSitemap: {}/sitemap.xml\n",
            self.base_url
        )
    }
}

/// Emits crawler metadata.
pub struct SeoEmitter;

impl SeoEmitter {
    /// A compact JSON-LD graph.
    pub fn json_ld(base_url: &str, pages: &[SitePage]) -> String {
        let nodes = pages
            .iter()
            .map(|page| {
                format!(
                    "{{\"@type\":\"WebPage\",\"@id\":\"{}{}\",\"name\":{}}}",
                    base_url.trim_end_matches('/'),
                    page.path,
                    json_string(&page.title)
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        format!("{{\"@context\":\"https://schema.org\",\"@graph\":[{nodes}]}}\n")
    }
}

fn page_from_document(doc: &QueryDocument) -> SitePage {
    let kind = doc.kind.dir_name();
    SitePage {
        source_uri: doc.uri.clone(),
        path: format!("/{kind}/{}", doc.slug),
        title: doc.title.clone(),
    }
}

fn json_string(raw: &str) -> String {
    let escaped = raw
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_ld_escapes_titles() {
        let pages = vec![SitePage {
            source_uri: "silan://resources/blog/x".to_owned(),
            path: "/blog/x".to_owned(),
            title: "A \"quoted\" title".to_owned(),
        }];
        let json = SeoEmitter::json_ld("https://silan.tech", &pages);
        assert!(json.contains("A \\\"quoted\\\" title"));
    }
}
