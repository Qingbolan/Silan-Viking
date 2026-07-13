import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../LanguageContext';
import { BrandLoading } from '../../ds/BrandLoading';
import { NetworkError, NotFoundError } from '../../ds/ErrorState';
import type { BlogLoadState } from '../hooks/useBlogData';

interface BlogLoadingStateProps {
  state: BlogLoadState;
  onRetry?: () => void;
}

export const BlogLoadingState: React.FC<BlogLoadingStateProps> = ({ state, onRetry }) => {
  const navigate = useNavigate();
  const { language } = useLanguage();

  if (state === 'loading') {
    // Match the rest of the site's loading state — the same BrandLoading
    // shown on /gallery and ProjectDetail. Inline variant so the article
    // chrome (header/nav) keeps its space instead of a full-screen splash.
    return (
      <BrandLoading
        inline
        message={language === 'en' ? 'Loading article...' : '加载文章中...'}
      />
    );
  }

  if (state === 'not-found') {
    // A genuine not-found — the blog API resolved with no article. Render
    // the design-system full-page error (brand mark, "Home" + "Go Back"),
    // not a floating antd Alert card.
    return <NotFoundError onBack={() => navigate(-1)} />;
  }

  if (state === 'error') {
    return <NetworkError onRetry={onRetry} />;
  }

  return null;
};
