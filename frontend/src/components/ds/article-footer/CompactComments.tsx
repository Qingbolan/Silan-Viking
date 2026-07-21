import React, { useEffect, useState } from 'react';
import { AlertCircle, LoaderCircle, MessageSquareText, Send, ThumbsUp, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import { useAuth } from '../../InteractiveContact';
import { useRequireIdentity } from '../../../lib/useRequireIdentity';
import { LoginPromptModal } from '../LoginPromptModal';
import { fetchVisitorCountryCode } from '../../../api/geo';
import { readCommenter } from '../../../lib/commenterIdentity';
import { dsRoot } from '../dsAttr';
import Avatar from './Avatar';
import AuthProviderBadge from './AuthProviderBadge';
import Markdown from '../../ui/Markdown';
import { formatTimelineTime } from './commentTimeline';
import type { ArticleComment, CommentDraft, CommentLoadState } from './types';

interface CompactCommentsProps {
  comments: ArticleComment[];
  state: CommentLoadState;
  error?: string;
  submitting?: boolean;
  onRetry: () => void | Promise<void>;
  onSubmit: (draft: CommentDraft) => void | Promise<void>;
  onCommentLike: (commentId: string) => void | Promise<void>;
  isCommentLikePending: (commentId: string) => boolean;
  onCommentDelete?: (commentId: string) => void | Promise<void>;
  isCommentDeletePending?: (commentId: string) => boolean;
  /** Cap the number of top-level comments shown before a "view all" expand.
   *  Omit for full-page contexts where every comment should render. */
  visibleCount?: number;
}

const Composer: React.FC<{
  autoFocus?: boolean;
  placeholder: string;
  submitting: boolean;
  onSubmit: (content: string) => void | Promise<void>;
  onCancel?: () => void;
}> = ({ autoFocus, placeholder, submitting, onSubmit, onCancel }) => {
  const { language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [identity] = useState(readCommenter);
  const [content, setContent] = useState('');
  const [visitorCountryCode, setVisitorCountryCode] = useState<string>();

  useEffect(() => {
    if (isAuthenticated) return;
    let active = true;
    void fetchVisitorCountryCode().then((code) => { if (active) setVisitorCountryCode(code); });
    return () => { active = false; };
  }, [isAuthenticated]);

  const composerName = isAuthenticated ? user?.username || '' : identity.authorName;
  const composerAvatar = isAuthenticated ? user?.avatar : undefined;
  const composerCountryCode = isAuthenticated ? undefined : visitorCountryCode;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const comment = content.trim();
    if (!comment) return;
    await onSubmit(comment);
    setContent('');
  };

  return (
    <form onSubmit={(event) => { void handleSubmit(event); }} className="flex items-start gap-2.5">
      <Avatar
        name={composerName || (language === 'zh' ? '访客' : 'Guest')}
        src={composerAvatar}
        countryCode={composerCountryCode}
        size="sm"
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-ds-border-strong bg-ds-surface-3 pl-4 pr-1.5 focus-within:border-ds-primary focus-within:shadow-[0_0_0_3px_var(--ds-color-ring)]">
        <input
          {...dsRoot}
          autoFocus={autoFocus}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && onCancel) onCancel();
          }}
          maxLength={4000}
          placeholder={placeholder}
          className="min-h-10 flex-1 bg-transparent text-ds-sm text-ds-fg outline-none placeholder:text-ds-fg-subtle"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          aria-label={language === 'zh' ? '发布评论' : 'Post comment'}
          className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/45',
            submitting || !content.trim()
              ? 'text-ds-fg-subtle'
              : 'text-ds-primary hover:bg-ds-primary/10',
          )}
        >
          {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </div>
    </form>
  );
};

const CommentRow: React.FC<{
  comment: ArticleComment;
  depth: number;
  language: 'en' | 'zh';
  onLike: (commentId: string) => void;
  isLikePending: (commentId: string) => boolean;
  onDelete?: (comment: ArticleComment) => void;
  isDeletePending: (commentId: string) => boolean;
  onReply: (comment: ArticleComment) => void;
  replyTargetId?: string;
  replySubmitting: boolean;
  onSubmitReply: (content: string) => void | Promise<void>;
  onCancelReply: () => void;
}> = ({
  comment,
  depth,
  language,
  onLike,
  isLikePending,
  onDelete,
  isDeletePending,
  onReply,
  replyTargetId,
  replySubmitting,
  onSubmitReply,
  onCancelReply,
}) => {
  const pending = isLikePending(comment.id);

  return (
    <div className={cn(depth > 0 && 'ml-10 border-l border-ds-border/60 pl-3')}>
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.authorName} src={comment.avatarUrl} countryCode={comment.countryCode} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="rounded-ds-md bg-ds-surface-2 px-3 py-2">
            <span className="mb-0.5 flex items-center gap-1 text-ds-xs font-semibold text-ds-fg">
              {comment.authorName}
              <AuthProviderBadge provider={comment.authProvider} className="size-3 shrink-0 text-ds-fg-subtle" />
            </span>
            <Markdown className="text-ds-sm text-ds-fg [&>div]:my-0 [&_a]:break-words">
              {comment.content}
            </Markdown>
          </div>
          <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-ds-fg-subtle">
            <span>{formatTimelineTime(comment.createdAt, language)}</span>
            <button
              type="button"
              onClick={() => onLike(comment.id)}
              disabled={pending}
              aria-pressed={comment.likedByCurrentUser}
              className={cn(
                'inline-flex items-center gap-1 font-medium transition-colors',
                comment.likedByCurrentUser ? 'text-ds-primary' : 'hover:text-ds-fg',
              )}
            >
              {pending ? <LoaderCircle className="size-3 animate-spin" /> : <ThumbsUp className="size-3" />}
              {comment.likesCount > 0 ? comment.likesCount : language === 'zh' ? '赞' : 'Like'}
            </button>
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="font-medium transition-colors hover:text-ds-fg"
            >
              {language === 'zh' ? '回复' : 'Reply'}
            </button>
            {comment.canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment)}
                disabled={isDeletePending(comment.id)}
                className="inline-flex items-center gap-1 font-medium text-ds-fg-subtle transition-colors hover:text-ds-error"
              >
                {isDeletePending(comment.id)
                  ? <LoaderCircle className="size-3 animate-spin" />
                  : <Trash2 className="size-3" />}
                {language === 'zh' ? '删除' : 'Delete'}
              </button>
            )}
          </div>

          {replyTargetId === comment.id && (
            <div className="mt-2">
              <Composer
                autoFocus
                placeholder={language === 'zh' ? `回复 ${comment.authorName}…` : `Reply to ${comment.authorName}…`}
                submitting={replySubmitting}
                onSubmit={onSubmitReply}
                onCancel={onCancelReply}
              />
            </div>
          )}

          {comment.replies.length > 0 && (
            <div className="mt-3 space-y-3">
              {comment.replies.map((reply) => (
                <CommentRow
                  key={reply.id}
                  comment={reply}
                  depth={depth + 1}
                  language={language}
                  onLike={onLike}
                  isLikePending={isLikePending}
                  onDelete={onDelete}
                  isDeletePending={isDeletePending}
                  onReply={onReply}
                  replyTargetId={replyTargetId}
                  replySubmitting={replySubmitting}
                  onSubmitReply={onSubmitReply}
                  onCancelReply={onCancelReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CompactComments: React.FC<CompactCommentsProps> = ({
  comments,
  state,
  error,
  submitting = false,
  onRetry,
  onSubmit,
  onCommentLike,
  isCommentLikePending,
  onCommentDelete,
  isCommentDeletePending = () => false,
  visibleCount,
}) => {
  const { language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [replyTarget, setReplyTarget] = useState<ArticleComment | null>(null);
  const { loginPromptOpen, requireIdentity, resolveLogin, closeLoginPrompt } =
    useRequireIdentity<() => void>();

  const visible = visibleCount === undefined || expanded ? comments : comments.slice(0, visibleCount);
  const hiddenCount = comments.length - visible.length;

  const submitDraft = async (content: string, parentId?: string) => {
    const identity = readCommenter();
    setFormError(undefined);
    try {
      await onSubmit({ authorName: identity.authorName, authorEmail: identity.authorEmail, content, parentId });
      if (parentId) setReplyTarget(null);
    } catch {
      setFormError(language === 'zh' ? '评论未能发布，请重试。' : 'The comment was not published. Please retry.');
    }
  };

  const gated = (run: () => void) => requireIdentity(run, (action) => action());

  return (
    <div className="space-y-3">
      <Composer
        placeholder={language === 'zh' ? '我说两句…' : 'Add a comment…'}
        submitting={submitting}
        onSubmit={(content) => gated(() => { void submitDraft(content); })}
      />
      {formError && (
        <p className="flex items-center gap-1.5 text-ds-xs text-red-600" role="alert">
          <AlertCircle className="size-3.5" />
          {formError}
        </p>
      )}

      {state === 'loading' && (
        <div className="space-y-3" aria-hidden>
          {[0, 1].map((item) => (
            <div key={item} className="flex animate-pulse gap-2.5">
              <div className="size-8 shrink-0 rounded-full bg-ds-surface-1" />
              <div className="h-10 w-3/5 rounded-ds-md bg-ds-surface-1" />
            </div>
          ))}
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center justify-between gap-3 text-ds-xs text-ds-fg-muted" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void onRetry()} className="font-medium text-ds-primary hover:underline">
            {language === 'zh' ? '重试' : 'Retry'}
          </button>
        </div>
      )}

      {state === 'ready' && comments.length === 0 && (
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <MessageSquareText className="size-5 text-ds-fg-subtle" />
          <p className="mt-2 text-ds-xs text-ds-fg-subtle">
            {language === 'zh' ? '还没有评论' : 'No comments yet'}
          </p>
        </div>
      )}

      {state === 'ready' && visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                depth={0}
                language={language as 'en' | 'zh'}
                onLike={(commentId) => gated(() => { void onCommentLike(commentId); })}
                isLikePending={isCommentLikePending}
                onDelete={onCommentDelete ? (target) => { void onCommentDelete(target.id); } : undefined}
                isDeletePending={isCommentDeletePending}
                onReply={(target) => gated(() => setReplyTarget(target))}
                replyTargetId={replyTarget?.id}
                replySubmitting={submitting}
                onSubmitReply={(content) => submitDraft(content, replyTarget?.id)}
                onCancelReply={() => setReplyTarget(null)}
              />
            </li>
          ))}
        </ul>
      )}

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-ds-xs font-medium text-ds-fg-subtle hover:text-ds-fg"
        >
          {language === 'zh' ? `查看全部 ${comments.length} 条评论` : `View all ${comments.length} comments`}
        </button>
      )}

      <LoginPromptModal
        open={loginPromptOpen}
        onClose={closeLoginPrompt}
        onResolved={() => resolveLogin((action) => action())}
      />
    </div>
  );
};

export default CompactComments;
