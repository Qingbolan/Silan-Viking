import { get, formatLanguage } from '../utils';
import type { EpisodeData, EpisodeSeriesData, EpisodeSeriesListResponse } from '../../types/episode';

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
  });
};
