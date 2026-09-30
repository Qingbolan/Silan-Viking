import React from 'react';
import { MEDIA_FILE_ACCEPT } from '../../lib/media';
import { Aperture, BookOpen, Briefcase, Paperclip, type LucideIcon } from 'lucide-react';
import type { ContentKind } from '../../types';
import type { SlashCommandDefinition } from './extensionPoints';

export type EditorAssistReference = {
  id: string;
  kind: ContentKind;
  title: string;
  slug: string;
  description?: string | null;
};

type EditorAssistSlashCommandOptions = {
  disabled?: boolean;
  importing?: boolean;
  references: EditorAssistReference[];
  onAttachFiles: (files: File[]) => void;
};

const referenceKindMeta: Record<string, { label: string; Icon: LucideIcon; directory: string }> = {
  blog: { label: 'Blog', Icon: BookOpen, directory: 'blog' },
  project: { label: 'Project', Icon: Briefcase, directory: 'projects' },
  moment: { label: 'Moment', Icon: Aperture, directory: 'moment' },
};

const supportedReferenceKinds = new Set(['blog', 'project', 'moment']);

const insertMarkdown = (markdown: string): SlashCommandDefinition['run'] => (
  ({ insertMarkdown: insert }) => insert(markdown)
);

export function useEditorAssistSlashCommands({
  disabled = false,
  importing = false,
  references,
  onAttachFiles,
}: EditorAssistSlashCommandOptions) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const attachFiles = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0) onAttachFiles(files);
  }, [onAttachFiles]);

  const slashCommands = React.useMemo<SlashCommandDefinition[]>(() => {
    const commands: SlashCommandDefinition[] = [];

    if (!disabled && !importing) {
      commands.push({
        id: 'attach-media',
        title: 'Attach media',
        description: 'Import images or video into this Markdown document.',
        keywords: ['attach', 'asset', 'media', 'image', 'video', 'file', 'upload'],
        icon: Paperclip,
        run: ({ deleteTrigger }) => {
          deleteTrigger();
          window.requestAnimationFrame(() => fileInputRef.current?.click());
        },
      });
    }

    references
      .filter((reference) => supportedReferenceKinds.has(reference.kind))
      .forEach((reference) => {
        const meta = referenceKindMeta[reference.kind] || referenceKindMeta.blog;
        commands.push({
          id: `reference:${reference.id}`,
          title: `Link: ${reference.title}`,
          description: `Insert @${meta.label.toLowerCase()} / ${reference.slug}`,
          keywords: [
            'link',
            'reference',
            'internal',
            `@${reference.kind}`,
            reference.kind,
            reference.slug,
            reference.title,
            reference.description || '',
          ],
          icon: meta.Icon,
          run: insertMarkdown(`[${reference.title}](silan://resources/${meta.directory}/${reference.slug})`),
        });
      });

    return commands;
  }, [disabled, importing, references]);

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="editor-assist-file-input"
      accept={MEDIA_FILE_ACCEPT}
      onChange={attachFiles}
      tabIndex={-1}
      aria-hidden="true"
    />
  );

  return { slashCommands, fileInput, openFilePicker: () => fileInputRef.current?.click() };
}
