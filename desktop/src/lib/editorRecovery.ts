/** Local recovery copies are separate from the canonical Markdown source. */
export class EditorRecovery {
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

  constructor(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>) {
    this.storage = storage;
  }

  read<T>(kind: 'markdown' | 'settings', id: string): T | null {
    const raw = this.storage.getItem(this.key(kind, id));
    if (raw === null) return null;
    const record = JSON.parse(raw);
    if (record.version !== 1) throw new Error('Unsupported editor recovery copy. Keep the copy before resetting storage.');
    return record.value as T;
  }

  write<T>(kind: 'markdown' | 'settings', id: string, value: T): void {
    this.storage.setItem(this.key(kind, id), JSON.stringify({ version: 1, value }));
  }

  remove(kind: 'markdown' | 'settings', id: string): void {
    this.storage.removeItem(this.key(kind, id));
  }

  removeIf<T>(kind: 'markdown' | 'settings', id: string, matches: (value: T) => boolean): void {
    const value = this.read<T>(kind, id);
    if (value !== null && matches(value)) this.remove(kind, id);
  }

  list(): Array<{ kind: 'markdown' | 'settings'; id: string; value: unknown }> {
    const entries: Array<{ kind: 'markdown' | 'settings'; id: string; value: unknown }> = [];
    const prefix = 'silan.editor-recovery.v1:';
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const suffix = key.slice(prefix.length);
      const separator = suffix.indexOf(':');
      const kind = suffix.slice(0, separator);
      const id = suffix.slice(separator + 1);
      if ((kind === 'markdown' || kind === 'settings') && id) entries.push({ kind, id, value: this.read(kind, id) });
    }
    return entries;
  }

  private key(kind: string, id: string): string {
    return `silan.editor-recovery.v1:${kind}:${id}`;
  }
}

export function isSourceConflict(reason: unknown): boolean {
  return String(reason).includes('source changed on disk; reload before saving');
}

/** Refresh must not silently authorize a dirty draft against a newer disk revision. */
export function preserveDraftRevision<T extends { id: string; revision: string }>(
  disk: T, draft: T | undefined, dirty: ReadonlySet<string>,
): T {
  return draft && dirty.has(disk.id) ? { ...disk, ...draft } : disk;
}

/** Bound only the UI wait; the serialized source write keeps its ownership. */
export async function waitForSave(save: Promise<boolean>, milliseconds = 5000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      save,
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
