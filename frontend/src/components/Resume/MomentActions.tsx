import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
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
import MomentActionMenu from './MomentActionMenu';
import MomentLikerAvatar from './MomentLikerAvatar';

interface MomentActionsProps {
  momentKey: string;
  timestamp: string;
  variant?: 'full' | 'compact';
}

const EMPTY_ENGAGEMENT: MomentEngagement = {
  likes: 0,
  comments: 0,
  is_liked_by_user: false,
  likers: [],
};

const MomentActions: React.FC<MomentActionsProps> = ({ momentKey, timestamp, variant = 'full' }) => {
  const { language } = useLanguage();
  const [engagement, setEngagement] = useState(EMPTY_ENGAGEMENT);
  const [commentsOpen, setCommentsOpen] = useState(false);
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
    else setCommentsOpen((value) => !value);
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

  if (variant === 'compact') {
    const likeLabel = language === 'zh' ? `点赞，${engagement.likes} 个赞` : `Like, ${engagement.likes} likes`;
    const commentLabel = language === 'zh' ? `评论，${engagement.comments} 条评论` : `Comment, ${engagement.comments} comments`;

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
                if (commentsOpen) setCommentsOpen(false);
                else requireIdentity('comment');
              }}
              className={`inline-flex items-center gap-1.5 text-ds-xs font-medium tabular-nums transition-colors ${
                commentsOpen ? 'text-ds-fg' : 'text-ds-fg-subtle hover:text-ds-fg'
              }`}
            >
              <MessageCircle className="size-4" />
              {engagement.comments}
            </button>
          </div>
        </div>

        {commentsOpen && (
          <div className="border-t border-ds-border bg-ds-surface-1 px-4 pb-4 pt-3 sm:px-5">
            <EntityDiscussion
              visibleCount={3}
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
  }

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
          commentsOpen={commentsOpen}
          onLike={() => requireIdentity('like')}
          onComment={() => {
            if (commentsOpen) setCommentsOpen(false);
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
            {engagement.likes > likers.length && (
              <span className="ml-0.5 font-mono text-ds-xs tabular-nums text-ds-fg-subtle">
                +{engagement.likes - likers.length}
              </span>
            )}
          </div>
        </div>
      )}

      {commentsOpen && (
        <div className="rounded-ds-sm bg-ds-surface-2 px-4 pb-4">
          <EntityDiscussion
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
