import type { ContentKind, EditorDocument, EntityFilter } from '../types';

export type ResourceView = 'all' | 'private';

export type ResourceFilter = {
  entityFilter?: EntityFilter;
  query?: string;
  view: ResourceView;
};

const resourceKey = (document: Pick<EditorDocument, 'entity_type' | 'entity_id'>) => (
  `${document.entity_type}:${document.entity_id}`
);

export const isPrivateResource = (
  resource: Pick<EditorDocument, 'visibility'> | { visibility: string | null | undefined },
) => resource.visibility === 'private';

export const isDocumentInResourceView = (
  document: Pick<EditorDocument, 'visibility'>,
  view: ResourceView,
) => view === 'private'
  ? isPrivateResource(document)
  : true;

export const documentBelongsToShelf = (
  document: Pick<EditorDocument, 'entity_type'>,
  entityFilter: EntityFilter,
) => entityFilter === 'all'
  || document.entity_type === entityFilter
  || (entityFilter === 'blog' && document.entity_type === 'episode');

const documentSearchText = (document: EditorDocument) => [
  document.title,
  document.entity_type,
  document.slug,
  document.role,
  document.series_title,
  document.series_slug,
  ...document.translations.map((translation) => translation.language),
].filter(Boolean).join(' ').toLowerCase();

export const filterResourceDocuments = (
  documents: EditorDocument[],
  {
    entityFilter = 'all',
    query = '',
    view,
  }: ResourceFilter,
) => {
  const normalizedQuery = query.trim().toLowerCase();
  return documents.filter((document) => (
    isDocumentInResourceView(document, view)
    && documentBelongsToShelf(document, entityFilter)
    && (!normalizedQuery || documentSearchText(document).includes(normalizedQuery))
  ));
};

export const countResourcesByShelf = (
  documents: EditorDocument[],
  view: ResourceView = 'all',
) => {
  const idsByKind = new Map<ContentKind, Set<string>>();
  filterResourceDocuments(documents, { view }).forEach((document) => {
    if (!idsByKind.has(document.entity_type)) {
      idsByKind.set(document.entity_type, new Set());
    }
    idsByKind.get(document.entity_type)?.add(resourceKey(document));
  });

  const counts = new Map<EntityFilter, number>();
  idsByKind.forEach((ids, kind) => counts.set(kind, ids.size));
  counts.set('blog', (counts.get('blog') || 0) + (counts.get('episode') || 0));
  counts.set(
    'all',
    Array.from(idsByKind.values()).reduce((total, ids) => total + ids.size, 0),
  );
  return counts;
};
