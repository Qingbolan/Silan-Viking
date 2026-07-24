import { get } from './utils';

export interface VisitorGeo {
  country_code?: string;
  region_code?: string;
  region_name?: string;
}

export const fetchVisitorGeo = async (): Promise<VisitorGeo> => {
  try {
    return await get<VisitorGeo>('/api/v1/geo') ?? {};
  } catch {
    return {};
  }
};
