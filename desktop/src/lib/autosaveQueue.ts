/** One write owner for editor mutations. A failed write never poisons later saves. */
export class AutosaveQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(write: () => Promise<T>): Promise<T> {
    const result = this.tail.then(write);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Persisted revisions advance even when a newer local body is still pending. */
export function mergePersistedTranslations<T extends { id: string; content: string; title?: string }>(
  persisted: T[], drafts: T[], pending: ReadonlySet<string>,
): T[] {
  const byId = new Map(drafts.map(draft => [draft.id, draft]));
  return persisted.map((translation) => {
    const draft = byId.get(translation.id);
    return draft && pending.has(translation.id)
      ? { ...translation, content: draft.content, ...(draft.title === undefined ? {} : { title: draft.title }) } : translation;
  });
}
