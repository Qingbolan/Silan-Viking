//! GEO analysis over source content with attributable evidence.
//!
//! The score is an additive, explainable model: every addend is reported as a
//! [`GeoScoreComponent`] with the points it awarded and why. Source structure
//! (length, headings, question-shaped headings, media, attributable evidence
//! links) is parsed from the Markdown structure, not from raw substrings, and
//! observed answer-engine outcomes come from the last synced stats snapshot.

use crate::{StatsCache, WorkspaceContent, WorkspaceContentError};
use serde::Serialize;
use std::collections::BTreeSet;
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
    /// The additive breakdown of `score`: each component states the points
    /// it awarded, its ceiling and the reason, so a UI can explain the
    /// number. `score` is the sum of `points`, capped at 100.
    pub score_components: Vec<GeoScoreComponent>,
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

/// One explainable addend of [`GeoInsightReport::score`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GeoScoreComponent {
    /// Stable machine id: `baseline`, `length`, `sections`, `questions`,
    /// `media`, `evidence_links`, `ai_crawls` or `ai_referrals`.
    pub id: String,
    pub label: String,
    pub points: u8,
    pub max_points: u8,
    /// Human-readable justification for `points`.
    pub reason: String,
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
        let signals = SourceSignals::parse(translation.content.as_str());
        let SourceSignals {
            words,
            headings,
            question_headings,
            images,
            evidence_links,
        } = signals;
        let source = source_evidence(format!(
            "Parsed `{}` from content/: {words} words, {headings} headings \
             ({question_headings} question-shaped), {images} images, \
             {evidence_links} attributable evidence links.",
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

        let score_components = score_components(&signals, ai_crawls, ai_referrals);
        let score = score_components
            .iter()
            .map(|component| u32::from(component.points))
            .sum::<u32>()
            .min(100) as u8;

        let mut actions = Vec::new();
        if headings < 2 {
            actions.push(action(
                "P1",
                "Split the body into retrievable sections",
                "Use explicit H2/H3 headings so answer engines can retrieve a focused passage.",
                source.clone(),
            ));
        }
        if question_headings == 0 {
            actions.push(action(
                "P2",
                "Add a question-shaped heading",
                "Mirror at least one concrete reader query in a heading, e.g. `## Why …?`.",
                source.clone(),
            ));
        }
        if evidence_links == 0 {
            actions.push(action(
                "P2",
                "Add attributable evidence links",
                "Link related Silan content (silan://resources/…) or primary http(s) sources.",
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
            metric(
                "Words",
                words,
                "Source body length; CJK characters count individually, other scripts by word.",
                source.clone(),
            ),
            metric(
                "Sections",
                headings,
                "Markdown headings outside code blocks (retrieval boundaries).",
                source.clone(),
            ),
            metric(
                "Questions",
                question_headings,
                "Question-shaped headings that mirror a reader query.",
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
                evidence_links,
                "Distinct attributable http(s) and silan://resources/ references; images excluded.",
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
            score_components,
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

/// Structural signals parsed from one Markdown source body. Fenced code
/// blocks and inline code spans are ignored for every signal: code is
/// neither prose, a retrieval heading, nor reader-facing evidence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct SourceSignals {
    words: usize,
    headings: usize,
    question_headings: usize,
    images: usize,
    evidence_links: usize,
}

impl SourceSignals {
    fn parse(body: &str) -> Self {
        let mut signals = Self::default();
        let mut prose = String::with_capacity(body.len());
        let mut fence: Option<&str> = None;
        for line in body.lines() {
            let trimmed = line.trim_start();
            if let Some(marker) = fence {
                if trimmed.starts_with(marker) {
                    fence = None;
                }
                continue;
            }
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                fence = Some(&trimmed[..3]);
                continue;
            }
            if let Some(text) = heading_text(trimmed) {
                signals.headings += 1;
                if is_question_heading(text) {
                    signals.question_headings += 1;
                }
            }
            prose.push_str(line);
            prose.push('\n');
        }
        let prose = strip_inline_code(&prose);
        signals.words = count_words(&prose);
        signals.images = prose.matches("![").count();
        signals.evidence_links = count_evidence_links(&prose);
        signals
    }
}

/// The text of an ATX heading (`#` .. `######` followed by a space or end of
/// line), or `None` for any other line, including `#hashtag` prose.
fn heading_text(line: &str) -> Option<&str> {
    let level = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let rest = &line[level..];
    if !rest.is_empty() && !rest.starts_with([' ', '\t']) {
        return None;
    }
    Some(rest.trim().trim_end_matches('#').trim())
}

const ENGLISH_INTERROGATIVES: &[&str] = &[
    "what", "why", "how", "when", "where", "which", "who", "whom", "whose", "can", "could",
    "should", "does", "do", "did", "is", "are", "will", "would",
];
const CHINESE_INTERROGATIVES: &[&str] = &[
    "什么",
    "为什么",
    "为何",
    "如何",
    "怎么",
    "怎样",
    "哪",
    "吗",
    "是否",
    "多少",
];

/// A heading mirrors a reader query when it ends with a question mark, opens
/// with an English interrogative, or contains a Chinese interrogative.
fn is_question_heading(text: &str) -> bool {
    if text.ends_with('?') || text.ends_with('？') {
        return true;
    }
    let first = text
        .split(|c: char| !c.is_alphanumeric() && c != '\'')
        .find(|word| !word.is_empty())
        .unwrap_or_default()
        .to_lowercase();
    ENGLISH_INTERROGATIVES.contains(&first.as_str())
        || CHINESE_INTERROGATIVES
            .iter()
            .any(|marker| text.contains(marker))
}

/// Replace `` `inline code` `` spans with a space.
fn strip_inline_code(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_code = false;
    for c in text.chars() {
        if c == '`' {
            in_code = !in_code;
            out.push(' ');
        } else if !in_code {
            out.push(c);
        }
    }
    out
}

/// Characters written without inter-word spaces: CJK ideographs, kana and
/// Hangul syllables.
fn is_cjk(c: char) -> bool {
    matches!(
        u32::from(c),
        0x3040..=0x30FF // Hiragana, Katakana
            | 0x3400..=0x4DBF // CJK Extension A
            | 0x4E00..=0x9FFF // CJK Unified Ideographs
            | 0xAC00..=0xD7AF // Hangul syllables
            | 0xF900..=0xFAFF // CJK Compatibility Ideographs
            | 0x20000..=0x2FA1F // CJK Extensions B..F and supplement
    )
}

/// Unicode-aware word count.
///
/// Rule: every CJK character (see [`is_cjk`]) counts as one word; any other
/// maximal run of non-whitespace, non-CJK characters counts as one word when
/// it contains a letter or digit. Latin text is therefore counted by words,
/// punctuation alone is ignored, and mixed text such as `用Rust写` counts 3.
fn count_words(text: &str) -> usize {
    let mut words = 0;
    let mut run_has_alphanumeric = false;
    for c in text.chars() {
        let cjk = is_cjk(c);
        if cjk || c.is_whitespace() {
            words += usize::from(run_has_alphanumeric) + usize::from(cjk);
            run_has_alphanumeric = false;
        } else if c.is_alphanumeric() {
            run_has_alphanumeric = true;
        }
    }
    words + usize::from(run_has_alphanumeric)
}

/// Distinct attributable references: `http(s)://` URLs and public
/// `silan://resources/` URIs in prose, inline links, autolinks or reference
/// definitions. Image targets (`![alt](url)`, `<img …>`) are not evidence.
fn count_evidence_links(text: &str) -> usize {
    let text = strip_images(text);
    let mut targets = BTreeSet::new();
    for scheme in ["https://", "http://", "silan://resources/"] {
        for (start, _) in text.match_indices(scheme) {
            let target: String = text[start..]
                .chars()
                .take_while(|c| !c.is_whitespace() && !matches!(c, ')' | '>' | ']' | '"' | '\''))
                .collect();
            let target = target.trim_end_matches(['.', ',', ';', ':', '!', '?']);
            if target.len() > scheme.len() {
                targets.insert(target.to_owned());
            }
        }
    }
    targets.len()
}

/// Drop Markdown image syntax and HTML `<img>` tags.
fn strip_images(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    loop {
        let Some(start) = [rest.find("!["), rest.find("<img")]
            .into_iter()
            .flatten()
            .min()
        else {
            out.push_str(rest);
            return out;
        };
        out.push_str(&rest[..start]);
        let tail = &rest[start..];
        let end = if tail.starts_with("![") {
            tail.find("](").and_then(|close| {
                tail[close + 2..]
                    .find(')')
                    .map(|paren| close + 2 + paren + 1)
            })
        } else {
            tail.find('>').map(|close| close + 1)
        };
        match end {
            Some(end) => rest = &tail[end..],
            None => {
                out.push_str(tail);
                return out;
            }
        }
    }
}

fn component(
    id: &str,
    label: &str,
    points: u8,
    max_points: u8,
    reason: String,
) -> GeoScoreComponent {
    GeoScoreComponent {
        id: id.to_owned(),
        label: label.to_owned(),
        points,
        max_points,
        reason,
    }
}

/// The additive score model: a 20-point baseline, up to 60 points of source
/// structure and up to 16 points of observed answer-engine outcomes.
fn score_components(
    signals: &SourceSignals,
    ai_crawls: i64,
    ai_referrals: i64,
) -> Vec<GeoScoreComponent> {
    let words = signals.words;
    let crawl_points = match ai_crawls {
        i64::MIN..=0 => 0,
        1..=4 => 4,
        _ => 8,
    };
    vec![
        component(
            "baseline",
            "Baseline",
            20,
            20,
            "Every indexable source translation starts at 20.".to_owned(),
        ),
        component(
            "length",
            "Length",
            ((words.min(700) * 20) / 700) as u8,
            20,
            format!("{words} words; full credit at 700 (CJK characters count individually)."),
        ),
        component(
            "sections",
            "Sections",
            (signals.headings.min(4) * 4) as u8,
            16,
            format!(
                "{} headings outside code blocks; 4 points each, up to 4.",
                signals.headings
            ),
        ),
        component(
            "questions",
            "Question headings",
            (signals.question_headings.min(2) * 4) as u8,
            8,
            format!(
                "{} question-shaped headings; 4 points each, up to 2. \
                 Question marks in body text do not count.",
                signals.question_headings
            ),
        ),
        component(
            "media",
            "Media",
            if signals.images > 0 { 8 } else { 0 },
            8,
            format!("{} image references; any image earns 8.", signals.images),
        ),
        component(
            "evidence_links",
            "Evidence links",
            (signals.evidence_links.min(2) * 4) as u8,
            8,
            format!(
                "{} distinct attributable http(s) or silan://resources/ links, images excluded; \
                 4 points each, up to 2.",
                signals.evidence_links
            ),
        ),
        component(
            "ai_crawls",
            "AI crawls",
            crawl_points,
            8,
            format!(
                "{ai_crawls} AI crawler interactions in the last synced stats snapshot; \
                 1-4 earn 4, 5 or more earn 8. This is an observed outcome, not source quality."
            ),
        ),
        component(
            "ai_referrals",
            "AI referrals",
            if ai_referrals > 0 { 8 } else { 0 },
            8,
            format!(
                "{ai_referrals} AI chat referrals in the last synced stats snapshot; \
                 any referral earns 8."
            ),
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_words_are_counted_by_word() {
        assert_eq!(count_words("Rust makes systems programming safe."), 5);
        assert_eq!(count_words("don't — stop"), 2);
    }

    #[test]
    fn chinese_characters_count_individually() {
        assert_eq!(count_words("我们为什么使用本地优先的内容工作空间。"), 18);
        assert_eq!(count_words("用Rust写引擎"), 5);
        assert_eq!(count_words("用 Rust 写，再部署 to production"), 8);
    }

    #[test]
    fn chinese_article_is_not_three_words() {
        let body = "# 本地优先\n\n这是一篇关于本地优先内容系统的文章。\n\n## 为什么\n\n因为数据属于作者。\n";
        assert_eq!(SourceSignals::parse(body).words, 32);
    }

    #[test]
    fn questions_come_from_question_shaped_headings_only() {
        let body = "# Intro\nIs this a question? Body text does not count.\n\
                    ## Why local-first\n## 如何部署\n## Setup?\n## Notes\n\
                    ```\n# not a heading?\n```\n#hashtag?\n";
        let signals = SourceSignals::parse(body);
        assert_eq!(signals.headings, 5);
        assert_eq!(signals.question_headings, 3);
    }

    #[test]
    fn evidence_links_are_attributable_and_exclude_images() {
        let body = "See [paper](https://arxiv.org/abs/1) and https://arxiv.org/abs/1.\n\
                    Related: [post](silan://resources/blog/hello).\n\
                    ![cover](https://cdn.example.com/c.png)\n\
                    ![local](silan://resources/blog/hello/assets/a.png)\n\
                    <img src=\"https://cdn.example.com/x.png\">\n\
                    [rel](./relative.md) and `https://code.example.com`\n";
        let signals = SourceSignals::parse(body);
        assert_eq!(signals.evidence_links, 2);
        assert_eq!(signals.images, 2);
    }

    #[test]
    fn score_components_explain_each_point() {
        let signals = SourceSignals {
            words: 350,
            headings: 3,
            question_headings: 1,
            images: 0,
            evidence_links: 5,
        };
        let components = score_components(&signals, 2, 0);
        let points = |id: &str| {
            components
                .iter()
                .find(|component| component.id == id)
                .expect(id)
                .points
        };
        assert_eq!(points("baseline"), 20);
        assert_eq!(points("length"), 10);
        assert_eq!(points("sections"), 12);
        assert_eq!(points("questions"), 4);
        assert_eq!(points("media"), 0);
        assert_eq!(points("evidence_links"), 8);
        assert_eq!(points("ai_crawls"), 4);
        assert_eq!(points("ai_referrals"), 0);
        assert!(components.iter().all(|component| {
            !component.reason.is_empty() && component.points <= component.max_points
        }));
        let ceiling: u32 = components
            .iter()
            .map(|component| u32::from(component.max_points))
            .sum();
        assert!(ceiling <= 100);
    }
}
