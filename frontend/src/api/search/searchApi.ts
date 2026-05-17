import { get, formatLanguage } from '../utils';
import type { BlogData } from '../../components/BlogStack/types/blog';
import type { IdeaData } from '../../types';
import type { ProjectDetail } from '../../types/api';

export interface GlobalSearchRequest {
  query: string;
  type?: 'all' | 'blog' | 'project' | 'idea';
  limit?: number;
}

export interface GlobalSearchResponse {
  blogs: BlogData[];
  projects: ProjectDetail[];
  ideas: IdeaData[];
  total: number;
}

/**
 * Global search across all content types
 */
export const globalSearch = async (
  params: GlobalSearchRequest,
  language: 'en' | 'zh' = 'en'
): Promise<GlobalSearchResponse> => {
  const { query, type = 'all', limit = 10 } = params;

  if (!query || query.trim() === '') {
    return {
      blogs: [],
      projects: [],
      ideas: [],
      total: 0
    };
  }

  const results: GlobalSearchResponse = {
    blogs: [],
    projects: [],
    ideas: [],
    total: 0
  };

  try {
    // Search blogs
    if (type === 'all' || type === 'blog') {
      const blogResponse = await get<any>('/api/v1/blog/search', {
        query,
        lang: formatLanguage(language),
        page: 1,
        size: limit
      });

      results.blogs = (blogResponse.posts || []).map((post: any) => ({
        ...post,
        tags: post.tags || [],
        publishDate: post.publish_date,
        readTime: post.read_time
      }));
    }

    // Search projects
    if (type === 'all' || type === 'project') {
      const projectResponse = await get<any>('/api/v1/projects/search', {
        query,
        lang: formatLanguage(language),
        page: 1,
        size: limit
      });

      results.projects = (projectResponse.projects || projectResponse || []);
    }

    // Search ideas
    if (type === 'all' || type === 'idea') {
      const ideaResponse = await get<any>('/api/v1/ideas/search', {
        query,
        lang: formatLanguage(language),
        page: 1,
        size: limit
      });

      results.ideas = (ideaResponse.ideas || []).map((idea: any) => ({
        ...idea,
        tags: idea.tags || [],
        createdAt: idea.created_at || idea.createdAt,
        lastUpdated: idea.last_updated || idea.lastUpdated
      }));
    }

    results.total = results.blogs.length + results.projects.length + results.ideas.length;

    return results;
  } catch (error) {
    console.error('Global search error:', error);
    return results;
  }
};
