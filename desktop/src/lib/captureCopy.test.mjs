import assert from 'node:assert/strict';
import test from 'node:test';
import { captureCopy } from './captureCopy.ts';

const hasHan = (value) => /[㐀-鿿]/.test(value);
const strings = (copy) => Object.values(copy).flatMap((value) => (
  typeof value === 'string' ? [value] : Object.values(value)
));

test('capture tabs and copy follow the UI language', () => {
  const english = captureCopy('en');
  assert.equal(english.blogTab, 'Quick article');
  assert.equal(english.momentTab, 'Log a moment');
  assert.ok(strings(english).every((value) => !hasHan(value)), 'English UI must not show Chinese copy');
  assert.equal(captureCopy('zh').blogTab, '快速写文章');
  assert.deepEqual(Object.keys(captureCopy('zh')), Object.keys(english));
});
