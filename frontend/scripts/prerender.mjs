// scripts/prerender.mjs
//
// Post-build static prerender. A target is a named build profile:
// `--target <name>` loads `.env.<name>` and uses its public base/origin and API
// origin. The default target preserves the existing silan.tech build flow.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import sirv from 'sirv';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');
const REPO = resolve(FRONTEND, '..');
const DIST = join(FRONTEND, 'dist');

const BACKEND_PORT = 5200;
const SERVE_PORT = 4185;
const DB_PATH = join(REPO, '_deploy', 'api', 'portfolio.db');
const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

const TARGET = process.argv.includes('--target')
  ? process.argv[process.argv.indexOf('--target') + 1]
  : 'default';

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
const trimSlashes = (value) => value.replace(/^\/+|\/+$/g, '');

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const entries = {};
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

function targetEnv(name) {
  if (name === 'default') return {};
  const envPath = join(FRONTEND, `.env.${name}`);
  if (!existsSync(envPath)) {
    throw new Error(`unknown prerender target "${name}" — expected ${envPath}`);
  }
  return readEnvFile(envPath);
}

const profileEnv = targetEnv(TARGET);
const envValue = (key) => process.env[key] || profileEnv[key];
const normalizeBase = (value) => {
  if (!value || value === '/') return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
};
const apiOrigin = envValue('VITE_API_ORIGIN') || `http://localhost:${BACKEND_PORT}`;
const isLocalApiOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(apiOrigin);
const startLocalBackend =
  envValue('PRERENDER_START_LOCAL_BACKEND') === undefined
    ? isLocalApiOrigin
    : envValue('PRERENDER_START_LOCAL_BACKEND') === 'true';

const config = {
  name: envValue('PRERENDER_LABEL') || TARGET,
  base: normalizeBase(envValue('VITE_PUBLIC_BASE') || '/'),
  publicOrigin: trimTrailingSlash(envValue('VITE_PUBLIC_ORIGIN') || 'https://silan.tech'),
  apiOrigin,
  startLocalBackend,
};

const log = (m) => console.log(`[prerender:${config.name}] ${m}`);

const basePath = config.base === '/' ? '' : trimTrailingSlash(config.base);
const publicUrl = (route = '/') => {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${trimTrailingSlash(config.publicOrigin)}${basePath}${normalizedRoute}`;
};
const apiUrl = (path) => new URL(path, `${trimTrailingSlash(config.apiOrigin)}/`).toString();

const STATIC_ROUTES = ['/', '/blog/', '/projects/', '/ideas/', '/recent-updates/', '/contact/', '/search/'];

async function fetchJson(path) {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${path}`);
  return response.json();
}

const asArray = (j) =>
  Array.isArray(j) ? j : j?.posts || j?.projects || j?.ideas || j?.series || j?.episodes || j?.data || j?.list || [];

const routeDir = (route) => (route === '/' ? DIST : join(DIST, trimSlashes(route)));

const withTrailingSlash = (route) => {
  if (route === '/') return route;
  return route.endsWith('/') ? route : `${route}/`;
};

async function detailRoutes() {
  const routes = [];
  try {
    const blogs = asArray(await fetchJson('/api/v1/blog/posts?lang=en'));
    for (const b of blogs) {
      const seg = b.slug || b.id;
      if (seg) routes.push(`/blog/${seg}/`);
    }
  } catch (e) {
    log(`could not list blog posts: ${e.message}`);
  }
  try {
    const projects = asArray(await fetchJson('/api/v1/projects?lang=en'));
    for (const p of projects) {
      const seg = p.slug || p.id;
      if (seg) routes.push(`/projects/${seg}/`);
    }
  } catch (e) {
    log(`could not list projects: ${e.message}`);
  }
  try {
    const ideas = asArray(await fetchJson('/api/v1/ideas?lang=en'));
    for (const i of ideas) {
      const seg = i.id || i.slug;
      if (seg) routes.push(`/ideas/${seg}/`);
    }
  } catch (e) {
    log(`could not list ideas: ${e.message}`);
  }
  try {
    const series = asArray(await fetchJson('/api/v1/episodes/series?lang=en'));
    for (const s of series) {
      for (const episode of asArray(s.episodes)) {
        if (episode.slug) routes.push(`/episodes/${episode.slug}/`);
      }
    }
  } catch (e) {
    log(`could not list episodes: ${e.message}`);
  }
  return routes;
}

const priorityFor = (route) => {
  const normalized = route.replace(/\/$/, '') || '/';
  if (normalized === '/') return '1.0';
  if (/^\/(blog|projects|ideas)$/.test(normalized)) return '0.8';
  if (/^\/(blog|projects|ideas|episodes)\//.test(normalized)) return '0.7';
  return '0.6';
};

function writeSitemap(routes) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .map(
      (route) =>
        `  <url>\n    <loc>${publicUrl(withTrailingSlash(route))}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>${priorityFor(route)}</priority>\n  </url>`,
    )
    .join('\n');
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '\n</urlset>\n';
  writeFileSync(join(DIST, 'sitemap.xml'), xml, 'utf8');
}

function rewriteManifest() {
  const path = join(DIST, 'manifest.json');
  if (!existsSync(path)) return;
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const prefixPublicPath = (value) => {
    if (typeof value !== 'string' || /^(https?:)?\/\//i.test(value)) return value;
    if (basePath && (value === basePath || value.startsWith(`${basePath}/`))) return value;
    const raw = value.startsWith('/') ? value : `/${value}`;
    return `${basePath}${raw}` || raw;
  };
  manifest.icons = Array.isArray(manifest.icons)
    ? manifest.icons.map((icon) => ({ ...icon, src: prefixPublicPath(icon.src) }))
    : manifest.icons;
  manifest.id = `${basePath}/` || '/';
  manifest.start_url = `${basePath}/` || '/';
  manifest.scope = `${basePath}/` || '/';
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function rewriteHtmlMetadata(routes) {
  for (const route of routes) {
    const path = join(routeDir(route), 'index.html');
    if (!existsSync(path)) continue;
    const canonical = publicUrl(withTrailingSlash(route));
    let html = readFileSync(path, 'utf8');
    html = html.replace(/(rel="canonical"\s+href=")[^"]*(")/g, `$1${canonical}$2`);
    html = html.replace(/(property="og:url"\s+content=")[^"]*(")/g, `$1${canonical}$2`);
    writeFileSync(path, html, 'utf8');
  }
}

function writeRobots() {
  const disallowPrefix = basePath || '';
  const robots = [
    'User-agent: *',
    'Allow: /',
    '# Internal pages — not for indexing.',
    `Disallow: ${disallowPrefix}/search`,
    `Disallow: ${disallowPrefix}/gallery`,
    `Disallow: ${disallowPrefix}/design`,
    '',
    `Sitemap: ${publicUrl('/sitemap.xml')}`,
    '',
  ].join('\n');
  writeFileSync(join(DIST, 'robots.txt'), robots, 'utf8');
}

function walkFiles(dir, predicate, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) walkFiles(path, predicate, out);
    else if (predicate(path)) out.push(path);
  }
  return out;
}

function rewriteBuiltAssetPaths() {
  if (!basePath) return;
  const files = walkFiles(DIST, (path) => /\.(html|css)$/.test(path));
  const publicRoots = ['fonts', 'image.png', 'favicon.ico', 'manifest.json', 'avatar-'];
  for (const file of files) {
    let source = readFileSync(file, 'utf8');
    for (const root of publicRoots) {
      source = source.replaceAll(`"/${root}`, `"${basePath}/${root}`);
      source = source.replaceAll(`'/${root}`, `'${basePath}/${root}`);
      source = source.replaceAll(`(/${root}`, `(${basePath}/${root}`);
    }
    writeFileSync(file, source, 'utf8');
  }
}

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

const withTimeout = (promise, timeoutMs, label) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => {
      log(`WARNING: timed out while closing ${label}.`);
      resolve();
    }, timeoutMs)),
  ]);

async function ensureBackend() {
  if (!config.startLocalBackend) return { backend: null, backendUp: true };

  const healthUrl = apiUrl('/api/v1/resume');
  let backend = null;
  try {
    await waitForHttp(healthUrl, 1500);
    log('reusing the backend already running on :5200.');
    return { backend, backendUp: true };
  } catch {
    log('starting backend...');
    backend = spawn(
      'go',
      [
        'run', 'backend.go',
        '--port', String(BACKEND_PORT),
        '--db-driver', 'sqlite3',
        '--db-source', DB_PATH,
      ],
      { cwd: join(REPO, 'backend'), stdio: 'inherit' },
    );
  }

  try {
    await waitForHttp(healthUrl, 40000);
    log('backend is up.');
    return { backend, backendUp: true };
  } catch {
    log('WARNING: backend did not come up — prerendered pages will show the loading state.');
    return { backend, backendUp: false };
  }
}

function startStaticServer() {
  const assets = sirv(DIST, { dev: false, single: false });
  const server = createServer((req, res) => {
    const original = new URL(req.url || '/', `http://localhost:${SERVE_PORT}`);
    let pathname = original.pathname;

    if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
      pathname = pathname.slice(basePath.length) || '/';
    }
    req.url = `${pathname}${original.search}`;

    if (config.startLocalBackend && req.url.startsWith('/api')) {
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
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(readFileSync(join(DIST, 'index.html')));
    });
  });
  return new Promise((resolveServer) => {
    server.listen(SERVE_PORT, () => resolveServer(server));
  });
}

const chromeExecutablePath = () => CHROME_CANDIDATES.find((path) => existsSync(path));

async function main() {
  if (!existsSync(DIST)) {
    throw new Error('dist/ not found — run `vite build` first.');
  }

  const { backend, backendUp } = await ensureBackend();
  const server = await startStaticServer();
  log(`serving dist/ on http://localhost:${SERVE_PORT}${config.base}`);

  const detail = backendUp ? await detailRoutes() : [];
  const routes = [...new Set([...STATIC_ROUTES, ...detail].map(withTrailingSlash))];
  log(`${routes.length} routes to prerender (${detail.length} detail pages).`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromeExecutablePath(),
    args: ['--no-sandbox'],
  });
  for (const route of routes) {
    const page = await browser.newPage();
    const url = `http://localhost:${SERVE_PORT}${basePath}${route}`;
    log(`rendering ${route}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 300));
      const html = await page.content();
      const outDir = routeDir(route);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'index.html'), html, 'utf8');
    } catch (err) {
      log(`FAILED ${route}: ${err.message}`);
    }
    await page.close();
  }

  writeSitemap(routes);
  rewriteHtmlMetadata(routes);
  rewriteManifest();
  writeRobots();
  rewriteBuiltAssetPaths();
  log('wrote sitemap.xml, robots.txt and manifest.json');

  await withTimeout(browser.close(), 5000, 'browser');
  await new Promise((resolve) => server.close(resolve));
  if (backend) backend.kill('SIGTERM');
  log(backendUp ? 'done — pages prerendered with live content.' : 'done — pages prerendered (shell only).');
  process.exit(0);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
