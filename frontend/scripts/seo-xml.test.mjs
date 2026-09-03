import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeRssFeed, validateReleaseManifest, validateSeoArtifacts } from './seo-xml.mjs';

const sitemapXml = (urls) => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((url) => `  <url><loc>${url.replaceAll('&', '&amp;')}</loc></url>`),
  '</urlset>',
].join('\n');

const rssXml = serializeRssFeed({
  title: 'Silan & Writing',
  description: 'AI <systems>',
  feedUrl: 'https://silan.tech/rss.xml',
  channelUrl: 'https://silan.tech/blog/',
  language: 'en',
  items: [{
    title: 'A < B',
    description: 'Research & notes',
    link: 'https://silan.tech/blog/a/',
    publishedAt: '2026-09-02T10:00:00Z',
    tags: ['AI & systems'],
  }],
});

test('validates exact sitemap and RSS content coverage', () => {
  assert.deepEqual(
    validateSeoArtifacts({
      sitemapXml: sitemapXml(['https://silan.tech/', 'https://silan.tech/blog/a/']),
      rssXml,
      expectedSitemapUrls: ['https://silan.tech/', 'https://silan.tech/blog/a/'],
      expectedRssUrls: ['https://silan.tech/blog/a/'],
      expectedFeedUrl: 'https://silan.tech/rss.xml',
    }),
    {
      sitemapUrlCount: 2,
      rssItemCount: 1,
      feedUrl: 'https://silan.tech/rss.xml',
    },
  );
});

test('rejects malformed XML and missing published content', () => {
  assert.throws(
    () => validateSeoArtifacts({ sitemapXml: '<urlset>', rssXml }),
    /not well-formed XML/,
  );
  assert.throws(
    () => validateSeoArtifacts({
      sitemapXml: sitemapXml(['https://silan.tech/']),
      rssXml,
      expectedRssUrls: ['https://silan.tech/blog/missing/'],
    }),
    /coverage mismatch.*missing/,
  );
});

test('binds the static release manifest to deployment provenance', () => {
  const manifest = JSON.stringify({
    version: 1,
    release_id: 'release-42',
    content_commit: 'commit-42',
    content_hash: 'hash-42',
    schema_version: 7,
    code_commit: 'code-42',
    frontend_artifact_sha256: 'digest-42',
    generated_at: '2026-09-02T10:00:00Z',
  });
  assert.equal(
    validateReleaseManifest(manifest, {
      release_id: 'release-42',
      content_commit: 'commit-42',
      content_hash: 'hash-42',
      schema_version: 7,
    }).content_commit,
    'commit-42',
  );
  assert.throws(
    () => validateReleaseManifest(manifest, { content_commit: 'other' }),
    /content_commit mismatch/,
  );
});
