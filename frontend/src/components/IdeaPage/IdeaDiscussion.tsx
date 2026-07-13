import React, { useCallback } from 'react';
import {
  createIdeaComment,
  deleteIdeaComment,
  likeIdeaComment,
  listIdeaComments,
} from '../../api/ideas/ideaApi';
import {
  EntityDiscussion,
  type RemoteDiscussionComment,
} from '../ds/EntityDiscussion';
import type { CommentDraft } from '../ds/article-footer/types';

interface IdeaDiscussionProps {
  ideaId: string;
}

const COMMENT_TYPES = ['general', 'suggestion', 'question', 'bug-report'] as const;

const IdeaDiscussion: React.FC<IdeaDiscussionProps> = ({ ideaId }) => {
  const loadComments = useCallback(async (
    fingerprint: string,
    language: 'en' | 'zh',
  ): Promise<RemoteDiscussionComment[]> => {
    const groups = await Promise.all(
      COMMENT_TYPES.map((type) =>
        listIdeaComments(ideaId, type, fingerprint, language),
      ),
    );
    return groups.flat();
  }, [ideaId]);

  const createComment = useCallback((
    draft: CommentDraft,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => createIdeaComment(ideaId, draft.content, fingerprint, {
    type: 'general',
    authorName: draft.authorName,
    authorEmail: draft.authorEmail,
    language,
  }), [ideaId]);

  const toggleCommentLike = useCallback((
    commentId: string,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => likeIdeaComment(commentId, fingerprint, language), []);

  const deleteComment = useCallback((
    commentId: string,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => deleteIdeaComment(commentId, { fingerprint, language }), []);

  return (
    <EntityDiscussion
      loadComments={loadComments}
      createComment={createComment}
      toggleCommentLike={toggleCommentLike}
      deleteComment={deleteComment}
    />
  );
};

export default IdeaDiscussion;
