import type { DocumentSnapshot } from "./documentSnapshot.ts";

export interface SourceCoverage { from: number; to: number }

/** A callback belongs to one pane, source event, environment and viewport. */
export interface ProjectionToken {
  pane: object;
  snapshotId: string;
  environmentEpoch: number;
  viewportRevision: number;
  sequence: number;
}

/** Observations advance this state; scheduling a render does not. */
export class ViewProjection {
  desired: DocumentSnapshot | null = null;
  hostRevision: string | null = null;
  renderedRevision: string | null = null;
  measuredRevision: string | null = null;
  environmentEpoch = 0;
  viewportRevision = 0;
  coverage: SourceCoverage[] = [];
  measuredCoverage: SourceCoverage[] = [];
  required: SourceCoverage[] = [];
  private sequence = 0;
  private disposed = false;
  private readonly pane = {};

  get phase(): "waitingForHost" | "projecting" | "measuring" | "settled" {
    if (!this.desired || this.hostRevision !== this.desired.id) return "waitingForHost";
    if (!covers(this.coverage, this.required)) return "projecting";
    return covers(this.measuredCoverage, this.required) ? "settled" : "measuring";
  }

  request(snapshot: DocumentSnapshot): void {
    if (this.disposed || snapshot.id === this.desired?.id) return;
    this.desired = snapshot;
    this.sequence++;
    this.hostRevision = this.renderedRevision = this.measuredRevision = null;
    this.coverage = [];
    this.measuredCoverage = [];
  }

  observeHost(text: string): boolean {
    if (this.disposed || text !== this.desired?.text) return false;
    this.hostRevision = this.desired.id;
    return true;
  }

  environmentChanged(): void {
    this.environmentEpoch++;
    this.sequence++;
    this.measuredRevision = null;
    this.measuredCoverage = [];
  }

  viewportChanged(required: readonly SourceCoverage[]): void {
    this.viewportRevision++;
    this.sequence++;
    this.required = mergeCoverage(required);
  }

  token(): ProjectionToken | null {
    return !this.disposed && this.desired ? { pane: this.pane, snapshotId: this.desired.id,
      environmentEpoch: this.environmentEpoch, viewportRevision: this.viewportRevision, sequence: this.sequence } : null;
  }

  accepts(token: ProjectionToken): boolean {
    return !this.disposed && token.pane === this.pane && token.snapshotId === this.desired?.id && token.environmentEpoch === this.environmentEpoch
      && token.viewportRevision === this.viewportRevision && token.sequence === this.sequence;
  }

  installed(token: ProjectionToken, coverage: readonly SourceCoverage[]): boolean {
    if (!this.accepts(token) || this.hostRevision !== token.snapshotId) return false;
    this.coverage = mergeCoverage([...this.coverage, ...coverage]);
    this.renderedRevision = token.snapshotId;
    return true;
  }

  measured(token: ProjectionToken, coverage: readonly SourceCoverage[]): boolean {
    if (!this.accepts(token) || !covers(this.coverage, coverage)) return false;
    this.measuredCoverage = mergeCoverage([...this.measuredCoverage, ...coverage]);
    this.measuredRevision = token.snapshotId;
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.sequence++;
    this.desired = null;
    this.coverage = this.measuredCoverage = this.required = [];
  }
}

function mergeCoverage(ranges: readonly SourceCoverage[]): SourceCoverage[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from);
  const result: SourceCoverage[] = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last && last.to >= range.from) last.to = Math.max(last.to, range.to);
    else result.push({ ...range });
  }
  return result;
}

function covers(coverage: readonly SourceCoverage[], required: readonly SourceCoverage[]): boolean {
  return required.every(range => coverage.some(done => done.from <= range.from && done.to >= range.to));
}

/** Owned by a single pane; source movement can reuse dimensions, other environments cannot. */
export class PaneMeasurements<T> {
  private readonly values = new Map<string, T>();
  private epoch = 0;

  get environmentEpoch(): number { return this.epoch; }

  environmentChanged(): void { this.epoch++; this.values.clear(); }

  key(blockId: string, contentRevision: number, spec: string, mode: string): string {
    return JSON.stringify([blockId, contentRevision, this.epoch, spec, mode]);
  }

  get(key: string): T | undefined { return this.values.get(key); }

  set(key: string, value: T): void {
    setBounded(this.values, key, value, 1000);
  }
}

/** Sets `key` as the newest entry of `map`, dropping the oldest ones beyond `limit`. */
export function setBounded<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  map.delete(key);
  map.set(key, value);
  for (const oldest of map.keys()) {
    if (map.size <= limit) break;
    map.delete(oldest);
  }
}
