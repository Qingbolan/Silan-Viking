import type { Language } from './config';

export const PRERENDER_ROUTE_DATA_SCRIPT_ID = '__SILAN_ROUTE_DATA__';

export type PrerenderResourceKind = 'blog';

export interface PrerenderRouteData {
  route: string;
  resources: Partial<Record<PrerenderResourceKind, Partial<Record<Language, any>>>>;
}

declare global {
  interface Window {
    __SILAN_ROUTE_DATA__?: PrerenderRouteData;
  }
}

const readRouteData = (): PrerenderRouteData | null => {
  if (typeof window === 'undefined') return null;
  const script = document.getElementById(PRERENDER_ROUTE_DATA_SCRIPT_ID);
  const payload = script?.textContent?.trim();
  if (!payload) return window.__SILAN_ROUTE_DATA__ || null;

  try {
    const parsed = JSON.parse(payload) as PrerenderRouteData;
    window.__SILAN_ROUTE_DATA__ = parsed;
    return parsed;
  } catch {
    return null;
  }
};

const matchesResourceKey = (resource: any, resourceKey: string): boolean => {
  const key = decodeURIComponent(resourceKey).trim().replace(/^\/+|\/+$/g, '');
  if (!key) return false;
  const segments = key.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || key;
  return [key, lastSegment].some((candidate) =>
    String(resource?.id || '') === candidate || String(resource?.slug || '') === candidate,
  );
};

export const readPrerenderResource = (
  kind: PrerenderResourceKind,
  resourceKey: string | undefined,
  language: Language,
): any | null => {
  if (!resourceKey) return null;
  const data = readRouteData();
  const localized = data?.resources?.[kind];
  const resource = localized?.[language] ?? localized?.en ?? localized?.zh ?? null;
  return resource && matchesResourceKey(resource, resourceKey) ? resource : null;
};
