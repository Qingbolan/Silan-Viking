// src/components/ds/TableOfContents.tsx
//
// Design-system TableOfContents — the outline navigator for a long
// document. A vertical list of headings; depth is shown by indent + a
// type-size ramp, and the heading nearest the top of the viewport is
// highlighted (NUS-orange text + a left rail).
//
// Self-contained: takes a flat `TocItem[]` ({ id, title, level }).
// Optionally drives a scroll-spy off the live DOM — pass `spy` and the
// component observes the matching heading elements itself.
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

export interface TocItem {
  /** Id of the heading element this entry links to. */
  id: string;
  title: string;
  /** Heading depth, 1-based. Level 1 is the most prominent. */
  level: number;
}

export interface TableOfContentsProps {
  items: TocItem[];
  /** Id of the currently-active heading — highlighted, with a left rail. */
  activeId?: string;
  /** Clicking an entry. Defaults to a smooth scroll to `#id`. */
  onSelect?: (_id: string) => void;
  /**
   * When true, the component runs its own IntersectionObserver scroll-spy
   * over the heading elements and ignores `activeId`.
   */
  spy?: boolean;
  /** Section heading. Defaults to "Outline". */
  title?: string;
  /** Hide the heading bar. */
  hideHeader?: boolean;
  className?: string;
}

/* Per-depth type treatment. Level 1 leads; 2+ recede in size and weight.
   `indent` (px) is the row's left padding — it stacks the rail gutter
   (12px) with a depth step. Levels past 3 reuse the level-3 row. */
const LEVEL_STYLE: Record<number, { text: string; indent: number }> = {
  1: { text: 'text-ds-sm font-medium text-ds-fg', indent: 12 },
  2: { text: 'text-ds-xs font-normal text-ds-fg-muted', indent: 28 },
  3: { text: 'text-ds-2xs font-normal text-ds-fg-subtle', indent: 44 },
};

const levelStyle = (level: number) =>
  LEVEL_STYLE[Math.min(3, Math.max(1, level))];

/** Run an IntersectionObserver over the heading elements; returns the
 *  id of the heading nearest the top of the viewport. */
function useScrollSpy(ids: string[], enabled: boolean): string | undefined {
  const [activeId, setActiveId] = React.useState<string | undefined>(ids[0]);

  React.useEffect(() => {
    if (!enabled || ids.length === 0) return;
    const visible = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        }
        // The topmost visible heading wins; fall back to the last one
        // scrolled past so the spy never goes blank.
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
          setActiveId(top[0]);
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: [0, 1] },
    );

    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids, enabled]);

  return activeId;
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  items,
  activeId,
  onSelect,
  spy = false,
  title = 'Outline',
  hideHeader = false,
  className,
}) => {
  const ids = React.useMemo(() => items.map((i) => i.id), [items]);
  const spiedId = useScrollSpy(ids, spy);
  const currentId = spy ? spiedId : activeId;

  const handleSelect = (id: string) => {
    if (onSelect) {
      onSelect(id);
      return;
    }
    // Default behaviour — smooth-scroll to the heading.
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (items.length === 0) return null;

  return (
    <nav {...dsRoot} aria-label={title} className={cn('w-full', className)}>
      {!hideHeader && (
        <div className="mb-1.5 flex items-center px-2.5 py-1">
          <h4 className="text-ds-2xs font-semibold uppercase tracking-[0.08em] text-ds-fg-muted">
            {title}
          </h4>
          <span className="ml-auto font-mono text-ds-2xs text-ds-fg-subtle">
            {items.length}
          </span>
        </div>
      )}

      {/* The rail track: a faint hairline the active marker rides on. */}
      <ul className="relative list-none border-l border-ds-border">
        {items.map((item) => {
          const isCurrent = item.id === currentId;
          const style = levelStyle(item.level);
          return (
            <li key={item.id} className="list-none">
              <motion.button
                {...dsRoot}
                type="button"
                onClick={() => handleSelect(item.id)}
                whileTap={{ scale: 0.99 }}
                aria-current={isCurrent ? 'location' : undefined}
                style={{ paddingLeft: style.indent }}
                className={cn(
                  'relative -ml-px flex w-full items-start gap-2 border-l-2 py-1 pr-2 text-left',
                  'transition-colors duration-ds-fast ease-ds-standard outline-none',
                  'focus-visible:bg-ds-surface-2',
                  isCurrent
                    ? 'border-l-ds-primary'
                    : 'border-l-transparent hover:bg-ds-surface-2',
                )}
              >
                <span
                  className={cn(
                    'block leading-[1.4]',
                    style.text,
                    // The current row overrides the level colour with primary.
                    isCurrent && '!font-semibold !text-ds-primary',
                  )}
                >
                  {item.title}
                </span>
              </motion.button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
