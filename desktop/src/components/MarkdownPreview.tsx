import MarkdownEditor from './MarkdownEditor';

/**
 * Read-only Milkdown surface. Preview and editing share one Markdown schema,
 * so GFM structures cannot drift between the resume canvas and the editor.
 */
export function MarkdownPreview({
  content,
  className = 'markdown-preview',
}: {
  content: string;
  className?: string;
}) {
  return (
    <MarkdownEditor
      value={content}
      className={className}
      ariaLabel="Rendered Markdown"
      readOnly
      autoFocus={false}
      showStatus={false}
    />
  );
}
