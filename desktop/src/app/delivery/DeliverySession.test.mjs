import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliverySession } from './DeliverySession';
const status = (state = 'local_ahead', remote = 'remote') => ({
  state, local_head: 'local', remote_head: remote, local_commits: state === 'local_ahead' ? 1 : 0,
  remote_commits: state === 'remote_ahead' ? 1 : 0, workspace_changes: 0,
});
const plan = { dirty_count: 0, head: 'local' };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture(overrides = {}) {
  const calls = [], errors = [], statuses = [];
  const port = {
    plan: async () => { calls.push('plan'); return plan; },
    status: async () => { calls.push('status'); return status(); },
    deploy: async () => { calls.push('deploy'); return { static_release: 'release-1' }; },
    verify: async () => { calls.push('verify'); return { verified: true }; },
    pull: async () => { calls.push('pull'); return status('synchronized'); },
    ...overrides,
  };
  const session = new DeliverySession(port, {
    error: e => errors.push(e), status: s => statuses.push(s),
    pulled: async () => { calls.push('reload-content'); },
  });
  return { session, calls, errors, statuses };
}

test('concurrent plan and status readers share requests and stable snapshots', async () => {
  const { session, calls } = fixture();
  assert.equal(session.getSnapshot(), session.getSnapshot());
  await Promise.all([session.refreshPlan(), session.refreshPlan(), session.refreshStatus(false), session.refreshStatus()]);
  assert.deepEqual(calls, ['plan', 'status']);
  assert.equal(session.getSnapshot().refreshingStatus, false);
  assert.equal(session.readiness(0).canDeploy, true);
  assert.equal(session.readiness(2).canDeploy, true, 'unsaved files stay local during committed deployment');
});

test('polling keeps transient failures quiet, backs off and recovers', async () => {
  let broken = true;
  const { session } = fixture({ status: async () => {
    if (broken) throw new Error('TLS handshake failed');
    return status('not_configured');
  } });
  await session.refreshStatus(false);
  assert.equal(session.getSnapshot().failure, null);
  assert.equal(session.pollDelay, 4000);
  await session.refreshStatus(false);
  assert.equal(session.getSnapshot().failure, null);
  assert.equal(session.pollDelay, 8000);
  await session.refreshStatus(false);
  assert.equal(session.getSnapshot().failure.kind, 'transient');
  assert.equal(session.pollDelay, 16000);
  broken = false;
  await session.refreshStatus(false);
  assert.equal(session.getSnapshot().failure, null);
  assert.equal(session.pollDelay, 30000);
});

test('a manual refresh joining polling shows a failure immediately', async () => {
  const request = deferred();
  const { session } = fixture({ status: () => request.promise });
  const poll = session.refreshStatus(false);
  const manual = session.refreshStatus();
  request.reject(new Error('network timeout'));
  await Promise.all([poll, manual]);
  assert.equal(session.getSnapshot().failure.kind, 'transient');
  assert.equal(session.getSnapshot().refreshingStatus, false);
});

test('deployment owns the full deploy/verify/refresh lifecycle and rejects double clicks', async () => {
  const deploy = deferred();
  const { session, calls } = fixture({ deploy: () => { calls.push('deploy'); return deploy.promise; } });
  await Promise.all([session.refreshPlan(), session.refreshStatus()]);
  const run = session.deploy(0);
  assert.equal(session.getSnapshot().operation, 'deploying');
  assert.equal(await session.deploy(0), false);
  assert.equal(await session.pull(0), false);
  deploy.resolve({ static_release: 'release-1' });
  await run;
  assert.equal(calls.filter(c => c === 'deploy').length, 1);
  assert.ok(calls.indexOf('verify') > calls.indexOf('deploy'));
  assert.equal(session.getSnapshot().verification.verified, true);
  assert.equal(session.getSnapshot().operation, 'idle');
});

test('failed verification releases the operation and preserves the deployed release', async () => {
  const { session, errors } = fixture({ verify: async () => { throw new Error('verification failed'); } });
  await Promise.all([session.refreshPlan(), session.refreshStatus()]);
  await session.deploy(0);
  assert.equal(session.getSnapshot().operation, 'idle');
  assert.equal(session.getSnapshot().staticRelease, 'release-1');
  assert.equal(session.getSnapshot().verification, null);
  assert.match(errors.at(-1), /verification failed/);
});

test('old remote and plan responses cannot overwrite state after pull', async () => {
  const oldStatus = deferred(), oldPlan = deferred();
  let statusRequests = 0, planRequests = 0;
  const { session, statuses } = fixture({
    status: () => ++statusRequests === 1 ? Promise.resolve(status('remote_ahead')) : oldStatus.promise,
    plan: () => ++planRequests === 1 ? oldPlan.promise : Promise.resolve(plan),
  });
  await session.refreshStatus();
  const pendingStatus = session.refreshStatus(false), pendingPlan = session.refreshPlan();
  await session.pull(0);
  oldStatus.resolve(status('remote_ahead', 'obsolete'));
  oldPlan.resolve({ ...plan, head: 'obsolete' });
  await Promise.all([pendingStatus, pendingPlan]);
  assert.equal(session.getSnapshot().status.state, 'synchronized');
  assert.equal(session.getSnapshot().planLoad.plan.head, 'local');
  assert.equal(statuses.at(-1).state, 'synchronized');
});

test('automatic pull preserves dirty buffers and attempts each revision only once after failure', async () => {
  let remote = 'one', attempts = 0;
  const { session } = fixture({
    status: async () => status('remote_ahead', remote),
    pull: async () => { attempts++; throw new Error('conflict'); },
  });
  await session.refreshStatus();
  assert.equal(await session.pull(1, true), false);
  assert.equal(attempts, 0);
  assert.equal(await session.pull(0, true), true);
  assert.equal(await session.pull(0, true), false);
  assert.equal(attempts, 1);
  remote = 'two';
  await session.refreshStatus();
  assert.equal(await session.pull(0, true), true);
  assert.equal(attempts, 2);
  assert.equal(await session.pull(0), true, 'manual retry remains available');
});

test('pull remains busy until content reload and plan refresh finish', async () => {
  const reload = deferred();
  const port = {
    plan: async () => plan, status: async () => status('remote_ahead'),
    pull: async () => status('local_ahead'),
    deploy: async () => { throw new Error('must not deploy during reload'); },
    verify: async () => ({ verified: true }),
  };
  const session = new DeliverySession(port, { error() {}, status() {}, pulled: () => reload.promise });
  await session.refreshStatus();
  const pulling = session.pull(0);
  await Promise.resolve();
  assert.equal(session.getSnapshot().operation, 'refreshing_pull');
  assert.equal(session.readiness(0).state, 'pulling');
  assert.equal(await session.deploy(0), false);
  reload.resolve();
  await pulling;
  assert.equal(session.getSnapshot().operation, 'idle');
});

test('a failed deployment never verifies and permits an explicit retry', async () => {
  let attempts = 0;
  const { session, calls } = fixture({ deploy: async () => {
    attempts++;
    throw new Error('upload failed');
  } });
  await Promise.all([session.refreshPlan(), session.refreshStatus()]);
  await session.deploy(0);
  assert.equal(calls.includes('verify'), false);
  assert.equal(session.getSnapshot().operation, 'idle');
  await session.deploy(0);
  assert.equal(attempts, 2);
});

test('failed pull refreshes an invalidated loading plan instead of leaving readiness stuck', async () => {
  const oldPlan=deferred(); let reads=0;
  const { session } = fixture({
    status: async()=>status('remote_ahead'),
    plan: ()=>++reads===1?oldPlan.promise:Promise.resolve(plan),
    pull: async()=>{throw new Error('conflict');},
  });
  await session.refreshStatus();
  const pending=session.refreshPlan();
  await session.pull(0);
  assert.equal(session.getSnapshot().planLoad.state,'ready');
  oldPlan.resolve({...plan,head:'obsolete'});
  await pending;
  assert.equal(session.getSnapshot().planLoad.plan.head,'local');
});
