import test from 'node:test';
import assert from 'node:assert/strict';
import { LexicalEditorPluginRegistry } from './extensionPoints.ts';

const command = id => ({ id, title: id, run() {} });
const plugin = (id, priority) => ({
  id, priority, nodes: [class {}], extensions: [{ name: id }],
  slashCommands: [command(id)], Component: () => null,
});

test('every contribution follows the same stable priority order', () => {
  const low = plugin('low', 0);
  const high = plugin('high', 10);
  const tied = plugin('tied', 10);
  const registry = new LexicalEditorPluginRegistry([low, high, tied]);
  assert.deepEqual(registry.nodes(), [high.nodes[0], tied.nodes[0], low.nodes[0]]);
  assert.deepEqual(registry.extensions().map(e => e.name), ['high', 'tied', 'low']);
  assert.deepEqual(registry.components().map(c => c.id), ['high', 'tied', 'low']);
  assert.deepEqual(registry.composeCommands([command('builtin')], [command('host')]).map(c => c.id),
    ['builtin', 'high', 'tied', 'low', 'host']);
});

test('composition rejects ambiguous IDs across all command sources', () => {
  assert.throws(() => new LexicalEditorPluginRegistry([plugin('same'), plugin('same')]), /Duplicate Markdown/);
  assert.throws(() => new LexicalEditorPluginRegistry([
    { id: 'one', slashCommands: [command('same')] },
    { id: 'two', slashCommands: [command('same')] },
  ]), /Duplicate slash/);
  const registry = new LexicalEditorPluginRegistry([plugin('custom')]);
  assert.throws(() => registry.composeCommands([command('custom')], []), /Duplicate slash/);
  assert.throws(() => registry.composeCommands([], [command('custom')]), /Duplicate slash/);
  assert.throws(() => registry.composeCommands([command('same')], [command('same')]), /Duplicate slash/);
});

test('compiled collections are stable snapshots without repeated allocation', () => {
  const input = plugin('first');
  const plugins = [input];
  const registry = new LexicalEditorPluginRegistry(plugins);
  plugins.push(plugin('later'));
  input.nodes.push(class {});
  input.extensions.length = 0;
  for (const read of ['nodes', 'extensions', 'slashCommands', 'components']) {
    assert.equal(registry[read](), registry[read]());
    assert.equal(registry[read]().length, 1);
    assert.throws(() => registry[read]().pop(), TypeError);
  }
});
