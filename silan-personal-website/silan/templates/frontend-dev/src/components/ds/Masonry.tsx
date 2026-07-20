// src/components/ds/Masonry.tsx
//
// Design-system Masonry — a JS-measured masonry/waterfall grid, adapted
// from the ReactBits Masonry component (reactbits.dev) to this project's
// tokens, strict TypeScript and `data-ds` convention.
//
// How it works:
//   • A ResizeObserver tracks the container width; `columns` is derived
//     from a responsive breakpoint map.
//   • Each item is absolutely positioned. After the items render, their
//     real heights are measured and packed into the shortest column.
//   • GSAP animates items into place (fade + rise on first paint, a quick
//     slide when the layout reflows).
//
// Generic over the item type — the caller supplies a `renderItem`. Pass a
// stable `getKey`; an optional `getSpan` lets an item occupy 2 columns
// (used for wide / feature cards).
import React from 'react';
import { gsap } from 'gsap';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

/** Column count per min container width (px). Descending order. */
export interface MasonryBreakpoint {
  /** Apply this column count when the container is at least this wide. */
  minWidth: number;
  columns: number;
}

export interface MasonryProps<T> {
  items: T[];
  /** Stable key per item. */
  getKey: (_item: T) => string;
  /** Render one item's content. */
  renderItem: (_item: T) => React.ReactNode;
  /**
   * Column count by container width. Defaults to a 1/2/3-column ramp.
   * Evaluated largest-first; the first matching breakpoint wins.
   */
  breakpoints?: MasonryBreakpoint[];
  /** Gap between items, in px. Defaults to 16. */
  gap?: number;
  /**
   * Columns an item spans (1 or 2). Returning 2 makes a wide card; it is
   * clamped to the available column count.
   */
  getSpan?: (_item: T) => number;
  /** Stagger between item entrance animations, in seconds. */
  stagger?: number;
  className?: string;
}

const DEFAULT_BREAKPOINTS: MasonryBreakpoint[] = [
  { minWidth: 768, columns: 3 },
  { minWidth: 480, columns: 2 },
  { minWidth: 0, columns: 1 },
];

/** Pick the column count for a given width from the breakpoint map. */
function columnsFor(width: number, breakpoints: MasonryBreakpoint[]): number {
  const sorted = [...breakpoints].sort((a, b) => b.minWidth - a.minWidth);
  for (const bp of sorted) {
    if (width >= bp.minWidth) return Math.max(1, bp.columns);
  }
  return 1;
}

interface Placement {
  key: string;
  x: number;
  y: number;
  width: number;
  span: number;
}

export function Masonry<T>({
  items,
  getKey,
  renderItem,
  breakpoints = DEFAULT_BREAKPOINTS,
  gap = 16,
  getSpan,
  stagger = 0.05,
  className,
}: MasonryProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // tile DOM nodes, keyed by item key — used to measure real heights.
  const tileRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const [width, setWidth] = React.useState(0);
  const [placements, setPlacements] = React.useState<Placement[]>([]);
  const [containerHeight, setContainerHeight] = React.useState(0);
  // Bumped when a tile image loads so the layout re-measures (images
  // resolve async and change tile height after the first pack).
  const [reflowToken, setReflowToken] = React.useState(0);
  // True until the first layout pass animates in — drives fade vs. slide.
  const hasMounted = React.useRef(false);

  /* --- Track container width. --- */
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const columns = width > 0 ? columnsFor(width, breakpoints) : 1;

  /* --- Pack tiles into columns whenever inputs change. ---
     Runs in a layout effect so measurements use the just-rendered DOM. */
  React.useLayoutEffect(() => {
    if (width === 0 || items.length === 0) {
      setPlacements([]);
      setContainerHeight(0);
      return;
    }

    const colWidth = (width - gap * (columns - 1)) / columns;
    const colHeights = new Array(columns).fill(0);
    const next: Placement[] = [];

    for (const item of items) {
      const key = getKey(item);
      const span = Math.min(columns, Math.max(1, getSpan?.(item) ?? 1));

      // Find the start column whose max height across `span` columns is
      // lowest — keeps wide tiles from creating ragged gaps.
      let bestCol = 0;
      let bestY = Infinity;
      for (let c = 0; c <= columns - span; c++) {
        const y = Math.max(...colHeights.slice(c, c + span));
        if (y < bestY) {
          bestY = y;
          bestCol = c;
        }
      }

      const tileWidth = colWidth * span + gap * (span - 1);
      const node = tileRefs.current.get(key);
      const tileHeight = node ? node.getBoundingClientRect().height : 0;

      next.push({
        key,
        x: bestCol * (colWidth + gap),
        y: bestY,
        width: tileWidth,
        span,
      });

      const newY = bestY + tileHeight + gap;
      for (let c = bestCol; c < bestCol + span; c++) colHeights[c] = newY;
    }

    setPlacements(next);
    setContainerHeight(Math.max(0, ...colHeights) - gap);
  }, [items, width, columns, gap, getSpan, getKey, reflowToken]);

  /* --- Re-pack when a tile image finishes loading. --- */
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const imgs = Array.from(el.querySelectorAll('img'));
    const pending = imgs.filter((img) => !img.complete);
    if (pending.length === 0) return;

    let done = 0;
    const onLoad = () => {
      done += 1;
      if (done >= pending.length) setReflowToken((t) => t + 1);
    };
    pending.forEach((img) => {
      img.addEventListener('load', onLoad);
      img.addEventListener('error', onLoad);
    });
    return () => {
      pending.forEach((img) => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onLoad);
      });
    };
  }, [items, width]);

  /* --- Animate tiles to their placements with GSAP. --- */
  React.useLayoutEffect(() => {
    placements.forEach((p, i) => {
      const node = tileRefs.current.get(p.key);
      if (!node) return;

      if (!hasMounted.current) {
        // First paint — fade + rise, staggered.
        gsap.fromTo(
          node,
          { opacity: 0, y: p.y + 24, x: p.x, width: p.width },
          {
            opacity: 1,
            y: p.y,
            x: p.x,
            width: p.width,
            duration: 0.5,
            delay: Math.min(i * stagger, 0.5),
            ease: 'power3.out',
          },
        );
      } else {
        // Reflow — quick slide to the new spot.
        gsap.to(node, {
          opacity: 1,
          x: p.x,
          y: p.y,
          width: p.width,
          duration: 0.35,
          ease: 'power2.out',
        });
      }
    });
    if (placements.length > 0) hasMounted.current = true;
  }, [placements, stagger]);

  return (
    <div
      {...dsRoot}
      ref={containerRef}
      className={cn('relative w-full', className)}
      style={{ height: containerHeight }}
    >
      {items.map((item) => {
        const key = getKey(item);
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) tileRefs.current.set(key, el);
              else tileRefs.current.delete(key);
            }}
            // Tiles are absolutely positioned; GSAP owns x / y / width.
            className="absolute left-0 top-0 will-change-transform"
            style={{ opacity: 0 }}
          >
            {renderItem(item)}
          </div>
        );
      })}
    </div>
  );
}
