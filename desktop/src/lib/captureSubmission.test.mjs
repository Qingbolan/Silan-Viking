import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureSubmission } from './captureSubmission';

test('failed cover upload retains one draft and retries without duplicating the video', async () => {
  const video = new File(['video'], 'clip.mp4', { type: 'video/mp4' });
  const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
  let creates = 0;
  let videoImports = 0;
  let failCover = true;
  let saved;
  const document = { id: 'moment', translations: [{ id: 'translation', title: 'Title', content: '# Title', revision: 'r1', language: 'en' }] };
  const ops = {
    create: async () => { creates++; return document; },
    import: async (_id, file) => {
      if (file === video) videoImports++;
      if (file === cover && failCover) throw new Error('disk full');
      return { uri: `silan://resources/moment/demo/assets/${file.name}`, markdown: `![cover](silan://resources/moment/demo/assets/${file.name})` };
    },
    save: async input => { saved = input; return document; },
  };
  const input = { title: 'Edited title', note: 'My caption', language: 'en', moment: true, files: [video], covers: new Map([[video, { status: 'ready', file: cover, source: 'upload' }]]) };
  const submission = new CaptureSubmission();
  await assert.rejects(submission.save(input, ops), /disk full/);
  assert(submission.hasDraft);
  failCover = false;
  await submission.save(input, ops);
  assert.equal(creates, 1);
  assert.equal(videoImports, 1);
  assert.match(saved.content, /^# Edited title\n\n\[!\[cover\]/);
  assert(saved.content.endsWith('\n\nMy caption'));
  assert.equal(saved.expectedRevision, 'r1');
});

test('missing cover is rejected before any source mutation', async () => {
  const video = new File(['video'], 'clip.mp4');
  await assert.rejects(new CaptureSubmission().save({ title: '', note: '', language: 'en', moment: true, files: [video], covers: new Map() }, {
    create: () => assert.fail('must not create a draft'),
  }), /cover/);
});
