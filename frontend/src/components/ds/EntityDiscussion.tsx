import React, { useCallback, useEffect, useState } from 'react';
import { getClientFingerprint } from '../../utils/fingerprint';
import CommentsSection from './article-footer/CommentsSection';
import CompactComments from './article-footer/CompactComments';
import type {
  ArticleComment,
  CommentDraft,
  CommentLoadState,
} from './article-footer/types';
import { useLanguage } from '../LanguageContext';

export interface RemoteDiscussionComment {
  id: string;
  author_name: string;
  author_avatar_url?: string;
  country_code?: string;
  content: string;
  created_at: string;
  likes_count: number;
  is_liked_by_user: boolean;
  can_delete: boolean;
  replies?: RemoteDiscussionComment[];
}

export interface DiscussionLikeResult {
  likes_count: number;
  is_liked_by_user: boolean;
}

export interface EntityDiscussionProps {
  loadComments: (
    fingerprint: string,
    language: 'en' | 'zh',
  ) => Promise<RemoteDiscussionComment[]>;
  createComment: (
    draft: CommentDraft,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => Promise<RemoteDiscussionComment>;
  toggleCommentLike: (
    commentId: string,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => Promise<DiscussionLikeResult>;
  deleteComment: (
    commentId: string,
    fingerprint: string,
    language: 'en' | 'zh',
  ) => Promise<void>;
  variant?: 'full' | 'compact';
}

const mapComment = (comment: RemoteDiscussionComment): ArticleComment => ({
  id: comment.id,
  authorName: comment.author_name,
  avatarUrl: comment.author_avatar_url,
  countryCode: comment.country_code,
  content: comment.content,
  createdAt: comment.created_at,
  likesCount: comment.likes_count ?? 0,
  likedByCurrentUser: Boolean(comment.is_liked_by_user),
  canDelete: Boolean(comment.can_delete),
  replies: (comment.replies ?? []).map(mapComment),
});

const updateComment = (
  comments: ArticleComment[],
  commentId: string,
  update: (comment: ArticleComment) => ArticleComment,
): ArticleComment[] =>
  comments.map((comment) => {
    if (comment.id === commentId) return update(comment);
    if (comment.replies.length === 0) return comment;
    return { ...comment, replies: updateComment(comment.replies, commentId, update) };
  });

const removeComment = (comments: ArticleComment[], commentId: string): ArticleComment[] =>
  comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({ ...comment, replies: removeComment(comment.replies, commentId) }));

export const EntityDiscussion: React.FC<EntityDiscussionProps> = ({
  loadComments,
  createComment,
  toggleCommentLike,
  deleteComment,
  variant = 'full',
}) => {
  const { language } = useLanguage();
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [state, setState] = useState<CommentLoadState>('loading');
  const [error, setError] = useState<string>();
  const [interactionError, setInteractionError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [pendingLikes, setPendingLikes] = useState<Set<string>>(() => new Set());
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    setState('loading');
    setError(undefined);
    try {
      const response = await loadComments(getClientFingerprint(), language);
      setComments(response.map(mapComment));
      setState('ready');
    } catch {
      setError(
        language === 'zh' ? '讨论暂时无法加载，请重试。' : 'The discussion could not be loaded. Please retry.',
      );
      setState('error');
    }
  }, [language, loadComments]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submit = useCallback(async (draft: CommentDraft) => {
    if (submitting) return;
    setSubmitting(true);
    setInteractionError(undefined);
    try {
      const created = await createComment(
        draft,
        getClientFingerprint(),
        language,
      );
      setComments((current) => [mapComment(created), ...current]);
      setState('ready');
    } catch (submitError) {
      setInteractionError(
        language === 'zh' ? '评论发布失败，请重试。' : 'The comment could not be published. Please retry.',
      );
      throw submitError;
    } finally {
      setSubmitting(false);
    }
  }, [createComment, language, submitting]);

  const toggleLike = useCallback(async (commentId: string) => {
    if (pendingLikes.has(commentId)) return;
    setPendingLikes((current) => new Set(current).add(commentId));
    setInteractionError(undefined);
    try {
      const response = await toggleCommentLike(
        commentId,
        getClientFingerprint(),
        language,
      );
      setComments((current) =>
        updateComment(current, commentId, (comment) => ({
          ...comment,
          likesCount: response.likes_count,
          likedByCurrentUser: response.is_liked_by_user,
        })),
      );
    } catch {
      setInteractionError(
        language === 'zh' ? '点赞未能保存，请重试。' : 'The reaction could not be saved. Please retry.',
      );
    } finally {
      setPendingLikes((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }, [language, pendingLikes, toggleCommentLike]);

  const isLikePending = useCallback(
    (commentId: string) => pendingLikes.has(commentId),
    [pendingLikes],
  );

  const deleteOne = useCallback(async (commentId: string) => {
    if (pendingDeletes.has(commentId)) return;
    setPendingDeletes((current) => new Set(current).add(commentId));
    setInteractionError(undefined);
    try {
      await deleteComment(commentId, getClientFingerprint(), language);
      setComments((current) => removeComment(current, commentId));
    } catch (deleteError) {
      setInteractionError(
        language === 'zh' ? '评论未能删除，请重试。' : 'The comment could not be deleted. Please retry.',
      );
      throw deleteError;
    } finally {
      setPendingDeletes((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }, [deleteComment, language, pendingDeletes]);

  const isDeletePending = useCallback(
    (commentId: string) => pendingDeletes.has(commentId),
    [pendingDeletes],
  );

  return (
    <div>
      {interactionError && (
        <p className="mb-3 text-ds-xs text-red-600" role="status">
          {interactionError}
        </p>
      )}
      {variant === 'compact' ? (
        <CompactComments
          comments={comments}
          state={state}
          error={error}
          submitting={submitting}
          onRetry={reload}
          onSubmit={submit}
          onCommentLike={toggleLike}
          isCommentLikePending={isLikePending}
        />
      ) : (
        <CommentsSection
          comments={comments}
          state={state}
          error={error}
          submitting={submitting}
          onRetry={reload}
          onSubmit={submit}
          onCommentLike={toggleLike}
          isCommentLikePending={isLikePending}
          onCommentDelete={deleteOne}
          isCommentDeletePending={isDeletePending}
        />
      )}
    </div>
  );
};
