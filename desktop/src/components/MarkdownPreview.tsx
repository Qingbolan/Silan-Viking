import React from 'react';
import Vditor from 'vditor';

/**
 * Render Markdown through Vditor's own preview pipeline — the same
 * renderer the editor uses, so preview and editing always agree.
 */
export function MarkdownPreview({
  content,
  className = 'markdown-preview',
}: {
  content: string;
  className?: string;
}) {
  const previewRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    element.innerHTML = '';
    void Vditor.preview(element, content, {
      mode: 'light',
      hljs: { lineNumber: true },
      markdown: { toc: true },
    });
    return () => {
      element.innerHTML = '';
    };
  }, [content]);

  return <div ref={previewRef} className={className} />;
}
