// src/components/ds/Controls.tsx
//
// Design-system form controls — Switch, Checkbox, Radio (+ RadioGroup),
// Select. All are controlled, label-aware, and carry `data-ds`.
import React from 'react';
import { Check, Minus, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

/* --- Switch --------------------------------------------------------------- */

export interface SwitchProps {
  checked: boolean;
  onChange: (_checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
  className,
}) => {
  const dims = size === 'sm'
    ? { track: 'h-4 w-7', thumb: 'size-3', shift: 'translate-x-3' }
    : { track: 'h-5 w-9', thumb: 'size-4', shift: 'translate-x-4' };

  const control = (
    <button
      {...dsRoot}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5',
        'transition-colors duration-ds-fast ease-ds-standard',
        'outline-none focus-visible:shadow-ds-focus',
        'disabled:opacity-45 disabled:pointer-events-none',
        dims.track,
        checked ? 'bg-ds-primary' : 'bg-ds-surface-3 border border-ds-border',
      )}
    >
      <span
        className={cn(
          'rounded-full bg-white shadow-ds-1',
          'transition-transform duration-ds-fast ease-ds-out-back',
          dims.thumb,
          checked && dims.shift,
        )}
      />
    </button>
  );

  if (!label) return <span className={className}>{control}</span>;
  return (
    <label className={cn('inline-flex items-center gap-2.5', disabled && 'opacity-45', className)}>
      {control}
      <span className="text-ds-sm text-ds-fg">{label}</span>
    </label>
  );
};

/* --- Checkbox ------------------------------------------------------------- */

export interface CheckboxProps {
  checked: boolean;
  /** Tri-state: render a dash instead of a tick. */
  indeterminate?: boolean;
  onChange: (_checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  indeterminate,
  onChange,
  label,
  disabled,
  className,
}) => {
  const on = checked || indeterminate;
  const box = (
    <button
      {...dsRoot}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-ds-sm',
        'transition-colors duration-ds-fast ease-ds-standard',
        'outline-none focus-visible:shadow-ds-focus',
        'disabled:opacity-45 disabled:pointer-events-none',
        on
          ? 'bg-ds-primary text-white'
          : 'bg-ds-surface-2 border border-ds-border-strong hover:border-ds-primary',
      )}
    >
      {indeterminate ? (
        <Minus className="size-3" strokeWidth={3} />
      ) : checked ? (
        <Check className="size-3" strokeWidth={3} />
      ) : null}
    </button>
  );

  if (!label) return <span className={className}>{box}</span>;
  return (
    <label className={cn('inline-flex items-center gap-2.5', disabled && 'opacity-45', className)}>
      {box}
      <span className="text-ds-sm text-ds-fg">{label}</span>
    </label>
  );
};

/* --- Radio + RadioGroup --------------------------------------------------- */

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  value: string;
  onChange: (_value: string) => void;
  options: RadioOption[];
  /** Lay options out horizontally. */
  inline?: boolean;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  value,
  onChange,
  options,
  inline,
  className,
}) => (
  <div
    role="radiogroup"
    className={cn(inline ? 'flex flex-wrap gap-4' : 'flex flex-col gap-2.5', className)}
  >
    {options.map((opt) => {
      const selected = opt.value === value;
      return (
        <label
          key={opt.value}
          className={cn(
            'inline-flex items-start gap-2.5',
            opt.disabled && 'opacity-45',
          )}
        >
          <button
            {...dsRoot}
            role="radio"
            aria-checked={selected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full',
              'transition-colors duration-ds-fast ease-ds-standard',
              'outline-none focus-visible:shadow-ds-focus',
              'disabled:pointer-events-none',
              selected
                ? 'border-[5px] border-ds-primary bg-white'
                : 'bg-ds-surface-2 border border-ds-border-strong hover:border-ds-primary',
            )}
          />
          <span className="space-y-0.5">
            <span className="block text-ds-sm text-ds-fg">{opt.label}</span>
            {opt.description && (
              <span className="block text-ds-xs text-ds-fg-muted">{opt.description}</span>
            )}
          </span>
        </label>
      );
    })}
  </div>
);

/* --- Select --------------------------------------------------------------- */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: SelectOption[];
  size?: 'sm' | 'md' | 'lg';
  invalid?: boolean;
}

/** A styled native <select> — keeps native a11y + mobile pickers. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, size = 'md', invalid, className, ...props }, ref) => (
    <div className="relative inline-flex w-full">
      <select
        ref={ref}
        {...dsRoot}
        className={cn(
          'w-full appearance-none rounded-ds-md bg-ds-surface-2 text-ds-fg',
          'border border-ds-border pr-9',
          'transition-[box-shadow,border-color] duration-ds-fast ease-ds-standard',
          'outline-none focus-visible:shadow-ds-focus focus-visible:border-ds-primary',
          'disabled:opacity-45 disabled:pointer-events-none',
          size === 'sm' && 'h-8 pl-2.5 text-ds-xs',
          size === 'md' && 'h-9 pl-3 text-ds-sm',
          size === 'lg' && 'h-11 pl-4 text-ds-base',
          invalid && 'border-ds-error',
          className,
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ds-fg-subtle" />
    </div>
  ),
);
Select.displayName = 'Select';
