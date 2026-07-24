// scripts/build-static.mjs
//
// Generic static-site build wrapper. Usage:
//   npm run build:static -- /~silan-hu/
//
// The base path is an explicit argument. Origin/API can be overridden with
// flags or environment variables:
//   --origin https://www.comp.nus.edu.sg
//   --api-origin https://silan.tech
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(__dirname, '..');

function usage() {
  return [
    'usage: node scripts/build-static.mjs <base-path> [--origin URL] [--api-origin URL]',
    '',
    'example:',
    '  npm run build:static -- /~silan-hu/',
  ].join('\n');
}

function normalizeBase(value) {
  if (!value || value === '/') return '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

function parseArgs(argv) {
  let base = null;
  let origin = process.env.VITE_PUBLIC_ORIGIN || 'https://www.comp.nus.edu.sg';
  let apiOrigin = process.env.VITE_API_ORIGIN || 'https://silan.tech';
  let sourcemap = process.env.VITE_BUILD_SOURCEMAP || 'false';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    } else if (arg === '--origin') {
      origin = argv[++i];
    } else if (arg.startsWith('--origin=')) {
      origin = arg.slice('--origin='.length);
    } else if (arg === '--api-origin') {
      apiOrigin = argv[++i];
    } else if (arg.startsWith('--api-origin=')) {
      apiOrigin = arg.slice('--api-origin='.length);
    } else if (arg === '--sourcemap') {
      sourcemap = argv[++i];
    } else if (arg.startsWith('--sourcemap=')) {
      sourcemap = arg.slice('--sourcemap='.length);
    } else if (!base) {
      base = arg;
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  if (!base) throw new Error(usage());
  if (!origin) throw new Error('--origin needs a URL');
  if (!apiOrigin) throw new Error('--api-origin needs a URL');

  return {
    base: normalizeBase(base),
    origin: origin.replace(/\/+$/, ''),
    apiOrigin: apiOrigin.replace(/\/+$/, ''),
    sourcemap,
  };
}

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: FRONTEND,
      env: { ...process.env, ...env },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

const config = parseArgs(process.argv.slice(2));
const env = {
  PRERENDER_LABEL: 'static',
  VITE_PUBLIC_BASE: config.base,
  VITE_PUBLIC_ORIGIN: config.origin,
  VITE_API_ORIGIN: config.apiOrigin,
  VITE_BUILD_SOURCEMAP: config.sourcemap,
};

console.log(
  `[build:static] base=${config.base} origin=${config.origin} api=${config.apiOrigin}`,
);

await run(process.execPath, [join(FRONTEND, 'node_modules/vite/bin/vite.js'), 'build'], env);
await run(process.execPath, [join(FRONTEND, 'scripts/prerender.mjs')], env);
