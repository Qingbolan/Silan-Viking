// Merge silan-viking crawler artifacts into a Vite build.
//
// The Rust SiteProjector owns content visibility and emits
// site-crawler-routes.json. This script keeps the Vite shell as the browser
// runtime, then injects static route text into <div id="root"> so crawlers that
// do not execute JavaScript still receive content-specific HTML.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const seoDir = resolve(process.argv[2] || 'deploy/seo');
const distDir = resolve(process.argv[3] || 'dist');
const manifestPath = join(seoDir, 'site-crawler-routes.json');
const shellPath = join(distDir, 'index.html');

const log = (message) => console.log(`[crawler-html] ${message}`);

if (!existsSync(seoDir)) {
  log(`skipped: ${seoDir} does not exist`);
  process.exit(0);
}

copyStaticArtifacts(seoDir, distDir);

if (!existsSync(manifestPath)) {
  log('copied static crawler artifacts; no route manifest found');
  process.exit(0);
}

if (!existsSync(shellPath)) {
  throw new Error(`${shellPath} does not exist; run vite build first`);
}

const shell = readFileSync(shellPath, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const routes = Array.isArray(manifest.routes) ? manifest.routes : [];

for (const route of routes) {
  if (!route?.path || !route?.title) continue;
  const html = routeHtml(shell, route);
  const outFile = routeFile(distDir, route.path);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html, 'utf8');
}

log(`merged ${routes.length} crawler-readable route(s) into ${distDir}`);

function copyStaticArtifacts(from, to) {
  for (const entry of readdirSync(from)) {
    if (entry === 'site-crawler-routes.json' || entry === '.gitkeep') continue;
    const source = join(from, entry);
    const target = join(to, entry);
    const stats = statSync(source);
    if (stats.isDirectory()) {
      mkdirSync(target, { recursive: true });
      copyStaticArtifacts(source, target);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

function routeFile(root, routePath) {
  const normalized = routePath === '/' ? '/' : `/${routePath.replace(/^\/+|\/+$/g, '')}/`;
  return normalized === '/'
    ? join(root, 'index.html')
    : join(root, normalized, 'index.html');
}

function routeHtml(shellHtml, route) {
  const staticMarkup = crawlerMarkup(route);
  const description = compact(route.text).slice(0, 220);
  const url = route.url || route.path;
  const rootPattern = /<div id="root">(?:\s*<main data-silan-crawler-static="true"[\s\S]*?<\/main>\s*)?<\/div>/;
  let html = shellHtml.replace(rootPattern, `<div id="root">${staticMarkup}</div>`);

  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)} | Silan Hu</title>`);
  html = replaceMeta(html, 'name="description"', description);
  html = replaceMeta(html, 'property="og:title"', route.title);
  html = replaceMeta(html, 'property="og:description"', description);
  html = replaceMeta(html, 'property="og:url"', url);
  html = replaceMeta(html, 'name="twitter:title"', route.title);
  html = replaceMeta(html, 'name="twitter:description"', description);
  html = html.replace(/(<link[^>]+rel="canonical"[^>]+href=")[^"]*("[^>]*>)/, `$1${escapeAttr(url)}$2`);
  return html;
}

function crawlerMarkup(route) {
  const tags = Array.isArray(route.tags) ? route.tags : [];
  const paragraphs = String(route.text || '')
    .split(/\n{2,}|\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('\n');
  const tagMarkup = tags.length
    ? `<p><strong>Tags:</strong> ${escapeHtml(tags.join(', '))}</p>`
    : '';

  return [
    '<main data-silan-crawler-static="true" style="max-width: 760px; margin: 48px auto; padding: 0 24px; font-family: Inter, system-ui, sans-serif; line-height: 1.65; color: #171717;">',
    `<article><h1 style="font-size: 2rem; line-height: 1.15; margin: 0 0 16px;">${escapeHtml(route.title)}</h1>`,
    tagMarkup,
    paragraphs,
    '</article></main>',
  ].join('\n');
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html;
}

function replaceMeta(html, selector, content) {
  const escaped = escapeAttr(content);
  const pattern = new RegExp(`(<meta[^>]+${selector}[^>]+content=")[^"]*("[^>]*>)`);
  if (pattern.test(html)) return html.replace(pattern, `$1${escaped}$2`);
  const insertAt = html.indexOf('</head>');
  if (insertAt === -1) return html;
  return `${html.slice(0, insertAt)}  <meta ${selector} content="${escaped}">\n${html.slice(insertAt)}`;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
