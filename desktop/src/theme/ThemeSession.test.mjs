import assert from 'node:assert/strict';
import test from 'node:test';
import paper from './paper.json';
import sand from './sand.json';
import { parseTheme } from './ThemeDefinition';
import { ThemeRegistry, ThemeCatalog } from './ThemeRegistry';
import { ThemeSession } from './ThemeSession';
import { createBuiltinThemeSource, createWorkspaceThemeSource } from './ThemeSources';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const source = (load = async () => sand) => ({ list: async () => [{ uri: 'silan://themes/sand', name: 'Sand' }], load });
function fixture(load, preference = { read: () => null, write: () => {} }) {
  const projected = [];
  const catalog = new ThemeCatalog([source(load)]);
  const session = new ThemeSession(catalog, { apply: theme => projected.push(theme.id) }, preference, 'silan://themes/paper', parseTheme(paper));
  return { session, projected };
}

test('factories are lazy, isolated per composition, and duplicate registrations fail', () => {
  let calls = 0;
  const entries = [['file', context => { calls++; assert.equal(context.value, 1); return source(); }]];
  const registry = new ThemeRegistry(entries);
  entries.length = 0;
  assert.equal(calls, 0);
  assert.notEqual(registry.create({ value: 1 }), registry.create({ value: 1 }));
  assert.equal(calls, 2);
  assert.throws(() => new ThemeRegistry([['file', source], ['file', source]]), /Duplicate/);
});

test('duplicate theme addresses fail rather than silently replace an owner', async () => {
  const catalog = new ThemeCatalog([source(), source()]);
  await assert.rejects(catalog.list(), /Duplicate theme URI/);
  await assert.rejects(catalog.load('silan://themes/sand'), /not registered/);
});

test('preview is transient; cancel restores; apply persists and becomes the new baseline', async () => {
  const saved = [];
  const { session, projected } = fixture(undefined, { read: () => null, write: uri => saved.push(uri) });
  await session.initialize();
  await session.preview('silan://themes/sand');
  assert.equal(session.getSnapshot().phase, 'previewing');
  assert.deepEqual(saved, []);
  session.cancel();
  assert.deepEqual(projected, ['paper', 'sand', 'paper']);
  await session.preview('silan://themes/sand');
  session.commit();
  session.cancel();
  assert.equal(projected.at(-1), 'sand');
  assert.deepEqual(saved, [{uri: 'silan://themes/sand', sidebars: {}}]);
});

test('cancel invalidates an in-flight load', async () => {
  const request = deferred();
  const { session, projected } = fixture(() => request.promise);
  await session.initialize();
  const loading = session.preview('silan://themes/sand');
  session.cancel();
  request.resolve(sand);
  await loading;
  assert.equal(session.getSnapshot().phase, 'ready');
  assert.deepEqual(projected, ['paper', 'paper']);
});

test('a stale load cannot replace the newest preview', async () => {
  const first = deferred(); let calls = 0;
  const { session, projected } = fixture(() => ++calls === 1 ? first.promise : Promise.resolve(sand));
  await session.initialize();
  const old = session.preview('silan://themes/sand');
  await session.preview('silan://themes/sand');
  first.resolve(paper);
  await old;
  assert.deepEqual(projected, ['paper', 'sand']);
});

test('invalid packages and unavailable persisted themes retain the valid initial projection', async () => {
  const { session, projected } = fixture(async () => ({ ...sand, schema_version: 2 }), {
    read: () => ({uri: 'silan://themes/sand', sidebars: {}}), write: () => assert.fail('must not persist invalid theme'),
  });
  await session.initialize();
  assert.equal(session.getSnapshot().phase, 'failed');
  assert.deepEqual(projected, ['paper']);
  await session.preview('silan://themes/missing');
  assert.equal(session.getSnapshot().phase, 'failed');
  assert.deepEqual(projected, ['paper']);
});

test('failed persistence never changes the applied baseline', async () => {
  const { session, projected } = fixture(undefined, { read: () => null, write: () => { throw Error('disk full'); } });
  await session.initialize();
  await session.preview('silan://themes/sand');
  session.commit();
  assert.equal(session.getSnapshot().appliedUri, 'silan://themes/paper');
  session.cancel();
  assert.equal(projected.at(-1), 'paper');
});

test('token contract rejects partial, unknown and executable CSS values', () => {
  const missing = structuredClone(paper); delete missing.tokens['--ds-color-fg'];
  assert.throws(() => parseTheme(missing));
  const unknown = structuredClone(paper); unknown.tokens['--unknown'] = 'red';
  assert.throws(() => parseTheme(unknown));
  for (const value of ['red; } body { display: none', 'url(https://example.com)', 'u\\72l(x)']) {
    const invalid = structuredClone(paper); invalid.tokens['--ds-color-fg'] = value;
    assert.throws(() => parseTheme(invalid));
  }
  assert(Object.isFrozen(parseTheme(paper).tokens));
});

test('references are expanded, cycles and unbound references are rejected', () => {
  const theme = structuredClone(paper);
  theme.tokens['--ds-color-fg'] = 'var(--ds-color-primary)';
  assert.equal(parseTheme(theme).tokens['--ds-color-fg'], paper.tokens['--ds-color-primary']);
  theme.tokens['--ds-color-primary'] = 'var(--ds-color-fg)';
  assert.throws(() => parseTheme(theme), /Cyclic/);
  theme.tokens['--ds-color-primary'] = 'var(--missing)';
  assert.throws(() => parseTheme(theme), /Unknown token reference/);
});

test('manifest addresses normalize to their registered package and cannot mismatch the manifest identity', async () => {
  const { session } = fixture();
  await session.initialize();
  await session.preview('silan://themes/sand/theme.json');
  assert.equal(session.getSnapshot().displayedUri, 'silan://themes/sand');
  for (const uri of ['silan://themes/../sand', 'silan://themes/%73and', 'silan://themes/sand?x=1']) {
    await session.preview(uri);
    assert.equal(session.getSnapshot().phase, 'failed');
  }
  const mismatched = fixture(async () => paper);
  await mismatched.session.initialize();
  await mismatched.session.preview('silan://themes/sand');
  assert.equal(mismatched.session.getSnapshot().phase, 'failed');
  assert.deepEqual(mismatched.projected, ['paper']);
});

test('restoring a saved preference does not rewrite storage', async () => {
  const { session } = fixture(undefined, {
    read: () => ({uri: 'silan://themes/sand', sidebars: {}}), write: () => assert.fail('restoration is read only'),
  });
  await session.initialize();
  assert.equal(session.getSnapshot().appliedUri, 'silan://themes/sand');
  assert.equal(session.getSnapshot().phase, 'ready');
});

test('a pending restore cannot commit a newer user preview', async () => {
  const restored = deferred();
  const entered = deferred();
  let calls = 0;
  const { session } = fixture(() => {
    if (++calls === 1) { entered.resolve(); return restored.promise; }
    return Promise.resolve(sand);
  }, { read: () => ({uri: 'silan://themes/sand', sidebars: {}}), write: () => assert.fail('must not apply a user preview') });
  const initializing = session.initialize();
  await entered.promise;
  await session.preview('silan://themes/sand');
  restored.resolve(sand);
  await initializing;
  assert.equal(session.getSnapshot().phase, 'previewing');
  assert.equal(session.getSnapshot().appliedUri, 'silan://themes/paper');
});

test('discovery joins concurrent requests and refreshes after completion', async () => {
  const request = deferred(); let calls = 0;
  const catalog = new ThemeCatalog([{ ...source(), list: () => { calls++; return request.promise; } }]);
  const first = catalog.list(); const second = catalog.list();
  assert.equal(first, second);
  request.resolve([{ uri: 'silan://themes/sand', name: 'Sand' }]);
  await first;
  assert.equal(calls, 1);
  await catalog.list();
  assert.equal(calls, 2);
});

test('registered production factories load a new workspace package without a theme-name branch', async () => {
  const custom = structuredClone(sand); custom.id = 'research'; custom.name = 'Research';
  const calls = [];
  const registry = new ThemeRegistry([
    ['builtin', createBuiltinThemeSource], ['workspace', createWorkspaceThemeSource],
  ]);
  const catalog = registry.create({ builtins: [paper, sand], workspace: {
    list: async () => [{ uri: 'silan://themes/research', name: 'Research' }],
    load: async uri => { calls.push(uri); return custom; },
  } });
  assert.equal((await catalog.list()).length, 3);
  const loaded = parseTheme(await catalog.load('silan://themes/research/theme.json'));
  assert.equal(loaded.id, 'research');
  assert.deepEqual(calls, ['silan://themes/research']);
  assert.equal(parseTheme(await catalog.load('silan://themes/paper')).id, 'paper');
});

test('a renderer rejecting unsupported CSS leaves the previous theme applied', async () => {
  const catalog = new ThemeCatalog([source()]);
  const projected = [];
  const session = new ThemeSession(catalog, { apply: theme => {
    if (theme.id === 'sand') throw Error('unsupported color');
    projected.push(theme.id);
  } }, { read: () => null, write: () => {} }, 'silan://themes/paper', parseTheme(paper));
  await session.initialize();
  await session.preview('silan://themes/sand');
  assert.equal(session.getSnapshot().phase, 'failed');
  assert.equal(session.getSnapshot().displayedUri, 'silan://themes/paper');
  assert.deepEqual(projected, ['paper']);
});

import { sidebarDefaults, parseSidebarStyle, validateSidebarImage } from './SidebarAppearance';
import { sidebarProjection } from './SidebarProjection';
import { LocalThemePreference } from './ThemePreference';

test('sidebar preview, apply, reset and cancel share the theme transaction', async () => {
  const saved = [];
  const { session } = fixture(undefined, { read: () => null, write: value => saved.push(value) });
  const initial = session.sidebarStyle('editor');
  session.customizeSidebar('editor', { ...initial, background: '#123456', radius: 12 });
  assert.equal(saved.length, 0);
  session.cancel();
  assert.deepEqual(session.getSnapshot().sidebars, {});
  session.customizeSidebar('editor', { ...initial, background: '#123456' });
  session.commit();
  session.customizeSidebar('workspace', session.sidebarStyle('workspace'));
  session.customizeSidebar('editor', null);
  session.cancel();
  assert.equal(session.getSnapshot().sidebars.editor.background, '#123456');
  assert.equal(session.getSnapshot().sidebars.workspace, undefined);
  assert.equal(saved[0].sidebars.editor.background, '#123456');
});

test('persisted sidebar overrides restore even for the default theme address', async () => {
  const sidebars = { editor: { ...sidebarDefaults(parseTheme(paper), 'editor'), radius: 17 } };
  const catalog = new ThemeCatalog([{ list: async () => [{uri: 'silan://themes/paper', name: 'Paper'}], load: async () => paper }]);
  const session = new ThemeSession(catalog, { apply() {} }, { read: () => ({uri:'silan://themes/paper',sidebars}), write() { assert.fail(); } }, 'silan://themes/paper', parseTheme(paper));
  await session.initialize();
  assert.equal(session.getSnapshot().phase, 'ready');
  assert.equal(session.sidebarStyle('editor').radius, 17);
  session.customizeSidebar('editor', null);
  session.cancel();
  assert.equal(session.sidebarStyle('editor').radius, 17);
});

test('sidebar edits invalidate pending theme requests and failed saves keep previous baseline', async () => {
  const pending = deferred();
  const { session } = fixture(() => pending.promise, {read: () => null, write() { throw Error('quota'); }});
  await session.initialize();
  const loading = session.preview('silan://themes/sand');
  session.customizeSidebar('editor', { ...session.sidebarStyle('editor'), radius: 20 });
  pending.resolve(sand);
  await loading;
  assert.equal(session.getSnapshot().displayedUri, 'silan://themes/paper');
  session.commit();
  assert.equal(session.getSnapshot().phase, 'failed');
  session.cancel();
  assert.deepEqual(session.getSnapshot().sidebars, {});
});

test('sidebar projection rejects CSS injection, unsupported images and out-of-range dimensions', () => {
  const style = sidebarDefaults(parseTheme(paper), 'editor');
  for (const change of [{background:'red;display:none'}, {radius:25}, {fontSize:NaN}, {image:'https://example.com/x.png'}, {imagePosition:'top;}'}, {image:'data:image/png;base64,PHN2Zz4='}]) {
    assert.throws(() => parseSidebarStyle({...style, ...change}));
  }
  assert.throws(() => validateSidebarImage('data:image/svg+xml;base64,PHN2Zz4='));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=';
  assert.equal(validateSidebarImage(png), png);
  const css = sidebarProjection({editor:{...style,image:png}});
  assert.match(css, /:root .content-part-rail/);
  assert.ok(!css.includes(':root .sidebar'));
  assert.equal(sidebarProjection({}), '');
});

test('local preference migrates once and validates the complete atomic record', () => {
  const data = new Map([['silan.desktop.theme', 'silan://themes/sand']]);
  const storage = {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const preference = new LocalThemePreference(() => storage);
  assert.deepEqual(preference.read(), {uri:'silan://themes/sand',sidebars:{}});
  assert.equal(data.has('silan.desktop.theme'), false);
  preference.write({uri:'silan://themes/paper',sidebars:{editor:sidebarDefaults(parseTheme(paper),'editor')}});
  assert.equal(preference.read().sidebars.editor.image, null);
  data.set('silan.desktop.appearance', '{"version":2}');
  assert.throws(() => preference.read(), /Unsupported/);
});
