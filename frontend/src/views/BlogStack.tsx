import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, BookOpen, FileText, Film, Layers } from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { BlogData } from '../components/BlogStack/types/blog';
import { fetchBlogPosts } from '../api';
import {
  BlogHeader,
  BrandLoading,
  ErrorState,
  BlogCard,
  EmptyState,
  Masonry,
  type BlogCardData,
} from '../components/ds';

const isSeriesPost = (post: BlogData): boolean => post.type === 'episode' || post.type === 'series';

/**
 * Map a BlogData record to the ds BlogCard's data shape, honouring the
 * current language for title/excerpt. Series posts use the series-level
 * title/description and image; everything else uses the post fields.
 */
function toBlogCardData(post: BlogData, language: string): BlogCardData {
  const zh = language === 'zh';
  const series = isSeriesPost(post);

  const title = series && post.seriesTitle
    ? (zh && post.seriesTitleZh ? post.seriesTitleZh : post.seriesTitle)
    : (zh && post.titleZh ? post.titleZh : post.title);

  const excerpt = series && (post.seriesDescription || post.seriesDescriptionZh)
    ? (zh && post.seriesDescriptionZh ? post.seriesDescriptionZh : post.seriesDescription)
    : (zh && post.summaryZh ? post.summaryZh : post.summary);

  const coverImage = series
    ? post.seriesImage
    : (post.vlogCover || post.videoThumbnail);

  return {
    id: post.id,
    title,
    excerpt,
    tags: post.tags,
    date: post.publishDate
      ? new Date(post.publishDate).toLocaleDateString()
      : undefined,
    author: post.author,
    readTime: post.videoDuration || post.readTime,
    kind: series ? 'series' : 'article',
    episodeCount: series ? post.totalEpisodes : undefined,
    coverImage,
  };
}

const arrangePostsForGrid = (posts: BlogData[]): BlogData[] => {
  const series = posts.filter(isSeriesPost);
  const singles = posts.filter((post) => !isSeriesPost(post));

  if (series.length === 0 || singles.length === 0) {
    return posts;
  }

  const arranged: BlogData[] = [];
  let seriesIndex = 0;
  let singleIndex = 0;

  while (seriesIndex < series.length || singleIndex < singles.length) {
    if (seriesIndex < series.length && singleIndex < singles.length) {
      arranged.push(series[seriesIndex]);
      arranged.push(singles[singleIndex]);
      seriesIndex += 1;
      singleIndex += 1;
      continue;
    }

    if (seriesIndex < series.length) {
      arranged.push(series[seriesIndex]);
      seriesIndex += 1;
      continue;
    }

    arranged.push(singles[singleIndex]);
    singleIndex += 1;
  }

  return arranged;
};

const BlogStack: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [posts, setPosts] = useState<BlogData[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<BlogData[]>([]);
  // `selectedTag` holds the raw tag string ('all' = the reset chip).
  // `selectedType` holds a stable key: 'all' | 'article' | 'vlog' | 'episode'.
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Handle URL parameters — `?type=` maps directly to a Segmented key.
  useEffect(() => {
    const typeParam = new URLSearchParams(location.search).get('type');
    const validKeys = ['article', 'vlog', 'episode'];
    setSelectedType(typeParam && validKeys.includes(typeParam) ? typeParam : 'all');
  }, [location.search]);

  // Load posts
  useEffect(() => {
    let isMounted = true;

    const loadPosts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch blog posts from API with language support
        const fetchedPosts = await fetchBlogPosts({}, language as 'en' | 'zh');

        if (isMounted) {
          setPosts(fetchedPosts);
          setFilteredPosts(fetchedPosts);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(language === 'en' ? 'Failed to load blog posts' : '加载博客文章失败');
          setLoading(false);
        }
      }
    };

    loadPosts();

    return () => {
      isMounted = false;
    };
  }, [language]);

  // Filter posts based on tag, type and search term
  const filteredPostsMemo = useMemo(() => {
    let filtered = posts;

    if (selectedTag !== 'all') {
      filtered = filtered.filter(post => post.tags.includes(selectedTag));
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter(post => (post.type || 'article') === selectedType);
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(post =>
        post.title.toLowerCase().includes(searchLower) ||
        (post.titleZh && post.titleZh.toLowerCase().includes(searchLower)) ||
        post.summary.toLowerCase().includes(searchLower) ||
        (post.summaryZh && post.summaryZh.toLowerCase().includes(searchLower)) ||
        post.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [posts, selectedTag, selectedType, searchTerm]);

  useEffect(() => {
    setFilteredPosts(filteredPostsMemo);
  }, [filteredPostsMemo]);

  const arrangedPosts = useMemo(
    () => arrangePostsForGrid(filteredPosts),
    [filteredPosts],
  );

  // Topic chips — 'all' is the reset chip, followed by every unique tag.
  const tags = useMemo(
    () => ['all', ...Array.from(new Set(posts.flatMap(post => post.tags)))],
    [posts],
  );

  // Content-type Segmented options — stable keys, localized labels + icons.
  const typeOptions = useMemo(
    () => [
      { value: 'all', label: language === 'en' ? 'All' : '全部', icon: <Layers /> },
      { value: 'article', label: language === 'en' ? 'Articles' : '文章', icon: <FileText /> },
      { value: 'vlog', label: language === 'en' ? 'Videos' : '视频', icon: <Film /> },
      { value: 'episode', label: language === 'en' ? 'Series' : '系列', icon: <List /> },
    ],
    [language],
  );

  const handlePostClick = useCallback((post: BlogData) => {
    // Navigate to blog detail page
    navigate(`/blog/${post.id}`);
  }, [navigate]);

  if (loading) {
    return (
      <BrandLoading
        message={language === 'en' ? 'Loading blog posts…' : '加载博客文章中…'}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        variant="page"
        title={language === 'en' ? 'Error Loading Posts' : '加载文章出错'}
        description={error}
        showHome
      />
    );
  }

  return (
    <motion.div
      className="min-h-screen py-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Seo
        title={language === 'en' ? 'Blog' : '博客'}
        description={
          language === 'en'
            ? 'Articles and writing by Silan Hu on AI, machine learning and software engineering.'
            : '胡思蓝关于人工智能、机器学习与软件工程的文章与写作。'
        }
        path="/blog"
        lang={language as 'en' | 'zh'}
      />
      <div className="max-w-7xl mx-auto px-4">
        {/* Header — title + search + content-type + topic filters. */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <BlogHeader
            eyebrow={language === 'en' ? 'Writing' : '文字'}
            title={language === 'en' ? 'Blog' : '博客'}
            description={
              language === 'en'
                ? 'Thoughts, insights, and tutorials on AI, software development, and emerging technologies.'
                : '关于AI、软件开发和新兴技术的思考、见解和教程。'
            }
            search={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder={language === 'en' ? 'Search articles…' : '搜索文章…'}
            typeOptions={typeOptions}
            selectedType={selectedType}
            onTypeChange={setSelectedType}
            typeLabel={language === 'en' ? 'Type' : '类型'}
            tags={tags}
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            tagLabel={language === 'en' ? 'Topics' : '主题'}
            formatTag={(tag) =>
              tag === 'all' ? (language === 'en' ? 'All' : '全部') : tag
            }
          />
        </motion.div>

        {/* Blog Posts Grid — masonry / waterfall layout. Series posts
            span 2 columns with the wide `feature` layout. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedTag}-${selectedType}-${searchTerm}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Masonry
              items={arrangedPosts}
              getKey={(post) => post.id}
              getSpan={(post) => (isSeriesPost(post) ? 2 : 1)}
              renderItem={(post) => (
                <BlogCard
                  coverSize={isSeriesPost(post) ? 'feature' : 'standard'}
                  post={toBlogCardData(post, language)}
                  onOpen={() => handlePostClick(post)}
                />
              )}
            />
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredPosts.length === 0 && !loading && (
          <motion.div
            className="py-20"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <EmptyState
              icon={<BookOpen />}
              title={language === 'en' ? 'No articles found' : '未找到文章'}
              description={
                language === 'en'
                  ? 'Try adjusting your search terms or filters.'
                  : '尝试调整您的搜索词或筛选器。'
              }
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default BlogStack; 
