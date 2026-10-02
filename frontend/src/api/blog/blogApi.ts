import type { BlogData, BlogLiker } from '../../components/BlogStack/types/blog';
import { get, post, formatLanguage, del, mediaUrl } from '../utils';
import { type PaginationRequest } from '../config';
import { processRawContent } from '../../utils/markdownParser';
import { getClientFingerprint } from '../../utils/fingerprint';
import { recordContentView } from '../contentViews';
import { normalizeContentTimestamp } from '../../utils/contentTimestamp';

// Backend API request/response types
interface BlogListRequest extends PaginationRequest {
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

type BlogLanguage = 'en' | 'zh';

export const normalizeBlogData = (
  post: any,
  content?: BlogData['content'],
  language: BlogLanguage = 'en',
): BlogData => {
  const rawFeaturedImageUrls = post.featured_image_urls ?? post.featuredImageUrls ?? {};
  const featuredImageUrls = Object.fromEntries(
    Object.entries(rawFeaturedImageUrls)
      .filter(([, value]) => typeof value === 'string' && value.length > 0)
      .map(([locale, value]) => [locale, mediaUrl(value as string)]),
  ) as BlogData['featuredImageUrls'];
  const selectedFeaturedImage = featuredImageUrls?.[language]
    ?? post.featured_image_url
    ?? post.featuredImageUrl;
  const videoThumbnail = post.video_thumbnail ?? post.videoThumbnail;
  const vlogCover = post.vlog_cover ?? post.vlogCover;
  const coverImage = selectedFeaturedImage || vlogCover || videoThumbnail;
  const publishDate = normalizeContentTimestamp(post.publish_date ?? post.publishDate);
  const updatedAt = normalizeContentTimestamp(post.updated_at ?? post.updatedAt);

  return {
    ...post,
    tags: post.tags || [],
    ...(content ? { content } : {}),
    featuredImageUrls,
    featuredImageUrl: selectedFeaturedImage ? mediaUrl(selectedFeaturedImage) : undefined,
    coverImage: coverImage ? mediaUrl(coverImage) : undefined,
    vlogCover: vlogCover ? mediaUrl(vlogCover) : undefined,
    videoThumbnail: videoThumbnail ? mediaUrl(videoThumbnail) : undefined,
    seriesId: post.series_id,
    seriesSlug: post.series_slug,
    seriesTitle: post.series_title,
    seriesTitleZh: post.series_title_zh,
    seriesDescription: post.series_description,
    seriesDescriptionZh: post.series_description_zh,
    episodeNumber: post.episode_number,
    totalEpisodes: post.total_episodes,
    seriesImage: post.series_image ? mediaUrl(post.series_image) : undefined,
    projectName: post.project_name ?? post.projectName,
    publicationVenue: post.publication_venue ?? post.publicationVenue,
    projectUrl: post.project_url ?? post.projectUrl,
    externalResources: post.external_resources ?? post.externalResources ?? [],
    publish_date: publishDate,
    updated_at: updatedAt,
    publishDate,
    updatedAt,
    readTime: post.read_time,
    isLikedByUser: Boolean(post.is_liked_by_user ?? post.isLikedByUser),
  } as BlogData;
};

export const normalizeBlogResponse = (
  post: any,
  language: BlogLanguage = 'en',
): BlogData | null => {
  if (!post) return null;
  const processedContent = post.content ? processRawContent(post.content) : [];
  return normalizeBlogData(post, processedContent, language);
};

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
  const posts = (response.posts || []).map(
    (post: any) => normalizeBlogData(post, undefined, language),
  );
  
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
  return normalizeBlogResponse(response, language);
};

/**
 * Update blog views
 */
export const updateBlogViews = (id: string, language: 'en' | 'zh' = 'en'): Promise<boolean> =>
  recordContentView(`/api/v1/blog/posts/${encodeURIComponent(id)}/views`, language);

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
  actor_id?: string;
  blog_post_id: string;
  parent_id?: string;
  author_name: string;
  author_avatar_url?: string;
  auth_provider?: string;
  country_code?: string;
  visitor_number?: string;
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
  content: string,
  fingerprint: string,
  language: 'en' | 'zh' = 'en',
  parentId?: string,
): Promise<BlogCommentData> => {
  const res = await post<BlogCommentData>(`/api/v1/blog/posts/${postId}/comments`, {
    author_name: authorName,
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
