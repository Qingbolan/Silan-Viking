import assert from 'node:assert/strict';
import { getClientFingerprint } from '../src/utils/fingerprint';
import { ensureCommenter } from '../src/lib/commenterIdentity';

Object.defineProperty(globalThis, 'window', { configurable: true, value: { __SILAN_PRERENDER__: true } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('static rendering accessed visitor storage'); } });
Object.defineProperty(globalThis, 'document', { configurable: true, get() { throw new Error('static rendering accessed visitor cookies'); } });
assert.equal(getClientFingerprint(), '');
assert.deepEqual(await ensureCommenter(), { authorName: 'Guest', customName: false, countryCode: 'XX', regionCode: 'NA' });

Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'silan_visitor_id=real-visitor' } });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {}, getItem() { return null; } } });
assert.equal(getClientFingerprint(), 'real-visitor');
console.log('static identity isolation and runtime visitor restoration passed');
