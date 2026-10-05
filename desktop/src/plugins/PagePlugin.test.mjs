import test from 'node:test';
import assert from 'node:assert/strict';
import { PagePluginRegistry } from './PagePlugin.ts';
import { workspaceLocationFrom, workspaceLocationKey, createWorkspaceNavigationHistory, recordWorkspaceLocation, moveWorkspaceNavigationHistory } from '../lib/workspaceNavigation.ts';
const page = (id, order = 0) => ({ apiVersion: 1, id, order, title: id, Page: () => null });
test('registry supports ordered pages, lookup and removal by composition', () => {
 const registry = new PagePluginRegistry([page('later', 10), page('first')]);
 assert.deepEqual(registry.pages.map(p => p.id), ['first', 'later']);
 assert.equal(registry.find('first').title, 'first');
 assert.equal(registry.find('missing'), undefined);
 assert.deepEqual(new PagePluginRegistry([]).pages, []);
});
test('registry rejects incompatible or ambiguous registrations', () => {
 assert.throws(() => new PagePluginRegistry([page('same'), page('same')]), /Duplicate/);
 assert.throws(() => new PagePluginRegistry([{ ...page('new'), apiVersion: 2 }]), /Unsupported/);
 assert.throws(() => new PagePluginRegistry([page('Bad ID')]), /Invalid/);
});
test('plugin routes survive back and forward without turning into content routes', () => {
 const route = workspaceLocationFrom({ screen: 'plugin', pageId: 'research' });
 assert.equal(workspaceLocationKey(route), 'plugin:research');
 let history = createWorkspaceNavigationHistory({ kind: 'dashboard' });
 history = recordWorkspaceLocation(history, route);
 history = moveWorkspaceNavigationHistory(history, -1);
 assert.equal(history.entries[history.index].kind, 'dashboard');
 history = moveWorkspaceNavigationHistory(history, 1);
 assert.deepEqual(history.entries[history.index], route);
});
