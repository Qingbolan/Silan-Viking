import React from 'react';
import {
  Aperture,
  BookOpen,
  Briefcase,
  Image,
  LoaderCircle,
  Paperclip,
  Search,
  Slash,
  type LucideIcon,
} from 'lucide-react';
import type { ContentKind } from '../types';

export type EditorAssistReference = {
  id: string;
  kind: ContentKind;
  title: string;
  slug: string;
  description?: string | null;
};

type EditorAssistDockProps = {
  disabled?: boolean;
  importing?: boolean;
  generatingImage?: boolean;
  attachmentCount?: number;
  references: EditorAssistReference[];
  onAttachFiles: (files: File[]) => void;
  onInsertMarkdown: (markdown: string) => void;
  onGenerateImage?: (request: {
    prompt: string;
    size: string;
    quality: string;
    outputFormat: string;
  }) => void | Promise<void>;
};

const referenceKindMeta: Record<string, { label: string; Icon: LucideIcon; directory: string }> = {
  blog: { label: 'Blog', Icon: BookOpen, directory: 'blog' },
  project: { label: 'Project', Icon: Briefcase, directory: 'projects' },
  moment: { label: 'Moment', Icon: Aperture, directory: 'moment' },
};

const imagePromptBlock = (prompt: string) => (
  `\`\`\`silan-ai-image\nprompt: ${prompt.trim()}\nstyle: editorial documentary\nratio: 1:1\n\`\`\``
);

export function EditorAssistDock({
  disabled = false,
  importing = false,
  generatingImage = false,
  attachmentCount = 0,
  references,
  onAttachFiles,
  onInsertMarkdown,
  onGenerateImage,
}: EditorAssistDockProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [imagePrompt, setImagePrompt] = React.useState('');
  const [imageSize, setImageSize] = React.useState('1024x1024');
  const [imageQuality, setImageQuality] = React.useState('auto');
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const filteredReferences = React.useMemo(() => {
    const needle = query.trim().replace(/^@/, '').toLowerCase();
    return references
      .filter((reference) => {
        if (!['blog', 'project', 'moment'].includes(reference.kind)) return false;
        if (!needle) return true;
        return `${reference.kind} ${reference.title} ${reference.slug} ${reference.description || ''}`
          .toLowerCase()
          .includes(needle);
      })
      .slice(0, 8);
  }, [query, references]);

  const attachFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0) onAttachFiles(files);
  };

  const insertReference = (reference: EditorAssistReference) => {
    const meta = referenceKindMeta[reference.kind] || referenceKindMeta.blog;
    onInsertMarkdown(`[${reference.title}](silan://resources/${meta.directory}/${reference.slug})`);
    setOpen(false);
    setQuery('');
  };

  const imagePromptValue = React.useMemo(() => {
    const prompt = imagePrompt.trim();
    if (prompt) return prompt;
    const queryPrompt = query.trim();
    if (queryPrompt && !queryPrompt.startsWith('@')) return queryPrompt;
    return '';
  }, [imagePrompt, query]);

  const submitImagePrompt = async () => {
    const prompt = imagePromptValue;
    if (!prompt) return;
    if (onGenerateImage) {
      await onGenerateImage({
        prompt,
        size: imageSize,
        quality: imageQuality,
        outputFormat: 'png',
      });
    } else {
      onInsertMarkdown(imagePromptBlock(prompt));
    }
    setOpen(false);
    setImagePrompt('');
    setQuery('');
  };

  return (
    <div className="editor-assist-dock">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/mp4,video/webm,video/quicktime"
        onChange={attachFiles}
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        className="editor-assist-button"
        disabled={disabled || importing}
        title="Attach image or video"
        aria-label="Attach image or video"
        onClick={() => fileInputRef.current?.click()}
      >
        {importing ? <LoaderCircle size={15} /> : <Paperclip size={15} />}
        {attachmentCount > 0 && <span>{attachmentCount}</span>}
      </button>
      <button
        type="button"
        className={`editor-assist-button ${open ? 'active' : ''}`}
        disabled={disabled}
        title="Slash commands"
        aria-label="Slash commands"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Slash size={15} />
      </button>

      {open && (
        <div className="editor-assist-panel" role="dialog" aria-label="Editor assistance">
          <label className="editor-assist-search">
            <Search size={14} />
            <input
              value={query}
              autoFocus
              placeholder="@blog, @project, @moment"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="editor-assist-image-generator" role="group" aria-label="Image generation">
            <textarea
              value={imagePrompt}
              rows={3}
              placeholder="Describe an image to generate..."
              onChange={(event) => setImagePrompt(event.target.value)}
            />
            <div>
              <select
                value={imageSize}
                aria-label="Image size"
                onChange={(event) => setImageSize(event.target.value)}
              >
                <option value="1024x1024">Square</option>
                <option value="1536x1024">Wide</option>
                <option value="1024x1536">Portrait</option>
              </select>
              <select
                value={imageQuality}
                aria-label="Image quality"
                onChange={(event) => setImageQuality(event.target.value)}
              >
                <option value="auto">Auto</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button
                type="button"
                disabled={!imagePromptValue || disabled || generatingImage}
                onClick={() => void submitImagePrompt()}
              >
                {generatingImage ? <LoaderCircle size={14} /> : <Image size={14} />}
                {onGenerateImage ? 'Generate image' : 'Insert prompt'}
              </button>
            </div>
          </div>

          <div className="editor-assist-results" role="listbox" aria-label="Internal references">
            {filteredReferences.length === 0 ? (
              <div className="editor-assist-empty">No matching content.</div>
            ) : filteredReferences.map((reference) => {
              const meta = referenceKindMeta[reference.kind] || referenceKindMeta.blog;
              const Icon = meta.Icon;
              return (
                <button
                  type="button"
                  key={reference.id}
                  role="option"
                  onClick={() => insertReference(reference)}
                >
                  <Icon size={14} />
                  <span>
                    <strong>{reference.title}</strong>
                    <small>@{meta.label.toLowerCase()} / {reference.slug}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
