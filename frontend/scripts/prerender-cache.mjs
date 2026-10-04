import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const fingerprint = (value) => createHash('sha256').update(value).digest('hex');

/** One immutable public-data snapshot per release; failed requests remain failures. */
export class QuerySnapshot {
  #values = new Map();
  #queue = [];
  #head = 0;
  #active = 0;
  #hits = 0;
  #peak = 0;
  #bytes = 0;
  constructor(load, { concurrency = 8, maxEntries = 10000, maxBytes = 64 * 1024 * 1024 } = {}) {
    if (typeof load !== 'function') throw new TypeError('load must be a function');
    for (const [name, value] of Object.entries({ concurrency, maxEntries, maxBytes })) {
      if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
    }
    this.load = load;
    this.concurrency = concurrency;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }
  get stats() {
    return { entries: this.#values.size, bytes: this.#bytes, hits: this.#hits, active: this.#active, queued: this.#queue.length - this.#head, peak: this.#peak };
  }
  get(key) {
    if (this.#values.has(key)) { this.#hits++; return this.#values.get(key); }
    // Do not evict within a release: eviction would allow two versions of one
    // resource in the same snapshot. Reject overload explicitly instead.
    if (this.#values.size >= this.maxEntries) return Promise.reject(new Error('Query snapshot capacity exceeded'));
    const promise = new Promise((resolve, reject) => this.#queue.push({ key, resolve, reject }));
    this.#values.set(key, promise);
    this.#drain();
    return promise;
  }
  #drain() {
    while (this.#active < this.concurrency && this.#head < this.#queue.length) {
      const task = this.#queue[this.#head++];
      this.#active++;
      this.#peak = Math.max(this.#peak, this.#active);
      Promise.resolve().then(() => this.load(task.key)).then(value => {
        if (typeof value !== 'string') throw new TypeError('Query snapshot loaders must return serialized text');
        const bytes = Buffer.byteLength(value, 'utf8');
        if (bytes > this.maxBytes - this.#bytes) throw new Error('Query snapshot byte capacity exceeded');
        this.#bytes += bytes;
        return value;
      }).then(task.resolve, task.reject).finally(() => {
        this.#active--;
        this.#drain();
      });
    }
    if (this.#head === this.#queue.length) {
      this.#queue = [];
      this.#head = 0;
    } else if (this.#head >= 1024 && this.#head * 2 >= this.#queue.length) {
      this.#queue = this.#queue.slice(this.#head);
      this.#head = 0;
    }
  }
}

/** Only reuse HTML when both renderer and all observed public data match. */
export class PrerenderCache {
  constructor(directory) { this.directory = directory; mkdirSync(directory, { recursive: true }); }
  path(route) { return join(this.directory, `${fingerprint(route)}.json`); }
  async restore(route, identity, load) {
    try {
      const entry = JSON.parse(readFileSync(this.path(route), 'utf8'));
      if (entry.identity !== identity || fingerprint(entry.html) !== entry.integrity) return null;
      for (const [url, hash] of Object.entries(entry.dependencies)) {
        if (fingerprint(await load(url)) !== hash) return null;
      }
      return entry.html;
    } catch { return null; }
  }
  save(route, identity, dependencies, html) {
    const path = this.path(route);
    const temporary = `${path}.${randomUUID()}.next`;
    try {
      writeFileSync(temporary, JSON.stringify({ identity, dependencies, html, integrity: fingerprint(html) }), { flag: 'wx' });
      renameSync(temporary, path);
    } finally { rmSync(temporary, { force: true }); }
  }
}

/** Bound decoded HTTP body bytes before JSON parsing; Content-Length is only a hint. */
export async function readBoundedJson(response, { maxBytes = 16 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('maxBytes must be a positive integer');
  const cancelBody = async () => { try { await response.body?.cancel(); } catch { /* Preserve the original failure. */ } };
  if (!response.ok) {
    await cancelBody();
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await cancelBody();
    throw new Error('Public JSON response exceeds byte limit');
  }
  if (!response.body) throw new Error('Public JSON response has no body');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Public JSON response exceeds byte limit');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch (error) {
    try { await reader.cancel(); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally { reader.releaseLock(); }
}
