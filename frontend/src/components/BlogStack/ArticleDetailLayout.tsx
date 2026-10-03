// Single article with an uninterrupted reading flow and a heading outline.
import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
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
} from '../ds';
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
  const engagement = useBlogEngagement({
    postId: post.id,
    initialLikes: post.likes ?? 0,
    initialLiked: Boolean(post.isLikedByUser),
    initialLikers: post.likers ?? [],
    language,
  });

  // Reset to top whenever a new article loads under the same route.
  useEffect(() => {
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [post.id]);

  const likes = engagement.likes;
  const commentsCount = engagement.commentsCount;

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
        chapters={[]}
        wordCount={wordCount}
        showLeftRail={false}
        contentClassName="!pt-0 lg:!pl-0 lg:pr-6"
        outlineHeadingSelector="header h1, h2, h3"
        likes={likes}
        commentsCount={commentsCount}
      >
        {/* Body — article title, short deck, then the long-form content.
            `#kb-active-part` is the contract DOMOutline scans for headings. */}
        <div data-ds className="prose-content markdown-body w-full">

          {(summary || post.projectName || post.publicationVenue || post.externalResources?.length) ? (
            <div className="space-y-2">
              {summary && (
                <section id={ARTICLE_SUMMARY_ID} className="scroll-mt-24">
                  <p className="!m-0 text-pretty text-ds-lg font-normal italic leading-7 text-ds-fg-muted">
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
            </div>
          ) : null}

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
