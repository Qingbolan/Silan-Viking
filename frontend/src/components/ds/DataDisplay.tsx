// src/components/ds/DataDisplay.tsx
//
// Design-system data-display components — Progress, Segmented, Breadcrumb,
// Accordion, Table.
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

/* --- Progress ------------------------------------------------------------- */

export interface ProgressProps {
  /** 0–100. */
  value: number;
  tone?: 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md';
  /** Show the percentage label trailing the bar. */
  showValue?: boolean;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  tone = 'primary',
  size = 'md',
  showValue,
  className,
}) => {
  const pct = Math.min(100, Math.max(0, value));
  const fill = {
    primary: 'bg-ds-primary',
    success: 'bg-ds-success',
    warning: 'bg-ds-warning',
    error: 'bg-ds-error',
  }[tone];

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        {...dsRoot}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'flex-1 overflow-hidden rounded-full bg-ds-surface-3 border border-ds-border',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <motion.div
          className={cn('h-full rounded-full', fill)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {showValue && (
        <span className="w-9 shrink-0 text-right font-mono text-ds-xs text-ds-fg-muted">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
};

/* --- Segmented control ---------------------------------------------------- */

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedProps {
  value: string;
  onChange: (_value: string) => void;
  options: SegmentedOption[];
  size?: 'sm' | 'md';
  /** Active-item accent. 'neutral' (default) or 'primary' (NUS orange). */
  tone?: 'neutral' | 'primary';
  /** Accessible name for the tab list when no visible group label exists. */
  ariaLabel?: string;
  className?: string;
}

export const Segmented: React.FC<SegmentedProps> = ({
  value,
  onChange,
  options,
  size = 'md',
  tone = 'neutral',
  ariaLabel,
  className,
}) => {
  const groupId = React.useId();
  return (
    <div
      {...dsRoot}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-ds-md bg-ds-surface-2 p-0.5 border border-ds-border',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            {...dsRoot}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-ds-sm font-medium',
              'transition-colors duration-ds-fast ease-ds-standard outline-none',
              'focus-visible:shadow-ds-focus [&_svg]:size-3.5',
              size === 'sm' ? 'h-7 px-2.5 text-ds-xs' : 'h-8 px-3 text-ds-sm',
              active
                ? tone === 'primary'
                  ? 'text-ds-primary'
                  : 'text-ds-fg'
                : 'text-ds-fg-muted hover:text-ds-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`${groupId}-seg`}
                className="absolute inset-0 -z-[1] rounded-ds-sm bg-ds-surface-1 shadow-ds-1"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

/* --- Breadcrumb ----------------------------------------------------------- */

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
  onClick?: () => void;
}

export const Breadcrumb: React.FC<{ items: BreadcrumbItem[]; className?: string }> = ({
  items,
  className,
}) => (
  <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-ds-sm', className)}>
    {items.map((item, i) => {
      const last = i === items.length - 1;
      return (
        <React.Fragment key={i}>
          {item.href || item.onClick ? (
            <a
              href={item.href}
              onClick={item.onClick}
              className={cn(
                'rounded-ds-sm px-1 py-0.5 transition-colors duration-ds-fast',
                last
                  ? 'font-medium text-ds-fg'
                  : 'text-ds-fg-muted hover:text-ds-primary',
              )}
              aria-current={last ? 'page' : undefined}
            >
              {item.label}
            </a>
          ) : (
            <span className={last ? 'font-medium text-ds-fg' : 'text-ds-fg-muted'}>
              {item.label}
            </span>
          )}
          {!last && <ChevronRight className="size-3.5 text-ds-fg-subtle" />}
        </React.Fragment>
      );
    })}
  </nav>
);

/* --- Accordion ------------------------------------------------------------ */

export interface AccordionItem {
  key: string;
  title: React.ReactNode;
  content: React.ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** Allow multiple panels open at once. */
  multiple?: boolean;
  /** Keys open initially. */
  defaultOpen?: string[];
  className?: string;
}

export const Accordion: React.FC<AccordionProps> = ({
  items,
  multiple = false,
  defaultOpen = [],
  className,
}) => {
  const [open, setOpen] = React.useState<string[]>(defaultOpen);
  const toggle = (key: string) =>
    setOpen((cur) =>
      cur.includes(key)
        ? cur.filter((k) => k !== key)
        : multiple
          ? [...cur, key]
          : [key],
    );

  return (
    <div
      {...dsRoot}
      className={cn('divide-y divide-ds-border overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-1', className)}
    >
      {items.map((item) => {
        const isOpen = open.includes(item.key);
        return (
          <div key={item.key}>
            <button
              {...dsRoot}
              type="button"
              onClick={() => toggle(item.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-ds-sm font-medium text-ds-fg transition-colors duration-ds-fast hover:bg-ds-surface-2"
            >
              {item.title}
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-ds-fg-subtle transition-transform duration-ds-normal ease-ds-standard',
                  isOpen && 'rotate-180',
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-0 text-ds-sm leading-relaxed text-ds-fg-muted">
                    {item.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

/* --- Table ---------------------------------------------------------------- */

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** Cell renderer. */
  render: (_row: T) => React.ReactNode;
  /** Right-align (numeric columns). */
  align?: 'left' | 'right';
  width?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  /** Stable row key extractor. */
  rowKey: (_row: T) => string;
  /** Highlight rows on hover. */
  hoverable?: boolean;
  onRowClick?: (_row: T) => void;
  className?: string;
}

export function Table<T>({
  columns,
  rows,
  rowKey,
  hoverable = true,
  onRowClick,
  className,
}: TableProps<T>) {
  return (
    <div
      {...dsRoot}
      className={cn('overflow-hidden rounded-ds-lg border border-ds-border', className)}
    >
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-ds-surface-2">
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={cn(
                  'px-4 py-2.5 text-ds-2xs font-medium uppercase tracking-[0.06em] text-ds-fg-subtle',
                  col.align === 'right' && 'text-right',
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={cn(
                'text-ds-sm text-ds-fg transition-colors duration-ds-fast',
                i !== 0 && 'border-t border-ds-border',
                hoverable && 'hover:bg-ds-surface-2',
                onRowClick && 'cursor-pointer',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn('px-4 py-2.5', col.align === 'right' && 'text-right')}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
