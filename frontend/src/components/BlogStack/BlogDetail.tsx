import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Import all custom hooks
import { useBlogData } from './hooks/useBlogData';
import { useAnnotations } from './hooks/useAnnotations';

// Import all components
import { BlogLoadingState } from './components/BlogLoadingState';
import ArticleDetailLayout from './ArticleDetailLayout';
import SeriesDetailLayout from './SeriesDetailLayout';

// Import reading behavior utilities
import { readingTracker } from '../../utils/readingBehavior';
import { calculateReadingTime } from '../../utils/readingTime';
import { useLanguage } from '../LanguageContext';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import { Seo, blogPostingJsonLd } from '../Seo';

const BlogDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();

  // UI state
  const [annotations, setAnnotations] = useState<Record<string, boolean>>({});

  // Custom hooks
  const { blog, loading, error } = useBlogData(id);
  const {
    userAnnotations,
    showAnnotationForm,
    newAnnotationText,
    selectedText,
    highlightedAnnotation,
    setNewAnnotationText,
    setShowAnnotationForm,
    handleTextSelection,
    addUserAnnotation,
    removeUserAnnotation,
    highlightAnnotation,
    cancelAnnotation
  } = useAnnotations(id);

  // Reflect the post title in the address-bar breadcrumb.
  useSetPageTitle(blog ? (language === 'zh' && blog.titleZh ? blog.titleZh : blog.title) : null);

  // Start reading tracking when blog is loaded
  useEffect(() => {
    if (blog && blog.id) {
      readingTracker.startSession(blog.id);

      // Cleanup when component unmounts
      return () => {
        readingTracker.endSession();
      };
    }
  }, [blog]);

  // Update reading time if it's missing or incorrect
  useEffect(() => {
    if (blog && blog.content) {
      const calculatedTime = calculateReadingTime(blog.content, language as 'en' | 'zh');
      if (!blog.readTime || blog.readTime === '') {
        // Update the blog object with calculated reading time
        blog.readTime = calculatedTime;
      }
    }
  }, [blog, language]);

  // Handle annotation toggle
  const toggleAnnotation = (contentId: string) => {
    setAnnotations(prev => ({
      ...prev,
      [contentId]: !prev[contentId]
    }));
  };

  // Loading and error states
  if (loading || !blog || error) {
    return <BlogLoadingState loading={loading} error={!!error || (!loading && !blog)} />;
  }

  // Handle back navigation
  const handleBack = () => {
    navigate('/blog');
  };

  // Per-article SEO — title, excerpt, cover image and BlogPosting JSON-LD.
  const seoTitle = language === 'zh' && blog.titleZh ? blog.titleZh : blog.title;
  const seoDescription =
    (language === 'zh' && blog.summaryZh ? blog.summaryZh : blog.summary) || '';
  const seo = (
    <Seo
      title={seoTitle}
      description={seoDescription}
      path={`/blog/${blog.id}`}
      image={blog.vlogCover}
      type="article"
      lang={language as 'en' | 'zh'}
      jsonLd={blogPostingJsonLd({
        title: seoTitle,
        description: seoDescription,
        path: `/blog/${blog.id}`,
        image: blog.vlogCover,
        datePublished: blog.publishDate,
        author: blog.author,
      })}
    />
  );

  if (blog.seriesId) {
    return (
      <>
        {seo}
        <SeriesDetailLayout
        post={blog}
        onBack={handleBack}
        userAnnotations={userAnnotations}
        annotations={annotations}
        showAnnotationForm={showAnnotationForm}
        newAnnotationText={newAnnotationText}
        selectedText={selectedText}
        highlightedAnnotation={highlightedAnnotation}
        onTextSelection={handleTextSelection}
        onToggleAnnotation={toggleAnnotation}
        onSetShowAnnotationForm={setShowAnnotationForm}
        onSetNewAnnotationText={setNewAnnotationText}
        onAddUserAnnotation={(contentId: string) => addUserAnnotation(contentId)}
        onRemoveUserAnnotation={removeUserAnnotation}
        onHighlightAnnotation={highlightAnnotation}
        onCancelAnnotation={cancelAnnotation}
      />
      </>
    );
  }

  return (
    <>
      {seo}
      <ArticleDetailLayout
      post={blog}
      onBack={handleBack}
      userAnnotations={userAnnotations}
      annotations={annotations}
      showAnnotationForm={showAnnotationForm}
      newAnnotationText={newAnnotationText}
      selectedText={selectedText}
      highlightedAnnotation={highlightedAnnotation}
      onTextSelection={handleTextSelection}
      onToggleAnnotation={toggleAnnotation}
      onSetShowAnnotationForm={setShowAnnotationForm}
      onSetNewAnnotationText={setNewAnnotationText}
      onAddUserAnnotation={(contentId: string) => addUserAnnotation(contentId)}
      onRemoveUserAnnotation={removeUserAnnotation}
      onHighlightAnnotation={highlightAnnotation}
      onCancelAnnotation={cancelAnnotation}
      />
    </>
  );
};

export default BlogDetail;
