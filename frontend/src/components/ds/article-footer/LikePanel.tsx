import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ThumbsUp, MoreHorizontal } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Avatar from './Avatar';
import type { MockLiker } from '../__mocks__/articleFooterMock';

interface LikePanelProps {
  likes: number;
  liked?: boolean;
  recentLikers?: MockLiker[];
  onLike?: () => void;
}

const LikePanel: React.FC<LikePanelProps> = ({
  likes,
  liked = false,
  recentLikers = [],
  onLike,
}) => {
  const [localLiked, setLocalLiked] = useState(liked);
  const [localCount, setLocalCount] = useState(likes);

  const handleClick = () => {
    setLocalLiked((prev) => {
      setLocalCount((c) => c + (prev ? -1 : 1));
      return !prev;
    });
    onLike?.();
  };

  return (
    <div className="flex flex-col items-center py-8">
      {/* Thumbs-up icon — outline by default, filled when liked. */}
      <motion.button
        type="button"
        onClick={handleClick}
        whileTap={{ scale: 1.3 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'group inline-flex items-center justify-center',
          'transition-colors duration-150',
        )}
        aria-label={localLiked ? 'Unlike' : 'Like'}
      >
        <ThumbsUp
          size={40}
          strokeWidth={1.5}
          className={cn(
            'transition-colors duration-150',
            localLiked
              ? 'fill-[#F5A623] text-[#F5A623]'
              : 'text-[#F5A623] group-hover:fill-[#F5A623]/20',
          )}
        />
      </motion.button>

      <div className="mt-3 text-ds-sm text-ds-fg-muted">
        {localCount.toLocaleString()} likes
      </div>

      {recentLikers.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {recentLikers.slice(0, 13).map((liker) => (
            <Avatar key={liker.name} name={liker.name} src={liker.avatar} size="lg" />
          ))}
          <button
            type="button"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full',
              'border border-ds-border bg-transparent text-ds-fg-subtle',
              'transition-colors hover:border-ds-fg-muted hover:text-ds-fg-muted',
            )}
            aria-label="View all likers"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default LikePanel;
