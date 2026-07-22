import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createProjectComment,
  deleteProjectComment,
  getProjectMetrics,
  likeProject,
  likeProjectComment,
  listProjectComments,
  recordProjectView,
  type ProjectCommentData,
  type ProjectMetricsResponse,
} from '../../../api/projects/projectApi';
import { getClientFingerprint } from '../../../utils/fingerprint';
import type {
  ArticleComment,
  CommentDraft,
  CommentLoadState,
} from '../../ds/article-footer/types';

interface UseProjectEngagementOptions {
  projectId: string;
  language: 'en' | 'zh';
  enabled?: boolean;
}

const COMMENT_TYPES = ['general', 'suggestion', 'question', 'bug-report'] as const;

const mapComment = (comment: ProjectCommentData): ArticleComment => ({
  id: comment.id,
  authorName: comment.author_name,
  avatarUrl: comment.author_avatar_url,
  countryCode: comment.country_code,
  authProvider: comment.auth_provider,
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

const insertReply = (
  comments: ArticleComment[],
  parentId: string,
  reply: ArticleComment,
): ArticleComment[] =>
  comments.map((comment) => {
    if (comment.id === parentId) return { ...comment, replies: [...comment.replies, reply] };
    if (comment.replies.length === 0) return comment;
    return { ...comment, replies: insertReply(comment.replies, parentId, reply) };
  });

const removeComment = (comments: ArticleComment[], commentId: string): ArticleComment[] =>
  comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({ ...comment, replies: removeComment(comment.replies, commentId) }));

const countComments = (comments: ArticleComment[]): number =>
  comments.reduce((total, comment) => total + 1 + countComments(comment.replies), 0);

const initialMetrics: ProjectMetricsResponse = {
  likes_count: 0,
  views_count: 0,
  is_liked_by_user: false,
};

export const useProjectEngagement = ({
  projectId,
  language,
  enabled = true,
}: UseProjectEngagementOptions) => {
  const [metrics, setMetrics] = useState<ProjectMetricsResponse>(initialMetrics);
  const [metricsState, setMetricsState] = useState<CommentLoadState>('loading');
  const [likePending, setLikePending] = useState(false);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [commentsState, setCommentsState] = useState<CommentLoadState>('loading');
  const [commentsError, setCommentsError] = useState<string>();
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [pendingCommentLikes, setPendingCommentLikes] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingCommentDeletes, setPendingCommentDeletes] = useState<Set<string>>(
    () => new Set(),
  );
  const [interactionError, setInteractionError] = useState<string>();

  const fingerprint = useMemo(() => getClientFingerprint(), []);

  const loadMetrics = useCallback(async () => {
    if (!enabled || !projectId) {
      setMetrics(initialMetrics);
      setMetricsState('ready');
      return;
    }
    setMetricsState('loading');
    try {
      await recordProjectView(projectId, fingerprint, { language });
      setMetrics(await getProjectMetrics(projectId, { fingerprint, language }));
      setMetricsState('ready');
    } catch {
      setMetricsState('error');
    }
  }, [enabled, fingerprint, language, projectId]);

  const loadComments = useCallback(async () => {
    if (!enabled || !projectId) {
      setComments([]);
      setCommentsState('ready');
      setCommentsError(undefined);
      return;
    }
    setCommentsState('loading');
    setCommentsError(undefined);
    try {
      const groups = await Promise.all(
        COMMENT_TYPES.map((type) =>
          listProjectComments(projectId, type, fingerprint, language),
        ),
      );
      setComments(groups.flat().map(mapComment));
      setCommentsState('ready');
    } catch {
      setCommentsError(
        language === 'zh' ? '评论暂时无法加载，请重试。' : 'Comments could not be loaded. Please retry.',
      );
      setCommentsState('error');
    }
  }, [enabled, fingerprint, language, projectId]);

  useEffect(() => {
    void loadMetrics();
    void loadComments();
  }, [loadComments, loadMetrics]);

  const toggleLike = useCallback(async () => {
    if (!enabled || !projectId || likePending) return;
    const previous = metrics;
    const nextLiked = !previous.is_liked_by_user;

    setLikePending(true);
    setInteractionError(undefined);
    setMetrics({
      ...previous,
      is_liked_by_user: nextLiked,
      likes_count: Math.max(0, previous.likes_count + (nextLiked ? 1 : -1)),
    });
    try {
      const response = await likeProject(projectId, fingerprint, { language });
      setMetrics((current) => ({
        ...current,
        likes_count: response.likes_count,
        is_liked_by_user: response.is_liked_by_user,
      }));
    } catch {
      setMetrics(previous);
      setInteractionError(
        language === 'zh' ? '点赞未保存，请稍后重试。' : 'Your like was not saved. Please try again.',
      );
    } finally {
      setLikePending(false);
    }
  }, [enabled, fingerprint, language, likePending, metrics, projectId]);

  const submitComment = useCallback(async (draft: CommentDraft) => {
    if (!enabled || !projectId || commentSubmitting) return;
    setCommentSubmitting(true);
    setInteractionError(undefined);
    try {
      const created = await createProjectComment(projectId, draft.content, fingerprint, {
        type: 'general',
        authorName: draft.authorName,
        authorEmail: draft.authorEmail,
        parentId: draft.parentId,
        language,
      });
      const mapped = mapComment(created);
      setComments((current) =>
        draft.parentId ? insertReply(current, draft.parentId, mapped) : [mapped, ...current],
      );
      setCommentsState('ready');
    } catch (error) {
      setInteractionError(
        language === 'zh' ? '评论发布失败，请检查网络后重试。' : 'Your comment could not be published. Please retry.',
      );
      throw error;
    } finally {
      setCommentSubmitting(false);
    }
  }, [commentSubmitting, enabled, fingerprint, language, projectId]);

  const toggleCommentLike = useCallback(async (commentId: string) => {
    if (pendingCommentLikes.has(commentId)) return;
    setPendingCommentLikes((current) => new Set(current).add(commentId));
    setInteractionError(undefined);
    try {
      const response = await likeProjectComment(commentId, fingerprint, language);
      setComments((current) =>
        updateComment(current, commentId, (comment) => ({
          ...comment,
          likesCount: response.likes_count,
          likedByCurrentUser: response.is_liked_by_user,
        })),
      );
    } catch {
      setInteractionError(
        language === 'zh' ? '评论点赞失败，请重试。' : 'The comment reaction was not saved.',
      );
    } finally {
      setPendingCommentLikes((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }, [fingerprint, language, pendingCommentLikes]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (pendingCommentDeletes.has(commentId)) return;
    setPendingCommentDeletes((current) => new Set(current).add(commentId));
    setInteractionError(undefined);
    try {
      await deleteProjectComment(commentId, { fingerprint, language });
      setComments((current) => removeComment(current, commentId));
    } catch (error) {
      setInteractionError(
        language === 'zh' ? '评论未能删除，请重试。' : 'The comment could not be deleted. Please retry.',
      );
      throw error;
    } finally {
      setPendingCommentDeletes((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }, [fingerprint, language, pendingCommentDeletes]);

  const commentsCount = useMemo(() => countComments(comments), [comments]);
  const isCommentLikePending = useCallback(
    (commentId: string) => pendingCommentLikes.has(commentId),
    [pendingCommentLikes],
  );
  const isCommentDeletePending = useCallback(
    (commentId: string) => pendingCommentDeletes.has(commentId),
    [pendingCommentDeletes],
  );

  return {
    metrics,
    metricsState,
    likePending,
    toggleLike,
    comments,
    commentsCount,
    commentsState,
    commentsError,
    reloadComments: loadComments,
    commentSubmitting,
    submitComment,
    toggleCommentLike,
    isCommentLikePending,
    deleteComment,
    isCommentDeletePending,
    interactionError,
  };
};
