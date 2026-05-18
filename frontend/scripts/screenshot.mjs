// scripts/screenshot.mjs — render a page in headless Chromium and save a PNG.
//
// A debugging aid for agents (and humans): the front-end is a React SPA, so
// `curl` only ever sees an empty shell. This script loads a URL in a real
// browser, lets the JS render, and writes a screenshot — the actual visual
// result, the same thing a person sees.
//
// Usage:
//   node scripts/screenshot.mjs <url> [out.png] [options]
//
//   <url>       page to capture, e.g. http://localhost:8080/contact
//   [out.png]   output path (default: ./screenshot.png)
//
//   --width=<n>      viewport width  (default 1440)
//   --height=<n>     viewport height (default 900)
//   --full-page      capture the whole scrollable page, not just the viewport
//   --wait=<ms>      extra settle time after network idle (default 400)
//   --selector=<css> wait for this element before shooting (e.g. "main")
//
// Examples:
//   node scripts/screenshot.mjs http://localhost:8080
//   node scripts/screenshot.mjs http://localhost:8080/contact contact.png --full-page
//   node scripts/screenshot.mjs http://localhost:8080/resume resume.png --selector=#root
//
// Exit code 0 on success, 1 on failure (with a reason on stderr).

import puppeteer from 'puppeteer';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const positional = [];
  const opts = {
    width: 1440,
    height: 900,
    fullPage: false,
    wait: 400,
    selector: null,
  };
  for (const arg of argv) {
    if (arg === '--full-page') {
      opts.fullPage = true;
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

async function main() {
  const { positional, opts } = parseArgs(process.argv.slice(2));
  const url = positional[0];
  if (!url) {
    console.error(
      'usage: node scripts/screenshot.mjs <url> [out.png] ' +
        '[--width=N] [--height=N] [--full-page] [--wait=ms] [--selector=css]',
    );
    process.exit(1);
  }
  const outPath = resolve(positional[1] || 'screenshot.png');

  // `headless: 'new'` + `--no-sandbox` matches scripts/prerender.mjs — the
  // sandbox flag is needed to run Chromium as root in CI / containers.
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: opts.width, height: opts.height });

    // `networkidle0` waits until the SPA's data fetches have settled, then a
    // short beat for the final React paint (same rationale as prerender.mjs).
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    if (opts.selector) {
      await page.waitForSelector(opts.selector, { timeout: 15000 });
    }
    if (opts.wait > 0) {
      await new Promise((r) => setTimeout(r, opts.wait));
    }

    await page.screenshot({ path: outPath, fullPage: opts.fullPage });
    console.log(`screenshot: ${url} -> ${outPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`screenshot failed: ${err.message}`);
  process.exit(1);
});
