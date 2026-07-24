import React from 'react';

/* Structured text helpers that are not Markdown renderers. Markdown parsing
   itself is owned by src/components/ui/Markdown.tsx. */

export const isFileTreeStructure = (text: string): boolean => {
  if (!text) return false;
  const treeChars = ['├─', '├──', '└─', '└──', '│', '┌─', '┐', '┘', '└', '├', '┤'];
  return (
    treeChars.some((c) => text.includes(c)) ||
    text.split('\n').some((line) => /^[\s]*[├└│┌┐┘┤]/.test(line))
  );
};

export const FileTreeRenderer: React.FC<{ content: string }> = ({ content }) => {
  const lines = (content ?? '').split('\n');
  return (
    <div className="relative my-8">
      <div className="overflow-hidden rounded-xl border border-theme-card-border bg-theme-surface-elevated shadow-medium">
        <div className="flex items-center gap-3 border-b border-theme-card-border bg-theme-surface-secondary px-6 py-4">
          <div className="inline-flex rounded-full bg-theme-primary/10 px-3 py-1">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-theme-primary">
              FILE STRUCTURE
            </span>
          </div>
        </div>
        <div className="p-6">
          <pre
            className="overflow-x-auto font-mono text-sm leading-relaxed text-theme-primary"
            style={{
              fontFamily: 'JetBrains Mono, Monaco, Menlo, "Ubuntu Mono", Consolas, monospace',
              lineHeight: '1.6',
              margin: 0,
              whiteSpace: 'pre',
            }}
          >
            <code>
              {lines.map((line, i) => (
                <span
                  key={i}
                  className="-mx-2 block rounded px-2 py-1 hover:bg-theme-surface/20"
                >
                  {line || '\u00A0'}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};

export const processPlainTextWithBreaks = (text: string): React.ReactNode => {
  if (!text || typeof text !== 'string') return text;
  const parts = text.split('\n');
  if (parts.length === 1) return text;
  return parts.flatMap((part, index) => (
    index === 0 ? [part] : [<br key={`br-${index}`} />, part]
  ));
};
