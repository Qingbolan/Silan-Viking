import React, { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Calendar, Clock } from 'lucide-react';
import { Seo, creativeWorkJsonLd } from '../Seo';
import { fetchEpisodeSeries } from '../../api/episodes/episodeApi';
import type { EpisodeSeriesData } from '../../types/episode';
import { useLanguage } from '../LanguageContext';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import { canonicalInternalPath } from '../../utils/navigation';
import {
  Button,
  BrandLoading,
  ContentAttribution,
  ErrorState,
  KnowledgeBaseShell,
  NetworkError,
  type BookNavChapter,
} from '../ds';
import { ContentHero } from '../ds/ContentHero';
import { scrollToAnchor } from '../../lib/scrollToAnchor';
import { SERIES_HEADER_ID } from '../BlogStack/components/SeriesDocumentFrame';

const SERIES_OVERVIEW_ID = '__series_overview__';

const newestTimestamp = (series: EpisodeSeriesData): string | undefined => {
  const candidates = [
    series.updated_at,
    series.created_at,
    ...series.episodes.flatMap((episode) => [episode.updated_at, episode.publish_date]),
  ]
    .filter((value): value is string => Boolean(value))
    .sort();
  return candidates[candidates.length - 1];
};

const wordCountOf = (value?: string): number =>
  value?.split(/\s+/).filter(Boolean).length ?? 0;

const EpisodeSeriesOverview: React.FC = () => {
  const { seriesSlug } = useParams<{ seriesSlug: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const zh = language === 'zh';

  const loadSeries = useCallback(
    () => seriesSlug ? fetchEpisodeSeries(seriesSlug, language as 'en' | 'zh') : Promise.resolve(null),
    [language, seriesSlug],
  );
  const seriesResource = useRemoteResource<EpisodeSeriesData>(seriesSlug, loadSeries);
  const series = seriesResource.data;

  const chapters: BookNavChapter[] = useMemo(() => {
    if (!series) return [];
    return series.episodes.map((episode) => ({
      id: episode.id,
      label: episode.title,
      onClick: () => navigate(`/episodes/${episode.slug}`),
    }));
  }, [navigate, series]);

  if (seriesResource.status === 'loading') return <BrandLoading />;
  if (seriesResource.status === 'error') return <NetworkError onRetry={seriesResource.reload} />;
  if (!series) {
    return (
      <>
        <Seo
          title={zh ? '系列不存在' : 'Series not found'}
          description={zh ? '未找到该公开系列。' : 'This public series could not be found.'}
          path={`/episodes/series/${seriesSlug ?? ''}`}
          noindex
          lang={language as 'en' | 'zh'}
        />
        <ErrorState
          variant="page"
          title={zh ? '系列不存在' : 'Series not found'}
          description={zh ? '该系列不存在或尚未公开。' : 'This series does not exist or is not public.'}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate(canonicalInternalPath('/blog'))}>
              {zh ? '返回文章列表' : 'Back to writing'}
            </Button>
          }
        />
      </>
    );
  }

  const path = `/episodes/series/${series.slug}`;
  const updatedAt = newestTimestamp(series);
  const wordCount = wordCountOf(series.description);

  return (
    <motion.div id="episode-series-document" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={series.title}
        description={series.description}
        path={path}
        image={series.cover_url}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title: series.title,
          description: series.description,
          path: `${path}/`,
          image: series.cover_url,
          type: 'CreativeWork',
          lang: language as 'en' | 'zh',
          dateModified: updatedAt,
        })}
      />
      <KnowledgeBaseShell
        outlineContainerSelector="#episode-series-document"
        header={<ContentHero
          id={SERIES_HEADER_ID}
          title={series.title}
          coverImage={series.cover_url}
          language={language}
          parent={{ label: zh ? '博客' : 'Blog', to: '/blog/' }}
          metadata={<>
            <span>{zh ? '系列' : 'Series'}</span>
            <span>{series.episodes.length} {zh ? '集' : 'episodes'}</span>
          </>}
        />}
        overview={{
          label: series.title,
          icon: BookOpen,
          onClick: () => scrollToAnchor(SERIES_HEADER_ID),
          isActive: true,
        }}
        chapters={chapters}
        currentChapterId={SERIES_OVERVIEW_ID}
        wordCount={wordCount}
        outlineHeadingSelector="header h1, h2, h3"
      >

        {series.description && (
          <section className="mt-8 border-l border-ds-border pl-5">
            <p className="max-w-[58rem] text-pretty text-ds-lg font-medium leading-7 text-ds-fg sm:leading-[1.55]">
              {series.description}
            </p>
          </section>
        )}

        <section className="mt-12 max-w-[68rem] space-y-1" aria-labelledby="series-episodes">
          <div className="mb-4 flex items-center gap-3">
            <h2 id="series-episodes" className="font-mono text-ds-2xs font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
              {zh ? '章节' : 'Episodes'}
            </h2>
            <span className="h-px flex-1 bg-ds-border" aria-hidden />
          </div>
          <ol className="space-y-1.5">
            {series.episodes.map((episode, index) => (
              <li key={episode.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/episodes/${episode.slug}`)}
                  className="group flex w-full items-start gap-4 rounded-ds-md px-3 py-3 text-left transition-colors hover:bg-ds-surface-2"
                >
                  <span className="pt-1 font-mono text-ds-xs text-ds-fg-subtle">
                    {String(episode.episode_number || index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-ds-lg font-medium leading-7 text-ds-fg group-hover:text-ds-primary">
                      {episode.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ds-xs text-ds-fg-subtle">
                      {episode.publish_date && (
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="size-3.5" aria-hidden />
                          {episode.publish_date}
                        </span>
                      )}
                      {episode.duration_minutes && (
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3.5" aria-hidden />
                          {episode.duration_minutes} min
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <ContentAttribution
          canonicalPath={`${path}/`}
          kind="series"
          className="mt-12"
        />
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default EpisodeSeriesOverview;
