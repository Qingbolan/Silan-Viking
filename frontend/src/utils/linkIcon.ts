const LOCAL_ICON = '/avatar-icon-32.png';

const absoluteUrl = (href: string): URL | null => {
  try {
    const base = typeof window === 'undefined' ? 'https://silan.tech' : window.location.origin;
    return new URL(href, base);
  } catch {
    return null;
  }
};

export const iconSrcForHref = (href: string): string => {
  const url = absoluteUrl(href);
  if (!url || !/^https?:$/.test(url.protocol)) return LOCAL_ICON;

  const currentHost = typeof window === 'undefined' ? 'silan.tech' : window.location.hostname;
  if (!url.hostname || url.hostname === currentHost) return LOCAL_ICON;

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`;
};

