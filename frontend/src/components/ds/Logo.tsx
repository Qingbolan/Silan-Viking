// src/components/ds/Logo.tsx
//
// Design-system brand mark — Silan's circular portrait inside a NUS-orange
// ring. Three variants:
//
//   <Logo />                     full lockup — portrait + "Silan" wordmark
//   <Logo variant="mark" />      portrait only
//   <Logo variant="wordmark" />  text only
//
// `animated` turns the static ring into a sweeping NUS-orange progress arc
// (the portrait itself stays still) — used by the BrandLoading screen.
import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { publicAssetUrl } from '../../utils/publicAsset';

type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
type LogoVariant = 'mark' | 'wordmark' | 'full';

const SIZE_PX: Record<Exclude<LogoSize, number>, number> = {
  xs: 18,
  sm: 24,
  md: 32,
  lg: 44,
  xl: 64,
};

/** Portrait source — the same circular avatar used in the app chrome. */
const PORTRAIT_SRC = publicAssetUrl('/image.png');

/* --- LogoMark — the circular portrait + ring ----------------------------- */

export interface LogoMarkProps {
  size?: LogoSize;
  /** Replace the static ring with a sweeping NUS-orange progress arc. */
  animated?: boolean;
  className?: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({
  size = 'md',
  animated = false,
  className,
}) => {
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const [failed, setFailed] = React.useState(false);

  // Geometry: the ring is an SVG stroke; the portrait is inset so it sits
  // just inside the ring with a hairline gap.
  const stroke = Math.max(2, Math.round(px * 0.07));
  const gap = Math.max(1.5, px * 0.04);
  const ringR = (px - stroke) / 2;
  const inset = stroke + gap;
  const portrait = px - inset * 2;
  const C = 2 * Math.PI * ringR;
  const gradId = React.useId().replace(/:/g, '');

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: px, height: px }}
      aria-hidden
    >
      {/* Ring — static brand stroke, or a sweeping progress arc. */}
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        fill="none"
        className="absolute inset-0"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--ds-color-primary)" />
            <stop offset="100%" stopColor="var(--ds-color-accent)" />
          </linearGradient>
        </defs>
        {animated ? (
          <>
            {/* Faint track. */}
            <circle
              cx={px / 2}
              cy={px / 2}
              r={ringR}
              stroke="var(--ds-color-border)"
              strokeWidth={stroke}
            />
            {/* Sweeping arc — rotates around the portrait. */}
            <motion.circle
              cx={px / 2}
              cy={px / 2}
              r={ringR}
              stroke={`url(#${gradId})`}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${C * 0.28} ${C * 0.72}`}
              style={{ transformOrigin: 'center' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }}
            />
          </>
        ) : (
          <circle
            cx={px / 2}
            cy={px / 2}
            r={ringR}
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
          />
        )}
      </svg>

      {/* Circular portrait, inset within the ring. */}
      <span
        className="overflow-hidden rounded-full bg-ds-surface-2"
        style={{ width: portrait, height: portrait }}
      >
        {!failed ? (
          <img
            src={PORTRAIT_SRC}
            alt=""
            width={portrait}
            height={portrait}
            draggable={false}
            onError={() => setFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          // Fallback when the portrait is missing — a monogram on the wash.
          <span className="flex size-full items-center justify-center bg-ds-primary-soft font-semibold text-ds-primary">
            S
          </span>
        )}
      </span>
    </span>
  );
};

/* --- Logo — portrait + wordmark lockup ----------------------------------- */

export interface LogoProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: LogoSize;
  variant?: LogoVariant;
  /** Sweeping ring animation on the mark. */
  animated?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  variant = 'full',
  animated = false,
  className,
  ...rest
}) => {
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const textClass =
    px >= 56 ? 'text-ds-2xl'
    : px >= 40 ? 'text-ds-xl'
    : px >= 30 ? 'text-ds-lg'
    : 'text-ds-base';

  return (
    <span
      className={cn('inline-flex select-none items-center gap-2.5', className)}
      aria-label="Silan"
      {...rest}
    >
      {variant !== 'wordmark' && <LogoMark size={px} animated={animated} />}
      {variant !== 'mark' && (
        <span
          className={cn(
            'font-semibold leading-none tracking-[-0.02em] text-ds-fg',
            textClass,
          )}
        >
          Silan
        </span>
      )}
    </span>
  );
};
