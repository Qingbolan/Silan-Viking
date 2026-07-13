import React from 'react';
import { cn } from '../../../lib/utils';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
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
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-9 w-9 text-sm',
} as const;

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', className }) => {
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
