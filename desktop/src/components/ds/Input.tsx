// src/components/ds/Input.tsx
//
// Design-system form controls — Input, Textarea, and the Field wrapper that
// adds a label plus optional hint / error messaging. All controls are
// single-surface (surface-1 fill, hairline border, primary focus ring) and
// carry `data-ds` on the actual form element.
import React from 'react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

const controlClasses =
  'w-full rounded-ds-md border border-ds-border bg-ds-surface-1 text-ds-sm text-ds-fg ' +
  'placeholder:text-ds-fg-subtle outline-none transition-[border-color,box-shadow] duration-ds-fast ease-ds-standard ' +
  'focus-visible:border-ds-primary focus-visible:shadow-ds-focus disabled:opacity-50';

/* --- Input ---------------------------------------------------------------- */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      {...dsRoot}
      className={cn(controlClasses, 'h-11 px-3', className)}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

/* --- Textarea ------------------------------------------------------------- */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      {...dsRoot}
      className={cn(controlClasses, 'min-h-20 px-3 py-2', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

/* --- Field — label + control + hint/error --------------------------------- */

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visible label rendered above the control. */
  label?: React.ReactNode;
  /** Quiet helper text shown below the control (suppressed when `error`). */
  hint?: string;
  /** Error message — replaces `hint` and renders in the error tone. */
  error?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  className,
  children,
  ...props
}) => (
  <div {...dsRoot} className={cn('w-full', className)} {...props}>
    {label && (
      <label className="mb-1.5 block text-ds-xs font-medium text-ds-fg-muted">{label}</label>
    )}
    {children}
    {error ? (
      <p className="mt-1.5 text-ds-xs text-ds-error">{error}</p>
    ) : hint ? (
      <p className="mt-1.5 text-ds-xs text-ds-fg-subtle">{hint}</p>
    ) : null}
  </div>
);
Field.displayName = 'Field';
