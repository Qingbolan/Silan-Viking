import { get, post, formatLanguage } from '../utils';
import type { EpisodeData, EpisodeSeriesData, EpisodeSeriesListResponse } from '../../types/episode';
import type {
  BlogCommentData,
  BlogCommentListResponse,
  UpdateBlogLikesResponse,
} from '../blog/blogApi';
import { getClientFingerprint } from '../../utils/fingerprint';

export const fetchEpisodeSeriesList = async (
  language: 'en' | 'zh' = 'en',
): Promise<EpisodeSeriesData[]> => {
  const response = await get<EpisodeSeriesListResponse>('/api/v1/episodes/series', {
    lang: formatLanguage(language),
  });
  return response?.series ?? [];
};

export const fetchEpisodeSeries = async (
  seriesSlug: string,
  language: 'en' | 'zh' = 'en',
): Promise<EpisodeSeriesData | null> => {
  if (!seriesSlug) return null;
  return get<EpisodeSeriesData>(`/api/v1/episodes/series/${seriesSlug}`, {
    lang: formatLanguage(language),
  });
};

export const fetchEpisode = async (
  slug: string,
  language: 'en' | 'zh' = 'en',
): Promise<EpisodeData | null> => {
  if (!slug) return null;
  return get<EpisodeData>(`/api/v1/episodes/${slug}`, {
    lang: formatLanguage(language),
    fingerprint: getClientFingerprint(),
  });
};

export const updateEpisodeLikes = async (
  id: string,
  increment: boolean = true,
  language: 'en' | 'zh' = 'en',
): Promise<UpdateBlogLikesResponse> => {
  return post<UpdateBlogLikesResponse>(`/api/v1/episodes/${id}/likes?lang=${formatLanguage(language)}`, {
    increment,
    fingerprint: getClientFingerprint(),
    user_agent_full: navigator.userAgent,
    referrer: document.referrer,
  });
};

export const listEpisodeComments = async (
  episodeId: string,
  fingerprint?: string,
  language: 'en' | 'zh' = 'en',
): Promise<BlogCommentData[]> => {
  const params: any = {
    lang: formatLanguage(language),
  };
  if (fingerprint) params.fingerprint = fingerprint;
  const res = await get<BlogCommentListResponse>(`/api/v1/episodes/${episodeId}/comments`, params);
  return res?.comments ?? [];
};

export const createEpisodeComment = async (
  episodeId: string,
  authorName: string,
  authorEmail: string,
  content: string,
  fingerprint: string,
  language: 'en' | 'zh' = 'en',
  parentId?: string,
): Promise<BlogCommentData> => {
  return post<BlogCommentData>(`/api/v1/episodes/${episodeId}/comments`, {
    author_name: authorName,
    author_email: authorEmail,
    content,
    fingerprint,
    lang: formatLanguage(language),
    ...(parentId ? { parent_id: parentId } : {}),
  });
};
