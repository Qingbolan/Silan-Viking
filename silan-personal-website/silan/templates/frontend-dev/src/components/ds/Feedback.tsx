// src/components/ds/Feedback.tsx
//
// Design-system feedback primitives — Skeleton, Spinner, Alert, EmptyState.
// These cover the loading / inline-message / no-content states so every
// page handles them the same way.
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Info, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

/* --- Skeleton ------------------------------------------------------------- */

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Convenience shape presets. */
  shape?: 'line' | 'block' | 'circle';
}

/** Shimmering placeholder. Size it with width/height utilities via className. */
export const Skeleton: React.FC<SkeletonProps> = ({ shape = 'line', className, ...props }) => (
  <div
    className={cn(
      'ds-skeleton',
      shape === 'line' && 'h-3 w-full rounded-ds-sm',
      shape === 'block' && 'h-24 w-full rounded-ds-md',
      shape === 'circle' && 'size-10 rounded-full',
      className,
    )}
    aria-hidden
    {...props}
  />
);

/* --- Spinner -------------------------------------------------------------- */

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Accessible label for screen readers. */
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className, label = 'Loading' }) => (
  <Loader2
    role="status"
    aria-label={label}
    className={cn(
      'animate-spin text-ds-primary',
      { sm: 'size-4', md: 'size-6', lg: 'size-9' }[size],
      className,
    )}
  />
);

/* --- Alert ---------------------------------------------------------------- */

const alertVariants = cva(
  'flex items-start gap-3 rounded-ds-md p-3.5 text-ds-sm border',
  {
    variants: {
      tone: {
        info: 'bg-ds-primary-soft text-ds-fg border-transparent',
        success: 'bg-ds-success-soft text-ds-fg border-transparent',
        warning: 'bg-ds-warning-soft text-ds-fg border-transparent',
        error: 'bg-ds-error-soft text-ds-fg border-transparent',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

const alertIcon = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const alertIconColor = {
  info: 'text-ds-primary',
  success: 'text-ds-success',
  warning: 'text-ds-warning',
  error: 'text-ds-error',
} as const;

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  tone = 'info',
  title,
  className,
  children,
  ...props
}) => {
  const Icon = alertIcon[tone!];
  return (
    <div role="alert" {...dsRoot} className={cn(alertVariants({ tone }), className)} {...props}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', alertIconColor[tone!])} aria-hidden />
      <div className="space-y-0.5">
        {title && <div className="font-semibold text-ds-fg">{title}</div>}
        {children && <div className="text-ds-fg-muted leading-relaxed">{children}</div>}
      </div>
    </div>
  );
};

/* --- EmptyState ----------------------------------------------------------- */

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/** Centered placeholder for "no results" / "nothing here yet" surfaces. */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center gap-3 rounded-ds-lg px-6 py-12 text-center',
      className,
    )}
  >
    {icon && (
      <div className="flex size-12 items-center justify-center rounded-full bg-ds-surface-2 text-ds-fg-subtle [&_svg]:size-6">
        {icon}
      </div>
    )}
    <div className="space-y-1">
      <div className="text-ds-base font-semibold text-ds-fg">{title}</div>
      {description && (
        <p className="max-w-sm text-ds-sm text-ds-fg-muted">{description}</p>
      )}
    </div>
    {action && <div className="pt-1">{action}</div>}
  </div>
);
