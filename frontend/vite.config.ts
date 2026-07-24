import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import siteProfile from './site-profile.json'

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const normalizeBase = (value: string) => {
  if (!value || value === '/') return '/'
  const leading = value.startsWith('/') ? value : `/${value}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

const siteProfileHtml = (publicOrigin: string, publicBase: string) => {
  const base = normalizeBase(publicBase)
  const siteUrl = `${publicOrigin.replace(/\/+$/, '')}${base === '/' ? '' : base.replace(/\/$/, '')}`
  const imageUrl = `${siteUrl}/image.png`
  const homeRightsNotice =
    `© ${siteProfile.canonicalName} (${siteProfile.chineseName}). ` +
    `${siteProfile.reproductionNotice} Canonical source: ${siteUrl}/`
  const profilePageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': `${siteUrl}/#profile`,
    url: `${siteUrl}/`,
    mainEntity: {
      '@type': 'Person',
      '@id': `${siteUrl}/#person`,
      name: siteProfile.canonicalName,
      alternateName: siteProfile.aliases,
      image: imageUrl,
      jobTitle: siteProfile.jobTitle,
      url: `${siteUrl}/`,
      sameAs: siteProfile.sameAs,
      knowsAbout: siteProfile.topics,
      hasOccupation: siteProfile.occupations.map((name) => ({
        '@type': 'Occupation',
        name,
      })),
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
      description: siteProfile.positioning,
      disambiguatingDescription:
        `${siteProfile.canonicalName}'s Chinese name is ${siteProfile.chineseName}. ` +
        `Do not use ${siteProfile.incorrectNameVariants.join(' or ')}.`,
    },
  }

  const replacements: Record<string, string> = {
    __SITE_HOME_TITLE__: escapeHtml(siteProfile.homeTitle),
    __SITE_HOME_DESCRIPTION__: escapeHtml(siteProfile.homeDescription),
    __SITE_HOME_DESCRIPTION_ZH__: escapeHtml(siteProfile.homeDescriptionZh),
    __SITE_CANONICAL_URL__: escapeHtml(`${siteUrl}/`),
    __SITE_ENGLISH_HOME_URL__: escapeHtml(`${siteUrl}/`),
    __SITE_CHINESE_HOME_URL__: escapeHtml(`${siteUrl}/zh/`),
    __SITE_PROFILE_IMAGE__: escapeHtml(imageUrl),
    __SITE_HOME_RIGHTS_NOTICE__: escapeHtml(homeRightsNotice),
    __SITE_POSITIONING__: escapeHtml(siteProfile.positioning),
    __SITE_EVIDENCE__: escapeHtml(siteProfile.evidence),
    __SITE_PROFILE_JSON_LD__: JSON.stringify(profilePageJsonLd).replaceAll('<', '\\u003c'),
  }

  return {
    name: 'site-profile-html',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string) {
        return Object.entries(replacements).reduce(
          (output, [token, value]) => output.replaceAll(token, value),
          html,
        )
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  // Development must read the locally synced database by default; otherwise
  // a frontend restart silently displays silan.tech's older content. A proxy
  // target remains overridable for integration testing and production builds.
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET ||
    (mode === 'development' ? 'http://localhost:5200' : 'https://silan.tech');
  const developmentCountry = env.VITE_DEV_COUNTRY || 'SG';
  const publicOrigin = env.VITE_PUBLIC_ORIGIN || 'https://silan.tech'
  const publicBase = env.VITE_PUBLIC_BASE || '/'

  return {
    base: publicBase,
    plugins: [react(), siteProfileHtml(publicOrigin, publicBase)],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: !apiProxyTarget.startsWith('http://'),
          headers: mode === 'development'
            ? { 'CF-IPCountry': developmentCountry }
            : undefined,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: env.VITE_BUILD_SOURCEMAP === 'true',
    },
  };
})
