import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateReleaseManifest, validateSeoArtifacts } from './seo-xml.mjs';

const args = process.argv.slice(2);
const valueFor = (name, fallback) => {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
};

const root = resolve(valueFor('--root', 'dist'));
const publicOrigin = valueFor('--public-origin', process.env.SILAN_PUBLIC_ORIGIN || '')
  .replace(/\/+$/, '');
const expectedFeedUrl = publicOrigin ? `${publicOrigin}/rss.xml` : undefined;

const result = validateSeoArtifacts({
  sitemapXml: readFileSync(resolve(root, 'sitemap.xml'), 'utf8'),
  rssXml: readFileSync(resolve(root, 'rss.xml'), 'utf8'),
  expectedFeedUrl,
});

const expectedManifest = {
  release_id: valueFor('--release-id', process.env.SILAN_STATIC_RELEASE),
  content_commit: valueFor('--content-commit', process.env.SILAN_CONTENT_COMMIT),
  content_hash: valueFor('--content-hash', process.env.SILAN_CONTENT_HASH),
  schema_version: valueFor('--schema-version', process.env.SILAN_SCHEMA_VERSION),
};
const shouldValidateManifest = Object.values(expectedManifest).some((value) => value !== undefined);
if (shouldValidateManifest) {
  validateReleaseManifest(
    readFileSync(resolve(root, 'release-manifest.json'), 'utf8'),
    expectedManifest,
  );
}

console.log(
  `[seo-verify] sitemap=${result.sitemapUrlCount} rss=${result.rssItemCount}` +
  `${shouldValidateManifest ? ' manifest=verified' : ''}`,
);
