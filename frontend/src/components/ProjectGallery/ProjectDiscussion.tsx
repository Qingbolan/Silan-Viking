import React, { useCallback } from 'react';
import {
  createProjectComment,
  deleteProjectComment,
  likeProjectComment,
  listProjectComments,
} from '../../api/projects/projectApi';
import {
  EntityDiscussion,
  type RemoteDiscussionComment,
} from '../ds/EntityDiscussion';
import type { CommentDraft } from '../ds/article-footer/types';

interface ProjectDiscussionProps {
  projectId: string;
}

const COMMENT_TYPES = ['general', 'suggestion', 'question', 'bug-report'] as const;

const ProjectDiscussion: React.FC<ProjectDiscussionProps> = ({ projectId }) => {
  const loadComments = useCallback(async (
    fingerprint: string,
    language: 'en' | 'zh',
  ): Promise<RemoteDiscussionComment[]> => {
    const groups = await Promise.all(
      COMMENT_TYPES.map((type) =>
        listProjectComments(projectId, type, fingerprint, language),
      ),
    );
    return groups.flat();
  }, [projectId]);

  const createComment = useCallback((
    draft: CommentDraft,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => createProjectComment(projectId, draft.content, fingerprint, {
    type: 'general',
    authorName: draft.authorName,
    parentId: draft.parentId,
    language,
  }), [projectId]);

  const toggleCommentLike = useCallback((
    commentId: string,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => likeProjectComment(commentId, fingerprint, language), []);

  const deleteComment = useCallback((
    commentId: string,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => deleteProjectComment(commentId, { fingerprint, language }), []);

  return (
    <EntityDiscussion
      loadComments={loadComments}
      createComment={createComment}
      toggleCommentLike={toggleCommentLike}
      deleteComment={deleteComment}
    />
  );
};

export default ProjectDiscussion;
