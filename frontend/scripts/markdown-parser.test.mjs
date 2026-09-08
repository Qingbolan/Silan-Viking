import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/markdownParser.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { parseAcademicMarkdown } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('preserves the research lifecycle inside a tilde fence', () => {
  const flow = 'capture -> structure -> connect -> review -> publish -> verify -> observe';
  const blocks = parseAcademicMarkdown(`Before\n\n~~~text\n${flow}\n~~~\n\nAfter`);
  assert.deepEqual(blocks.map(({ type, content, language }) => ({ type, content, language })), [
    { type: 'text', content: 'Before', language: undefined },
    { type: 'code', content: flow, language: 'text' },
    { type: 'text', content: 'After', language: undefined },
  ]);
});

for (const marker of ['`', '~']) {
  test(`requires matching sufficiently long ${marker} fences and preserves code lines`, () => {
    const open = marker.repeat(4);
    const body = ['first', marker.repeat(3), marker === '`' ? '~~~' : '```', '', 'last'].join('\n');
    const blocks = parseAcademicMarkdown(`${open}python\n${body}\n${marker.repeat(5)}\n\nAfter`);
    assert.equal(blocks[0].type, 'code');
    assert.equal(blocks[0].language, 'python');
    assert.equal(blocks[0].content, body);
    assert.equal(blocks[1].content, 'After');
  });
}

test('keeps list, code, and following paragraph in source order', () => {
  const blocks = parseAcademicMarkdown('- first\n\n~~~text\nsecond\n~~~\n\nthird');
  assert.deepEqual(blocks.map(({ content }) => content), ['- first', 'second', 'third']);
});
