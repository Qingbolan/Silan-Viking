import { get, formatLanguage } from '../utils';
import { fetchMoments } from '../moments/momentApi';

export type SearchResultKind = 'blog' | 'episode' | 'project' | 'moment';

export interface GlobalSearchRequest {
  query: string;
  type?: 'all' | SearchResultKind;
  limit?: number;
}

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  title: string;
  description: string;
  path: string;
  tags: string[];
  date?: string;
  context?: string;
}

export type SearchResultGroups = Record<SearchResultKind, SearchResult[]>;
export type SearchResultCounts = Record<SearchResultKind, number>;

export interface GlobalSearchResponse {
  groups: SearchResultGroups;
  counts: SearchResultCounts;
  total: number;
  partialFailures: SearchResultKind[];
}

const KINDS: SearchResultKind[] = ['blog', 'episode', 'project', 'moment'];

const emptyGroups = (): SearchResultGroups => ({
  blog: [],
  episode: [],
  project: [],
  moment: [],
});

const emptyCounts = (): SearchResultCounts => ({
  blog: 0,
  episode: 0,
  project: 0,
  moment: 0,
});

interface SearchSlice {
  items: SearchResult[];
  total: number;
}

const searchBlog = async (
  query: string,
  language: 'en' | 'zh',
  limit: number,
  signal?: AbortSignal,
): Promise<SearchSlice> => {
  const response = await get<any>('/api/v1/blog/search', {
    query,
    lang: formatLanguage(language),
    page: 1,
    size: limit,
  }, { signal });
  return {
    total: Number(response.total ?? 0),
    items: (response.posts ?? []).map((post: any): SearchResult => ({
      id: String(post.id),
      kind: 'blog',
      title: String(post.title || ''),
      description: String(post.summary || ''),
      path: `/blog/${post.slug || post.id}/`,
      tags: Array.isArray(post.tags) ? post.tags : [],
      date: post.publish_date || undefined,
      context: post.category || undefined,
    })),
  };
};

const searchProjects = async (
  query: string,
  language: 'en' | 'zh',
  limit: number,
  signal?: AbortSignal,
): Promise<SearchSlice> => {
  const response = await get<any>('/api/v1/projects', {
    search: query,
    lang: formatLanguage(language),
    page: 1,
    size: limit,
  }, { signal });
  return {
    total: Number(response.total ?? 0),
    items: (response.projects ?? []).map((project: any): SearchResult => ({
      id: String(project.id),
      kind: 'project',
      title: String(project.name || project.title || ''),
      description: String(project.description || ''),
      path: `/projects/${project.slug || project.id}`,
      tags: Array.isArray(project.tags) ? project.tags : [],
      date: project.updated_at || undefined,
      context: project.status || undefined,
    })),
  };
};

const searchMoments = async (
  query: string,
  language: 'en' | 'zh',
  limit: number,
): Promise<SearchSlice> => {
  const searchLower = query.toLowerCase();
  const moments = (await fetchMoments(language)).filter((moment) => {
    const haystack = [
      moment.title,
      moment.description,
      moment.status,
      moment.type,
      moment.moment_type,
      ...(moment.tags ?? []),
    ].join(' ').toLowerCase();
    return haystack.includes(searchLower);
  });
  return {
    total: moments.length,
    items: moments.slice(0, limit).map((moment): SearchResult => ({
      id: moment.id,
      kind: 'moment',
      title: moment.title,
      description: moment.description || '',
      path: `/moments?id=${encodeURIComponent(moment.slug || moment.id)}`,
      tags: Array.isArray(moment.tags) ? moment.tags : [],
      date: moment.date || moment.updated_at || moment.created_at || undefined,
      context: moment.status || moment.type || undefined,
    })),
  };
};

const searchEpisodes = async (
  query: string,
  language: 'en' | 'zh',
  limit: number,
  signal?: AbortSignal,
): Promise<SearchSlice> => {
  const response = await get<any>('/api/v1/episodes/search', {
    query,
    lang: formatLanguage(language),
    page: 1,
    size: limit,
  }, { signal });
  return {
    total: Number(response.total ?? 0),
    items: (response.episodes ?? []).map((episode: any): SearchResult => ({
      id: String(episode.id),
      kind: 'episode',
      title: String(episode.title || ''),
      description: String(episode.description || ''),
      path: `/episodes/${episode.slug}`,
      tags: [],
      date: episode.publish_date || undefined,
      context: episode.episode_number
        ? `${language === 'zh' ? '第' : 'Episode '}${episode.episode_number}${language === 'zh' ? '集' : ''}`
        : undefined,
    })),
  };
};

const searchers: Record<
  SearchResultKind,
  (query: string, language: 'en' | 'zh', limit: number, signal?: AbortSignal) => Promise<SearchSlice>
> = {
  blog: searchBlog,
  episode: searchEpisodes,
  project: searchProjects,
  moment: searchMoments,
};

/**
 * Search every authored content type. Each backend is an independent slice:
 * one unavailable slice is reported without discarding the successful ones.
 */
export const globalSearch = async (
  params: GlobalSearchRequest,
  language: 'en' | 'zh' = 'en',
  signal?: AbortSignal,
): Promise<GlobalSearchResponse> => {
  const query = params.query.trim();
  const groups = emptyGroups();
  const counts = emptyCounts();
  if (!query) return { groups, counts, total: 0, partialFailures: [] };

  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  const requestedKinds = params.type && params.type !== 'all' ? [params.type] : KINDS;
  const settled = await Promise.allSettled(
    requestedKinds.map((kind) => searchers[kind](query, language, limit, signal)),
  );

  const partialFailures: SearchResultKind[] = [];
  settled.forEach((result, index) => {
    const kind = requestedKinds[index];
    if (result.status === 'fulfilled') {
      groups[kind] = result.value.items;
      counts[kind] = result.value.total;
    } else {
      partialFailures.push(kind);
    }
  });

  if (partialFailures.length === requestedKinds.length) {
    throw new Error('Search service is unavailable');
  }

  return {
    groups,
    counts,
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    partialFailures,
  };
};
