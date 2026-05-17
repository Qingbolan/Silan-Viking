import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Github,
  ExternalLink,
  Eye,
  Filter,
  AlertCircle,
  Search,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../components/ThemeContext";
import { useLanguage } from "../components/LanguageContext";
import { Plan, ProjectWithPlan } from "../types";
import {
  fetchCurrentPlan,
  fetchProjectsWithPlans,
  fetchPlans,
} from "../api";
import { getPlanDisplay } from "../utils/iconMap";
import { useNavigate } from "react-router-dom";

// Current Plan Component - 简约版本用于副标题
interface CurrentPlanProps {
  plan: Plan;
  language: string;
}

const CurrentPlanSubtitle: React.FC<CurrentPlanProps> = ({
  plan,
  language,
}) => {
  const { t } = useTranslation();
  const planDisplay = getPlanDisplay(plan, { size: 20 });
  const goals = Array.isArray(language === "en" ? plan.goals : plan.goalsZh)
    ? language === "en" ? plan.goals : plan.goalsZh
    : Array.isArray(plan.goals)
      ? plan.goals
      : [];
  
  return (
    <div className="max-w-4xl mx-auto">
      {/* 第一行：主要计划信息 */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className="p-1.5 rounded-lg bg-theme-surface border border-theme-border text-theme-primary flex items-center justify-center">
          {planDisplay}
        </div>
        <div className="text-center">
          <span className="text-lg font-semibold text-theme-primary">
            {language === "en" ? plan.name : (plan.nameZh || plan.name)}
          </span>
          <span className="text-sm text-theme-secondary ml-2">
            {plan.startYear} - {t('projects.ongoing')}
          </span>
          <span className="text-base font-medium text-theme-primary italic">
            "{language === "en" ? plan.slogan : plan.sloganZh}"
          </span>
        </div>
      </div>

      {/* 第二行：Slogan + 核心目标标签 */}
      <div className="text-center">
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          {goals.slice(0, 3).map((goal, index) => (
              <span
                key={index}
                className="px-3 py-1 text-xs rounded-full bg-theme-surface text-theme-secondary border border-theme-border hover:bg-theme-primary hover:text-white transition-colors duration-200"
              >
                {goal}
              </span>
            ))}
          {goals.length > 3 && (
            <span className="px-3 py-1 text-xs rounded-full bg-theme-accent text-white">
              +{goals.length - 3}{" "}
              {t('projects.more')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

interface ProjectCardProps {
  project: ProjectWithPlan;
  index: number;
  plans: Plan[];
  onView?: (project: ProjectWithPlan) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  index,
  plans,
  onView,
}) => {
  const { language } = useLanguage();
  const { t } = useTranslation();

  const handleView = useCallback(() => {
    onView?.(project);
  }, [onView, project]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleView();
    }
    },
    [handleView]
  );

  const plan = plans.find((p) => p.id === project.planId);
  const planIcon = plan ? getPlanDisplay(plan, { size: 16 }) : null;

  const generateProjectNumber = () => {
    // Use project year instead of createdAt since createdAt doesn't exist in ProjectWithPlan type
    const year = project.year;
    
    // Create a simple hash from title to ensure consistency
    const titleHash = project.title.split('').reduce((hash, char) => {
      return hash * 31 + char.charCodeAt(0);
    }, 0);
    
    // Use project ID as additional uniqueness factor
    const idHash = project.id.split('').reduce((hash, char) => {
      return hash * 31 + char.charCodeAt(0);
    }, 0);
    
    const paperNum = String(Math.abs(titleHash + idHash) % 10000).padStart(4, '0');
    const prefix = 'proj';

    return `${prefix}.${year}.${paperNum}`;
  };

  return (
    <motion.article
      className="group relative overflow-hidden rounded-2xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 card-interactive"
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
      whileHover={{ y: -10 }}
      onClick={handleView}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={t('projects.viewProject', { title: language === 'zh' && project.titleZh ? project.titleZh : project.title })}
    >
      {/* Project Image */}
      <div className="relative h-48 overflow-hidden">
        <div className="w-full h-full flex items-center justify-center project-image-placeholder">
          <div className="text-center">
            <div className="text-6xl font-bold opacity-20 text-theme-primary mb-2">
              {(language === 'zh' && project.titleZh ? project.titleZh : project.title).charAt(0)}
            </div>
            <div className="text-xs text-theme-secondary opacity-60 font-mono">
              {generateProjectNumber()}
            </div>
          </div>
        </div>
        
        {/* Overlay with actions */}
        <motion.div
          className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center space-x-4 opacity-0 group-hover:opacity-100"
          transition={{ duration: 0.3 }}
        >
          {project.demo && (
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.demo, "_blank", "noopener,noreferrer");
              }}
              className="p-3 rounded-full bg-opacity-20 backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label={t('projects.viewProjectDemo', { title: language === 'zh' && project.titleZh ? project.titleZh : project.title })}
            >
              <Eye size={20} />
            </motion.button>
          )}
          {project.github && (
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.github, "_blank", "noopener,noreferrer");
              }}
              className="p-3 rounded-full bg-opacity-20 backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-white"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              aria-label={t('projects.viewProjectSourceCode', { title: language === 'zh' && project.titleZh ? project.titleZh : project.title })}
            >
              <Github size={20} />
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Project Info */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-xl font-bold group-hover:text-theme-primary transition-colors duration-300 text-theme-primary">
            {language === 'zh' && project.titleZh ? project.titleZh : project.title}
          </h3>
          {plan && (
            <div className="flex items-center gap-1 text-theme-secondary">
              <div className="w-4 h-4 flex items-center justify-center">
                {planIcon}
              </div>
            </div>
          )}
        </div>
        
        <p className="text-sm leading-relaxed mb-4 text-theme-secondary">
          {language === 'zh' && project.descriptionZh ? project.descriptionZh : project.description}
        </p>
        
        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {project.tags.map((tag, index) => (
            <motion.span
              key={index}
              className="px-3 py-1 text-xs rounded-full font-medium tag-default"
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
            >
              {tag}
            </motion.span>
          ))}
        </div>

        {/* Action Links */}
        <div className="flex space-x-3">
          {project.github && (
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.github, "_blank", "noopener,noreferrer");
              }}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 ring-theme-primary btn-secondary"
              whileHover={{ scale: 1.05 }}
              aria-label={t('projects.viewProjectOnGitHub', { title: language === 'zh' && project.titleZh ? project.titleZh : project.title })}
            >
              <Github size={16} />
              <span>{t('projects.code')}</span>
            </motion.button>
          )}
          {project.demo && (
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                window.open(project.demo, "_blank", "noopener,noreferrer");
              }}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-theme-primary ring-offset-theme-background btn-primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label={t('projects.viewLiveDemo', { title: language === 'zh' && project.titleZh ? project.titleZh : project.title })}
            >
              <ExternalLink size={16} />
              <span>{t('projects.demo')}</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.article>
  );
};

interface FilterButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({
  label,
  active,
  onClick,
}) => {
  return (
    <motion.button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ring-theme-primary ring-offset-theme-background filter-chip ${
        active ? "active" : ""
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
    >
      {label}
    </motion.button>
  );
};

const ProjectGallery: React.FC = () => {
  const [projects, setProjects] = useState<ProjectWithPlan[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<ProjectWithPlan[]>(
    []
  );
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { colors } = useTheme();
  const { language } = useLanguage();
  const { t } = useTranslation();
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

  // Load data from APIs
  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const [currentPlanRes, allPlansRes, projectsRes] = await Promise.allSettled([
          fetchCurrentPlan(language),
          fetchPlans(language),
          fetchProjectsWithPlans(language),
        ]);

        if (projectsRes.status === 'rejected') {
          throw projectsRes.reason;
        }

        const currentPlanData =
          currentPlanRes.status === 'fulfilled' ? currentPlanRes.value : null;
        const allPlansData =
          allPlansRes.status === 'fulfilled' ? allPlansRes.value : [];
        const projectsData = projectsRes.value;
        
        if (isMounted) {
          setCurrentPlan(currentPlanData);
          setPlans(allPlansData);
          setProjects(projectsData);
          setFilteredProjects(projectsData);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(t('projects.failedToLoadData'));
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [language]);

  // Get all unique tags for filters
  const filters = useMemo(() => {
    const allTags = Array.from(
      new Set(projects.flatMap((project) => project.tags))
    );
    const planFilters = plans.map((plan) =>
      language === "en" ? plan.name.split(" ")[0] : (plan.nameZh || plan.name).substring(0, 2)
    );
    return [t('projects.all'), ...planFilters, ...allTags];
  }, [projects, plans, language, t]);

  // Set default filter when filters are available or when language changes
  useEffect(() => {
    if (filters.length > 0) {
      const currentAllText = t('projects.all');
      // If no filter is selected or if the current filter is the old "All" text, set to current language "All"
      if (selectedFilter === "" || selectedFilter === "All" || selectedFilter === "全部") {
        setSelectedFilter(currentAllText);
      }
    }
  }, [filters, selectedFilter, t, language]);

  // Filter projects based on selected filter and search query
  useEffect(() => {
    let filtered = projects;

    // Apply tag/plan filter
    if (selectedFilter !== t('projects.all')) {
      filtered = projects.filter((project) => {
        const plan = plans.find((p) => p.id === project.planId);
        const planMatch =
          plan &&
          (plan.name.includes(selectedFilter) ||
            (plan.nameZh && plan.nameZh.includes(selectedFilter)));
        const tagMatch = project.tags.includes(selectedFilter);
        return planMatch || tagMatch;
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (project) =>
          project.title.toLowerCase().includes(query) ||
          (project.titleZh && project.titleZh.toLowerCase().includes(query)) ||
          project.description.toLowerCase().includes(query) ||
          (project.descriptionZh && project.descriptionZh.toLowerCase().includes(query)) ||
          project.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    setFilteredProjects(filtered);
  }, [projects, plans, selectedFilter, searchQuery, t]);

  const handleFilterChange = useCallback((filter: string) => {
    setSelectedFilter(filter);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleProjectView = useCallback((project: ProjectWithPlan) => {
    // 导航到项目详情页面
    navigate(`/projects/${project.id}`);
  }, [navigate]);

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
          <div className="w-16 h-16 mx-auto mb-4 rounded-full loading-gradient" />
          <p className="text-theme-secondary">
            {t('projects.loadingProjects')}
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
            {t('projects.errorLoadingData')}
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
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-8 text-theme-primary">
            {t('projects.title')}
          </h1>

          {/* 简约计划信息作为副标题 */}
          {currentPlan && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <CurrentPlanSubtitle plan={currentPlan} language={language} />
              <motion.div
                className="mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
              >
                <motion.button
                  onClick={() => navigate('/plans')}
                  className="text-sm text-theme-primary hover:text-theme-accent transition-colors duration-200 font-medium"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t('projects.viewAllStrategicPlans')}
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </motion.div>

        {/* Search and Filters */}
        <div className="mb-12 space-y-6">
          {/* Search Bar */}
          <motion.div
            className="max-w-md mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="relative">
              <Search
                size={20}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-secondary"
              />
              <input
                type="text"
                placeholder={t('projects.searchPlaceholder')}
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full pl-12 pr-12 py-3 rounded-xl border border-theme-border bg-theme-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent transition-all duration-300"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-theme-secondary hover:text-theme-primary transition-colors"
                  aria-label={t('projects.clearSearch')}
                >
                  <X size={20} />
                </button>
              )}
            </div>
        </motion.div>

        {/* Filters */}
        <motion.div
            className="flex flex-wrap justify-center gap-3"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex items-center space-x-2 mb-2">
            <Filter size={16} className="text-theme-secondary" />
            <span className="text-sm font-medium text-theme-secondary">
                {t('projects.filterByTechnique')}
            </span>
          </div>
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t('projects.projectFilters')}
            >
            {filters.map((filter) => (
              <FilterButton
                key={filter}
                label={filter}
                active={selectedFilter === filter}
                onClick={() => handleFilterChange(filter)}
              />
            ))}
          </div>
        </motion.div>
        </div>

        {/* Projects Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedFilter}-${searchQuery}`}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {filteredProjects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index}
                plans={plans}
                onView={handleProjectView}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredProjects.length === 0 && !loading && (
          <motion.div
            className="text-center py-20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            role="status"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center empty-state-bg">
              <Filter size={32} className="text-theme-secondary" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-theme-primary">
              {t('projects.noProjectsFound')}
            </h3>
            <p className="text-theme-secondary">
              {t('projects.adjustSearchCriteria')}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectGallery; 
