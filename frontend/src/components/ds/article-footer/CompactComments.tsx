import React, { useEffect, useState } from 'react';
import { AlertCircle, Heart, LoaderCircle, MessageCircle, MessageSquareText, Send, Trash2 } from 'lucide-react';
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
  /** Where the new-comment composer renders relative to the list — 'top'
   *  (default) for feed-style panels, 'bottom' for a chat-like sidebar where
   *  the list scrolls above a pinned input. */
  composerPosition?: 'top' | 'bottom';
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
  onSubmit: (content: string) => void | Promise<void>;
}> = ({ placeholder, postAria, submitting, surface = 'default', onSubmit }) => {
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

  const composerAvatarNode = (
    <Avatar
      name={composerName || (language === 'zh' ? '访客' : 'Guest')}
      src={composerAvatar}
      countryCode={composerCountryCode}
      size={surface === 'sidebar' ? 'xs' : 'sm'}
    />
  );

  return (
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
            'min-h-10 flex-1 bg-transparent text-ds-sm text-ds-fg outline-none placeholder:text-ds-fg-subtle',
            surface === 'sidebar' && 'min-w-0 text-[15px]',
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
  );
};

// A single row in the Xiaohongshu-style comment list: avatar, author, content,
// then time/reaction actions. Replies use the same row with a smaller avatar
// and an inline "Reply to name:" prefix.
const CommentRow: React.FC<{
  comment: ArticleComment;
  replyToName?: string;
  compact?: boolean;
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
  compact = false,
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
  const avatarSize = compact || sidebar ? 'xs' : 'md';
  const ipRegion = commentIpRegion(comment, language);

  return (
    <div className={cn('flex items-start', compact || sidebar ? 'gap-2.5' : 'gap-3')}>
      <Avatar
        name={comment.authorName}
        src={comment.avatarUrl}
        countryCode={comment.countryCode}
        visitorNumber={comment.visitorNumber}
        size={avatarSize}
      />
      <div className="min-w-0 flex-1">
        <div className={cn(
          'flex min-h-5 items-center gap-1.5 font-medium leading-5 text-ds-fg-muted',
          sidebar ? 'text-[14px]' : 'text-[15px]',
        )}>
          {comment.authorName}
          <AuthProviderBadge provider={comment.authProvider} className="size-3 shrink-0 text-ds-fg-subtle" />
        </div>
        <div className={cn('mt-1 leading-6 text-ds-fg', sidebar ? 'text-[15px]' : 'text-[16px]')}>
          {replyToName && (
            <span className="mr-1 text-ds-fg-subtle">
              {language === 'zh' ? '回复 ' : 'Reply to '}
              <span className="font-medium text-ds-fg-muted">{replyToName}</span>
              {language === 'zh' ? '：' : ': '}
            </span>
          )}
          <Markdown inline richLinks={false} className="comment-markdown">
            {comment.content}
          </Markdown>
        </div>
        <div className={cn(
          'mt-1.5 flex items-center gap-2 leading-5 text-ds-fg-subtle',
          sidebar ? 'text-[12px]' : 'text-[14px]',
        )}>
          <span>{formatTimelineTime(comment.createdAt, language)}</span>
          {ipRegion && <span>{ipRegion}</span>}
        </div>
        <div className={cn(
          'mt-2 flex items-center font-medium leading-none text-ds-fg-muted',
          sidebar ? 'gap-4 text-[13px]' : 'gap-5 text-[14px]',
        )}>
          <button
            type="button"
            onClick={() => onLike(comment.id)}
            disabled={pending}
            aria-pressed={comment.likedByCurrentUser}
            className={cn(
              'inline-flex items-center gap-1 transition-colors',
              comment.likedByCurrentUser ? 'text-ds-primary' : 'hover:text-ds-fg',
            )}
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Heart className={sidebar ? 'size-4' : 'size-[18px]'} />}
            {comment.likesCount > 0 ? comment.likesCount : language === 'zh' ? '赞' : 'Like'}
          </button>
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="inline-flex items-center gap-1 transition-colors hover:text-ds-fg"
          >
            <MessageCircle className={sidebar ? 'size-4' : 'size-[18px]'} />
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
      </div>
    </div>
  );
};

const countThread = (comment: ArticleComment): number =>
  1 + comment.replies.reduce((sum, reply) => sum + countThread(reply), 0);

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
  const { loginPromptOpen, requireIdentity, resolveLogin, closeLoginPrompt } =
    useRequireIdentity<() => void>();

  const visibleThreads = visibleCount === undefined || expanded ? comments : comments.slice(0, visibleCount);
  const hiddenCount = comments.length - visibleThreads.length;
  const totalCount = comments.reduce((sum, root) => sum + countThread(root), 0);
  const showComposer = composerVisible || Boolean(replyTarget);

  const submitDraft = async (content: string, parentId?: string) => {
    const identity = readCommenter();
    setFormError(undefined);
    try {
      await onSubmit({ authorName: identity.authorName, authorEmail: identity.authorEmail, content, parentId });
      setReplyTarget(null);
    } catch {
      setFormError(language === 'zh' ? '评论未能发布，请重试。' : 'The comment was not published. Please retry.');
    }
  };

  const gated = (run: () => void) => requireIdentity(run, (action) => action());

  const renderCommentRow = (
    comment: ArticleComment,
    options: { compact?: boolean; replyToName?: string } = {},
  ) => (
      <CommentRow
        comment={comment}
        replyToName={options.replyToName}
        compact={options.compact}
        surface={surface}
        language={language as 'en' | 'zh'}
      onLike={(commentId) => gated(() => { void onCommentLike(commentId); })}
      isLikePending={isCommentLikePending}
      onDelete={onCommentDelete ? (target) => { void onCommentDelete(target.id); } : undefined}
      isDeletePending={isCommentDeletePending}
      onReply={(target) => gated(() => setReplyTarget(target))}
    />
  );

  const renderReplies = (replies: ArticleComment[], parentName: string): React.ReactNode =>
    replies.map((reply) => (
      <li key={reply.id}>
        {renderCommentRow(reply, { compact: true, replyToName: parentName })}
        {reply.replies.length > 0 && (
          <ul className="mt-3 space-y-3">
            {renderReplies(reply.replies, reply.authorName)}
          </ul>
        )}
      </li>
    ));

  const replyBanner = replyTarget && (
    <div className="flex items-center justify-between gap-2 rounded-ds-sm bg-ds-surface-2 px-3 py-1.5 text-ds-xs text-ds-fg-subtle">
      <span>{language === 'zh' ? `回复 ${replyTarget.authorName}` : `Replying to ${replyTarget.authorName}`}</span>
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
            ? language === 'zh' ? `回复 ${replyTarget.authorName}…` : `Reply to ${replyTarget.authorName}…`
            : language === 'zh' ? '说点什么…' : 'Add a comment…'
        }
        postAria={labels?.postAria || (language === 'zh' ? '发布评论' : 'Post comment')}
        submitting={submitting}
        surface={surface}
        onSubmit={(content) => gated(() => { void submitDraft(content, replyTarget?.id); })}
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
        <div className="space-y-4" aria-hidden>
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
            {labels?.empty || (language === 'zh' ? '还没有评论' : 'No comments yet')}
          </p>
        </div>
      )}

      {state === 'ready' && totalCount > 0 && (
        <>
          <div className="text-ds-xs text-ds-fg-subtle">
            {labels?.count?.(totalCount) || (language === 'zh' ? `共 ${totalCount} 条评论` : `${totalCount} comments`)}
          </div>
          <ul className="space-y-4">
            {visibleThreads.map((root) => (
              <li key={root.id}>
                {renderCommentRow(root)}
                {root.replies.length > 0 && (
                  <ul className="mt-3 space-y-3 pl-[52px]">
                    {renderReplies(root.replies, root.authorName)}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-ds-xs font-medium text-ds-fg-subtle hover:text-ds-fg"
        >
          {labels?.viewAll?.(comments.length) || (language === 'zh' ? `查看全部 ${comments.length} 条评论` : `View all ${comments.length} comments`)}
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
        <LoginPromptModal
          open={loginPromptOpen}
          onClose={closeLoginPrompt}
          onResolved={() => resolveLogin((action) => action())}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showComposer && composer}
      {list}
      <LoginPromptModal
        open={loginPromptOpen}
        onClose={closeLoginPrompt}
        onResolved={() => resolveLogin((action) => action())}
      />
    </div>
  );
};

export default CompactComments;
