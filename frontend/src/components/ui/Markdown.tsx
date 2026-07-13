// Markdown — the single source of truth for article typography.
//
// Spec is measured from the Yuque reference (yuque.com/yuque/careers):
//   body  15px / 1.8 / 400, font-article  (PingFang SC first)
//   h1    32px / 1.3 / 700
//   h2    22px / 1.4 / 600
//   h3    18px / 1.45 / 600
//   h4    16px / 1.5 / 600
//   strong          / 600        (Yuque-style mid-bold, not 700)
//   inline code 13px / 500, font-article-mono  (Menlo first)
//   block  code 13px / 400 / 1.6, same family
//   link  inherits size, primary colour, hover underline
//
// Tailwind only — there is no .markdown-body global CSS. Two layers caused
// races in the past; one layer (this file) is the contract.
import React from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
  className?: string;
  /** Page-level title already rendered outside this embedded markdown. */
  documentTitle?: string;
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

const Markdown: React.FC<MarkdownProps> = ({ children, className, documentTitle }) => {
  const content = embeddedBody(children, documentTitle);
  // When a body still owns a level-one section heading (for example a Part
  // titled "Where it stands"), shift its complete local outline down once.
  // Bodies whose duplicate document title was removed keep their existing
  // h2/h3 hierarchy intact.
  const shiftsLocalOutline = /^#(?!#)\s+/m.test(content);
  const H2 = shiftsLocalOutline ? 'h3' : 'h2';
  const H3 = shiftsLocalOutline ? 'h4' : 'h3';
  const H4 = shiftsLocalOutline ? 'h5' : 'h4';
  const H5 = shiftsLocalOutline ? 'h6' : 'h5';

  return (
    <div
      // The `data-ds` opt-out unhooks index.css's global heading sizes
      // (the unlayered `h1:not([data-ds] *)` rules at the bottom of index.css)
      // so the Tailwind `text-[Npx]` classes below actually win for h1/h2/h3.
      data-ds
      className={`font-article text-[15px] leading-[1.8] text-theme-secondary ${className || ''}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        unwrapDisallowed={true}
        components={{
          // Markdown is always embedded inside a route or component that
          // already owns the page-level h1, so its outline starts at h2.
          h1: ({ node, ...props }) => (
            <h2
              className="mt-8 mb-4 text-[32px] font-bold leading-[1.3] tracking-[-0.01em] text-theme-primary scroll-mt-24"
              {...props}
            />
          ),
          h2: ({ node, ...props }) => (
            <H2
              className="mt-7 mb-3 text-[22px] font-semibold leading-[1.4] tracking-[-0.01em] text-theme-primary scroll-mt-24"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <H3
              className="mt-6 mb-2 text-[18px] font-semibold leading-[1.45] tracking-[-0.01em] text-theme-primary scroll-mt-24"
              {...props}
            />
          ),
          h4: ({ node, ...props }) => (
            <H4
              className="mt-5 mb-2 text-[16px] font-semibold leading-[1.5] tracking-[-0.01em] text-theme-primary scroll-mt-24"
              {...props}
            />
          ),
          h5: ({ node, ...props }) => (
            <H5
              className="mt-5 mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-theme-tertiary"
              {...props}
            />
          ),
          h6: ({ node, ...props }) => (
            <h6
              className="mt-5 mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-theme-tertiary"
              {...props}
            />
          ),
          // Paragraph — same 15/1.8 as the wrapping body, just adds bottom
          // margin so adjacent paragraphs breathe. We render as <div> to
          // dodge invalid nesting when remark passes block children through.
          p: ({ node, ...props }) => (
            <div className="my-4 text-[15px] leading-[1.8] text-theme-secondary" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-theme-primary" {...props} />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          a: ({ node, href, children, ...props }) => {
            if (!href) {
              return <span {...props}>{children}</span>;
            }
            const isExternal = /^https?:\/\//i.test(href);
            const commonClass =
              'text-theme-accent underline underline-offset-2 decoration-theme-accent/40 hover:decoration-theme-accent transition-colors break-all';
            if (href.startsWith('/')) {
              return (
                <Link to={href} className={commonClass} {...(props as any)}>
                  {children}
                </Link>
              );
            }
            if (isExternal) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={commonClass}
                  {...props}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={href} className={commonClass} {...props}>
                {children}
              </a>
            );
          },
          ul: ({ node, ...props }) => (
            <ul
              className="my-4 list-disc pl-5 marker:text-theme-tertiary"
              {...props}
            />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="my-4 list-decimal pl-5 marker:text-theme-tertiary"
              {...props}
            />
          ),
          li: ({ node, ...props }) => (
            <li
              className="my-1 text-[15px] leading-[1.8] text-theme-secondary marker:text-theme-tertiary"
              {...props}
            />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-5 rounded-md bg-theme-surface px-4 py-3 italic text-theme-secondary"
              {...props}
            />
          ),
          // react-markdown v9+ no longer passes an `inline` prop; structure
          // decides: inline `code` sits naked, block `code` sits inside `pre`.
          code: ({ node, className, children, ...props }) => (
            <code
              className={`rounded bg-theme-surface px-[0.36rem] py-[0.12rem] font-article-mono text-[13px] font-medium text-theme-primary ${className || ''}`}
              {...props}
            >
              {children}
            </code>
          ),
          pre: ({ node, children, ...props }) => (
            <pre
              className="my-5 overflow-x-auto rounded-lg bg-theme-surface p-4 font-article-mono text-[13px] leading-[1.6] text-theme-primary [&_code]:bg-transparent [&_code]:p-0 [&_code]:font-normal"
              {...props}
            >
              {children}
            </pre>
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-0 bg-theme-card h-px" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="my-5 overflow-x-auto">
              <table className="w-full border-collapse text-[14px]" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th
              className="border border-theme-card bg-theme-surface px-3 py-2 text-left font-semibold text-theme-primary"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-theme-card px-3 py-2 text-theme-secondary" {...props} />
          ),
          img: ({ node, ...props }) => (
            <img className="my-5 rounded-lg" loading="lazy" {...props} alt={props.alt ?? ''} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default Markdown;
