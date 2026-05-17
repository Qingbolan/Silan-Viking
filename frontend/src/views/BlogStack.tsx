import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, User, ArrowRight, Play, Video, Grid, BookOpen, Tag as TagIcon, ListVideo, Clock } from 'lucide-react';
import { Card, Input, Alert, Spin, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTheme } from '../components/ThemeContext';
import { useLanguage } from '../components/LanguageContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { BlogData } from '../components/BlogStack/types/blog';
import { fetchBlogPosts, fetchEpisodeSeriesList } from '../api';
import type { EpisodeSeriesData } from '../types/episode';


interface BlogCardProps {
  post: BlogData;
  onClick?: (post: BlogData) => void;
}

const BlogCard: React.FC<BlogCardProps> = ({
  post,
  onClick
}) => {
  const { language } = useLanguage();
  const [imageLoadError, setImageLoadError] = useState(false);
  
  // Guard against null/undefined post
  if (!post) {
    return null;
  }

  const handleClick = useCallback(() => {
    onClick?.(post);
  }, [onClick, post]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  const isVlog = post.type === 'vlog';

  // Get the appropriate icon based on type
  const getTypeIcon = () => {
    switch (post.type) {
      case 'vlog':
        return <Video size={16} className="text-red-500" />;
      case 'tutorial':
        return <BookOpen size={16} className="text-green-500" />;
      case 'podcast':
        return <Play size={16} className="text-orange-500" />;
      default:
        return <ArrowRight size={14} />;
    }
  };

  // Get type label
  const getTypeLabel = () => {
    switch (post.type) {
      case 'vlog':
        return language === 'en' ? 'Video Blog' : '视频博客';
      case 'tutorial':
        return language === 'en' ? 'Tutorial' : '教程';
      case 'podcast':
        return language === 'en' ? 'Podcast' : '播客';
      default:
        return language === 'en' ? 'Article' : '文章';
    }
  };

  // Generate arXiv-style paper number based on date and type
  const generatePaperNumber = () => {
    const date = new Date(post.publishDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Create a simple hash from title to ensure consistency
    const titleHash = post.title.split('').reduce((hash, char) => {
      return hash * 31 + char.charCodeAt(0);
    }, 0);
    const paperNum = String(Math.abs(titleHash) % 10000).padStart(4, '0');

    const prefix = post.type === 'vlog' ? 'vlog' : 'blog';

    return `${prefix}.${year}${month}${day}.${paperNum}`;
  };

  const cardCover = (
    <div className="relative overflow-hidden transition-all duration-300 h-48">
        {/* Use vlog cover for vlogs or the generated article cover. */}
        {isVlog && post.vlogCover && !imageLoadError ? (
          <div className="relative w-full h-full">
            <img
              src={post.vlogCover}
              alt={language === 'zh' && post.titleZh ? post.titleZh : post.title}
              className="w-full h-full object-cover"
              onError={() => setImageLoadError(true)}
            />
            {/* arXiv-style paper number overlay for vlogs */}
            <div className="absolute bottom-2 left-2">
              <div className="text-xs font-mono text-white bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                {generatePaperNumber()}
              </div>
            </div>
            {/* Enhanced play button overlay for vlogs */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-black/70 flex items-center justify-center backdrop-blur-sm transition-all duration-300 group-hover:scale-110">
                <Play size={24} className="text-white ml-1" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-project">
            {/* arXiv-style paper number - centered display */}
            <div className="text-2xl font-bold opacity-20 text-theme-primary font-mono">
              {generatePaperNumber()}
            </div>
            {/* Enhanced play button for vlogs without cover */}
            {isVlog && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black/20 flex items-center justify-center backdrop-blur-sm transition-all duration-300 group-hover:bg-black/30">
                  <Play size={24} className="text-theme-primary opacity-30" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-4 left-4">
          <div className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm bg-black/50 text-white">
            {getTypeIcon()}
            <span>{getTypeLabel()}</span>
          </div>
        </div>

        {/* Enhanced duration/reading time overlay */}
        <div className="absolute top-4 right-4">
          <div className="px-3 py-1 rounded-full font-medium backdrop-blur-sm bg-black/50 text-white text-xs">
            {isVlog && post.videoDuration ? (
              <div className="flex items-center gap-1">
                <Play size={12} />
                <span>{post.videoDuration}</span>
              </div>
            ) : (
              post.readTime || (language === 'en' ? '5 min read' : '5分钟阅读')
            )}
          </div>
        </div>
    </div>
  );

  const cardContent = (
    <div>
        {/* Enhanced meta info */}
        <div className="flex items-center flex-wrap gap-3 mb-4 text-sm">
          <div className="flex items-center space-x-1 text-theme-tertiary">
            <Calendar size={14} />
            <span>{new Date(post.publishDate).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center space-x-1 text-theme-tertiary">
            <User size={14} />
            <span>{post.author}</span>
          </div>
          {/* Additional vlog-specific meta info */}
          {isVlog && post.videoDuration && (
            <div className="flex items-center space-x-1 text-red-500">
              <Video size={14} />
              <span>{post.videoDuration}</span>
            </div>
          )}
        </div>

        {/* Title with enhanced styling */}
        <h2 className="font-bold mb-3 group-hover:text-theme-primary transition-colors duration-300 text-theme-primary leading-tight text-xl">
          {language === 'zh' && post.titleZh ? post.titleZh : post.title}
        </h2>

        {/* Excerpt with improved readability */}
        <p className="leading-relaxed mb-4 text-theme-secondary text-sm">
          {language === 'zh' && post.summaryZh ? post.summaryZh : post.summary}
        </p>

        {/* Post tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.slice(0, 4).map((tag, tagIndex) => (
            <span
              key={tagIndex}
              className="px-3 py-1 rounded-full font-medium border text-xs border-theme-card-border text-theme-secondary hover:text-theme-primary transition-colors duration-200"
              title={tag}
            >
              {tag}
            </span>
          ))}
          {post.tags.length > 4 && (
            <span className="px-3 py-1 rounded-full font-medium text-theme-tertiary text-xs">
              +{post.tags.length - 4}
            </span>
          )}
        </div>

        {/* Enhanced call-to-action with better visual hierarchy */}
        <motion.div
          className="flex items-center justify-between mt-4"
          whileHover={{ x: 5 }}
        >
          <div className="flex items-center space-x-2 font-medium text-theme-accent text-sm">
            <span>
              {isVlog
                ? (language === 'en' ? 'Watch video' : '观看视频')
                : (language === 'en' ? 'Read more' : '阅读更多')
              }
            </span>
            {getTypeIcon()}
          </div>
        </motion.div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-3 break-inside-avoid"
    >
      <Card
        hoverable
        cover={cardCover}
        className="blog-card-custom border border-theme-card-border bg-theme-card-background"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Read article: ${post.title}`}
        style={{
          borderRadius: '16px',
          overflow: 'hidden',
        }}
        styles={{ body: { background: 'var(--color-cardBackground)' } }}
      >
        {cardContent}
      </Card>
    </motion.div>
  );
};

interface TagFilterProps {
  tag: string;
  active: boolean;
  onClick: () => void;
}

const TagFilter: React.FC<TagFilterProps> = ({ tag, active, onClick }) => {
  return (
    <motion.button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-theme-primary ring-offset-theme-background filter-chip ${
        active ? 'active' : ''
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
      type="button"
    >
      {tag}
    </motion.button>
  );
};

interface SeriesCardProps {
  series: EpisodeSeriesData;
}

const SeriesCard: React.FC<SeriesCardProps> = ({ series }) => {
  const { language } = useLanguage();
  const latestEpisode = series.episodes[0];

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-theme-card-border bg-theme-card-background p-6"
    >
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-theme-primary-light text-theme-accent">
          <ListVideo size={22} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-theme-tertiary">
            {language === 'en' ? 'Series' : '系列'}
          </div>
          <h2 className="text-xl font-semibold leading-tight text-theme-primary">{series.title}</h2>
          {series.description && (
            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-theme-secondary">
              {series.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-theme-tertiary">
        <span className="flex items-center gap-1">
          <ListVideo size={14} />
          {series.episodes.length} {language === 'en' ? 'episodes' : '集'}
        </span>
        {latestEpisode?.publish_date && (
          <span className="flex items-center gap-1">
            <Calendar size={14} />
            {latestEpisode.publish_date}
          </span>
        )}
        {latestEpisode?.duration_minutes ? (
          <span className="flex items-center gap-1">
            <Clock size={14} />
            {latestEpisode.duration_minutes}m
          </span>
        ) : null}
      </div>

      {series.episodes.length > 0 && (
        <div className="mt-5 space-y-3">
          {series.episodes.slice(0, 3).map((episode) => (
            <div key={episode.id} className="border-t border-theme-border pt-3">
              <div className="text-xs text-theme-tertiary">
                {language === 'en' ? 'Episode' : '第'} {episode.episode_number}
              </div>
              <div className="mt-1 font-medium text-theme-primary">{episode.title}</div>
            </div>
          ))}
        </div>
      )}
    </motion.article>
  );
};

const BlogStack: React.FC = () => {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [posts, setPosts] = useState<BlogData[]>([]);
  const [series, setSeries] = useState<EpisodeSeriesData[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<BlogData[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>(() => (language === 'en' ? 'All' : '全部'));
  const [selectedType, setSelectedType] = useState<string>(() => (language === 'en' ? 'All' : '全部'));
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Set CSS variables based on current theme
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [colors]);

  // Scroll to top on component mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Handle URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const typeParam = searchParams.get('type');
    const allLabel = language === 'en' ? 'All' : '全部';
    if (typeParam) {
      // Map category filter keys to display names
      const typeMap: Record<string, string> = {
        'article': language === 'en' ? 'Articles' : '文章',
        'vlog': language === 'en' ? 'Videos' : '视频',
        'series': language === 'en' ? 'Series' : '系列',
      };
      const displayType = typeMap[typeParam] || allLabel;
      setSelectedType(displayType);
    } else {
      setSelectedType(allLabel);
    }
  }, [location.search, language]);

  // Keep default selection in sync with language
  useEffect(() => {
    const allLabel = language === 'en' ? 'All' : '全部';
    setSelectedTag(allLabel);
    // selectedType is handled in the URL effect above
  }, [language]);

  // Load posts
  useEffect(() => {
    let isMounted = true;

    const loadPosts = async () => {
      try {
        setLoading(true);
        setError(null);

        const [fetchedPosts, fetchedSeries] = await Promise.all([
          fetchBlogPosts({}, language as 'en' | 'zh'),
          fetchEpisodeSeriesList(language as 'en' | 'zh').catch(() => []),
        ]);

        if (isMounted) {
          setPosts(fetchedPosts);
          setSeries(fetchedSeries);
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

    if (selectedTag !== 'All' && selectedTag !== '全部') {
      filtered = filtered.filter(post => post.tags.includes(selectedTag));
    }

    if (selectedType !== 'All' && selectedType !== '全部') {
      const typeMap: Record<string, string> = {
        'Articles': 'article',
        'Videos': 'vlog',
        'Series': 'series',
        '文章': 'article',
        '视频': 'vlog',
        '系列': 'series',
      };
      const targetType = typeMap[selectedType] || selectedType;
      if (targetType === 'series') {
        return [];
      }
      filtered = filtered.filter(post => (post.type || 'article') === targetType);
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
  }, [posts, selectedTag, selectedType, searchTerm, language]);

  useEffect(() => {
    setFilteredPosts(filteredPostsMemo);
  }, [filteredPostsMemo]);

  // Get all unique tags
  const tags = useMemo(() => {
    const allTags = Array.from(new Set(posts.flatMap(post => post.tags)));
    return [language === 'en' ? 'All' : '全部', ...allTags];
  }, [posts, language]);

  // Content type chips — only show a type that actually has content.
  const contentTypes = useMemo(() => {
    const en = language === 'en';
    const all = en ? 'All' : '全部';
    const hasArticles = posts.some(p => (p.type || 'article') === 'article');
    const hasVideos = posts.some(p => p.type === 'vlog');
    const hasSeries = series.length > 0;
    const out = [all];
    if (hasArticles) out.push(en ? 'Articles' : '文章');
    if (hasVideos) out.push(en ? 'Videos' : '视频');
    if (hasSeries) out.push(en ? 'Series' : '系列');
    return out;
  }, [posts, series, language]);

  // Reset the type filter if the selected type no longer has content.
  useEffect(() => {
    if (!contentTypes.includes(selectedType)) {
      setSelectedType(language === 'en' ? 'All' : '全部');
    }
  }, [contentTypes, selectedType, language]);

  const handlePostClick = useCallback((post: BlogData) => {
    // Navigate to blog detail page
    navigate(`/blog/${post.id}`);
  }, [navigate]);

  const selectedTypeKey = useMemo(() => {
    const typeMap: Record<string, string> = {
      'All': 'all',
      '全部': 'all',
      'Articles': 'article',
      '文章': 'article',
      'Videos': 'vlog',
      '视频': 'vlog',
      'Series': 'series',
      '系列': 'series',
    };
    return typeMap[selectedType] || 'all';
  }, [selectedType]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" tip={language === 'en' ? 'Loading blog posts...' : '加载博客文章中...'}>
          <div style={{ minHeight: '200px' }} />
        </Spin>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Alert
          message={language === 'en' ? 'Error Loading Posts' : '加载文章出错'}
          description={error}
          type="error"
          showIcon
          style={{ maxWidth: '400px' }}
        />
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen py-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-6 text-theme-primary">
            {language === 'en' ? 'Blog' : '博客'}
          </h1>
          <p className="text-xl max-w-3xl mx-auto text-theme-secondary">
            {language === 'en'
              ? "Thoughts, insights, and tutorials on AI, software development, and emerging technologies."
              : "关于AI、软件开发和新兴技术的思考、见解和教程。"
            }
          </p>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          className="mb-12 space-y-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Search Bar */}
          <div className="max-w-md mx-auto">
            <Input
              placeholder={language === 'en' ? 'Search articles...' : '搜索文章...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="large"
              allowClear
              style={{ borderRadius: '12px' }}
              prefix={<SearchOutlined className="text-theme-tertiary" />}
              aria-label={language === 'en' ? 'Search articles' : '搜索文章'}
            />
          </div>

          {/* Content Type Filters */}
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center space-x-2 mb-2">
              <Grid size={16} className="text-theme-secondary" />
              <span className="text-sm font-medium text-theme-secondary">
                {language === 'en' ? 'Content type:' : '内容类型：'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by content type">
              {contentTypes.map((type) => (
                <TagFilter
                  key={type}
                  tag={type}
                  active={selectedType === type}
                  onClick={() => setSelectedType(type)}
                />
              ))}
            </div>
          </div>

          {/* Tag Filters */}
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center space-x-2 mb-2">
              <TagIcon size={16} className="text-theme-secondary" />
              <span className="text-sm font-medium text-theme-secondary">
                {language === 'en' ? 'Filter by topic:' : '按主题筛选：'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter tags">
              {tags.map((tag) => (
                <TagFilter
                  key={tag}
                  tag={tag}
                  active={selectedTag === tag}
                  onClick={() => setSelectedTag(tag)}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {selectedTypeKey === 'series' ? (
          <motion.div
            key="series"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {series.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {series.map((item) => (
                  <SeriesCard key={item.id} series={item} />
                ))}
              </div>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    <h3 className="text-xl font-semibold mb-2">
                      {language === 'en' ? 'No series found' : '暂无系列'}
                    </h3>
                    <p>
                      {language === 'en'
                        ? 'Series will appear here when episodic content is published.'
                        : '分集内容发布后会显示在这里。'}
                    </p>
                  </span>
                }
              />
            )}
          </motion.div>
        ) : (
          <>
            {/* Blog Posts — CSS columns masonry. The browser lays each
                card out by its real content height; `break-inside-avoid`
                on the card keeps it whole. No height prediction. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${selectedTag}-${selectedType}-${searchTerm}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="[column-gap:12px] columns-1 sm:columns-2 xl:columns-3"
              >
                {filteredPosts.map((post) => (
                  <BlogCard
                    key={post.id}
                    post={post}
                    onClick={handlePostClick}
                  />
                ))}
              </motion.div>
            </AnimatePresence>

            {/* Empty State */}
            {filteredPosts.length === 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span>
                      <h3 className="text-xl font-semibold mb-2">
                        {language === 'en' ? 'No articles found' : '未找到文章'}
                      </h3>
                      <p>
                        {language === 'en'
                          ? 'Try adjusting your search terms or filters.'
                          : '尝试调整您的搜索词或筛选器。'
                        }
                      </p>
                    </span>
                  }
                />
              </motion.div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

export default BlogStack; 
