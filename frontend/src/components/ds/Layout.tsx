// src/components/ds/Layout.tsx
//
// Design-system layout primitives — the default scaffolding every page
// should be built from, so spacing and max-widths stay consistent.
//
//   Container  — centers content at a max-width (content / reading / wide)
//   Section    — vertical rhythm block with standard top/bottom padding
//   Stack      — flex column/row with a token gap
//   PageHeader — title + description + actions, the canonical page intro
//   Divider    — hairline separator, horizontal or vertical
import React from 'react';
import { cn } from '../../lib/utils';

/* --- Container ------------------------------------------------------------ */

const containerWidths = {
  reading: 'max-w-[728px]',  // long-form prose
  content: 'max-w-[1120px]', // standard app content
  wide: 'max-w-[1320px]',    // dashboards / galleries
  full: 'max-w-none',
} as const;

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof containerWidths;
}

export const Container: React.FC<ContainerProps> = ({
  width = 'content',
  className,
  ...props
}) => (
  <div
    className={cn('mx-auto w-full  lg:px-8', containerWidths[width], className)}
    {...props}
  />
);

/* --- Section -------------------------------------------------------------- */

const sectionSpacing = {
  sm: 'py-6',
  md: 'py-10',
  lg: 'py-16',
} as const;

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  spacing?: keyof typeof sectionSpacing;
}

export const Section: React.FC<SectionProps> = ({
  spacing = 'md',
  className,
  ...props
}) => <section className={cn(sectionSpacing[spacing], className)} {...props} />;

/* --- Stack ---------------------------------------------------------------- */

const gapScale = {
  0: 'gap-0', 1: 'gap-1', 2: 'gap-2', 3: 'gap-3',
  4: 'gap-4', 5: 'gap-6', 6: 'gap-8', 7: 'gap-12',
} as const;

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'col';
  gap?: keyof typeof gapScale;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

export const Stack: React.FC<StackProps> = ({
  direction = 'col',
  gap = 4,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  className,
  ...props
}) => (
  <div
    className={cn(
      'flex',
      direction === 'col' ? 'flex-col' : 'flex-row',
      gapScale[gap],
      { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' }[align],
      { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between' }[justify],
      wrap && 'flex-wrap',
      className,
    )}
    {...props}
  />
);

/* --- PageHeader ----------------------------------------------------------- */

export interface PageHeaderProps {
  /** Small overline label above the title (e.g. section name). */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned actions (buttons, etc.). */
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  description,
  actions,
  className,
}) => (
  <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
    <div className="space-y-1.5">
      {eyebrow && (
        <div className="text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
          {eyebrow}
        </div>
      )}
      <h1 className="text-ds-3xl font-semibold tracking-[-0.02em] text-ds-fg">
        {title}
      </h1>
      {description && (
        <p className="max-w-2xl text-ds-base text-ds-fg-muted leading-relaxed">
          {description}
        </p>
      )}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

/* --- Divider -------------------------------------------------------------- */

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Optional centered label (horizontal only). */
  label?: React.ReactNode;
  className?: string;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  label,
  className,
}) => {
  if (orientation === 'vertical') {
    return <div className={cn('w-px self-stretch bg-ds-border', className)} role="separator" />;
  }
  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)} role="separator">
        <span className="h-px flex-1 bg-ds-border" />
        <span className="text-ds-2xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
          {label}
        </span>
        <span className="h-px flex-1 bg-ds-border" />
      </div>
    );
  }
  return <div className={cn('h-px w-full bg-ds-border', className)} role="separator" />;
};
