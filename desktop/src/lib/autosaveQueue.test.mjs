import test from 'node:test';
import assert from 'node:assert/strict';
import { AutosaveQueue, mergePersistedTranslations } from './autosaveQueue.ts';

test('settings wait for Markdown and use its new revision', async () => {
  const queue = new AutosaveQueue();
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  let revision = 'original';
  const calls = [];
  const markdown = queue.run(async () => {
    calls.push('markdown');
    await pending;
    revision = 'body-saved';
  });
  const settings = queue.run(async () => { calls.push(`settings:${revision}`); });
  await Promise.resolve();
  assert.deepEqual(calls, ['markdown']);
  finish();
  await Promise.all([markdown, settings]);
  assert.deepEqual(calls, ['markdown', 'settings:body-saved']);
});

test('a failed write permits an automatic retry', async () => {
  const queue = new AutosaveQueue();
  await assert.rejects(queue.run(async () => { throw new Error('disk unavailable'); }));
  assert.equal(await queue.run(async () => 'saved'), 'saved');
});

test('slow save responses retain newer typing and dirty translations after navigation', () => {
  const persisted = [
    { id: 'en', title: 'Saved title', content: 'first edit', revision: 'r2' },
    { id: 'zh', content: 'original translation', revision: 'z1' },
  ];
  const drafts = [
    { id: 'en', title: 'New title', content: 'typed during save', revision: 'r1' },
    { id: 'zh', content: 'edited before switching languages', revision: 'z1' },
  ];
  assert.deepEqual(mergePersistedTranslations(persisted, drafts, new Set(['en', 'zh'])), [
    { id: 'en', title: 'New title', content: 'typed during save', revision: 'r2' },
    drafts[1],
  ]);
  assert.deepEqual(mergePersistedTranslations(persisted, drafts, new Set()), persisted);
});
