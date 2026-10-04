import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const fingerprint = (value) => createHash('sha256').update(value).digest('hex');

/** One immutable public-data snapshot per release; failed requests remain failures. */
export class QuerySnapshot {
  #values = new Map();
  constructor(load) { this.load = load; }
  get(key) {
    if (!this.#values.has(key)) this.#values.set(key, Promise.resolve().then(() => this.load(key)));
    return this.#values.get(key);
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
    writeFileSync(`${path}.next`, JSON.stringify({ identity, dependencies, html, integrity: fingerprint(html) }));
    renameSync(`${path}.next`, path);
  }
}
