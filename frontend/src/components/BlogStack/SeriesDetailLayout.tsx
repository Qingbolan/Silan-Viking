// SeriesDetailLayout — a single episode rendered inside the Yuque-style
// knowledge-base shell. The left rail shows the series' episode list
// (clicking an episode navigates to its detail page); the centre shows
// the current episode's markdown; the right rail is the DOM Outline.
//
// The previous implementation hand-rolled three fixed columns and an
// episode list / prev-next nav; this version composes KnowledgeBaseShell
// (the same shell IdeaDetail uses), so all the Yuque polish — sidebar
// border, word counter, FAB pills, footer, outline — comes for free.
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Calendar, Clock } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { BlogData, UserAnnotation, SelectedText } from './types/blog';
import { fetchEpisodeSeries } from '../../api/episodes/episodeApi';
import type { EpisodeSeriesData } from '../../types/episode';
import { BlogContentRenderer } from './components/BlogContentRenderer';
import AuthorByline from './components/AuthorByline';
import SeriesDocumentFrame, {
  SERIES_BODY_ID,
  SERIES_COMMENTS_ID,
  SERIES_HEADER_ID,
  SERIES_LIKES_ID,
  SERIES_SUMMARY_ID,
} from './components/SeriesDocumentFrame';
import { useBlogEngagement } from './hooks/useBlogEngagement';
import { stripLeadingMetadataDuplicates } from './utils/contentText';
import { scrollToAnchor } from '../../lib/scrollToAnchor';
import {
  ArticleFooter,
  KnowledgeBaseShell,
  type BookNavChapter,
} from '../ds';

interface SeriesDetailLayoutProps {
  post: BlogData;
  onBack: () => void;
  userAnnotations: Record<string, UserAnnotation>;
  annotations: Record<string, boolean>;
  showAnnotationForm: string | null;
  newAnnotationText: string;
  selectedText: SelectedText | null;
  highlightedAnnotation: string | null;
  onTextSelection: () => void;
  onToggleAnnotation: (contentId: string) => void;
  onSetShowAnnotationForm: (show: string | null) => void;
  onSetNewAnnotationText: (text: string) => void;
  onAddUserAnnotation: (contentId: string) => void;
  onRemoveUserAnnotation: (id: string) => void;
  onHighlightAnnotation: (id: string) => void;
  onCancelAnnotation: () => void;
}

const SERIES_OVERVIEW_ID = '__series_overview__';

const usableEpisodeSummary = (value?: string): string | undefined => {
  const text = value?.trim();
  if (!text) return undefined;
  if (text.length > 360) return undefined;
  if (/^#{1,6}\s/.test(text)) return undefined;
  return text;
};

const SeriesDetailLayout: React.FC<SeriesDetailLayoutProps> = ({
  post,
  userAnnotations,
  annotations,
  showAnnotationForm,
  newAnnotationText,
  selectedText,
  highlightedAnnotation,
  onTextSelection,
  onToggleAnnotation,
  onSetShowAnnotationForm,
  onSetNewAnnotationText,
  onAddUserAnnotation,
  onRemoveUserAnnotation,
  onHighlightAnnotation,
  onCancelAnnotation,
}) => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [seriesData, setSeriesData] = useState<EpisodeSeriesData | null>(null);
  // Active chapter: the current episode id, or the overview sentinel
  // when the user lands on / clicks the series cover.
  const [activeChapter, setActiveChapter] = useState<string>(post.id);
  const [activeSection, setActiveSection] = useState<string>(SERIES_HEADER_ID);
  const engagement = useBlogEngagement({
    postId: post.id,
    initialLikes: post.likes ?? 0,
    initialLiked: Boolean(post.isLikedByUser),
    initialLikers: post.likers ?? [],
    language,
  });

  // Reset chapter target when the underlying post (episode) changes —
  // BlogDetail re-renders with a new `post` after navigation.
  useEffect(() => {
    setActiveChapter(post.id);
    setActiveSection(SERIES_HEADER_ID);
  }, [post.id]);

  // Fetch the sibling episode list for the left rail.
  useEffect(() => {
    if (!post.seriesSlug) return;
    fetchEpisodeSeries(post.seriesSlug, language as 'en' | 'zh')
      .then(setSeriesData)
      .catch((err) => console.error('Failed to load series data:', err));
  }, [post.seriesSlug, language]);

  // Build the BookNav chapter list — one entry per episode, in series order.
  const chapters: BookNavChapter[] = useMemo(() => {
    if (!seriesData) return [];
    return seriesData.episodes.map((ep) => ({
      id: ep.id,
      label: ep.title,
      onClick: () => {
        setActiveChapter(ep.id);
        if (ep.id !== post.id) navigate(`/blog/${ep.id}`);
      },
    }));
  }, [seriesData, post.id, navigate]);

  const onOverviewClick = () => {
    setActiveChapter(SERIES_OVERVIEW_ID);
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Rough word count from the current episode's content array.
  const wordCount = useMemo(
    () =>
      (post.content || []).reduce(
        (acc, item) => acc + (item.content?.split(/\s+/).filter(Boolean).length || 0),
        0,
      ),
    [post.content],
  );

  const isOverview = activeChapter === SERIES_OVERVIEW_ID;
  const seriesTitle =
    post.seriesTitle || post.seriesSlug || (language === 'en' ? 'Series' : '系列');
  const episodeSummary = usableEpisodeSummary(post.summary);
  const episodeContent = useMemo(
    () => stripLeadingMetadataDuplicates(post.content || [], post.title, episodeSummary),
    [episodeSummary, post.content, post.title],
  );
  const episodeEyebrow = [
    language === 'zh' ? '系列文档' : 'Series document',
    post.episodeNumber ? `${language === 'zh' ? '第' : 'Episode'} ${post.episodeNumber}` : '',
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    if (isOverview) return;
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
  }, [isOverview, post.id]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
        likes={engagement.likes}
        commentsCount={engagement.commentsCount}
        contentClassName="max-w-[82rem] lg:px-12"
        outlineHeadingSelector="header h1, h2, h3"
      >
        {isOverview ? (
          // Series cover — title, episode count, abstract / description, and
          // a quick list of all episodes so the reader can pick one.
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

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ds-fg-muted">
              {typeof post.author === 'string' && post.author && (
                <AuthorByline
                  name={post.author}
                  className="gap-1.5 text-ds-fg-muted"
                  avatarClassName="size-4"
                />
              )}
              {post.publishDate && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {post.publishDate}
                </span>
              )}
              {post.readTime && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {post.readTime}
                </span>
              )}
            </div>

            {post.seriesDescription && (
              <section className="mt-8 rounded-ds-lg bg-ds-surface-2 px-6 py-6 sm:px-8">
                <p className="max-w-[58rem] text-pretty text-[19px] font-medium leading-[1.55] text-ds-fg">
                {post.seriesDescription}
                </p>
              </section>
            )}

            {/* Episode quicklist */}
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
                          navigate(`/blog/${ep.id}`);
                        }}
                        className="group flex w-full items-baseline gap-4 rounded-ds-md px-3 py-2.5 text-left transition-colors hover:bg-ds-surface-2"
                      >
                        <span className="font-mono text-[12px] text-ds-fg-subtle">
                          {String(i + 1).padStart(2, '0')}
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
          // Episode body — markdown content rendered by BlogContentRenderer,
          // which preserves annotation / vlog handling intact.
          <SeriesDocumentFrame
            language={language}
            eyebrow={episodeEyebrow}
            title={post.title}
            summary={episodeSummary}
            activeSection={activeSection}
            likes={engagement.likes}
            commentsCount={engagement.commentsCount}
            onSectionClick={scrollToAnchor}
            meta={[
              ...(typeof post.author === 'string' && post.author
                ? [{
                    label: post.author,
                    content: (
                      <AuthorByline
                        name={post.author}
                        className="gap-1.5 text-ds-fg-subtle"
                        avatarClassName="size-4"
                      />
                    ),
                  }]
                : []),
              ...(post.publishDate ? [{ icon: Calendar, label: post.publishDate }] : []),
              ...(post.readTime ? [{ icon: Clock, label: post.readTime }] : []),
            ]}
          >
            <BlogContentRenderer
              content={episodeContent}
              isWideScreen={true}
              documentTitle={post.title}
              userAnnotations={userAnnotations}
              annotations={annotations}
              showAnnotationForm={showAnnotationForm}
              newAnnotationText={newAnnotationText}
              selectedText={selectedText}
              highlightedAnnotation={highlightedAnnotation}
              onTextSelection={onTextSelection}
              onToggleAnnotation={onToggleAnnotation}
              onSetShowAnnotationForm={onSetShowAnnotationForm}
              onSetNewAnnotationText={onSetNewAnnotationText}
              onAddUserAnnotation={onAddUserAnnotation}
              onRemoveUserAnnotation={onRemoveUserAnnotation}
              onHighlightAnnotation={onHighlightAnnotation}
              onCancelAnnotation={onCancelAnnotation}
            />
          </SeriesDocumentFrame>
        )}

        <ArticleFooter
          likes={engagement.likes}
          liked={engagement.liked}
          likePending={engagement.likePending}
          likers={engagement.likers}
          contributors={[typeof post.author === 'string' ? post.author : 'Silan Hu']}
          publishedAt={post.publishDate}
          viewCount={post.views}
          shareTitle={post.title}
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
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default SeriesDetailLayout;
