// Markdown — the single source of truth for article typography.
//
// Public reading surfaces use a static React renderer, not an editor runtime.
// Callers pass Markdown text; this component owns embedded-title cleanup,
// GFM parsing, outline IDs, media resolution, links, and article typography.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { isVideoResource, mediaUrl, routeFromSilanResource } from '../../api/utils';
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

const prepareMarkdown = (markdown: string, documentTitle?: string, sectionTitle?: string): string =>
  unwrapSoftBreaks(
    shiftLocalOutline(
      stripLeadingHeading(stripLeadingHeading(markdown ?? '', documentTitle), sectionTitle),
    ),
  );

const shouldEnhanceAnchor = (href: string, children: React.ReactNode): boolean => {
  if (!href || href.startsWith('#')) return false;
  return React.Children.toArray(children).some((child) => (
    typeof child === 'string' || typeof child === 'number'
  ));
};

const preserveTrustedContentUrl = (url: string): string => {
  const normalized = url.trim();
  if (
    !normalized
    || normalized.startsWith('#')
    || normalized.startsWith('/')
    || normalized.startsWith('./')
    || normalized.startsWith('../')
    || /^(?:https?:|mailto:|tel:|silan:)/i.test(normalized)
  ) {
    return normalized;
  }
  return '';
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
    element.querySelectorAll<HTMLElement>('pre code').forEach(highlightCodeElement);
  }, [content]);

  const components = React.useMemo<Components>(() => ({
    a: ({ children: linkChildren, href = '', node: _node, ...props }) => {
      const external = /^https?:\/\//i.test(href);
      const enhanced = richLinks && shouldEnhanceAnchor(href, linkChildren);
      return (
        <a
          {...props}
          href={href}
          className={enhanced ? 'markdown-rich-link' : props.className}
          data-ds={enhanced ? 'rich-link' : undefined}
          data-rich-link={enhanced ? 'true' : undefined}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
        >
          {enhanced && (
            <img
              src={iconSrcForHref(href)}
              alt=""
              loading="lazy"
              decoding="async"
              className="markdown-rich-link__icon"
              onError={(event) => {
                event.currentTarget.src = '/avatar-icon-32.png';
              }}
            />
          )}
          {linkChildren}
        </a>
      );
    },
    img: ({ src = '', alt = '', node: _node, ...props }) => (
      isVideoResource(src) ? (
        <video
          controls
          preload="metadata"
          className={props.className}
          aria-label={alt || 'Embedded video'}
        >
          <source src={mediaUrl(src)} />
        </video>
      ) : (
        <img
          {...props}
          src={mediaUrl(src)}
          alt={alt}
          loading="lazy"
          decoding="async"
        />
      )
    ),
  }), [richLinks]);

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
          ? 'text-[15px] leading-[1.8] text-theme-secondary'
          : 'text-[18px] leading-[1.74] text-theme-text-primary',
        inline ? 'markdown-content--inline' : '',
        className || '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <div ref={previewRef} className="markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={inline ? [] : [rehypeSlug]}
          components={components}
          urlTransform={preserveTrustedContentUrl}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default Markdown;
