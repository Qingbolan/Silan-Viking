// EpisodeDetail — entry point for /episodes/:slug. Fetches the episode by
// slug, looks up its series, and renders the whole thing inside the
// Yuque-style KnowledgeBaseShell. Reuses BlogContentRenderer for the body
// so markdown / vlog / annotation paths stay one implementation.
//
// Wired directly to the episode + episode_series endpoints — independent of
// BlogDetail (episode is its own content type, not a blog).
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { Seo } from '../Seo';
import { fetchEpisode, fetchEpisodeSeries } from '../../api/episodes/episodeApi';
import type { EpisodeData, EpisodeSeriesData } from '../../types/episode';
import { BlogContentRenderer } from '../BlogStack/components/BlogContentRenderer';
import {
  ArticleFooter,
  KnowledgeBaseShell,
  type BookNavChapter,
  BrandLoading,
  ErrorState,
  mockComments,
  mockRecentLikers,
} from '../ds';

const SERIES_OVERVIEW_ID = '__series_overview__';

const EpisodeDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [seriesData, setSeriesData] = useState<EpisodeSeriesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('');

  // Load the episode, then load its series so we can build the left rail.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEpisode(slug, language as 'en' | 'zh')
      .then(async (ep) => {
        if (cancelled || !ep) {
          if (!cancelled) setError(language === 'en' ? 'Episode not found' : '未找到该集');
          setLoading(false);
          return;
        }
        setEpisode(ep);
        setActiveChapter(ep.id);
        if (ep.series_slug) {
          const series = await fetchEpisodeSeries(
            ep.series_slug,
            language as 'en' | 'zh',
          ).catch(() => null);
          if (!cancelled) setSeriesData(series);
        }
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(language === 'en' ? 'Failed to load episode' : '加载失败');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, language]);

  const chapters: BookNavChapter[] = useMemo(() => {
    if (!seriesData) return [];
    return seriesData.episodes.map((ep) => ({
      id: ep.id,
      label: ep.title,
      onClick: () => {
        setActiveChapter(ep.id);
        if (ep.slug !== slug) navigate(`/episodes/${ep.slug}`);
      },
    }));
  }, [seriesData, slug, navigate]);

  const onOverviewClick = () => {
    setActiveChapter(SERIES_OVERVIEW_ID);
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const wordCount = useMemo(
    () =>
      (episode?.content || []).reduce(
        (acc, item) => acc + (item.content?.split(/\s+/).filter(Boolean).length || 0),
        0,
      ),
    [episode?.content],
  );

  if (loading) return <BrandLoading />;
  if (error || !episode) {
    return (
      <ErrorState
        title={language === 'en' ? 'Episode unavailable' : '加载失败'}
        description={error || ''}
      />
    );
  }

  const isOverview = activeChapter === SERIES_OVERVIEW_ID;
  const seriesTitle =
    seriesData?.title || episode.series_slug || (language === 'en' ? 'Series' : '系列');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={episode.title}
        description={episode.description || seriesTitle}
        path={`/episodes/${episode.slug}`}
        type="article"
        lang={language as 'en' | 'zh'}
      />
      <KnowledgeBaseShell
        overview={{
          label: seriesTitle,
          icon: BookOpen,
          onClick: onOverviewClick,
          isActive: isOverview,
        }}
        chapters={chapters}
        currentChapterId={activeChapter}
        wordCount={wordCount}
        likes={2047}
        commentsCount={94}
      >
        {isOverview ? (
          <>
            <div className="space-y-2">
              <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-ds-fg-subtle">
                {language === 'en' ? 'Series' : '系列'}
                {seriesData?.episodes.length
                  ? ` · ${seriesData.episodes.length} ${language === 'en' ? 'episodes' : '集'}`
                  : ''}
              </div>
              <h1 className="text-[40px] font-bold leading-[1.2] tracking-[-0.02em] text-ds-fg">
                {seriesTitle}
              </h1>
            </div>

            {seriesData?.description && (
              <p className="mt-8 text-[15px] leading-[1.8] text-ds-fg-muted">
                {seriesData.description}
              </p>
            )}

            {seriesData && seriesData.episodes.length > 0 && (
              <div className="mt-10 space-y-1">
                <div className="mb-3 text-[12px] uppercase tracking-[0.1em] text-ds-fg-subtle">
                  {language === 'en' ? 'Episodes' : '章节'}
                </div>
                <ol className="space-y-2">
                  {seriesData.episodes.map((ep, i) => (
                    <li key={ep.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveChapter(ep.id);
                          navigate(`/episodes/${ep.slug}`);
                        }}
                        className="group flex w-full items-baseline gap-3 rounded-md px-2 py-2 text-left hover:bg-ds-surface-2"
                      >
                        <span className="font-mono text-[12px] text-ds-fg-subtle">
                          {String(ep.episode_number || i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-[15px] text-ds-fg group-hover:text-ds-primary">
                          {ep.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        ) : (
          // Body — no repeated title / duration; left rail already names
          // the chapter. The article's own H1 (inside the markdown) is the
          // canonical heading.
          //
          // `#kb-active-part` is the contract DOMOutline scans for headings;
          // KnowledgeBaseShell's right-rail Outline finds h2/h3 inside it.
          <div id="kb-active-part" className="prose-content markdown-body w-full">
            <BlogContentRenderer
              content={episode.content || []}
              isWideScreen={true}
              userAnnotations={{}}
              annotations={{}}
              showAnnotationForm={null}
              newAnnotationText=""
              selectedText={null}
              highlightedAnnotation={null}
              onTextSelection={() => {}}
              onToggleAnnotation={() => {}}
              onSetShowAnnotationForm={() => {}}
              onSetNewAnnotationText={() => {}}
              onAddUserAnnotation={() => {}}
              onRemoveUserAnnotation={() => {}}
              onHighlightAnnotation={() => {}}
              onCancelAnnotation={() => {}}
            />
          </div>
        )}

        <ArticleFooter
          likes={2047}
          recentLikers={mockRecentLikers}
          contributors={['Silan Hu']}
          publishedAt={episode.publish_date || ''}
          viewCount={1296204}
          ipRegion="Singapore"
          comments={mockComments}
        />
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default EpisodeDetail;
