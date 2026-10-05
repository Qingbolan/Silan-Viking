import assert from 'node:assert/strict';
import test from 'node:test';
import { cardExcerpt } from './cardPresentation.ts';

test('duplicate title prose is omitted without altering authored text', () => {
  const title = '这段材料的科研含金量很高，但信息密度大于叙事清晰度，需要明确核心问题。';
  assert.equal(cardExcerpt(title, title.replaceAll('，', ' ')), '');
  assert.equal(cardExcerpt('A concise title', 'A distinct summary with useful context.'), 'A distinct summary with useful context.');
  assert.equal(cardExcerpt('AI', 'AI systems need reliable evidence.'), 'AI systems need reliable evidence.');
});
