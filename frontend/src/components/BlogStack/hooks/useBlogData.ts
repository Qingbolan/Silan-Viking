import { useState, useEffect } from 'react';
import { BlogData } from '../types/blog';
import { fetchBlogById, normalizeBlogResponse, updateBlogViews } from '../../../api/blog/blogApi';
import { ApiError } from '../../../api/utils';
import { readPrerenderResource } from '../../../api/prerenderRouteData';
import { useLanguage } from '../../LanguageContext';
import { calculateReadingTime } from '../../../utils/readingTime';
import { shouldCreditViewDisplay } from '../../../utils/viewDisplayCredit';

export type BlogLoadState = 'loading' | 'ready' | 'not-found' | 'error';

const prepareBlogForRender = (blogData: BlogData, language: 'en' | 'zh'): BlogData =>
  blogData.readTime
    ? blogData
    : { ...blogData, readTime: calculateReadingTime(blogData.content || [], language) };

const readPrerenderedBlog = (id: string | undefined, language: 'en' | 'zh'): BlogData | null => {
  const prerendered = normalizeBlogResponse(
    readPrerenderResource('blog', id, language),
  );
  return prerendered ? prepareBlogForRender(prerendered, language) : null;
};

export const useBlogData = (id: string | undefined, retryKey = 0) => {
  const { language } = useLanguage();
  const currentLanguage = language as 'en' | 'zh';
  const [blog, setBlog] = useState<BlogData | null>(() => readPrerenderedBlog(id, currentLanguage));
  const [state, setState] = useState<BlogLoadState>(() => {
    if (!id) return 'not-found';
    return readPrerenderedBlog(id, currentLanguage) ? 'ready' : 'loading';
  });

  useEffect(() => {
    let active = true;
    const loadBlog = async () => {
      if (!id) {
        setState('not-found');
        return;
      }

      const prerendered = readPrerenderedBlog(id, currentLanguage);
      if (prerendered) {
        setBlog(prerendered);
        setState('ready');
      } else {
        setBlog(null);
        setState('loading');
      }

      try {
        // Fetch blog data with language support
        const blogData = await fetchBlogById(id, currentLanguage);
        if (!active) return;
        if (blogData) {
          const normalized = prepareBlogForRender(blogData, currentLanguage);
          setBlog(normalized);
          setState('ready');
          // Try to update view count, but don't fail if it doesn't work
          try {
            const viewRecorded = await updateBlogViews(blogData.id, currentLanguage);
            if (active && viewRecorded && shouldCreditViewDisplay('blog', blogData.id)) {
              setBlog((current) => current && current.id === blogData.id
                ? { ...current, views: Math.max(0, current.views || 0) + 1 }
                : current);
            }
          } catch {
            // View tracking is non-blocking; article rendering remains usable.
          }
        } else {
          setBlog(null);
          setState('not-found');
        }
      } catch (err) {
        if (!active) return;
        if (!prerendered) {
          setBlog(null);
          setState(err instanceof ApiError && err.status === 404 ? 'not-found' : 'error');
        }
      }
    };

    void loadBlog();
    return () => { active = false; };
  }, [id, currentLanguage, retryKey]);

  return { blog, state };
}; 
