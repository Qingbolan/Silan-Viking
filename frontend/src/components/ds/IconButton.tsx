// src/components/ds/IconButton.tsx
//
// Design-system IconButton — a square, icon-only control. Used for toolbar
// actions, chrome controls and dense UI where a labelled Button is too wide.
// Always pass an accessible `label`; an optional Tooltip wraps it when
// `showTooltip` is set.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Tooltip } from './Tooltip';

const iconButtonVariants = cva(
  [
    'inline-flex items-center justify-center shrink-0 select-none',
    'transition-[background-color,color,box-shadow,transform] duration-ds-fast ease-ds-standard',
    'outline-none focus-visible:shadow-ds-focus',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:scale-[0.94]',
  ],
  {
    variants: {
      variant: {
        // Quiet — transparent until hovered. The chrome / toolbar default.
        ghost: 'bg-transparent text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
        // Solid NUS-orange — a single emphasised icon action.
        primary: 'bg-ds-primary text-white shadow-ds-1 hover:bg-ds-primary-hover',
        // Filled neutral surface with a hairline.
        surface: 'bg-ds-surface-2 text-ds-fg border border-ds-border hover:bg-ds-surface-3',
        // Frosted glass — for chrome that floats over the desk material.
        glass: 'ds-acrylic text-ds-fg hover:brightness-[0.97]',
      },
      size: {
        sm: 'h-7 w-7 [&_svg]:size-3.5',
        md: 'h-9 w-9 [&_svg]:size-4',
        lg: 'h-11 w-11 [&_svg]:size-5',
      },
      shape: {
        square: 'rounded-ds-md',
        round: 'rounded-full',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md', shape: 'square' },
  },
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Accessible name — required, icon-only buttons have no visible text. */
  label: string;
  /** Wrap the button in a Tooltip showing `label` on hover. */
  showTooltip?: boolean;
  /** Tooltip placement when `showTooltip` is set. */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, variant, size, shape, label, showTooltip, tooltipSide = 'bottom', type, children, ...props },
    ref,
  ) => {
    const button = (
      <button
        ref={ref}
        type={type ?? 'button'}
        {...dsRoot}
        aria-label={label}
        title={showTooltip ? undefined : label}
        className={cn(iconButtonVariants({ variant, size, shape }), className)}
        {...props}
      >
        {children}
      </button>
    );

    if (showTooltip) {
      return (
        <Tooltip content={label} side={tooltipSide}>
          {button}
        </Tooltip>
      );
    }
    return button;
  },
);
IconButton.displayName = 'IconButton';

export { iconButtonVariants };
