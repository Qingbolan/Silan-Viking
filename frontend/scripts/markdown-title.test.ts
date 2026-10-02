import assert from 'node:assert/strict';
import { withoutRepeatedTitle } from '../src/lib/markdown';

const title = 'Research is a journey of polishing yourself';
for (const heading of [
  '# ' + title + '&#x20;',
  '# **' + title + '**',
  '   # ' + title + ' ###',
  title + '\n===',
  '# ' + title + '&nbsp;',
]) {
  assert.equal(withoutRepeatedTitle(heading + '\n\nBody text.', title), 'Body text.');
}
assert.equal(withoutRepeatedTitle('# A &amp; B\n\nBody', 'A & B'), 'Body');
assert.equal(withoutRepeatedTitle('# Same', 'Same'), '');
for (const markdown of ['# Different\n\nBody', 'Intro\n\n# Same', '~~~md\n# Same\n~~~', '> # Same']) {
  assert.equal(withoutRepeatedTitle(markdown, 'Same'), markdown);
}
assert.equal(withoutRepeatedTitle('# Same\n\n## Section\n\nText', 'Same'), '## Section\n\nText');
console.log('Rendered title deduplication and preserved body headings verified.');
