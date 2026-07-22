import React, { useState } from 'react';
import { cn } from '../../../lib/utils';

interface AvatarProps {
  name: string;
  src?: string;
  countryCode?: string;
  visitorNumber?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

// Deterministic colour from name — same user always gets the same background.
const PALETTE = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500',
];

const hashIndex = (str: string): number => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
};

// First grapheme — handles CJK ("山药旦子" → "山") and Latin ("ideal" → "i").
const firstChar = (name: string): string => {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
};

const SIZE = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-9 w-9 text-sm',
} as const;

const Avatar: React.FC<AvatarProps> = ({ name, src, countryCode, visitorNumber, size = 'md', className }) => {
  const [flagFailed, setFlagFailed] = useState(false);

  if (!src && countryCode && !flagFailed) {
    return (
      <span className={cn('relative inline-flex shrink-0', SIZE[size], className)} title={name} aria-label={name}>
        <img
          src={`https://flagcdn.com/w80/${countryCode.toLowerCase()}.png`}
          alt=""
          className="h-full w-full rounded-[7px] border border-ds-border bg-white object-contain p-[1px]"
          loading="lazy"
          decoding="async"
          onError={() => setFlagFailed(true)}
        />
        {visitorNumber && (
          <span className="absolute bottom-0 right-0 flex min-w-[16px] items-center justify-center rounded-[5px] border border-ds-surface-1 bg-ds-fg px-0.5 font-mono text-[8px] font-semibold leading-[12px] tabular-nums text-ds-surface-1 shadow-sm">
            {visitorNumber}
          </span>
        )}
      </span>
    );
  }

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', SIZE[size], className)}
        loading="lazy"
      />
    );
  }
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium text-white',
        PALETTE[hashIndex(name)],
        SIZE[size],
        className,
      )}
      title={name}
      aria-label={name}
    >
      {firstChar(name)}
    </div>
  );
};

export default Avatar;
