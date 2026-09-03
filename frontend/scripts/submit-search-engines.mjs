#!/usr/bin/env node
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL, URLSearchParams } from 'node:url';

const fetch = globalThis.fetch;

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const WEBMASTERS_SCOPE = 'https://www.googleapis.com/auth/webmasters';
const DEFAULT_INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const DEFAULT_BAIDU_ENDPOINT = 'http://data.zz.baidu.com/urls';

const log = (message) => console.log(`[search-submit] ${message}`);
const warn = (message) => console.warn(`[search-submit] ${message}`);

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
const env = (key) => process.env[key]?.trim();

const base64url = (value) =>
  Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

const jsonBase64url = (value) => base64url(JSON.stringify(value));

const configuredProviders = () => {
  const raw = env('SEARCH_ENGINE_SUBMIT_PROVIDERS');
  if (!raw) return ['google', 'indexnow', 'baidu'];
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

export function resolveSearchSubmitConfig(overrides = {}) {
  const origin = overrides.origin || env('SILAN_PUBLIC_ORIGIN') || env('VITE_PUBLIC_ORIGIN');
  const publicOrigin = origin ? trimTrailingSlash(origin) : null;
  const sitemapUrl =
    overrides.sitemapUrl ||
    env('GOOGLE_SEARCH_CONSOLE_SITEMAP_URL') ||
    env('SEARCH_ENGINE_SITEMAP_URL') ||
    (publicOrigin ? `${publicOrigin}/sitemap.xml` : null);
  const siteUrl =
    overrides.siteUrl ||
    env('GOOGLE_SEARCH_CONSOLE_SITE_URL') ||
    env('SEARCH_ENGINE_SITE_URL') ||
    (publicOrigin ? `${publicOrigin}/` : null);

  return {
    distDir: overrides.distDir || env('SEARCH_ENGINE_DIST_DIR') || 'dist',
    providers: overrides.providers || configuredProviders(),
    origin: publicOrigin,
    siteUrl,
    sitemapUrl,
    google: {
      credentialsJson: overrides.googleCredentialsJson || env('GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON'),
      credentialsFile: overrides.googleCredentialsFile || env('GOOGLE_SEARCH_CONSOLE_CREDENTIALS_FILE'),
    },
    indexnow: {
      key: overrides.indexnowKey || env('INDEXNOW_KEY') || env('BING_INDEXNOW_KEY'),
      keyLocation: overrides.indexnowKeyLocation || env('INDEXNOW_KEY_LOCATION') || env('BING_INDEXNOW_KEY_LOCATION'),
      endpoint: overrides.indexnowEndpoint || env('INDEXNOW_ENDPOINT') || env('BING_INDEXNOW_ENDPOINT') || DEFAULT_INDEXNOW_ENDPOINT,
    },
    baidu: {
      site: overrides.baiduSite || env('BAIDU_SITE') || (publicOrigin ? new URL(publicOrigin).hostname : null),
      token: overrides.baiduToken || env('BAIDU_TOKEN'),
      endpoint: overrides.baiduEndpoint || env('BAIDU_SUBMIT_ENDPOINT') || DEFAULT_BAIDU_ENDPOINT,
    },
  };
}

export function printConfigHelp() {
  console.log(`# Search engine sitemap submission

# Main configuration path: edit silan-viking.toml via:
#   silan config edit
#
# \`silan site deploy\` reads [search_submit] and passes the values to the
# remote frontend publisher after sitemap generation.

[search_submit]
providers   = ["google", "indexnow", "baidu"]
site_url    = "https://silan.tech/"
sitemap_url = "https://silan.tech/sitemap.xml"
strict      = false

[search_submit.google]
# Service account must be added as a Search Console user for https://silan.tech/.
credentials_file = "/etc/silan-backend/search-console-service-account.json"
# credentials_json = '{"type":"service_account",...}'

[search_submit.indexnow]
# Used by Bing via IndexNow. The key is public and is written to dist/<key>.txt.
key = "replace-with-indexnow-key"
# key_location = "https://silan.tech/replace-with-indexnow-key.txt"

[search_submit.baidu]
site  = "silan.tech"
token = "replace-with-baidu-token"

# Low-level env mapping remains supported for CI/server overrides:
# SEARCH_ENGINE_SUBMIT_PROVIDERS, SEARCH_ENGINE_SITE_URL,
# SEARCH_ENGINE_SITEMAP_URL, GOOGLE_SEARCH_CONSOLE_CREDENTIALS_FILE,
# INDEXNOW_KEY, BAIDU_SITE, BAIDU_TOKEN, SEARCH_ENGINE_SUBMIT_STRICT
`);
}

function readGoogleCredentials(config) {
  if (config.google.credentialsJson) return JSON.parse(config.google.credentialsJson);
  if (config.google.credentialsFile) return JSON.parse(readFileSync(config.google.credentialsFile, 'utf8'));
  return null;
}

function serviceAccountAssertion(credentials) {
  const clientEmail = credentials?.client_email;
  const privateKey = credentials?.private_key;
  if (!clientEmail || !privateKey) {
    throw new Error('Google service account credentials need client_email and private_key');
  }

  const now = Math.floor(Date.now() / 1000);
  const signingInput = [
    jsonBase64url({ alg: 'RS256', typ: 'JWT' }),
    jsonBase64url({
      iss: clientEmail,
      scope: WEBMASTERS_SCOPE,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    }),
  ].join('.');
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

async function googleAccessToken(credentials) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: serviceAccountAssertion(credentials),
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const reason = payload.error_description || payload.error || response.statusText;
    throw new Error(`Google token exchange failed: ${response.status} ${reason}`);
  }
  return payload.access_token;
}

async function submitGoogle(config) {
  const credentials = readGoogleCredentials(config);
  if (!credentials) {
    log('google skipped: set GOOGLE_SEARCH_CONSOLE_CREDENTIALS_FILE or GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON');
    return 'skipped';
  }
  if (!config.siteUrl || !config.sitemapUrl) throw new Error('Google needs siteUrl and sitemapUrl');

  const token = await googleAccessToken(credentials);
  const endpoint =
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.siteUrl)}` +
    `/sitemaps/${encodeURIComponent(config.sitemapUrl)}`;
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google submit failed: ${response.status} ${text || response.statusText}`);
  }
  log(`google submitted ${config.sitemapUrl}`);
  return 'submitted';
}

function localSitemapPath(config) {
  return join(config.distDir, 'sitemap.xml');
}

async function readSitemapXml(config) {
  const localPath = localSitemapPath(config);
  if (existsSync(localPath)) return readFileSync(localPath, 'utf8');
  if (!config.sitemapUrl) throw new Error('sitemapUrl is required');
  const response = await fetch(config.sitemapUrl);
  if (!response.ok) throw new Error(`fetch sitemap failed: ${response.status} ${response.statusText}`);
  return response.text();
}

export async function readSitemapUrls(config) {
  const xml = await readSitemapXml(config);
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim()).filter(Boolean);
}

function indexnowKeyLocation(config) {
  if (config.indexnow.keyLocation) return config.indexnow.keyLocation;
  if (!config.origin || !config.indexnow.key) return null;
  return `${config.origin}/${encodeURIComponent(config.indexnow.key)}.txt`;
}

export function prepareIndexNowKey(config = resolveSearchSubmitConfig()) {
  const key = config.indexnow.key;
  if (!key) {
    log('indexnow prepare skipped: set INDEXNOW_KEY or BING_INDEXNOW_KEY');
    return 'skipped';
  }
  const target = join(config.distDir, `${key}.txt`);
  writeFileSync(target, `${key}\n`, 'utf8');
  log(`indexnow key file wrote ${target}`);
  return 'prepared';
}

async function submitIndexNow(config) {
  const key = config.indexnow.key;
  if (!key) {
    log('indexnow skipped: set INDEXNOW_KEY or BING_INDEXNOW_KEY');
    return 'skipped';
  }
  const host = config.origin ? new URL(config.origin).hostname : null;
  const keyLocation = indexnowKeyLocation(config);
  if (!host || !keyLocation) throw new Error('IndexNow needs SILAN_PUBLIC_ORIGIN and INDEXNOW_KEY');

  const urls = await readSitemapUrls(config);
  if (urls.length === 0) {
    log('indexnow skipped: sitemap has no URLs');
    return 'skipped';
  }

  const response = await fetch(config.indexnow.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation, urlList: urls }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IndexNow submit failed: ${response.status} ${text || response.statusText}`);
  }
  log(`indexnow submitted ${urls.length} URL(s)`);
  return 'submitted';
}

async function submitBaidu(config) {
  const { site, token, endpoint } = config.baidu;
  if (!site || !token) {
    log('baidu skipped: set BAIDU_SITE and BAIDU_TOKEN');
    return 'skipped';
  }
  const urls = await readSitemapUrls(config);
  if (urls.length === 0) {
    log('baidu skipped: sitemap has no URLs');
    return 'skipped';
  }
  const submitUrl = new URL(endpoint);
  submitUrl.searchParams.set('site', site);
  submitUrl.searchParams.set('token', token);

  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: urls.join('\n'),
  });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`Baidu submit failed: ${response.status} ${payload || response.statusText}`);
  }
  log(`baidu submitted ${urls.length} URL(s): ${payload}`);
  return 'submitted';
}

export async function submitSearchEngines(config = resolveSearchSubmitConfig()) {
  const results = [];
  for (const provider of config.providers) {
    try {
      if (provider === 'google') results.push([provider, await submitGoogle(config)]);
      else if (provider === 'indexnow' || provider === 'bing') results.push([provider, await submitIndexNow(config)]);
      else if (provider === 'baidu') results.push([provider, await submitBaidu(config)]);
      else warn(`${provider} skipped: unsupported provider`);
    } catch (error) {
      results.push([provider, 'failed']);
      if (env('SEARCH_ENGINE_SUBMIT_STRICT') === 'true') throw error;
      warn(`${provider} failed: ${error.message}`);
    }
  }
  return results;
}

async function main() {
  const command = process.argv[2] || 'submit';
  const config = resolveSearchSubmitConfig();
  if (command === 'config') {
    printConfigHelp();
    return;
  }
  if (command === 'prepare') {
    prepareIndexNowKey(config);
    return;
  }
  if (command === 'submit') {
    await submitSearchEngines(config);
    return;
  }
  throw new Error(`unknown command ${command}; expected config|prepare|submit`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`[search-submit] ${error.message}`);
    process.exit(1);
  });
}
