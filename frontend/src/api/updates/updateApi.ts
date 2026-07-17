import { del, get, post, formatLanguage } from '../utils';
import type { RecentUpdate } from '../../types/api';
import type { RemoteDiscussionComment, DiscussionLikeResult } from '../../components/ds/EntityDiscussion';

interface UpdateListResponse {
  updates: RecentUpdate[];
  total: number;
}

export const fetchUpdates = async (language: 'en' | 'zh' = 'en'): Promise<RecentUpdate[]> => {
  const response = await get<UpdateListResponse>('/api/v1/updates', {
    lang: formatLanguage(language),
  });
  return response?.updates ?? [];
};

export interface UpdateEngagement {
  likes: number;
  comments: number;
  is_liked_by_user: boolean;
}

export const fetchUpdateEngagement = (
  updateKey: string,
  fingerprint: string,
): Promise<UpdateEngagement> =>
  get(`/api/v1/updates/${encodeURIComponent(updateKey)}/engagement`, { fingerprint });

export const toggleUpdateLike = (
  updateKey: string,
  fingerprint: string,
): Promise<UpdateEngagement> =>
  post(`/api/v1/updates/${encodeURIComponent(updateKey)}/like`, { fingerprint });

export const listUpdateComments = async (
  updateKey: string,
  fingerprint: string,
): Promise<RemoteDiscussionComment[]> => {
  const response = await get<{ comments: RemoteDiscussionComment[] }>(
    `/api/v1/updates/${encodeURIComponent(updateKey)}/comments`,
    { fingerprint },
  );
  return response.comments ?? [];
};

export const createUpdateComment = (
  updateKey: string,
  content: string,
  fingerprint: string,
  authorName: string,
  authorEmail: string,
): Promise<RemoteDiscussionComment> =>
  post(`/api/v1/updates/${encodeURIComponent(updateKey)}/comments`, {
    content,
    type: 'general',
    fingerprint,
    author_name: authorName,
    author_email: authorEmail,
  });

export const toggleUpdateCommentLike = (
  commentId: string,
  fingerprint: string,
): Promise<DiscussionLikeResult> =>
  post(`/api/v1/updates/comments/${encodeURIComponent(commentId)}/like`, { fingerprint });

export const deleteUpdateComment = (
  commentId: string,
  fingerprint: string,
): Promise<void> =>
  del(`/api/v1/updates/comments/${encodeURIComponent(commentId)}`, { fingerprint });
