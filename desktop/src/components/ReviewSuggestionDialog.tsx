import { AlertCircle, LoaderCircle, WandSparkles } from 'lucide-react';
import {
  planReviewSuggestionEdit,
  type ReviewSuggestionState,
} from '../lib/reviewSuggestion';
import { Button } from './ds/Button';
import { ModalLayer } from './ModalLayer';

const planMessages = {
  unchanged: 'Edit the replacement text to describe the change you want to save.',
  quote_missing: 'The reviewed sentence no longer appears in the saved source. Open it in the editor and edit it there.',
  ambiguous: 'The reviewed sentence appears more than once. Open it in the editor and edit the right occurrence there.',
} as const;

/**
 * Per-finding confirmation for a reader-review suggestion. It shows the exact
 * text that will be replaced and the editable replacement; only "Apply and
 * save" can change the Markdown source.
 */
export function ReviewSuggestionDialog({
  state,
  markdown,
  onReplacementChange,
  onConfirm,
  onCancel,
}: {
  state: ReviewSuggestionState;
  /** The current Markdown of the reviewed translation. */
  markdown: string;
  onReplacementChange: (replacement: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (state.phase === 'idle') return null;
  const { target, replacement } = state;
  const saving = state.phase === 'saving';
  const plan = planReviewSuggestionEdit(markdown, target, replacement);
  const error = state.phase === 'previewing' ? state.error : null;

  return (
    <ModalLayer
      cardClassName="review-suggestion-card"
      labelledBy="review-suggestion-title"
      dismissible={!saving}
      onClose={onCancel}
    >
      <header className="review-suggestion-head">
        <div className="new-project-badge"><WandSparkles size={17} /></div>
        <div>
          <span>Reader review suggestion</span>
          <h3 id="review-suggestion-title">Review this change before saving</h3>
          <small>{target.language} · {target.sourcePath}{target.sourceLine ? ` · line ${target.sourceLine}` : ''}</small>
        </div>
      </header>

      <p className="review-suggestion-advice">
        <strong>Reviewer advice</strong>
        <span>{target.suggestion}</span>
      </p>

      <div className="review-suggestion-diff" aria-label="Before and after">
        <div data-side="before">
          <span>Before</span>
          <del>{target.quote}</del>
        </div>
        <label data-side="after">
          <span>After (edit before saving)</span>
          <textarea
            data-autofocus
            rows={4}
            value={replacement}
            disabled={saving}
            onChange={(event) => onReplacementChange(event.target.value)}
          />
        </label>
      </div>

      {plan.status !== 'ready' && (
        <p className="review-suggestion-note" role="status">{planMessages[plan.status]}</p>
      )}
      {error && (
        <div className="dialog-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <div className="dialog-actions">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={saving || plan.status !== 'ready'}
          onClick={onConfirm}
        >
          {saving ? <LoaderCircle size={14} /> : <WandSparkles size={14} />}
          {saving ? 'Saving' : 'Apply and save'}
        </Button>
      </div>
    </ModalLayer>
  );
}
