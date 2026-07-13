// src/components/ds/Tabs.tsx
//
// Design-system Tabs — a small, dependency-free controlled/uncontrolled tab
// strip. Three appearances: `underline` (editorial, default), `pill`
// (segmented control) and `vertical` (a left-rail nav list, à la a docs
// sidebar). The active marker animates with a shared layout transition
// via Framer Motion.
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

export interface TabItem {
  /** Stable key — also the controlled value. */
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Optional count shown as a trailing pill. */
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled active value. Omit for uncontrolled use. */
  value?: string;
  /** Initial value for uncontrolled use. */
  defaultValue?: string;
  onChange?: (_value: string) => void;
  appearance?: 'underline' | 'pill' | 'vertical';
  size?: 'sm' | 'md';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  value,
  defaultValue,
  onChange,
  appearance = 'underline',
  size = 'md',
  className,
}) => {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(
    defaultValue ?? items[0]?.value,
  );
  const active = isControlled ? value : internal;
  // A unique id keeps each Tabs instance's shared layout animation isolated.
  const groupId = React.useId();

  const select = (next: string) => {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  };

  const sizing = size === 'sm' ? 'h-8 text-ds-xs px-3' : 'h-9 text-ds-sm px-3.5';

  if (appearance === 'vertical') {
    // Left-rail nav list — each item is a full-width row riding a faint
    // hairline track. The active item is marked the same way the
    // TableOfContents marks an active heading: a NUS-orange left rail +
    // orange, semibold label. Flat — no fill block, no shadow.
    return (
      <div
        role="tablist"
        aria-orientation="vertical"
        {...dsRoot}
        className={cn('flex flex-col border-l border-ds-border', className)}
      >
        {items.map((item) => {
          const isActive = item.value === active;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => select(item.value)}
              className={cn(
                'relative -ml-px inline-flex items-center gap-2.5 border-l-2 font-medium',
                'w-full text-left transition-colors duration-ds-fast ease-ds-standard',
                'disabled:opacity-40 disabled:pointer-events-none',
                'outline-none focus-visible:bg-ds-surface-2',
                size === 'sm' ? 'h-9 px-3 text-ds-sm' : 'h-10 px-3.5 text-ds-sm',
                isActive
                  ? 'border-l-ds-primary text-ds-primary'
                  : 'border-l-transparent text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
                '[&_svg]:size-4 [&_svg]:shrink-0',
              )}
            >
              {item.icon}
              <span className={cn('min-w-0 flex-1 truncate', isActive && 'font-semibold')}>
                {item.label}
              </span>
              {item.badge != null && (
                <span className="shrink-0 text-ds-2xs text-ds-fg-subtle">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (appearance === 'pill') {
    return (
      <div
        role="tablist"
        {...dsRoot}
        className={cn(
          'inline-flex items-center gap-1 rounded-ds-md bg-ds-surface-2 p-1 ds-hairline',
          className,
        )}
      >
        {items.map((item) => {
          const isActive = item.value === active;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => select(item.value)}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-ds-sm font-medium',
                'transition-colors duration-ds-fast ease-ds-standard',
                'disabled:opacity-40 disabled:pointer-events-none',
                'outline-none focus-visible:shadow-ds-focus',
                sizing,
                isActive ? 'text-ds-fg' : 'text-ds-fg-muted hover:text-ds-fg',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={`${groupId}-pill`}
                  className="absolute inset-0 -z-[1] rounded-ds-sm bg-ds-surface-1 shadow-ds-1"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              )}
              {item.icon}
              {item.label}
              {item.badge != null && (
                <span className="text-ds-2xs text-ds-fg-subtle">{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // underline appearance
  return (
    <div
      role="tablist"
      {...dsRoot}
      className={cn('flex items-center gap-1 border-b border-ds-border', className)}
    >
      {items.map((item) => {
        const isActive = item.value === active;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => select(item.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 font-medium',
              '-mb-px transition-colors duration-ds-fast ease-ds-standard',
              'disabled:opacity-40 disabled:pointer-events-none',
              'outline-none focus-visible:shadow-ds-focus rounded-t-ds-sm',
              sizing,
              isActive ? 'text-ds-primary' : 'text-ds-fg-muted hover:text-ds-fg',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge != null && (
              <span className="text-ds-2xs text-ds-fg-subtle">{item.badge}</span>
            )}
            {isActive && (
              <motion.span
                layoutId={`${groupId}-underline`}
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ds-primary"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};
