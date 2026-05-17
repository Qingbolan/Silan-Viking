// src/components/ds/Button.tsx
//
// Design-system Button — Fluent skeleton, glass-aware.
// Native <button> + CVA variants; carries `data-ds` so the reset
// reconciliation in design-system.css keeps its fill, border and ring.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
    'font-medium rounded-ds-md leading-none',
    'transition-[background-color,color,box-shadow,transform,border-color]',
    'duration-ds-fast ease-ds-standard',
    'outline-none focus-visible:shadow-ds-focus',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:scale-[0.97]',
    '[&_svg]:shrink-0 [&_svg]:size-[1.05em]',
  ],
  {
    variants: {
      variant: {
        // Solid NUS-orange fill, white label — the single primary action.
        primary: [
          'bg-ds-primary text-white shadow-ds-1',
          'hover:bg-ds-primary-hover hover:shadow-ds-2',
        ],
        // Neutral filled surface with a hairline — secondary actions.
        secondary: [
          'bg-ds-surface-2 text-ds-fg border border-ds-border',
          'hover:bg-ds-surface-3 hover:border-ds-border-strong',
        ],
        // Hairline outline only — tertiary actions, toolbars.
        outline: [
          'bg-transparent text-ds-fg border border-ds-border-strong',
          'hover:bg-ds-surface-2',
        ],
        // Quiet text-only until hovered — dense / repeated controls.
        ghost: 'bg-transparent text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
        // Faint primary wash — emphasised but not loud.
        subtle: 'bg-ds-primary-soft text-ds-primary hover:brightness-95',
        // Destructive — delete / irreversible actions.
        danger: 'bg-ds-error text-white shadow-ds-1 hover:brightness-110 hover:shadow-ds-2',
        // Inline link styling.
        link: 'bg-transparent text-ds-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-ds-xs',
        md: 'h-9 px-4 text-ds-sm',
        lg: 'h-11 px-5 text-ds-base',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-8 w-8 p-0',
        'icon-lg': 'h-11 w-11 p-0',
      },
      block: { true: 'w-full', false: '' },
    },
    compoundVariants: [
      // The link variant has no box — drop the control padding/height.
      { variant: 'link', size: 'sm', class: 'h-auto px-0' },
      { variant: 'link', size: 'md', class: 'h-auto px-0' },
      { variant: 'link', size: 'lg', class: 'h-auto px-0' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Show a spinner and disable interaction. */
  loading?: boolean;
  /** Icon rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon rendered after the label. */
  trailingIcon?: React.ReactNode;
}

/**
 * Primary control of the design system. Pick exactly one `primary` button
 * per surface; everything else is secondary / outline / ghost.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, loading = false, leadingIcon, trailingIcon, disabled, children, type, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      {...dsRoot}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
