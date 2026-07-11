import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface ReactionPillProps {
  icon: LucideIcon;
  count: number;
  active?: boolean;
  onClick?: () => void;
  label?: string;  // a11y — what the reaction means
}

const ReactionPill: React.FC<ReactionPillProps> = ({
  icon: Icon,
  count,
  active = false,
  onClick,
  label,
}) => {
  const [localActive, setLocalActive] = useState(active);
  const [localCount, setLocalCount] = useState(count);

  const handleClick = () => {
    setLocalActive((prev) => {
      setLocalCount((c) => c + (prev ? -1 : 1));
      return !prev;
    });
    onClick?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-ds-xs',
        'transition-colors duration-150',
        localActive
          ? 'bg-ds-primary-soft ring-1 ring-ds-primary/40'
          : 'bg-ds-surface-2 hover:bg-ds-surface-3',
      )}
    >
      <Icon
        size={14}
        className={cn(
          'transition-colors',
          localActive ? 'text-ds-primary' : 'text-ds-fg-muted',
        )}
      />
      <span className="font-medium text-ds-fg-muted">{localCount}</span>
    </button>
  );
};

export default ReactionPill;
