import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationBootstrap } from './ApplicationBootstrap.ts';

test('import and synchronous initialization failures leave the primer with an error', async () => {
  for (const load of [async () => { throw Error('module'); }, async () => ({ mountApplication() { throw Error('theme'); } })]) {
    const errors = [];
    const boot = new ApplicationBootstrap(error => errors.push(error));
    await boot.start(load);
    assert.equal(boot.state, 'failed');
    assert.equal(errors.length, 1);
  }
});

test('committed root becomes ready and subsequent render failures remain visible', async () => {
  const errors = [];
  const boot = new ApplicationBootstrap(error => errors.push(error));
  await boot.start(async () => ({ mountApplication(ready) { ready(); ready(); } }));
  assert.equal(boot.state, 'ready');
  boot.fail(Error('render'));
  boot.fail(Error('duplicate'));
  assert.equal(boot.state, 'failed');
  assert.equal(errors.length, 1);
});

test('late module completion cannot mount after startup timeout', async () => {
  let resolve;
  let mounted = false;
  const boot = new ApplicationBootstrap(() => {});
  const pending = boot.start(() => new Promise(done => { resolve = done; }), 1);
  await new Promise(done => setTimeout(done, 10));
  assert.equal(boot.state, 'failed');
  resolve({ mountApplication() { mounted = true; } });
  await pending;
  assert.equal(mounted, false);
});
