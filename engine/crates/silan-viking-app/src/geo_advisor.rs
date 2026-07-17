//! GEO analysis over source content with attributable evidence.

use crate::{StatsCache, WorkspaceContent, WorkspaceContentError};
use serde::Serialize;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GeoAdvisorError {
    #[error(transparent)]
    Workspace(#[from] WorkspaceContentError),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GeoInsightReport {
    pub document_id: String,
    pub translation_id: String,
    pub title: String,
    pub language: String,
    pub score: u8,
    pub grade: String,
    pub summary: String,
    pub metrics: Vec<GeoMetric>,
    pub actions: Vec<GeoAction>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GeoMetric {
    pub label: String,
    pub value: String,
    pub detail: String,
    pub evidence: Vec<GeoEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GeoAction {
    pub priority: String,
    pub label: String,
    pub detail: String,
    pub evidence: Vec<GeoEvidence>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GeoEvidence {
    pub source: GeoEvidenceSource,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GeoEvidenceSource {
    SourceContent,
    RemoteStats,
    AiCrawler,
    AiReferral,
    LlmInference,
}

pub struct GeoAdvisor {
    workspace: WorkspaceContent,
    db_path: PathBuf,
}

impl GeoAdvisor {
    pub fn open(
        content_root: impl AsRef<Path>,
        db_path: impl AsRef<Path>,
    ) -> Result<Self, GeoAdvisorError> {
        Ok(Self {
            workspace: WorkspaceContent::open(content_root)?,
            db_path: db_path.as_ref().to_path_buf(),
        })
    }

    pub fn analyze_translation(
        &self,
        translation_id: &str,
    ) -> Result<GeoInsightReport, GeoAdvisorError> {
        let (document, _part, translation) = self.workspace.translation(translation_id)?;
        let body = translation.content.as_str();
        let words = body
            .split_whitespace()
            .filter(|word| !word.is_empty())
            .count();
        let headings = body
            .lines()
            .filter(|line| line.trim_start().starts_with('#'))
            .count();
        let questions = body.matches('?').count() + body.matches('？').count();
        let images = body.matches("![").count();
        let links = body.matches("https://").count()
            + body.matches("http://").count()
            + body.matches("silan://resources/").count();
        let source = source_evidence(format!(
            "Parsed `{}` from content/: {words} words, {headings} headings, {images} images, {links} links.",
            translation.source_path
        ));

        let cache = StatsCache::open(&self.db_path);
        let stats = cache.item(&document.content_type, &document.item_id).ok();
        let crawlers = cache
            .crawlers(&document.content_type, &document.item_id)
            .unwrap_or_default();
        let sources = cache
            .sources(&document.content_type, &document.item_id)
            .unwrap_or_default();
        let ai_crawls = crawlers
            .iter()
            .find(|row| row.label == "ai_crawler")
            .map(|row| row.count)
            .unwrap_or(0);
        let ai_referrals = sources
            .iter()
            .find(|row| row.label == "ai_chat")
            .map(|row| row.count)
            .unwrap_or(0);

        let mut score = 20_u8;
        score = score.saturating_add(((words.min(700) * 20) / 700) as u8);
        score = score.saturating_add((headings.min(4) * 4) as u8);
        if questions > 0 {
            score = score.saturating_add(8);
        }
        if images > 0 {
            score = score.saturating_add(8);
        }
        if links > 0 {
            score = score.saturating_add(8);
        }
        if ai_crawls > 0 {
            score = score.saturating_add(8);
        }
        if ai_referrals > 0 {
            score = score.saturating_add(8);
        }
        score = score.min(100);

        let mut actions = Vec::new();
        if headings < 2 {
            actions.push(action(
                "P1",
                "Split the body into retrievable sections",
                "Use explicit H2/H3 headings so answer engines can retrieve a focused passage.",
                source.clone(),
            ));
        }
        if questions == 0 {
            actions.push(action(
                "P2",
                "Add a question-shaped heading",
                "Mirror at least one concrete user query in the page structure.",
                source.clone(),
            ));
        }
        if links == 0 {
            actions.push(action(
                "P2",
                "Add attributable evidence links",
                "Reference related Silan content or primary sources.",
                source.clone(),
            ));
        }
        if ai_crawls == 0 {
            actions.push(GeoAction {
                priority: "P2".to_owned(),
                label: "Verify AI crawler discoverability after deploy".to_owned(),
                detail: "No cached AI crawler interaction currently supports discoverability."
                    .to_owned(),
                evidence: vec![GeoEvidence {
                    source: GeoEvidenceSource::AiCrawler,
                    detail: "Cached ai_crawler interactions: 0.".to_owned(),
                }],
            });
        }
        if actions.is_empty() {
            actions.push(GeoAction {
                priority: "P3".to_owned(),
                label: "Monitor post-deploy answer-engine traffic".to_owned(),
                detail: "The source structure is strong; validate it against live outcomes."
                    .to_owned(),
                evidence: vec![
                    GeoEvidence {
                        source: GeoEvidenceSource::AiCrawler,
                        detail: format!("Cached AI crawler interactions: {ai_crawls}."),
                    },
                    GeoEvidence {
                        source: GeoEvidenceSource::AiReferral,
                        detail: format!("Cached AI chat referrals: {ai_referrals}."),
                    },
                ],
            });
        }

        let mut metrics = vec![
            metric("Words", words, "Source body length.", source.clone()),
            metric(
                "Sections",
                headings,
                "Markdown retrieval boundaries.",
                source.clone(),
            ),
            metric(
                "Questions",
                questions,
                "Question-shaped source language.",
                source.clone(),
            ),
            metric(
                "Media",
                images,
                "Markdown visual references.",
                source.clone(),
            ),
            metric(
                "Links",
                links,
                "Attributable internal and external references.",
                source,
            ),
        ];
        if let Some(stats) = stats {
            metrics.push(GeoMetric {
                label: "Remote views".to_owned(),
                value: stats.views.to_string(),
                detail: "Observed reach from the last synced remote snapshot.".to_owned(),
                evidence: vec![GeoEvidence {
                    source: GeoEvidenceSource::RemoteStats,
                    detail: format!("{} remote views in the local synced snapshot.", stats.views),
                }],
            });
        }
        metrics.push(GeoMetric {
            label: "AI crawls".to_owned(),
            value: ai_crawls.to_string(),
            detail: "AI crawler interactions from the last synced snapshot.".to_owned(),
            evidence: vec![GeoEvidence {
                source: GeoEvidenceSource::AiCrawler,
                detail: format!("{ai_crawls} cached AI crawler interactions."),
            }],
        });
        metrics.push(GeoMetric {
            label: "AI referrals".to_owned(),
            value: ai_referrals.to_string(),
            detail: "AI chat referrals from the last synced snapshot.".to_owned(),
            evidence: vec![GeoEvidence {
                source: GeoEvidenceSource::AiReferral,
                detail: format!("{ai_referrals} cached AI chat referrals."),
            }],
        });

        Ok(GeoInsightReport {
            document_id: document.id,
            translation_id: translation.id,
            title: document.title,
            language: translation.language,
            score,
            grade: match score {
                85..=100 => "Strong",
                68..=84 => "Ready with edits",
                45..=67 => "Needs structure",
                _ => "Draft",
            }
            .to_owned(),
            summary: format!("{words} words · {headings} headings · {ai_crawls} AI crawls"),
            metrics,
            actions,
        })
    }

    pub fn suggest_actions(&self, translation_id: &str) -> Result<Vec<GeoAction>, GeoAdvisorError> {
        Ok(self.analyze_translation(translation_id)?.actions)
    }
}

fn source_evidence(detail: String) -> GeoEvidence {
    GeoEvidence {
        source: GeoEvidenceSource::SourceContent,
        detail,
    }
}
fn metric(label: &str, value: usize, detail: &str, evidence: GeoEvidence) -> GeoMetric {
    GeoMetric {
        label: label.to_owned(),
        value: value.to_string(),
        detail: detail.to_owned(),
        evidence: vec![evidence],
    }
}
fn action(priority: &str, label: &str, detail: &str, evidence: GeoEvidence) -> GeoAction {
    GeoAction {
        priority: priority.to_owned(),
        label: label.to_owned(),
        detail: detail.to_owned(),
        evidence: vec![evidence],
    }
}
