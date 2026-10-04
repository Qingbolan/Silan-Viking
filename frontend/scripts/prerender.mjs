// scripts/prerender.mjs
//
// Post-build static prerender. A target is a named build profile:
// `--target <name>` loads `.env.<name>` and uses its public base/origin and API
// origin. The default target preserves the existing silan.tech build flow.
/* global document, fetch, URL, window */
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
  rmSync,
} from 'node:fs';
import sirv from 'sirv';
import puppeteer from 'puppeteer';
import siteProfile from '../site-profile.json' with { type: 'json' };
import { escapeXml, serializeRssFeed, validateSeoArtifacts } from './seo-xml.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');
const REPO = resolve(FRONTEND, '..');
const DIST = join(FRONTEND, 'dist');

const BACKEND_PORT = 5200;
const SERVE_PORT = 4185;
const DB_PATH = join(REPO, '_deploy', 'api', 'portfolio.db');
const DB_SOURCE = `${DB_PATH}?_fk=1`;
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
  canonicalBase: normalizeBase(envValue('VITE_CANONICAL_BASE') || envValue('VITE_PUBLIC_BASE') || '/'),
  canonicalOrigin: trimTrailingSlash(
    envValue('VITE_CANONICAL_ORIGIN') || envValue('VITE_PUBLIC_ORIGIN') || 'https://silan.tech',
  ),
  apiOrigin,
  startLocalBackend,
};

const log = (m) => console.log(`[prerender:${config.name}] ${m}`);

const basePath = config.base === '/' ? '' : trimTrailingSlash(config.base);
const canonicalBasePath = config.canonicalBase === '/' ? '' : trimTrailingSlash(config.canonicalBase);
const publicUrl = (route = '/') => {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${trimTrailingSlash(config.publicOrigin)}${basePath}${normalizedRoute}`;
};
const canonicalUrl = (route = '/') => {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${trimTrailingSlash(config.canonicalOrigin)}${canonicalBasePath}${normalizedRoute}`;
};
const apiUrl = (path) => new URL(path, `${trimTrailingSlash(config.apiOrigin)}/`).toString();

const LANGUAGES = ['en', 'zh'];
const CHINESE_ROUTE_PREFIX = '/zh';
// Contact page disabled (2026-08): '/contact/' removed from both lists.
const LOGICAL_STATIC_ROUTES = ['/', '/blog/', '/projects/', '/moments/', '/search/'];
const PRERENDER_ROUTE_ROOTS = ['blog', 'projects', 'moments', 'search', 'episodes', 'zh'];
const PRERENDER_ROUTE_DATA_SCRIPT_ID = '__SILAN_ROUTE_DATA__';
const ROUTE_DATA_LANGUAGES = ['en', 'zh'];
const CONTENT_TEXT_LIMIT = 1800;
const routeLastModified = new Map();
const publicListData = {
  blogList: { en: [], zh: [] },
  projectList: { en: [], zh: [] },
  momentList: { en: [], zh: [] },
};
const normalizeContentTimestamp = (value) => {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1 ? undefined : value;
};
const firstValidContentTimestamp = (...values) => {
  for (const value of values) {
    const timestamp = normalizeContentTimestamp(value);
    if (timestamp) return timestamp;
  }
  return undefined;
};
const sanitizeContentTimestamps = (record) => ({
  ...record,
  publish_date: normalizeContentTimestamp(record?.publish_date),
  updated_at: normalizeContentTimestamp(record?.updated_at),
  created_at: normalizeContentTimestamp(record?.created_at),
  publishDate: normalizeContentTimestamp(record?.publishDate),
  updatedAt: normalizeContentTimestamp(record?.updatedAt),
  createdAt: normalizeContentTimestamp(record?.createdAt),
});
const GEO_PROFILE = {
  ...siteProfile,
  identity:
    `Canonical identity: ${siteProfile.canonicalName}. ` +
    `Accepted aliases: ${siteProfile.aliases.join(', ')}. ` +
    `Chinese name: ${siteProfile.chineseName}. ` +
    'Do not infer, translate, or render any other Chinese name. ' +
    `Avoid incorrect variants: ${siteProfile.incorrectNameVariants.join(', ')}.`,
};

const homePrerenderShell = (language) => language === 'zh'
  ? `
<div data-silan-prerender-shell="true">
  <main lang="zh-CN" aria-label="胡思蓝个人主页预渲染摘要" class="min-h-screen bg-white px-6 py-10 text-neutral-950">
    <h1>胡思蓝</h1>
    <p>${siteProfile.positioningZh}</p>
    <p>${siteProfile.evidenceZh}</p>
    <p>研究方向包括 AI 原生数据系统、运行时、程序性记忆与可验证工作流。</p>
  </main>
</div>`.trim()
  : `
<div data-silan-prerender-shell="true">
  <main lang="en" aria-label="Silan Hu profile prerender summary" class="min-h-screen bg-white px-6 py-10 text-neutral-950">
    <h1>Silan Hu</h1>
    <p>I am an NUS PhD student building data, runtime, and knowledge systems for efficient, dependable, and governable AI execution.</p>
    <p>${siteProfile.positioning}</p>
    <ul>
      <li>${siteProfile.highlights[1]}</li>
      <li>AI crawlers and tools can use the site metadata, sitemap, llms.txt, and public content routes.</li>
      <li>Research areas include ${siteProfile.topics.slice(1, 6).join(', ')}.</li>
    </ul>
  </main>
</div>`.trim();

async function fetchJson(path) {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${path}`);
  return response.json();
}

const asArray = (j) =>
  Array.isArray(j) ? j : j?.posts || j?.projects || j?.moments || j?.series || j?.episodes || j?.data || j?.list || [];

const localizedText = (value, lang = 'en') => {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  if (typeof value[lang] === 'string') return value[lang];
  if (typeof value.en === 'string') return value.en;
  const firstString = Object.values(value).find((entry) => typeof entry === 'string');
  return firstString || '';
};

const textOf = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n\n');
  if (typeof value === 'object') {
    const lang = typeof value.canonical_lang === 'string' ? value.canonical_lang : 'en';
    if (typeof value.content === 'string') return value.content;
    if (value.content && typeof value.content === 'object') return localizedText(value.content, lang);
    if (typeof value.body === 'string') return value.body;
    if (value.body && typeof value.body === 'object') return localizedText(value.body, lang);
    if (typeof value.markdown === 'string') return value.markdown;
    if (value.markdown && typeof value.markdown === 'object') return localizedText(value.markdown, lang);
    if (typeof value.text === 'string') return value.text;
    if (value.text && typeof value.text === 'object') return localizedText(value.text, lang);
    if (Array.isArray(value.parts)) return textOf(value.parts);
    if (Array.isArray(value.entries)) return textOf(value.entries);
    return '';
  }
  return '';
};

const clipText = (value, limit = CONTENT_TEXT_LIMIT) => {
  const compact = textOf(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (compact.length <= limit) return compact;
  return `${compact.slice(0, limit).trimEnd()}\n...`;
};

const shortSummary = (...values) => {
  for (const value of values) {
    const compact = textOf(value).replace(/\s+/g, ' ').trim();
    if (!compact) continue;
    if (compact.length > 320 || compact.startsWith('#')) continue;
    return compact;
  }
  return '';
};

const projectDetailText = (detail, project) => {
  const parts = asArray(detail?.parts);
  if (parts.length > 0) return clipText(parts);
  return clipText([
    detail?.detailed_description,
    detail?.goals,
    detail?.challenges,
    detail?.solutions,
    detail?.lessons,
    detail?.quick_start,
    project?.description,
  ]);
};

const projectAvailabilityContext = (slug) => slug === 'silan-viking'
  ? [
      'Availability boundary:',
      '- Public v1.0.0: CLI workspace initialization, the earlier idea/update content model, articles, projects, episodes, resume data, validation, indexing, relations, proposals, and site/MCP adapters.',
      '- Current main source only: the renamed Moment model, Tauri desktop workbench, guided onboarding, dictation, and richer delivery checks shown on silan.tech.',
      '- Packaged desktop onboarding and direct cross-device synchronization are not released.',
    ].join('\n')
  : '';

const absolutePublicUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  const path = value.startsWith('/') ? value : `/${value}`;
  return value.startsWith('/api/')
    ? `${trimTrailingSlash(config.publicOrigin)}${path}`
    : publicUrl(path);
};

const routeDir = (route) => (route === '/' ? DIST : join(DIST, trimSlashes(route)));

const withTrailingSlash = (route) => {
  if (route === '/') return route;
  return route.endsWith('/') ? route : `${route}/`;
};

const logicalRoute = (route) => {
  const normalized = route.startsWith('/') ? route : `/${route}`;
  if (normalized === CHINESE_ROUTE_PREFIX || normalized === `${CHINESE_ROUTE_PREFIX}/`) return '/';
  if (normalized.startsWith(`${CHINESE_ROUTE_PREFIX}/`)) {
    return normalized.slice(CHINESE_ROUTE_PREFIX.length) || '/';
  }
  return normalized;
};

const routeLanguage = (route) =>
  route === CHINESE_ROUTE_PREFIX || route.startsWith(`${CHINESE_ROUTE_PREFIX}/`)
    ? 'zh'
    : 'en';

const localizedRoute = (route, language) => {
  const logical = logicalRoute(route);
  if (language !== 'zh') return withTrailingSlash(logical);
  return logical === '/'
    ? `${CHINESE_ROUTE_PREFIX}/`
    : withTrailingSlash(`${CHINESE_ROUTE_PREFIX}${logical}`);
};

const recordLastModified = (record) => {
  const value = firstValidContentTimestamp(
    record?.updatedAt,
    record?.updated_at,
    record?.publish_date,
    record?.publishDate,
    record?.date,
  );
  return value ? value.slice(0, 10) : undefined;
};
const seriesLastModified = (series) => {
  const timestamps = [
    recordLastModified(series),
    ...asArray(series?.episodes).map(recordLastModified),
  ].filter(Boolean).sort();
  return timestamps.at(-1);
};
const seriesRouteRecord = (series) => ({
  ...series,
  updated_at: seriesLastModified(series),
});

const registerPublicRoute = (routes, route, language, record) => {
  const localized = localizedRoute(route, language);
  routes.push(localized);
  const lastModified = recordLastModified(record);
  if (lastModified) routeLastModified.set(localized, lastModified);
};

async function detailRoutes() {
  const routes = [];
  for (const language of LANGUAGES) {
    try {
      const localizedBlogs = asArray(
        await fetchJson(`/api/v1/blog/posts?lang=${language}&size=100`),
      );
      publicListData.blogList[language] =
        localizedBlogs.map(sanitizeContentTimestamps);
      for (const blog of localizedBlogs) {
        const segment = blog.slug || blog.id;
        if (segment) registerPublicRoute(routes, `/blog/${segment}/`, language, blog);
      }
    } catch (e) {
      log(`could not list ${language} blog posts: ${e.message}`);
    }
  }

  for (const language of LANGUAGES) {
    try {
      const localizedProjects = asArray(
        await fetchJson(`/api/v1/projects?lang=${language}&size=100`),
      );
      publicListData.projectList[language] =
        localizedProjects.map(sanitizeContentTimestamps);
      for (const project of localizedProjects) {
        const segment = project.slug || project.id;
        if (segment) {
          registerPublicRoute(routes, `/projects/${segment}/`, language, project);
          const detail = await fetchJson(`/api/v1/projects/${encodeURIComponent(project.id)}/detail?lang=${language}`);
          for (const part of detail.parts ?? []) {
            const hasContent = (part.entries?.length ?? 0) > 0 || Object.values(part.body ?? {}).some(body => String(body).trim());
            if (part.role !== 'overview' && hasContent) {
              registerPublicRoute(routes, `/projects/${segment}/${encodeURIComponent(part.role)}/`, language, project);
            }
          }
          registerPublicRoute(routes, `/projects/${segment}/feedback/`, language, project);
        }
      }
    } catch (e) {
      log(`could not list ${language} projects: ${e.message}`);
    }
  }

  for (const language of LANGUAGES) {
    try {
      const series = asArray(
        await fetchJson(`/api/v1/episodes/series?lang=${language}`),
      );
      for (const item of series) {
        if (item.slug) {
          registerPublicRoute(
            routes,
            `/episodes/series/${item.slug}/`,
            language,
            seriesRouteRecord(item),
          );
        }
        for (const episode of asArray(item.episodes)) {
          if (episode.slug) {
            registerPublicRoute(
              routes,
              `/episodes/${episode.slug}/`,
              language,
              episode,
            );
          }
        }
      }
    } catch (e) {
      log(`could not list ${language} episodes: ${e.message}`);
    }
  }

  for (const language of LANGUAGES) {
    try {
      const moments = asArray(await fetchJson(`/api/v1/moments?lang=${language}`));
      publicListData.momentList[language] = moments.map((moment) => ({
        ...sanitizeContentTimestamps(moment),
        related_outputs: asArray(moment.related_outputs)
          .filter((output) => {
            const list = output.kind === 'blog'
              ? publicListData.blogList[language]
              : output.kind === 'project'
                ? publicListData.projectList[language]
                : [];
            return list.some((entry) =>
              [entry.id, entry.slug].filter(Boolean).some((key) =>
                key === output.id || key === output.slug,
              ),
            );
          })
          .map((output) => ({
            ...output,
            date: normalizeContentTimestamp(output.date),
          })),
      }));
      for (const moment of moments) {
        const segment = moment.slug || moment.id;
        if (segment) registerPublicRoute(routes, `/moments/${segment}/`, language, moment);
      }
    } catch (e) {
      log(`could not list ${language} moments: ${e.message}`);
    }
  }

  return [...new Set(routes)];
}

const detailEndpointForBlogRoute = (route) => {
  const match = route.match(/^\/blog\/([^/]+)\/?$/);
  if (!match) return null;
  const key = decodeURIComponent(match[1]);
  const encoded = encodeURIComponent(key);
  return key.startsWith('i_')
    ? `/api/v1/blog/posts/id/${encoded}`
    : `/api/v1/blog/posts/${encoded}`;
};

async function routeDataFor(route) {
  const logical = logicalRoute(route);
  const blogEndpoint = detailEndpointForBlogRoute(logical);
  if (!blogEndpoint) return null;

  const resources = {};
  const blog = {};
  const observedLastModified = [];
  for (const lang of ROUTE_DATA_LANGUAGES) {
    try {
      const resource = sanitizeContentTimestamps(
        await fetchJson(`${blogEndpoint}?lang=${lang}`),
      );
      const lastModified = recordLastModified(resource);
      if (lastModified) observedLastModified.push(lastModified);
      if (resource) blog[lang] = resource;
    } catch (e) {
      log(`could not embed ${lang} blog route data for ${logical}: ${e.message}`);
    }
  }

  if (observedLastModified.length) {
    routeLastModified.set(route, observedLastModified.sort().at(-1));
  }
  if (Object.keys(blog).length) resources.blog = blog;
  return { route: withTrailingSlash(logical), resources };
}

const HTML_JSON_ESCAPE = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

const escapeJsonForHtml = (value) =>
  JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => HTML_JSON_ESCAPE[char]);

function injectRouteData(html, routeData) {
  if (!routeData) return html;
  const payload = escapeJsonForHtml(routeData);
  const script = `<script id="${PRERENDER_ROUTE_DATA_SCRIPT_ID}" type="application/json">${payload}</script>`;
  return html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
}

const filteredListForRequest = (entries, url, kind) => {
  let filtered = [...entries];
  const status = url.searchParams.get('status');
  const featured = url.searchParams.get('featured');
  const search = url.searchParams.get('search')?.trim().toLowerCase();
  if (status) filtered = filtered.filter((entry) => entry.status === status);
  if (featured === 'true') {
    filtered = filtered.filter((entry) => Boolean(entry.is_featured ?? entry.isFeatured));
  }
  if (search) {
    filtered = filtered.filter((entry) => {
      const title = kind === 'projects' ? entry.name || entry.title : entry.title;
      return [title, entry.description, entry.summary, entry.excerpt]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }
  return filtered;
};

async function installPublicListInterception(page) {
  const blogLists = publicListData.blogList;
  const projectLists = publicListData.projectList;
  const momentLists = publicListData.momentList;
  if (!blogLists && !projectLists && !momentLists) return;

  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.method() !== 'GET') {
      await request.continue();
      return;
    }
    const url = new URL(request.url());
    const language = url.searchParams.get('lang')?.startsWith('zh') ? 'zh' : 'en';
    const config = url.pathname === '/api/v1/blog/posts'
      ? { entries: blogLists?.[language], key: 'posts' }
      : url.pathname === '/api/v1/projects'
        ? { entries: projectLists?.[language], key: 'projects' }
        : url.pathname === '/api/v1/moments'
          ? { entries: momentLists?.[language], key: 'moments' }
        : null;
    if (!config?.entries) {
      await request.continue();
      return;
    }
    const entries = filteredListForRequest(config.entries, url, config.key);
    await request.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        [config.key]: entries,
        total: entries.length,
        page: 1,
        size: entries.length,
        total_pages: entries.length ? 1 : 0,
      }),
    });
  });
}

async function preparePrerenderedPage(page, route) {
  const logical = logicalRoute(route);
  const language = routeLanguage(route);
  await page.evaluate((currentRoute, homeShell) => {
    document
      .querySelectorAll(
        [
          '#googleidentityservice_button_styles',
        ].join(','),
      )
      .forEach((node) => node.remove());

    if (currentRoute !== '/') return;
    const root = document.getElementById('root');
    if (!root) return;
    root.innerHTML = homeShell;
  }, logical, homePrerenderShell(language));
}

async function llmsEntries() {
  const entries = [];
  try {
    const resume = await fetchJson('/api/v1/resume?lang=en');
    const personal = resume.personal_info || {};
    const parts = asArray(resume.parts);
    const publicResumeText = [
      personal.full_name && `Name: ${personal.full_name}`,
      personal.title && `Title: ${personal.title}`,
      personal.current_status && `Current focus: ${personal.current_status}`,
      clipText(parts, 2400),
    ].filter(Boolean).join('\n\n');

    entries.push({
      kind: 'Profile',
      title: personal.full_name || 'Silan Hu',
      path: '/',
      summary: shortSummary(personal.current_status, personal.title),
      tags: ['profile', 'resume', 'AI systems research', 'executable agents'],
      text: publicResumeText,
    });
  } catch (e) {
    log(`could not build llms resume entry: ${e.message}`);
  }

  try {
    const blogs = asArray(await fetchJson('/api/v1/blog/posts?lang=en&size=100'));
    for (const blog of blogs) {
      const slug = blog.slug || blog.id;
      if (!slug) continue;
      let detail = blog;
      try {
        detail = await fetchJson(`/api/v1/blog/posts/${encodeURIComponent(slug)}?lang=en`);
      } catch (e) {
        log(`could not fetch blog detail for ${slug}: ${e.message}`);
      }
      entries.push({
        kind: 'Blog',
        title: detail.title || blog.title || slug,
        path: `/blog/${slug}/`,
        summary: shortSummary(detail.summary, blog.summary),
        tags: detail.tags || blog.tags || [],
        text: clipText(detail.content || detail.parts || detail.summary || blog.summary),
      });
    }
  } catch (e) {
    log(`could not build llms blog entries: ${e.message}`);
  }

  try {
    const projects = asArray(await fetchJson('/api/v1/projects?lang=en&size=100'));
    for (const project of projects) {
      const slug = project.slug || project.id;
      if (!slug) continue;
      let basic = project;
      try {
        basic = await fetchJson(`/api/v1/projects/${encodeURIComponent(slug)}?lang=en`);
      } catch (e) {
        log(`could not fetch project record for ${slug}: ${e.message}`);
      }
      let detail = {};
      const projectId = basic.id || project.id;
      if (projectId) {
        try {
          detail = await fetchJson(
            `/api/v1/projects/${encodeURIComponent(projectId)}/detail?lang=en`,
          );
        } catch (e) {
          log(`could not fetch project detail for ${slug}: ${e.message}`);
        }
      }
      entries.push({
        kind: 'Project',
        slug,
        title: basic.name || basic.title || project.name || slug,
        path: `/projects/${slug}/`,
        summary: shortSummary(
          basic.summary,
          basic.description,
          project.summary,
          project.description,
        ),
        tags: basic.tags || project.tags || [],
        text: [
          projectAvailabilityContext(slug),
          projectDetailText(detail, basic),
        ].filter(Boolean).join('\n\n'),
        repository: basic.github_url || project.github_url,
        documentation: basic.documentation_url || project.documentation_url,
        demo: basic.demo_url || project.demo_url,
        version: detail.version,
        license: detail.license,
        image: basic.thumbnail_url || project.thumbnail_url,
        dateModified: normalizeContentTimestamp(
          basic.updated_at || detail.updated_at || project.updated_at,
        ),
      });
    }
  } catch (e) {
    log(`could not build llms project entries: ${e.message}`);
  }

  try {
    const moments = asArray(await fetchJson('/api/v1/moments?lang=en'));
    for (const moment of moments) {
      const slug = moment.slug || moment.id;
      if (!slug) continue;
      entries.push({
        kind: 'Moment',
        title: moment.title || slug,
        path: `/moments/${slug}/`,
        summary: shortSummary(moment.summary, moment.description),
        tags: moment.tags || [],
        text: clipText(moment.description),
      });
    }
  } catch (e) {
    log(`could not build llms moment entries: ${e.message}`);
  }

  try {
    const series = asArray(await fetchJson('/api/v1/episodes/series?lang=en'));
    for (const item of series) {
      const firstEpisode = asArray(item.episodes)[0];
      entries.push({
        kind: 'Episode Series',
        title: item.title || item.slug || item.id,
        path: firstEpisode?.slug ? `/episodes/${firstEpisode.slug}/` : '/blog/',
        summary: shortSummary(item.summary, item.description),
        tags: ['episode-series'],
        text: clipText(item.description || ''),
      });
      for (const episode of asArray(item.episodes)) {
        const slug = episode.slug || episode.id;
        if (!slug) continue;
        let detail = episode;
        try {
          detail = await fetchJson(`/api/v1/episodes/${encodeURIComponent(slug)}?lang=en`);
        } catch (e) {
          log(`could not fetch episode detail for ${slug}: ${e.message}`);
        }
        entries.push({
          kind: 'Episode',
          title: detail.title || episode.title || slug,
          path: `/episodes/${slug}/`,
          summary: shortSummary(detail.summary, detail.description, episode.summary, episode.description),
          tags: ['episode'],
          text: clipText(detail.content || detail.parts || detail.summary || detail.description),
        });
      }
    }
  } catch (e) {
    log(`could not build llms episode entries: ${e.message}`);
  }
  return entries;
}

const structuredLicenseUrl = (license) => {
  if (typeof license !== 'string' || !license.trim()) return undefined;
  if (/^https?:\/\//i.test(license)) return license;
  return /^apache(?: license)?[- ]?2(?:\.0)?$/i.test(license.trim())
    ? 'https://www.apache.org/licenses/LICENSE-2.0'
    : license;
};

function writeSiteIndex(entries) {
  const personId = `${canonicalUrl('/')}#person`;
  const websiteId = `${canonicalUrl('/')}#website`;
  const contentIndexId = `${canonicalUrl('/site-index.jsonld')}#public-content`;
  const project = entries.find(
    (entry) => entry.kind === 'Project' && entry.slug === 'silan-viking',
  );

  const graph = [
    {
      '@type': 'Person',
      '@id': personId,
      name: GEO_PROFILE.canonicalName,
      alternateName: Array.from(new Set([
        ...GEO_PROFILE.aliases,
        GEO_PROFILE.chineseName,
      ])),
      url: canonicalUrl('/'),
      image: canonicalUrl('/image.png'),
      jobTitle: GEO_PROFILE.jobTitle,
      description: GEO_PROFILE.positioning,
      sameAs: GEO_PROFILE.sameAs,
      affiliation: {
        '@type': 'CollegeOrUniversity',
        name: GEO_PROFILE.affiliation.name,
        url: GEO_PROFILE.affiliation.url,
      },
      knowsAbout: GEO_PROFILE.topics,
    },
    {
      '@type': 'WebSite',
      '@id': websiteId,
      name: GEO_PROFILE.homeTitle,
      url: canonicalUrl('/'),
      description: GEO_PROFILE.homeDescription,
      inLanguage: ['en', 'zh-Hans'],
      author: { '@id': personId },
      publisher: { '@id': personId },
      mainEntity: { '@id': personId },
      hasPart: { '@id': contentIndexId },
    },
    {
      '@type': 'ItemList',
      '@id': contentIndexId,
      name: 'Public research, projects, and writing by Silan Hu',
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': entry.kind === 'Project' ? 'SoftwareSourceCode' : 'CreativeWork',
          name: entry.title,
          url: canonicalUrl(entry.path),
          ...(entry.summary && { description: entry.summary }),
          author: { '@id': personId },
          isPartOf: { '@id': websiteId },
        },
      })),
    },
  ];

  if (project) {
    const projectUrl = canonicalUrl(project.path);
    graph.push({
      '@type': ['SoftwareApplication', 'SoftwareSourceCode'],
      '@id': `${projectUrl}#software`,
      name: project.title,
      alternateName: ['Silan Viking', 'Silan-Viking'],
      url: projectUrl,
      description: project.summary,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Linux',
      ...(project.version && { softwareVersion: project.version }),
      ...(project.repository && { codeRepository: project.repository }),
      ...(project.documentation && {
        subjectOf: {
          '@type': 'TechArticle',
          url: project.documentation,
        },
      }),
      ...(project.demo && project.demo !== projectUrl && { sameAs: [project.demo] }),
      ...(project.license && { license: structuredLicenseUrl(project.license) }),
      ...(project.image && { image: absolutePublicUrl(project.image) }),
      ...(project.dateModified && { dateModified: project.dateModified }),
      featureList: [
        'Local Markdown and TOML content source',
        'Schema validation and local indexing',
        'Explicit private and public content states',
        'Typed relations across articles, projects, episodes, and resume evidence',
        'Local preview and configured deployment workflow',
        'MCP context retrieval and reviewable change proposals',
        'Machine-readable public output including sitemap, structured data, and llms.txt',
      ],
      author: { '@id': personId },
      creator: { '@id': personId },
      isPartOf: { '@id': websiteId },
    });
  }

  const document = {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
  writeFileSync(
    join(DIST, 'site-index.jsonld'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
}

async function writeLlmsText() {
  const entries = await llmsEntries();
  const lines = [
    '# Silan Hu',
    '',
    `Personal website for ${GEO_PROFILE.canonicalName}: AI-native data, runtime, and knowledge systems.`,
    '',
    `Canonical site: ${canonicalUrl('/')}`,
    `Sitemap: ${canonicalUrl('/sitemap.xml')}`,
    '',
    '## Generative Engine Context',
    '',
    `Identity: ${GEO_PROFILE.identity}`,
    `Alias keywords: ${[GEO_PROFILE.canonicalName, ...GEO_PROFILE.aliases].join(', ')}`,
    `Incorrect name variants to avoid: ${GEO_PROFILE.incorrectNameVariants.join(', ')}`,
    `Core positioning: ${GEO_PROFILE.positioning}`,
    `Preferred attribution: ${GEO_PROFILE.attribution}`,
    `Content author: ${GEO_PROFILE.canonicalName} (${GEO_PROFILE.chineseName})`,
    `Reproduction: ${GEO_PROFILE.reproductionNotice}`,
    `Primary topics: ${GEO_PROFILE.topics.join(', ')}`,
    `Evidence on this site: ${GEO_PROFILE.evidence}`,
    '',
    'Evidence highlights:',
    ...GEO_PROFILE.highlights.map((item) => `- ${item}`),
    '',
    '## Public Content',
    '',
  ];
  for (const entry of entries) {
    lines.push(`### ${entry.kind}: ${entry.title}`);
    lines.push(`URL: ${canonicalUrl(entry.path)}`);
    lines.push(`Author: ${GEO_PROFILE.canonicalName} (${GEO_PROFILE.chineseName})`);
    lines.push(`Reproduction: ${GEO_PROFILE.reproductionNotice}`);
    if (entry.summary) lines.push(`Summary: ${entry.summary}`);
    if (entry.tags?.length) lines.push(`Tags: ${entry.tags.join(', ')}`);
    if (entry.version) lines.push(`Version: ${entry.version}`);
    if (entry.license) lines.push(`License: ${entry.license}`);
    if (entry.repository) lines.push(`Repository: ${entry.repository}`);
    if (entry.documentation) lines.push(`Documentation: ${entry.documentation}`);
    if (entry.text) {
      lines.push('');
      lines.push(entry.text);
    }
    lines.push('');
  }
  writeFileSync(join(DIST, 'llms.txt'), `${lines.join('\n').trim()}\n`, 'utf8');
  writeFileSync(join(DIST, 'about.txt'), `${crawlerProfileText(entries).trim()}\n`, 'utf8');
  writeSiteIndex(entries);
}

function crawlerProfileText(entries) {
  const profile = entries.find((entry) => entry.kind === 'Profile');
  return [
    GEO_PROFILE.homeTitle,
    '',
    `Canonical site: ${canonicalUrl('/')}`,
    `Machine-readable context: ${canonicalUrl('/llms.txt')}`,
    '',
    GEO_PROFILE.identity,
    '',
    GEO_PROFILE.positioning,
    '',
    GEO_PROFILE.attribution,
    '',
    `Content author: ${GEO_PROFILE.canonicalName} (${GEO_PROFILE.chineseName})`,
    `Reproduction: ${GEO_PROFILE.reproductionNotice}`,
    '',
    `Primary topics: ${GEO_PROFILE.topics.join(', ')}`,
    '',
    GEO_PROFILE.evidence,
    '',
    'Evidence highlights:',
    ...GEO_PROFILE.highlights.map((item) => `- ${item}`),
    '',
    profile?.text || '',
  ].join('\n');
}

const priorityFor = (route) => {
  const normalized = logicalRoute(route).replace(/\/$/, '') || '/';
  if (normalized === '/') return '1.0';
  if (/^\/(blog|projects|moments)$/.test(normalized)) return '0.8';
  if (/^\/(blog|projects|moments|episodes)\//.test(normalized)) return '0.7';
  return '0.6';
};

function writeSitemap(routes) {
  const routeSet = new Set(routes.map(withTrailingSlash));
  const latestDetailDate = (route) => {
    const language = routeLanguage(route);
    const logical = logicalRoute(route);
    const prefix = logical === '/'
      ? '/'
      : /^\/(blog|projects|moments)\/?$/.test(logical)
        ? withTrailingSlash(logical)
        : null;
    if (!prefix) return undefined;
    const dates = [...routeLastModified.entries()]
      .filter(([detailRoute]) =>
        routeLanguage(detailRoute) === language &&
        (prefix === '/' || logicalRoute(detailRoute).startsWith(prefix)))
      .map(([, date]) => date)
      .sort();
    return dates.at(-1);
  };
  const urls = routes
    .filter((route) => logicalRoute(route) !== '/search/')
    .map(
      (route) => {
        const englishRoute = localizedRoute(route, 'en');
        const chineseRoute = localizedRoute(route, 'zh');
        const alternateLinks = [
          routeSet.has(englishRoute) &&
            `    <xhtml:link rel="alternate" hreflang="en" href="${escapeXml(canonicalUrl(englishRoute))}" />`,
          routeSet.has(chineseRoute) &&
            `    <xhtml:link rel="alternate" hreflang="zh-Hans" href="${escapeXml(canonicalUrl(chineseRoute))}" />`,
          routeSet.has(englishRoute) &&
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(canonicalUrl(englishRoute))}" />`,
        ].filter(Boolean).join('\n');
        const lastModified = routeLastModified.get(withTrailingSlash(route)) || latestDetailDate(route);
        const lastModifiedTag = lastModified
          ? `    <lastmod>${lastModified}</lastmod>\n`
          : '';
        return `  <url>\n    <loc>${escapeXml(canonicalUrl(withTrailingSlash(route)))}</loc>\n` +
        `${alternateLinks}\n` +
        lastModifiedTag +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>${priorityFor(route)}</priority>\n  </url>`;
      },
    )
    .join('\n');
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls +
    '\n</urlset>\n';
  writeFileSync(join(DIST, 'sitemap.xml'), xml, 'utf8');
  return routes
    .filter((route) => logicalRoute(route) !== '/search/')
    .map((route) => canonicalUrl(withTrailingSlash(route)));
}

function writeRssFeed() {
  const items = publicListData.blogList.en
    .map((post) => {
      const segment = post.slug || post.id;
      if (!segment) return null;
      const publishedAt = firstValidContentTimestamp(
        post.publish_date,
        post.publishDate,
        post.updated_at,
        post.updatedAt,
        post.created_at,
        post.createdAt,
      );
      return {
        title: localizedText(post.title, 'en') || segment,
        description: shortSummary(post.summary, post.description),
        link: canonicalUrl(`/blog/${segment}/`),
        publishedAt,
        tags: Array.isArray(post.tags) ? post.tags : [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (!left.publishedAt) return 1;
      if (!right.publishedAt) return -1;
      return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    });

  const xml = serializeRssFeed({
    title: 'Silan Hu — Writing',
    description: 'Writing on AI systems, data, runtimes, and dependable execution.',
    feedUrl: canonicalUrl('/rss.xml'),
    channelUrl: canonicalUrl('/blog/'),
    language: 'en',
    items,
  });

  writeFileSync(join(DIST, 'rss.xml'), xml, 'utf8');
  return items.map((item) => item.link);
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
  manifest.id = `${basePath}/`;
  manifest.start_url = `${basePath}/`;
  manifest.scope = `${basePath}/`;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function rewriteHtmlMetadata(routes) {
  const localServeOrigin = `http://localhost:${SERVE_PORT}`;
  const localBackendOrigin = `http://localhost:${BACKEND_PORT}`;
  const publicOrigin = trimTrailingSlash(config.publicOrigin);
  for (const route of routes) {
    const path = join(routeDir(route), 'index.html');
    if (!existsSync(path)) continue;
    const canonical = canonicalUrl(withTrailingSlash(route));
    let html = readFileSync(path, 'utf8');
    html = html.replaceAll(`${localServeOrigin}/api/`, `${publicOrigin}/api/`);
    html = html.replaceAll(`${localBackendOrigin}/api/`, `${publicOrigin}/api/`);
    html = html.replace(/(rel="canonical"\s+href=")[^"]*(")/g, `$1${canonical}$2`);
    html = html.replace(/(property="og:url"\s+content=")[^"]*(")/g, `$1${canonical}$2`);
    writeFileSync(path, html, 'utf8');
  }
}

function writeRobots() {
  const disallowPrefix = basePath || '';
  const publicFetchers = [
    '*',
    'ClaudeBot',
    'Claude-User',
    'Claude-SearchBot',
    'Claude-Code',
    'claude-code',
    'Claude-Web',
    'anthropic-ai',
  ];
  const privateDisallows = [
    `${disallowPrefix}/api/v1/stats/snapshot`,
    `${disallowPrefix}/api/v1/stats/bots`,
    `${disallowPrefix}/api/v1/stats/crawlers`,
    `${disallowPrefix}/api/v1/stats/sources`,
    `${disallowPrefix}/api/v1/stats/visitors`,
    `${disallowPrefix}/api/v1/content/status`,
    `${disallowPrefix}/api/v1/auth/`,
  ];
  const groups = publicFetchers.flatMap((agent) => [
    `User-agent: ${agent}`,
    'Allow: /',
    '# Private machine and identity APIs — public content remains crawlable.',
    ...privateDisallows.map((path) => `Disallow: ${path}`),
    '',
  ]);
  const robots = [
    ...groups,
    '# Internal pages — not for indexing.',
    `Disallow: ${disallowPrefix}/gallery`,
    `Disallow: ${disallowPrefix}/design`,
    `Disallow: ${disallowPrefix}/zh/gallery`,
    `Disallow: ${disallowPrefix}/zh/design`,
    '',
    `Sitemap: ${canonicalUrl('/sitemap.xml')}`,
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
        '--db-source', DB_SOURCE,
      ],
      { cwd: join(REPO, 'backend'), stdio: 'inherit' },
    );
  }

  try {
    await waitForHttp(healthUrl, 40000);
    log('backend is up.');
    return { backend, backendUp: true };
  } catch {
    if (backend) backend.kill('SIGTERM');
    throw new Error('backend did not come up — refusing to produce shell-only prerender output');
  }
}

function startStaticServer() {
  const assets = sirv(DIST, { dev: false, single: false });
  const shellHtml = readFileSync(join(DIST, 'index.html'), 'utf8').replace(
    /<body\b[^>]*>[\s\S]*?<\/body>/i,
    '<body><div id="root"></div></body>',
  );
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
      res.end(shellHtml);
    });
  });
  return new Promise((resolveServer) => {
    server.listen(SERVE_PORT, () => resolveServer(server));
  });
}

function removeStalePrerenderOutput() {
  for (const root of PRERENDER_ROUTE_ROOTS) {
    rmSync(join(DIST, root), { recursive: true, force: true });
  }
}

const chromeExecutablePaths = () => [
  undefined,
  ...CHROME_CANDIDATES.filter((path) => existsSync(path)),
];

async function launchBrowser() {
  const baseOptions = {
    headless: 'new',
    timeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      ...(config.startLocalBackend ? [] : ['--disable-web-security']),
    ],
  };
  let lastError;
  const executablePaths = chromeExecutablePaths();
  for (const executablePath of executablePaths) {
    const options = executablePath ? { ...baseOptions, executablePath } : baseOptions;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await puppeteer.launch(options);
      } catch (error) {
        lastError = error;
        const hasMoreAttempts = attempt < 2 || executablePath !== executablePaths.at(-1);
        if (hasMoreAttempts) {
          const label = executablePath ? executablePath : 'bundled Chromium';
          log(`Chrome launch failed with ${label}; retrying.`);
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
        }
      }
    }
  }
  throw lastError;
}

const isRecoverableBrowserError = (error) =>
  /Connection closed|frame got detached|Target closed|Protocol error|Session closed/i.test(
    error?.message || '',
  );

async function closeBrowser(browser) {
  try {
    await withTimeout(browser.close(), 5000, 'browser');
  } catch (error) {
    log(`WARNING: failed to close browser cleanly: ${error.message}`);
  }
}

async function main() {
  if (!existsSync(DIST)) {
    throw new Error('dist/ not found — run `vite build` first.');
  }

  const { backend, backendUp } = await ensureBackend();
  removeStalePrerenderOutput();
  const server = await startStaticServer();
  log(`serving dist/ on http://localhost:${SERVE_PORT}${config.base}`);

  const detail = backendUp ? await detailRoutes() : [];
  const localizedStaticRoutes = LOGICAL_STATIC_ROUTES.flatMap((route) =>
    LANGUAGES.map((language) => localizedRoute(route, language)),
  );
  const routes = [...new Set([...localizedStaticRoutes, ...detail])];
  log(`${routes.length} public localized routes to prerender.`);

  let browser = await launchBrowser();
  const failedRoutes = [];
  for (const route of routes) {
    let routeRendered = false;
    let routeFailure = null;
    const routeData = backendUp ? await routeDataFor(route) : null;
    for (let attempt = 1; attempt <= 2 && !routeRendered; attempt += 1) {
      let page = null;
      const url = `http://localhost:${SERVE_PORT}${basePath}${route}`;
      log(`rendering ${route}${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      try {
        page = await browser.newPage();
        await installPublicListInterception(page);
        await page.evaluateOnNewDocument(() => {
          window.__SILAN_PRERENDER__ = true;
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(
          (currentRoute) => {
            const root = document.getElementById('root');
            if (!root?.querySelector('h1, h2, h3')) return false;
            if (root.querySelector('[role="alert"]')) return false;
            if (root.querySelector('[role="status"][style*="z-index: 1200"]')) return false;
            const logicalPath = currentRoute.startsWith('/zh/')
              ? currentRoute.slice('/zh'.length)
              : currentRoute;
            return !logicalPath.startsWith('/episodes/')
              || Boolean(root.querySelector('#kb-series-header'));
          },
          { timeout: 30000 },
          route,
        );
        await new Promise((r) => setTimeout(r, 300));
        await preparePrerenderedPage(page, route);
        const html = injectRouteData(await page.content(), routeData);
        const outDir = routeDir(route);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, 'index.html'), html, 'utf8');
        routeRendered = true;
      } catch (err) {
        routeFailure = err;
        if (attempt < 2 && isRecoverableBrowserError(err)) {
          log(`browser disconnected while rendering ${route}; restarting browser.`);
          await closeBrowser(browser);
          browser = await launchBrowser();
        }
      } finally {
        if (page && !page.isClosed()) {
          try {
            await page.close();
          } catch {
            // Browser-level recovery above handles detached targets.
          }
        }
      }
    }
    if (!routeRendered) {
      log(`FAILED ${route}: ${routeFailure?.message || 'unknown error'}`);
      failedRoutes.push(`${route}: ${routeFailure?.message || 'unknown error'}`);
    }
  }

  if (failedRoutes.length > 0) {
    await closeBrowser(browser);
    await new Promise((resolve) => server.close(resolve));
    if (backend) backend.kill('SIGTERM');
    throw new Error(
      `refusing incomplete prerender output; ${failedRoutes.length} route(s) failed:\n` +
      failedRoutes.map((failure) => `- ${failure}`).join('\n'),
    );
  }

  const expectedSitemapUrls = writeSitemap(routes);
  const expectedRssUrls = writeRssFeed();
  const seoVerification = validateSeoArtifacts({
    sitemapXml: readFileSync(join(DIST, 'sitemap.xml'), 'utf8'),
    rssXml: readFileSync(join(DIST, 'rss.xml'), 'utf8'),
    expectedSitemapUrls,
    expectedRssUrls,
    expectedFeedUrl: canonicalUrl('/rss.xml'),
  });
  log(
    `verified sitemap.xml (${seoVerification.sitemapUrlCount} URLs) and ` +
    `rss.xml (${seoVerification.rssItemCount} items)`,
  );
  await writeLlmsText();
  rewriteHtmlMetadata(routes);
  rewriteManifest();
  writeRobots();
  rewriteBuiltAssetPaths();
  log('wrote sitemap.xml, rss.xml, robots.txt, llms.txt, about.txt, site-index.jsonld and manifest.json');

  await closeBrowser(browser);
  await new Promise((resolve) => server.close(resolve));
  if (backend) backend.kill('SIGTERM');
  log(backendUp ? 'done — pages prerendered with live content.' : 'done — pages prerendered (shell only).');
  process.exit(0);
}

main().catch((err) => {
  console.error('[prerender] fatal:', err);
  process.exit(1);
});
