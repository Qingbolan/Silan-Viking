// Markdown — the single source of truth for article typography.
//
// Vditor owns Markdown parsing/rendering across the application. Callers pass
// Markdown text; this component handles embedded document-title cleanup,
// outline shifting, link behavior, and design-token styling in one place.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { iconSrcForHref } from '../../utils/linkIcon';
import { highlightCodeElement } from '../../utils/syntaxHighlight';

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

const normalizedHeading = (value: string): string =>
  value
    .replace(/[`*_~]/g, '')
    .replace(/[—–]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

const stripLeadingHeading = (markdown: string, renderedTitle?: string): string => {
  if (!renderedTitle) return markdown;
  const leadingHeading = markdown.match(/^\s*#{1,6}\s+([^\r\n]+)\r?\n/);
  if (!leadingHeading || normalizedHeading(leadingHeading[1]) !== normalizedHeading(renderedTitle)) {
    return markdown;
  }
  return markdown.slice(leadingHeading[0].length).replace(/^\s*\r?\n/, '');
};

const shiftLocalOutline = (markdown: string): string => {
  if (!/^#(?!#)\s+/m.test(markdown)) return markdown;
  return markdown.replace(/^( {0,3})(#{1,5})(?=\s)/gm, '$1#$2');
};

// A line that opens (or continues) a block construct — never merged into the
// paragraph above it.
const BLOCK_LINE = /^(\s{4,}|\t|\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||`{3,}|~{3,}|<|\$\$|[-*_]\s*[-*_]\s*[-*_][-*_\s]*$|=+\s*$|:::))/;

// Lute (Vditor's renderer) turns soft line breaks into hard <br> breaks by
// default and exposes no switch for it, while our sources are hard-wrapped
// at ~80 columns — every source newline became a rendered line break with a
// ragged right edge. Re-join wrapped paragraph lines; explicit hard breaks
// (trailing double-space or backslash), fenced code, and block syntax are
// left untouched.
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

const prepareMarkdown = (markdown: string, documentTitle?: string, sectionTitle?: string): string =>
  unwrapSoftBreaks(
    shiftLocalOutline(
      stripLeadingHeading(stripLeadingHeading(markdown ?? '', documentTitle), sectionTitle),
    ),
  );

const shouldEnhanceAnchor = (anchor: HTMLAnchorElement): boolean => {
  const href = anchor.getAttribute('href') || '';
  if (!href || href.startsWith('#')) return false;
  if (anchor.dataset.richLink === 'true') return false;
  if (anchor.classList.contains('vditor-anchor')) return false;
  return Boolean(anchor.textContent?.trim());
};

const enhanceAnchor = (anchor: HTMLAnchorElement) => {
  const href = anchor.getAttribute('href') || '';
  anchor.dataset.richLink = 'true';
  anchor.setAttribute('data-ds', 'rich-link');
  anchor.classList.add('markdown-rich-link');

  const icon = document.createElement('img');
  icon.src = iconSrcForHref(href);
  icon.alt = '';
  icon.loading = 'lazy';
  icon.decoding = 'async';
  icon.className = 'markdown-rich-link__icon';
  icon.addEventListener('error', () => {
    icon.src = '/avatar-icon-32.png';
  }, { once: true });

  anchor.prepend(icon);
};

const Markdown: React.FC<MarkdownProps> = ({
  children,
  className,
  documentTitle,
  sectionTitle,
  inline = false,
  richLinks = true,
}) => {
  const navigate = useNavigate();
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const content = React.useMemo(
    () => prepareMarkdown(children, documentTitle, sectionTitle),
    [children, documentTitle, sectionTitle],
  );

  React.useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    element.innerHTML = '';

    let cancelled = false;
    const highlightTimers: number[] = [];
    const applySyntaxHighlight = () => {
      if (cancelled) return;
      element.querySelectorAll<HTMLElement>('pre code').forEach(highlightCodeElement);
    };
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(applySyntaxHighlight);
    });
    observer.observe(element, { childList: true, subtree: true, characterData: true });
    Vditor.preview(element, content, {
      mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      anchor: inline ? 0 : 1,
      lang: 'en_US',
      markdown: {
        autoSpace: true,
        fixTermTypo: true,
        footnotes: true,
        linkBase: '',
        mark: true,
        toc: true,
      },
      hljs: {
        enable: true,
        lineNumber: false,
        style: document.documentElement.classList.contains('dark') ? 'github-dark' : 'github',
      },
      math: {
        engine: 'KaTeX',
        inlineDigit: true,
      },
      after() {
        if (cancelled) return;
        applySyntaxHighlight();
        window.requestAnimationFrame(applySyntaxHighlight);
        highlightTimers.push(window.setTimeout(applySyntaxHighlight, 80));
        element.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
          const href = anchor.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
          }
          if (richLinks && shouldEnhanceAnchor(anchor)) {
            enhanceAnchor(anchor);
          }
        });
      },
    }).catch((error) => {
      if (!cancelled) {
        console.error('[Markdown] Vditor preview failed', error);
        element.textContent = content;
      }
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      highlightTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [content, inline, richLinks]);

  const onClick = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;

    const rawHref = anchor.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(rawHref)) {
      return;
    }

    event.preventDefault();
    navigate(rawHref.startsWith('/') ? rawHref : `/${rawHref}`);
  }, [navigate]);

  return (
    <div
      data-ds
      className={[
        'vditor-markdown font-article',
        inline
          ? 'text-[15px] leading-[1.8] text-theme-secondary'
          : 'text-[18px] leading-[1.74] text-theme-text-primary',
        inline ? 'vditor-markdown--inline' : '',
        className || '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <div ref={previewRef} className="vditor-reset" />
    </div>
  );
};

export default Markdown;
