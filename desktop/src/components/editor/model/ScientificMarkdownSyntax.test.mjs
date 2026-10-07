import assert from 'node:assert/strict';
import test from 'node:test';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { latexSyntax, scientificFromMarkdown } from './ScientificMarkdownSyntax.ts';

const parse = (source) => fromMarkdown(source, { extensions: [latexSyntax], mdastExtensions: [scientificFromMarkdown] });
const formulas = (tree) => [
  ...(tree.type === 'silanLatex' ? [tree] : []),
  ...(tree.children || []).flatMap(formulas),
];

test('multiline TeX retains offsets, CRLF, tabs and doubled TeX slashes', () => {
  for (const lineEnding of ['\n', '\r\n']) {
    const source = '\\[a\\\\b' + lineEnding + '\tc\\]';
    const [formula] = formulas(parse(source));
    assert.equal(formula.value, source.slice(2, -2));
    assert.equal(formula.display, true);
    assert.equal(formula.position.start.offset, 0);
    assert.equal(formula.position.end.offset, source.length);
  }
});

test('blockquote prefixes are not passed to the TeX renderer', () => {
  const [formula] = formulas(parse('> \\[a\n> b\\]'));
  assert.equal(formula.value, 'a\nb');
});

test('unclosed delimiters, escaped delimiters and code remain ordinary Markdown', () => {
  for (const source of ['\\[unclosed', '\\\\[literal\\\\]', '`\\[code\\]`', '```tex\n\\[code\\]\n```']) {
    assert.equal(formulas(parse(source)).length, 0);
  }
});

test('only Mermaid fences become diagram nodes; metadata and source are retained', () => {
  const tree = parse('```mermaid title="Research"\nflowchart LR\nA --> B\n```\n\n```js\nconst n = 1;\n```');
  assert.equal(tree.children[0].type, 'silanMermaid');
  assert.equal(tree.children[0].value, 'flowchart LR\nA --> B');
  assert.equal(tree.children[0].meta, 'title="Research"');
  assert.equal(tree.children[1].type, 'code');
});
