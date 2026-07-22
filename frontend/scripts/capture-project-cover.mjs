// Capture a website once as a static project cover and update frontmatter.
//
// Usage:
//   node scripts/capture-project-cover.mjs <project-slug> <website-url> [options]
//
// Options:
//   --lang=<lang>          translation file language (default: en)
//   --out=<filename>       asset file name (default: cover-website.png)
//   --width=<n>            viewport width (default: 1440)
//   --height=<n>           viewport height (default: 720)
//   --wait=<ms>            settle time after network idle (default: 1000)
//   --selector=<css>       optional selector to wait for before shooting

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

function parseArgs(argv) {
  const positional = [];
  const opts = {
    lang: 'en',
    out: 'cover-website.png',
    width: 1440,
    height: 720,
    wait: 1000,
    selector: null,
  };
  for (const arg of argv) {
    if (arg.startsWith('--lang=')) {
      opts.lang = arg.slice(7);
    } else if (arg.startsWith('--out=')) {
      opts.out = arg.slice(6);
    } else if (arg.startsWith('--width=')) {
      opts.width = Number.parseInt(arg.slice(8), 10);
    } else if (arg.startsWith('--height=')) {
      opts.height = Number.parseInt(arg.slice(9), 10);
    } else if (arg.startsWith('--wait=')) {
      opts.wait = Number.parseInt(arg.slice(7), 10);
    } else if (arg.startsWith('--selector=')) {
      opts.selector = arg.slice(11);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  return { positional, opts };
}

function ensureWebsiteUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('website URL is required');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function setFrontmatterField(document, key, value) {
  const lines = document.split('\n');
  if (lines[0] !== '---') {
    throw new Error('frontmatter block is missing');
  }
  const end = lines.findIndex((line, index) => index > 0 && line === '---');
  if (end < 0) {
    throw new Error('frontmatter block is not closed');
  }
  const nextLine = `${key}: ${value}`;
  for (let index = 1; index < end; index += 1) {
    if (lines[index].startsWith(`${key}:`)) {
      lines[index] = nextLine;
      return lines.join('\n');
    }
  }
  lines.splice(end, 0, nextLine);
  return lines.join('\n');
}

async function capture(url, outPath, opts) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    if (opts.selector) {
      await page.waitForSelector(opts.selector, { timeout: 15000 });
    }
    if (opts.wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.wait));
    }
    await page.screenshot({ path: outPath, fullPage: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const slug = positional[0]?.trim();
  const websiteUrl = ensureWebsiteUrl(positional[1] || '');
  if (!slug) {
    console.error('usage: node scripts/capture-project-cover.mjs <project-slug> <website-url> [options]');
    process.exit(1);
  }
  if (!Number.isFinite(opts.width) || !Number.isFinite(opts.height) || opts.width <= 0 || opts.height <= 0) {
    throw new Error('width and height must be positive numbers');
  }

  const assetDir = path.join(repoRoot, 'content/resources/projects', slug, 'assets');
  const outPath = path.join(assetDir, opts.out);
  const frontmatterPath = path.join(repoRoot, 'content/resources/projects', slug, 'parts/overview', `${opts.lang}.md`);
  const silanUri = `silan://resources/projects/${slug}/assets/${opts.out}`;

  await fs.mkdir(assetDir, { recursive: true });
  await capture(websiteUrl, outPath, opts);

  let document = await fs.readFile(frontmatterPath, 'utf8');
  document = setFrontmatterField(document, 'thumbnail_url', silanUri);
  document = setFrontmatterField(document, 'cover_source_type', 'website');
  document = setFrontmatterField(document, 'cover_website_url', websiteUrl);
  await fs.writeFile(frontmatterPath, document);

  console.log(`captured ${websiteUrl}`);
  console.log(`cover: ${outPath}`);
  console.log(`frontmatter: ${frontmatterPath}`);
}

main().catch((error) => {
  console.error(`capture project cover failed: ${error.message}`);
  process.exit(1);
});
