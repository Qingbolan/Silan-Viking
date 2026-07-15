import type { BlogCardData } from '../components/ds/BlogCard';
import type { IdeaCardData, IdeaStatus } from '../components/ds/IdeaCard';
import type { ProjectCardData } from '../components/ds/ProjectCard';
import type { ContentGroup, ContentKind, EditorDocument } from '../types';
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

export const translationPreview = (document?: EditorDocument | null) => {
  const translation = document?.translations.find((item) => item.language === document.canonical_language)
    || document?.translations[0];
  return (translation?.content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_`~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export const ideaStatus = (status: string): IdeaStatus => {
  const normalized = status.trim().toLowerCase();
  if (
    normalized === 'hypothesis'
    || normalized === 'experimenting'
    || normalized === 'validating'
    || normalized === 'published'
    || normalized === 'concluded'
  ) {
    return normalized;
  }
  return 'draft';
};

export const toBlogCardData = (group: ContentGroup): BlogCardData => {
  const isSeries = group.cardKind === 'series';
  return {
    id: group.id,
    title: group.title,
    excerpt: translationPreview(selectPrimaryDocument(group)),
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
    description: translationPreview(selectPrimaryDocument(group)),
    tags: contentGroupTags(group, 5),
    year: updatedAt ? new Date(updatedAt).getFullYear() : undefined,
  };
};

export const toIdeaCardData = (group: ContentGroup): IdeaCardData => ({
  id: group.id,
  title: group.title,
  description: translationPreview(selectPrimaryDocument(group)),
  status: ideaStatus(group.status),
  category: group.visibility || undefined,
  tags: contentGroupTags(group),
  date: formatShortDate(contentGroupUpdatedAt(group)),
});
