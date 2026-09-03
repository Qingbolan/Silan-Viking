import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { URL } from 'node:url';

const XML_ENTITIES = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
  '<': '&lt;',
  '>': '&gt;',
};

export const escapeXml = (value) => String(value).replace(/[&"'<>]/g, (character) => XML_ENTITIES[character]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];

const assertWellFormedXml = (xml, label) => {
  const result = XMLValidator.validate(xml);
  if (result !== true) {
    const detail = result?.err
      ? `${result.err.msg} at line ${result.err.line}, column ${result.err.col}`
      : 'unknown XML syntax error';
    throw new Error(`${label} is not well-formed XML: ${detail}`);
  }
};

const requireNonEmptyText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be non-empty text`);
  }
  return value.trim();
};

const requireAbsoluteHttpUrl = (value, label) => {
  const text = requireNonEmptyText(value, label);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} must be an absolute URL: ${text}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must use HTTP or HTTPS: ${text}`);
  }
  return text;
};

const assertUnique = (values, label) => {
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new Error(`${label} contains duplicate URLs: ${[...new Set(duplicates)].join(', ')}`);
  }
};

const assertExactCoverage = (actual, expected, label) => {
  if (!expected) return;
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((value) => !actualSet.has(value));
  const unexpected = actual.filter((value) => !expectedSet.has(value));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label} coverage mismatch` +
      `${missing.length > 0 ? `; missing: ${missing.join(', ')}` : ''}` +
      `${unexpected.length > 0 ? `; unexpected: ${unexpected.join(', ')}` : ''}`,
    );
  }
};

const rssDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toUTCString();
};

export function serializeRssFeed({
  title,
  description,
  feedUrl,
  channelUrl,
  language,
  items,
}) {
  const latestDate = items
    .map((item) => new Date(item.publishedAt || ''))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())
    .at(-1);
  const itemXml = items.map((item) => {
    const published = rssDate(item.publishedAt);
    const categories = (item.tags || [])
      .filter((tag) => typeof tag === 'string' && tag.trim())
      .map((tag) => `      <category>${escapeXml(tag)}</category>`)
      .join('\n');
    return [
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(item.link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
      item.description && `      <description>${escapeXml(item.description)}</description>`,
      published && `      <pubDate>${published}</pubDate>`,
      categories,
      '    </item>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(channelUrl)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
    latestDate && `    <lastBuildDate>${rssDate(latestDate)}</lastBuildDate>`,
    itemXml,
    '  </channel>',
    '</rss>',
    '',
  ].filter(Boolean).join('\n');
}

export function validateSeoArtifacts({
  sitemapXml,
  rssXml,
  expectedSitemapUrls,
  expectedRssUrls,
  expectedFeedUrl,
}) {
  assertWellFormedXml(sitemapXml, 'sitemap.xml');
  assertWellFormedXml(rssXml, 'rss.xml');

  const sitemap = xmlParser.parse(sitemapXml);
  const sitemapEntries = asArray(sitemap?.urlset?.url);
  if (sitemapEntries.length === 0) {
    throw new Error('sitemap.xml must contain at least one <url> entry');
  }
  const sitemapUrls = sitemapEntries.map((entry, index) =>
    requireAbsoluteHttpUrl(entry?.loc, `sitemap.xml url[${index}] <loc>`));
  assertUnique(sitemapUrls, 'sitemap.xml');
  assertExactCoverage(sitemapUrls, expectedSitemapUrls, 'sitemap.xml');

  const rss = xmlParser.parse(rssXml);
  const rssRoot = rss?.rss;
  if (!rssRoot || String(rssRoot.version) !== '2.0') {
    throw new Error('rss.xml must have an RSS 2.0 <rss> root');
  }
  const channel = rssRoot.channel;
  if (!channel || Array.isArray(channel)) {
    throw new Error('rss.xml must contain exactly one <channel>');
  }
  requireNonEmptyText(channel.title, 'rss.xml channel title');
  requireNonEmptyText(channel.description, 'rss.xml channel description');
  requireAbsoluteHttpUrl(channel.link, 'rss.xml channel link');
  const selfLinks = asArray(channel['atom:link'])
    .filter((link) => link?.rel === 'self' && link?.type === 'application/rss+xml');
  if (selfLinks.length !== 1) {
    throw new Error('rss.xml must contain exactly one application/rss+xml atom:self link');
  }
  const feedUrl = requireAbsoluteHttpUrl(selfLinks[0].href, 'rss.xml atom:self href');
  if (expectedFeedUrl && feedUrl !== expectedFeedUrl) {
    throw new Error(`rss.xml atom:self href mismatch: expected ${expectedFeedUrl}, received ${feedUrl}`);
  }

  const rssItems = asArray(channel.item);
  const rssUrls = rssItems.map((item, index) => {
    requireNonEmptyText(item?.title, `rss.xml item[${index}] title`);
    const link = requireAbsoluteHttpUrl(item?.link, `rss.xml item[${index}] link`);
    const guid = requireAbsoluteHttpUrl(item?.guid?.['#text'] ?? item?.guid, `rss.xml item[${index}] guid`);
    if (guid !== link || (typeof item.guid === 'object' && String(item.guid.isPermaLink) !== 'true')) {
      throw new Error(`rss.xml item[${index}] guid must be the permalink`);
    }
    if (item.pubDate && Number.isNaN(new Date(item.pubDate).getTime())) {
      throw new Error(`rss.xml item[${index}] pubDate is invalid: ${item.pubDate}`);
    }
    return link;
  });
  assertUnique(rssUrls, 'rss.xml');
  assertExactCoverage(rssUrls, expectedRssUrls, 'rss.xml');

  return {
    sitemapUrlCount: sitemapUrls.length,
    rssItemCount: rssUrls.length,
    feedUrl,
  };
}

export function validateReleaseManifest(manifestJson, expected = {}) {
  let manifest;
  try {
    manifest = JSON.parse(manifestJson);
  } catch (error) {
    throw new Error(`release-manifest.json is not valid JSON: ${error.message}`);
  }
  if (manifest?.version !== 1) {
    throw new Error(`release-manifest.json version must be 1, received ${manifest?.version}`);
  }
  for (const field of ['release_id', 'content_commit', 'content_hash', 'code_commit', 'frontend_artifact_sha256']) {
    requireNonEmptyText(manifest[field], `release-manifest.json ${field}`);
  }
  if (!Number.isInteger(manifest.schema_version) || manifest.schema_version < 1) {
    throw new Error('release-manifest.json schema_version must be a positive integer');
  }
  if (Number.isNaN(new Date(manifest.generated_at).getTime())) {
    throw new Error('release-manifest.json generated_at must be a valid timestamp');
  }
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (expectedValue !== undefined && String(manifest[field]) !== String(expectedValue)) {
      throw new Error(
        `release-manifest.json ${field} mismatch: expected ${expectedValue}, received ${manifest[field]}`,
      );
    }
  }
  return manifest;
}
