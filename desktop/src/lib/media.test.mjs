import assert from 'node:assert/strict';
import test from 'node:test';
import { isVideoFile, isVideoResource, mediaFileNameHeader } from './media.ts';

test('video detection survives absent MIME and canonical media URLs', () => {
  for (const extension of ['mp4', 'webm', 'mov', 'm4v']) {
    assert(isVideoFile({ name: `clip.${extension.toUpperCase()}`, type: '' }));
    assert(isVideoResource(`silan://resources/moment/test/assets/clip.${extension}?v=abc`));
  }
  assert(!isVideoResource('image.png'));
  assert(!isVideoResource('clip.mp4.png'));
});

test('binary import preserves Unicode file names in ASCII HTTP headers', () => {
  const name = '演示 🎬 "clip".mp4';
  const header = mediaFileNameHeader(name);
  assert.match(header, /^[\x20-\x7e]+$/);
  assert.equal(JSON.parse(header), name);
});
