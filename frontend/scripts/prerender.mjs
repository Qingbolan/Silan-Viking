// scripts/prerender.mjs
//
// Post-build static prerender. After `vite build`, this:
//   1. starts the Go backend (so API-driven content is real),
//   2. serves dist/ with an /api proxy to the backend,
//   3. opens every static route in headless Chromium, waits for the
//      network to go idle (data loaded), and snapshots the rendered HTML,
//   4. writes each route back to dist/<route>/index.html.
//
// Detail pages (/blog/:id, /projects/:id, /ideas/:id) are NOT prerendered
// here — they stay client-rendered with react-helmet driving their <head>.
//
// Run via `npm run build:seo`. Plain `npm run build` is untouched, so CI
// without a backend still produces a normal SPA build.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import sirv from 'sirv';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');
const REPO = resolve(FRONTEND, '..');
const DIST = join(FRONTEND, 'dist');

const BACKEND_PORT = 5200;
const SERVE_PORT = 4185;
const DB_PATH = join(REPO, '_deploy', 'api', 'portfolio.db');

// Static, indexable routes — always prerendered.
const STATIC_ROUTES = ['/', '/blog', '/projects', '/ideas', '/plans', '/recent-updates', '/contact'];

/** Fetch JSON from the running backend. */
const fetchJson = (path) =>
  new Promise((res, rej) => {
    http
      .get(`http://localhost:${BACKEND_PORT}${path}`, (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            res(JSON.parse(d));
          } catch {
            rej(new Error(`bad JSON from ${path}`));
          }
        });
      })
      .on('error', rej);
  });

/** Normalise a list response to an array. */
const asArray = (j) =>
  Array.isArray(j) ? j : j?.posts || j?.projects || j?.ideas || j?.data || j?.list || [];

/**
 * Collect every detail-page route from the backend:
 * /blog/:slug, /projects/:id, /ideas/:id.
 */
async function detailRoutes() {
  const routes = [];
  try {
    const blogs = asArray(await fetchJson('/api/v1/blog/posts?lang=en'));
    for (const b of blogs) {
      const seg = b.slug || b.id;
      if (seg) routes.push(`/blog/${seg}`);
    }
  } catch (e) {
    log(`could not list blog posts: ${e.message}`);
  }
  try {
    const projects = asArray(await fetchJson('/api/v1/projects?lang=en'));
    for (const p of projects) if (p.id) routes.push(`/projects/${p.id}`);
  } catch (e) {
    log(`could not list projects: ${e.message}`);
  }
  try {
    const ideas = asArray(await fetchJson('/api/v1/ideas?lang=en'));
    for (const i of ideas) if (i.id) routes.push(`/ideas/${i.id}`);
  } catch (e) {
    log(`could not list ideas: ${e.message}`);
  }
  return routes;
}

const SITE_URL = 'https://silan.tech';

const log = (m) => console.log(`[prerender] ${m}`);

/** Per-route sitemap priority. */
const priorityFor = (route) => {
  if (route === '/') return '1.0';
  if (/^\/(blog|projects|ideas)$/.test(route)) return '0.8';
  if (/^\/(blog|projects|ideas)\//.test(route)) return '0.7';
  return '0.6';
};

/** Write dist/sitemap.xml covering every prerendered route. */
function writeSitemap(routes) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map(
      (r) =>
        `  <url>\n    <loc>${SITE_URL}${r}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>${priorityFor(r)}</priority>\n  </url>`,
    )
    .join('\n');
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '\n</urlset>\n';
  writeFileSync(join(DIST, 'sitemap.xml'), xml, 'utf8');
}

/** Wait until an HTTP endpoint answers, or time out. */
const waitForHttp = (url, timeoutMs = 30000) =>
  new Promise((res, rej) => {
    const started = Date.now();
    const tick = () => {
      http
        .get(url, (r) => {
          r.resume();
          res();
        })
        .on('error', () => {
          if (Date.now() - started > timeoutMs) rej(new Error(`timeout waiting for ${url}`));
          else setTimeout(tick, 500);
        });
    };
    tick();
  });

async function main() {
  if (!existsSync(DIST)) {
    throw new Error('dist/ not found — run `vite build` first.');
  }

  // 1. Backend — reuse one already on :5200, else start our own.
  const apiUrl = `http://localhost:${BACKEND_PORT}/api/v1/resume`;
  let backend = null;
  let backendUp = false;
  try {
    await waitForHttp(apiUrl, 1500);
    backendUp = true;
    log('reusing the backend already running on :5200.');
  } catch {
    log('starting backend…');
    backend = spawn(
      'go',
      [
        'run', 'backend.go',
        '--port', String(BACKEND_PORT),
        // Pass both — the backend only honours --db-source when --db-driver
        // is also set (else it resets the source to its default).
        '--db-driver', 'sqlite3',
        '--db-source', DB_PATH,
      ],
      { cwd: join(REPO, 'backend'), stdio: 'inherit' },
    );
    try {
      await waitForHttp(apiUrl, 40000);
      backendUp = true;
      log('backend is up.');
    } catch {
      log('WARNING: backend did not come up — prerendered pages will show the loading state.');
    }
  }

  // 2. Serve dist/ with an /api proxy to the backend.
  const assets = sirv(DIST, { dev: false, single: false });
  const server = createServer((req, res) => {
    if (req.url.startsWith('/api')) {
      const proxy = http.request(
        { host: 'localhost', port: BACKEND_PORT, path: req.url, method: req.method, headers: req.headers },
        (pr) => {
          res.writeHead(pr.statusCode || 502, pr.headers);
          pr.pipe(res);
        },
      );
      proxy.on('error', () => {
        res.writeHead(502);
        res.end('backend unavailable');
      });
      req.pipe(proxy);
      return;
    }
    assets(req, res, () => {
      // SPA fallback — serve index.html for unknown paths.
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(join(DIST, 'index.html')));
    });
  });
  await new Promise((r) => server.listen(SERVE_PORT, r));
  log(`serving dist/ on http://localhost:${SERVE_PORT}`);

  // 3. Build the full route list — static routes + every detail page.
  const detail = backendUp ? await detailRoutes() : [];
  const routes = [...STATIC_ROUTES, ...detail];
  log(`${routes.length} routes to prerender (${detail.length} detail pages).`);

  // 4. Render each route in headless Chromium.
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  for (const route of routes) {
    const page = await browser.newPage();
    const url = `http://localhost:${SERVE_PORT}${route}`;
    log(`rendering ${route}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      // Give react-helmet a beat to flush <head>.
      await new Promise((r) => setTimeout(r, 300));
      const html = await page.content();
      const outDir = route === '/' ? DIST : join(DIST, route);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'index.html'), html, 'utf8');
    } catch (err) {
      log(`FAILED ${route}: ${err.message}`);
    }
    await page.close();
  }

  // 5. Write sitemap.xml — every prerendered route.
  writeSitemap(routes);
  log('wrote sitemap.xml');

  // 6. Tear down.
  await browser.close();
  server.close();
  if (backend) backend.kill('SIGTERM');
  log(backendUp ? 'done — pages prerendered with live content.' : 'done — pages prerendered (shell only).');
  process.exit(0);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
