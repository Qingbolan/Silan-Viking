import type { BlogCardData } from '../components/ds/BlogCard';
import type { ProjectCardData } from '../components/ds/ProjectCard';
import type {
  ContentGroup,
  ContentKind,
  EditorDocument,
  EditorTranslation,
  EpisodeGroup,
  EpisodeSeries,
} from '../types';
import { formatShortDate } from './format';

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

export const contentGroupTags = (group: ContentGroup, limit = 4) => group.documents
  .map((document) => document.role)
  .filter((role, index, roles) => role && roles.indexOf(role) === index)
  .slice(0, limit);

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
  };
};
