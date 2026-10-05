import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  LoaderCircle,
  LocateFixed,
  RotateCcw,
  ShieldCheck,
  WandSparkles,
  X,
} from 'lucide-react';
import type { LanguageReviewState } from '../lib/languageReviewWorkflow';
import { Button } from './ds/Button';
import { ModalLayer } from './ModalLayer';
import type {
  DocumentLanguageAudit,
  LanguageAuditCategory,
  LanguageAuditFinding,
  LanguageAuditScoreDimension,
} from '../types';

type LanguageReviewPanelProps = {
  state: LanguageReviewState;
  onClose: () => void;
  onRetry: () => void;
  onFindingOpen: (
    result: DocumentLanguageAudit,
    finding: LanguageAuditFinding,
  ) => void;
  /** Opens the explicit before/after preview; never edits source by itself. */
  onFindingPreview: (
    result: DocumentLanguageAudit,
    finding: LanguageAuditFinding,
  ) => void;
};

const categoryLabels: Record<LanguageAuditCategory, string> = {
  unnatural_expression: 'Unnatural expression',
  logical_gap: 'Logical gap',
  concept_misuse: 'Concept misuse',
  terminology: 'Terminology',
  audience_fit: 'Audience fit',
  actionability_gap: 'Actionability gap',
  rigor_gap: 'Rigor gap',
  markdown_structure: 'Markdown structure',
};

const scoreLabels: Record<LanguageAuditScoreDimension, string> = {
  expert_pull: 'Expert pull',
  general_clarity: 'General clarity',
  actionability: 'Actionability',
  expression_quality: 'Expression quality',
};

export function LanguageReviewPanel({
  state,
  onClose,
  onRetry,
  onFindingOpen,
  onFindingPreview,
}: LanguageReviewPanelProps) {
  if (!state.visible) return null;
  const report = state.report;

  return (
    <ModalLayer
      cardClassName="language-review-card"
      labelledBy="language-review-title"
      dismissible={state.phase !== 'running'}
      onClose={onClose}
    >
        <header className="language-review-head">
          <div className="new-project-badge"><FileSearch size={17} /></div>
          <div>
            <span>DEEPSEEK READER REVIEW</span>
            <h3 id="language-review-title">{state.target?.label || 'Reader review'}</h3>
          </div>
          <button
            type="button"
            className="language-close-button language-review-close"
            disabled={state.phase === 'running'}
            aria-label="Close reader review"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </header>

        {state.phase === 'running' && (
          <div className="language-review-running" role="status">
            <LoaderCircle size={22} />
            <strong>Reviewing saved source…</strong>
            <p>
              The fixed workflow is discovering the target, checking each document,
              validating structured findings, and building one report.
            </p>
          </div>
        )}

        {state.phase === 'failed' && (
          <div className="language-review-failure" role="alert">
            <AlertCircle size={18} />
            <div>
              <strong>Review could not complete</strong>
              <p>{state.error}</p>
            </div>
          </div>
        )}

        {state.phase === 'complete' && report && (
          <>
            <div className="language-review-summary">
              <div>
                {report.documents_failed === 0
                  ? <CheckCircle2 size={18} />
                  : <AlertCircle size={18} />}
                <span>{report.documents_completed}/{report.documents_total} documents</span>
              </div>
              <div>
                <strong>{report.findings_total}</strong>
                <span>findings</span>
              </div>
              <div>
                <strong>{report.major_findings}</strong>
                <span>major</span>
              </div>
              <div className="language-review-model">
                <ShieldCheck size={15} />
                <span>{report.model} · confidence ≥ {report.min_confidence.toFixed(2)}</span>
              </div>
            </div>

            <p className="language-review-advisory">
              Findings are advisory. Your source is unchanged; preview a change to edit and save it explicitly.
            </p>

            <div className="language-review-results">
              {report.results.map((result) => (
                <section className="language-review-document" key={`${result.source_path}:${result.language}`}>
                  <header>
                    <div>
                      <strong>{result.title}</strong>
                      <span>{result.language} · {result.source_path}</span>
                    </div>
                    <em data-state={result.findings.length === 0 ? 'pass' : 'review'}>
                      {result.findings.length === 0 ? 'No findings' : `${result.findings.length} to review`}
                    </em>
                  </header>

                  {Boolean(result.scores?.length) && (
                    <div className="language-review-scores" aria-label="Reader review scores">
                      {result.scores?.map((score) => (
                        <div key={score.dimension}>
                          <strong>{score.score}/5</strong>
                          <span>{scoreLabels[score.dimension]}</span>
                          <small>{score.rationale}</small>
                        </div>
                      ))}
                    </div>
                  )}

                  {result.findings.length === 0 ? (
                    <p className="language-review-document-summary">{result.summary}</p>
                  ) : (
                    <div className="language-review-findings">
                      {result.findings.map((finding, index) => (
                        <article
                          className="language-review-finding"
                          data-severity={finding.severity}
                          key={`${finding.category}:${finding.source_line || 0}:${index}`}
                        >
                          <div className="language-review-finding-meta">
                            <span>{finding.severity}</span>
                            <strong>{categoryLabels[finding.category]}</strong>
                            <small>
                              {finding.source_line ? `line ${finding.source_line} · ` : ''}
                              {Math.round(finding.confidence * 100)}%
                            </small>
                          </div>
                          <blockquote>{finding.quote}</blockquote>
                          <p>{finding.explanation}</p>
                          <div className="language-review-suggestion">
                            <span>Suggested repair</span>
                            <p>{finding.suggestion}</p>
                          </div>
                          <div className="language-review-finding-actions">
                            <button
                              type="button"
                              onClick={() => onFindingOpen(result, finding)}
                            >
                              <LocateFixed size={13} />
                              Open in editor
                            </button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={!finding.suggestion.trim()}
                              title="Preview the exact before/after change; nothing is saved until you confirm"
                              onClick={() => onFindingPreview(result, finding)}
                            >
                              <WandSparkles size={13} />
                              Preview change…
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              ))}

              {report.failures.map((failure) => (
                <section className="language-review-document failed" key={failure.source_path}>
                  <header>
                    <div>
                      <strong>{failure.source_path}</strong>
                      <span>{failure.language}</span>
                    </div>
                    <em data-state="failed">Failed</em>
                  </header>
                  <p className="language-review-document-summary">{failure.error}</p>
                </section>
              ))}
            </div>
          </>
        )}

        {state.phase !== 'running' && (
          <footer className="language-review-actions">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Close</Button>
            <Button type="button" variant="primary" size="sm" onClick={onRetry}>
              <RotateCcw size={14} />
              Review again
            </Button>
          </footer>
        )}
    </ModalLayer>
  );
}
