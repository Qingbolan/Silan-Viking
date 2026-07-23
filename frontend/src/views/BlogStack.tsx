import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { List, BookOpen, FileText, Film, Layers } from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { BlogData } from '../components/BlogStack/types/blog';
import { fetchBlogPosts } from '../api/blog/blogApi';
import { fetchEpisodeSeriesList } from '../api/episodes/episodeApi';
import { mediaUrl } from '../api/utils';
import type { EpisodeSeriesData } from '../types/episode';
import {
  BlogHeader,
  BrandLoading,
  ErrorState,
  BlogCard,
  EmptyState,
  Masonry,
  Alert,
  Button,
  type BlogCardData,
} from '../components/ds';

const isSeriesPost = (post: BlogData): boolean => post.type === 'episode' || post.type === 'series';

/**
 * Episode series live in a separate `episode_series` table that the blog list
 * endpoint does not join. To make a series surface alongside blog posts in
 * /blog, we fetch the series list separately and synthesise one BlogData
 * record per series — the card it produces opens the first episode, which
 * BlogDetail dispatches to SeriesDetailLayout (the knowledge-base shell).
 */
function seriesToBlogData(series: EpisodeSeriesData): BlogData | null {
  const firstEpisode = series.episodes?.[0];
  if (!firstEpisode) return null;
  // Latest episode = highest episode_number; surfaced as a discrete card
  // field (BlogCard.latestEpisode), NOT folded into the description.
  const latest = [...series.episodes].sort(
    (a, b) => (b.episode_number || 0) - (a.episode_number || 0),
  )[0];
  const description = series.description || '';
  return {
    id: firstEpisode.id,             // open the first episode on card click
    slug: firstEpisode.slug,
    title: series.title,
    titleZh: '',
    summary: description,
    summaryZh: '',
    content: [],
    author: '',
    publishDate: '',
    readTime: '',
    category: '',
    tags: [],
    type: 'series',
    likes: 0,
    views: 0,
    seriesId: series.id,
    seriesSlug: series.slug,
    seriesTitle: series.title,
    seriesTitleZh: '',
    seriesDescription: description,
    seriesDescriptionZh: '',
    seriesImage: series.cover_url ? mediaUrl(series.cover_url) : '',
    episodeNumber: 1,
    totalEpisodes: series.episodes.length,
    // Stash the latest episode on the record so toBlogCardData can pass it
    // through as a typed field — strings on BlogData don't accommodate it.
    latestEpisodeTitle: latest?.title,
    latestEpisodeNumber: latest?.episode_number,
  } as unknown as BlogData;
}

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

  // Series cards may carry a latest-episode pointer (stashed by
  // seriesToBlogData); BlogCard renders it as a dedicated meta row.
  const seriesPost = post as unknown as {
    latestEpisodeTitle?: string;
    latestEpisodeNumber?: number;
  };
  const latestEpisode =
    series && seriesPost.latestEpisodeTitle
      ? {
          title: seriesPost.latestEpisodeTitle,
          episodeNumber: seriesPost.latestEpisodeNumber,
        }
      : undefined;

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
    latestEpisode,
    coverImage,
  };
}

const BlogStack: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [posts, setPosts] = useState<BlogData[]>([]);
  // `selectedTag` holds the raw tag string ('all' = the reset chip).
  // `selectedType` holds a stable key: 'all' | 'article' | 'vlog' | 'series'.
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Handle URL parameters — `?type=` maps directly to a Segmented key.
  useEffect(() => {
    const typeParam = new URLSearchParams(location.search).get('type');
    const normalizedType = typeParam === 'episode' ? 'series' : typeParam;
    const validKeys = ['article', 'vlog', 'series'];
    setSelectedType(
      normalizedType && validKeys.includes(normalizedType) ? normalizedType : 'all',
    );
  }, [location.search]);

  // Load posts
  useEffect(() => {
    let isMounted = true;

    const loadPosts = async () => {
      try {
        setLoading(true);
        setError(null);
        setPartialError(false);

        const [postsResult, seriesResult] = await Promise.allSettled([
          fetchBlogPosts({}, language as 'en' | 'zh'),
          fetchEpisodeSeriesList(language as 'en' | 'zh'),
        ]);

        if (postsResult.status === 'rejected' && seriesResult.status === 'rejected') {
          throw new Error('Both writing sources are unavailable');
        }

        const fetchedPosts = postsResult.status === 'fulfilled' ? postsResult.value : [];
        const fetchedSeries = seriesResult.status === 'fulfilled' ? seriesResult.value : [];

        const seriesCards = fetchedSeries
          .map(seriesToBlogData)
          .filter((p): p is BlogData => p !== null);
        const merged = [...seriesCards, ...fetchedPosts];

        if (isMounted) {
          setPosts(merged);
          setPartialError(postsResult.status === 'rejected' || seriesResult.status === 'rejected');
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
  }, [language, retryKey]);

  // Filter posts based on tag, type and search term
  const filteredPostsMemo = useMemo(() => {
    let filtered = posts;

    if (selectedTag !== 'all') {
      filtered = filtered.filter(post => post.tags.includes(selectedTag));
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter((post) => {
        if (selectedType === 'series') return isSeriesPost(post);
        return (post.type || 'article') === selectedType;
      });
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
      { value: 'series', label: language === 'en' ? 'Series' : '系列', icon: <List /> },
    ],
    [language],
  );

  const handlePostClick = useCallback((post: BlogData) => {
    // Series cards (synthesised from episode_series) route to the dedicated
    // episode detail page; regular blog posts go to BlogDetail.
    if (post.type === 'series' || post.type === 'episode') {
      navigate(`/episodes/${post.slug}`);
      return;
    }
    navigate(`/blog/${post.slug || post.id}`);
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
        onRetry={() => setRetryKey((key) => key + 1)}
      />
    );
  }

  return (
    <motion.div
      className="min-h-screen w-full max-w-full min-w-0 py-16 sm:py-20"
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
      <div className="mx-auto w-full max-w-6xl min-w-0 px-4">
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

        {partialError && (
          <Alert
            tone="warning"
            title={language === 'en' ? 'Some writing could not be loaded' : '部分内容加载失败'}
            className="mb-8"
          >
            <p>{language === 'en' ? 'Available articles and series are shown below.' : '当前可用的文章和系列已显示在下方。'}</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRetryKey((key) => key + 1)}>
              {language === 'en' ? 'Try again' : '重试'}
            </Button>
          </Alert>
        )}

        {/* Blog Posts Grid — masonry / waterfall layout. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedTag}-${selectedType}-${searchTerm}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Masonry
              items={filteredPostsMemo}
              getKey={(post) => post.id}
              bottomPadding={64}
              renderItem={(post) => (
                <BlogCard
                  coverSize="standard"
                  post={toBlogCardData(post, language)}
                  onOpen={() => handlePostClick(post)}
                />
              )}
            />
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredPostsMemo.length === 0 && !loading && (
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
