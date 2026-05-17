// src/components/ds/Badge.tsx
//
// Design-system Badge — compact status / category marker.
// `soft` tone is the default (tinted background, coloured text); `solid`
// is reserved for the rare case a badge must read as a strong signal.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 whitespace-nowrap font-medium',
    'rounded-ds-sm border align-middle',
    '[&_svg]:size-3 [&_svg]:shrink-0',
  ],
  {
    variants: {
      tone: {
        neutral: '',
        primary: '',
        success: '',
        warning: '',
        error: '',
      },
      appearance: {
        soft: '',
        solid: 'border-transparent text-white',
        outline: 'bg-transparent',
      },
      size: {
        sm: 'h-5 px-1.5 text-ds-2xs',
        md: 'h-6 px-2 text-ds-xs',
      },
    },
    compoundVariants: [
      // --- soft (default): tinted bg + coloured text + a faint tinted
      //     hairline in the same hue, so the chip reads as a crisp pill ----
      { tone: 'neutral', appearance: 'soft', class: 'bg-ds-surface-2 text-ds-fg-muted border-ds-border' },
      { tone: 'primary', appearance: 'soft', class: 'bg-ds-primary-soft text-ds-primary border-ds-primary/25' },
      { tone: 'success', appearance: 'soft', class: 'bg-ds-success-soft text-ds-success border-ds-success/25' },
      { tone: 'warning', appearance: 'soft', class: 'bg-ds-warning-soft text-ds-warning border-ds-warning/25' },
      { tone: 'error',   appearance: 'soft', class: 'bg-ds-error-soft text-ds-error border-ds-error/30' },
      // --- solid: strong signal -----------------------------------------
      { tone: 'neutral', appearance: 'solid', class: 'bg-ds-fg-muted' },
      { tone: 'primary', appearance: 'solid', class: 'bg-ds-primary text-ds-primary-fg' },
      { tone: 'success', appearance: 'solid', class: 'bg-ds-success' },
      { tone: 'warning', appearance: 'solid', class: 'bg-ds-warning text-ds-fg' },
      { tone: 'error',   appearance: 'solid', class: 'bg-ds-error' },
      // --- outline -------------------------------------------------------
      { tone: 'neutral', appearance: 'outline', class: 'text-ds-fg-muted border-ds-border-strong' },
      { tone: 'primary', appearance: 'outline', class: 'text-ds-primary border-ds-primary' },
      { tone: 'success', appearance: 'outline', class: 'text-ds-success border-ds-success' },
      { tone: 'warning', appearance: 'outline', class: 'text-ds-warning border-ds-warning' },
      { tone: 'error',   appearance: 'outline', class: 'text-ds-error border-ds-error' },
    ],
    defaultVariants: { tone: 'neutral', appearance: 'soft', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof badgeVariants> {
  /** Render a small leading status dot in the current tone. */
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  tone,
  appearance,
  size,
  dot = false,
  children,
  ...props
}) => (
  <span {...dsRoot} className={cn(badgeVariants({ tone, appearance, size }), className)} {...props}>
    {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
    {children}
  </span>
);

export { badgeVariants };
