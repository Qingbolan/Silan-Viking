// ArticleDetailLayout — single blog article inside the Yuque-style shell.
//
// Unlike Moment / Series (multi-page books), a blog is a single long-form
// piece. So the centre never tab-switches: it renders the whole article
// straight away. The left rail's "chapters" are anchor jumps within the
// same page — Body / Likes / Comments — not page switches.
import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlignLeft,
  BookOpen,
  FileText,
  MessageCircle,
  Play,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { BlogData, UserAnnotation, SelectedText } from './types/blog';
import { BlogContentRenderer } from './components/BlogContentRenderer';
import AuthorByline from './components/AuthorByline';
import { useBlogEngagement } from './hooks/useBlogEngagement';
import {
  ArticleFooter,
  KnowledgeBaseShell,
  type BookNavChapter,
} from '../ds';
import { cn } from '../../lib/utils';
import { scrollToAnchor } from '../../lib/scrollToAnchor';
import { stripLeadingMetadataDuplicates } from './utils/contentText';

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
const ARTICLE_HEADER_ID = 'kb-article-header';
const ARTICLE_SUMMARY_ID = 'kb-article-summary';
const ARTICLE_BODY_ID = 'kb-article-body';
const LIKES_ID = 'kb-likes';
const COMMENTS_ID = 'kb-comments';

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
  const engagement = useBlogEngagement({
    postId: post.id,
    initialLikes: post.likes ?? 0,
    initialLiked: Boolean(post.isLikedByUser),
    initialLikers: post.likers ?? [],
    language,
  });

  // Reset to top whenever a new article loads under the same route.
  useEffect(() => {
    setActiveChapter(ARTICLE_ID);
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [post.id]);

  // Scroll-spy across the article sections so the local section tabs and
  // floating actions follow the reader.
  // so the left-rail highlight follows the reader.
  useEffect(() => {
    const ids = [ARTICLE_HEADER_ID, ARTICLE_SUMMARY_ID, ARTICLE_BODY_ID, LIKES_ID, COMMENTS_ID];
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

  const likes = engagement.likes;
  const commentsCount = engagement.commentsCount;

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
  const coverImage = post.coverImage || post.vlogCover || post.videoThumbnail;
  const articleContent = useMemo(() => {
    return stripLeadingMetadataDuplicates(post.content || [], title, summary);
  }, [post.content, summary, title]);
  const authorName = typeof post.author === 'string' && post.author.trim()
    ? post.author.trim()
    : 'Silan Hu';
  const sectionTabs = useMemo(
    () => [
      {
        id: ARTICLE_SUMMARY_ID,
        label: language === 'zh' ? '摘要' : 'Summary',
        icon: FileText,
      },
      {
        id: ARTICLE_BODY_ID,
        label: language === 'zh' ? '正文' : 'Body',
        icon: AlignLeft,
      },
      {
        id: COMMENTS_ID,
        label: language === 'zh' ? `评论 ${commentsCount}` : `Comments ${commentsCount}`,
        icon: MessageCircle,
      },
    ],
    [commentsCount, language],
  );
  const formattedDate = useMemo(() => {
    const date = new Date(post.publishDate);
    if (Number.isNaN(date.getTime())) return post.publishDate;
    return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-SG', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  }, [language, post.publishDate]);

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
        showLeftRail={false}
        contentClassName="max-w-[82rem] lg:px-12"
        outlineHeadingSelector="header h1, h2, h3"
        outlineDefaultCollapsed
        likes={likes}
        commentsCount={commentsCount}
      >
        {/* Body — article title, short deck, then the long-form content.
            `#kb-active-part` is the contract DOMOutline scans for headings. */}
        <div id={ARTICLE_ID} className="prose-content markdown-body w-full scroll-mt-24">
          <header id={ARTICLE_HEADER_ID} className="scroll-mt-24 pb-8 pt-6">
            <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] leading-5 text-ds-fg-subtle">
              {formattedDate && <span>{formattedDate}</span>}
              {post.category && <span>{post.category}</span>}
              {post.readTime && <span>{post.readTime}</span>}
            </div>
            <h1
              className="max-w-[70rem] text-balance font-display text-ds-fg"
              style={{
                fontSize: 'clamp(4.25rem, 6.4vw, 6.2rem)',
                lineHeight: 1.02,
                fontWeight: 500,
                letterSpacing: '-0.035em',
              }}
            >
              {title}
            </h1>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-medium leading-6 text-ds-fg-muted">
              <AuthorByline name={authorName} />
              {post.tags?.slice(0, 3).map((tag) => (
                <span key={tag} className="font-mono text-[12px] text-ds-fg-subtle">
                  #{tag}
                </span>
              ))}
            </div>
            {coverImage && (
              <figure className="mt-10 max-w-[74rem] overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-2 shadow-ds-2">
                <div className="aspect-[16/9] w-full overflow-hidden">
                  <img
                    src={coverImage}
                    alt={`${title} cover`}
                    loading="eager"
                    className="size-full object-cover"
                  />
                </div>
              </figure>
            )}
          </header>

          <nav data-ds aria-label={language === 'zh' ? '文章章节' : 'Article sections'} className="mt-2 flex flex-wrap items-end gap-2 border-b border-ds-border">
            {sectionTabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === ARTICLE_BODY_ID
                ? activeChapter === ARTICLE_BODY_ID
                : tab.id === COMMENTS_ID
                  ? activeChapter === COMMENTS_ID
                  : activeChapter === ARTICLE_HEADER_ID || activeChapter === ARTICLE_SUMMARY_ID;
              return (
                <button
                  data-ds
                  key={tab.id}
                  type="button"
                  onClick={() => scrollToAnchor(tab.id)}
                  className={cn(
                    'inline-flex h-12 items-center gap-2 rounded-t-ds-md px-4 text-[15px] font-semibold transition',
                    active
                      ? 'text-ds-primary'
                      : 'text-ds-fg-muted hover:text-ds-primary',
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {summary && (
            <section
              id={ARTICLE_SUMMARY_ID}
              className="scroll-mt-24 rounded-b-ds-lg bg-ds-surface-2 px-6 py-6 sm:px-8"
            >
              <p className="max-w-[58rem] text-pretty text-[19px] font-medium leading-[1.55] text-ds-fg">
                {summary}
              </p>
            </section>
          )}

          <section id={ARTICLE_BODY_ID} className="mt-12 max-w-[68rem] scroll-mt-24">
            <div className="mb-6 flex items-center gap-3">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
                {language === 'zh' ? '正文' : 'Body'}
              </span>
              <span className="h-px flex-1 bg-ds-border" aria-hidden />
            </div>

            <BlogContentRenderer
              content={articleContent}
              isWideScreen={true}
              documentTitle={title}
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
          </section>
        </div>

        <ArticleFooter
          likes={likes}
          liked={engagement.liked}
          likePending={engagement.likePending}
          likers={engagement.likers}
          contributors={[typeof post.author === 'string' ? post.author : 'Silan Hu']}
          publishedAt={post.publishDate}
          viewCount={post.views}
          shareTitle={title}
          attribution={{
            author: authorName,
            canonicalPath: `/blog/${post.slug || post.id}/`,
            kind: 'article',
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
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default ArticleDetailLayout;
