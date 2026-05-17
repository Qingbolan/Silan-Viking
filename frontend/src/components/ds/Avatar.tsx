// src/components/ds/Avatar.tsx
//
// Design-system Avatar — image with graceful fallback to initials.
// Falls back automatically if `src` is missing or fails to load.
import React from 'react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

const sizeMap = {
  xs: 'size-6 text-ds-2xs',
  sm: 'size-8 text-ds-xs',
  md: 'size-10 text-ds-sm',
  lg: 'size-14 text-ds-md',
  xl: 'size-20 text-ds-xl',
} as const;

export interface AvatarProps {
  src?: string;
  /** Full name — used for the alt text and the initials fallback. */
  name: string;
  size?: keyof typeof sizeMap;
  /** Render a square (rounded) avatar instead of a circle. */
  square?: boolean;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  square = false,
  className,
}) => {
  const [failed, setFailed] = React.useState(false);
  const showImage = src && !failed;

  return (
    <span
      {...dsRoot}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden',
        'bg-ds-primary-soft font-semibold text-ds-primary ds-hairline',
        square ? 'rounded-ds-md' : 'rounded-full',
        sizeMap[size],
        className,
      )}
      role="img"
      aria-label={name}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
};
