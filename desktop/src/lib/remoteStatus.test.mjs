import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REMOTE_STATUS_SILENT_RETRIES,
  classifyRemoteStatusError,
  remoteStatusFailureVisible,
  remoteStatusRetryDelay,
} from './remoteStatus.ts';

test('transient TLS and network failures retry quietly with backoff', () => {
  const failure = classifyRemoteStatusError(
    'remote status error: https://api.example.com/api/v1/content/status: io error: tls handshake eof',
  );
  assert.equal(failure.kind, 'transient');
  assert.doesNotMatch(failure.message, /https:|io error/);
  assert.equal(remoteStatusFailureVisible(failure, 1), false);
  assert.equal(remoteStatusFailureVisible(failure, REMOTE_STATUS_SILENT_RETRIES), true);
  assert.ok(remoteStatusRetryDelay(1) < remoteStatusRetryDelay(3));
  assert.equal(remoteStatusRetryDelay(20), 60_000);
});

test('credential and other failures are explained immediately', () => {
  const credential = classifyRemoteStatusError(
    'remote verification needs SILAN_STATS_SYNC_TOKEN in the process environment',
  );
  assert.equal(credential.kind, 'credential');
  assert.equal(remoteStatusFailureVisible(credential, 1), true);
  assert.equal(classifyRemoteStatusError('remote status error: invalid commit identifier').kind, 'fatal');
});
