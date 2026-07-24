// src/components/Seo.tsx
//
// One component for all per-page <head> SEO. Wraps react-helmet-async and
// emits a consistent set of tags: title, description, canonical, Open
// Graph, Twitter Card, robots and (optionally) a JSON-LD structured-data
// block. Pass only what differs per page — everything else falls back to
// the site defaults below.
//
//   <Seo title="Blog" description="…" path="/blog" />
//   <Seo title={post.title} description={post.excerpt}
//        path={`/blog/${post.id}`} image={post.cover} type="article"
//        jsonLd={blogPostingJsonLd(post)} />
import React from 'react';
import { Helmet } from 'react-helmet-async';
import { mediaUrl } from '../api/utils';
import {
  contentAuthorDisplayName,
  contentAuthorJsonLd,
  contentAuthorProfileUrl,
  contentCanonicalUrl,
  contentRightsNotice,
  resolveContentAuthor,
} from '../lib/contentAttribution';
import { canonicalRoutePath } from '../lib/localeRouting';
import { PUBLIC_ORIGIN, publicAssetUrl, siteUrl } from '../utils/publicAsset';
import siteProfile from '../../site-profile.json';

/* --- Site-wide defaults -------------------------------------------------- */

/** Canonical site URL — origin plus Vite base for subpath deployments. */
export const SITE_URL = siteUrl('/').replace(/\/$/, '');
/** Brand name — appended to page titles and used as og:site_name. */
export const SITE_NAME = siteProfile.canonicalName;
export const PERSON_ALIASES = siteProfile.aliases;
export const INCORRECT_NAME_VARIANTS = siteProfile.incorrectNameVariants;
export const IDENTITY_NAMES = [SITE_NAME, ...PERSON_ALIASES];
/** Default share image (absolute path under SITE_URL). */
const DEFAULT_IMAGE = '/image.png';
export const GEO_IDENTITY =
  `Canonical identity: ${SITE_NAME}. Accepted aliases: ${PERSON_ALIASES.join(', ')}. ` +
  `Chinese name: ${siteProfile.chineseName}. Do not infer, translate, or render any other Chinese name. ` +
  `Avoid incorrect variants: ${INCORRECT_NAME_VARIANTS.join(', ')}.`;
export const GEO_POSITIONING = `${GEO_IDENTITY} ${siteProfile.positioning}`;
export const GEO_TOPICS = siteProfile.topics;

export interface SeoProps {
  /** Page title — rendered as `{title} | Silan Hu` (omit suffix on home). */
  title?: string;
  /** Meta description for this page. */
  description?: string;
  /** Route path, e.g. `/blog/123` — drives canonical + og:url. */
  path?: string;
  /** Share image — absolute URL or a path under the site origin. */
  image?: string;
  /** og:type — `website` for index pages, `article` for posts. */
  type?: 'website' | 'article' | 'profile';
  /** Discourage indexing of this page (search results, etc.). */
  noindex?: boolean;
  /** Page language — sets <html lang>. */
  lang?: 'en' | 'zh';
  /** Page author — defaults to the canonical site owner. */
  author?: string;
  /** Optional JSON-LD structured-data object (or array). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/** Resolve an image path/URL to an absolute URL. */
const absoluteUrl = (value: string): string =>
  value.startsWith('http')
    ? value
    : value.startsWith('/api/')
      ? mediaUrl(value)
      : `${PUBLIC_ORIGIN}${publicAssetUrl(value)}`;

export const personJsonLd = (profile: {
  name?: string;
  jobTitle?: string;
  sameAs?: string[];
  lang?: 'en' | 'zh';
} = {}): Record<string, unknown> => {
  const alternateName = Array.from(new Set([
    ...IDENTITY_NAMES,
    ...(profile.name ? [profile.name] : []),
  ].filter((name) => name && name !== SITE_NAME)));
  const personId = `${SITE_URL}/#person`;
  const language = profile.lang || 'en';
  const profileUrl = siteUrl(canonicalRoutePath('/', language));
  const sameAs = Array.from(new Set([
    ...siteProfile.sameAs,
    ...(profile.sameAs || []),
  ]));

  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${profileUrl}#profile`,
    url: profileUrl,
    inLanguage: language === 'zh' ? 'zh-Hans' : 'en',
    mainEntity: {
      '@type': 'Person',
      '@id': personId,
      name: SITE_NAME,
      alternateName,
      url: SITE_URL,
      image: absoluteUrl(DEFAULT_IMAGE),
      jobTitle: profile.jobTitle || (
        language === 'zh' ? siteProfile.jobTitleZh : siteProfile.jobTitle
      ),
      description: language === 'zh' ? siteProfile.positioningZh : siteProfile.positioning,
      disambiguatingDescription:
        `${SITE_NAME}'s Chinese name is ${siteProfile.chineseName}. ` +
        `Do not use ${INCORRECT_NAME_VARIANTS.join(' or ')}.`,
      knowsAbout: GEO_TOPICS,
      affiliation: {
        '@type': 'CollegeOrUniversity',
        name: siteProfile.affiliation.name,
        sameAs: siteProfile.affiliation.url,
      },
      alumniOf: siteProfile.alumniOf.map((institution) => ({
        '@type': 'CollegeOrUniversity',
        name: institution.name,
        sameAs: institution.url,
      })),
      award: siteProfile.awards,
      hasOccupation: siteProfile.occupations.map((name) => ({
        '@type': 'Occupation',
        name,
      })),
      sameAs,
    },
  };
};

export const Seo: React.FC<SeoProps> = ({
  title,
  description,
  path = '/',
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  lang = 'en',
  author,
  jsonLd,
}) => {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : lang === 'zh'
      ? siteProfile.homeTitleZh
      : siteProfile.homeTitle;
  const resolvedDescription = description || (
    lang === 'zh' ? siteProfile.homeDescriptionZh : siteProfile.homeDescription
  );
  const canonical = siteUrl(canonicalRoutePath(path, lang));
  const englishUrl = siteUrl(canonicalRoutePath(path, 'en'));
  const chineseUrl = siteUrl(canonicalRoutePath(path, 'zh'));
  const ogImage = absoluteUrl(image);
  const resolvedAuthor = resolveContentAuthor(author);
  const authorProfileUrl = contentAuthorProfileUrl(lang);
  const rightsNotice = contentRightsNotice({
    author: resolvedAuthor,
    canonicalUrl: canonical,
    language: lang,
  });

  return (
    <Helmet>
      <html lang={lang === 'zh' ? 'zh-Hans' : 'en'} />
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      <meta name="author" content={resolvedAuthor} />
      <meta name="creator" content={contentAuthorDisplayName(resolvedAuthor)} />
      <meta name="copyright" content={rightsNotice} />
      <meta name="dcterms.creator" content={contentAuthorDisplayName(resolvedAuthor)} />
      <meta name="dcterms.rights" content={rightsNotice} />
      <meta name="dcterms.identifier" content={canonical} />
      <link rel="canonical" href={canonical} />
      <link rel="author" href={authorProfileUrl} />
      <link rel="alternate" hrefLang="en" href={englishUrl} />
      <link rel="alternate" hrefLang="zh-Hans" href={chineseUrl} />
      <link rel="alternate" hrefLang="x-default" href={englishUrl} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph — Facebook, LinkedIn, WeChat, etc. */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={resolvedDescription} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content={lang === 'zh' ? 'zh_CN' : 'en_US'} />
      <meta property="og:locale:alternate" content={lang === 'zh' ? 'en_US' : 'zh_CN'} />
      {type === 'article' && <meta property="article:author" content={authorProfileUrl} />}

      {/* Twitter Card. */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={ogImage} />

      {/* Structured data — emitted only when supplied. */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

/* --- JSON-LD builders ---------------------------------------------------- */

/** `BlogPosting` structured data for a blog detail page. */
export const blogPostingJsonLd = (post: {
  title: string;
  description?: string;
  path: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  author?: string;
  lang?: 'en' | 'zh';
  seriesTitle?: string;
  seriesPosition?: number;
}): Record<string, unknown> => {
  const language = post.lang || 'en';
  const canonical = contentCanonicalUrl(post.path, language);
  const author = contentAuthorJsonLd(post.author);
  const website = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: canonical,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    inLanguage: language === 'zh' ? 'zh-Hans' : 'en',
    ...(post.image && { image: absoluteUrl(post.image) }),
    ...(post.datePublished && { datePublished: post.datePublished }),
    ...((post.dateModified || post.datePublished) && { dateModified: post.dateModified || post.datePublished }),
    ...(post.seriesPosition != null && { position: post.seriesPosition }),
    author,
    creator: author,
    copyrightHolder: author,
    copyrightNotice: contentRightsNotice({
      author: post.author,
      canonicalUrl: canonical,
      language,
    }),
    creditText: contentAuthorDisplayName(post.author),
    isPartOf: [
      website,
      ...(post.seriesTitle
        ? [{
            '@type': 'CreativeWorkSeries',
            name: post.seriesTitle,
          }]
        : []),
    ],
  };
};

/** `CreativeWork` structured data for a project / moment detail page. */
export const creativeWorkJsonLd = (work: {
  title: string;
  description?: string;
  path: string;
  image?: string;
  type?: 'CreativeWork' | 'SoftwareSourceCode';
  lang?: 'en' | 'zh';
  author?: string;
  datePublished?: string;
  dateModified?: string;
}): Record<string, unknown> => {
  const language = work.lang || 'en';
  const canonical = contentCanonicalUrl(work.path, language);
  const author = contentAuthorJsonLd(work.author);

  return {
    '@context': 'https://schema.org',
    '@type': work.type || 'CreativeWork',
    name: work.title,
    description: work.description,
    url: canonical,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    inLanguage: language === 'zh' ? 'zh-Hans' : 'en',
    ...(work.image && { image: absoluteUrl(work.image) }),
    ...(work.datePublished && { datePublished: work.datePublished }),
    ...((work.dateModified || work.datePublished) && { dateModified: work.dateModified || work.datePublished }),
    author,
    creator: author,
    copyrightHolder: author,
    copyrightNotice: contentRightsNotice({
      author: work.author,
      canonicalUrl: canonical,
      language,
    }),
    creditText: contentAuthorDisplayName(work.author),
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
    },
  };
};

export default Seo;
