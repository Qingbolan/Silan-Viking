import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorSession } from './EditorSession';
import { EditorRecovery } from '../../lib/editorRecovery';
function memoryStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
}
const translation = (id='en', content='original', revision='r1') => ({ id, title: 'Title', content, revision });
const document = (translations=[translation()]) => ({ id: 'document', title: 'Title', translations });
function session(storage = memoryStorage()) { return new EditorSession(new EditorRecovery(storage)); }
function deferred() {
  let resolve;
  return { promise: new Promise(yes => { resolve = yes; }), resolve: value => resolve(value) };
}

test('reload preserves dirty revisions, recovery copies, and deleted-source drafts', () => {
  const editor = session();
  editor.mergeSourceDocuments([document()]);
  editor.editTranslation('document','en','my draft');
  editor.mergeSourceDocuments([document([translation('en', 'external', 'r2')])]);
  assert.equal(editor.documents[0].translations[0].revision, 'r1');
  assert.equal(editor.documents[0].translations[0].content, 'my draft');
  assert.equal(editor.persistedContent('en'), 'external');
  editor.mergeSourceDocuments([]);
  assert.equal(editor.documents.length, 1);
  const reopened = new EditorSession(editor.recovery);
  reopened.mergeSourceDocuments([document([translation('en', 'external', 'r2')])]);
  assert.equal(reopened.documents[0].translations[0].content, 'my draft');
  assert.equal(reopened.documents[0].translations[0].revision, 'r1');
  assert.equal(reopened.dirtyIds.has('en'), true);
});

test('edits during I/O remain pending and save against the newly persisted revision', async () => {
  const editor = session(), first = deferred(), requests = [];
  editor.mergeSourceDocuments([document()]);
  editor.editTranslation('document','en','first draft');
  const writing = editor.flushMarkdown(async input => {
    requests.push(input);
    if (requests.length === 1) return first.promise;
    return document([translation('en', input.content, 'r3')]);
  });
  await Promise.resolve();
  editor.editTranslation('document','en','newer draft');
  first.resolve(document([translation('en','first draft','r2')]));
  await writing;
  assert.deepEqual(requests.map(r => [r.content,r.expectedRevision]), [['first draft','r1'],['newer draft','r2']]);
  assert.equal(editor.getSnapshot().save.phase,'idle');
  assert.equal(editor.dirtyIds.size,0);
  assert.equal(editor.documents[0].translations[0].revision,'r3');
  assert.equal(editor.recovery.read('markdown','en'),null);
});

test('concurrent flushes serialize and settings use the acknowledged revision', async () => {
  const editor = session(), first = deferred();
  editor.mergeSourceDocuments([document()]);
  editor.editTranslation('document','en','draft');
  let writes = 0, settingsRevision = 'r1';
  const save = async () => { writes++; return first.promise; };
  const writing = editor.flushMarkdown(save, (_, after) => { settingsRevision=after.revision; });
  const duplicate = editor.flushMarkdown(save);
  const settings = editor.writes.run(async () => settingsRevision);
  first.resolve(document([translation('en','draft','r2')]));
  await Promise.all([writing, duplicate]);
  assert.equal(writes,1);
  assert.equal(await settings,'r2');
});

test('conflicts block queued writes and require explicit resolution', async () => {
  const editor = session();
  editor.mergeSourceDocuments([document()]);
  editor.editTranslation('document','en','draft');
  await assert.rejects(editor.flushMarkdown(async () => { throw new Error('source changed on disk; reload before saving'); }));
  assert.equal(editor.blocked,true);
  assert.equal(editor.conflict.id,'en');
  let writes=0;
  await assert.rejects(editor.flushMarkdown(async () => { writes++; return document(); }), /Resolve the source conflict/);
  assert.equal(writes,0);
  assert.equal(editor.recovery.read('markdown','en').content,'draft');
  editor.setConflict(null);
  await editor.flushMarkdown(async input => document([translation('en',input.content,'r2')]));
  assert.equal(editor.blocked,false);
  assert.equal(editor.dirtyIds.size,0);
});

test('failed writes retain drafts and allow retry without poisoning the queue', async () => {
  const editor=session();
  editor.mergeSourceDocuments([document()]);
  editor.editTranslation('document','en','draft');
  await assert.rejects(editor.flushMarkdown(async () => { throw new Error('disk full'); }), /disk full/);
  assert.equal(editor.getSnapshot().save.phase,'failed');
  assert.equal(editor.dirtyIds.has('en'),true);
  await editor.flushMarkdown(async input => document([translation('en',input.content,'r2')]));
  assert.equal(editor.getSnapshot().save.phase,'idle');
});

test('recovery storage failure never discards the in-memory edit or writes unprotected source', async () => {
  const editor=session({ ...memoryStorage(), setItem() { throw new Error('quota exceeded'); } });
  editor.mergeSourceDocuments([document()]);
  assert.throws(() => editor.editTranslation('document','en','draft'), /quota/);
  assert.equal(editor.documents[0].translations[0].content,'draft');
  assert.equal(editor.dirtyIds.has('en'),true);
  let writes=0;
  await assert.rejects(editor.flushMarkdown(async () => { writes++; return document(); }), /quota/);
  assert.equal(writes,0);
});

test('a settings conflict blocks an already queued Markdown save before it can write', async () => {
  const editor=session();
  editor.mergeSourceDocuments([document()]);
  editor.editTranslation('document','en','draft');
  const settings = editor.writeSettings('en', async () => { throw new Error('source changed on disk; reload before saving'); });
  let writes=0;
  const markdown = editor.flushMarkdown(async () => { writes++; return document(); });
  await assert.rejects(settings, /source changed/);
  await assert.rejects(markdown, /Resolve the source conflict/);
  assert.equal(writes,0);
  assert.equal(editor.conflict.kind,'settings');
});

test('late conflict reads cannot re-block a resolved editor or replace a newer conflict', async () => {
  const editor=session(), disk=deferred();
  editor.setConflict({id:'en',kind:'markdown',disk:null});
  const reading=editor.readConflict(()=>disk.promise);
  editor.setConflict(null);
  editor.setConflict({id:'zh',kind:'settings',disk:null});
  disk.resolve(translation('en','old read','r2'));
  assert.equal(await reading,'superseded');
  assert.equal(editor.conflict.id,'zh');
  assert.equal(editor.conflict.disk,null);
  assert.equal(await editor.readConflict(async()=>translation('zh','current','r3')),'updated');
  assert.equal(editor.conflict.disk.revision,'r3');
});

test('reviewed source batches skip dirty and changed documents without saving unrelated drafts', async () => {
  const editor = session();
  editor.mergeSourceDocuments([document([translation('en'), translation('zh')])]);
  editor.editTranslation('document', 'zh', 'unsaved');
  const calls = [];
  const result = await editor.applySourceEdits([
    { id: 'en', title: 'Title', content: 'cleaned', expectedContent: 'original', expectedRevision: 'r1' },
    { id: 'zh', title: 'Title', content: 'cleaned', expectedContent: 'original', expectedRevision: 'r1' },
  ], async input => {
    calls.push(input.id);
    return document([translation('en', 'cleaned', 'r2'), translation('zh')]);
  });
  assert.deepEqual(calls, ['en']);
  assert.deepEqual(result, { applied: ['en'], skipped: ['zh'] });
  assert.equal(editor.documents[0].translations[1].content, 'unsaved');
  assert(editor.dirtyIds.has('zh'));
});

test('editing during a reviewed source write remains dirty with the returned revision', async () => {
  const editor = session(), gate = deferred();
  editor.mergeSourceDocuments([document()]);
  const pending = editor.applySourceEdits([{ id: 'en', title: 'Title', content: 'cleaned', expectedContent: 'original', expectedRevision: 'r1' }], () => gate.promise);
  await Promise.resolve();
  editor.editTranslation('document', 'en', 'new draft');
  gate.resolve(document([translation('en', 'cleaned', 'r2')]));
  await pending;
  assert.equal(editor.documents[0].translations[0].content, 'new draft');
  assert.equal(editor.documents[0].translations[0].revision, 'r2');
  assert(editor.dirtyIds.has('en'));
  assert.equal(editor.persistedContent('en'), 'cleaned');
});
