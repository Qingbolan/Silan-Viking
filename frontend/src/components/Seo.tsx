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

/* --- Site-wide defaults -------------------------------------------------- */

/** Canonical origin — every canonical / og:url is built from this. */
export const SITE_URL = 'https://silan.tech';
/** Brand name — appended to page titles and used as og:site_name. */
export const SITE_NAME = 'Silan Hu';
/** Default share image (absolute path under SITE_URL). */
const DEFAULT_IMAGE = '/image.png';
const DEFAULT_DESCRIPTION =
  'Silan Hu (胡思蓝) — AI Researcher and Full Stack Developer specialising in ' +
  'artificial intelligence, machine learning and full-stack development.';

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
  /** Optional JSON-LD structured-data object (or array). */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/** Resolve an image path/URL to an absolute URL. */
const absoluteUrl = (value: string): string =>
  value.startsWith('http') ? value : `${SITE_URL}${value.startsWith('/') ? '' : '/'}${value}`;

export const Seo: React.FC<SeoProps> = ({
  title,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = DEFAULT_IMAGE,
  type = 'website',
  noindex = false,
  lang = 'en',
  jsonLd,
}) => {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — AI Researcher & Full Stack Developer`;
  const canonical = `${SITE_URL}${path}`;
  const ogImage = absoluteUrl(image);

  return (
    <Helmet>
      <html lang={lang} />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph — Facebook, LinkedIn, WeChat, etc. */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:locale" content={lang === 'zh' ? 'zh_CN' : 'en_US'} />

      {/* Twitter Card. */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
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
}): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: post.title,
  description: post.description,
  url: `${SITE_URL}${post.path}`,
  ...(post.image && { image: absoluteUrl(post.image) }),
  ...(post.datePublished && { datePublished: post.datePublished }),
  ...(post.dateModified && { dateModified: post.dateModified }),
  author: { '@type': 'Person', name: post.author || SITE_NAME },
});

/** `CreativeWork` structured data for a project / idea detail page. */
export const creativeWorkJsonLd = (work: {
  title: string;
  description?: string;
  path: string;
  image?: string;
  type?: 'CreativeWork' | 'SoftwareSourceCode';
}): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': work.type || 'CreativeWork',
  name: work.title,
  description: work.description,
  url: `${SITE_URL}${work.path}`,
  ...(work.image && { image: absoluteUrl(work.image) }),
  author: { '@type': 'Person', name: SITE_NAME },
});

export default Seo;
