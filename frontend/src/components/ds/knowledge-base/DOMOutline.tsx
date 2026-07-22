// DOMOutline — right-rail outline that scans the rendered content area for
// <h1/h2/h3>, auto-IDs them, then scroll-spies the active heading.
//
// Decoupled from any markdown source so it works for every reading page —
// blog (BlogContentRenderer DOM), idea/project (parts ContentParts DOM),
// future episode (single-blob markdown). It targets a CSS selector you pass
// in (default `.prose-content, .markdown-body`).
import React, { useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';
import { scrollToAnchor } from '../../../lib/scrollToAnchor';

interface DOMOutlineProps {
  // Selector for the content root the outline should scan. Default covers
  // both the blog content renderer (.prose-content) and any markdown body.
  containerSelector?: string;
  // Selector for headings within that root. Default h2/h3 — h1 is usually
  // the page title and lives outside the body.
  headingSelector?: string;
  className?: string;
  /**
   * Opaque value the caller bumps whenever the active page changes (e.g.
   * the chapter id). DOMOutline re-runs its scan + re-attaches its
   * MutationObserver every time this changes — the container may not
   * exist on the first mount, so we can't rely solely on the observer.
   */
  activeKey?: string;
}

interface HeadingEntry {
  id: string;
  text: string;
  level: number;
}

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'section';

const DOMOutline: React.FC<DOMOutlineProps> = ({
  containerSelector = '#kb-active-part',
  headingSelector = 'h2, h3',
  className,
  activeKey,
}) => {
  const [headings, setHeadings] = useState<HeadingEntry[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  // Scan + observe — re-runs whenever the content DOM changes (e.g. tab
  // switch, late-arriving data).
  useEffect(() => {
    const scan = (): HeadingEntry[] => {
      const root = document.querySelector(containerSelector);
      if (!root) return [];
      const els = Array.from(root.querySelectorAll<HTMLHeadingElement>(headingSelector));
      const seen = new Set<string>();
      const result: HeadingEntry[] = [];
      for (const el of els) {
        // Markdown headings include a clickable “#” permalink inside the
        // heading node. It is a control, not part of the heading label.
        const labelNode = el.cloneNode(true) as HTMLElement;
        labelNode.querySelectorAll('a[href^="#"]').forEach((anchor) => anchor.remove());
        const text = (labelNode.textContent || '').trim();
        if (!text) continue;
        let id = el.id || slugify(text);
        let n = 1;
        while (seen.has(id)) {
          id = `${slugify(text)}-${++n}`;
        }
        seen.add(id);
        if (!el.id) el.id = id;
        result.push({ id, text, level: Number(el.tagName.charAt(1)) });
      }
      return result;
    };

    const update = () => setHeadings(scan());
    update();
    // Re-scan shortly after — React may not have painted the new content
    // yet when the activeKey-driven effect first fires.
    const t = setTimeout(update, 50);

    const root = document.querySelector(containerSelector);
    if (!root) return () => clearTimeout(t);
    const mo = new MutationObserver(update);
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(t);
      mo.disconnect();
    };
  }, [containerSelector, headingSelector, activeKey]);

  // Scroll-spy via IntersectionObserver against the same containing scroll
  // surface used by the rest of the reading page (#browser-window if it
  // exists, viewport otherwise).
  useEffect(() => {
    if (headings.length === 0) return;
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target.id);
        if (visible.length > 0) setActiveId(visible[0]);
      },
      {
        root: scrollRoot,
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0,
      },
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="Outline" className={cn('w-full', className)}>
      <ol className="space-y-1">
        {headings.map((h) => {
          const active = h.id === activeId;
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => scrollToAnchor(h.id)}
                className={cn(
                  'block w-full rounded-ds-sm py-1.5 pr-1 text-left leading-[1.45] transition-colors',
                  'break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/30',
                  h.level === 1 && 'text-[15px]',
                  h.level === 2 && 'pl-3 text-[14px]',
                  h.level === 3 && 'pl-5 text-[13.5px]',
                  active
                    ? 'font-semibold text-ds-primary'
                    : h.level === 1
                      ? 'font-semibold text-ds-fg hover:text-ds-primary'
                      : 'font-medium text-ds-fg-muted hover:text-ds-primary',
                )}
              >
                {h.text}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default DOMOutline;
