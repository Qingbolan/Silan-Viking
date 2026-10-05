import test from 'node:test';
import assert from 'node:assert/strict';
import { SidebarFactory } from './SidebarFactory.ts';

test('plugin composition respects slots, order and supplied context without changing registration order', () => {
  const plugins = [
    { id: 'account', slot: 'footer', order: 30, render: c => c.displayName },
    { id: 'library', slot: 'navigation', order: 20, render: () => 'library' },
    { id: 'custom', slot: 'navigation', order: 10, render: () => 'custom' },
  ];
  const factory = new SidebarFactory(plugins);
  assert.deepEqual(factory.create({ displayName: 'Author' }), {
    navigation: [{ id: 'custom', content: 'custom' }, { id: 'library', content: 'library' }],
    footer: [{ id: 'account', content: 'Author' }],
  });
  assert.equal(plugins[0].id, 'account');
  assert.deepEqual(new SidebarFactory([]).create({}), { navigation: [], footer: [] });
});

test('ambiguous plugin identities are rejected before rendering', () => {
  const plugin = { id: 'duplicate', slot: 'footer', order: 0, render: () => null };
  assert.throws(() => new SidebarFactory([plugin, plugin]), /Duplicate sidebar plugin/);
});
