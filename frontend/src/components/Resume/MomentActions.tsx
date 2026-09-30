import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import MomentEngagementControls from './MomentEngagementControls';
import MomentLikerStrip from './MomentLikerStrip';
import LikePanel from '../ds/article-footer/LikePanel';
import { ArticleLikerStrip } from '../ds/ArticleFooter';

interface MomentActionsProps {
  momentKey: string;
  timestamp: string;
  variant?: 'full' | 'compact' | 'sidebar';
  timestampDisplay?: 'date-time' | 'time' | 'hidden';
}

const EMPTY_ENGAGEMENT: MomentEngagement = {
  likes: 0,
  comments: 0,
  is_liked_by_user: false,
  likers: [],
};


const MomentActions: React.FC<MomentActionsProps> = ({
  momentKey,
  timestamp,
  variant = 'full',
  timestampDisplay = 'date-time',
}) => {
  const { language } = useLanguage();
  const lang = language as 'en' | 'zh';
  const navigate = useNavigate();
  const [engagement, setEngagement] = useState(EMPTY_ENGAGEMENT);
  const [composerOpen, setComposerOpen] = useState(variant !== 'compact');
  const [likePending, setLikePending] = useState(false);
  const mutatedRef = useRef(false);

  const formattedTimestamp = (() => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-SG', {
      ...(timestampDisplay === 'time'
        ? { hour: '2-digit' as const, minute: '2-digit' as const }
        : {
            year: 'numeric' as const,
            month: 'short' as const,
            day: '2-digit' as const,
            hour: '2-digit' as const,
            minute: '2-digit' as const,
          }),
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
      draft.parentId,
    );
    mutatedRef.current = true;
    setEngagement((current) => ({ ...current, comments: current.comments + 1 }));
    return created;
  }, [momentKey]);

  const openDiscussion = () => {
    if (variant === 'compact') {
      navigate(`/moments/${encodeURIComponent(momentKey)}`);
      return;
    }
    setComposerOpen(true);
  };

  if (variant === 'compact') {
    return (
      <div className="mt-2 flex min-h-7 items-center justify-end gap-3">
        {timestampDisplay !== 'hidden' && (
          <time
            dateTime={timestamp}
            className="mr-auto font-mono text-ds-xs tabular-nums text-ds-fg-subtle"
          >
            {formattedTimestamp}
          </time>
        )}
        <MomentEngagementControls
          compact
          liked={engagement.is_liked_by_user}
          likePending={likePending}
          language={lang}
          onLike={() => void toggleLike()}
          onComment={openDiscussion}
        />
      </div>
    );
  }

  const discussion = (
    <EntityDiscussion
      composerPosition={variant === 'sidebar' ? 'top' : 'sticky-bottom'}
      composerVisible={composerOpen}
      surface="default"
      loadComments={loadComments}
      createComment={createComment}
      toggleCommentLike={(commentId, fingerprint) => toggleMomentCommentLike(commentId, fingerprint)}
      deleteComment={(commentId, fingerprint) => deleteMomentComment(commentId, fingerprint)}
    />
  );

  if (variant === 'sidebar') {
    return (
      <div className="px-4 pb-5">
        <LikePanel likes={engagement.likes} liked={engagement.is_liked_by_user}
          pending={likePending} onLike={toggleLike} />
        <ArticleLikerStrip likers={engagement.likers ?? []} likes={engagement.likes} />
        <div className="mt-5">{discussion}</div>
      </div>
    );
  }

  return (
    <section className="moment-discussion-typography border-t border-ds-border pt-2" aria-label={lang === 'zh' ? '点赞与评论' : 'Likes and comments'}>
      {timestampDisplay !== 'hidden' && (
        <time
          dateTime={timestamp}
          className="mb-2 block font-mono text-ds-xs tabular-nums text-ds-fg-subtle"
        >
          {formattedTimestamp}
        </time>
      )}
      <MomentEngagementControls
        liked={engagement.is_liked_by_user}
        likePending={likePending}
        language={lang}
        onLike={() => void toggleLike()}
        onComment={openDiscussion}
      />
      <MomentLikerStrip
        likers={engagement.likers ?? []}
        liked={engagement.is_liked_by_user}
        language={lang}
      />
      <div className="mt-2 rounded-ds-sm bg-ds-surface-2 px-4 pt-4">
        {discussion}
      </div>
    </section>
  );
};

export default MomentActions;
