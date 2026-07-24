// src/components/ds/Masonry.tsx
//
// Design-system Masonry — the public adapter between product cards and
// MasonryKit's measured layout engine.
//
// MasonryKit owns the hard lifecycle:
//   • every dynamic-height cell is observed independently;
//   • measurements are de-duplicated and committed once per animation frame;
//   • the shortest-column layout is recomputed from those measurements.
//
// This adapter owns only product semantics: responsive column counts, spans,
// design-system markup, and the existing generic renderItem API.
import React from 'react';
import { measuredCell, useMasonry } from '@masonrykit/react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

/** Column count per minimum container width (px). */
export interface MasonryBreakpoint {
  /** Apply this column count when the container is at least this wide. */
  minWidth: number;
  columns: number;
}

export interface MasonryProps<T> {
  items: T[];
  /** Stable, unique key per item. */
  getKey: (_item: T) => string;
  /** Render one item's content. */
  renderItem: (_item: T) => React.ReactNode;
  /**
   * Column count by container width. Defaults to a 1/2/3-column ramp.
   * The matching breakpoint with the largest minWidth wins.
   */
  breakpoints?: MasonryBreakpoint[];
  /** Gap between items, in px. Defaults to 16. */
  gap?: number;
  /** Number of columns occupied by an item. Values are normalized to integers. */
  getSpan?: (_item: T) => number;
  /**
   * Initial height used for the first placement before the DOM reports the
   * real height. A conservative estimate prevents first-paint overlap.
   */
  estimatedHeight?: number | ((_item: T) => number);
  /**
   * Delay between item entrance fades, in seconds. Geometry itself is never
   * animated: measured reflows must settle atomically without transient overlap.
   */
  stagger?: number;
  /** Extra space reserved after the lowest tile for shadows or following sections. */
  bottomPadding?: number;
  className?: string;
}

const DEFAULT_BREAKPOINTS: MasonryBreakpoint[] = [
  { minWidth: 768, columns: 3 },
  { minWidth: 480, columns: 2 },
  { minWidth: 0, columns: 1 },
];

const DEFAULT_ESTIMATED_HEIGHT = 640;

/** Pick the exact column count requested at a container width. */
function columnsFor(width: number, breakpoints: MasonryBreakpoint[]): number {
  let match: MasonryBreakpoint | undefined;
  for (const breakpoint of breakpoints) {
    if (
      width >= breakpoint.minWidth
      && (!match || breakpoint.minWidth > match.minWidth)
    ) {
      match = breakpoint;
    }
  }
  return Math.max(1, Math.floor(match?.columns ?? 1));
}

/** Convert the public count-based contract into MasonryKit's column width. */
function columnWidthFor(width: number, columns: number, gap: number): number {
  if (width <= 0) return 1;
  return Math.max(1, (width - gap * (columns - 1)) / columns);
}

function normalizeSpan(span: number): number {
  if (!Number.isFinite(span)) return 1;
  return Math.max(1, Math.floor(span));
}

function estimateFor<T>(
  item: T,
  estimatedHeight: MasonryProps<T>['estimatedHeight'],
): number {
  const estimate = typeof estimatedHeight === 'function'
    ? estimatedHeight(item)
    : estimatedHeight;
  if (!Number.isFinite(estimate)) return DEFAULT_ESTIMATED_HEIGHT;
  return Math.max(1, estimate ?? DEFAULT_ESTIMATED_HEIGHT);
}

interface MasonryCellStyle extends React.CSSProperties {
  '--ds-masonry-x': string;
  '--ds-masonry-y': string;
  '--ds-masonry-width': string;
  '--ds-masonry-delay': string;
}

export function Masonry<T>({
  items,
  getKey,
  renderItem,
  breakpoints = DEFAULT_BREAKPOINTS,
  gap = 16,
  getSpan,
  estimatedHeight = DEFAULT_ESTIMATED_HEIGHT,
  stagger = 0.05,
  bottomPadding = 0,
  className,
}: MasonryProps<T>) {
  const containerElementRef = React.useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = React.useState(0);

  // The count-based public API needs the exact container width before it can
  // derive MasonryKit's columnWidth input. Width reports are coalesced to one
  // state commit per frame; cell-height observation stays entirely in the
  // layout engine.
  React.useLayoutEffect(() => {
    const element = containerElementRef.current;
    if (!element) return;

    let frame: number | null = null;
    const measure = () => {
      frame = null;
      const nextWidth = Math.max(0, Math.floor(element.getBoundingClientRect().width));
      setGridWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const normalizedGap = Math.max(0, gap);
  const columns = columnsFor(gridWidth, breakpoints);
  const columnWidth = columnWidthFor(gridWidth, columns, normalizedGap);

  const cells = React.useMemo(
    () => items.map((item) => measuredCell<T>(getKey(item), {
      columnSpan: normalizeSpan(getSpan?.(item) ?? 1),
      estimatedHeight: estimateFor(item, estimatedHeight),
      meta: item,
    })),
    [estimatedHeight, getKey, getSpan, items],
  );

  const {
    layout,
    stableCells,
    gridRef,
    cellRef,
  } = useMasonry<T>(cells, {
    gridWidth,
    columnWidth,
    gap: normalizedGap,
  });

  const setContainerRef = React.useCallback((element: HTMLDivElement | null) => {
    containerElementRef.current = element;
    gridRef(element);
  }, [gridRef]);

  const ready = gridWidth > 0;

  return (
    <div
      {...dsRoot}
      ref={setContainerRef}
      role="list"
      data-masonry-state={ready ? 'ready' : 'measuring'}
      data-masonry-columns={ready ? layout.columns.count : 1}
      className={cn('relative w-full', className)}
      style={ready ? { height: layout.height + Math.max(0, bottomPadding) } : undefined}
    >
      {stableCells.map((cell) => (
        <div
          key={cell.id}
          ref={cellRef(cell.id)}
          role="listitem"
          data-masonry-cell={cell.id}
          className={cn(
            ready
              ? 'ds-masonry-cell'
              : 'relative mb-4 w-full last:mb-0',
          )}
          style={ready ? {
            '--ds-masonry-x': `${cell.x}px`,
            '--ds-masonry-y': `${cell.y}px`,
            '--ds-masonry-width': `${cell.width}px`,
            '--ds-masonry-delay': `${Math.min(cell.index * Math.max(0, stagger), 0.5)}s`,
          } as MasonryCellStyle : undefined}
        >
          {renderItem(cell.meta as T)}
        </div>
      ))}
    </div>
  );
}
