import { get } from './utils';

interface VisitorGeoResponse {
  country_code?: string;
}

export const fetchVisitorCountryCode = async (): Promise<string | undefined> => {
  try {
    const response = await get<VisitorGeoResponse>('/api/v1/geo');
    return response?.country_code || undefined;
  } catch {
    return undefined;
  }
};
