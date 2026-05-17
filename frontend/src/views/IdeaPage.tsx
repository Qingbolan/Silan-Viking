import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Search, AlertCircle } from 'lucide-react';
import { useTheme } from '../components/ThemeContext';
import { useLanguage } from '../components/LanguageContext';
import { IdeaData } from '../types';
import { fetchIdeas } from '../api';
import { getIdeaCategories, getIdeaStatuses } from '../api/ideas/ideaApi';

interface IdeaCardProps {
  idea: IdeaData;
  index: number;
  onView?: (idea: IdeaData) => void;
}

type IdeaStatus =
  | "published"
  | "validating"
  | "experimenting"
  | "hypothesis"
  | "concluded"
  | "draft"
  | string;

const IdeaCard: React.FC<IdeaCardProps> = ({ idea, index, onView }) => {
  const { language } = useLanguage();

  if (!idea) return null;

  // arXiv 风格编号
  const ideaNumber = useMemo(() => {
    const date = new Date(idea.createdAt ?? Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const base = String(idea.title ?? "") + String(idea.id ?? "");
    const hash = base.split("").reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0);
    const n = String(Math.abs(hash) % 10000).padStart(4, "0");
    return `idea.${year}${month}${day}.${n}`;
  }, [idea.createdAt, idea.title, idea.id]);

  const getStatusText = useCallback(
    (status: IdeaStatus) => {
      if (language === "en") {
        switch (status) {
          case "published":
            return "Published";
          case "validating":
            return "Validating";
          case "experimenting":
            return "Experimenting";
          case "hypothesis":
            return "Hypothesis";
          case "concluded":
            return "Concluded";
          case "draft":
          default:
            return "Draft";
        }
      } else {
        switch (status) {
          case "published":
            return "已发表";
          case "validating":
            return "验证中";
          case "experimenting":
            return "实验中";
          case "hypothesis":
            return "假设";
          case "concluded":
            return "已结论";
          case "draft":
          default:
            return "草案";
        }
      }
    },
    [language]
  );

  // 返回的是"文字色 + 背景色"组合，既当徽章也当小图标底色
  // Status text colour only — no background. Used for text status tags.
  const getStatusTextClass = useCallback((status: IdeaStatus) => {
    switch (status) {
      case "published":
        return "text-theme-success";
      case "hypothesis":
        return "text-theme-warning";
      case "concluded":
        return "text-theme-secondary";
      case "validating":
      case "experimenting":
      default:
        return "text-theme-accent";
    }
  }, []);

  // Status colour + tinted background — used for the icon block only.
  const getStatusClass = useCallback(
    (status: IdeaStatus) => {
      const bg =
        status === "published"
          ? "bg-theme-success-20"
          : status === "hypothesis"
          ? "bg-theme-warning-20"
          : status === "concluded"
          ? "bg-theme-surface-elevated"
          : "bg-theme-primary-20";
      return `${getStatusTextClass(status)} ${bg}`;
    },
    [getStatusTextClass],
  );

  const handleClick = useCallback(() => {
    onView?.(idea);
  }, [onView, idea]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <motion.div
      className="group overflow-hidden rounded-2xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ring-theme-primary card-interactive"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -5 }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View idea: ${idea.title}`}
    >
      {/* Cover */}
      <div className="relative w-full h-40 sm:h-48 overflow-hidden bg-gradient-project">
        {/* 中心水印编号 + 首字母 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div
              className="font-mono text-theme-primary opacity-15 text-xl sm:text-2xl text-center"
              style={{ letterSpacing: "0.25em" }}
            >
              {ideaNumber}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-6xl sm:text-7xl font-extrabold text-theme-primary opacity-25">
                {idea.title?.charAt(0).toUpperCase?.() ?? "I"}
              </span>
            </div>
          </div>
        </div>

        {/* 左上编号徽章 */}
        <div className="absolute top-2 left-2 z-10">
          <div className="text-xs font-mono text-white bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
            {ideaNumber}
          </div>
        </div>

        {/* 右上状态徽章 */}
        <div className="absolute top-2 right-2 flex items-center gap-2 z-10">
          <span className="w-2 h-2 rounded-full bg-theme-primary/90" aria-hidden />
          <span
            className={`text-[10px] font-semibold ${getStatusTextClass(idea.status)}`}
          >
            {getStatusText(idea.status)}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        {/* Header 行 */}
        <div className="flex items-center mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${getStatusClass(idea.status)}`} aria-hidden>
              <Lightbulb
                size={20}
                className={
                  idea.status === "published"
                    ? "text-theme-success"
                    : idea.status === "validating"
                    ? "text-theme-accent"
                    : idea.status === "experimenting"
                    ? "text-theme-accent"
                    : idea.status === "hypothesis"
                    ? "text-theme-warning"
                    : idea.status === "concluded"
                    ? "text-theme-secondary"
                    : "text-theme-accent"
                }
              />
            </div>
            <h3 className="text-lg font-semibold text-theme-primary">{idea.title}</h3>
          </div>
        </div>

        {/* 描述：保留一份就够了 */}
        {idea.description ? (
          <p className="text-sm text-theme-tertiary mb-4">{idea.description}</p>
        ) : null}

        {/* Tags */}
        {(idea.tags?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-2">
            {idea.tags!.map((tag, tagIndex) => (
              <motion.span
                key={`${tag}-${tagIndex}`}
                className="px-3 py-1 text-xs rounded-full font-medium tag-default"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                {tag}
              </motion.span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
};

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, active, onClick }) => {
  return (
    <motion.button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-theme-primary ring-offset-theme-background filter-chip ${
        active ? 'active' : ''
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  );
};

const IdeaPage: React.FC = () => {
  const { colors } = useTheme();
  const { language } = useLanguage();

  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [filteredIdeas, setFilteredIdeas] = useState<IdeaData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [categories, setCategories] = useState<string[]>([language === 'en' ? 'All' : '全部']);
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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

  // Load ideas
  useEffect(() => {
    let isMounted = true;

    const loadIdeas = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch ideas from API with language support
        const fetchedIdeas = await fetchIdeas({}, language as 'en' | 'zh');

        if (isMounted) {
          setIdeas(fetchedIdeas);
          setFilteredIdeas(fetchedIdeas);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(language === 'en' ? 'Failed to load ideas' : '加载想法失败');
          setLoading(false);
        }
      }
    };

    loadIdeas();

    return () => {
      isMounted = false;
    };
  }, [language]);

  // Filter ideas based on category, status, and search term
  const filteredIdeasMemo = useMemo(() => {
    let filtered = ideas;

    if (selectedCategory !== 'All' && selectedCategory !== '全部') {
      filtered = filtered.filter(idea => idea.category === selectedCategory);
    }

    if (selectedStatus !== 'All' && selectedStatus !== '全部') {
      // Map Chinese status labels back to English status values
      let statusToMatch = selectedStatus;
      if (language === 'zh') {
        const statusMap: Record<string, string> = {
          '草案': 'draft',
          '假设': 'hypothesis',
          '实验中': 'experimenting',
          '验证中': 'validating',
          '已发表': 'published',
          '已结论': 'concluded'
        };
        statusToMatch = statusMap[selectedStatus] || selectedStatus;
      }
      filtered = filtered.filter(idea => idea.status === statusToMatch);
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(idea =>
        idea.title.toLowerCase().includes(searchLower) ||
        idea.description.toLowerCase().includes(searchLower) ||
        idea.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [ideas, selectedCategory, selectedStatus, searchTerm, language]);

  useEffect(() => {
    setFilteredIdeas(filteredIdeasMemo);
  }, [filteredIdeasMemo]);

  // Load dynamic categories from backend
  useEffect(() => {
    let mounted = true;
    const loadCats = async () => {
      try {
        const cats = await getIdeaCategories(language as 'en' | 'zh');
        if (!mounted) return;
        const labelAll = language === 'en' ? 'All' : '全部';
        setCategories([labelAll, ...cats.filter(Boolean)]);
        // Keep selectedCategory valid
        if (!cats.includes(selectedCategory) && selectedCategory !== labelAll) {
          setSelectedCategory(labelAll);
        }
      } catch (e) {
        // keep default
      }
    };
    loadCats();
    return () => { mounted = false; };
  }, [language]);

  // Status filter chips — only show statuses that actually have ideas.
  // `getIdeaStatuses` gives the canonical order; we keep just the ones
  // present in the loaded data (plus the always-on "All").
  const statuses = useMemo(() => {
    const labelAll = language === 'en' ? 'All' : '全部';
    const present = new Set<string>(ideas.map((i) => i.status));
    const canonical = ['draft', 'hypothesis', 'experimenting', 'validating', 'published', 'concluded'];
    const localized = getIdeaStatuses(language as 'en' | 'zh');
    const used = canonical
      .map((status, idx) => ({ status, label: localized[idx] }))
      .filter(({ status }) => present.has(status))
      .map(({ label }) => label);
    return [labelAll, ...used];
  }, [ideas, language]);

  // Reset the filter if the selected status no longer has any ideas.
  useEffect(() => {
    if (!statuses.includes(selectedStatus)) {
      setSelectedStatus(language === 'en' ? 'All' : '全部');
    }
  }, [statuses, selectedStatus, language]);

  const handleIdeaView = useCallback((idea: IdeaData) => {
    // Navigate to idea detail page
    navigate(`/ideas/${idea.id}`);
  }, [navigate]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center ">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="status"
          aria-live="polite"
        >
          <Lightbulb
            size={48}
            className="mx-auto mb-4 animate-pulse text-theme-accent"
          />
          <p className="text-theme-secondary">
            {language === 'en' ? 'Loading ideas...' : '加载想法中...'}
          </p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center ">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
        >
          <AlertCircle size={48} className="mx-auto mb-4 text-theme-error" />
          <h2 className="text-xl font-semibold mb-2 text-theme-primary">
            {language === 'en' ? 'Error Loading Ideas' : '加载想法出错'}
          </h2>
          <p className="text-theme-secondary">{error}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen py-20 "
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
          <h1 className="text-5xl md:text-6xl font-bold mb-6  ">
            {language === 'en' ? 'Ideas' : '想法'}
          </h1>
          <p className="text-xl md:text-2xl max-w-3xl mx-auto text-theme-secondary font-light">
            {language === 'en'
              ? "A collection of my thoughts, concepts, and potential projects in various stages of development."
              : "我在各个开发阶段的想法、概念和潜在项目的集合。"
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
          <div className="relative max-w-md mx-auto">
            <Search
              size={20}
              className="absolute left-4 top-1/2 transform -translate-y-1/2 text-theme-tertiary"
            />
            <input
              type="text"
              placeholder={language === 'en' ? 'Search ideas...' : '搜索想法...'}
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-12 pr-4 py-3 rounded-xl text-base transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 input-theme ring-theme-primary ring-offset-theme-background"
              aria-label={language === 'en' ? 'Search ideas' : '搜索想法'}
            />
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap justify-center gap-4">
            {/* Category Filters */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Category filters">
              <span className="text-sm font-medium px-2 py-1 text-theme-secondary">
                {language === 'en' ? 'Category:' : '分类：'}
              </span>
              {categories.map(category => (
                <FilterChip
                  key={category}
                  label={category}
                  active={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                />
              ))}
            </div>

            {/* Status Filters */}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Status filters">
              <span className="text-sm font-medium px-2 py-1 text-theme-secondary">
                {language === 'en' ? 'Status:' : '状态：'}
              </span>
              {statuses.map(status => (
                <FilterChip
                  key={status}
                  label={status}
                  active={selectedStatus === status}
                  onClick={() => setSelectedStatus(status)}
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Ideas Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedCategory}-${selectedStatus}-${searchTerm}`}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {filteredIdeas.map((idea, index) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                index={index}
                onView={handleIdeaView}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredIdeas.length === 0 && !loading && (
          <motion.div
            className="text-center py-20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            role="status"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center empty-state-bg">
              <Lightbulb size={32} className="text-theme-secondary" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-theme-primary">
              {language === 'en' ? 'No ideas found' : '未找到想法'}
            </h3>
            <p className="text-theme-secondary">
              {language === 'en'
                ? 'Try adjusting your filters or search terms.'
                : '尝试调整您的筛选器或搜索词。'
              }
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default IdeaPage;
