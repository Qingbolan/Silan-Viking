import type { BlogData } from '../../components/BlogStack/types/blog';
import { get, post, formatLanguage, del } from '../utils';
import { type PaginationRequest, type SearchRequest } from '../config';
import { processRawContent } from '../../utils/markdownParser';
import { getClientFingerprint } from '../../utils/fingerprint';

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

interface BlogSearchRequest extends SearchRequest {
  query?: string;
  category?: string;
  tags?: string;
  author?: string;
}

interface UpdateBlogLikesResponse {
  likes: number;
}

// API functions

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
  const posts = (response.posts || []).map((post: any) => ({
    ...post,
    tags: post.tags || [],
    publishDate: post.publish_date,
    readTime: post.read_time
  })) as BlogData[];
  
  return posts;
};

/**
 * Get single blog post by slug or ID
 */
export const fetchBlogById = async (slugOrId: string, language: 'en' | 'zh' = 'en'): Promise<BlogData | null> => {
  // Check if input looks like a UUID (ID) or a slug
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  
  // Try the appropriate endpoint based on the input format
  try {
    const endpoint = isUUID 
      ? `/api/v1/blog/posts/id/${slugOrId}`  // Use ID endpoint for UUIDs
      : `/api/v1/blog/posts/${slugOrId}`;    // Use slug endpoint for slugs
      
    const response = await get<any>(endpoint, {
      lang: formatLanguage(language)
    });
    
    if (response) {
      console.log('🔍 Raw API response:', response);
      console.log('🔍 Raw content:', response.content);
      console.log('🔍 Raw content length:', response.content?.length);
      console.log('🔍 First content item:', response.content?.[0]);
      
      // Process the content with markdown parser
      const processedContent = response.content ? processRawContent(response.content) : [];
      console.log('✅ Processed content:', processedContent);
      console.log('✅ Processed content length:', processedContent.length);
      console.log('✅ Content types breakdown:', processedContent.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>));
      
      // Map backend response to frontend structure
      return {
        ...response,
        tags: response.tags || [],
        content: processedContent, // Use processed content instead of raw
        publishDate: response.publish_date,
        readTime: response.read_time
      } as BlogData;
    }
  } catch (error) {
    console.log(`Failed to fetch by ${isUUID ? 'ID' : 'slug'}, will try getting all posts to find the correct slug`);
  }

  // If that fails, fetch all posts to find the correct slug
  try {
    const allPosts = await fetchBlogPosts({}, language);
    const post = allPosts.find(p => p.id === slugOrId);
    
    if (post && post.slug) {
      console.log(`Found post with slug: ${post.slug}`);
      
      // Fetch the full post content using the correct slug
      const response = await get<any>(`/api/v1/blog/posts/${post.slug}`, {
        lang: formatLanguage(language)
      });
      
      if (response) {
        // Process the content with markdown parser
        const processedContent = response.content ? processRawContent(response.content) : [];        
        // Map backend response to frontend structure
        return {
          ...response,
          tags: response.tags || [],
          content: processedContent, // Use processed content instead of raw
          publishDate: response.publish_date,
          readTime: response.read_time
        } as BlogData;
      }
    }
  } catch (error) {
    console.error('Failed to fetch blog post by ID/slug:', error);
  }
  
  return null;
};

/**
 * Search blog posts with filters
 */
export const searchBlogPosts = async (
  params: BlogSearchRequest,
  language: 'en' | 'zh' = 'en'
): Promise<BlogData[]> => {
  const response = await get<any>('/api/v1/blog/search', {
    ...params,
    lang: formatLanguage(language)
  });
  
  // Ensure consistent data structure and map fields
  const posts = (response.posts || []).map((post: any) => ({
    ...post,
    tags: post.tags || [],
    publishDate: post.publish_date,
    readTime: post.read_time
  })) as BlogData[];
  
  return posts;
};

/**
 * Get blog categories
 */
export const getBlogCategories = async (language: 'en' | 'zh' = 'en'): Promise<string[]> => {
  const response = await get<string[]>('/api/v1/blog/categories', {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Get blog tags
 */
export const getBlogTags = async (language: 'en' | 'zh' = 'en'): Promise<string[]> => {
  const response = await get<string[]>('/api/v1/blog/tags', {
    lang: formatLanguage(language)
  });
  return response;
};

/**
 * Update blog views
 */
export const updateBlogViews = async (id: string, language: 'en' | 'zh' = 'en'): Promise<void> => {
  try {
    const response = await fetch(`/api/v1/blog/posts/${id}/views?lang=${formatLanguage(language)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fingerprint: getClientFingerprint(),
        user_agent_full: navigator.userAgent,
        referrer: document.referrer,
      }),
    });
    
    if (!response.ok) {
      console.warn(`Failed to update blog views: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.warn('Failed to update blog views (non-critical):', error);
  }
};

/**
 * Update blog likes
 */
export const updateBlogLikes = async (id: string, increment: boolean = true, language: 'en' | 'zh' = 'en'): Promise<number> => {
  const response = await post<UpdateBlogLikesResponse>(`/api/v1/blog/posts/${id}/likes?lang=${formatLanguage(language)}`, {
    increment,
    fingerprint: getClientFingerprint(),
    user_agent_full: navigator.userAgent,
    referrer: document.referrer,
  });
  return response.likes;
};

// ----- Comments API -----
export interface BlogCommentData {
  id: string;
  blog_post_id: string;
  author_name: string;
  content: string;
  created_at: string;
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
  userIdentityId?: string,
  language: 'en' | 'zh' = 'en'
): Promise<BlogCommentData[]> => {
  const params: any = {
    lang: formatLanguage(language)
  };

  if (fingerprint) params.fingerprint = fingerprint;
  if (userIdentityId) params.user_identity_id = userIdentityId;

  const res = await get<BlogCommentListResponse>(`/api/v1/blog/posts/${postId}/comments`, params);
  return res?.comments ?? [];
};

export const createBlogComment = async (
  postId: string,
  authorName: string,
  authorEmail: string,
  content: string,
  fingerprint: string,
  language: 'en' | 'zh' = 'en'
): Promise<BlogCommentData> => {
  const res = await post<BlogCommentData>(`/api/v1/blog/posts/${postId}/comments`, {
    author_name: authorName,
    author_email: authorEmail,
    content,
    fingerprint,
    lang: formatLanguage(language)
  });
  return res;
};

export const deleteBlogComment = async (
  commentId: string,
  _fingerprint: string,
  language: 'en' | 'zh' = 'en'
): Promise<void> => {
  await del(`/api/v1/blog/comments/${commentId}?lang=${formatLanguage(language)}`);
};

export interface LikeCommentResponse {
  likes_count: number;
  is_liked_by_user: boolean;
}

export const likeComment = async (
  commentId: string,
  fingerprint?: string,
  userIdentityId?: string,
  language: 'en' | 'zh' = 'en'
): Promise<LikeCommentResponse> => {
  const data: any = {
    lang: formatLanguage(language)
  };

  if (fingerprint) data.fingerprint = fingerprint;
  if (userIdentityId) data.user_identity_id = userIdentityId;

  const res = await post<LikeCommentResponse>(`/api/v1/blog/comments/${commentId}/like`, data);
  return res;
};
