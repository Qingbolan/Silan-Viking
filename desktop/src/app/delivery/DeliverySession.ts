import type { DeliverySyncStatus, DeploymentPlan, DeployRunStatus, DeployVerificationResult } from '../../types';
import { automaticDeploymentPullKey, deploymentReadinessFor } from '../../lib/deploymentReadiness';
import { classifyRemoteStatusError, remoteStatusFailureVisible, remoteStatusRetryDelay, type RemoteStatusFailure } from '../../lib/remoteStatus';

export interface DeliveryPort {
  plan(): Promise<DeploymentPlan>;
  status(): Promise<DeliverySyncStatus>;
  deploy(): Promise<DeployRunStatus>;
  verify(): Promise<DeployVerificationResult>;
  pull(): Promise<DeliverySyncStatus>;
}

type PlanLoad =
  | { state: 'loading'; plan: null; error: null }
  | { state: 'ready'; plan: DeploymentPlan; error: null }
  | { state: 'error'; plan: null; error: string };
type Operation = 'idle' | 'deploying' | 'verifying' | 'pulling' | 'refreshing_deploy' | 'refreshing_pull';
const transitions: Record<Operation, readonly Operation[]> = {
  idle: ['deploying', 'pulling'],
  deploying: ['verifying', 'idle'],
  verifying: ['refreshing_deploy', 'idle'],
  pulling: ['refreshing_pull', 'idle'],
  refreshing_deploy: ['idle'],
  refreshing_pull: ['idle'],
};
export type DeliverySnapshot = Readonly<{
  planLoad: PlanLoad;
  status: DeliverySyncStatus | null;
  failure: RemoteStatusFailure | null;
  refreshingStatus: boolean;
  operation: Operation;
  staticRelease: string | null;
  verification: DeployVerificationResult | null;
}>;
export interface DeliveryEvents {
  error(message: string | null): void;
  status(status: DeliverySyncStatus): void;
  pulled(): Promise<void>;
}

/** One workspace's delivery lifecycle. React and Tauri are external adapters.
 * Concurrent status readers share a request. Mutation epochs reject responses
 * issued before pull/deploy, without caching remote state across workspaces. */
export class DeliverySession {
  readonly #port: DeliveryPort;
  readonly #events: DeliveryEvents;
  readonly #listeners = new Set<() => void>();
  readonly #attemptedPulls = new Set<string>();
  #snapshot: DeliverySnapshot = {
    planLoad: { state: 'loading', plan: null, error: null }, status: null,
    failure: null, refreshingStatus: false, operation: 'idle',
    staticRelease: null, verification: null,
  };
  #epoch = 0;
  #failures = 0;
  #statusFlight: { promise: Promise<void>; manual: boolean } | null = null;
  #planFlight: Promise<void> | null = null;

  constructor(port: DeliveryPort, events: DeliveryEvents) {
    this.#port = port;
    this.#events = events;
  }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };
  #update(change: Partial<Omit<DeliverySnapshot, 'operation'>>) {
    this.#snapshot = { ...this.#snapshot, ...change };
    this.#listeners.forEach(listener => listener());
  }
  #transition(operation: Operation, change: Partial<Omit<DeliverySnapshot, 'operation'>> = {}) {
    if (!transitions[this.#snapshot.operation].includes(operation)) {
      throw new Error(`Invalid delivery transition: ${this.#snapshot.operation} -> ${operation}`);
    }
    this.#snapshot = { ...this.#snapshot, ...change, operation };
    this.#listeners.forEach(listener => listener());
  }
  readiness(unsavedDocumentCount: number) {
    const { status, planLoad, failure, operation } = this.#snapshot;
    return deploymentReadinessFor({
      localCommitCount: status?.local_commits ?? null,
      remoteCommitCount: status?.remote_commits ?? 0,
      syncState: status?.state ?? null, remoteFailure: failure,
      workspaceChangeCount: status?.workspace_changes ?? planLoad.plan?.dirty_count ?? 0,
      unsavedDocumentCount, planState: planLoad.state, planError: planLoad.error,
      deploying: operation === 'deploying' || operation === 'verifying' || operation === 'refreshing_deploy',
      pulling: operation === 'pulling' || operation === 'refreshing_pull',
    });
  }
  #canRead() { return this.#snapshot.operation === 'idle' || this.#snapshot.operation === 'refreshing_deploy' || this.#snapshot.operation === 'refreshing_pull'; }
  refreshPlan = (): Promise<void> => {
    if (!this.#canRead()) return Promise.resolve();
    if (this.#planFlight) return this.#planFlight;
    const epoch = this.#epoch;
    this.#update({ planLoad: { state: 'loading', plan: null, error: null } });
    const flight = Promise.resolve().then(() => this.#port.plan()).then(plan => {
      if (epoch === this.#epoch) this.#update({ planLoad: { state: 'ready', plan, error: null } });
    }, reason => {
      if (epoch === this.#epoch) this.#update({ planLoad: { state: 'error', plan: null, error: String(reason) } });
    }).finally(() => { if (this.#planFlight === flight) this.#planFlight = null; });
    this.#planFlight = flight;
    return flight;
  };
  refreshStatus = (manual = true): Promise<void> => {
    if (!this.#canRead()) return Promise.resolve();
    if (this.#statusFlight) {
      this.#statusFlight.manual ||= manual;
      if (manual) this.#update({ refreshingStatus: true });
      return this.#statusFlight.promise;
    }
    const epoch = this.#epoch;
    if (manual) this.#update({ refreshingStatus: true });
    const flight = { manual, promise: Promise.resolve() };
    flight.promise = Promise.resolve().then(() => this.#port.status()).then(status => {
      if (epoch !== this.#epoch) return;
      this.#failures = 0;
      this.#acceptStatus(status);
    }, reason => {
      if (epoch !== this.#epoch) return;
      const failure = classifyRemoteStatusError(reason);
      this.#failures += 1;
      if (flight.manual || remoteStatusFailureVisible(failure, this.#failures)) this.#update({ failure });
    }).finally(() => {
      if (this.#statusFlight !== flight) return;
      this.#statusFlight = null;
      this.#update({ refreshingStatus: false });
    });
    this.#statusFlight = flight;
    return flight.promise;
  };
  get pollDelay() {
    if (this.#failures) return remoteStatusRetryDelay(this.#failures);
    return this.#snapshot.status?.state === 'not_configured' ? 30_000 : 2_000;
  }
  #acceptStatus(status: DeliverySyncStatus) {
    this.#failures = 0;
    this.#update({ status, failure: null });
    this.#events.status(status);
  }
  #begin(operation: 'deploying' | 'pulling') {
    this.#epoch += 1;
    this.#statusFlight = null;
    this.#planFlight = null;
    this.#transition(operation, { refreshingStatus: false });
    this.#events.error(null);
  }
  async #finish() {
    this.#transition('idle');
    // A failed mutation can invalidate a plan that was still loading. Ensure
    // its discarded reply does not leave readiness permanently in "loading".
    if (this.#snapshot.planLoad.state === 'loading' && !this.#planFlight) await this.refreshPlan();
  }
  async deploy(unsavedDocumentCount: number): Promise<boolean> {
    if (this.#snapshot.operation !== 'idle' || !this.readiness(unsavedDocumentCount).canDeploy) return false;
    this.#begin('deploying');
    this.#update({ staticRelease: null, verification: null });
    try {
      const deployed = await this.#port.deploy();
      this.#transition('verifying', { staticRelease: deployed.static_release });
      const verification = await this.#port.verify();
      this.#transition('refreshing_deploy', { verification });
      await Promise.all([this.refreshPlan(), this.refreshStatus()]);
    } catch (reason) {
      this.#events.error(String(reason));
    } finally {
      await this.#finish();
    }
    return true;
  }
  async pull(unsavedDocumentCount: number, automatic = false): Promise<boolean> {
    if (this.#snapshot.operation !== 'idle' || !this.readiness(unsavedDocumentCount).canPull) return false;
    if (automatic) {
      const key = automaticDeploymentPullKey(this.#snapshot.status, unsavedDocumentCount);
      if (!key || this.#attemptedPulls.has(key)) return false;
      this.#attemptedPulls.add(key);
    }
    this.#begin('pulling');
    try {
      this.#acceptStatus(await this.#port.pull());
      this.#transition('refreshing_pull');
      await Promise.all([this.#events.pulled(), this.refreshPlan()]);
    } catch (reason) {
      this.#events.error(String(reason));
    } finally {
      await this.#finish();
    }
    return true;
  }
}
