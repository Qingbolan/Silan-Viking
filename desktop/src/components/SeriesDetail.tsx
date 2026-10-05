import { ArrowLeft, FolderOpen, PencilLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { selectPrimaryDocument, translationPreview } from '../lib/content';
import { cardExcerpt } from '../lib/cardPresentation';
import { toWebviewMediaUrl } from '../lib/media';
import type { ContentGroup, EpisodeGroup, EpisodeSeries } from '../types';
type SeriesDetailProps = {
    series: EpisodeSeries;
    managementEnabled: boolean;
    onBack: () => void;
    onEditSeries: (series: EpisodeSeries) => void;
    onEditEpisode: (episode: EpisodeGroup) => void;
    renderStateControls: (group: ContentGroup, variant?: 'card' | 'header') => ReactNode;
    seriesStateControls?: ReactNode;
};
export function SeriesDetail({ series, managementEnabled, onBack, onEditSeries, onEditEpisode, renderStateControls, seriesStateControls }: SeriesDetailProps) {
    const coverUrl = toWebviewMediaUrl(series.coverUrl);
    return <div className="series-detail" data-series-target={series.slug}>
    <nav className="series-folder-toolbar"><button type="button" onClick={onBack}><ArrowLeft size={16}/>返回</button><span><FolderOpen size={16}/>{series.episodes.length} 篇</span><button type="button" onClick={() => onEditSeries(series)} aria-label="编辑系列"><PencilLine size={16}/></button></nav>
    <section className="series-folder" data-library-id={`series:${series.id}`}>
      <header className="series-folder-head">
        {coverUrl && <img src={coverUrl} alt="" className="series-folder-cover"/>}
        <div><h2>{series.title}</h2>{series.description && <p>{series.description}</p>}{managementEnabled && seriesStateControls}</div>
      </header>
      <div className="series-episode-list">
        {series.episodes.map(episode => {
            const primary = selectPrimaryDocument(episode);
            const excerpt = cardExcerpt(episode.title, episode.description || translationPreview(primary, episode.language));
            const cover = toWebviewMediaUrl(primary?.cover_url);
            return <article key={episode.id} className="series-episode-card" data-visibility={episode.visibility} data-library-id={episode.id} draggable>
            <button type="button" className="series-episode-open" onClick={() => onEditEpisode(episode)}>
              <span className="series-episode-number">{String(episode.episodeNumber ?? '').padStart(2, '0')}</span>
              <span className="series-episode-copy"><strong>{episode.title}</strong>{excerpt && <span>{excerpt}</span>}</span>
              {cover && <img src={cover} alt=""/>}
            </button>
            {managementEnabled && <div className="series-episode-actions">{renderStateControls(episode, 'card')}</div>}
          </article>;
        })}
        {!series.episodes.length && <div className="series-folder-empty"><FolderOpen size={28}/><span>拖入文章或 Markdown 文件</span></div>}
      </div>
    </section>
  </div>;
}
