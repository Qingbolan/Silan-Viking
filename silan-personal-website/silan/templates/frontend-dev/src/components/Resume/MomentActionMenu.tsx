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
  commentsOpen: boolean;
  onLike: () => void;
  onComment: () => void;
}

const MomentActionMenu: React.FC<MomentActionMenuProps> = ({
  language,
  likes,
  comments,
  liked,
  likePending,
  commentsOpen,
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

  return (
    <div ref={rootRef} className="relative inline-flex shrink-0 items-center">
      <div className="pointer-events-none absolute right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2">
        <AnimatePresence>
          {open && (
            <motion.div
              role="menu"
              className="pointer-events-auto flex h-12 w-[15rem] items-stretch overflow-hidden rounded-[11px] border border-white/10 bg-[#242424] p-1 text-white shadow-[0_14px_36px_rgba(17,17,17,0.24),0_2px_8px_rgba(17,17,17,0.16)]"
              initial={{ opacity: 0, scale: 0.97, x: 5 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.97, x: 5 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                role="menuitem"
                disabled={likePending}
                onClick={() => select(onLike)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-[7px] px-3 text-ds-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45',
                  'disabled:cursor-wait disabled:opacity-50',
                  liked ? 'text-[#ff6b69]' : 'text-white/90 hover:bg-white/10 hover:text-white',
                )}
              >
                <Heart className="size-[18px]" fill={liked ? 'currentColor' : 'none'} />
                <span>{language === 'zh' ? '赞' : 'Like'}{likes > 0 ? ` ${likes}` : ''}</span>
              </button>
              <span className="my-2 w-px shrink-0 bg-white/15" aria-hidden />
              <button
                type="button"
                role="menuitem"
                onClick={() => select(onComment)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-[7px] px-3 text-ds-sm font-medium text-white/90 transition-colors',
                  'hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45',
                  commentsOpen && 'bg-white/10 text-white',
                )}
              >
                <MessageCircle className="size-[18px]" />
                <span>{language === 'zh' ? '评论' : 'Comment'}{comments > 0 ? ` ${comments}` : ''}</span>
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
          'inline-flex h-9 min-w-12 items-center justify-center gap-2 rounded-[9px] border border-transparent px-3',
          'bg-ds-surface-2 text-ds-fg-subtle transition-[background-color,border-color,color,box-shadow] duration-150',
          'hover:border-ds-border hover:bg-ds-surface-3 hover:text-ds-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/45',
          open && 'border-ds-border bg-ds-surface-3 text-ds-fg shadow-sm',
        )}
      >
        <span className="size-1.5 rounded-full bg-current" />
        <span className="size-1.5 rounded-full bg-current" />
      </button>
    </div>
  );
};

export default MomentActionMenu;
