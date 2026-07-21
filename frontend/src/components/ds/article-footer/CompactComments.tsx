import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, LoaderCircle, Send, ThumbsUp } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import { useAuth } from '../../InteractiveContact';
import { fetchVisitorCountryCode } from '../../../api/geo';
import { readCommenter } from '../../../lib/commenterIdentity';
import { dsRoot } from '../dsAttr';
import Avatar from './Avatar';
import Markdown from '../../ui/Markdown';
import { buildCommentTimeline, formatTimelineTime } from './commentTimeline';
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
}

const VISIBLE_COUNT = 3;

const CompactComments: React.FC<CompactCommentsProps> = ({
  comments,
  state,
  error,
  submitting = false,
  onRetry,
  onSubmit,
  onCommentLike,
  isCommentLikePending,
}) => {
  const { language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  // The identity gate (LoginPromptModal) runs before this panel is ever
  // opened, so by the time it mounts there is either an authenticated
  // session or a saved guest name/email — read once rather than re-deriving
  // on every render.
  const [identity] = useState(readCommenter);
  const [content, setContent] = useState('');
  const [formError, setFormError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [visitorCountryCode, setVisitorCountryCode] = useState<string>();

  useEffect(() => {
    if (isAuthenticated) return;
    let active = true;
    void fetchVisitorCountryCode().then((code) => { if (active) setVisitorCountryCode(code); });
    return () => { active = false; };
  }, [isAuthenticated]);

  const timeline = useMemo(() => buildCommentTimeline(comments), [comments]);
  const visible = expanded ? timeline : timeline.slice(0, VISIBLE_COUNT);
  const hiddenCount = timeline.length - visible.length;

  const composerName = isAuthenticated ? user?.username || '' : identity.authorName;
  const composerAvatar = isAuthenticated ? user?.avatar : undefined;
  const composerCountryCode = isAuthenticated ? undefined : visitorCountryCode;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const authorName = isAuthenticated ? user?.username?.trim() ?? '' : identity.authorName.trim();
    const authorEmail = isAuthenticated ? user?.email?.trim() ?? '' : identity.authorEmail.trim();
    const comment = content.trim();
    if (!comment) return;

    if (!authorName || !authorEmail) {
      setFormError(language === 'zh' ? '请先登录或以访客身份继续。' : 'Sign in or continue as a guest first.');
      return;
    }

    setFormError(undefined);
    try {
      await onSubmit({ authorName, authorEmail, content: comment });
      setContent('');
    } catch {
      setFormError(language === 'zh' ? '评论未能发布，请重试。' : 'The comment was not published. Please retry.');
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(event) => { void handleSubmit(event); }} className="flex items-start gap-2.5">
        <Avatar
          name={composerName || (language === 'zh' ? '访客' : 'Guest')}
          src={composerAvatar}
          countryCode={composerCountryCode}
          size="sm"
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2 rounded-full border border-ds-border-strong bg-ds-surface-3 pl-4 pr-1.5 focus-within:border-ds-primary focus-within:shadow-[0_0_0_3px_var(--ds-color-ring)]">
            <input
              {...dsRoot}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={4000}
              placeholder={language === 'zh' ? '我说两句…' : 'Add a comment…'}
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
          {formError && (
            <p className="flex items-center gap-1.5 text-ds-xs text-red-600" role="alert">
              <AlertCircle className="size-3.5" />
              {formError}
            </p>
          )}
        </div>
      </form>

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

      {state === 'ready' && visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map(({ comment }) => {
            const pending = isCommentLikePending(comment.id);
            return (
              <li key={comment.id} className="flex items-start gap-2.5">
                <Avatar name={comment.authorName} src={comment.avatarUrl} countryCode={comment.countryCode} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="rounded-ds-md bg-ds-surface-2 px-3 py-2">
                    <span className="block text-ds-xs font-semibold text-ds-fg">{comment.authorName}</span>
                    <Markdown className="text-ds-sm text-ds-fg [&>div]:my-0 [&_a]:break-words">
                      {comment.content}
                    </Markdown>
                  </div>
                  <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-ds-fg-subtle">
                    <span>{formatTimelineTime(comment.createdAt, language)}</span>
                    <button
                      type="button"
                      onClick={() => void onCommentLike(comment.id)}
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-ds-xs font-medium text-ds-fg-subtle hover:text-ds-fg"
        >
          {language === 'zh' ? `查看全部 ${timeline.length} 条评论` : `View all ${timeline.length} comments`}
        </button>
      )}
    </div>
  );
};

export default CompactComments;
