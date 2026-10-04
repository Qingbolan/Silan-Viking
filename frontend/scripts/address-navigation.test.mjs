import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/lib/addressNavigation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { resolveAddress, siteAddressUra } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const origin = 'https://silan.tech';
test('routes site URLs internally and rejects executable or credential-bearing URLs', () => {
  assert.equal(resolveAddress('/projects/test/goals/', origin).external, false);
  assert.equal(resolveAddress('https://silan.tech/blog/', origin).href, '/blog/');
  for (const input of ['javascript:alert(1)', 'data:text/html,test', '//evil.example', 'https://u:p@example.com', '/\\evil.example']) assert.equal(resolveAddress(input, origin), null);
});
test('projects EasyNet device, agent, ability, collections and resource addresses', () => {
  const device = 'easynet:///r/demo/device/node-1';
  assert.equal(resolveAddress(device, origin).href, `https://easynet.run/control_plane/devices/${encodeURIComponent(device)}`);
  assert.match(resolveAddress('easynet:///r/demo/agent/alice.claude', origin).href, /\/agents\//);
  assert.equal(resolveAddress('easynet:///r/demo/ability/hub.federation.resolve', origin).href, 'https://easynet.run/control_plane/abilities/federation.resolve');
  assert.equal(resolveAddress('easynet:///r/demo/user/alice/page', origin).href, 'https://easynet.run/control_plane/pages');
  const resource = 'easynet:///r/demo/resource/user.alice/files/test.png';
  assert.equal(resolveAddress(resource, origin).href, `https://easynet.run/browser/ura?ura=${encodeURIComponent(resource)}`);
  assert.equal(resolveAddress('easynet:///r/demo/unknown/foo', origin), null);
});

test('current host and port identify the site realm with lossless route round trips', () => {
  const local = 'http://127.0.0.1:5194';
  for (const path of ['/', '/blog/make-research-work-findable/', '/zh/search/?q=hello%20world#results']) {
    const ura = siteAddressUra(local + path);
    assert.equal(ura, `easynet:///r/127.0.0.1:5194/resource${path}`);
    assert.equal(resolveAddress(ura, local).href, path);
    assert.equal(resolveAddress(ura, local).external, false);
    assert.equal(resolveAddress(ura, origin).external, true);
  }
  assert.equal(resolveAddress('easynet:///r/127.0.0.1:5194/resource//evil.example', local), null);
  assert.equal(resolveAddress(siteAddressUra('https://silan.tech/blog/'), origin).href, '/blog/');
});

test('moment pages use client routing while image and video resources open the media endpoint', () => {
  const paths = [
    ['/moments/research-example/', 'route', 'Moment'],
    ['/api/v1/media?f=moment%2Fexample%2Fassets%2Fphoto.png', 'document', 'Image'],
    ['/api/v1/media?f=moment%2Fexample%2Fassets%2Fclip.mp4#t=10', 'document', 'Video'],
    ['/api/v1/feedback-media/example.webm', 'document', 'Video'],
    ['/images/avatar.webp', 'document', 'Image'],
  ];
  for (const [path, navigation, label] of paths) {
    const target = resolveAddress(siteAddressUra(origin + path), origin);
    assert.equal(target.href, path);
    assert.equal(target.navigation, navigation);
    assert.equal(target.label, label);
    assert.equal(target.external, false);
  }
});
