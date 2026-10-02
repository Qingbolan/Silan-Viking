// Markdown — the single source of truth for article typography.
//
// Public reading surfaces use a read-only Lexical document. Callers pass
// Markdown text; this component owns authored-content normalization, resource
// routing, link navigation, and the stable public rendering contract.
import React from 'react';
import { withoutRepeatedTitle } from '../../lib/markdown';
import { useNavigate } from 'react-router-dom';
import { mediaUrl, routeFromSilanResource } from '../../api/utils';
import LexicalMarkdownRenderer from './lexical/LexicalMarkdownRenderer';

interface MarkdownProps {
  children: string;
  className?: string;
  /** Page-level title already rendered outside this embedded markdown. */
  documentTitle?: string;
  /** Section-level title already rendered by the caller. */
  sectionTitle?: string;
  /** Compact inline/table-cell rendering. */
  inline?: boolean;
  /** Turn plain links into rich favicon pills. Disable for dense UI text. */
  richLinks?: boolean;
}

const shiftLocalOutline = (markdown: string): string => {
  if (!/^#(?!#)\s+/m.test(markdown)) return markdown;
  return markdown.replace(/^( {0,3})(#{1,5})(?=\s)/gm, '$1#$2');
};

// A line that opens (or continues) a block construct — never merged into the
// paragraph above it.
const BLOCK_LINE = /^(\s{4,}|\t|\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||`{3,}|~{3,}|<|\$\$|[-*_]\s*[-*_]\s*[-*_][-*_\s]*$|=+\s*$|:::))/;

// Sources are commonly hard-wrapped at ~80 columns. Re-join paragraph lines
// while preserving explicit hard breaks, fenced code, and block syntax.
const unwrapSoftBreaks = (markdown: string): string => {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/)?.[1]?.[0] ?? null;
    if (fenceMark && (!fence || fence === fenceMark)) {
      fence = fence ? null : fenceMark;
      out.push(line);
      continue;
    }
    const prev = out[out.length - 1];
    if (
      !fence &&
      prev !== undefined && prev.trim() !== '' && line.trim() !== '' &&
      !/(\s{2}|\\)$/.test(prev) &&
      !BLOCK_LINE.test(prev) && !BLOCK_LINE.test(line)
    ) {
      out[out.length - 1] = `${prev.replace(/\s+$/, '')} ${line.trim()}`;
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
};

const normalizeStrongLabelSpacing = (markdown: string): string =>
  markdown.replace(/\*\*([^*\r\n]{1,80}?[：:])\*\*(?=\S)/g, '**$1** ');

const resolveContentReferences = (markdown: string): string => (
  markdown.replace(
    /(\]\()((?:silan:\/\/resources\/|resources\/)[^)\s]+)(?=[\s)])/g,
    (_match, opening: string, reference: string) => (
      `${opening}${routeFromSilanResource(reference) ?? mediaUrl(reference)}`
    ),
  )
);

const prepareMarkdown = (markdown: string, documentTitle?: string, sectionTitle?: string): string =>
  resolveContentReferences(
    normalizeStrongLabelSpacing(
      unwrapSoftBreaks(
        shiftLocalOutline(
          withoutRepeatedTitle(withoutRepeatedTitle(markdown ?? '', documentTitle), sectionTitle),
        ),
      ),
    ),
  );

const Markdown: React.FC<MarkdownProps> = ({
  children,
  className,
  documentTitle,
  sectionTitle,
  inline = false,
  richLinks = true,
}) => {
  const navigate = useNavigate();
  const content = React.useMemo(
    () => prepareMarkdown(children, documentTitle, sectionTitle),
    [children, documentTitle, sectionTitle],
  );

  const onClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#')) {
      return;
    }

    const silanRoute = routeFromSilanResource(rawHref);
    if (silanRoute) {
      event.preventDefault();
      navigate(silanRoute);
      return;
    }

    if (/^[a-z][a-z0-9+.-]*:/i.test(rawHref)) {
      return;
    }

    event.preventDefault();
    navigate(rawHref.startsWith('/') ? rawHref : `/${rawHref}`);
  }, [navigate]);

  return (
    <div
      data-ds
      className={[
        'markdown-content font-article',
        inline
          ? 'text-ds-base leading-[1.5] text-theme-secondary'
          : 'text-ds-lg leading-[1.58] text-theme-text-primary',
        inline ? 'markdown-content--inline' : '',
        className || '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <LexicalMarkdownRenderer content={content} richLinks={richLinks} />
    </div>
  );
};

export default Markdown;
