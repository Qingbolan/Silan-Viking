import { useState, useEffect } from 'react';
import { BlogData } from '../types/blog';
import { fetchBlogById, updateBlogViews } from '../../../api/blog/blogApi';
import { ApiError } from '../../../api/utils';
import { useLanguage } from '../../LanguageContext';
import { calculateReadingTime } from '../../../utils/readingTime';
import { shouldCreditViewDisplay } from '../../../utils/viewDisplayCredit';

export type BlogLoadState = 'loading' | 'ready' | 'not-found' | 'error';

export const useBlogData = (id: string | undefined, retryKey = 0) => {
  const [blog, setBlog] = useState<BlogData | null>(null);
  const [state, setState] = useState<BlogLoadState>('loading');
  const { language } = useLanguage();

  useEffect(() => {
    let active = true;
    const loadBlog = async () => {
      if (!id) {
        setState('not-found');
        return;
      }

      try {
        setState('loading');
        
        // Fetch blog data with language support
        const blogData = await fetchBlogById(id, language as 'en' | 'zh');
        if (!active) return;
        if (blogData) {
          const normalized = blogData.readTime
            ? blogData
            : { ...blogData, readTime: calculateReadingTime(blogData.content || [], language as 'en' | 'zh') };
          setBlog(normalized);
          setState('ready');
          // Try to update view count, but don't fail if it doesn't work
          try {
            const viewRecorded = await updateBlogViews(blogData.id, language as 'en' | 'zh');
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
        setBlog(null);
        setState(err instanceof ApiError && err.status === 404 ? 'not-found' : 'error');
      }
    };

    void loadBlog();
    return () => { active = false; };
  }, [id, language, retryKey]);

  return { blog, state };
}; 
