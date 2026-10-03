// DOMOutline — right-rail outline that scans the rendered content area for
// <h1/h2/h3>, auto-IDs them, then scroll-spies the active heading.
//
// Decoupled from any markdown source so it works for every reading page —
// blog (BlogContentRenderer DOM), idea/project (parts ContentParts DOM),
// future episode (single-blob markdown). It targets a CSS selector you pass
// in (default `.prose-content, .markdown-body`).
import React, { useEffect, useState } from 'react';
import { ListTree } from 'lucide-react';
import { Tooltip } from '../Tooltip';
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
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
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
  label: string;
  number: string;
  title: string;
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
  headingSelector = 'h2, h3, h4, h5, h6',
  className,
  collapsed = false,
  onCollapsedChange,
  activeKey,
}) => {
  const [headings, setHeadings] = useState<HeadingEntry[]>([]);
  const navRef = React.useRef<HTMLElement>(null);
  const manualScroll = React.useRef(false);
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
      const numbering: { level: number; count: number }[] = [];
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
        const level = Number(el.tagName.charAt(1));
        while (numbering.length && numbering[numbering.length - 1].level > level) numbering.pop();
        const current = numbering[numbering.length - 1];
        if (current?.level === level) current.count += 1;
        else numbering.push({ level, count: 1 });
        const number = numbering.map((entry) => entry.count).join('.') + (numbering.length === 1 ? '.' : '');
        const title = text.replace(/^\d+(?:\.\d+)*(?:[.)])?\s+/, '');
        const label = `${number} ${title}`;
        result.push({ id, text, level, label, number, title });
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

  // Resolve the current section from reading position, including large scroll
  // jumps where no heading intersects a narrow observer band.
  useEffect(() => {
    if (!headings.length) return;
    const root = document.querySelector<HTMLElement>('#browser-window');
    const surface = root ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = (root?.getBoundingClientRect().top ?? 0) + 100;
      let current = headings[0].id;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top > readingLine) break;
        current = heading.id;
      }
      setActiveId(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    surface.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [headings]);

  const hasOutline = headings.length > 1;

  // User scroll intent takes ownership; programmatic scrolling never disables follow.
  useEffect(() => {
    manualScroll.current = false;
    const surface = navRef.current?.closest<HTMLElement>('[data-outline-scroll]');
    if (!surface) return;
    const stopFollowing = () => { manualScroll.current = true; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopFollowing();
    };
    surface.addEventListener('wheel', stopFollowing, { passive: true });
    surface.addEventListener('touchmove', stopFollowing, { passive: true });
    surface.addEventListener('keydown', onKeyDown);
    return () => {
      surface.removeEventListener('wheel', stopFollowing);
      surface.removeEventListener('touchmove', stopFollowing);
      surface.removeEventListener('keydown', onKeyDown);
    };
  }, [activeKey, containerSelector, hasOutline]);

  useEffect(() => {
    if (manualScroll.current) return;
    const surface = navRef.current?.closest<HTMLElement>('[data-outline-scroll]');
    const current = navRef.current?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!surface || !current) return;
    const bounds = surface.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    const padding = 12;
    const offset = item.top < bounds.top + padding
      ? item.top - bounds.top - padding
      : item.bottom > bounds.bottom - padding
        ? item.bottom - bounds.bottom + padding
        : 0;
    if (offset) surface.scrollBy({ top: offset, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [activeId, collapsed, headings]);

  if (headings.length < 2) return null;

  return (
    <nav ref={navRef} data-ds aria-label="Article outline" className={cn('w-full', collapsed && 'flex flex-col items-center', className)}>
      <div className={cn(!collapsed && 'mb-2')}>
        <button
          type="button"
          aria-label={collapsed ? 'Expand article outline' : 'Collapse article outline'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand outline' : 'Collapse outline'}
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="flex size-8 items-center justify-center rounded-ds-sm text-ds-fg-muted transition-colors hover:bg-ds-surface-2 hover:text-ds-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary"
        >
          <ListTree className="size-4" aria-hidden />
        </button>
      </div>
      {collapsed && (
        <ol className="flex w-full flex-col items-center">
          {headings.map((heading) => {
            const active = heading.id === activeId;
            return <li key={heading.id}>
              <Tooltip side="left" delay={100} className="w-max max-w-[calc(100vw-5rem)]" content={<span className="block w-max max-w-[min(24rem,calc(100vw-5rem))] truncate text-ds-xs leading-5"><span className="text-ds-primary">{heading.number}</span>{' '}{heading.title}</span>}>
                <button type="button" aria-label={heading.label} aria-current={active ? 'location' : undefined}
                  onClick={() => scrollToAnchor(heading.id)}
                  className="group flex h-3 w-9 items-center justify-end rounded-ds-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary">
                  <span aria-hidden className={cn(
                    'block h-[3px] w-8 origin-right rounded-full transition-[transform,background-color,opacity] duration-300 ease-out motion-reduce:transition-none group-hover:scale-x-100 group-hover:opacity-100 group-hover:bg-ds-primary group-focus-visible:scale-x-100 group-focus-visible:opacity-100 group-focus-visible:bg-ds-primary',
                    active ? 'scale-x-100 bg-ds-primary' : heading.level >= 3 ? 'scale-x-[0.375] bg-ds-fg-subtle opacity-50' : 'scale-x-[0.625] bg-ds-fg-subtle opacity-50',
                  )} />
                </button>
              </Tooltip>
            </li>;
          })}
        </ol>
      )}
      {!collapsed && (
      <ol className="space-y-0.5">
        {headings.map((h) => {
          const active = h.id === activeId;
          return (
            <li key={h.id}>
              <button
                type="button"
                aria-current={active ? 'location' : undefined}
                onClick={() => scrollToAnchor(h.id)}
                className={cn(
                  'block w-full rounded-ds-sm py-1 pr-1 text-left leading-[1.32] transition-colors',
                  'break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/30',
                  h.level === 1 && 'text-ds-sm',
                  h.level === 2 && 'pl-2.5 text-ds-xs',
                  h.level >= 3 && 'pl-4 text-ds-xs',
                  active
                    ? 'font-semibold text-ds-primary'
                    : h.level === 1
                      ? 'font-semibold text-ds-fg hover:text-ds-primary'
                      : 'font-medium text-ds-fg-muted hover:text-ds-primary',
                )}
              >
                <span className="text-ds-primary">{h.number}</span>{' '}{h.title}
              </button>
            </li>
          );
        })}
      </ol>
      )}
    </nav>
  );
};

export default DOMOutline;
