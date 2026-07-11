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
import { BookOpen, Calendar, Clock, User } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { BlogData, UserAnnotation, SelectedText } from './types/blog';
import { fetchEpisodeSeries } from '../../api';
import type { EpisodeSeriesData } from '../../types/episode';
import { BlogContentRenderer } from './components/BlogContentRenderer';
import {
  ArticleFooter,
  KnowledgeBaseShell,
  type BookNavChapter,
  mockComments,
  mockRecentLikers,
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

  // Reset chapter target when the underlying post (episode) changes —
  // BlogDetail re-renders with a new `post` after navigation.
  useEffect(() => {
    setActiveChapter(post.id);
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
        likes={post.likes ?? 2047}
        commentsCount={94}
      >
        {isOverview ? (
          // Series cover — title, episode count, abstract / description, and
          // a quick list of all episodes so the reader can pick one.
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

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ds-fg-muted">
              {typeof post.author === 'string' && post.author && (
                <span className="inline-flex items-center gap-1.5">
                  <User className="size-3.5" />
                  {post.author}
                </span>
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
              <p className="mt-8 text-[15px] leading-[1.8] text-ds-fg-muted">
                {post.seriesDescription}
              </p>
            )}

            {/* Episode quicklist */}
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
                          navigate(`/blog/${ep.id}`);
                        }}
                        className="group flex w-full items-baseline gap-3 rounded-md px-2 py-2 text-left hover:bg-ds-surface-2"
                      >
                        <span className="font-mono text-[12px] text-ds-fg-subtle">
                          {String(i + 1).padStart(2, '0')}
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
          // Episode body — markdown content rendered by BlogContentRenderer,
          // which preserves annotation / vlog handling intact.
          <div id="kb-active-part" className="prose-content markdown-body w-full">
            <h1 className="mb-6 text-[32px] font-bold leading-[1.3] tracking-[-0.01em] text-ds-fg">
              {post.title}
            </h1>
            <BlogContentRenderer
              content={post.content}
              isWideScreen={true}
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
          </div>
        )}

        <ArticleFooter
          likes={post.likes ?? 2047}
          recentLikers={mockRecentLikers}
          contributors={[typeof post.author === 'string' ? post.author : 'Silan Hu']}
          publishedAt={post.publishDate || '2026-04-15'}
          viewCount={post.views ?? 1296204}
          ipRegion="Singapore"
          comments={mockComments}
        />
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default SeriesDetailLayout;
