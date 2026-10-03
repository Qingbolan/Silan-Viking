import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, LoaderCircle, MessageSquareText, Send, ThumbsUp, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useLanguage } from '../../LanguageContext';
import { useAuth } from '../../InteractiveContact';
import { useCommenterIdentity } from '../../../lib/useCommenterIdentity';
import { dsRoot } from '../dsAttr';
import { GuestIdentityEditor } from '../GuestIdentityEditor';
import Avatar from './Avatar';
import AuthProviderBadge from './AuthProviderBadge';
import Markdown from '../../ui/Markdown';
import { formatTimelineTime } from './commentTimeline';
import type { ArticleComment, CommentDraft, CommentLoadState } from './types';
import { publicDisplayName } from '../../../lib/publicIdentity';
import { canonicalInternalPath } from '../../../utils/navigation';

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
  /** Where the new-comment composer renders relative to the list — 'top'
   *  (default) for feed-style panels, 'bottom' for a chat-like sidebar where
   *  the list scrolls above a pinned input. */
  composerPosition?: 'top' | 'bottom' | 'sticky-bottom';
  /** Allows parent action bars to reveal the composer without hiding comments. */
  composerVisible?: boolean;
  surface?: 'default' | 'sidebar';
  labels?: {
    placeholder?: string;
    postAria?: string;
    empty?: string;
    count?: (count: number) => string;
    viewAll?: (count: number) => string;
  };
}

const Composer: React.FC<{
  placeholder: string;
  postAria: string;
  submitting: boolean;
  surface?: 'default' | 'sidebar';
  onSubmit: (content: string, authorName: string) => void | Promise<void>;
  onIdentityMerged: () => void | Promise<void>;
  onIdentityMergeError: () => void;
}> = ({
  placeholder,
  postAria,
  submitting,
  surface = 'default',
  onSubmit,
  onIdentityMerged,
  onIdentityMergeError,
}) => {
  const { language } = useLanguage();
  const { user, isAuthenticated, githubAvailable, loginWithGitHub, mergeGuestIdentity } = useAuth();
  const { commenter, setAuthorName } = useCommenterIdentity();
  const [content, setContent] = useState('');
  const [identityMergePending, setIdentityMergePending] = useState(false);
  const [signInPending, setSignInPending] = useState(false);
  const [identityApplied, setIdentityApplied] = useState(false);

  const composerName = isAuthenticated ? user?.username || '' : commenter.authorName;
  const composerAvatar = isAuthenticated ? user?.avatar : undefined;
  const composerCountryCode = isAuthenticated || commenter.countryCode === 'XX'
    ? undefined
    : commenter.countryCode;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const comment = content.trim();
    if (!comment || submitting) return;
    try {
      await onSubmit(comment, composerName);
      setContent('');
    } catch {
      // The discussion owns the inline error; retain the draft for retry.
    }
  };

  const handleUseSignedInIdentity = async () => {
    if (!isAuthenticated || !user || identityMergePending) return;
    setIdentityMergePending(true);
    try {
      const result = await mergeGuestIdentity();
      setAuthorName(result.user.username);
      setIdentityApplied(true);
      await onIdentityMerged();
    } catch {
      onIdentityMergeError();
    } finally {
      setIdentityMergePending(false);
    }
  };

  const handleSignInAndUseIdentity = async () => {
    if (!githubAvailable || signInPending) return;
    setSignInPending(true);
    try {
      const signedIn = await loginWithGitHub();
      if (!signedIn) {
        onIdentityMergeError();
        return;
      }
      const result = await mergeGuestIdentity();
      setAuthorName(result.user.username);
      setIdentityApplied(true);
      await onIdentityMerged();
    } catch {
      onIdentityMergeError();
    } finally {
      setSignInPending(false);
    }
  };

  const composerAvatarNode = (
    <Avatar
      name={composerName || (language === 'zh' ? '访客' : 'Guest')}
      src={composerAvatar}
      countryCode={composerCountryCode}
      size="sm"
      className="size-7 rounded-[6px]"
    />
  );

  return (
    <div className="moment-comment-composer space-y-1.5">
      <GuestIdentityEditor
        name={commenter.authorName}
        onChange={setAuthorName}
        signedInName={isAuthenticated && !identityApplied ? user?.username : undefined}
        signedInAvatar={isAuthenticated && !identityApplied ? user?.avatar : undefined}
        onUseSignedIn={isAuthenticated && !identityApplied ? handleUseSignedInIdentity : undefined}
        useSignedInPending={identityMergePending}
        onSignIn={!isAuthenticated && githubAvailable ? handleSignInAndUseIdentity : undefined}
        signInPending={signInPending}
      />
      <form
        onSubmit={(event) => { void handleSubmit(event); }}
        className={cn('flex items-center', surface === 'sidebar' ? 'gap-0' : 'gap-2.5')}
      >
        {surface !== 'sidebar' && composerAvatarNode}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-full',
            surface === 'sidebar'
              ? 'min-h-12 border border-ds-border bg-ds-surface-1 px-2 shadow-ds-1'
              : 'bg-ds-surface-3 pl-4 pr-1.5',
          )}
        >
          {surface === 'sidebar' && composerAvatarNode}
          <input
            {...dsRoot}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={4000}
            placeholder={placeholder}
            className={cn(
              'moment-comment-input min-h-10 flex-1 bg-transparent text-ds-sm text-ds-fg outline-none placeholder:text-ds-fg-subtle',
              surface === 'sidebar' && 'min-w-0 text-ds-base',
            )}
          />
          <button
            type="submit"
            disabled={submitting || !content.trim()}
            aria-label={postAria}
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/45',
              submitting || !content.trim()
                ? 'text-ds-fg-subtle'
                : surface === 'sidebar'
                ? 'bg-ds-primary text-ds-primary-fg shadow-ds-1 hover:bg-ds-primary-hover'
                : 'text-ds-primary hover:bg-ds-primary/10',
            )}
          >
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </div>
      </form>
    </div>
  );
};

// A single row in the Xiaohongshu-style comment list: avatar, author, content,
// with metadata and actions sharing the first line. Replies use the same row
// with an inline "Reply to name:" prefix; the list owns their indentation.
const CommentRow: React.FC<{
  comment: ArticleComment;
  replyToName?: string;
  surface?: 'default' | 'sidebar';
  language: 'en' | 'zh';
  onLike: (commentId: string) => void;
  isLikePending: (commentId: string) => boolean;
  onDelete?: (comment: ArticleComment) => void;
  isDeletePending: (commentId: string) => boolean;
  onReply: (comment: ArticleComment) => void;
}> = ({
  comment,
  replyToName,
  surface = 'default',
  language,
  onLike,
  isLikePending,
  onDelete,
  isDeletePending,
  onReply,
}) => {
  const pending = isLikePending(comment.id);
  const sidebar = surface === 'sidebar';
  const ipRegion = commentIpRegion(comment, language);
  const authorName = publicDisplayName(comment.authorName, comment.visitorNumber, language);
  const replyName = replyToName ? publicDisplayName(replyToName, undefined, language) : undefined;
  const actorPath = comment.actorId
    ? canonicalInternalPath(`/people/${encodeURIComponent(comment.actorId)}`)
    : undefined;
  const avatar = (
    <Avatar
      name={comment.authorName}
      src={comment.avatarUrl}
      countryCode={comment.countryCode}
      visitorNumber={comment.visitorNumber}
      size="sm"
      className="size-7 rounded-[6px]"
    />
  );

  return (
    <div className="flex items-start gap-2.5">
      {actorPath ? (
        <Link
          to={actorPath}
          aria-label={language === 'zh' ? `查看${authorName}的资料` : `View ${authorName}'s profile`}
          className="shrink-0 rounded-[6px] transition-opacity hover:opacity-80 focus-visible:shadow-ds-focus"
        >
          {avatar}
        </Link>
      ) : avatar}
      <div className="min-w-0 flex-1">
        <div className="flex min-h-7 min-w-0 items-center justify-between gap-2">
          <div className={cn(
            'moment-comment-author flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap font-medium text-ds-fg-muted',
            sidebar ? 'text-ds-sm' : 'text-ds-base',
          )}>
            {actorPath ? (
              <Link
                to={actorPath}
                className="truncate rounded-ds-xs transition-colors hover:text-ds-primary hover:underline focus-visible:shadow-ds-focus"
              >
                {authorName}
              </Link>
            ) : <span className="truncate">{authorName}</span>}
            <AuthProviderBadge provider={comment.authProvider} className="size-3 shrink-0 text-ds-fg-subtle" />
            {ipRegion && <span className="moment-comment-meta shrink-0 text-ds-fg-subtle">{ipRegion}</span>}
            <time className="moment-comment-meta shrink-0 text-ds-fg-subtle" dateTime={comment.createdAt}>
              {formatTimelineTime(comment.createdAt, language)}
            </time>
          </div>

          <div className="moment-comment-actions flex shrink-0 items-center gap-1 font-medium text-ds-fg-muted">
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="inline-flex min-h-7 items-center rounded-ds-xs px-1.5 transition-colors hover:text-ds-fg focus-visible:shadow-ds-focus"
            >
              {language === 'zh' ? '回复' : 'Reply'}
            </button>
            <button
              type="button"
              onClick={() => onLike(comment.id)}
              disabled={pending}
              aria-label={language === 'zh' ? '赞' : 'Like'}
              aria-pressed={comment.likedByCurrentUser}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-ds-xs transition-colors focus-visible:shadow-ds-focus',
                comment.likedByCurrentUser ? 'text-ds-primary' : 'hover:text-ds-fg',
              )}
            >
              {pending
                ? <LoaderCircle className="size-4 animate-spin" />
                : <ThumbsUp className="size-[17px]" fill={comment.likedByCurrentUser ? 'currentColor' : 'none'} />}
            </button>
            {comment.canDelete && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment)}
                disabled={isDeletePending(comment.id)}
                aria-label={language === 'zh' ? '删除' : 'Delete'}
                className="inline-flex size-7 items-center justify-center rounded-ds-xs text-ds-fg-subtle transition-colors hover:text-ds-error focus-visible:shadow-ds-focus"
              >
                {isDeletePending(comment.id)
                  ? <LoaderCircle className="size-3 animate-spin" />
                  : <Trash2 className="size-3.5" />}
              </button>
            )}
          </div>
        </div>
        <div className={cn('moment-comment-body mt-0.5 text-ds-fg', sidebar ? 'text-ds-base' : 'text-ds-md')}>
          {replyName && (
            <span className="mr-1 text-ds-fg-subtle">
              {language === 'zh' ? '回复 ' : 'Reply to '}
              <span className="font-medium text-ds-fg-muted">{replyName}</span>
              {language === 'zh' ? '：' : ': '}
            </span>
          )}
          <Markdown inline richLinks={false} className="comment-markdown">
            {comment.content}
          </Markdown>
        </div>
      </div>
    </div>
  );
};

const countryRegionName = (countryCode: string | undefined, language: 'en' | 'zh'): string | undefined => {
  if (!countryCode) return undefined;
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return normalized;
  try {
    return new Intl.DisplayNames([language === 'zh' ? 'zh-CN' : 'en'], { type: 'region' }).of(normalized) || normalized;
  } catch {
    return normalized;
  }
};

const commentIpRegion = (comment: ArticleComment, language: 'en' | 'zh'): string | undefined =>
  comment.ipRegion || countryRegionName(comment.countryCode, language);

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
  composerPosition = 'top',
  composerVisible = true,
  surface = 'default',
  labels,
}) => {
  const { language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [replyTarget, setReplyTarget] = useState<ArticleComment | null>(null);

  const visibleThreads = visibleCount === undefined || expanded ? comments : comments.slice(0, visibleCount);
  const hiddenCount = comments.length - visibleThreads.length;
  const showComposer = composerVisible || Boolean(replyTarget);
  const replyTargetName = replyTarget
    ? publicDisplayName(replyTarget.authorName, replyTarget.visitorNumber, language as 'en' | 'zh')
    : undefined;

  const submitDraft = async (content: string, authorName: string, parentId?: string) => {
    setFormError(undefined);
    try {
      await onSubmit({ authorName, content, parentId });
      setReplyTarget(null);
    } catch (error) {
      setFormError(language === 'zh' ? '评论未能发布，请重试。' : 'The comment was not published. Please retry.');
      throw error;
    }
  };

  const renderCommentRow = (
    comment: ArticleComment,
    options: { replyToName?: string } = {},
  ) => (
      <CommentRow
        comment={comment}
        replyToName={options.replyToName}
        surface={surface}
        language={language as 'en' | 'zh'}
      onLike={(commentId) => { void onCommentLike(commentId); }}
      isLikePending={isCommentLikePending}
      onDelete={onCommentDelete ? (target) => { void onCommentDelete(target.id); } : undefined}
      isDeletePending={isCommentDeletePending}
      onReply={setReplyTarget}
    />
  );

  const renderReplies = (replies: ArticleComment[], parentName: string): React.ReactNode =>
    replies.map((reply) => (
      <li key={reply.id}>
        {renderCommentRow(reply, { replyToName: parentName })}
        {reply.replies.length > 0 && (
          <ul className="mt-4 space-y-4">
            {renderReplies(reply.replies, reply.authorName)}
          </ul>
        )}
      </li>
    ));

  const replyBanner = replyTarget && (
    <div className="flex items-center justify-between gap-2 rounded-ds-sm bg-ds-surface-2 px-3 py-1.5 text-ds-xs text-ds-fg-subtle">
      <span>{language === 'zh' ? `回复 ${replyTargetName}` : `Replying to ${replyTargetName}`}</span>
      <button type="button" onClick={() => setReplyTarget(null)} className="font-medium hover:text-ds-fg">
        {language === 'zh' ? '取消' : 'Cancel'}
      </button>
    </div>
  );

  const composer = (
    <div className="space-y-1.5">
      {replyBanner}
      <Composer
        placeholder={
          labels?.placeholder && !replyTarget
            ? labels.placeholder
            : replyTarget
            ? language === 'zh' ? `回复 ${replyTargetName}…` : `Reply to ${replyTargetName}…`
            : language === 'zh' ? '说点什么…' : 'Add a comment…'
        }
        postAria={labels?.postAria || (language === 'zh' ? '发布评论' : 'Post comment')}
        submitting={submitting}
        surface={surface}
        onSubmit={(content, authorName) => submitDraft(content, authorName, replyTarget?.id)}
        onIdentityMerged={() => onRetry()}
        onIdentityMergeError={() => setFormError(
          language === 'zh'
            ? '登录身份归并失败，请稍后重试。'
            : 'The signed-in identity could not be applied. Please retry.',
        )}
      />
    </div>
  );

  const list = (
    <div className="space-y-4">
      {formError && (
        <p className="flex items-center gap-1.5 text-ds-xs text-red-600" role="alert">
          <AlertCircle className="size-3.5" />
          {formError}
        </p>
      )}

      {state === 'loading' && (
        <div className="space-y-5" aria-hidden>
          {[0, 1].map((item) => (
            <div key={item} className="flex animate-pulse gap-2.5">
              <div className="size-7 shrink-0 rounded-[6px] bg-ds-surface-1" />
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
            {labels?.empty || (language === 'zh' ? '还没有评论' : 'No comments yet')}
          </p>
        </div>
      )}

      {state === 'ready' && comments.length > 0 && (
        <ul className="space-y-5">
          {visibleThreads.map((root) => (
            <li key={root.id}>
              {renderCommentRow(root)}
              {root.replies.length > 0 && (
                <ul className="mt-4 space-y-4 pl-10">
                  {renderReplies(root.replies, root.authorName)}
                </ul>
              )}
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
          {language === 'zh' ? '查看全部评论' : 'View all comments'}
        </button>
      )}
    </div>
  );

  if (composerPosition === 'bottom') {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className={cn(
          'compact-comments-scroll min-h-0 flex-1 overflow-y-auto',
          surface === 'sidebar' ? 'pb-4 pr-1' : 'pb-3',
        )}>
          {list}
        </div>
        {showComposer && (
          <div className={cn(
            'shrink-0 border-t border-ds-border',
            surface === 'sidebar' ? 'bg-ds-surface-2/95 px-0 pb-1 pt-3' : 'bg-ds-surface-2 pt-3',
          )}>
            {composer}
          </div>
        )}
      </div>
    );
  }

  if (composerPosition === 'sticky-bottom') {
    return (
      <div className="space-y-4">
        {list}
        {showComposer && (
          <div
            className="sticky bottom-0 z-20 -mx-4 border-t border-ds-border bg-ds-surface-1/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl"
          >
            {composer}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showComposer && composer}
      {list}
    </div>
  );
};

export default CompactComments;
