#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HOST = process.env.SILAN_DESKTOP_HOST || '127.0.0.1';
const PORT = Number(process.env.SILAN_DESKTOP_PORT || 5184);
const EXPECTED_TITLE = '<title>Silan Context System</title>';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const viteBin = path.join(desktopRoot, 'node_modules', 'vite', 'bin', 'vite.js');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 4096) req.destroy();
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.setTimeout(800, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function existingDesktopServer() {
  try {
    const response = await get(`http://${HOST}:${PORT}/`);
    return response.statusCode === 200 && response.body.includes(EXPECTED_TITLE);
  } catch {
    return false;
  }
}

if (await existingDesktopServer()) {
  console.log(`[desktop] reusing existing Silan Context System dev server at http://${HOST}:${PORT}`);
  process.exit(0);
}

const child = spawn(
  process.execPath,
  [viteBin, '--host', HOST, '--port', String(PORT), '--strictPort'],
  {
    cwd: desktopRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
