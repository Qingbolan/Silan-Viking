import assert from 'node:assert/strict';
import { highlightCodeToHtml, normalizeCodeLanguage } from '../src/utils/syntaxHighlight';

const records = '{"name":"<script>","score":-1.2e3,"ok":true}\r\n\r\n{"value":null}\r\n';
const html = highlightCodeToHtml(records, 'jsonl');
for (const token of ['property', 'string', 'number', 'boolean', 'constant']) {
  assert.ok(html.includes(`class="token ${token}"`), token);
}
assert.ok(!html.includes('<script>'));
assert.equal(html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), records);
for (const alias of ['jsonl', 'ndjson', 'json-lines', 'language-JSONL']) {
  assert.equal(normalizeCodeLanguage(alias), 'jsonl');
  assert.equal(highlightCodeToHtml(records, alias), html);
}
const nextRecord = '{"valid":true}';
assert.ok(highlightCodeToHtml('"unfinished\n' + nextRecord, 'jsonl').endsWith(highlightCodeToHtml(nextRecord, 'json')));
assert.equal(highlightCodeToHtml('', 'jsonl'), '');
console.log('JSONL highlighting: tokens, aliases, escaping, line preservation and record isolation passed.');
