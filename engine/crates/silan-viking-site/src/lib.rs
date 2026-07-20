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
use std::collections::BTreeMap;
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

/// A browser-route snapshot that can be injected into Vite HTML for crawlers
/// that fetch markup but do not execute the React bundle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CrawlerRoute {
    /// Public route path, always slash-prefixed.
    pub path: String,
    /// Absolute public URL.
    pub url: String,
    /// Route title.
    pub title: String,
    /// Source `silan://` URIs folded into this route.
    pub source_uris: Vec<String>,
    /// Union of public content tags on this route.
    pub tags: Vec<String>,
    /// Searchable route text.
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct CrawlerManifest {
    routes: Vec<CrawlerRoute>,
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

    /// Build sitemap, robots, JSON-LD, machine-readable text, and crawler
    /// route snapshots into `out_dir`.
    ///
    /// Only Items with `visibility = "public"` are projected (`01` §1.7
    /// second layer / `10` §10.3). Drafts and unlisted Items stay in the
    /// content tree and in the local index — they are just hidden from the
    /// outward face. Without this filter the sitemap leaks every draft URL
    /// to crawlers, which is the breach the 2026-05-21 e2e pass surfaced.
    pub fn build(&self, content_root: &Path, out_dir: &Path) -> Result<SiteBuildReport, SiteError> {
        let ws = Workspace::open(content_root).map_err(|e| SiteError::Workspace(e.to_string()))?;
        let index = ws
            .query_index()
            .map_err(|e| SiteError::Workspace(e.to_string()))?;
        let public_docs = index
            .documents()
            .iter()
            .filter(|doc| doc.visibility.as_deref() == Some("public"))
            .cloned()
            .collect::<Vec<_>>();
        let routes = self.crawler_routes(&public_docs);
        let pages = routes
            .iter()
            .map(|route| SitePage {
                source_uri: route.source_uris.join(" "),
                path: route.path.clone(),
                title: route.title.clone(),
            })
            .collect::<Vec<_>>();

        fs::create_dir_all(out_dir).map_err(|e| SiteError::Io(e.to_string()))?;
        let sitemap = out_dir.join("sitemap.xml");
        let robots = out_dir.join("robots.txt");
        let jsonld = out_dir.join("site-index.jsonld");
        let about = out_dir.join("about.txt");
        let llms = out_dir.join("llms.txt");
        let crawler_manifest = out_dir.join("site-crawler-routes.json");

        fs::write(&sitemap, self.sitemap(&pages)).map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&robots, self.robots()).map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&jsonld, SeoEmitter::json_ld(&self.base_url, &pages))
            .map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&about, self.about_text(&routes)).map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&llms, self.llms_text(&routes)).map_err(|e| SiteError::Io(e.to_string()))?;
        let manifest = CrawlerManifest { routes };
        let manifest_json =
            serde_json::to_string_pretty(&manifest).map_err(|e| SiteError::Io(e.to_string()))?;
        fs::write(&crawler_manifest, format!("{manifest_json}\n"))
            .map_err(|e| SiteError::Io(e.to_string()))?;

        Ok(SiteBuildReport {
            pages: pages.len(),
            artifacts: vec![sitemap, robots, jsonld, about, llms, crawler_manifest],
        })
    }

    fn crawler_routes(&self, documents: &[QueryDocument]) -> Vec<CrawlerRoute> {
        let mut routes = BTreeMap::<String, CrawlerRoute>::new();

        for doc in documents {
            let path = public_path(doc);
            let route = routes.entry(path.clone()).or_insert_with(|| CrawlerRoute {
                url: format!("{}{}", self.base_url, path),
                title: route_title(doc),
                path,
                source_uris: Vec::new(),
                tags: Vec::new(),
                text: String::new(),
            });
            route.source_uris.push(doc.uri.clone());
            for tag in &doc.tags {
                if !route.tags.iter().any(|existing| existing == tag) {
                    route.tags.push(tag.clone());
                }
            }
            if !route.text.is_empty() {
                route.text.push_str("\n\n");
            }
            if route.source_uris.len() > 1 {
                route.text.push_str(&format!("## {}\n\n", doc.title));
            }
            route.text.push_str(&normalize_text(&doc.text));
        }

        routes.into_values().collect()
    }

    fn about_text(&self, routes: &[CrawlerRoute]) -> String {
        let mut lines = vec![
            "Silan Hu — AI Systems Researcher & Full Stack Developer".to_owned(),
            String::new(),
            format!("Canonical site: {}", self.base_url),
            format!("Machine-readable context: {}/llms.txt", self.base_url),
            String::new(),
            "Canonical identity: Silan Hu. Accepted aliases: Silan.Hu, Hu Silan, 胡思蓝. Chinese name: 胡思蓝. Avoid incorrect variants: 胡思澜, 胡司兰.".to_owned(),
            String::new(),
        ];
        append_route_summaries(&mut lines, routes);
        format!("{}\n", lines.join("\n").trim())
    }

    fn llms_text(&self, routes: &[CrawlerRoute]) -> String {
        let mut lines = vec![
            "# Silan Hu".to_owned(),
            String::new(),
            "Personal website for Silan Hu: AI systems research, full-stack engineering, and executable agent infrastructure.".to_owned(),
            String::new(),
            format!("Canonical site: {}", self.base_url),
            format!("Sitemap: {}/sitemap.xml", self.base_url),
            String::new(),
            "## Public Content".to_owned(),
            String::new(),
        ];
        append_route_summaries(&mut lines, routes);
        format!("{}\n", lines.join("\n").trim())
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
            "{}\
             Sitemap: {}/sitemap.xml\n",
            [
                "*",
                "ClaudeBot",
                "Claude-User",
                "Claude-SearchBot",
                "Claude-Code",
                "claude-code",
                "Claude-Web",
                "anthropic-ai",
            ]
            .iter()
            .map(|agent| format!(
                "User-agent: {agent}\n\
                 Allow: /\n\
                 Disallow: /api/v1/stats/snapshot\n\
                 Disallow: /api/v1/stats/bots\n\
                 Disallow: /api/v1/stats/crawlers\n\
                 Disallow: /api/v1/stats/sources\n\
                 Disallow: /api/v1/stats/visitors\n\
                 Disallow: /api/v1/content/status\n\
                 Disallow: /api/v1/auth/\n\n",
            ))
            .collect::<String>(),
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

fn public_path(doc: &QueryDocument) -> String {
    match doc.kind {
        silan_viking_app::ContentKind::Resume => "/".to_owned(),
        silan_viking_app::ContentKind::Moment => "/moments/".to_owned(),
        silan_viking_app::ContentKind::Episode => format!("/episodes/{}/", doc.slug),
        silan_viking_app::ContentKind::Blog => format!("/blog/{}/", doc.slug),
        silan_viking_app::ContentKind::Project => format!("/projects/{}/", doc.slug),
        silan_viking_app::ContentKind::Idea => format!("/ideas/{}/", doc.slug),
    }
}

fn route_title(doc: &QueryDocument) -> String {
    match doc.kind {
        silan_viking_app::ContentKind::Moment => "Moments".to_owned(),
        _ => doc.title.clone(),
    }
}

fn normalize_text(raw: &str) -> String {
    raw.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn append_route_summaries(lines: &mut Vec<String>, routes: &[CrawlerRoute]) {
    for route in routes {
        lines.push(format!("## {}", route.title));
        lines.push(format!("URL: {}", route.url));
        if !route.tags.is_empty() {
            lines.push(format!("Tags: {}", route.tags.join(", ")));
        }
        lines.push(String::new());
        lines.push(route.text.clone());
        lines.push(String::new());
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
    use std::collections::BTreeSet;

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

    #[test]
    fn robots_allows_public_crawling_and_excludes_only_private_apis() {
        let projector = SiteProjector::new("https://silan.tech");
        let robots = projector.robots();
        assert!(robots.contains("Allow: /\n"));
        assert!(robots.contains("Disallow: /api/v1/stats/snapshot\n"));
        assert!(robots.contains("Disallow: /api/v1/content/status\n"));
        assert!(!robots.contains("Disallow: /api/v1/blog"));
        assert!(!robots.contains("Disallow: /api/v1/media"));
    }

    #[test]
    fn crawler_routes_match_react_public_routes() {
        let projector = SiteProjector::new("https://silan.tech");
        let docs = vec![
            doc(silan_viking_app::ContentKind::Resume, "resume", "Silan Hu"),
            doc(silan_viking_app::ContentKind::Blog, "building", "Building"),
            doc(silan_viking_app::ContentKind::Project, "system", "System"),
            doc(silan_viking_app::ContentKind::Idea, "runtime", "Runtime"),
            doc(silan_viking_app::ContentKind::Episode, "intro", "Intro"),
            doc(silan_viking_app::ContentKind::Moment, "one", "One"),
            doc(silan_viking_app::ContentKind::Moment, "two", "Two"),
        ];

        let paths = projector
            .crawler_routes(&docs)
            .into_iter()
            .map(|route| route.path)
            .collect::<BTreeSet<_>>();

        assert_eq!(
            paths,
            BTreeSet::from([
                "/".to_owned(),
                "/blog/building/".to_owned(),
                "/projects/system/".to_owned(),
                "/ideas/runtime/".to_owned(),
                "/episodes/intro/".to_owned(),
                "/moments/".to_owned(),
            ])
        );
    }

    fn doc(kind: silan_viking_app::ContentKind, slug: &str, title: &str) -> QueryDocument {
        QueryDocument {
            uri: format!("silan://resources/{}/{slug}", kind.dir_name()),
            kind,
            slug: slug.to_owned(),
            title: title.to_owned(),
            status: Some("published".to_owned()),
            visibility: Some("public".to_owned()),
            tags: vec!["AI systems".to_owned()],
            languages: vec!["en".to_owned()],
            text: format!("{title}\nPublic body"),
        }
    }
}
