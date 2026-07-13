import React from 'react';
import { LoaderCircle, ThumbsUp, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import Avatar from './Avatar';
import Markdown from '../../ui/Markdown';
import type { ArticleComment } from './types';

interface CommentItemProps {
  comment: ArticleComment;
  isReply?: boolean;
  topLevel?: boolean;  // top-level comments get a border-top divider
  onLike: (commentId: string) => void | Promise<void>;
  isLikePending: (commentId: string) => boolean;
  onDelete?: (comment: ArticleComment) => void;
  isDeletePending?: (commentId: string) => boolean;
}

const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  isReply = false,
  topLevel = false,
  onLike,
  isLikePending,
  onDelete,
  isDeletePending = () => false,
}) => {
  const { language } = useLanguage();
  const avatarSize = isReply ? 'sm' : 'md';
  const pending = isLikePending(comment.id);
  const formattedDate = (() => {
    const date = new Date(comment.createdAt);
    if (Number.isNaN(date.getTime())) return comment.createdAt;
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  })();

  return (
    <div className={cn(
      'flex gap-3',
      topLevel && 'border-t border-ds-border pt-6 first:border-t-0 first:pt-0',
      isReply ? 'pt-4' : 'pb-6',
    )}>
      <Avatar name={comment.authorName} src={comment.avatarUrl} size={avatarSize} />
      <div className="min-w-0 flex-1">
        {/* Header — username · (optional ▶ replyTo) · timestamp · ipRegion */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={cn(
            'font-medium text-ds-fg',
            isReply ? 'text-ds-sm' : 'text-ds-sm',
          )}>
            {comment.authorName}
          </span>
          <span className="text-ds-xs text-ds-fg-subtle">
            {formattedDate}
          </span>
        </div>

        {/* Body */}
        <Markdown className={cn(
          'mt-2 leading-[1.75] text-ds-fg',
          isReply ? 'text-ds-sm' : 'text-ds-base',
          '[&>div]:my-0',
        )}>
          {comment.content}
        </Markdown>

        <div className="mt-3 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => void onLike(comment.id)}
            disabled={pending}
            aria-pressed={comment.likedByCurrentUser}
            aria-label={language === 'zh' ? '点赞这条评论' : 'Like this comment'}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-ds-xs',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/50',
              comment.likedByCurrentUser
                ? 'bg-ds-primary/10 text-ds-primary'
                : 'text-ds-fg-subtle hover:bg-ds-surface-2 hover:text-ds-fg',
            )}
          >
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <ThumbsUp className="size-3.5" />}
            {comment.likesCount > 0 ? comment.likesCount : language === 'zh' ? '赞' : 'Like'}
          </button>
          {comment.canDelete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              disabled={isDeletePending(comment.id)}
              aria-label={language === 'zh' ? '删除这条评论' : 'Delete this comment'}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-ds-xs text-ds-fg-subtle transition-colors hover:bg-ds-error/10 hover:text-ds-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-error/40"
            >
              {isDeletePending(comment.id) ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              {language === 'zh' ? '删除' : 'Delete'}
            </button>
          )}
        </div>

        {/* Nested replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-0">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                isReply
                onLike={onLike}
                isLikePending={isLikePending}
                onDelete={onDelete}
                isDeletePending={isDeletePending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentItem;
