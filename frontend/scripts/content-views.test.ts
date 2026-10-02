import assert from 'node:assert/strict';
import { updateMomentViews } from '../src/api/moments/momentApi';
import { updateBlogViews } from '../src/api/blog/blogApi';
import { updateEpisodeViews } from '../src/api/episodes/episodeApi';

const landing = 'https://silan.tech/moments/the-introduction-video-of-easynet-run-grq9vwej/';
Object.defineProperty(globalThis, 'window', { value: { location: { href: landing }, __SILAN_PRERENDER__: false }, configurable: true });
Object.defineProperty(globalThis, 'document', { value: { cookie: 'silan_visitor_id=reader-one', referrer: 'https://example.com/' }, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0' }, configurable: true });
let calls: Array<{ url: string; options: RequestInit }> = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options: options! });
  return { ok: true } as Response;
};
for (const [record, path] of [[updateMomentViews, 'moments'], [updateBlogViews, 'blog/posts'], [updateEpisodeViews, 'episodes']] as const) {
  assert.equal(await record('item-one'), true);
  const call = calls.at(-1)!;
  assert.ok(call.url.includes(`/api/v1/${path}/item-one/views?lang=en`));
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.credentials, 'include');
  assert.deepEqual(JSON.parse(call.options.body as string), {
    fingerprint: 'reader-one', user_agent_full: 'Mozilla/5.0', referrer: 'https://example.com/', landing_url: landing,
  });
}
calls = [];
(window as unknown as { __SILAN_PRERENDER__: boolean }).__SILAN_PRERENDER__ = true;
assert.equal(await updateMomentViews('item-one'), false);
assert.equal(calls.length, 0);
(window as unknown as { __SILAN_PRERENDER__: boolean }).__SILAN_PRERENDER__ = false;
globalThis.fetch = async () => ({ ok: false }) as Response;
assert.equal(await updateMomentViews('item-one'), false);
globalThis.fetch = async () => { throw new Error('offline'); };
assert.equal(await updateMomentViews('item-one'), false);
console.log('Content view reporting checks passed');
