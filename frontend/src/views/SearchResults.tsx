import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, FileText, Lightbulb, Briefcase, Loader2 } from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { useTheme } from '../components/ThemeContext';
import { Seo } from '../components/Seo';
import { globalSearch, type GlobalSearchResponse } from '../api/search/searchApi';

const SearchResults: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { language } = useLanguage();
  const { colors } = useTheme();
  const [results, setResults] = useState<GlobalSearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'blog' | 'project' | 'idea'>('all');

  useEffect(() => {
    const fetchResults = async () => {
      if (!query.trim()) {
        setResults(null);
        return;
      }

      setIsLoading(true);
      try {
        const response = await globalSearch({ query, type: activeTab, limit: 20 }, language);
        setResults(response);
      } catch (error) {
        console.error('Search error:', error);
        setResults(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [query, activeTab, language]);

  const tabs = [
    { key: 'all', label: language === 'en' ? 'All' : '全部', count: results?.total || 0 },
    { key: 'blog', label: language === 'en' ? 'Blogs' : '博客', count: results?.blogs.length || 0 },
    { key: 'project', label: language === 'en' ? 'Projects' : '项目', count: results?.projects.length || 0 },
    { key: 'idea', label: language === 'en' ? 'Ideas' : '想法', count: results?.ideas.length || 0 },
  ];

  return (
    <div className="min-h-screen pt-24 pb-12 px-4" style={{ backgroundColor: colors.background }}>
      <Seo
        title={language === 'en' ? 'Search' : '搜索'}
        path="/search"
        noindex
        lang={language as 'en' | 'zh'}
      />
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center" style={{ color: colors.textPrimary }}>
            <Search size={32} className="mr-3" />
            {language === 'en' ? 'Search Results' : '搜索结果'}
          </h1>
          {query && (
            <p className="text-lg" style={{ color: colors.textSecondary }}>
              {language === 'en' ? 'Results for' : '搜索'} "<span style={{ color: colors.primary }}>{query}</span>"
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mb-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className="px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap"
              style={{
                backgroundColor: activeTab === tab.key ? colors.primary : colors.surface,
                color: activeTab === tab.key ? '#ffffff' : colors.textPrimary,
                border: `1px solid ${activeTab === tab.key ? colors.primary : colors.cardBorder}`
              }}
            >
              {tab.label} {tab.count > 0 && `(${tab.count})`}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={48} className="animate-spin" style={{ color: colors.primary }} />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !query && (
          <div className="text-center py-20" style={{ color: colors.textSecondary }}>
            <Search size={64} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">{language === 'en' ? 'Enter a search query to get started' : '输入搜索查询以开始'}</p>
          </div>
        )}

        {/* No Results */}
        {!isLoading && query && results && results.total === 0 && (
          <div className="text-center py-20" style={{ color: colors.textSecondary }}>
            <Search size={64} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">{language === 'en' ? 'No results found for your query' : '未找到匹配的结果'}</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && results && results.total > 0 && (
          <div className="space-y-8">
            {/* Blog Results */}
            {(activeTab === 'all' || activeTab === 'blog') && results.blogs.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center" style={{ color: colors.textPrimary }}>
                  <FileText size={24} className="mr-2" />
                  {language === 'en' ? 'Blogs' : '博客'} ({results.blogs.length})
                </h2>
                <div className="grid gap-4">
                  {results.blogs.map((blog) => (
                    <motion.div
                      key={blog.id}
                      whileHover={{ scale: 1.01 }}
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.cardBorder
                      }}
                    >
                      <Link to={`/blog/${blog.slug || blog.id}`}>
                        <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primary }}>
                          {language === 'en' ? blog.title : blog.titleZh || blog.title}
                        </h3>
                        <p className="text-sm mb-2 line-clamp-2" style={{ color: colors.textSecondary }}>
                          {language === 'en' ? (blog.summary || '') : (blog.summaryZh || blog.summary || '')}
                        </p>
                        {blog.tags && blog.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {blog.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-1 rounded text-xs"
                                style={{
                                  backgroundColor: `${colors.primary}15`,
                                  color: colors.primary
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Project Results */}
            {(activeTab === 'all' || activeTab === 'project') && results.projects.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center" style={{ color: colors.textPrimary }}>
                  <Briefcase size={24} className="mr-2" />
                  {language === 'en' ? 'Projects' : '项目'} ({results.projects.length})
                </h2>
                <div className="grid gap-4">
                  {results.projects.map((project) => (
                    <motion.div
                      key={project.id}
                      whileHover={{ scale: 1.01 }}
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.cardBorder
                      }}
                    >
                      <Link to={`/projects/${project.id}`}>
                        <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primary }}>
                          {project.title}
                        </h3>
                        <p className="text-sm mb-2 line-clamp-2" style={{ color: colors.textSecondary }}>
                          {project.description}
                        </p>
                        {project.tags && project.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {project.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-1 rounded text-xs"
                                style={{
                                  backgroundColor: `${colors.primary}15`,
                                  color: colors.primary
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Idea Results */}
            {(activeTab === 'all' || activeTab === 'idea') && results.ideas.length > 0 && (
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center" style={{ color: colors.textPrimary }}>
                  <Lightbulb size={24} className="mr-2" />
                  {language === 'en' ? 'Ideas' : '想法'} ({results.ideas.length})
                </h2>
                <div className="grid gap-4">
                  {results.ideas.map((idea) => (
                    <motion.div
                      key={idea.id}
                      whileHover={{ scale: 1.01 }}
                      className="p-4 rounded-lg border"
                      style={{
                        backgroundColor: colors.surface,
                        borderColor: colors.cardBorder
                      }}
                    >
                      <Link to={`/ideas/${idea.id}`}>
                        <h3 className="text-lg font-semibold mb-2" style={{ color: colors.primary }}>
                          {idea.title}
                        </h3>
                        <p className="text-sm mb-2 line-clamp-2" style={{ color: colors.textSecondary }}>
                          {idea.description}
                        </p>
                        {idea.tags && idea.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {idea.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-1 rounded text-xs"
                                style={{
                                  backgroundColor: `${colors.primary}15`,
                                  color: colors.primary
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchResults;
