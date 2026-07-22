import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, MessageCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MomentActionMenuProps {
  language: 'en' | 'zh';
  likes: number;
  comments: number;
  liked: boolean;
  likePending: boolean;
  composerOpen: boolean;
  onLike: () => void;
  onComment: () => void;
}

const MomentActionMenu: React.FC<MomentActionMenuProps> = ({
  language,
  likes,
  comments,
  liked,
  likePending,
  composerOpen,
  onLike,
  onComment,
}) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const select = (action: () => void) => {
    action();
    setOpen(false);
  };
  const likeLabel = language === 'zh' ? `点赞，${likes} 个赞` : `Like, ${likes} likes`;
  const commentLabel = language === 'zh' ? `评论，${comments} 条评论` : `Comment, ${comments} comments`;
  const likeText = likes > 0 ? String(likes) : language === 'zh' ? '赞' : 'Like';
  const commentText = comments > 0 ? String(comments) : language === 'zh' ? '评论' : 'Comment';

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 items-center">
      <div className="pointer-events-none absolute right-[calc(100%+0.375rem)] top-1/2 -translate-y-1/2">
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              className="pointer-events-auto inline-flex h-8 items-stretch overflow-hidden rounded-[4px] border border-white/10 bg-[#242424] p-px text-white shadow-[0_10px_26px_rgba(17,17,17,0.22),0_2px_7px_rgba(17,17,17,0.14)]"
              initial={{ opacity: 0, scale: 0.97, x: 5 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.97, x: 5 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={likePending}
                aria-label={likeLabel}
                onClick={() => select(onLike)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-[3px] px-2.5 text-ds-xs font-semibold tabular-nums transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45',
                  'disabled:cursor-wait disabled:opacity-50',
                  liked ? 'text-[#ff6b69]' : 'text-white/90 hover:bg-white/10 hover:text-white',
                )}
              >
                <Heart className="size-[15px]" strokeWidth={2.2} fill={liked ? 'currentColor' : 'none'} />
                <span>{likeText}</span>
              </button>
              <span className="my-1 w-px shrink-0 bg-white/15" aria-hidden />
              <button
                type="button"
                role="menuitem"
                aria-label={commentLabel}
                onClick={() => select(onComment)}
                className={cn(
                  'inline-flex items-center justify-center gap-1.5 rounded-[3px] px-2.5 text-ds-xs font-semibold tabular-nums text-white/90 transition-colors',
                  'hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45',
                  composerOpen && 'bg-white/10 text-white',
                )}
              >
                <MessageCircle className="size-[15px]" strokeWidth={2.2} />
                <span>{commentText}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        aria-label={language === 'zh' ? '显示互动工具' : 'Show interaction tools'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex h-7 min-w-9 items-center justify-center gap-1.5 rounded-[4px] border border-transparent px-2',
          'bg-ds-surface-2 text-ds-fg-subtle transition-[background-color,border-color,color,box-shadow] duration-150',
          'hover:border-ds-border hover:bg-ds-surface-3 hover:text-ds-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/45',
          open && 'border-ds-border bg-ds-surface-3 text-ds-fg shadow-sm',
        )}
      >
        <span className="size-[5px] rounded-full bg-current" />
        <span className="size-[5px] rounded-full bg-current" />
      </button>
    </div>
  );
};

export default MomentActionMenu;
