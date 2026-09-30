import assert from 'node:assert/strict';
import test from 'node:test';
import { captureMarkdown } from './captureDraft.ts';

test('an edited capture title owns the first H1 without replacing the body', () => {
  assert.equal(captureMarkdown('我的视频', '视频说明\n\n![demo](silan://resources/moment/demo/assets/demo.mp4)'),
    '# 我的视频\n\n视频说明\n\n![demo](silan://resources/moment/demo/assets/demo.mp4)');
});

test('title-only captures save and empty title leaves automatic title derivation intact', () => {
  assert.equal(captureMarkdown('Only a title', ''), '# Only a title');
  assert.equal(captureMarkdown('', 'First line\n\nDetails'), 'First line\n\nDetails');
  assert.equal(captureMarkdown('  ', '  '), '');
});
