import { get, formatLanguage } from '../utils';
import type { RecentUpdate } from '../../types/api';

interface UpdateListResponse {
  updates: RecentUpdate[];
  total: number;
}

export const fetchUpdates = async (language: 'en' | 'zh' = 'en'): Promise<RecentUpdate[]> => {
  const response = await get<UpdateListResponse>('/api/v1/updates', {
    lang: formatLanguage(language),
  });
  return response?.updates ?? [];
};
