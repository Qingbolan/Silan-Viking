/**
 * Resolve a concrete URL to its primary information-architecture route.
 * Episodes are authored as their own content type, but visitors discover and
 * navigate them through Writing/Blog.
 */
export const primaryNavigationPath = (pathname: string): string =>
  pathname.startsWith('/episodes/') ? '/blog' : pathname;

export const isNavigationPathActive = (pathname: string, routePath: string): boolean => {
  const effectivePath = primaryNavigationPath(pathname);
  return routePath === '/'
    ? effectivePath === '/'
    : effectivePath === routePath || effectivePath.startsWith(`${routePath}/`);
};
