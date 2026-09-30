import type { EditorDocument, ImportedMediaAsset } from '../types';
import type { VideoCoverState } from './videoCover';
import { captureMarkdown } from './captureDraft';
import { isVideoFile } from './media';

type SaveInput = { id: string; title: string; content: string; expectedRevision: string };
type Operations = {
  create: () => Promise<EditorDocument>;
  import: (id: string, file: File) => Promise<ImportedMediaAsset>;
  save: (input: SaveInput) => Promise<EditorDocument>;
};
type Input = { title: string; note: string; language: string; moment: boolean; files: File[]; covers: Map<File, VideoCoverState> };

/** A failed media import retains the created draft and successful imports for retry. */
export class CaptureSubmission {
  private draft: EditorDocument | null = null;
  private imported = new Map<File, ImportedMediaAsset>();
  private active: Promise<EditorDocument> | null = null;
  get hasDraft() { return this.draft !== null; }

  save(input: Input, operations: Operations): Promise<EditorDocument> {
    if (this.active) return this.active;
    this.active = this.persist(input, operations).finally(() => { this.active = null; });
    return this.active;
  }

  private async persist(input: Input, operations: Operations) {
    for (const file of input.files) {
      if (input.moment && isVideoFile(file) && input.covers.get(file)?.status !== 'ready') {
        throw new Error('Choose a video cover before saving.');
      }
    }
    this.draft ??= await operations.create();
    const translation = this.draft.translations.find(value => value.language === input.language) || this.draft.translations[0];
    if (!translation) throw new Error('The captured draft has no editable translation.');
    const importFile = async (file: File) => {
      const existing = this.imported.get(file);
      if (existing) return existing;
      const asset = await operations.import(translation.id, file);
      this.imported.set(file, asset);
      return asset;
    };
    const blocks: string[] = [];
    for (const file of input.files) {
      const asset = await importFile(file);
      const cover = input.covers.get(file);
      if (input.moment && isVideoFile(file) && cover?.status === 'ready') {
        const poster = await importFile(cover.file);
        blocks.push(`[${poster.markdown}](${asset.uri})`);
      } else blocks.push(asset.markdown);
    }
    const title = input.title.trim() || translation.title;
    const body = input.moment
      ? [...blocks, input.note.trim()].filter(Boolean).join('\n\n')
      : [input.note.trim(), ...blocks].filter(Boolean).join('\n\n');
    this.draft = await operations.save({ id: translation.id, title, content: captureMarkdown(title, body), expectedRevision: translation.revision });
    return this.draft;
  }
}
