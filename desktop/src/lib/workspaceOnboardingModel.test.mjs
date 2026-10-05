import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultWorkspaceDestination,
  repositoryName,
} from './workspaceOnboardingModel.ts';

test('repository addresses produce a stable device-local destination', () => {
  assert.equal(repositoryName('git@github.com:Qingbolan/silan-content.git'), 'silan-content');
  assert.equal(
    defaultWorkspaceDestination('https://github.com/Qingbolan/silan-content.git'),
    '~/Silan Workspaces/silan-content',
  );
});

const { setupReducer, workspaceFolderName, localizedSetupError } = await import('./workspaceOnboardingModel.ts');

test('missing workspace uses a repair page rather than a remote repository form', () => {
  assert.equal(setupReducer({ kind: 'checking' }, { type: 'bootstrap', status: {
    state: 'invalid_workspace', project_root: '/removed/research', project_name: 'Research', error: 'missing config',
  } }).page, 'repair');
});

test('in-flight setup rejects navigation and failure returns to the current step', () => {
  const working = setupReducer({ kind: 'page', page: 'review', error: null }, { type: 'start', stage: 'creating' });
  assert.deepEqual(setupReducer(working, { type: 'navigate', page: 'welcome' }), working);
  const failed = setupReducer(working, { type: 'failed', error: 'destination exists' });
  assert.deepEqual(failed, { kind: 'page', page: 'review', error: 'destination exists' });
  assert.equal(setupReducer(failed, { type: 'start', stage: 'creating' }).kind, 'working');
});

test('repository selection cannot skip verification to reach destination', () => {
  const repository = { kind: 'page', page: 'repository', error: null };
  assert.deepEqual(setupReducer(repository, { type: 'navigate', page: 'join-location' }), repository);
  const verified = setupReducer(setupReducer(repository, { type: 'start', stage: 'checking_access' }), { type: 'completed', page: 'join-location' });
  assert.equal(verified.page, 'join-location');
});

test('only a completed preparation can enter the editor', () => {
  const reviewing = { kind: 'page', page: 'review', error: null };
  assert.deepEqual(setupReducer(reviewing, { type: 'enter' }), reviewing);
  const done = setupReducer(setupReducer(reviewing, { type: 'start', stage: 'creating' }), { type: 'completed', page: 'complete' });
  assert.deepEqual(setupReducer(done, { type: 'enter' }), { kind: 'ready' });
});

test('workspace names remain local folder names, including Chinese names', () => {
  assert.equal(workspaceFolderName('我的研究空间'), '我的研究空间');
  assert.equal(workspaceFolderName('../outside'), '-outside');
  assert.equal(workspaceFolderName('...'), 'my-research');
  assert.match(localizedSetupError('Permission denied (publickey)'), /SSH/);
});
