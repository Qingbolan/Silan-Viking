// EpisodeDetail — entry point for /episodes/:slug. Fetches the episode by
// slug, looks up its series, and renders the whole thing inside the
// Yuque-style KnowledgeBaseShell. Reuses BlogContentRenderer for the body
// so markdown / vlog / annotation paths stay one implementation.
//
// Wired directly to the episode + episode_series endpoints — independent of
// BlogDetail (episode is its own content type, not a blog).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, Calendar, Clock } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { Seo, blogPostingJsonLd } from '../Seo';
import { fetchEpisode, fetchEpisodeSeries, updateEpisodeViews } from '../../api/episodes/episodeApi';
import type { EpisodeData, EpisodeSeriesData } from '../../types/episode';
import { BlogContentRenderer } from '../BlogStack/components/BlogContentRenderer';
import SeriesDocumentFrame, {
  SERIES_BODY_ID,
  SERIES_COMMENTS_ID,
  SERIES_HEADER_ID,
  SERIES_LIKES_ID,
  SERIES_SUMMARY_ID,
} from '../BlogStack/components/SeriesDocumentFrame';
import { stripLeadingMetadataDuplicates } from '../BlogStack/utils/contentText';
import { useBlogEngagement } from '../BlogStack/hooks/useBlogEngagement';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import { scrollToAnchor } from '../../lib/scrollToAnchor';
import { shouldCreditViewDisplay } from '../../utils/viewDisplayCredit';
import {
  ArticleFooter,
  ContentAttribution,
  KnowledgeBaseShell,
  type BookNavChapter,
  BrandLoading,
  ErrorState,
  NetworkError,
  Button,
} from '../ds';

const SERIES_OVERVIEW_ID = '__series_overview__';

const usableEpisodeSummary = (value?: string): string | undefined => {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > 360) return undefined;
  if (/^#{1,6}\s/.test(text)) return undefined;
  return text;
};

const EpisodeDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [seriesData, setSeriesData] = useState<EpisodeSeriesData | null>(null);
  const [activeChapter, setActiveChapter] = useState<string>('');
  const [activeSection, setActiveSection] = useState<string>(SERIES_HEADER_ID);
  const [displayViews, setDisplayViews] = useState(0);

  const loadEpisode = useCallback(
    () => slug ? fetchEpisode(slug, language as 'en' | 'zh') : Promise.resolve(null),
    [language, slug],
  );
  const episodeResource = useRemoteResource<EpisodeData>(slug, loadEpisode);
  const episode = episodeResource.data;
  const isOverview = activeChapter === SERIES_OVERVIEW_ID;

  useEffect(() => {
    if (!episode) {
      setDisplayViews(0);
      return;
    }
    setDisplayViews(Math.max(0, episode.views ?? 0));
  }, [episode?.id, episode?.views, episode]);

  useSetPageTitle(
    episode
      ? episode.title
      : episodeResource.status === 'not-found'
        ? (language === 'en' ? 'Episode not found' : '未找到该集')
        : episodeResource.status === 'error'
          ? (language === 'en' ? 'Episode unavailable' : '内容暂不可用')
          : null,
  );

  // Series metadata is an optional enhancement around the canonical episode
  // resource. A series failure must not hide an otherwise readable episode.
  useEffect(() => {
    if (!episode) {
      setSeriesData(null);
      return;
    }
    let cancelled = false;
    setActiveChapter(episode.id);
    setActiveSection(SERIES_HEADER_ID);
    setSeriesData(null);
    if (episode.series_slug) {
      void fetchEpisodeSeries(episode.series_slug, language as 'en' | 'zh')
        .then((series) => {
          if (!cancelled) setSeriesData(series);
        })
        .catch(() => {
          if (!cancelled) setSeriesData(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [episode, language]);

  useEffect(() => {
    if (!episode || isOverview) return;
    let cancelled = false;
    void updateEpisodeViews(episode.id, language as 'en' | 'zh')
      .then((viewRecorded) => {
        if (!cancelled && viewRecorded && shouldCreditViewDisplay('episode', episode.id)) {
          setDisplayViews((current) => current + 1);
        }
      })
      .catch(() => {
        // View tracking is non-blocking; episode rendering remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, [episode?.id, episode, isOverview, language]);

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
  const engagement = useBlogEngagement({
    postId: episode?.id ?? '',
    initialLikes: episode?.likes ?? 0,
    initialLiked: Boolean(episode?.is_liked_by_user),
    initialLikers: episode?.likers ?? [],
    language,
    kind: 'episode',
    enabled: Boolean(episode),
  });

  useEffect(() => {
    if (!episode || isOverview) return;
    const ids = [
      SERIES_HEADER_ID,
      SERIES_SUMMARY_ID,
      SERIES_BODY_ID,
      SERIES_LIKES_ID,
      SERIES_COMMENTS_ID,
    ];
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveSection(hit.target.id);
      },
      { root: scrollRoot, rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [episode, isOverview]);

  if (episodeResource.status === 'loading') return <BrandLoading />;
  if (episodeResource.status === 'error') {
    return <NetworkError onRetry={episodeResource.reload} />;
  }
  if (!episode) {
    return (
      <>
        <Seo
          title={language === 'en' ? 'Episode not found' : '未找到该集'}
          description={language === 'en' ? 'This public episode could not be found.' : '未找到该公开内容。'}
          path={`/episodes/${slug ?? ''}`}
          noindex
          lang={language as 'en' | 'zh'}
        />
        <ErrorState
          variant="page"
          title={language === 'en' ? 'Episode not found' : '未找到该集'}
          description={language === 'en' ? 'This episode does not exist or is not public.' : '该内容不存在或尚未公开。'}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate('/blog')}>
              {language === 'en' ? 'Back to writing' : '返回文章列表'}
            </Button>
          }
        />
      </>
    );
  }

  const seriesTitle =
    seriesData?.title || episode.series_slug || (language === 'en' ? 'Series' : '系列');
  const episodeSummary = usableEpisodeSummary(episode.description);
  const episodeContent = stripLeadingMetadataDuplicates(
    episode.content || [],
    episode.title,
    episodeSummary,
  );
  const episodeEyebrow = [
    language === 'zh' ? '系列文档' : 'Series document',
    episode.episode_number ? `${language === 'zh' ? '第' : 'Episode'} ${episode.episode_number}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={episode.title}
        description={episode.description || seriesTitle}
        path={`/episodes/${episode.slug}`}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={blogPostingJsonLd({
          title: episode.title,
          description: episode.description || seriesTitle,
          path: `/episodes/${episode.slug}/`,
          datePublished: episode.publish_date,
          dateModified: episode.updated_at || episode.publish_date,
          lang: language as 'en' | 'zh',
          seriesTitle,
          seriesPosition: episode.episode_number,
        })}
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
        likes={!isOverview ? engagement.likes : undefined}
        commentsCount={!isOverview ? engagement.commentsCount : undefined}
        contentClassName="max-w-[82rem] lg:px-12"
        outlineHeadingSelector="header h1, h2, h3"
      >
        {isOverview ? (
          <>
            <header className="pb-8 pt-6">
              <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] leading-5 text-ds-fg-subtle">
                {language === 'en' ? 'Series' : '系列'}
                {seriesData?.episodes.length
                  ? ` · ${seriesData.episodes.length} ${language === 'en' ? 'episodes' : '集'}`
                  : ''}
              </div>
              <h1
                className="max-w-[70rem] text-balance font-display text-ds-fg"
                style={{
                  fontSize: 'clamp(3.8rem, 5.8vw, 5.6rem)',
                  lineHeight: 1.04,
                  fontWeight: 520,
                  letterSpacing: '-0.034em',
                }}
              >
                {seriesTitle}
              </h1>
            </header>

            {seriesData?.description && (
              <section className="mt-8 rounded-ds-lg bg-ds-surface-2 px-6 py-6 sm:px-8">
                <p className="max-w-[58rem] text-pretty text-[19px] font-medium leading-[1.55] text-ds-fg">
                  {seriesData.description}
                </p>
              </section>
            )}

            {seriesData && seriesData.episodes.length > 0 && (
              <div className="mt-12 max-w-[68rem] space-y-1">
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
                    {language === 'en' ? 'Episodes' : '章节'}
                  </span>
                  <span className="h-px flex-1 bg-ds-border" aria-hidden />
                </div>
                <ol className="space-y-1.5">
                  {seriesData.episodes.map((ep, i) => (
                    <li key={ep.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveChapter(ep.id);
                          navigate(`/episodes/${ep.slug}`);
                        }}
                        className="group flex w-full items-baseline gap-4 rounded-ds-md px-3 py-2.5 text-left transition-colors hover:bg-ds-surface-2"
                      >
                        <span className="font-mono text-[12px] text-ds-fg-subtle">
                          {String(ep.episode_number || i + 1).padStart(2, '0')}
                        </span>
                        <span className="flex-1 text-[17px] font-medium leading-7 text-ds-fg group-hover:text-ds-primary">
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
          <SeriesDocumentFrame
            language={language}
            eyebrow={episodeEyebrow}
            title={episode.title}
            summary={episodeSummary}
            activeSection={activeSection}
            likes={engagement.likes}
            commentsCount={engagement.commentsCount}
            onSectionClick={scrollToAnchor}
            meta={[
              ...(episode.publish_date ? [{ icon: Calendar, label: episode.publish_date }] : []),
              ...(episode.duration_minutes
                ? [{ icon: Clock, label: `${episode.duration_minutes} min` }]
                : []),
            ]}
          >
            <BlogContentRenderer
              content={episodeContent}
              isWideScreen={true}
              documentTitle={episode.title}
              readOnly
            />
          </SeriesDocumentFrame>
        )}
        {isOverview && (
          <ContentAttribution
            canonicalPath={`/episodes/${episode.slug}/`}
            kind="series"
            className="mt-12"
          />
        )}
        {!isOverview && (
          <ArticleFooter
            likes={engagement.likes}
            liked={engagement.liked}
            likePending={engagement.likePending}
            likers={engagement.likers}
            contributors={['Silan Hu']}
            publishedAt={episode.publish_date}
            viewCount={displayViews}
            shareTitle={episode.title}
            attribution={{
              canonicalPath: `/episodes/${episode.slug}/`,
              kind: 'series',
            }}
            comments={engagement.comments}
            commentsState={engagement.commentsState}
            commentsError={engagement.commentsError}
            commentSubmitting={engagement.commentSubmitting}
            interactionError={engagement.interactionError}
            onLike={engagement.toggleLike}
            onRetryComments={engagement.reloadComments}
            onComment={engagement.submitComment}
            onCommentLike={engagement.toggleCommentLike}
            isCommentLikePending={engagement.isCommentLikePending}
            onCommentDelete={engagement.deleteComment}
            isCommentDeletePending={engagement.isCommentDeletePending}
          />
        )}
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default EpisodeDetail;
