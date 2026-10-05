// src/components/ds/Select.tsx
//
// Design-system Select — a styled native <select> with a chevron affordance.
// Keeps the native element (keyboard, mobile pickers, form semantics) and
// only replaces its chrome: appearance-none plus an absolutely-positioned
// ChevronDown. The ref forwards to the <select> itself.
import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div {...dsRoot} className="relative w-full">
      <select
        ref={ref}
        className={cn(
          'w-full h-11 appearance-none rounded-ds-md border border-ds-border bg-ds-surface-1 pl-3 pr-8',
          'text-ds-sm text-ds-fg outline-none transition-[border-color,box-shadow] duration-ds-fast ease-ds-standard',
          'focus-visible:border-ds-primary focus-visible:shadow-ds-focus disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ds-fg-subtle"
      />
    </div>
  ),
);
Select.displayName = 'Select';
