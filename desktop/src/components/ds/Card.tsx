// src/components/ds/Card.tsx
//
// Design-system Card system — surfaces with real material depth.
//
//   Card          base surface, 6 material variants
//   CardHeader/Title/Description/Content/Footer  — composition slots
//   StatCard      metric card — value + label + delta + icon
//   MediaCard     image-topped card for galleries / blog
//
// Materials (see design-system.css): `glass` is Acrylic (frosted, edge
// highlight, inner glow); `reveal` adds a cursor-tracking gradient border;
// `spotlight` adds a cursor-following glow. All carry `data-ds`.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toWebviewMediaUrl } from '../../lib/media';
import { dsRoot } from './dsAttr';
import { useSpotlight } from './useSpotlight';

/* --- Card ----------------------------------------------------------------- */

const cardVariants = cva(
  [
    'relative rounded-ds-lg',
    'transition-[box-shadow,transform,border-color,background-color]',
    'duration-ds-normal ease-ds-emphasized',
  ],
  {
    variants: {
      variant: {
        // Resting solid card on the page canvas.
        elevated: 'bg-ds-surface-1 border border-ds-border shadow-ds-1',
        // Flat panel — hairline only, no shadow.
        flat: 'bg-ds-surface-1 border border-ds-border',
        // Inset / nested well.
        inset: 'bg-ds-surface-2 border border-ds-border',
        // Outline only — quiet grouping, transparent fill.
        outline: 'bg-transparent border border-ds-border',
        // Acrylic frosted glass — full material treatment.
        glass: 'ds-acrylic ds-ridge',
        // Mica — quiet window-base material.
        mica: 'ds-mica',
      },
      padding: { none: 'p-0', sm: 'p-4', md: 'p-5', lg: 'p-7' },
      interactive: {
        true: 'cursor-pointer hover:-translate-y-0.5 hover:shadow-ds-3 focus-visible:shadow-ds-focus outline-none',
        false: '',
      },
    },
    defaultVariants: { variant: 'elevated', padding: 'md', interactive: false },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  /** Cursor-following gradient border (the `.ds-reveal` material). */
  reveal?: boolean;
  /** Cursor-following glow wash (the `.ds-spotlight` material). */
  spotlight?: boolean;
  /** Faint fractal-noise grain overlay. */
  noise?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { className, variant, padding, interactive, reveal, spotlight, noise, onMouseMove, ...props },
    ref,
  ) => {
    // A spotlight/reveal card tracks the cursor into CSS vars.
    const tracked = useSpotlight<HTMLDivElement>();
    const usesTracking = reveal || spotlight;

    const setRef = (node: HTMLDivElement | null) => {
      (tracked.ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    return (
      <div
        ref={setRef}
        {...dsRoot}
        className={cn(
          cardVariants({ variant, padding, interactive }),
          reveal && 'ds-reveal',
          spotlight && 'ds-spotlight',
          noise && 'ds-noise',
          className,
        )}
        tabIndex={interactive ? 0 : undefined}
        onMouseMove={(e) => {
          if (usesTracking) tracked.onMouseMove(e);
          onMouseMove?.(e);
        }}
        {...props}
      />
    );
  },
);
Card.displayName = 'Card';

/* --- Composition slots ---------------------------------------------------- */

export const CardHeader: React.FC<
  React.HTMLAttributes<HTMLDivElement> & { action?: React.ReactNode }
> = ({ className, action, children, ...props }) => (
  <div className={cn('flex items-start justify-between gap-4', className)} {...props}>
    <div className="min-w-0 space-y-1">{children}</div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className, ...props }) => (
  <h3
    className={cn('text-ds-lg font-semibold leading-tight tracking-[-0.01em] text-ds-fg', className)}
    {...props}
  />
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className, ...props }) => (
  <p className={cn('text-ds-sm leading-relaxed text-ds-fg-muted', className)} {...props} />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('text-ds-base text-ds-fg', className)} {...props} />
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={cn('flex items-center justify-end gap-2 pt-1', className)} {...props} />
);

/* --- StatCard — a metric tile -------------------------------------------- */

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Signed change, e.g. "+12.4%" — colour follows `trend`. */
  delta?: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  delta,
  trend = 'flat',
  icon,
  className,
}) => (
  <Card variant="elevated" padding="md" spotlight className={cn('overflow-hidden', className)}>
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <div className="text-ds-xs font-medium uppercase tracking-[0.06em] text-ds-fg-subtle">
          {label}
        </div>
        <div className="text-ds-2xl font-semibold tracking-[-0.02em] text-ds-fg">
          {value}
        </div>
      </div>
      {icon && (
        <div className="flex size-9 items-center justify-center rounded-ds-md bg-ds-primary-soft text-ds-primary [&_svg]:size-4">
          {icon}
        </div>
      )}
    </div>
    {delta != null && (
      <div
        className={cn(
          'mt-2 inline-flex items-center gap-1 text-ds-xs font-medium',
          trend === 'up' && 'text-ds-success',
          trend === 'down' && 'text-ds-error',
          trend === 'flat' && 'text-ds-fg-subtle',
        )}
      >
        {trend === 'up' && <TrendingUp className="size-3.5" />}
        {trend === 'down' && <TrendingDown className="size-3.5" />}
        {delta}
      </div>
    )}
  </Card>
);

/* --- MediaCard — image-topped card --------------------------------------- */

export interface MediaCardProps {
  image: string;
  imageAlt?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Pills shown over the image (e.g. tags). */
  badges?: React.ReactNode;
  /** Footer content — meta, actions. */
  footer?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  image,
  imageAlt = '',
  title,
  description,
  badges,
  footer,
  onClick,
  className,
}) => (
  <Card
    variant="elevated"
    padding="none"
    interactive={!!onClick}
    reveal
    onClick={onClick}
    className={cn('overflow-hidden', className)}
  >
    <div className="relative aspect-[16/9] overflow-hidden bg-ds-surface-2">
      <img
        src={toWebviewMediaUrl(image)}
        alt={imageAlt}
        className="size-full object-cover transition-transform duration-ds-slow ease-ds-out-expo group-hover:scale-105"
        loading="lazy"
      />
      {badges && <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{badges}</div>}
    </div>
    <div className="space-y-1.5 p-5">
      <CardTitle>{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
      {footer && <div className="pt-2 text-ds-xs text-ds-fg-subtle">{footer}</div>}
    </div>
  </Card>
);

export { cardVariants };
