/**
 * Reader review is diagnostic. This module owns the only path from a review
 * finding to a source change: an explicit, per-finding preview of the exact
 * before/after text that the owner edits and confirms. Nothing here runs as
 * a side effect of a review completing.
 */

export type ReviewSuggestionTarget = {
  findingId: string;
  documentId: string;
  translationId: string;
  sourcePath: string;
  language: string;
  quote: string;
  suggestion: string;
  explanation: string;
  sourceLine: number | null;
};

export type ReviewSuggestionState =
  | { phase: 'idle' }
  | { phase: 'previewing'; target: ReviewSuggestionTarget; replacement: string; error: string | null }
  | { phase: 'saving'; target: ReviewSuggestionTarget; replacement: string };

export type ReviewSuggestionEvent =
  | { type: 'opened'; target: ReviewSuggestionTarget }
  | { type: 'replacementChanged'; replacement: string }
  | { type: 'confirmed' }
  | { type: 'saved' }
  | { type: 'failed'; error: string }
  | { type: 'cancelled' };

export type ReviewSuggestionPlan =
  | { status: 'ready'; before: string; after: string; offset: number; nextMarkdown: string }
  | { status: 'unchanged' }
  | { status: 'quote_missing' }
  | { status: 'ambiguous' };

const QUOTED_SPAN = /"([^"]{3,})"|“([^”]{3,})”|'([^']{3,})'|‘([^’]{3,})’|「([^」]{2,})」/g;

/**
 * Review suggestions are advice ("Replace with something like: '…'"), not
 * literal text. Offer the quoted replacement when the advice contains one;
 * otherwise start from the unchanged original so nothing is applied until
 * the owner writes the replacement.
 */
export function proposedReplacement(target: Pick<ReviewSuggestionTarget, 'quote' | 'suggestion'>) {
  const spans = Array.from(target.suggestion.matchAll(QUOTED_SPAN))
    .map((match) => (match.slice(1).find(Boolean) || '').trim())
    .filter((span) => span && span !== target.quote.trim());
  return spans.length > 0 ? spans[spans.length - 1] : target.quote;
}

const lineAt = (markdown: string, offset: number) => markdown.slice(0, offset).split('\n').length;

/** Plan replacing exactly the quoted span; never touches any other text. */
export function planReviewSuggestionEdit(
  markdown: string,
  target: Pick<ReviewSuggestionTarget, 'quote' | 'sourceLine'>,
  replacement: string,
): ReviewSuggestionPlan {
  const quote = target.quote;
  if (!quote.trim() || replacement === quote) return { status: 'unchanged' };
  const offsets: number[] = [];
  for (let offset = markdown.indexOf(quote); offset >= 0; offset = markdown.indexOf(quote, offset + 1)) {
    offsets.push(offset);
  }
  if (offsets.length === 0) return { status: 'quote_missing' };
  const candidates = offsets.length === 1 || target.sourceLine == null
    ? offsets
    : offsets.filter((offset) => lineAt(markdown, offset) === target.sourceLine);
  if (candidates.length !== 1) return { status: 'ambiguous' };
  const offset = candidates[0];
  return {
    status: 'ready',
    before: quote,
    after: replacement,
    offset,
    nextMarkdown: `${markdown.slice(0, offset)}${replacement}${markdown.slice(offset + quote.length)}`,
  };
}

export const initialReviewSuggestionState: ReviewSuggestionState = { phase: 'idle' };

export function reviewSuggestionTransition(
  state: ReviewSuggestionState,
  event: ReviewSuggestionEvent,
): ReviewSuggestionState {
  switch (event.type) {
    case 'opened':
      return state.phase === 'saving'
        ? state
        : { phase: 'previewing', target: event.target, replacement: proposedReplacement(event.target), error: null };
    case 'replacementChanged':
      return state.phase === 'previewing' ? { ...state, replacement: event.replacement, error: null } : state;
    case 'confirmed':
      return state.phase === 'previewing'
        ? { phase: 'saving', target: state.target, replacement: state.replacement }
        : state;
    case 'saved':
      return state.phase === 'saving' ? { phase: 'idle' } : state;
    case 'failed':
      return state.phase === 'saving'
        ? { phase: 'previewing', target: state.target, replacement: state.replacement, error: event.error }
        : state;
    case 'cancelled':
      return state.phase === 'saving' ? state : { phase: 'idle' };
  }
}

/**
 * The single gate for a review-originated source write: only a confirmed
 * (`saving`) state whose quote still matches produces new Markdown.
 */
export function reviewSourceEdit(state: ReviewSuggestionState, markdown: string) {
  if (state.phase !== 'saving') return null;
  const plan = planReviewSuggestionEdit(markdown, state.target, state.replacement);
  return plan.status === 'ready' ? plan.nextMarkdown : null;
}
