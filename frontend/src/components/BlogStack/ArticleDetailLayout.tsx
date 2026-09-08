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
import { ContentHero } from '../ds/ContentHero';
import AuthorByline from './components/AuthorByline';
import { ArticleResourceStrip } from './components/ArticleResourceStrip';
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
    <motion.div data-ds id={ARTICLE_ID} className="scroll-mt-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <ContentHero
        id={ARTICLE_HEADER_ID}
        title={title}
        coverImage={coverImage}
        language={language}
        parent={{ label: language === 'zh' ? '博客' : 'Blog', to: '/blog/' }}
        metadata={<>
          <AuthorByline name={authorName} />
          {formattedDate && <><span aria-hidden="true">|</span><span>{formattedDate}</span></>}
          {post.readTime && <><span aria-hidden="true">·</span><span>{post.readTime}</span></>}
        </>}
        details={(post.category || Boolean(post.tags?.length)) && <>
          {post.category && <span>{post.category}</span>}
          {post.tags?.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
        </>}
      />
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
        contentClassName="!pt-0 !pl-0 lg:pr-6"
        outlineHeadingSelector="header h1, h2, h3"
        likes={likes}
        commentsCount={commentsCount}
      >
        {/* Body — article title, short deck, then the long-form content.
            `#kb-active-part` is the contract DOMOutline scans for headings. */}
        <div data-ds className="prose-content markdown-body w-full">

          <nav data-ds aria-label={language === 'zh' ? '文章章节' : 'Article sections'} className="mt-2 flex flex-wrap items-end gap-2 border-b border-ds-border bg-transparent">
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
                    'inline-flex h-12 items-center gap-2 rounded-t-ds-md px-4 first:pl-0 text-ds-base font-semibold transition',
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
              className="scroll-mt-24 rounded-b-ds-lg bg-ds-surface-2 px-6 py-4 sm:px-8"
            >
              <p className="max-w-[58rem] text-pretty text-ds-lg font-medium leading-7 text-ds-fg sm:leading-[1.55]">
                {summary}
              </p>
            </section>
          )}

          <ArticleResourceStrip
            projectName={post.projectName}
            publicationVenue={post.publicationVenue}
            resources={post.externalResources || []}
            language={language}
          />

          <section id={ARTICLE_BODY_ID} className="mt-6 max-w-[68rem] scroll-mt-24">


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
