import assert from 'node:assert/strict';
import test from 'node:test';
import { caretToolbarPosition } from './CaretGeometry.ts';
const host = { left: 100, top: 50, right: 900, bottom: 700 };
test('typing controls align immediately to the caret right, at text height', () => {
  const position = caretToolbarPosition(host, { left: 300, top: 250, height: 16, collapsed: true }, 36);
  assert.equal(position.left + host.left, 310);
  assert.equal(position.top + host.top + 18, 258);
  assert(position.width <= host.right - 310);
});
test('line-end controls fit the pane and fall below, never to the document top', () => {
  const position = caretToolbarPosition(host, { left: 875, top: 350, height: 32, collapsed: true }, 36);
  assert(position.top + host.top >= 382);
  assert(position.left + position.width <= host.right - host.left);
});
