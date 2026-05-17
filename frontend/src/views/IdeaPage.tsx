import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, FlaskConical, Microscope, CheckCircle2, Layers } from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { IdeaData } from '../types';
import { fetchIdeas } from '../api';
import { getIdeaCategories, getIdeaStatuses } from '../api/ideas/ideaApi';
import { BlogHeader, BrandLoading, ErrorState, IdeaCard, EmptyState, Masonry } from '../components/ds';

const IdeaPage: React.FC = () => {
  const { language } = useLanguage();

  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [filteredIdeas, setFilteredIdeas] = useState<IdeaData[]>([]);
  // `selectedCategory` holds the raw category string ('all' = reset chip).
  // `selectedStatus` holds a stable canonical key ('all' | 'draft' | …).
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>(['all']);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(idea => idea.category === selectedCategory);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(idea => idea.status === selectedStatus);
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
  }, [ideas, selectedCategory, selectedStatus, searchTerm]);

  useEffect(() => {
    setFilteredIdeas(filteredIdeasMemo);
  }, [filteredIdeasMemo]);

  // Load dynamic categories from backend. 'all' is the reset chip.
  useEffect(() => {
    let mounted = true;
    const loadCats = async () => {
      try {
        const cats = await getIdeaCategories(language as 'en' | 'zh');
        if (!mounted) return;
        setCategories(['all', ...cats.filter(Boolean)]);
        // Keep selectedCategory valid against the new list.
        if (selectedCategory !== 'all' && !cats.includes(selectedCategory)) {
          setSelectedCategory('all');
        }
      } catch (e) {
        // keep default
      }
    };
    loadCats();
    return () => { mounted = false; };
  }, [language]);

  // Status Segmented options — only statuses that actually have ideas.
  // `getIdeaStatuses` gives the canonical order; each option carries a
  // stable key, a localized label and an icon.
  const statusOptions = useMemo(() => {
    const present = new Set<string>(ideas.map((i) => i.status));
    const canonical = ['draft', 'hypothesis', 'experimenting', 'validating', 'published', 'concluded'];
    const icons: Record<string, React.ReactNode> = {
      draft: <Lightbulb />,
      hypothesis: <Lightbulb />,
      experimenting: <FlaskConical />,
      validating: <Microscope />,
      published: <CheckCircle2 />,
      concluded: <CheckCircle2 />,
    };
    const localized = getIdeaStatuses(language as 'en' | 'zh');
    const used = canonical
      .map((status, idx) => ({ value: status, label: localized[idx], icon: icons[status] }))
      .filter((opt) => present.has(opt.value));
    return [
      { value: 'all', label: language === 'en' ? 'All' : '全部', icon: <Layers /> },
      ...used,
    ];
  }, [ideas, language]);

  // Reset the filter if the selected status no longer has any ideas.
  useEffect(() => {
    if (!statusOptions.some((o) => o.value === selectedStatus)) {
      setSelectedStatus('all');
    }
  }, [statusOptions, selectedStatus]);

  const handleIdeaView = useCallback((idea: IdeaData) => {
    // Navigate to idea detail page
    navigate(`/ideas/${idea.id}`);
  }, [navigate]);

  if (loading) {
    return (
      <BrandLoading
        message={language === 'en' ? 'Loading ideas…' : '加载想法中…'}
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        variant="page"
        title={language === 'en' ? 'Error Loading Ideas' : '加载想法出错'}
        description={error}
        showHome
      />
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
        {/* Header — title + search + status Segmented + category chips. */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <BlogHeader
            eyebrow={language === 'en' ? 'Research' : '研究'}
            title={language === 'en' ? 'Ideas' : '想法'}
            description={
              language === 'en'
                ? 'A collection of my thoughts, concepts, and potential projects in various stages of development.'
                : '我在各个开发阶段的想法、概念和潜在项目的集合。'
            }
            search={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder={language === 'en' ? 'Search ideas…' : '搜索想法…'}
            typeOptions={statusOptions}
            selectedType={selectedStatus}
            onTypeChange={setSelectedStatus}
            typeLabel={language === 'en' ? 'Status' : '状态'}
            tags={categories}
            selectedTag={selectedCategory}
            onTagChange={setSelectedCategory}
            tagLabel={language === 'en' ? 'Category' : '分类'}
            formatTag={(tag) =>
              tag === 'all' ? (language === 'en' ? 'All' : '全部') : tag
            }
          />
        </motion.div>

        {/* Ideas Grid — masonry layout of ds IdeaCards. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedCategory}-${selectedStatus}-${searchTerm}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Masonry
              items={filteredIdeas}
              getKey={(idea) => idea.id}
              renderItem={(idea) => (
                <IdeaCard
                  idea={{
                    id: idea.id,
                    title: idea.title,
                    description: idea.description,
                    status: idea.status,
                    category: idea.category,
                    tags: idea.tags,
                    date: idea.createdAt
                      ? String(new Date(idea.createdAt).getFullYear())
                      : undefined,
                  }}
                  onOpen={() => handleIdeaView(idea)}
                />
              )}
            />
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredIdeas.length === 0 && !loading && (
          <motion.div
            className="py-20"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <EmptyState
              icon={<Lightbulb />}
              title={language === 'en' ? 'No ideas found' : '未找到想法'}
              description={
                language === 'en'
                  ? 'Try adjusting your filters or search terms.'
                  : '尝试调整您的筛选器或搜索词。'
              }
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default IdeaPage;
