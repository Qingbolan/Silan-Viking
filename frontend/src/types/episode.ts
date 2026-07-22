import type { BlogContent } from '../components/BlogStack/types/blog';

export interface EpisodeData {
  id: string;
  series_id: string;
  series_slug: string;
  slug: string;
  title: string;
  description?: string;
  episode_number: number;
  status: string;
  visibility: string;
  publish_date?: string;
  duration_minutes?: number;
  content?: BlogContent[];
  likes?: number;
  is_liked_by_user?: boolean;
}

export interface EpisodeSeriesData {
  id: string;
  slug: string;
  title: string;
  description?: string;
  cover_url?: string;
  status: string;
  episodes: EpisodeData[];
  created_at: string;
  updated_at: string;
}

export interface EpisodeSeriesListResponse {
  series: EpisodeSeriesData[];
  total: number;
}
