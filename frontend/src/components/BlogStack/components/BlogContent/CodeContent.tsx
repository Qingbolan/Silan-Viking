import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlogContent } from '../../types/blog';
import { useLanguage } from '../../../LanguageContext';
import { Copy, Check } from 'lucide-react';
import { Button, useToast } from '../../../ds';
import { codeLanguageClass, highlightCodeToHtml, normalizeCodeLanguage } from '../../../../utils/syntaxHighlight';

interface CodeContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
}

export const CodeContent: React.FC<CodeContentProps> = ({ item, isWideScreen }) => {
  const { language } = useLanguage();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);
  const toast = useToast();

  // Normalize code content
  const code = useMemo(() => {
    let text = (item.content ?? '').replace(/^\uFEFF/, '');
    text = text.replace(/\r\n?/g, '\n');
    return text;
  }, [item.content]);
  const codeLanguage = normalizeCodeLanguage(item.language || 'text') || 'text';
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
      toast.error(language === 'en' ? 'Code could not be copied' : '代码复制失败');
    }
  };

  return (
    <figure className={`my-16 ${isWideScreen ? 'col-span-2' : ''} break-inside-avoid`}>
      <div className="overflow-hidden rounded-ds-xl border border-ds-border bg-ds-surface-2 shadow-ds-1">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-ds-border bg-ds-surface-3 px-4 py-2 sm:px-5">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-ds-xs text-ds-fg-muted">{codeLanguage}</span>
          <Button
            type="button"
            className="justify-self-end"
            variant="ghost"
            size="sm"
            onClick={handleCopyCode}
            aria-label={language === 'en' ? 'Copy code to clipboard' : '复制代码到剪贴板'}
            leadingIcon={copied ? <Check className="text-ds-success" /> : <Copy />}
          >
            {copied ? (language === 'en' ? 'Copied' : '已复制') : (language === 'en' ? 'Copy' : '复制')}
          </Button>
        </div>

        <pre className={`max-h-[42rem] overflow-auto p-5 text-ds-sm leading-6 sm:p-6 sm:text-sm ${languageClass}`}>
          <code
            className={`font-mono ${languageClass}`}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>

        {item.caption && (
          <figcaption className="border-t border-ds-border bg-ds-surface-1 p-5 text-center sm:p-6">
              <p className="mx-auto max-w-2xl text-pretty font-serif text-ds-sm leading-6 text-ds-fg-muted">
                {item.caption}
              </p>
          </figcaption>
        )}
      </div>
    </figure>
  );
};
