import assert from 'node:assert/strict';
import test from 'node:test';
import { languageReviewFindingId, languageReviewTransition } from './languageReviewWorkflow.ts';
import {
  initialReviewSuggestionState,
  planReviewSuggestionEdit,
  proposedReplacement,
  reviewSourceEdit,
  reviewSuggestionTransition,
} from './reviewSuggestion.ts';

const source = '# Title\n\nThe engine is fast. It does many things very good.\n';
const finding = {
  category: 'unnatural_expression',
  severity: 'minor',
  confidence: 0.9,
  source_line: 3,
  quote: 'It does many things very good.',
  explanation: 'Adjective used as adverb.',
  suggestion: "Replace with something like: 'It handles many tasks well.'",
};
const target = {
  findingId: 'review-1',
  documentId: 'doc',
  translationId: 'doc:en',
  sourcePath: 'resources/blog/post/en.md',
  language: 'en',
  quote: finding.quote,
  suggestion: finding.suggestion,
  explanation: finding.explanation,
  sourceLine: finding.source_line,
};

test('a completed reader review never produces a source edit', () => {
  const idle = { phase: 'idle', visible: false, target: null, report: null, error: null };
  const result = { source_path: target.sourcePath, language: 'en', findings: [finding] };
  let review = languageReviewTransition(idle, {
    type: 'started',
    target: { kind: 'translation', id: 'doc:en', label: 'Post · en' },
  });
  review = languageReviewTransition(review, {
    type: 'completed',
    report: { results: [result], failures: [], findings_total: 1, major_findings: 0 },
  });
  review = languageReviewTransition(review, { type: 'opened' });
  review = languageReviewTransition(review, {
    type: 'findingResolved',
    findingId: languageReviewFindingId(result, finding),
  });
  review = languageReviewTransition(review, { type: 'closed' });
  assert.equal(review.phase, 'complete');
  // Without an explicit per-finding confirmation there is no write path.
  assert.equal(reviewSourceEdit(initialReviewSuggestionState, source), null);
  const previewing = reviewSuggestionTransition(initialReviewSuggestionState, { type: 'opened', target });
  assert.equal(previewing.phase, 'previewing');
  assert.equal(reviewSourceEdit(previewing, source), null, 'previewing must not edit source');
});

test('the preview offers the quoted rewrite, not the advice sentence', () => {
  assert.equal(proposedReplacement(target), 'It handles many tasks well.');
  assert.equal(
    proposedReplacement({ quote: 'x y z', suggestion: 'Clarify the claim.' }),
    'x y z',
    'advice without a quoted rewrite starts unchanged',
  );
});

test('confirming replaces exactly the quoted span and nothing else', () => {
  let state = reviewSuggestionTransition(initialReviewSuggestionState, { type: 'opened', target });
  state = reviewSuggestionTransition(state, { type: 'confirmed' });
  assert.equal(state.phase, 'saving');
  assert.equal(
    reviewSourceEdit(state, source),
    '# Title\n\nThe engine is fast. It handles many tasks well.\n',
  );
  assert.equal(
    reviewSuggestionTransition(state, { type: 'saved' }).phase,
    'idle',
  );
});

test('unchanged, missing, or ambiguous quotes are never applied', () => {
  assert.equal(planReviewSuggestionEdit(source, target, target.quote).status, 'unchanged');
  assert.equal(planReviewSuggestionEdit('# Other\n', target, 'x').status, 'quote_missing');
  const twice = `${finding.quote}\n${finding.quote}\n`;
  assert.equal(planReviewSuggestionEdit(twice, { quote: finding.quote, sourceLine: null }, 'x').status, 'ambiguous');
  assert.equal(
    planReviewSuggestionEdit(twice, { quote: finding.quote, sourceLine: 2 }, 'x').nextMarkdown,
    `${finding.quote}\nx\n`,
  );
});
