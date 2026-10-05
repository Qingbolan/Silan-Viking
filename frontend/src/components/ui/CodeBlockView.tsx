import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '../ds/Button';
import '../../styles/syntax-theme.css';
import { codeLanguageClass, highlightCodeToHtml, normalizeCodeLanguage } from '../../utils/syntaxHighlight';

export interface CodeBlockProps {
  uiLanguage?: string;
  onCopyError?: () => void;
  content: string;
  language?: string;
  caption?: string;
  isWideScreen?: boolean;
}

export const CodeBlockView: React.FC<CodeBlockProps> = ({ content, language: sourceLanguage, caption, isWideScreen, uiLanguage: language = 'zh', onCopyError }) => {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  // Normalize code content
  const code = useMemo(() => {
    let text = (content ?? '').replace(/^\uFEFF/, '');
    text = text.replace(/\r\n?/g, '\n');
    return text;
  }, [content]);
  const codeLanguage = normalizeCodeLanguage(sourceLanguage || 'text') || 'text';
  const languageClass = codeLanguageClass(codeLanguage);
  const highlightedCode = useMemo(
    () => highlightCodeToHtml(code, codeLanguage),
    [code, codeLanguage],
  );

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onCopyError?.();
    }
  };

  return (
    <figure className={`mx-0 my-6 first:mt-0 last:mb-0 ${isWideScreen ? 'col-span-2' : ''} break-inside-avoid`}>
      <div className="dracula-code-surface group relative overflow-hidden rounded-[0.7rem] border border-ds-border bg-ds-surface-2">
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-ds-sm bg-ds-surface-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
          <span className="pl-2 font-mono text-ds-xs text-ds-fg-muted">{codeLanguage}</span>
          <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopyCode}
          aria-label={language === 'en' ? 'Copy code to clipboard' : '复制代码到剪贴板'}
          leadingIcon={copied ? <Check className="text-ds-success" /> : <Copy />}
          />
        </div>

        <pre className={`max-h-[42rem] overflow-auto !m-0 px-[1.125rem] py-4 text-ds-base font-medium leading-[1.55] ${languageClass}`}>
          <code
            className={`font-mono ${languageClass}`}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>

        {caption && (
          <figcaption className="border-t border-ds-border bg-ds-surface-1 px-3 py-2 text-center sm:px-4">
              <p className="mx-auto max-w-2xl text-pretty font-serif text-ds-sm leading-6 text-ds-fg-muted">
                {caption}
              </p>
          </figcaption>
        )}
      </div>
    </figure>
  );
};
