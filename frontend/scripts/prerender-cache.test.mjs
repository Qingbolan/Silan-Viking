/* global Response, TextEncoder */
import { ReadableStream } from 'node:stream/web';
import { URL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrerenderCache, QuerySnapshot, fingerprint, readBoundedJson } from './prerender-cache.mjs';

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

test('bounds parallel work under 1000 callers without duplicate loads', async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const snapshot = new QuerySnapshot(async key => {
    calls++;
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return key;
  }, { concurrency: 4, maxEntries: 100 });
  const values = await Promise.all(Array.from({ length: 1000 }, (_, i) => snapshot.get(String(i % 100))));
  assert.equal(values.length, 1000);
  assert.equal(calls, 100);
  assert.equal(peak, 4);
  assert.equal(snapshot.stats.hits, 900);
});

test('failure releases capacity and is stable for the snapshot lifetime', async () => {
  let calls = 0;
  const snapshot = new QuerySnapshot(key => {
    calls++;
    if (key === 'fail') throw new Error('upstream unavailable');
    return key;
  }, { concurrency: 1, maxEntries: 2 });
  const results = await Promise.allSettled([snapshot.get('fail'), snapshot.get('ok')]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].value, 'ok');
  await assert.rejects(snapshot.get('fail'), /upstream unavailable/);
  await assert.rejects(snapshot.get('overflow'), /capacity exceeded/);
  assert.equal(calls, 2);
  assert.equal(await snapshot.get('ok'), 'ok');
});

test('rejects invalid queue configuration', () => {
  for (const value of [0, -1, 0.5, Infinity, NaN]) {
    assert.throws(() => new QuerySnapshot(async () => '', { concurrency: value }), RangeError);
    assert.throws(() => new QuerySnapshot(async () => '', { maxEntries: value }), RangeError);
  }
});

test('concurrent workers publish complete cache entries without temporary-name collisions', async () => {
  const { Worker } = await import('node:worker_threads');
  const dir = mkdtempSync(join(tmpdir(), 'silan-concurrent-cache-'));
  const moduleUrl = new URL('./prerender-cache.mjs', import.meta.url).href;
  try {
    await Promise.all(Array.from({ length: 8 }, (_, writer) => new Promise((resolve, reject) => {
      const worker = new Worker(`
        const { workerData } = require('node:worker_threads');
        import(workerData.moduleUrl).then(({ PrerenderCache }) => {
          const cache = new PrerenderCache(workerData.dir);
          for (let i = 0; i < 50; i++) cache.save('/same', 'code', {}, 'writer-' + workerData.writer);
        }).catch(error => { throw error; });
      `, { eval: true, workerData: { moduleUrl, dir, writer } });
      worker.on('error', reject);
      worker.on('exit', code => code ? reject(new Error(`worker exited ${code}`)) : resolve());
    })));
    const value = await new PrerenderCache(dir).restore('/same', 'code', async () => '');
    assert.match(value, /^writer-[0-7]$/);
    const { readdirSync } = await import('node:fs');
    assert.equal(readdirSync(dir).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('bounds retained UTF-8 data and keeps capacity failures stable', async () => {
  const snapshot = new QuerySnapshot(async key => key, { concurrency: 1, maxBytes: 5 });
  assert.equal(await snapshot.get('你好'.slice(0, 1)), '你');
  assert.equal(await snapshot.get('ok'), 'ok');
  await assert.rejects(snapshot.get('x'), /byte capacity/);
  await assert.rejects(snapshot.get('x'), /byte capacity/);
  assert.equal(snapshot.stats.bytes, 5);
  assert.equal(await snapshot.get('ok'), 'ok');
  assert.throws(() => new QuerySnapshot(async () => '', { maxBytes: 0 }), RangeError);
});

test('changed shared dependencies invalidate only their dependent routes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'silan-dependency-cache-'));
  try {
    const cache = new PrerenderCache(dir);
    for (const [route, deps] of Object.entries({
      '/a': { '/api/a': 'a', '/api/shared': 'old' },
      '/b': { '/api/b': 'b', '/api/shared': 'old' },
      '/c': { '/api/c': 'c' },
    })) cache.save(route, 'renderer', Object.fromEntries(Object.entries(deps).map(([url, value]) => [url, fingerprint(value)])), route);
    const counts = new Map();
    const snapshot = new QuerySnapshot(async url => {
      counts.set(url, (counts.get(url) || 0) + 1);
      return url === '/api/shared' ? 'new' : url.slice(-1);
    });
    const results = await Promise.all(['/a', '/b', '/c'].map(route => cache.restore(route, 'renderer', url => snapshot.get(url))));
    assert.deepEqual(results, [null, null, '/c']);
    assert.equal(counts.get('/api/shared'), 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('bounds JSON streams even with missing or understated content length', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) { controller.enqueue(new TextEncoder().encode('12345')); },
      cancel() { cancelled = true; },
    });
    await assert.rejects(readBoundedJson(new Response(body, { headers }), { maxBytes: 8 }), /byte limit/);
    assert.equal(cancelled, true);
    assert.equal(body.locked, false);
  }
});

test('rejects oversized headers and HTTP errors without consuming bodies', async () => {
  for (const options of [{ headers: { 'content-length': '100' } }, { status: 503 }]) {
    let cancelled = false;
    const body = new ReadableStream({ cancel() { cancelled = true; } });
    await assert.rejects(readBoundedJson(new Response(body, options), { maxBytes: 8 }));
    assert.equal(cancelled, true);
  }
});

test('accepts exact byte limit and reports malformed JSON', async () => {
  assert.deepEqual(await readBoundedJson(new Response('{"a":1}'), { maxBytes: 7 }), { a: 1 });
  await assert.rejects(readBoundedJson(new Response('{')), SyntaxError);
});
