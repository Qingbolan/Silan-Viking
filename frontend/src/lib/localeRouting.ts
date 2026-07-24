import type { Language } from '../types/api';

export const DEFAULT_LANGUAGE: Language = 'en';
export const CHINESE_LANGUAGE: Language = 'zh';
export const CHINESE_ROUTE_PREFIX = '/zh';
const LANGUAGE_PREFERENCE_KEY = 'silan.preferredLanguage';

const normalizeDeploymentBase = (value: string): string => {
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
};

export const DEPLOYMENT_BASE_PATH = normalizeDeploymentBase(import.meta.env.BASE_URL || '/');

const stripDeploymentBase = (pathname: string): string => {
  if (!DEPLOYMENT_BASE_PATH) return pathname || '/';
  if (pathname === DEPLOYMENT_BASE_PATH) return '/';
  if (pathname.startsWith(`${DEPLOYMENT_BASE_PATH}/`)) {
    return pathname.slice(DEPLOYMENT_BASE_PATH.length) || '/';
  }
  return pathname || '/';
};

export const languageFromPathname = (pathname: string): Language => {
  const routePath = stripDeploymentBase(pathname);
  return routePath === CHINESE_ROUTE_PREFIX || routePath.startsWith(`${CHINESE_ROUTE_PREFIX}/`)
    ? CHINESE_LANGUAGE
    : DEFAULT_LANGUAGE;
};

export const logicalPathname = (pathname: string): string => {
  const routePath = stripDeploymentBase(pathname);
  if (routePath === CHINESE_ROUTE_PREFIX) return '/';
  if (routePath.startsWith(`${CHINESE_ROUTE_PREFIX}/`)) {
    return routePath.slice(CHINESE_ROUTE_PREFIX.length) || '/';
  }
  return routePath || '/';
};

const splitPathSuffix = (value: string): [string, string] => {
  const suffixIndex = value.search(/[?#]/);
  return suffixIndex === -1
    ? [value, '']
    : [value.slice(0, suffixIndex), value.slice(suffixIndex)];
};

export const localizedRoutePath = (path: string, language: Language): string => {
  const [rawPathname, suffix] = splitPathSuffix(path || '/');
  const normalizedPathname = rawPathname.startsWith('/') ? rawPathname : `/${rawPathname}`;
  const routePath = logicalPathname(normalizedPathname);
  const localizedPathname = language === CHINESE_LANGUAGE
    ? routePath === '/'
      ? `${CHINESE_ROUTE_PREFIX}/`
      : `${CHINESE_ROUTE_PREFIX}${routePath}`
    : routePath;
  return `${localizedPathname}${suffix}`;
};

export const localeBasename = (language: Language): string | undefined => {
  const localePrefix = language === CHINESE_LANGUAGE ? CHINESE_ROUTE_PREFIX : '';
  const basename = `${DEPLOYMENT_BASE_PATH}${localePrefix}`;
  return basename || undefined;
};

export const localizedBrowserHref = (
  language: Language,
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
): string => {
  const routePath = logicalPathname(location.pathname);
  const localizedPath = localizedRoutePath(
    `${routePath}${location.search || ''}${location.hash || ''}`,
    language,
  );
  return `${DEPLOYMENT_BASE_PATH}${localizedPath}` || '/';
};

export const canonicalRoutePath = (path: string, language: Language): string => {
  const localized = localizedRoutePath(path, language);
  const [pathname] = splitPathSuffix(localized);
  if (pathname === '/') return pathname;
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
};

const isSupportedLanguage = (value: string | null): value is Language =>
  value === DEFAULT_LANGUAGE || value === CHINESE_LANGUAGE;

export const preferredLanguage = (): Language | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    return isSupportedLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const rememberPreferredLanguage = (language: Language): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANGUAGE_PREFERENCE_KEY, language);
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
};

const browserLanguage = (): Language => {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language.toLowerCase().startsWith('zh'))
    ? CHINESE_LANGUAGE
    : DEFAULT_LANGUAGE;
};

const hasExplicitChineseRoute = (pathname: string): boolean => {
  const routePath = stripDeploymentBase(pathname);
  return routePath === CHINESE_ROUTE_PREFIX || routePath.startsWith(`${CHINESE_ROUTE_PREFIX}/`);
};

export const initialLanguagePreference = (): Language =>
  preferredLanguage() ?? browserLanguage();

export const initialLocaleRedirectHref = (
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
): string | null => {
  if (typeof window === 'undefined') return null;
  if ((window as unknown as { __SILAN_PRERENDER__?: boolean }).__SILAN_PRERENDER__) return null;
  if (hasExplicitChineseRoute(location.pathname)) return null;
  if (initialLanguagePreference() !== CHINESE_LANGUAGE) return null;
  return localizedBrowserHref(CHINESE_LANGUAGE, location);
};
