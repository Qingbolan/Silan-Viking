import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createBlogComment,
  deleteBlogComment,
  likeComment,
  listBlogComments,
  updateBlogLikes,
  type BlogCommentData,
} from '../../../api/blog/blogApi';
import {
  createEpisodeComment,
  listEpisodeComments,
  updateEpisodeLikes,
} from '../../../api/episodes/episodeApi';
import { getClientFingerprint } from '../../../utils/fingerprint';
import type {
  ArticleComment,
  CommentDraft,
  CommentLoadState,
} from '../../ds/article-footer/types';

interface UseBlogEngagementOptions {
  postId: string;
  initialLikes: number;
  initialLiked: boolean;
  language: 'en' | 'zh';
  kind?: 'blog' | 'episode';
  enabled?: boolean;
}

const mapComment = (comment: BlogCommentData): ArticleComment => ({
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

const countComments = (comments: ArticleComment[]): number =>
  comments.reduce(
    (total, comment) => total + 1 + countComments(comment.replies),
    0,
  );

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

export const useBlogEngagement = ({
  postId,
  initialLikes,
  initialLiked,
  language,
  kind = 'blog',
  enabled = true,
}: UseBlogEngagementOptions) => {
  const [likes, setLikes] = useState(Math.max(0, initialLikes));
  const [liked, setLiked] = useState(initialLiked);
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

  useEffect(() => {
    setLikes(Math.max(0, initialLikes));
    setLiked(initialLiked);
    setInteractionError(undefined);
  }, [postId, initialLiked, initialLikes]);

  const loadComments = useCallback(async () => {
    if (!enabled || !postId) {
      setComments([]);
      setCommentsState('ready');
      setCommentsError(undefined);
      return;
    }
    setCommentsState('loading');
    setCommentsError(undefined);
    try {
      const fingerprint = getClientFingerprint();
      const response = kind === 'episode'
        ? await listEpisodeComments(postId, fingerprint, language)
        : await listBlogComments(postId, fingerprint, language);
      setComments(response.map(mapComment));
      setCommentsState('ready');
    } catch {
      setCommentsError(
        language === 'zh' ? '评论暂时无法加载，请重试。' : 'Comments could not be loaded. Please retry.',
      );
      setCommentsState('error');
    }
  }, [enabled, kind, language, postId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const toggleLike = useCallback(async () => {
    if (likePending) return;
    if (!enabled || !postId) return;
    const previousLiked = liked;
    const previousLikes = likes;
    const nextLiked = !previousLiked;

    setLikePending(true);
    setInteractionError(undefined);
    setLiked(nextLiked);
    setLikes(Math.max(0, previousLikes + (nextLiked ? 1 : -1)));
    try {
      const response = kind === 'episode'
        ? await updateEpisodeLikes(postId, nextLiked, language)
        : await updateBlogLikes(postId, nextLiked, language);
      setLikes(Math.max(0, response.likes));
      setLiked(response.is_liked_by_user);
    } catch {
      setLiked(previousLiked);
      setLikes(previousLikes);
      setInteractionError(
        language === 'zh' ? '点赞未保存，请稍后重试。' : 'Your like was not saved. Please try again.',
      );
    } finally {
      setLikePending(false);
    }
  }, [enabled, kind, language, liked, likePending, likes, postId]);

  const submitComment = useCallback(
    async (draft: CommentDraft) => {
      if (commentSubmitting) return;
      if (!enabled || !postId) return;
      setCommentSubmitting(true);
      setInteractionError(undefined);
      try {
        const fingerprint = getClientFingerprint();
        const created = kind === 'episode'
          ? await createEpisodeComment(
              postId,
              draft.authorName,
              draft.authorEmail,
              draft.content,
              fingerprint,
              language,
              draft.parentId,
            )
          : await createBlogComment(
              postId,
              draft.authorName,
              draft.authorEmail,
              draft.content,
              fingerprint,
              language,
              draft.parentId,
            );
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
    },
    [commentSubmitting, enabled, kind, language, postId],
  );

  const toggleCommentLike = useCallback(
    async (commentId: string) => {
      if (pendingCommentLikes.has(commentId)) return;
      setPendingCommentLikes((current) => new Set(current).add(commentId));
      setInteractionError(undefined);
      try {
        const response = await likeComment(
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
          language === 'zh' ? '评论点赞失败，请重试。' : 'The comment reaction was not saved.',
        );
      } finally {
        setPendingCommentLikes((current) => {
          const next = new Set(current);
          next.delete(commentId);
          return next;
        });
      }
    },
    [language, pendingCommentLikes],
  );

  const commentsCount = useMemo(() => countComments(comments), [comments]);
  const isCommentLikePending = useCallback(
    (commentId: string) => pendingCommentLikes.has(commentId),
    [pendingCommentLikes],
  );
  const deleteComment = useCallback(async (commentId: string) => {
    if (pendingCommentDeletes.has(commentId)) return;
    setPendingCommentDeletes((current) => new Set(current).add(commentId));
    setInteractionError(undefined);
    try {
      await deleteBlogComment(commentId, getClientFingerprint(), language);
      setComments((current) => removeComment(current, commentId));
    } catch (deleteError) {
      setInteractionError(
        language === 'zh' ? '评论未能删除，请重试。' : 'The comment could not be deleted. Please retry.',
      );
      throw deleteError;
    } finally {
      setPendingCommentDeletes((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  }, [language, pendingCommentDeletes]);
  const isCommentDeletePending = useCallback(
    (commentId: string) => pendingCommentDeletes.has(commentId),
    [pendingCommentDeletes],
  );

  return {
    likes,
    liked,
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
