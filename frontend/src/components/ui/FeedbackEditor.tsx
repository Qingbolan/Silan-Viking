import React from 'react';
import { apiUrl } from '../../api/utils';
import { $createMarkdownMediaNode } from './lexical/MarkdownMediaNode';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $convertToMarkdownString } from '@lexical/mdast';
import { FORMAT_TEXT_COMMAND, UNDO_COMMAND, REDO_COMMAND, $insertNodes, DROP_COMMAND, PASTE_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { INSERT_UNORDERED_LIST_COMMAND, INSERT_ORDERED_LIST_COMMAND } from '@lexical/list';
import { createPublicMarkdownExtension } from './lexical/LexicalMarkdownRenderer';

function EditorControls({ onChange }: { onChange: (value: string) => void }) {
  const [editor] = useLexicalComposerContext();
  React.useEffect(() => editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size || dirtyLeaves.size) editorState.read(() => onChange($convertToMarkdownString()));
  }), [editor, onChange]);
  return <div className="flex flex-wrap gap-1 border-b border-ds-border p-2" role="toolbar" aria-label="Formatting">
    {(['bold', 'italic', 'code'] as const).map((format) => <button key={format} type="button" aria-label={format} className="rounded px-2 py-1 text-ds-sm hover:bg-ds-surface-3" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}>{format === 'bold' ? 'B' : format === 'italic' ? 'I' : '<>'}</button>)}
    <button type="button" className="px-2" aria-label="Bullet list" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>• List</button>
    <button type="button" className="px-2" aria-label="Numbered list" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>1. List</button>
    <button type="button" className="px-2" aria-label="Undo" onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}>↶</button>
    <button type="button" className="px-2" aria-label="Redo" onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}>↷</button>
  </div>;
}

function MediaUpload({ onUploadingChange }: { onUploadingChange?: (busy: boolean) => void }) {
  const [editor] = useLexicalComposerContext();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const locked = React.useRef(false);
  const input = React.useRef<HTMLInputElement>(null);
  const upload = React.useCallback(async (files: File[]) => {
    if (locked.current || !files.length) return;
    locked.current = true; setBusy(true); setError(''); onUploadingChange?.(true);
    try {
      for (const file of files) {
        const kind = file.type.startsWith('video/') ? 'video' : 'image';
        if (!['image/jpeg', 'image/png', 'video/mp4', 'video/webm'].includes(file.type)) throw new Error('Use JPEG, PNG, MP4 or WebM.');
        if (file.size > (kind === 'video' ? 25 : 5) * 1024 * 1024) throw new Error('Images: up to 5 MB. Videos: up to 25 MB.');
        const body = new FormData(); body.append('file', file);
        const response = await fetch(apiUrl(`/api/v1/feedback-media?kind=${kind}`), { method: 'POST', body });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed');
        editor.update(() => $insertNodes([$createMarkdownMediaNode({ src: result.url, altText: file.name })]));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed'); }
    finally { locked.current = false; setBusy(false); onUploadingChange?.(false); }
  }, [editor, onUploadingChange]);
  React.useEffect(() => {
    const drop = editor.registerCommand(DROP_COMMAND, event => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length) return false; event.preventDefault(); void upload(files); return true;
    }, COMMAND_PRIORITY_HIGH);
    const paste = editor.registerCommand(PASTE_COMMAND, event => {
      const files = event instanceof ClipboardEvent ? Array.from(event.clipboardData?.files || []) : [];
      if (!files.length) return false; event.preventDefault(); void upload(files); return true;
    }, COMMAND_PRIORITY_HIGH);
    return () => { drop(); paste(); };
  }, [editor, upload]);
  return <div className="px-3 py-2 text-ds-xs text-ds-fg-muted">
    <input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,video/mp4,video/webm" onChange={event => { void upload(Array.from(event.target.files || [])); event.target.value = ''; }} />
    <button type="button" disabled={busy} className="text-theme" onClick={() => input.current?.click()}>{busy ? 'Checking and uploading…' : 'Add images / video'}</button>
    <span className="ml-2">or drop files here · 3 images/day (5 MB each), 1 video/day (25 MB, 2 min)</span>
    {error && <p role="alert" className="mt-1 text-red-500">{error}</p>}
  </div>;
}

export function FeedbackEditor({ value, onChange, label, onUploadingChange }: { value: string; onChange: (value: string) => void; label: string; onUploadingChange?: (busy: boolean) => void }) {
  const [extension] = React.useState(() => createPublicMarkdownExtension(value, true));
  return <div className="overflow-hidden rounded-ds-md bg-ds-surface-2 shadow-[inset_0_0_0_1px_var(--ds-color-border)]">
    <LexicalExtensionComposer extension={extension} contentEditable={null}>
      <EditorControls onChange={onChange} />
      <div className="markdown-content">
        <RichTextPlugin contentEditable={<ContentEditable className="markdown-body min-h-48 px-3 py-2 outline-none" aria-label={label} />} ErrorBoundary={LexicalErrorBoundary} />
      </div>
      <MediaUpload onUploadingChange={onUploadingChange} />
      <HistoryPlugin /><ListPlugin /><LinkPlugin />
    </LexicalExtensionComposer>
  </div>;
}
