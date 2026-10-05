//! CLI adapter for DeepSeek-backed language quality audits.

use crate::credentials;
use silan_viking_app::{
    DeepSeekLanguageAuditor, DocumentLanguageAudit, LanguageAuditReport, LanguageAuditScope,
    LanguageAuditWorkflow, DEFAULT_DEEPSEEK_LANGUAGE_AUDIT_MODEL,
    DEFAULT_LANGUAGE_AUDIT_MIN_CONFIDENCE,
};
use std::fs;
use std::path::{Path, PathBuf};

pub fn run(content_root: &Path, scope: LanguageAuditScope, args: &[&str]) -> Result<(), String> {
    let options = LanguageCheckOptions::parse(args)?;
    let mut api_key = credentials::deepseek_api_key()?;
    let mut auditor = DeepSeekLanguageAuditor::configured()?;
    if let Some(model) = options.model {
        if let Some(mut profile) = api_key.engine().cloned() {
            profile.model = model.clone();
            api_key = silan_viking_app::DeepSeekApiKey::for_engine(
                api_key.expose_secret().to_owned(),
                profile,
            )
            .map_err(|error| error.to_string())?;
        }
        auditor = auditor.with_model(model);
    }
    let auditor = auditor
        .with_min_confidence(options.min_confidence)
        .map_err(|error| error.to_string())?;
    let workflow = LanguageAuditWorkflow::with_auditor(content_root, auditor)
        .map_err(|error| error.to_string())?;
    eprintln!(
        "Sending authored documents to the configured AI engine for read-only reader review \
         (model={}, min-confidence={:.2}).",
        workflow.model(),
        workflow.min_confidence()
    );
    let report = workflow
        .review_scope_with_progress(&api_key, scope, options.selector.as_deref(), |progress| {
            eprintln!(
                "[{}/{}] {}",
                progress.document_index, progress.documents_total, progress.source_path
            );
        })
        .map_err(|error| error.to_string())?;
    if report.documents_total == 0 {
        println!("no {} documents to check", scope.as_str());
        return Ok(());
    }
    if let Some(path) = options.output_path.as_deref() {
        write_report(path, &report)?;
        eprintln!("report={}", path.display());
    }
    if options.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
        );
    } else {
        print_human_report(content_root, &report);
    }
    if report.documents_failed > 0 {
        return Err(format!(
            "reader review incomplete: {} of {} documents failed",
            report.documents_failed, report.documents_total
        ));
    }
    Ok(())
}

fn write_report(path: &Path, report: &LanguageAuditReport) -> Result<(), String> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create report directory {}: {error}", parent.display()))?;
    }
    let serialized =
        serde_json::to_string_pretty(report).map_err(|error| error.to_string())? + "\n";
    fs::write(path, serialized)
        .map_err(|error| format!("write language audit report {}: {error}", path.display()))
}

fn print_human_report(content_root: &Path, report: &LanguageAuditReport) {
    println!(
        "AI reader review · model={} · min-confidence={:.2} · \
         documents={}/{} · findings={} (major={})",
        report.model,
        report.min_confidence,
        report.documents_completed,
        report.documents_total,
        report.findings_total,
        report.major_findings
    );
    for result in &report.results {
        print_document_findings(content_root, result);
    }
    for failure in &report.failures {
        println!(
            "\n[FAILED] {} [{}]\n  {}",
            failure.source_path, failure.language, failure.error
        );
    }
}

fn print_document_findings(content_root: &Path, result: &DocumentLanguageAudit) {
    if result.findings.is_empty() {
        println!("\n[PASS] {} [{}]", result.source_path, result.language);
        print_document_scores(result);
        return;
    }
    println!(
        "\n[REVIEW] {} [{}] · {} finding(s)",
        result.source_path,
        result.language,
        result.findings.len()
    );
    print_document_scores(result);
    for finding in &result.findings {
        let path = content_root.join(&result.source_path);
        let location = finding
            .source_line
            .map(|line| format!("{}:{line}", path.display()))
            .unwrap_or_else(|| path.display().to_string());
        println!(
            "  [{}][{}] {}",
            finding.severity.as_str(),
            finding.category.as_str(),
            location
        );
        println!("    quote: {}", one_line(&finding.quote));
        println!("    why: {}", one_line(&finding.explanation));
        println!("    fix: {}", one_line(&finding.suggestion));
    }
}

fn print_document_scores(result: &DocumentLanguageAudit) {
    if result.scores.is_empty() {
        return;
    }
    let scores = result
        .scores
        .iter()
        .map(|score| format!("{}={}/5", score.dimension.as_str(), score.score))
        .collect::<Vec<_>>()
        .join(" · ");
    println!("  scores: {scores}");
}

fn one_line(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Debug, PartialEq)]
struct LanguageCheckOptions {
    selector: Option<String>,
    model: Option<String>,
    min_confidence: f64,
    output_path: Option<PathBuf>,
    json: bool,
}

impl LanguageCheckOptions {
    fn parse(args: &[&str]) -> Result<Self, String> {
        let mut options = Self {
            selector: None,
            model: None,
            min_confidence: DEFAULT_LANGUAGE_AUDIT_MIN_CONFIDENCE,
            output_path: None,
            json: false,
        };
        let mut index = 0;
        while index < args.len() {
            match args[index] {
                "--json" => options.json = true,
                "--model" => {
                    index += 1;
                    options.model = Some(
                        args.get(index)
                            .ok_or("reader-review --model requires a value")?
                            .to_string(),
                    );
                }
                value if value.starts_with("--model=") => {
                    options.model = Some(value.trim_start_matches("--model=").to_owned());
                }
                "--min-confidence" => {
                    index += 1;
                    options.min_confidence = parse_min_confidence(
                        args.get(index)
                            .ok_or("reader-review --min-confidence requires a value")?,
                    )?;
                }
                value if value.starts_with("--min-confidence=") => {
                    options.min_confidence =
                        parse_min_confidence(value.trim_start_matches("--min-confidence="))?;
                }
                "--report" => {
                    index += 1;
                    options.output_path = Some(PathBuf::from(
                        args.get(index)
                            .ok_or("reader-review --report requires a path")?,
                    ));
                }
                value if value.starts_with("--report=") => {
                    options.output_path =
                        Some(PathBuf::from(value.trim_start_matches("--report=")));
                }
                value if value.starts_with('-') => {
                    return Err(format!("unknown reader-review flag `{value}`"));
                }
                value if options.selector.is_none() => {
                    options.selector = Some(value.to_owned());
                }
                value => {
                    return Err(format!(
                        "reader-review accepts at most one slug, got `{value}`"
                    ));
                }
            }
            index += 1;
        }
        if options
            .model
            .as_deref()
            .is_some_and(|model| model.trim().is_empty())
        {
            return Err(format!(
                "reader-review model cannot be empty; default is {DEFAULT_DEEPSEEK_LANGUAGE_AUDIT_MODEL}"
            ));
        }
        Ok(options)
    }
}

fn parse_min_confidence(value: &str) -> Result<f64, String> {
    let parsed = value
        .parse::<f64>()
        .map_err(|_| format!("invalid reader-review confidence `{value}`; expected 0..=1"))?;
    if !parsed.is_finite() || !(0.0..=1.0).contains(&parsed) {
        return Err(format!(
            "invalid reader-review confidence `{value}`; expected 0..=1"
        ));
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_selector_model_output_and_json() {
        assert_eq!(
            LanguageCheckOptions::parse(&[
                "post-slug",
                "--model",
                "deepseek-v4-pro",
                "--min-confidence",
                "0.65",
                "--report=report.json",
                "--json",
            ])
            .expect("valid options"),
            LanguageCheckOptions {
                selector: Some("post-slug".to_owned()),
                model: Some("deepseek-v4-pro".to_owned()),
                min_confidence: 0.65,
                output_path: Some(PathBuf::from("report.json")),
                json: true,
            }
        );
    }

    #[test]
    fn rejects_multiple_selectors() {
        assert!(LanguageCheckOptions::parse(&["one", "two"]).is_err());
    }

    #[test]
    fn defaults_to_high_precision_and_rejects_invalid_confidence() {
        assert_eq!(
            LanguageCheckOptions::parse(&[])
                .expect("default options")
                .min_confidence,
            0.8
        );
        assert!(LanguageCheckOptions::parse(&["--min-confidence", "1.1"]).is_err());
    }

    #[test]
    fn renders_multiline_model_text_on_one_terminal_line() {
        assert_eq!(one_line("one\n two   three"), "one two three");
    }
}
