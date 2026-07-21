import React from 'react';
import { LoaderCircle, ThumbsUp, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import Avatar from './Avatar';
import AuthProviderBadge from './AuthProviderBadge';
import Markdown from '../../ui/Markdown';
import { formatTimelineTime } from './commentTimeline';
import type { ArticleComment } from './types';

interface CommentItemProps {
  comment: ArticleComment;
  showTime: boolean;
  onLike: (commentId: string) => void | Promise<void>;
  isLikePending: (commentId: string) => boolean;
  onDelete?: (comment: ArticleComment) => void;
  isDeletePending?: (commentId: string) => boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  showTime,
  onLike,
  isLikePending,
  onDelete,
  isDeletePending = () => false,
}) => {
  const { language } = useLanguage();
  const pending = isLikePending(comment.id);
  const isCurrentVisitor = comment.canDelete;

  return (
    <article className="py-1.5">
      {showTime && (
        <time
          dateTime={comment.createdAt}
          className="mb-4 mt-2 block text-center text-[11px] font-medium tabular-nums text-ds-fg-subtle"
        >
          {formatTimelineTime(comment.createdAt, language)}
        </time>
      )}

      <div className={cn('flex items-start gap-2.5', isCurrentVisitor && 'flex-row-reverse')}>
        <Avatar
          name={comment.authorName}
          src={comment.avatarUrl}
          countryCode={comment.countryCode}
          size="md"
          className="rounded-ds-sm"
        />
        <div className={cn(
          'flex min-w-0 max-w-[min(76%,42rem)] flex-col',
          isCurrentVisitor ? 'items-end' : 'items-start',
        )}>
          <span className="mb-1 flex items-center gap-1 px-1 text-[11px] leading-4 text-ds-fg-subtle">
            {isCurrentVisitor ? (language === 'zh' ? '我' : 'Me') : (
              <>
                {comment.authorName}
                <AuthProviderBadge provider={comment.authProvider} className="size-3 shrink-0" />
              </>
            )}
          </span>
          <div className={cn(
            'min-w-12 px-3.5 py-2.5 text-ds-sm leading-6',
            isCurrentVisitor
              ? 'rounded-[10px_3px_10px_10px] bg-ds-chat-bubble text-ds-chat-bubble-fg'
              : 'rounded-[3px_10px_10px_10px] border border-ds-border/70 bg-ds-surface-1 text-ds-fg',
          )}>
            <Markdown className="[&>div]:my-0 [&_a]:break-words">
              {comment.content}
            </Markdown>
          </div>

          <div className={cn(
            'mt-1 flex flex-wrap items-center gap-0.5',
            isCurrentVisitor && 'flex-row-reverse',
          )}>
            <button
              type="button"
              onClick={() => void onLike(comment.id)}
              disabled={pending}
              aria-pressed={comment.likedByCurrentUser}
              aria-label={language === 'zh' ? '点赞这条评论' : 'Like this comment'}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[11px]',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-chat/50',
                comment.likedByCurrentUser
                  ? 'bg-ds-chat-soft text-ds-chat'
                  : 'text-ds-fg-subtle hover:bg-ds-surface-1 hover:text-ds-fg',
              )}
            >
              {pending
                ? <LoaderCircle className="size-3.5 animate-spin" />
                : <ThumbsUp className="size-3.5" />}
              {comment.likesCount > 0 ? comment.likesCount : language === 'zh' ? '赞' : 'Like'}
            </button>
            {comment.canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment)}
                disabled={isDeletePending(comment.id)}
                aria-label={language === 'zh' ? '删除这条评论' : 'Delete this comment'}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[11px] text-ds-fg-subtle transition-colors hover:bg-ds-error/10 hover:text-ds-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-error/40"
              >
                {isDeletePending(comment.id)
                  ? <LoaderCircle className="size-3.5 animate-spin" />
                  : <Trash2 className="size-3.5" />}
                {language === 'zh' ? '删除' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default CommentItem;
