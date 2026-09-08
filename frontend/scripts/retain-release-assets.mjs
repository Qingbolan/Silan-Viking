import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const manifestName = 'release-assets.json';

async function listAssets(root, relative = 'assets') {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = `${relative}/${entry.name}`;
    return entry.isDirectory() ? listAssets(root, path) : [path];
  }));
  return files.flat();
}

/** Keep one preceding release's assets, while publishing only fresh HTML. */
export async function retainReleaseAssets(current, previous) {
  const currentAssets = await listAssets(current);
  let previousAssets;
  try {
    previousAssets = JSON.parse(await readFile(join(previous, manifestName), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // The first publication of the manifest inventories the existing release.
    previousAssets = await listAssets(previous);
  }
  if (!Array.isArray(previousAssets) || previousAssets.some((path) =>
    typeof path !== 'string' || !path.startsWith('assets/')
      || path.split('/').some((part) => !part || part === '.' || part === '..')
      || path.includes('\\'))) {
    throw new Error('Invalid previous release asset manifest');
  }
  const fresh = new Set(currentAssets);
  for (const path of previousAssets) {
    if (fresh.has(path)) continue;
    await mkdir(dirname(join(current, path)), { recursive: true });
    await cp(join(previous, path), join(current, path));
  }
  // Exclude retained assets so they expire on the next publication.
  await writeFile(join(current, manifestName), JSON.stringify(currentAssets.sort(), null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , current, previous] = process.argv;
  if (!current || !previous) throw new Error('Usage: retain-release-assets.mjs <dist> <previous-release>');
  await retainReleaseAssets(resolve(current), resolve(previous));
}
