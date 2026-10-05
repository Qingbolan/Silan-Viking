import { Heart, Layers3, MessageCircle } from 'lucide-react';
import { contentGroupUpdatedAt, selectPrimaryDocument, translationPreview } from '../lib/content';
import { cardExcerpt } from '../lib/cardPresentation';
import { contentStateSummary } from '../lib/contentVisibility';
import { formatShortDate } from '../lib/format';
import { toWebviewMediaUrl } from '../lib/media';
import { ProjectPreviewSurface } from './ds/ProjectPreviewSurface';
import type { ReactNode } from 'react';
import type { ContentGroup } from '../types';

type ContentCardProps = {
  group: ContentGroup;
  onOpen: (group: ContentGroup) => void;
  stateControls?: ReactNode;
};

/**
 * Flat, text-first library card. Project covers follow the public frontend's
 * image → website preview contract. Projects without either source stay
 * text-only, matching the media-optional contract used by other content.
 */
export function ContentCard({ group, onOpen, stateControls }: ContentCardProps) {
  const isSeries = group.cardKind === 'series';
  const isProject = group.kind === 'project';
  const excerpt = cardExcerpt(group.title, group.description || translationPreview(selectPrimaryDocument(group), group.language));
  const updatedAt = contentGroupUpdatedAt(group);
  const date = updatedAt ? formatShortDate(updatedAt) : '';
  const stateSummary = contentStateSummary(group.visibility);
  const coverUrl = toWebviewMediaUrl(group.coverUrl || (isSeries
    ? group.documents.find(document => document.cover_url)?.cover_url
    : undefined));
  const projectWebsiteUrl = group.coverSourceType === 'website'
    ? group.demoUrl || group.coverWebsiteUrl
    : undefined;
  const hasProjectCover = Boolean(coverUrl || projectWebsiteUrl);

  return (
    <article
      className="content-card"
      data-library-id={group.id}
      data-series-target={isSeries ? group.slug : undefined}
      draggable={!isSeries && ['blog','episode'].includes(group.kind)}
      data-visibility={group.visibility}
      data-kind={isSeries ? 'series' : group.kind}
    >
      <button type="button" className="content-card-open" onClick={() => onOpen(group)} aria-label={`${group.title} · ${stateSummary}`}>
        {isSeries ? (
          <span className="content-card-cover series-collection-cover">
            <span className="series-collection-front">
              {coverUrl ? <img src={coverUrl} alt="" loading="lazy" /> : <span className="series-collection-placeholder" aria-hidden="true"><Layers3 size={40} strokeWidth={1} /></span>}
            </span>
          </span>
        ) : isProject && hasProjectCover ? (
          <span className="content-card-cover" data-mode={group.coverSourceType || 'image'}>
            <ProjectPreviewSurface
              title={group.title}
              imageUrl={group.coverUrl}
              websiteUrl={projectWebsiteUrl}
            />
          </span>
        ) : coverUrl && (
          <span className="content-card-cover">
            <img src={coverUrl} alt="" loading="lazy" />
          </span>
        )}
        <span className="content-card-body">
          {isSeries && <span className="series-collection-label"><Layers3 size={14} /><span>系列</span>{group.episodeCount != null && <span>{group.episodeCount} 篇</span>}</span>}
          <span className="content-card-title" title={group.title}>{group.title}</span>
          {excerpt && <span className="content-card-excerpt">{excerpt}</span>}
          {isSeries && group.latestEpisode && (
            <span className="content-card-latest">
              最新{group.latestEpisode.episodeNumber != null ? ` ${group.latestEpisode.episodeNumber}` : ''} · {group.latestEpisode.title}
            </span>
          )}
          <span className="content-card-footer">
            <span className="content-card-meta">
              {date && <span>{date}</span>}
            </span>
            {(group.engagement.likes > 0 || group.engagement.comments > 0) && (
              <span className="content-card-engagement">
                {group.engagement.likes > 0 && <span title={`${group.engagement.likes} likes`}><Heart size={13} />{group.engagement.likes}</span>}
                {group.engagement.comments > 0 && <span title={`${group.engagement.comments} comments`}><MessageCircle size={13} />{group.engagement.comments}</span>}
              </span>
            )}
          </span>
        </span>
      </button>
      {stateControls && (
        <div className="content-card-actions management-controls-enter">
          {stateControls}
        </div>
      )}
    </article>
  );
}
