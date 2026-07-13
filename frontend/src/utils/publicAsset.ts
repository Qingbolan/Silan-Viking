const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const PUBLIC_ORIGIN = trimTrailingSlash(import.meta.env.VITE_PUBLIC_ORIGIN || 'https://silan.tech');

export const PUBLIC_BASE = `/${(import.meta.env.BASE_URL || '/').replace(/^\/+|\/+$/g, '')}`;

const normalizedBase = PUBLIC_BASE === '/' ? '' : PUBLIC_BASE;

export const siteUrl = (path: string = '/'): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedBase && (normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`))) {
    return `${PUBLIC_ORIGIN}${normalizedPath}`;
  }
  if (normalizedPath === '/') return `${PUBLIC_ORIGIN}${normalizedBase || '/'}`;
  return `${PUBLIC_ORIGIN}${normalizedBase}${normalizedPath}`;
};

export const publicAssetUrl = (path: string): string => {
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (normalizedBase && (normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}/`))) {
    return normalizedPath;
  }
  return `${normalizedBase}${normalizedPath}` || '/';
};
