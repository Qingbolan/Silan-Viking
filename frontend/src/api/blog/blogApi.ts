import type { BlogData, BlogLiker } from '../../components/BlogStack/types/blog';
import { get, post, formatLanguage, del, apiUrl } from '../utils';
import { type PaginationRequest } from '../config';
import { processRawContent } from '../../utils/markdownParser';
import { getClientFingerprint } from '../../utils/fingerprint';
import { isPrerenderRuntime } from '../../utils/runtimeContext';

// Backend API request/response types
interface BlogListRequest extends PaginationRequest {
  status?: string;
  content_type?: string;
  featured?: boolean;
  tag?: string;
  category?: string;
  author?: string;
  search?: string;
}

export interface UpdateBlogLikesResponse {
  likes: number;
  is_liked_by_user: boolean;
  likers: BlogLiker[];
}

// API functions

const mapBlogData = (post: any, content?: BlogData['content']): BlogData => ({
  ...post,
  tags: post.tags || [],
  ...(content ? { content } : {}),
  seriesId: post.series_id,
  seriesSlug: post.series_slug,
  seriesTitle: post.series_title,
  seriesTitleZh: post.series_title_zh,
  seriesDescription: post.series_description,
  seriesDescriptionZh: post.series_description_zh,
  episodeNumber: post.episode_number,
  totalEpisodes: post.total_episodes,
  seriesImage: post.series_image,
  publishDate: post.publish_date,
  readTime: post.read_time,
  isLikedByUser: Boolean(post.is_liked_by_user ?? post.isLikedByUser),
}) as BlogData;

/**
 * Get blog posts list with pagination and filtering
 */
export const fetchBlogPosts = async (
  params: Partial<BlogListRequest> = {},
  language: 'en' | 'zh' = 'en'
): Promise<BlogData[]> => {
  const response = await get<any>('/api/v1/blog/posts', {
    ...params,
    lang: formatLanguage(language)
  });
  
  // Ensure consistent data structure and map fields
  const posts = (response.posts || []).map((post: any) => mapBlogData(post));
  
  return posts;
};

/**
 * Get single blog post by slug or ID
 */
export const fetchBlogById = async (slugOrId: string, language: 'en' | 'zh' = 'en'): Promise<BlogData | null> => {
  if (!slugOrId.trim()) return null;
  const endpoint = slugOrId.startsWith('i_')
    ? `/api/v1/blog/posts/id/${slugOrId}`
    : `/api/v1/blog/posts/${slugOrId}`;
  const response = await get<any>(endpoint, {
    lang: formatLanguage(language),
    fingerprint: getClientFingerprint(),
  });
  if (!response) return null;
  const processedContent = response.content ? processRawContent(response.content) : [];
  return mapBlogData(response, processedContent);
};

/**
 * Update blog views
 */
export const updateBlogViews = async (id: string, language: 'en' | 'zh' = 'en'): Promise<boolean> => {
  if (isPrerenderRuntime()) return false;

  try {
    const response = await fetch(apiUrl(`/api/v1/blog/posts/${id}/views?lang=${formatLanguage(language)}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fingerprint: getClientFingerprint(),
        user_agent_full: navigator.userAgent,
        referrer: document.referrer,
        landing_url: window.location.href,
      }),
    });
    
    if (!response.ok) {
      console.warn(`Failed to update blog views: ${response.status} ${response.statusText}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Failed to update blog views (non-critical):', error);
    return false;
  }
};

/**
 * Update blog likes
 */
export const updateBlogLikes = async (id: string, increment: boolean = true, language: 'en' | 'zh' = 'en'): Promise<UpdateBlogLikesResponse> => {
  const response = await post<UpdateBlogLikesResponse>(`/api/v1/blog/posts/${id}/likes?lang=${formatLanguage(language)}`, {
    increment,
    fingerprint: getClientFingerprint(),
    user_agent_full: navigator.userAgent,
    referrer: document.referrer,
  });
  return response;
};

// ----- Comments API -----
export interface BlogCommentData {
  id: string;
  blog_post_id: string;
  parent_id?: string;
  author_name: string;
  author_avatar_url?: string;
  auth_provider?: string;
  country_code?: string;
  content: string;
  created_at: string;
  can_delete: boolean;
  likes_count: number;
  is_liked_by_user: boolean;
  replies?: BlogCommentData[];
}

export interface BlogCommentListResponse {
  comments: BlogCommentData[];
  total: number;
}

export const listBlogComments = async (
  postId: string,
  fingerprint?: string,
  language: 'en' | 'zh' = 'en'
): Promise<BlogCommentData[]> => {
  const params: any = {
    lang: formatLanguage(language)
  };

  if (fingerprint) params.fingerprint = fingerprint;

  const res = await get<BlogCommentListResponse>(`/api/v1/blog/posts/${postId}/comments`, params);
  return res?.comments ?? [];
};

export const createBlogComment = async (
  postId: string,
  authorName: string,
  authorEmail: string,
  content: string,
  fingerprint: string,
  language: 'en' | 'zh' = 'en',
  parentId?: string,
): Promise<BlogCommentData> => {
  const res = await post<BlogCommentData>(`/api/v1/blog/posts/${postId}/comments`, {
    author_name: authorName,
    author_email: authorEmail,
    content,
    fingerprint,
    lang: formatLanguage(language),
    ...(parentId ? { parent_id: parentId } : {}),
  });
  return res;
};

export const deleteBlogComment = async (
  commentId: string,
  fingerprint: string,
  language: 'en' | 'zh' = 'en'
): Promise<void> => {
  await del(`/api/v1/blog/comments/${commentId}?lang=${formatLanguage(language)}`, { fingerprint });
};

export interface LikeCommentResponse {
  likes_count: number;
  is_liked_by_user: boolean;
}

export const likeComment = async (
  commentId: string,
  fingerprint?: string,
  language: 'en' | 'zh' = 'en'
): Promise<LikeCommentResponse> => {
  const data: any = {
    lang: formatLanguage(language)
  };

  if (fingerprint) data.fingerprint = fingerprint;

  const res = await post<LikeCommentResponse>(`/api/v1/blog/comments/${commentId}/like`, data);
  return res;
};
