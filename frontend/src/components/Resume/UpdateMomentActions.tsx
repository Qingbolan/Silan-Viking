import React, { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle } from 'lucide-react';
import {
  createUpdateComment,
  deleteUpdateComment,
  fetchUpdateEngagement,
  listUpdateComments,
  toggleUpdateCommentLike,
  toggleUpdateLike,
  type UpdateEngagement,
} from '../../api/updates/updateApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import { EntityDiscussion, type RemoteDiscussionComment } from '../ds/EntityDiscussion';
import type { CommentDraft } from '../ds/article-footer/types';

interface UpdateMomentActionsProps {
  updateKey: string;
}

const EMPTY_ENGAGEMENT: UpdateEngagement = { likes: 0, comments: 0, is_liked_by_user: false };

const UpdateMomentActions: React.FC<UpdateMomentActionsProps> = ({ updateKey }) => {
  const [engagement, setEngagement] = useState(EMPTY_ENGAGEMENT);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likePending, setLikePending] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchUpdateEngagement(updateKey, getClientFingerprint())
      .then((value) => { if (active) setEngagement(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [updateKey]);

  const toggleLike = async () => {
    if (likePending) return;
    setLikePending(true);
    try {
      setEngagement(await toggleUpdateLike(updateKey, getClientFingerprint()));
    } finally {
      setLikePending(false);
    }
  };

  const loadComments = useCallback((
    fingerprint: string,
  ): Promise<RemoteDiscussionComment[]> => listUpdateComments(updateKey, fingerprint), [updateKey]);

  const createComment = useCallback(async (
    draft: CommentDraft,
    fingerprint: string,
  ) => {
    const created = await createUpdateComment(
      updateKey,
      draft.content,
      fingerprint,
      draft.authorName,
      draft.authorEmail,
    );
    setEngagement((current) => ({ ...current, comments: current.comments + 1 }));
    return created;
  }, [updateKey]);

  return (
    <div className="mt-5 border-t border-ds-border pt-3">
      <div className="flex items-center gap-4 text-ds-sm">
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 transition-colors ${engagement.is_liked_by_user ? 'text-red-500' : 'text-ds-fg-muted hover:text-ds-fg'}`}
          disabled={likePending}
          onClick={() => void toggleLike()}
        >
          <Heart className="size-4" fill={engagement.is_liked_by_user ? 'currentColor' : 'none'} />
          <span>{engagement.likes || 'Like'}</span>
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-ds-fg-muted transition-colors hover:text-ds-fg"
          onClick={() => setCommentsOpen((value) => !value)}
        >
          <MessageCircle className="size-4" />
          <span>{engagement.comments || 'Comment'}</span>
        </button>
      </div>

      {engagement.likes > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-ds-sm bg-ds-surface-2 px-3 py-2 text-ds-xs text-ds-fg-muted">
          <Heart className="size-3.5 text-red-500" fill="currentColor" />
          <span>{engagement.likes} {engagement.likes === 1 ? 'person likes this' : 'people like this'}</span>
        </div>
      )}

      {commentsOpen && (
        <div className="mt-3 rounded-ds-sm bg-ds-surface-2 px-4 pb-4">
          <EntityDiscussion
            loadComments={loadComments}
            createComment={createComment}
            toggleCommentLike={(commentId, fingerprint) => toggleUpdateCommentLike(commentId, fingerprint)}
            deleteComment={(commentId, fingerprint) => deleteUpdateComment(commentId, fingerprint)}
          />
        </div>
      )}
    </div>
  );
};

export default UpdateMomentActions;
