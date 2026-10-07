import type { EditorDocument, EditorTranslation } from '../../types';
import { AutosaveQueue, mergePersistedTranslations } from '../../lib/autosaveQueue';
import { EditorRecovery, isSourceConflict, preserveDraftRevision } from '../../lib/editorRecovery';

export type SourceConflict = { id: string; kind: 'markdown' | 'settings'; disk: EditorTranslation | null };
type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'failed'; error: string }
  | { phase: 'conflict'; conflict: SourceConflict };
type Snapshot = Readonly<{ documents: EditorDocument[]; dirtyIds: Set<string>; save: SaveState }>;
type Update<T> = T | ((current: T) => T);
export type MarkdownSave = (input: {
  id: string; title: string; content: string; expectedRevision: string;
}) => Promise<EditorDocument>;
export type SourceEdit = { id: string; title: string; content: string; expectedContent: string; expectedRevision: string };
const transitions: Record<SaveState['phase'], readonly SaveState['phase'][]> = {
  idle: ['saving', 'conflict'], saving: ['idle', 'failed', 'conflict'],
  failed: ['idle', 'saving', 'conflict'], conflict: ['idle', 'conflict'],
};

/** Canonical in-memory drafts, persisted baselines and serialized write lifecycle.
 * The Lexical tree remains the editor runtime; these are persisted-document drafts.
 * React subscribes to this store rather than mirroring it in refs and state. */
export class EditorSession {
  readonly writes = new AutosaveQueue();
  readonly recovery: EditorRecovery;
  readonly #listeners = new Set<() => void>();
  #persisted = new Map<string, string>();
  #snapshot: Snapshot = { documents: [], dirtyIds: new Set(), save: { phase: 'idle' } };
  constructor(recovery: EditorRecovery) { this.recovery = recovery; }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };
  get documents() { return this.#snapshot.documents; }
  get dirtyIds() { return this.#snapshot.dirtyIds; }
  get conflict() { return this.#snapshot.save.phase === 'conflict' ? this.#snapshot.save.conflict : null; }
  get blocked() { return this.#snapshot.save.phase === 'conflict'; }
  #publish(change: Partial<Snapshot>) {
    this.#snapshot = { ...this.#snapshot, ...change };
    this.#listeners.forEach(listener => listener());
  }
  #transition(save: SaveState) {
    if (!transitions[this.#snapshot.save.phase].includes(save.phase)) {
      throw new Error(`Invalid editor save transition: ${this.#snapshot.save.phase} -> ${save.phase}`);
    }
    this.#publish({ save });
  }
  updateDocuments = (update: Update<EditorDocument[]>) => {
    this.#publish({ documents: typeof update === 'function' ? update(this.documents) : update });
  };
  updateDirtyIds = (update: Update<Set<string>>) => {
    this.#publish({ dirtyIds: typeof update === 'function' ? update(this.dirtyIds) : update });
  };
  editTranslation(documentId: string, translationId: string, content: string, title?: string) {
    let draft: EditorTranslation | undefined;
    const documents = this.documents.map(document => document.id !== documentId ? document : {
      ...document, translations: document.translations.map(translation => {
        if (translation.id !== translationId) return translation;
        draft = { ...translation, content, title: title || translation.title };
        return draft;
      }),
    });
    if (!draft) throw new Error(`Cannot locate pending Markdown: ${translationId}`);
    this.#publish({ documents, dirtyIds: new Set(this.dirtyIds).add(translationId) });
    // Storage failure is surfaced after publishing the draft, so typing is never lost.
    this.recovery.write('markdown', translationId, draft);
  }
  setConflict = (conflict: SourceConflict | null) => {
    if (conflict) this.#transition({ phase: 'conflict', conflict });
    else if (this.blocked) this.#transition({ phase: 'idle' });
  };
  async readConflict(load: (id: string) => Promise<EditorTranslation | null>): Promise<'updated' | 'missing' | 'superseded'> {
    const conflict = this.conflict;
    if (!conflict) return 'superseded';
    const disk = await load(conflict.id);
    if (this.conflict !== conflict) return 'superseded';
    if (!disk) return 'missing';
    this.setConflict({ ...conflict, disk });
    return 'updated';
  }
  clearFailure = () => {
    if (this.#snapshot.save.phase === 'failed') this.#transition({ phase: 'idle' });
  };
  persistedContent(id: string) { return this.#persisted.get(id); }
  rememberPersisted(id: string, content: string) { this.#persisted.set(id, content); }
  recordPersistedDocuments(documents: EditorDocument[]) {
    this.#persisted = new Map(documents.flatMap(document => document.translations.map(t => [t.id, t.content])));
  }
  mergeSourceDocuments(source: EditorDocument[]) {
    this.recordPersistedDocuments(source);
    const drafts = new Map(this.documents.flatMap(document => document.translations.map(t => [t.id, t])));
    const dirtyIds = new Set(this.dirtyIds);
    const documents = source.map(document => ({ ...document, translations: document.translations.map(disk => {
      const current = drafts.get(disk.id);
      const recovered = !current ? this.recovery.read<EditorTranslation>('markdown', disk.id) : null;
      if (recovered) dirtyIds.add(disk.id);
      return preserveDraftRevision(disk, recovered || current, dirtyIds);
    }) }));
    const present = new Set(documents.map(document => document.id));
    for (const draft of this.documents) {
      if (!present.has(draft.id) && draft.translations.some(t => dirtyIds.has(t.id))) documents.push(draft);
    }
    this.#publish({ documents, dirtyIds });
  }
  writeSettings<T>(id: string, write: () => Promise<T>): Promise<T> {
    return this.writes.run(async () => {
      if (this.blocked) throw new Error('Resolve the source conflict before saving. Your draft is retained.');
      this.#transition({ phase: 'saving' });
      try {
        const result = await write();
        this.#transition({ phase: 'idle' });
        return result;
      } catch (reason) {
        if (isSourceConflict(reason)) this.setConflict({ id, kind: 'settings', disk: null });
        else this.#transition({ phase: 'failed', error: String(reason) });
        throw reason;
      }
    });
  }
  /** Applies an explicitly reviewed batch without saving unrelated dirty drafts. */
  applySourceEdits(edits: readonly SourceEdit[], save: MarkdownSave) {
    return this.writes.run(async () => {
      if (this.blocked) throw new Error('Resolve the source conflict before applying source edits.');
      this.#transition({ phase: 'saving' });
      const applied: string[] = [], skipped: string[] = [];
      let attemptedId = '';
      try {
        for (const edit of edits) {
          attemptedId = edit.id;
          const current = this.documents.flatMap(document => document.translations).find(t => t.id === edit.id);
          if (this.dirtyIds.has(edit.id) || (current && (current.content !== edit.expectedContent || current.revision !== edit.expectedRevision))) {
            skipped.push(edit.id); continue;
          }
          const saved = await save({ id: edit.id, title: edit.title, content: edit.content, expectedRevision: edit.expectedRevision });
          const translation = saved.translations.find(t => t.id === edit.id);
          if (!translation) throw new Error(`Saved Markdown was not returned: ${edit.id}`);
          this.rememberPersisted(edit.id, translation.content);
          this.#publish({ documents: this.documents.map(document => document.id !== saved.id ? document : {
            ...saved, translations: mergePersistedTranslations(saved.translations, document.translations, this.dirtyIds),
          }) });
          applied.push(edit.id);
        }
        this.#transition({ phase: 'idle' });
        return { applied, skipped };
      } catch (reason) {
        if (isSourceConflict(reason)) this.setConflict({ id: attemptedId, kind: 'markdown', disk: null });
        else this.#transition({ phase: 'failed', error: String(reason) });
        throw reason;
      }
    });
  }
  flushMarkdown(save: MarkdownSave, persisted: (before: EditorTranslation, after: EditorTranslation) => void = () => {}) {
    return this.writes.run(async () => {
      if (this.blocked) throw new Error('Resolve the source conflict before saving. Your draft is retained.');
      let attemptedId = '';
      let lastSaved: EditorDocument | null = null;
      this.#transition({ phase: 'saving' });
      try {
        while (this.dirtyIds.size) {
          const id = [...this.dirtyIds][0];
          attemptedId = id;
          const document = this.documents.find(item => item.translations.some(t => t.id === id));
          const translation = document?.translations.find(t => t.id === id);
          if (!document || !translation) throw new Error(`Cannot locate pending Markdown: ${id}`);
          this.recovery.write('markdown', id, translation);
          const saved = await save({ id, title: translation.title || document.title,
            content: translation.content, expectedRevision: translation.revision });
          const savedTranslation = saved.translations.find(t => t.id === id);
          if (!savedTranslation) throw new Error(`Saved Markdown was not returned: ${id}`);
          this.rememberPersisted(id, savedTranslation.content);
          persisted(translation, savedTranslation);
          const live = this.documents.find(item => item.id === document.id)?.translations.find(t => t.id === id);
          const dirtyIds = new Set(this.dirtyIds);
          if (live?.content === translation.content && live?.title === translation.title) {
            dirtyIds.delete(id);
            this.recovery.remove('markdown', id);
          }
          const documents = this.documents.map(item => item.id !== saved.id ? item : {
            ...saved, translations: mergePersistedTranslations(saved.translations, item.translations, dirtyIds),
          });
          this.#publish({ documents, dirtyIds });
          lastSaved = saved;
        }
        this.#transition({ phase: 'idle' });
        return lastSaved;
      } catch (reason) {
        if (isSourceConflict(reason)) this.setConflict({ id: attemptedId, kind: 'markdown', disk: null });
        else this.#transition({ phase: 'failed', error: String(reason) });
        throw reason;
      }
    });
  }
}
