import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorRecovery, preserveDraftRevision, isSourceConflict } from './editorRecovery.ts';

function memoryStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}

test('failed source save can survive closing and reopening without adopting the newer disk revision', () => {
  const storage = memoryStorage();
  const draft = { id: 'part:zh', revision: 'r1', content: 'local changes', title: 'Local title' };
  new EditorRecovery(storage).write('markdown', draft.id, draft);
  const recovered = new EditorRecovery(storage).read('markdown', draft.id);
  const disk = { ...draft, revision: 'r2', content: 'external changes' };
  assert.deepEqual(preserveDraftRevision(disk, recovered, new Set([draft.id])), draft);
  assert.equal(disk.content, 'external changes');
  assert.deepEqual(preserveDraftRevision(disk, recovered, new Set()), disk);
});

test('recovering one translation or settings never consumes another draft', () => {
  const journal = new EditorRecovery(memoryStorage());
  journal.write('markdown', 'a', { content: 'one' });
  journal.write('markdown', 'b', { content: 'two' });
  journal.write('settings', 'a', { title: 'metadata' });
  journal.remove('markdown', 'a');
  assert.equal(journal.read('markdown', 'a'), null);
  assert.deepEqual(journal.read('markdown', 'b'), { content: 'two' });
  assert.deepEqual(journal.read('settings', 'a'), { title: 'metadata' });
});

test('storage failure is observable so close cannot claim a recoverable copy exists', () => {
  const journal = new EditorRecovery({ ...memoryStorage(), setItem() { throw Error('quota exceeded'); } });
  assert.throws(() => journal.write('markdown', 'a', { content: 'draft' }), /quota/);
  assert.equal(isSourceConflict('source changed on disk; reload before saving `a.md`'), true);
  assert.equal(isSourceConflict('disk unavailable'), false);
});

test('a stuck save stops blocking the close decision without cancelling its write', async () => {
  const { waitForSave } = await import('./editorRecovery.ts');
  let finish;
  const saving = new Promise(resolve => { finish = resolve; });
  assert.equal(await waitForSave(saving, 5), false);
  finish(true);
  assert.equal(await saving, true);
  assert.equal(await waitForSave(Promise.resolve(true), 5), true);
});


test('late settings acknowledgement never removes the newer close recovery copy', () => {
  const journal = new EditorRecovery(memoryStorage());
  journal.write('settings', 'a', { title: 'B' });
  journal.removeIf('settings', 'a', saved => saved.title === 'A');
  assert.deepEqual(journal.read('settings', 'a'), { title: 'B' });
});

test('recovery copies remain discoverable when the source no longer exists', () => {
  const storage = memoryStorage();
  new EditorRecovery(storage).write('markdown', 'deleted:zh', { content: 'only remaining copy' });
  assert.deepEqual(new EditorRecovery(storage).list(), [
    { kind: 'markdown', id: 'deleted:zh', value: { content: 'only remaining copy' } },
  ]);
});
