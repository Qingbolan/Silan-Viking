/**
 * Classifies failures of the deployed-site status check so the dashboard can
 * retry transient network faults quietly and explain the rest calmly instead
 * of showing raw transport errors.
 */

export type RemoteStatusFailureKind = 'transient' | 'credential' | 'fatal';

export type RemoteStatusFailure = {
  kind: RemoteStatusFailureKind;
  message: string;
};

/** Consecutive transient failures tolerated silently before a notice. */
export const REMOTE_STATUS_SILENT_RETRIES = 3;

const TRANSIENT = /\b(tls|ssl|handshake|certificate|timed? ?out|timeout|connection (refused|reset|closed|aborted)|network|dns|resolve|unreachable|temporar|eof|io error|broken pipe|50[234])\b/i;

export function classifyRemoteStatusError(raw: unknown): RemoteStatusFailure {
  const text = String(raw).replace(/^Error:\s*/i, '');
  if (/SILAN_STATS_SYNC_TOKEN/.test(text)) {
    return {
      kind: 'credential',
      message: 'Deployed status needs SILAN_STATS_SYNC_TOKEN. Add it to the project .env to compare with the deployed site.',
    };
  }
  if (TRANSIENT.test(text)) {
    return {
      kind: 'transient',
      message: 'Couldn’t reach the deployed site (network or TLS problem). Retrying automatically.',
    };
  }
  return {
    kind: 'fatal',
    message: `Deployed status is unavailable: ${text.replace(/^remote status error:\s*/i, '')}`,
  };
}

/** Exponential backoff for status polling after failures: 4s, 8s, … ≤ 60s. */
export const remoteStatusRetryDelay = (consecutiveFailures: number) => (
  Math.min(60_000, 2_000 * 2 ** Math.max(1, consecutiveFailures))
);

/**
 * Whether a failure should be shown yet. Transient faults stay silent until
 * they persist; credential and other failures are explained immediately.
 */
export const remoteStatusFailureVisible = (failure: RemoteStatusFailure, consecutiveFailures: number) => (
  failure.kind !== 'transient' || consecutiveFailures >= REMOTE_STATUS_SILENT_RETRIES
);
