import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSectionCommitMessage, sectionCommitAvailability } from './sectionCommit.ts';

test('the section commit button stays visible and explains why it is disabled', () => {
  assert.deepEqual(
    sectionCommitAvailability({ label: 'Blog', changeCount: 0, unsavedCount: 0 }),
    { enabled: false, reason: 'No uncommitted Blog changes to commit' },
  );
  assert.match(
    sectionCommitAvailability({ label: 'Blog', changeCount: null, unsavedCount: 0 }).reason,
    /Checking Blog/,
  );
  assert.match(
    sectionCommitAvailability({ label: 'Moments', changeCount: 2, unsavedCount: 1 }).reason,
    /Save 1 open Markdown edit/,
  );
  assert.equal(sectionCommitAvailability({ label: 'Blog', changeCount: 3, unsavedCount: 0 }).enabled, true);
});

test('committing from the preview requires an owner-visible, non-empty message', () => {
  assert.equal(defaultSectionCommitMessage('moment'), 'release: moment updates');
  assert.deepEqual(
    sectionCommitAvailability({ label: 'Moments', changeCount: 1, unsavedCount: 0, message: '  ' }),
    { enabled: false, reason: 'Write a commit message' },
  );
  assert.equal(
    sectionCommitAvailability({ label: 'Moments', changeCount: 1, unsavedCount: 0, message: 'feat: x' }).enabled,
    true,
  );
});
