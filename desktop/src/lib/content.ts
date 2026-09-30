import type {
  ContentGroup,
  ContentKind,
  EditorDocument,
  EditorTranslation,
  EpisodeGroup,
  EpisodeSeries,
} from '../types';
import { formatShortDate } from './format';

/* --- Card view-model shapes ------------------------------------------------
 * These were originally defined next to the design-system BlogCard /
 * ProjectCard components. Those components were removed as unused (the
 * workbench renders ContentCard instead), but the plain data shapes remain
 * the contract produced by `toBlogCardData` / `toProjectCardData` below. */

export interface BlogCardData {
  id: string;
  title: string;
  /** Short summary / excerpt. */
  excerpt?: string;
  /** Topic tags. */
  tags?: string[];
  /** Publish date — any displayable string. */
  date?: string;
  author?: string;
  /** Estimated read time, e.g. "5 min read". */
  readTime?: string;
  /** Article (single post) or series (multi-part). */
  kind?: 'article' | 'series';
  /** Episode count — shown for `series`. */
  episodeCount?: number;
  /** Latest episode in a series — surfaced as a dedicated meta row between
   *  the excerpt and the tags so the reader can see what's freshest without
   *  opening the series. Rendered only when `kind === 'series'`. */
  latestEpisode?: { title: string; episodeNumber?: number };
  /** Cover image. Omit for the branded placeholder. */
  coverImage?: string;
}

export interface ProjectCardData {
  id: string;
  title: string;
  description?: string;
  /** Tech-stack / topic tags. */
  tags?: string[];
  /** Year — shown in the placeholder reference code + the cover meta strip. */
  year?: number | string;
  /** Author / owner — shown in the cover meta strip. */
  author?: string;
  githubUrl?: string;
  demoUrl?: string;

  /* --- Cover content — first one set wins, in this order ---------------- */
  /** A static preview image / screenshot. */
  coverImage?: string;
  /** A cover video (MP4/WebM). Plays muted + looped automatically. */
  coverVideo?: string;
  /** Poster frame shown before `coverVideo` loads. */
  coverPoster?: string;
  /**
   * Live, scaled, non-interactive iframe of `demoUrl`. Used only when no
   * image/video is set. Falls back to the placeholder if embedding fails.
   */
  livePreview?: boolean;
  coverSourceType?: 'image' | 'website';

  /** Optional status pill (e.g. "Active", "Archived"). */
  status?: { label: string; tone?: 'success' | 'neutral' | 'warning' };
}

export const docPath = (doc: EditorDocument) => {
  if (doc.entity_type === 'episode' && doc.series_slug) {
    return `episode/${doc.series_slug}/${doc.slug}/${doc.role}`;
  }
  return `${doc.entity_type}/${doc.slug}/${doc.role}`;
};

export const badgeClass = (kind: ContentKind) => `badge badge-${kind}`;

export const selectPrimaryDocument = (group: ContentGroup) => (
  group.documents.find((document) => document.role === 'body')
  || group.documents.find((document) => document.role === 'overview')
  || group.documents.find((document) => document.role === 'summary')
  || group.documents[0]
);

export const groupDocumentsByResource = (documents: EditorDocument[]) => {
  const groups = new Map<string, ContentGroup>();
  documents.forEach((document) => {
    const id = `${document.entity_type}:${document.entity_id}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        kind: document.entity_type,
        title: document.title,
        slug: document.slug,
        description: document.description || null,

        visibility: document.visibility,
        date: document.date || null,
        pinned: Boolean(document.pinned),
        momentType: document.moment_type || undefined,
        priority: document.priority || undefined,
        tags: document.tags,
        relations: document.relations,
        coverUrl: document.cover_url || undefined,
        coverSourceType: document.cover_source_type || 'image',
        coverWebsiteUrl: document.cover_website_url || undefined,
        isFeatured: Boolean(document.is_featured),
        githubUrl: document.github_url || undefined,
        demoUrl: document.demo_url || undefined,
        articleAttribution: document.article_attribution || undefined,
        engagement: document.engagement,
        documents: [],
        cardKind: document.entity_type === 'blog' ? 'article' : undefined,
      });
    }
    groups.get(id)?.documents.push(document);
  });
  return Array.from(groups.values());
};

export const selectTranslation = (
  document?: EditorDocument | null,
  language?: string | null,
): EditorTranslation | undefined => (
  (language
    ? document?.translations.find((item) => item.language === language)
    : undefined)
  || document?.translations.find((item) => item.language === document.canonical_language)
  || document?.translations[0]
);

const markdownTitle = (content: string) => (
  content
    .split(/\r?\n/)
    .map((line) => line.match(/^#\s+(.+?)\s*#*\s*$/)?.[1]?.trim())
    .find((title): title is string => Boolean(title))
);

const withoutLeadingTitle = (content: string) => (
  content.replace(/^\s*#\s+.+?(?:\r?\n|$)/, '')
);

const markdownPreview = (content: string) => (
  content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

export const localizedDocumentTitle = (
  document?: EditorDocument | null,
  language?: string | null,
) => {
  const translation = selectTranslation(document, language);
  return markdownTitle(translation?.content || '')
    || translation?.title
    || document?.title
    || '';
};

export const translationPreview = (
  document?: EditorDocument | null,
  language?: string | null,
) => {
  const translation = selectTranslation(document, language);
  return markdownPreview(withoutLeadingTitle(translation?.content || ''));
};

export const contentGroupUpdatedAt = (group: ContentGroup) => group.documents.reduce((latest, document) => (
  !latest || document.updated_at > latest ? document.updated_at : latest
), '');

export const contentGroupTags = (group: ContentGroup, limit = 4) => (
  group.tags
  || selectPrimaryDocument(group)?.tags
  || []
).filter((tag, index, tags) => tag && tags.indexOf(tag) === index).slice(0, limit);

export const arrangeBlogGroupsForGrid = (groups: ContentGroup[]) => {
  const series = groups.filter((group) => group.cardKind === 'series');
  const singles = groups.filter((group) => group.cardKind !== 'series');
  if (series.length === 0 || singles.length === 0) return groups;

  const arranged: ContentGroup[] = [];
  let seriesIndex = 0;
  let singleIndex = 0;

  while (seriesIndex < series.length || singleIndex < singles.length) {
    if (seriesIndex < series.length && singleIndex < singles.length) {
      arranged.push(series[seriesIndex]);
      arranged.push(singles[singleIndex]);
      seriesIndex += 1;
      singleIndex += 1;
      continue;
    }
    if (seriesIndex < series.length) {
      arranged.push(series[seriesIndex]);
      seriesIndex += 1;
      continue;
    }
    arranged.push(singles[singleIndex]);
    singleIndex += 1;
  }

  return arranged;
};

export const localizeContentGroup = <T extends ContentGroup>(
  group: T,
  language: string,
): T => {
  const primary = selectPrimaryDocument(group);
  return {
    ...group,
    language,
    title: localizedDocumentTitle(primary, language) || group.title,
    description: translationPreview(primary, language) || group.description,
    latestEpisode: group.latestEpisode,
  };
};

export const localizeEpisodeGroup = (
  group: EpisodeGroup,
  language: string,
): EpisodeGroup => localizeContentGroup(group, language);

export const localizeEpisodeSeries = (
  series: EpisodeSeries,
  language: string,
): EpisodeSeries => ({
  ...series,
  episodes: series.episodes.map((episode) => localizeEpisodeGroup(episode, language)),
});

export const toBlogCardData = (group: ContentGroup): BlogCardData => {
  const isSeries = group.cardKind === 'series';
  return {
    id: group.id,
    title: group.title,
    excerpt: translationPreview(selectPrimaryDocument(group), group.language),
    tags: contentGroupTags(group),
    date: formatShortDate(contentGroupUpdatedAt(group)),
    kind: isSeries ? 'series' : 'article',
    episodeCount: isSeries ? group.episodeCount : undefined,
    latestEpisode: isSeries && group.latestEpisode
      ? {
          title: group.latestEpisode.title,
          episodeNumber: group.latestEpisode.episodeNumber ?? undefined,
        }
      : undefined,
  };
};

export const toProjectCardData = (group: ContentGroup): ProjectCardData => {
  const updatedAt = contentGroupUpdatedAt(group);
  return {
    id: group.id,
    title: group.title,
    description: translationPreview(selectPrimaryDocument(group), group.language),
    tags: contentGroupTags(group, 5),
    year: updatedAt ? new Date(updatedAt).getFullYear() : undefined,
    githubUrl: group.githubUrl,
    demoUrl: group.demoUrl || group.coverWebsiteUrl,
    coverImage: group.coverUrl,
    coverSourceType: group.coverSourceType,
    livePreview: group.coverSourceType === 'website',
  };
};
