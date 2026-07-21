import { del, get, post, formatLanguage } from '../utils';
import type { Moment } from '../../types/api';
import type { RemoteDiscussionComment, DiscussionLikeResult } from '../../components/ds/EntityDiscussion';

interface MomentListResponse {
  moments: Moment[];
  total: number;
}

export const fetchMoments = async (language: 'en' | 'zh' = 'en'): Promise<Moment[]> => {
  const response = await get<MomentListResponse>('/api/v1/moments', {
    lang: formatLanguage(language),
  });
  return response?.moments ?? [];
};

export const fetchMoment = (
  slug: string,
  language: 'en' | 'zh' = 'en',
): Promise<Moment> =>
  get(`/api/v1/moments/${encodeURIComponent(slug)}`, {
    lang: formatLanguage(language),
  });

export interface MomentLiker {
  kind: 'visitor' | 'user';
  country_code?: string;
  visitor_number?: string;
  avatar_url?: string;
  label?: string;
}

export interface MomentEngagement {
  likes: number;
  comments: number;
  is_liked_by_user: boolean;
  likers: MomentLiker[];
}

export const fetchMomentEngagement = (
  momentKey: string,
  fingerprint: string,
): Promise<MomentEngagement> =>
  get(`/api/v1/moments/${encodeURIComponent(momentKey)}/engagement`, { fingerprint });

export const toggleMomentLike = (
  momentKey: string,
  fingerprint: string,
): Promise<MomentEngagement> =>
  post(`/api/v1/moments/${encodeURIComponent(momentKey)}/like`, { fingerprint });

export const listMomentComments = async (
  momentKey: string,
  fingerprint: string,
): Promise<RemoteDiscussionComment[]> => {
  const response = await get<{ comments: RemoteDiscussionComment[] }>(
    `/api/v1/moments/${encodeURIComponent(momentKey)}/comments`,
    { fingerprint },
  );
  return response.comments ?? [];
};

export const createMomentComment = (
  momentKey: string,
  content: string,
  fingerprint: string,
  authorName: string,
  authorEmail: string,
  parentId?: string,
): Promise<RemoteDiscussionComment> =>
  post(`/api/v1/moments/${encodeURIComponent(momentKey)}/comments`, {
    content,
    type: 'general',
    fingerprint,
    author_name: authorName,
    author_email: authorEmail,
    ...(parentId ? { parent_id: parentId } : {}),
  });

export const toggleMomentCommentLike = (
  commentId: string,
  fingerprint: string,
): Promise<DiscussionLikeResult> =>
  post(`/api/v1/moments/comments/${encodeURIComponent(commentId)}/like`, { fingerprint });

export const deleteMomentComment = (
  commentId: string,
  fingerprint: string,
): Promise<void> =>
  del(`/api/v1/moments/comments/${encodeURIComponent(commentId)}`, { fingerprint });
