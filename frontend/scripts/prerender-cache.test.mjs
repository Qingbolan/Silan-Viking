import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrerenderCache, QuerySnapshot, fingerprint } from './prerender-cache.mjs';

test('deduplicates concurrent and repeated public queries within a release', async () => {
  let calls = 0;
  const snapshot = new QuerySnapshot(async () => { calls++; return 'content'; });
  assert.deepEqual(await Promise.all([snapshot.get('/a'), snapshot.get('/a')]), ['content', 'content']);
  await snapshot.get('/a');
  assert.equal(calls, 1);
});
test('reuses only matching renderer and page dependencies, including after restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'silan-cache-test-'));
  try {
    const cache = new PrerenderCache(dir);
    cache.save('/a', 'code1', { '/api/a': fingerprint('one') }, '<h1>A</h1>');
    cache.save('/b', 'code1', { '/api/b': fingerprint('two') }, '<h1>B</h1>');
    const reopened = new PrerenderCache(dir);
    const load = async url => url === '/api/a' ? 'changed' : 'two';
    assert.equal(await reopened.restore('/a', 'code1', load), null);
    assert.equal(await reopened.restore('/b', 'code1', load), '<h1>B</h1>');
    assert.equal(await reopened.restore('/b', 'code2', load), null);
    assert.equal(await reopened.restore('/b', 'code1', async () => { throw new Error('offline'); }), null);
    assert.equal(await reopened.restore('/missing', 'code1', load), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
