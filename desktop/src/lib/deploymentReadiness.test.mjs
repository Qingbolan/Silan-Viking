import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automaticDeploymentPullKey,
  clearResolvedSynchronizationError,
  deploymentReadinessFor,
} from './deploymentReadiness.ts';

const readiness = (overrides = {}) => deploymentReadinessFor({
  localCommitCount: 2,
  remoteCommitCount: 0,
  syncState: 'local_ahead',
  workspaceChangeCount: 0,
  unsavedDocumentCount: 0,
  planState: 'ready',
  planError: null,
  deploying: false,
  pulling: false,
  ...overrides,
});

test('committed content with a loaded plan is ready to deploy', () => {
  assert.deepEqual(readiness(), {
    state: 'ready',
    canDeploy: true,
    canPull: false,
    message: '2 committed moments ready to deploy',
    actionTitle: 'Deploy committed content to the production website',
  });
});

test('unsaved editor state stays local without blocking the committed snapshot', () => {
  const result = readiness({ unsavedDocumentCount: 1 });
  assert.equal(result.state, 'ready_with_unsaved');
  assert.equal(result.canDeploy, true);
  assert.equal(result.message, '2 committed moments ready; 1 unsaved Markdown file will stay local');
});

test('uncommitted workspace changes explain the commit prerequisite', () => {
  const result = readiness({ workspaceChangeCount: 3 });
  assert.equal(result.state, 'blocked_uncommitted');
  assert.equal(result.canDeploy, false);
  assert.equal(result.message, '3 uncommitted changes must be committed first');
});

test('a deployment-plan failure is visible and retryable', () => {
  const result = readiness({
    planState: 'error',
    planError: 'Error: content schema could not be scanned',
  });
  assert.equal(result.state, 'check_failed');
  assert.equal(result.canDeploy, false);
  assert.equal(result.message, 'Deployment check failed: content schema could not be scanned');
});

test('version comparison and synchronized states do not expose deploy', () => {
  assert.equal(readiness({ localCommitCount: null, syncState: null }).state, 'comparing');
  assert.equal(readiness({ localCommitCount: 0, syncState: 'synchronized' }).state, 'synchronized');
  assert.equal(readiness({ localCommitCount: 0, syncState: 'synchronized' }).canDeploy, false);
});

test('remote-ahead content can be pulled with non-conflicting workspace edits', () => {
  const result = readiness({
    localCommitCount: 0,
    remoteCommitCount: 1,
    syncState: 'remote_ahead',
    workspaceChangeCount: 2,
  });
  assert.equal(result.state, 'remote_ahead');
  assert.equal(result.canDeploy, false);
  assert.equal(result.canPull, true);
  assert.equal(result.message, '1 moment exists on the deployed version');
});

test('unsaved editor buffers block pull because Git cannot inspect them for conflicts', () => {
  const result = readiness({
    localCommitCount: 0,
    remoteCommitCount: 1,
    syncState: 'remote_ahead',
    unsavedDocumentCount: 1,
  });
  assert.equal(result.canPull, false);
  assert.match(result.message, /save editor changes before pulling/);
});

test('diverged histories block both pull and deploy', () => {
  const result = readiness({
    localCommitCount: 1,
    remoteCommitCount: 1,
    syncState: 'diverged',
  });
  assert.equal(result.state, 'diverged');
  assert.equal(result.canPull, false);
  assert.equal(result.canDeploy, false);
});

test('automatic pull attempts each remote revision only when editor buffers are saved', () => {
  const status = {
    local_head: 'local',
    remote_head: 'remote',
    state: 'remote_ahead',
  };
  assert.equal(automaticDeploymentPullKey(status, 0), 'local:remote');
  assert.equal(automaticDeploymentPullKey(status, 1), null);
  assert.equal(automaticDeploymentPullKey({ ...status, state: 'local_ahead' }, 0), null);
});

test('a successful status transition clears only stale synchronization errors', () => {
  const resolved = { local_head: 'local', remote_head: 'remote', state: 'local_ahead' };
  assert.equal(clearResolvedSynchronizationError(
    'workspace synchronization stopped safely: branch has no upstream',
    resolved,
  ), null);
  assert.equal(clearResolvedSynchronizationError('another operation failed', resolved), 'another operation failed');
});
