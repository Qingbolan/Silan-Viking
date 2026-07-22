import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  createMomentComment,
  deleteMomentComment,
  fetchMomentEngagement,
  listMomentComments,
  toggleMomentCommentLike,
  toggleMomentLike,
  type MomentEngagement,
} from '../../api/moments/momentApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import { EntityDiscussion, type RemoteDiscussionComment } from '../ds/EntityDiscussion';
import type { CommentDraft } from '../ds/article-footer/types';
import { useLanguage } from '../LanguageContext';
import { LoginPromptModal } from '../ds';
import { useRequireIdentity } from '../../lib/useRequireIdentity';
import { markdownToPlainExcerpt } from '../../lib/markdown';
import MomentActionMenu from './MomentActionMenu';
import MomentLikerAvatar from './MomentLikerAvatar';
import Avatar from '../ds/article-footer/Avatar';

interface MomentActionsProps {
  momentKey: string;
  timestamp: string;
  variant?: 'full' | 'compact' | 'sidebar';
}

const EMPTY_ENGAGEMENT: MomentEngagement = {
  likes: 0,
  comments: 0,
  is_liked_by_user: false,
  likers: [],
};

const flattenComments = (comments: RemoteDiscussionComment[]): RemoteDiscussionComment[] =>
  comments.flatMap((comment) => [
    comment,
    ...flattenComments(comment.replies ?? []),
  ]);

const pickHottestComment = (comments: RemoteDiscussionComment[]): RemoteDiscussionComment | null => {
  const all = flattenComments(comments);
  if (all.length === 0) return null;
  return [...all].sort((a, b) => {
    const likes = (b.likes_count ?? 0) - (a.likes_count ?? 0);
    if (likes !== 0) return likes;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
};

const MomentActions: React.FC<MomentActionsProps> = ({ momentKey, timestamp, variant = 'full' }) => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [engagement, setEngagement] = useState(EMPTY_ENGAGEMENT);
  const [compactPreview, setCompactPreview] = useState<RemoteDiscussionComment | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const { loginPromptOpen, requireIdentity: requireIdentityGate, resolveLogin, closeLoginPrompt } =
    useRequireIdentity<'like' | 'comment'>();
  const likers = engagement.likers ?? [];
  const mutatedRef = useRef(false);
  const formattedTimestamp = (() => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-SG', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  })();

  useEffect(() => {
    let active = true;
    mutatedRef.current = false;
    void fetchMomentEngagement(momentKey, getClientFingerprint())
      .then((value) => { if (active && !mutatedRef.current) setEngagement(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [momentKey]);

  const toggleLike = async () => {
    if (likePending) return;
    setLikePending(true);
    try {
      const result = await toggleMomentLike(momentKey, getClientFingerprint());
      mutatedRef.current = true;
      setEngagement(result);
    } finally {
      setLikePending(false);
    }
  };

  const performAction = (action: 'like' | 'comment') => {
    if (action === 'like') void toggleLike();
    else setComposerOpen((value) => !value);
  };

  const requireIdentity = (action: 'like' | 'comment') => requireIdentityGate(action, performAction);
  const handleLoginResolved = () => resolveLogin(performAction);

  const loadComments = useCallback((
    fingerprint: string,
  ): Promise<RemoteDiscussionComment[]> => listMomentComments(momentKey, fingerprint), [momentKey]);

  const createComment = useCallback(async (
    draft: CommentDraft,
    fingerprint: string,
  ) => {
    const created = await createMomentComment(
      momentKey,
      draft.content,
      fingerprint,
      draft.authorName,
      draft.authorEmail,
      draft.parentId,
    );
    mutatedRef.current = true;
    setEngagement((current) => ({ ...current, comments: current.comments + 1 }));
    return created;
  }, [momentKey]);

  useEffect(() => {
    if (variant !== 'compact' || engagement.comments <= 0) {
      setCompactPreview(null);
      return;
    }
    let active = true;
    void listMomentComments(momentKey, getClientFingerprint())
      .then((comments) => {
        if (active) setCompactPreview(pickHottestComment(comments));
      })
      .catch(() => {
        if (active) setCompactPreview(null);
      });
    return () => {
      active = false;
    };
  }, [engagement.comments, momentKey, variant]);

  if (variant === 'compact') {
    const likeLabel = language === 'zh' ? `点赞，${engagement.likes} 个赞` : `Like, ${engagement.likes} likes`;
    const commentLabel = language === 'zh' ? `评论，${engagement.comments} 条评论` : `Comment, ${engagement.comments} comments`;
    const detailLabel = language === 'zh' ? '点击详情查看' : 'Open detail';
    const openDetail = () => navigate(`/moments/${encodeURIComponent(momentKey)}`);
    const omittedCount = Math.max(0, engagement.comments - (compactPreview ? 1 : 0));
    const previewText = compactPreview
      ? markdownToPlainExcerpt(compactPreview.content, '', 96)
      : '';

    return (
      <div className="border-t border-ds-border">
        <div className="flex min-h-10 items-center justify-between gap-4 px-4 sm:px-5">
          <time
            dateTime={timestamp}
            className="font-mono text-ds-xs tabular-nums text-ds-fg-subtle"
          >
            {formattedTimestamp}
          </time>

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={likeLabel}
              disabled={likePending}
              onClick={(event) => { event.preventDefault(); requireIdentity('like'); }}
              className={`inline-flex items-center gap-1.5 text-ds-xs font-medium tabular-nums transition-colors disabled:cursor-wait disabled:opacity-50 ${
                engagement.is_liked_by_user ? 'text-red-500' : 'text-ds-fg-subtle hover:text-ds-fg'
              }`}
            >
              <Heart className="size-4" fill={engagement.is_liked_by_user ? 'currentColor' : 'none'} />
              {engagement.likes}
            </button>
            <button
              type="button"
              aria-label={commentLabel}
              onClick={(event) => {
                event.preventDefault();
                openDetail();
              }}
              className="inline-flex items-center gap-1.5 text-ds-xs font-medium tabular-nums text-ds-fg-subtle transition-colors hover:text-ds-fg"
            >
              <MessageCircle className="size-4" />
              {engagement.comments}
            </button>
          </div>
        </div>

        {engagement.comments > 0 && (
          <div className="border-t border-ds-border px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                openDetail();
              }}
              className="flex w-full flex-col gap-2 rounded-ds-sm bg-ds-surface-3 px-3 py-2.5 text-left transition-colors hover:bg-ds-surface-1"
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-ds-xs font-medium text-ds-fg-muted">
                  <MessageCircle className="size-3.5 shrink-0" aria-hidden />
                  <span>
                    {language === 'zh'
                      ? `${engagement.comments} 条评论`
                      : `${engagement.comments} ${engagement.comments === 1 ? 'comment' : 'comments'}`}
                  </span>
                </span>
                <span className="shrink-0 text-ds-xs font-medium text-ds-fg-subtle">
                  {detailLabel}
                </span>
              </span>

              {compactPreview && (
                <span className="flex w-full min-w-0 items-start gap-2.5">
                  <Avatar
                    name={compactPreview.author_name}
                    src={compactPreview.author_avatar_url}
                    countryCode={compactPreview.country_code}
                    visitorNumber={compactPreview.visitor_number}
                    size="xs"
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-ds-xs font-semibold text-ds-fg-muted">
                        {compactPreview.author_name}
                      </span>
                      {(compactPreview.likes_count ?? 0) > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums text-ds-primary">
                          <Heart className="size-3" fill="currentColor" aria-hidden />
                          {compactPreview.likes_count}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-ds-sm leading-5 text-ds-fg">
                      {previewText}
                    </span>
                  </span>
                </span>
              )}

              {omittedCount > 0 && (
                <span className="text-ds-xs text-ds-fg-subtle">
                  {language === 'zh'
                    ? `其余 ${omittedCount} 条已省略`
                    : `${omittedCount} more omitted`}
                </span>
              )}
            </button>
          </div>
        )}

        <LoginPromptModal
          open={loginPromptOpen}
          onClose={closeLoginPrompt}
          onResolved={handleLoginResolved}
        />
      </div>
    );
  }

  if (variant === 'sidebar') {
    const likeLabel = language === 'zh' ? `点赞，${engagement.likes} 个赞` : `Like, ${engagement.likes} likes`;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-ds-border bg-ds-surface-3 px-3 py-1.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              aria-label={likeLabel}
              disabled={likePending}
              onClick={() => requireIdentity('like')}
              className={`inline-flex shrink-0 items-center gap-1.5 text-ds-sm font-medium tabular-nums transition-colors disabled:cursor-wait disabled:opacity-50 ${
                engagement.is_liked_by_user ? 'text-red-500' : 'text-ds-fg-subtle hover:text-ds-fg'
              }`}
            >
              <Heart className="size-4" fill={engagement.is_liked_by_user ? 'currentColor' : 'none'} />
            </button>

            {likers.length > 0 && (
              <div className="flex min-w-0 items-center gap-2 rounded-[9px] bg-ds-fg/10 px-2 py-1.5 shadow-inner">
                {likers.slice(0, 4).map((liker, index) => (
                  <MomentLikerAvatar
                    key={`${liker.kind}-${liker.visitor_number || liker.avatar_url || index}`}
                    liker={liker}
                    language={language as 'en' | 'zh'}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col pb-3 pl-4 pr-0 pt-3 sm:pl-5 sm:pr-0">
          <EntityDiscussion
            composerPosition="bottom"
            loadComments={loadComments}
            createComment={createComment}
            toggleCommentLike={(commentId, fingerprint) => toggleMomentCommentLike(commentId, fingerprint)}
            deleteComment={(commentId, fingerprint) => deleteMomentComment(commentId, fingerprint)}
          />
        </div>

        <LoginPromptModal
          open={loginPromptOpen}
          onClose={closeLoginPrompt}
          onResolved={handleLoginResolved}
        />
      </div>
    );
  }

  const discussionVisible = composerOpen || engagement.comments > 0;

  return (
    <div className="border-t border-ds-border">
      <div className="flex min-h-10 items-center justify-between gap-4">
        <time
          dateTime={timestamp}
          className="font-mono text-ds-xs tabular-nums text-ds-fg-subtle"
        >
          {formattedTimestamp}
        </time>

        <MomentActionMenu
          language={language as 'en' | 'zh'}
          likes={engagement.likes}
          comments={engagement.comments}
          liked={engagement.is_liked_by_user}
          likePending={likePending}
          composerOpen={composerOpen}
          onLike={() => requireIdentity('like')}
          onComment={() => {
            if (composerOpen) setComposerOpen(false);
            else requireIdentity('comment');
          }}
        />
      </div>

      {engagement.likes > 0 && (
        <div className="flex min-h-6 items-center gap-3 rounded-ds-sm bg-ds-surface-2 px-3 py-2.5">
          <Heart
            className={`size-4 shrink-0 ${engagement.is_liked_by_user ? 'text-red-500' : 'text-gray-500'}`}
            fill="currentColor"
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {likers.map((liker, index) => (
              <MomentLikerAvatar
                key={`${liker.kind}-${liker.visitor_number || liker.avatar_url || index}`}
                liker={liker}
                language={language as 'en' | 'zh'}
              />
            ))}
          </div>
        </div>
      )}

      {discussionVisible && (
        <div className="rounded-ds-sm bg-ds-surface-2 px-4 pb-4">
          <EntityDiscussion
            composerVisible={composerOpen}
            loadComments={loadComments}
            createComment={createComment}
            toggleCommentLike={(commentId, fingerprint) => toggleMomentCommentLike(commentId, fingerprint)}
            deleteComment={(commentId, fingerprint) => deleteMomentComment(commentId, fingerprint)}
          />
        </div>
      )}

      <LoginPromptModal
        open={loginPromptOpen}
        onClose={closeLoginPrompt}
        onResolved={handleLoginResolved}
      />
    </div>
  );
};

export default MomentActions;
