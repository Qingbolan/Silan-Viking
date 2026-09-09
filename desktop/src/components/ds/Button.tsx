// src/components/ds/Button.tsx
//
// Design-system Button — the primary labelled action control. Four variants
// (primary / secondary / ghost / destructive) and two sizes; icons size
// themselves via the `[&_svg]` selector. Set `loading` to swap in a spinner
// and disable the control.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center font-medium select-none',
    'transition-[background-color,border-color,box-shadow,transform] duration-ds-fast ease-ds-standard',
    'outline-none focus-visible:shadow-ds-focus',
    'active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        // Solid NUS-orange — the single emphasised action on a surface.
        primary: 'bg-ds-primary text-ds-primary-fg hover:bg-ds-primary-hover active:bg-ds-primary-active',
        // Filled neutral surface with a hairline.
        secondary: 'bg-ds-surface-2 border border-ds-border text-ds-fg hover:bg-ds-surface-3',
        // Quiet — transparent until hovered.
        ghost: 'border-0 bg-transparent text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
        // Destructive — irreversible actions only. No `error-fg` token
        // exists, so the label is plain white; hover deepens via brightness.
        destructive: 'bg-ds-error text-white hover:brightness-[0.92]',
      },
      size: {
        sm: 'h-7 px-3 gap-1.5 rounded-ds-sm text-ds-xs [&_svg]:size-3.5',
        md: 'h-8 px-3 gap-1.5 rounded-ds-md text-ds-sm [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Show a spinner before the children and disable the button. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, type, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      {...dsRoot}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
