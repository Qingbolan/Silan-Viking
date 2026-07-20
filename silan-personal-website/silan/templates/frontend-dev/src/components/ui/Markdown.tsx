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

interface MarkdownProps {
  children: string;
  className?: string;
  /** Page-level title already rendered outside this embedded markdown. */
  documentTitle?: string;
  /** Compact inline/table-cell rendering. */
  inline?: boolean;
}

const normalizedHeading = (value: string): string =>
  value
    .replace(/[`*_~]/g, '')
    .replace(/[—–]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

const embeddedBody = (markdown: string, documentTitle?: string): string => {
  if (!documentTitle) return markdown;
  const leadingHeading = markdown.match(/^\s*#\s+([^\r\n]+)\r?\n/);
  if (!leadingHeading || normalizedHeading(leadingHeading[1]) !== normalizedHeading(documentTitle)) {
    return markdown;
  }
  return markdown.slice(leadingHeading[0].length).replace(/^\s*\r?\n/, '');
};

const shiftLocalOutline = (markdown: string): string => {
  if (!/^#(?!#)\s+/m.test(markdown)) return markdown;
  return markdown.replace(/^( {0,3})(#{1,5})(?=\s)/gm, '$1#$2');
};

const prepareMarkdown = (markdown: string, documentTitle?: string): string =>
  shiftLocalOutline(embeddedBody(markdown ?? '', documentTitle));

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

const Markdown: React.FC<MarkdownProps> = ({ children, className, documentTitle, inline = false }) => {
  const navigate = useNavigate();
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const content = React.useMemo(() => prepareMarkdown(children, documentTitle), [children, documentTitle]);

  React.useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    element.innerHTML = '';

    let cancelled = false;
    Vditor.preview(element, content, {
      mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      anchor: 1,
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
        element.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
          const href = anchor.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) {
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
          }
          if (shouldEnhanceAnchor(anchor)) {
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
    };
  }, [content]);

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
        'vditor-markdown font-article text-[15px] leading-[1.8] text-theme-secondary',
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
