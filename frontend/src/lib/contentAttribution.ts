import siteProfile from '../../site-profile.json';
import { canonicalRoutePath } from './localeRouting';
import { siteUrl } from '../utils/publicAsset';

export type ContentLanguage = 'en' | 'zh';
export type AttributedContentKind = 'article' | 'project' | 'series';

const canonicalAliases = new Set([
  siteProfile.canonicalName,
  siteProfile.chineseName,
  ...siteProfile.aliases,
]);

export const DEFAULT_CONTENT_AUTHOR = siteProfile.canonicalName;

export const resolveContentAuthor = (author?: string): string => {
  const candidate = author?.trim();
  return candidate || DEFAULT_CONTENT_AUTHOR;
};

export const contentAuthorDisplayName = (author?: string): string => {
  const resolved = resolveContentAuthor(author);
  return canonicalAliases.has(resolved)
    ? `${siteProfile.canonicalName} (${siteProfile.chineseName})`
    : resolved;
};

export const contentCanonicalUrl = (
  path: string,
  language: ContentLanguage,
): string => siteUrl(canonicalRoutePath(path, language));

export const contentAuthorProfileUrl = (
  language: ContentLanguage,
): string => siteUrl(canonicalRoutePath('/', language));

export const contentReproductionNotice = (
  language: ContentLanguage,
): string => language === 'zh'
  ? siteProfile.reproductionNoticeZh
  : siteProfile.reproductionNotice;

export const contentRightsNotice = ({
  author,
  canonicalUrl,
  language,
}: {
  author?: string;
  canonicalUrl: string;
  language: ContentLanguage;
}): string => {
  const displayName = contentAuthorDisplayName(author);
  const reproduction = contentReproductionNotice(language);
  return language === 'zh'
    ? `© ${displayName}。${reproduction}原始链接：${canonicalUrl}`
    : `© ${displayName}. ${reproduction} Canonical source: ${canonicalUrl}`;
};

export const contentAttributionLabels = (
  language: ContentLanguage,
  kind: AttributedContentKind,
): {
  heading: string;
  author: string;
  reproduction: string;
  canonical: string;
} => {
  if (language === 'zh') {
    const kindLabel = {
      article: '文章',
      project: '项目',
      series: '系列',
    }[kind];
    return {
      heading: `${kindLabel}归属`,
      author: '作者',
      reproduction: '转载说明',
      canonical: '原始链接',
    };
  }

  const kindLabel = {
    article: 'Article',
    project: 'Project',
    series: 'Series',
  }[kind];
  return {
    heading: `${kindLabel} attribution`,
    author: 'Author',
    reproduction: 'Reproduction',
    canonical: 'Canonical source',
  };
};

export const contentAuthorJsonLd = (
  author?: string,
): Record<string, unknown> => {
  const resolved = resolveContentAuthor(author);
  if (!canonicalAliases.has(resolved)) {
    return {
      '@type': 'Person',
      name: resolved,
    };
  }

  return {
    '@type': 'Person',
    '@id': `${siteUrl('/').replace(/\/$/, '')}/#person`,
    name: siteProfile.canonicalName,
    alternateName: Array.from(new Set([
      siteProfile.chineseName,
      ...siteProfile.aliases,
    ])),
    url: siteUrl('/'),
  };
};
