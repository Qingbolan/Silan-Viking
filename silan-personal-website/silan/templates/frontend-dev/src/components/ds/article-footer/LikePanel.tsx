import React from 'react';
import { motion } from 'framer-motion';
import { LoaderCircle, ThumbsUp } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';

interface LikePanelProps {
  likes: number;
  liked: boolean;
  pending?: boolean;
  onLike: () => void | Promise<void>;
}

const LikePanel: React.FC<LikePanelProps> = ({
  likes,
  liked,
  pending = false,
  onLike,
}) => {
  const { language } = useLanguage();

  return (
    <div className="flex flex-col items-center py-8">
      {/* Thumbs-up icon — outline by default, filled when liked. */}
      <motion.button
        type="button"
        onClick={() => void onLike()}
        disabled={pending}
        whileTap={{ scale: 1.3 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'group inline-flex items-center justify-center',
          'transition-colors duration-150',
        )}
        aria-label={
          liked
            ? language === 'zh' ? '取消点赞' : 'Unlike this article'
            : language === 'zh' ? '点赞' : 'Like this article'
        }
        aria-pressed={liked}
        aria-busy={pending}
      >
        {pending ? (
          <LoaderCircle size={40} strokeWidth={1.5} className="animate-spin text-ds-primary" />
        ) : (
          <ThumbsUp
            size={40}
            strokeWidth={1.5}
            className={cn(
              'transition-colors duration-150',
              liked
                ? 'fill-ds-primary text-ds-primary'
                : 'text-ds-primary group-hover:fill-ds-primary/15',
            )}
          />
        )}
      </motion.button>

      <div className="mt-3 text-ds-sm text-ds-fg-muted">
        {likes.toLocaleString()} {language === 'zh' ? '次点赞' : likes === 1 ? 'like' : 'likes'}
      </div>
    </div>
  );
};

export default LikePanel;
