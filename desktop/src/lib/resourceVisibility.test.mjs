import assert from 'node:assert/strict';
import test from 'node:test';
import { contentLifecycleFor } from './contentLifecycle.ts';
import {
  countResourcesByShelf,
  documentBelongsToShelf,
  filterResourceDocuments,
  isArchivedResource,
} from './resourceVisibility.ts';

const document = ({
  id,
  kind,
  status = 'draft',
  title = id,
  seriesSlug = null,
}) => ({
  id: `${id}:body`,
  part_id: `${id}:body`,
  entity_type: kind,
  entity_id: id,
  series_id: seriesSlug,
  series_slug: seriesSlug,
  series_title: seriesSlug,
  episode_number: null,
  slug: id,
  role: 'body',
  canonical_language: 'en',
  title,
  status,
  visibility: status === 'published' ? 'public' : 'private',
  updated_at: '2026-07-25T12:00:00Z',
  engagement: { likes: 0, comments: 0 },
  translations: [{
    id: `${id}:body:en`,
    language: 'en',
    content: `# ${title}`,
    revision: 'revision',
    source_path: `${kind}/${id}/parts/body/en.md`,
  }],
});

const documents = [
  document({ id: 'active-blog', kind: 'blog', status: 'published', title: 'Active article' }),
  document({ id: 'archived-blog', kind: 'blog', status: 'ARCHIVED', title: 'Past article' }),
  document({ id: 'active-episode', kind: 'episode', status: 'draft', seriesSlug: 'field-notes' }),
  document({ id: 'archived-episode', kind: 'episode', status: 'archived', seriesSlug: 'field-notes' }),
  document({ id: 'active-project', kind: 'project', status: 'active' }),
  document({ id: 'archived-project', kind: 'project', status: 'archived' }),
];

test('archive status is normalized at the visibility boundary', () => {
  assert.equal(isArchivedResource({ status: ' ARCHIVED ' }), true);
  assert.equal(isArchivedResource({ status: 'draft' }), false);
});

test('the Blog shelf includes active articles and episodes but excludes archives', () => {
  const visible = filterResourceDocuments(documents, {
    entityFilter: 'blog',
    view: 'active',
  });
  assert.deepEqual(
    visible.map((item) => item.entity_id),
    ['active-blog', 'active-episode'],
  );
  assert.equal(documentBelongsToShelf(documents[2], 'blog'), true);
});

test('the archive view contains only archived resources and remains searchable', () => {
  const archived = filterResourceDocuments(documents, {
    query: 'field-notes',
    view: 'archived',
  });
  assert.deepEqual(
    archived.map((item) => item.entity_id),
    ['archived-episode'],
  );
});

test('navigation counts are derived from active resource identities', () => {
  const counts = countResourcesByShelf(documents);
  assert.equal(counts.get('blog'), 2);
  assert.equal(counts.get('episode'), 1);
  assert.equal(counts.get('project'), 1);
  assert.equal(counts.get('all'), 3);
});

test('archived prose restores to a private draft', () => {
  const restore = contentLifecycleFor('blog', 'archived', 'private')
    .actions
    .find((action) => action.id === 'restore');
  assert.deepEqual(restore?.nextState, {
    status: 'draft',
    visibility: 'private',
  });
});

test('archived projects leave the Projects shelf and restore as private active work', () => {
  const visibleProjects = filterResourceDocuments(documents, {
    entityFilter: 'project',
    view: 'active',
  });
  assert.deepEqual(
    visibleProjects.map((item) => item.entity_id),
    ['active-project'],
  );

  const restore = contentLifecycleFor('project', 'archived', 'private')
    .actions
    .find((action) => action.id === 'restore');
  assert.deepEqual(restore?.nextState, {
    status: 'active',
    visibility: 'private',
  });
});
