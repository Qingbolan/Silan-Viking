import { contentGroupUpdatedAt, selectPrimaryDocument, translationPreview } from '../lib/content';
import { contentStateSummary } from '../lib/contentLifecycle';
import { formatShortDate } from '../lib/format';
import { toWebviewMediaUrl } from '../lib/media';
import type { ReactNode } from 'react';
import type { ContentGroup } from '../types';

const kindLabels: Record<string, string> = {
  blog: 'Article',
  project: 'Project',
  idea: 'Idea',
  episode: 'Series',
};

type ContentCardProps = {
  group: ContentGroup;
  onOpen: (group: ContentGroup) => void;
  stateControls?: ReactNode;
};

/**
 * Flat, text-first library card. A cover image renders only when the
 * content actually declares one — no placeholder art for covers that
 * don't exist. Meta shows only fields that carry information: an empty
 * date or a lone default "body" part stays silent.
 */
export function ContentCard({ group, onOpen, stateControls }: ContentCardProps) {
  const isSeries = group.cardKind === 'series';
  const kindLabel = isSeries ? 'Series' : kindLabels[group.kind] || group.kind;
  const excerpt = translationPreview(selectPrimaryDocument(group));
  const updatedAt = contentGroupUpdatedAt(group);
  const date = updatedAt ? formatShortDate(updatedAt) : '';
  const partCount = group.documents.length;
  const stateSummary = isSeries
    ? [group.status, group.visibility].filter(Boolean).join(' · ')
    : contentStateSummary(group.kind, group.status, group.visibility);
  const coverUrl = toWebviewMediaUrl(group.coverUrl);

  const meta: string[] = [kindLabel];
  if (isSeries && group.episodeCount != null) meta.push(`${group.episodeCount} episodes`);
  else if (partCount > 1) meta.push(`${partCount} parts`);
  if (date) meta.push(date);

  return (
    <article
      className={`content-card ${isSeries ? 'content-card--span2' : ''}`}
    >
      <button type="button" className="content-card-open" onClick={() => onOpen(group)}>
        {coverUrl && (
          <span className="content-card-cover">
            <img src={coverUrl} alt="" loading="lazy" />
          </span>
        )}
        <span className="content-card-body">
          <span className="content-card-meta">
            <span>{meta.join(' · ')}</span>
            {stateSummary && (
              <span className="content-card-status content-state-pills">
                {stateSummary.split(' · ').map((part) => (
                  <span
                    key={part}
                    data-visibility={part.toLowerCase().includes('private') ? 'private' : undefined}
                  >
                    {part}
                  </span>
                ))}
              </span>
            )}
          </span>
          <span className="content-card-title">{group.title}</span>
          {excerpt && <span className="content-card-excerpt">{excerpt}</span>}
          {isSeries && group.latestEpisode && (
            <span className="content-card-latest">
              Latest{group.latestEpisode.episodeNumber != null ? ` #${group.latestEpisode.episodeNumber}` : ''} · {group.latestEpisode.title}
            </span>
          )}
        </span>
      </button>
      {stateControls && <div className="content-card-actions">{stateControls}</div>}
    </article>
  );
}
