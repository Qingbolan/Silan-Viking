import { ArrowLeft, FileText, PencilLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { badgeClass, contentGroupUpdatedAt, selectPrimaryDocument, translationPreview } from '../lib/content';
import { contentStateSummary } from '../lib/contentLifecycle';
import { formatShortDate } from '../lib/format';
import { toWebviewMediaUrl } from '../lib/media';
import type { ContentGroup, EpisodeGroup, EpisodeSeries } from '../types';

type SeriesDetailProps = {
  series: EpisodeSeries;
  onBack: () => void;
  onEditSeries: (series: EpisodeSeries) => void;
  onEditEpisode: (episode: EpisodeGroup) => void;
  renderStateControls: (group: ContentGroup, variant?: 'card' | 'header') => ReactNode;
  seriesStateControls?: ReactNode;
};

export function SeriesDetail({ series, onBack, onEditSeries, onEditEpisode, renderStateControls, seriesStateControls }: SeriesDetailProps) {
  const coverUrl = toWebviewMediaUrl(series.coverUrl);
  const latestDate = series.episodes.reduce((latest, episode) => {
    const updatedAt = contentGroupUpdatedAt(episode);
    return !latest || updatedAt > latest ? updatedAt : latest;
  }, '');

  return (
    <div className="series-detail">
      <header className="series-detail-head">
        <button type="button" className="series-back" onClick={onBack}>
          <ArrowLeft size={15} />
          Back
        </button>
        <div>
          <span className={badgeClass('episode')}>Series</span>
          <h2>{series.title}</h2>
          <p>
            {series.episodes.length} episodes
            {latestDate ? ` · Updated ${formatShortDate(latestDate)}` : ''}
          </p>
          {series.description && <small>{series.description}</small>}
          {coverUrl && (
            <img className="series-cover" src={coverUrl} alt="" loading="lazy" />
          )}
        </div>
        <div className="series-detail-actions">
          <button type="button" className="series-edit-button" onClick={() => onEditSeries(series)}>
            <PencilLine size={13} />
            Edit series
          </button>
          {seriesStateControls}
        </div>
      </header>

      <div className="series-episode-list">
        {series.episodes.map((episode) => {
          const primary = selectPrimaryDocument(episode);
          const excerpt = translationPreview(primary);
          const date = formatShortDate(contentGroupUpdatedAt(episode));

          return (
            <article className="series-episode-card" key={episode.id}>
              <button type="button" className="series-episode-open" onClick={() => onEditEpisode(episode)}>
                <span className="series-episode-number">
                  {episode.episodeNumber != null ? `#${episode.episodeNumber}` : <FileText size={15} />}
                </span>
                <span className="series-episode-copy">
                  <span className="series-episode-meta">
                    <span>{date || 'No date'}</span>
                    <span className="content-state-pills">
                      {contentStateSummary(episode.kind, episode.status, episode.visibility).split(' · ').map((part) => (
                        <span
                          key={part}
                          data-visibility={part.toLowerCase().includes('private') ? 'private' : undefined}
                        >
                          {part}
                        </span>
                      ))}
                    </span>
                  </span>
                  <strong>{episode.title}</strong>
                  {excerpt && <small>{excerpt}</small>}
                </span>
              </button>
              <div className="series-episode-actions">
                {renderStateControls(episode, 'card')}
                <button type="button" className="series-edit-button" onClick={() => onEditEpisode(episode)}>
                  <PencilLine size={13} />
                  Edit
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
