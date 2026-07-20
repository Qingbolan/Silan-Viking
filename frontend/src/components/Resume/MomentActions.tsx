import React, { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
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
import MomentActionMenu from './MomentActionMenu';
import MomentLikerAvatar from './MomentLikerAvatar';

interface MomentActionsProps {
  momentKey: string;
  timestamp: string;
}

const EMPTY_ENGAGEMENT: MomentEngagement = {
  likes: 0,
  comments: 0,
  is_liked_by_user: false,
  likers: [],
};

const MomentActions: React.FC<MomentActionsProps> = ({ momentKey, timestamp }) => {
  const { language } = useLanguage();
  const [engagement, setEngagement] = useState(EMPTY_ENGAGEMENT);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const likers = engagement.likers ?? [];
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
    void fetchMomentEngagement(momentKey, getClientFingerprint())
      .then((value) => { if (active) setEngagement(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [momentKey]);

  const toggleLike = async () => {
    if (likePending) return;
    setLikePending(true);
    try {
      setEngagement(await toggleMomentLike(momentKey, getClientFingerprint()));
    } finally {
      setLikePending(false);
    }
  };

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
    );
    setEngagement((current) => ({ ...current, comments: current.comments + 1 }));
    return created;
  }, [momentKey]);

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
          onLike={() => { void toggleLike(); }}
          onComment={() => setCommentsOpen((value) => !value)}
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
    </div>
  );
};

export default MomentActions;
