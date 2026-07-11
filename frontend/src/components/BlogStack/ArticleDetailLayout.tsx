// ArticleDetailLayout — single blog article inside the Yuque-style shell.
//
// Unlike Idea / Series (multi-page books), a blog is a single long-form
// piece. So the centre never tab-switches: it renders the whole article
// straight away. The left rail's "chapters" are anchor jumps within the
// same page — Body / Likes / Comments — not page switches.
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Play } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { BlogData, UserAnnotation, SelectedText } from './types/blog';
import { BlogContentRenderer } from './components/BlogContentRenderer';
import {
  ArticleFooter,
  KnowledgeBaseShell,
  type BookNavChapter,
  mockComments,
  mockRecentLikers,
} from '../ds';

interface ArticleDetailLayoutProps {
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

const ARTICLE_ID = 'kb-active-part';   // also the DOMOutline scan root
const LIKES_ID = 'kb-likes';
const COMMENTS_ID = 'kb-comments';

const scrollToAnchor = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
  if (scrollRoot) {
    const top =
      el.getBoundingClientRect().top -
      scrollRoot.getBoundingClientRect().top +
      scrollRoot.scrollTop -
      24;
    scrollRoot.scrollTo({ top, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

const ArticleDetailLayout: React.FC<ArticleDetailLayoutProps> = ({
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
  const [activeChapter, setActiveChapter] = useState<string>(ARTICLE_ID);

  // Reset to top whenever a new article loads under the same route.
  useEffect(() => {
    setActiveChapter(ARTICLE_ID);
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [post.id]);

  // Scroll-spy across the three anchored sections (body / likes / comments)
  // so the left-rail highlight follows the reader.
  useEffect(() => {
    const ids = [ARTICLE_ID, LIKES_ID, COMMENTS_ID];
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    const obs = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActiveChapter(hit.target.id);
      },
      { root: scrollRoot, rootMargin: '-80px 0px -70% 0px', threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [post.id]);

  const likes = post.likes ?? 2047;
  const commentsCount = 94;

  const chapters: BookNavChapter[] = useMemo(
    () => [
      {
        id: ARTICLE_ID,
        label: language === 'en' ? 'Body' : '正文',
        onClick: () => scrollToAnchor(ARTICLE_ID),
      },
      {
        id: LIKES_ID,
        label: `${language === 'en' ? 'Likes' : '点赞'} (${likes})`,
        onClick: () => scrollToAnchor(LIKES_ID),
      },
      {
        id: COMMENTS_ID,
        label: `${language === 'en' ? 'Comments' : '评论'} (${commentsCount})`,
        onClick: () => scrollToAnchor(COMMENTS_ID),
      },
    ],
    [language, likes, commentsCount],
  );

  const wordCount = useMemo(
    () =>
      (post.content || []).reduce(
        (acc, item) => acc + (item.content?.split(/\s+/).filter(Boolean).length || 0),
        0,
      ),
    [post.content],
  );

  const title = language === 'zh' && post.titleZh ? post.titleZh : post.title;
  const summary = language === 'zh' && post.summaryZh ? post.summaryZh : post.summary;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <KnowledgeBaseShell
        overview={{
          label: title,
          icon: post.type === 'vlog' ? Play : BookOpen,
          // Overview link scrolls to the article top — no separate cover page.
          onClick: () => scrollToAnchor(ARTICLE_ID),
          isActive: activeChapter === ARTICLE_ID,
        }}
        chapters={chapters}
        currentChapterId={activeChapter}
        wordCount={wordCount}
        likes={likes}
        commentsCount={commentsCount}
      >
        {/* Body — markdown straight away, no Overview cover. The summary
            sits under the title as a brief introduction. `#kb-active-part`
            is the contract DOMOutline scans for headings. */}
        <div id={ARTICLE_ID} className="prose-content markdown-body w-full scroll-mt-24">
          {summary && (
            <p className="-mt-2 mb-8 text-[15px] leading-[1.8] text-ds-fg-muted">
              {summary}
            </p>
          )}
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

        <ArticleFooter
          likes={likes}
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

export default ArticleDetailLayout;
