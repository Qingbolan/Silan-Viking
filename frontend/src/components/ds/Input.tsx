// src/components/ds/Input.tsx
//
// Design-system text controls — Input, Textarea, and the Field wrapper that
// pairs them with a label / hint / error message. Inputs sit on surface-2 so
// they read as recessed wells against a surface-1 card.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

const fieldBase = cva(
  [
    // Material: a recessed well. The field is the deepest surface (-3),
    // a crisp border-strong hairline, and a faint inset top-shadow so it
    // reads as carved into the card around it.
    'w-full rounded-ds-md bg-ds-surface-3 text-ds-fg',
    'border border-ds-border-strong',
    'shadow-[inset_0_1.5px_3px_-1px_oklch(0_0_0/0.10)]',
    'placeholder:text-ds-fg-subtle',
    'transition-[box-shadow,border-color,background-color] duration-ds-fast ease-ds-standard',
    'hover:border-ds-fg-subtle',
    // Focus: NUS-orange ring + border; the field surface lifts to white
    // and the inset shadow is dropped, so it rises to meet the cursor.
    'outline-none focus-visible:border-ds-primary focus-visible:bg-ds-surface-1',
    'focus-visible:shadow-[0_0_0_3px_var(--ds-color-ring)]',
    'disabled:opacity-55 disabled:pointer-events-none',
  ],
  {
    variants: {
      size: {
        sm: 'h-8 px-2.5 text-ds-xs',
        md: 'h-9 px-3 text-ds-sm',
        lg: 'h-11 px-4 text-ds-base',
      },
      invalid: {
        true: 'border-ds-error focus-visible:border-ds-error focus-visible:shadow-[0_0_0_3px_var(--ds-color-error-soft)]',
        false: '',
      },
    },
    defaultVariants: { size: 'md', invalid: false },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof fieldBase> {
  /** Icon rendered inside the field, leading edge. */
  leadingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, invalid, leadingIcon, ...props }, ref) => {
    if (leadingIcon) {
      return (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-ds-fg-subtle [&_svg]:size-4">
            {leadingIcon}
          </span>
          <input
            ref={ref}
            {...dsRoot}
            className={cn(fieldBase({ size, invalid }), 'pl-9', className)}
            aria-invalid={invalid || undefined}
            {...props}
          />
        </div>
      );
    }
    return (
      <input
        ref={ref}
        {...dsRoot}
        className={cn(fieldBase({ size, invalid }), className)}
        aria-invalid={invalid || undefined}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>,
    VariantProps<typeof fieldBase> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      {...dsRoot}
      className={cn(
        fieldBase({ size: 'md', invalid }),
        'h-auto min-h-[5rem] py-2 leading-relaxed resize-y',
        className,
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export interface FieldProps {
  /** Visible label text. */
  label?: string;
  /** Helper text shown under the control. */
  hint?: string;
  /** Error message — when set, overrides `hint` and tints the control. */
  error?: string;
  /** Mark the field required (adds a subtle asterisk). */
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Layout wrapper for a labelled form control. Pass the matching `invalid`
 * prop to the child Input/Textarea when `error` is set.
 */
export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}) => (
  <div className={cn('space-y-1.5', className)}>
    {label && (
      <label
        htmlFor={htmlFor}
        className="block text-ds-xs font-medium text-ds-fg-muted"
      >
        {label}
        {required && <span className="ml-0.5 text-ds-error">*</span>}
      </label>
    )}
    {children}
    {(error || hint) && (
      <p className={cn('text-ds-2xs', error ? 'text-ds-error' : 'text-ds-fg-subtle')}>
        {error || hint}
      </p>
    )}
  </div>
);
