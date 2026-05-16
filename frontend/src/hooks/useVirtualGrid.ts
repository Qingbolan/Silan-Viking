import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { prepare, layout } from '@chenglou/pretext';

/**
 * Virtualized grid driven by pretext text measurement.
 *
 * Cards in a responsive grid have a height that depends on how many lines
 * their title + excerpt wrap to. pretext measures that text without the
 * DOM, so we can pre-compute every card's height, group cards into rows,
 * and render only the rows currently in (or near) the viewport.
 */

export interface VirtualGridItem {
  /** Stable key. */
  id: string;
  /** Title text — measured to predict wrapped line count. */
  title: string;
  /** Excerpt/summary text — measured to predict wrapped line count. */
  excerpt: string;
}

export interface VirtualGridOptions {
  /** Number of columns at the current breakpoint. */
  columns: number;
  /** Fixed height of everything that is NOT the measured text
   *  (cover image, tags row, CTA, paddings). */
  chromeHeight: number;
  /** Vertical gap between rows, in px. */
  gap: number;
  /** Font shorthand used for the title, e.g. `700 20px Inter`. */
  titleFont: string;
  /** Line height of the title, in px. */
  titleLineHeight: number;
  /** Font shorthand used for the excerpt. */
  excerptFont: string;
  /** Line height of the excerpt, in px. */
  excerptLineHeight: number;
  /** How many extra rows to render above/below the viewport. */
  overscan?: number;
}

export interface VirtualRow<T> {
  /** Row index. */
  index: number;
  /** Items in this row (length <= columns). */
  items: T[];
  /** Absolute Y offset of the row, in px. */
  offset: number;
  /** Row height, in px. */
  height: number;
}

export interface VirtualGridResult<T> {
  /** Ref to attach to the scroll container. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Total scrollable height of all rows, in px. */
  totalHeight: number;
  /** Only the rows that should currently be rendered. */
  virtualRows: VirtualRow<T>[];
}

export function useVirtualGrid<T extends VirtualGridItem>(
  items: T[],
  options: VirtualGridOptions,
): VirtualGridResult<T> {
  const {
    columns,
    chromeHeight,
    gap,
    titleFont,
    titleLineHeight,
    excerptFont,
    excerptLineHeight,
    overscan = 2,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [columnWidth, setColumnWidth] = useState(0);

  // Track the scroll container's size and scroll position.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      setViewportHeight(el.clientHeight);
      // Inner content width split across the columns (gaps between them).
      const inner = el.clientWidth;
      const totalGap = gap * (columns - 1);
      setColumnWidth(Math.max(0, (inner - totalGap) / columns));
    };

    measure();
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [columns, gap]);

  // Measure each card's text height with pretext, then size each card.
  // The measured width is the column width minus the card's horizontal
  // padding; pretext returns the wrapped height for that width.
  const cardHeights = useMemo(() => {
    if (columnWidth <= 0) return items.map(() => chromeHeight);

    // Card content sits inside ~24px horizontal padding on each side.
    const textWidth = Math.max(40, columnWidth - 48);

    return items.map((item) => {
      const titlePrepared = prepare(item.title || ' ', titleFont);
      const { height: titleHeight } = layout(
        titlePrepared,
        textWidth,
        titleLineHeight,
      );

      const excerptPrepared = prepare(item.excerpt || ' ', excerptFont);
      const { height: excerptHeight } = layout(
        excerptPrepared,
        textWidth,
        excerptLineHeight,
      );

      return chromeHeight + titleHeight + excerptHeight;
    });
  }, [
    items,
    columnWidth,
    chromeHeight,
    titleFont,
    titleLineHeight,
    excerptFont,
    excerptLineHeight,
  ]);

  // Group cards into rows; a row's height is the tallest card in it.
  const rows = useMemo(() => {
    const out: { items: T[]; height: number }[] = [];
    for (let i = 0; i < items.length; i += columns) {
      const slice = items.slice(i, i + columns);
      const heights = cardHeights.slice(i, i + columns);
      out.push({ items: slice, height: Math.max(chromeHeight, ...heights) });
    }
    return out;
  }, [items, cardHeights, columns, chromeHeight]);

  // Absolute Y offset of each row.
  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const row of rows) {
      offsets.push(acc);
      acc += row.height + gap;
    }
    return offsets;
  }, [rows, gap]);

  const totalHeight = useMemo(() => {
    if (rows.length === 0) return 0;
    return rowOffsets[rows.length - 1] + rows[rows.length - 1].height;
  }, [rows, rowOffsets]);

  // Binary-search the first visible row, then walk while still in view.
  const findFirstVisible = useCallback(
    (top: number) => {
      let lo = 0;
      let hi = rowOffsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (rowOffsets[mid] <= top) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
    [rowOffsets],
  );

  const virtualRows = useMemo<VirtualRow<T>[]>(() => {
    if (rows.length === 0) return [];

    const first = Math.max(0, findFirstVisible(scrollTop) - overscan);
    const out: VirtualRow<T>[] = [];
    for (let i = first; i < rows.length; i++) {
      const offset = rowOffsets[i];
      if (offset > scrollTop + viewportHeight + overscan * 400) break;
      out.push({
        index: i,
        items: rows[i].items,
        offset,
        height: rows[i].height,
      });
    }
    return out;
  }, [rows, rowOffsets, scrollTop, viewportHeight, overscan, findFirstVisible]);

  return { containerRef, totalHeight, virtualRows };
}
