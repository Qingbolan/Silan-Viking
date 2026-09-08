import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainReleaseAssets } from './retain-release-assets.mjs';

test('retains the preceding build without keeping stale HTML or accumulating older assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-assets-'));
  try {
    for (const name of ['first', 'second', 'third']) {
      await mkdir(join(root, name, 'assets'), { recursive: true });
      await writeFile(join(root, name, 'assets', `${name}.js`), name);
      await writeFile(join(root, name, 'index.html'), name);
    }
    await retainReleaseAssets(join(root, 'second'), join(root, 'first'));
    assert.deepEqual((await readdir(join(root, 'second', 'assets'))).sort(), ['first.js', 'second.js']);
    assert.equal(await readFile(join(root, 'second', 'index.html'), 'utf8'), 'second');
    await retainReleaseAssets(join(root, 'third'), join(root, 'second'));
    assert.deepEqual((await readdir(join(root, 'third', 'assets'))).sort(), ['second.js', 'third.js']);
    assert.deepEqual(JSON.parse(await readFile(join(root, 'third', 'release-assets.json'), 'utf8')), ['assets/third.js']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
