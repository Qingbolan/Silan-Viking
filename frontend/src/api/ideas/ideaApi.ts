import type { IdeaData } from '../../types';
import { get, post, del, formatLanguage } from '../utils';
import { mapContentParts } from '../contentParts';
import { type PaginationRequest, type SearchRequest, type ListResponse } from '../config';

// Backend API request/response types
interface IdeaListRequest extends PaginationRequest {
  status?: string;
  category?: string;
  difficulty?: string;
  collaboration?: boolean;
  funding?: string;
  search?: string;
  tags?: string;
}

interface IdeaListResponse extends ListResponse<IdeaData> {
  ideas: IdeaData[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}


interface IdeaSearchRequest extends SearchRequest {
  query?: string;
  category?: string;
  status?: string;
  tags?: string;
}

const normalizeContentDate = (value?: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1) return '';
  return value;
};


// API Functions

/**
 * Get ideas list with pagination and filtering
 */
export const fetchIdeas = async (
  params: Partial<IdeaListRequest> = {},
  language: 'en' | 'zh' = 'en'
): Promise<IdeaData[]> => {
  const response = await get<IdeaListResponse>('/api/v1/ideas', {
    ...params,
    lang: formatLanguage(language)
  });

  // Ensure consistent data structure and transform snake_case to camelCase
  const ideas = (response.ideas || []).map((idea: any) => ({
    ...idea,
    tags: idea.tags || [],
    createdAt: normalizeContentDate(idea.created_at || idea.createdAt),
    lastUpdated: normalizeContentDate(idea.last_updated || idea.lastUpdated)
  }));

  return ideas;
};

/**
 * Get single idea by ID
 */
export const fetchIdeaById = async (id: string, language: 'en' | 'zh' = 'en'): Promise<IdeaData | null> => {
  const response = await get<any>(`/api/v1/ideas/${id}`, {
    lang: formatLanguage(language)
  });

  if (!response) return null;

  // Transform snake_case to camelCase for frontend compatibility
  return {
    ...response,
    tags: response.tags || [],
    createdAt: normalizeContentDate(response.created_at || response.createdAt),
    lastUpdated: normalizeContentDate(response.last_updated || response.lastUpdated),
    abstractZh: response.abstract_zh || response.abstractZh,
    hypothesisZh: response.hypothesis_zh || response.hypothesisZh,
    motivationZh: response.motivation_zh || response.motivationZh,
    progress: response.progress || response.methodology, // fallback if backend uses progress or methodology
    progressZh: response.progress_zh || response.progressZh || response.methodology_zh,
    methodologyZh: response.methodology_zh || response.methodologyZh,
    preliminaryResultsZh: response.preliminary_results_zh || response.preliminaryResultsZh,
    results: response.results || response.preliminary_results || response.preliminaryResults,
    resultsZh: response.results_zh || response.preliminary_results_zh || response.preliminaryResultsZh,
    futureDirections: response.future_directions || response.futureDirections,
    futureDirectionsZh: response.future_directions_zh || response.futureDirectionsZh,
    reference: response.reference || response.references,
    referenceZh: response.reference_zh || response.referenceZh,
    relatedWorks: response.related_works || response.relatedWorks,
    // The data-driven Part list — the detail page renders tabs from here.
    parts: mapContentParts(response.parts),
  };
};


/**
 * Search ideas with filters
 */
export const searchIdeas = async (
  params: IdeaSearchRequest,
  language: 'en' | 'zh' = 'en'
): Promise<IdeaData[]> => {
  const response = await get<any>('/api/v1/ideas/search', {
    ...params,
    lang: formatLanguage(language)
  });

  // Ensure consistent data structure and transform snake_case to camelCase
  const ideas = (response.ideas || []).map((idea: any) => ({
    ...idea,
    tags: idea.tags || [],
    createdAt: normalizeContentDate(idea.created_at || idea.createdAt),
    lastUpdated: normalizeContentDate(idea.last_updated || idea.lastUpdated)
  }));

  return ideas;
};

/** Domain lifecycle labels in their canonical progression order. */
export const getIdeaStatuses = (language: 'en' | 'zh' = 'en'): string[] => {
  const statuses = ['draft', 'hypothesis', 'experimenting', 'validating', 'published', 'concluded'];

  if (language === 'zh') {
    return statuses.map(status => {
      switch (status) {
        case 'draft': return '草案';
        case 'hypothesis': return '假设';
        case 'experimenting': return '实验中';
        case 'validating': return '验证中';
        case 'published': return '已发表';
        case 'concluded': return '已结论';
        default: return status;
      }
    });
  }

  return statuses;
};

// ----- Comments API (mirror blog) -----
export interface IdeaCommentData {
  id: string;
  idea_id: string;
  parent_id?: string;
  author_name: string;
  author_avatar_url?: string;
  content: string;
  type: string;
  created_at: string;
  can_delete: boolean;
  likes_count: number;
  is_liked_by_user: boolean;
  replies?: IdeaCommentData[];
}

interface IdeaCommentListResponse {
  comments: IdeaCommentData[];
  total: number;
}

export const listIdeaComments = async (
  ideaId: string,
  type: string = 'general',
  fingerprint?: string,
  language: 'en' | 'zh' = 'en'
): Promise<IdeaCommentData[]> => {
  const params: any = {
    type,
    lang: formatLanguage(language)
  };
  if (fingerprint) params.fingerprint = fingerprint;
  const res = await get<IdeaCommentListResponse>(`/api/v1/ideas/${ideaId}/comments`, params);
  return res?.comments ?? [];
};

export const createIdeaComment = async (
  ideaId: string,
  content: string,
  fingerprint: string,
  options?: {
    type?: string;
    authorName?: string;
    authorEmail?: string;
    parentId?: string;
    language?: 'en' | 'zh';
  }
): Promise<IdeaCommentData> => {
  const body: any = {
    content,
    type: options?.type || 'general',
    fingerprint,
  };
  if (options?.authorName && options.authorName.trim()) body.author_name = options.authorName.trim();
  if (options?.authorEmail && options.authorEmail.trim()) body.author_email = options.authorEmail.trim();
  if (options?.parentId && options.parentId.trim()) body.parent_id = options.parentId.trim();

  if (body.author_name || body.author_email) {
    if (!body.author_name || typeof body.author_name !== 'string' || !body.author_name.trim()) {
      throw new Error('author_name is required');
    }
    if (!body.author_email || typeof body.author_email !== 'string' || body.author_email.trim().length < 5 || !body.author_email.includes('@')) {
      throw new Error('author_email is required and must be valid');
    }
  }

  // Add language as query parameter
  const url = `/api/v1/ideas/${ideaId}/comments?lang=${formatLanguage(options?.language || 'en')}`;
  const res = await post<IdeaCommentData>(url, body);
  return res;
};

interface LikeCommentResponse { likes_count: number; is_liked_by_user: boolean }

export const likeIdeaComment = async (
  commentId: string,
  fingerprint?: string,
  language: 'en' | 'zh' = 'en'
): Promise<LikeCommentResponse> => {
  const data: any = { lang: formatLanguage(language) };
  if (fingerprint) data.fingerprint = fingerprint;
  const res = await post<LikeCommentResponse>(`/api/v1/ideas/comments/${commentId}/like`, data);
  return res;
};

export const deleteIdeaComment = async (
  commentId: string,
  payload: { fingerprint: string; language?: 'en' | 'zh' }
): Promise<void> => {
  await del(`/api/v1/ideas/comments/${commentId}`, {
    fingerprint: payload.fingerprint,
  });
};
