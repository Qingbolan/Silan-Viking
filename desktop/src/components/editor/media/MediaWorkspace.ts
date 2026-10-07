import type { EditorSession, MarkdownSave, SourceEdit } from '../../../app/authoring/EditorSession';
import type { EditorDocument } from '../../../types';
import { findV2Blocks } from './upstream/src/format/v2';
import { isEditable, planUnwrapAll, applyEditsToText } from './upstream/src/layout/edits';
export type MediaCleanupEntry = SourceEdit & { path: string; count: number };
export type MediaNoteLink = { title: string; path: string };
export interface MediaWorkspacePort {
  searchLinks?(query: string): MediaNoteLink[];
  openLink?(target: string): void;
  resolveMedia(sourcePath: string, targets: string[]): Promise<(string | null)[]>;
  previewCleanup(): Promise<MediaCleanupEntry[]>;
  applyCleanup(entries: readonly MediaCleanupEntry[]): Promise<{ applied: string[]; skipped: string[] }>;
}
/** Workspace I/O uses the authoring session's serialized, revision-checked writes. */
export class MediaWorkspace implements MediaWorkspacePort {
  constructor(private readonly session: EditorSession, private readonly load: () => Promise<EditorDocument[]>, private readonly save: MarkdownSave, readonly resolveMedia: (sourcePath: string, targets: string[]) => Promise<(string | null)[]>, readonly openLink?: (target: string) => void) {}
  searchLinks(query: string): MediaNoteLink[] {
    const lower = query.toLocaleLowerCase();
    return this.session.documents.flatMap(document => document.translations.map(translation => ({ title: translation.title || document.title, path: translation.source_path })))
      .filter(link => `${link.title} ${link.path}`.toLocaleLowerCase().includes(lower)).slice(0, 12);
  }
  async previewCleanup() {
    const documents = await this.load();
    return documents.flatMap(document => document.translations.flatMap(translation => {
      if (this.session.dirtyIds.has(translation.id)) return [];
      const blocks = findV2Blocks(translation.content.split('\n')).filter(isEditable);
      if (!blocks.length) return [];
      const next = applyEditsToText(translation.content, planUnwrapAll(blocks));
      return next.ok ? [{ id: translation.id, title: translation.title || document.title, path: translation.source_path, count: blocks.length,
        expectedContent: translation.content, expectedRevision: translation.revision, content: next.text }] : [];
    }));
  }
  applyCleanup(entries: readonly MediaCleanupEntry[]) { return this.session.applySourceEdits(entries, this.save); }
}
