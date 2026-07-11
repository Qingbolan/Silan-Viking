import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, FolderGit2, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../components/LanguageContext";
import { Seo } from "../components/Seo";
import { Plan, ProjectWithPlan } from "../types";
import {
  fetchCurrentPlan,
  fetchProjectsWithPlans,
  fetchPlans,
} from "../api";
import { getPlanDisplay } from "../utils/iconMap";
import { useNavigate } from "react-router-dom";
import {
  BlogHeader,
  BrandLoading,
  ErrorState,
  ProjectCard,
  EmptyState,
  Masonry,
  type ProjectCardData,
} from "../components/ds";

// Current Plan Component - 简约版本用于副标题
interface CurrentPlanProps {
  plan: Plan;
  language: string;
  /** When set, the plan name row becomes a link to all strategic plans. */
  onViewAllPlans?: () => void;
}

const CurrentPlanSubtitle: React.FC<CurrentPlanProps> = ({
  plan,
  language,
  onViewAllPlans,
}) => {
  const { t } = useTranslation();
  const planDisplay = getPlanDisplay(plan, { size: 20 });
  const goals = Array.isArray(language === "en" ? plan.goals : plan.goalsZh)
    ? language === "en" ? plan.goals : plan.goalsZh
    : Array.isArray(plan.goals)
      ? plan.goals
      : [];
  
  const slogan = language === "en" ? plan.slogan : plan.sloganZh;

  const planName = language === "en" ? plan.name : plan.nameZh || plan.name;

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-1.5">
      {/* Row 1 — icon · plan name · year span. The primary line; the whole
          row links to all strategic plans when `onViewAllPlans` is set. */}
      <button
        type="button"
        onClick={onViewAllPlans}
        disabled={!onViewAllPlans}
        title={onViewAllPlans ? t('projects.viewAllStrategicPlans') : undefined}
        className="group flex items-center gap-2.5 rounded-ds-md outline-none transition-colors duration-ds-fast focus-visible:shadow-ds-focus disabled:cursor-default"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-ds-md border border-ds-border bg-ds-surface-2 text-ds-primary">
          {planDisplay}
        </span>
        <span className="text-ds-base font-semibold text-ds-fg transition-colors duration-ds-fast group-enabled:group-hover:text-ds-primary">
          {planName}
        </span>
        <span className="rounded-full bg-ds-surface-2 px-2 py-0.5 text-ds-2xs font-medium text-ds-fg-subtle">
          {plan.startYear} – {t('projects.ongoing')}
        </span>
        {onViewAllPlans && (
          <ArrowRight className="size-3.5 text-ds-fg-subtle transition-all duration-ds-fast group-hover:translate-x-0.5 group-hover:text-ds-primary" />
        )}
      </button>

      {/* Row 2 — slogan + core goal chips, all inline. The quiet line. */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
        {slogan && (
          <span className="text-ds-sm font-medium italic text-ds-fg-muted">
            "{slogan}"
          </span>
        )}
        {goals.slice(0, 3).map((goal, index) => (
          <span
            key={index}
            className="rounded-full border border-ds-border bg-ds-surface-1 px-2.5 py-0.5 text-ds-2xs font-medium text-ds-fg-muted"
          >
            {goal}
          </span>
        ))}
        {goals.length > 3 && (
          <span className="rounded-full border border-ds-primary/30 bg-ds-primary-soft px-2.5 py-0.5 text-ds-2xs font-medium text-ds-primary">
            +{goals.length - 3} {t('projects.more')}
          </span>
        )}
      </div>
    </div>
  );
};

const ProjectGallery: React.FC = () => {
  const [projects, setProjects] = useState<ProjectWithPlan[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<ProjectWithPlan[]>(
    []
  );
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  // `selectedPlan` holds a plan id ('all' = reset). `selectedTag` holds
  // a raw tag string ('all' = reset chip).
  const [selectedPlan, setSelectedPlan] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { language } = useLanguage();
  const { t } = useTranslation();
  const navigate = useNavigate();

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

  // Plan Segmented options — stable plan-id keys, localized labels.
  const planOptions = useMemo(
    () => [
      { value: "all", label: t("projects.all"), icon: <Layers /> },
      ...plans.map((plan) => ({
        value: plan.id,
        label: language === "en" ? plan.name : plan.nameZh || plan.name,
      })),
    ],
    [plans, language, t],
  );

  // Topic chips — 'all' is the reset chip, followed by every unique tag.
  const tags = useMemo(
    () => ["all", ...Array.from(new Set(projects.flatMap((p) => p.tags)))],
    [projects],
  );

  // Drop the plan/tag selection if it no longer exists in the loaded data.
  useEffect(() => {
    if (selectedPlan !== "all" && !plans.some((p) => p.id === selectedPlan)) {
      setSelectedPlan("all");
    }
  }, [plans, selectedPlan]);
  useEffect(() => {
    if (selectedTag !== "all" && !tags.includes(selectedTag)) {
      setSelectedTag("all");
    }
  }, [tags, selectedTag]);

  // Filter projects based on plan, tag and search query.
  useEffect(() => {
    let filtered = projects;

    if (selectedPlan !== "all") {
      filtered = filtered.filter((p) => p.planId === selectedPlan);
    }

    if (selectedTag !== "all") {
      filtered = filtered.filter((p) => p.tags.includes(selectedTag));
    }

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
  }, [projects, selectedPlan, selectedTag, searchQuery]);

  const handleProjectView = useCallback((project: ProjectWithPlan) => {
    // 导航到项目详情页面
    navigate(`/projects/${project.id}`);
  }, [navigate]);

  // Map a ProjectWithPlan record to the ds ProjectCard's data shape,
  // honouring the current language for title/description.
  const toProjectCardData = useCallback(
    (project: ProjectWithPlan): ProjectCardData => {
      const zh = language === "zh";
      return {
        id: project.id,
        title: zh && project.titleZh ? project.titleZh : project.title,
        description:
          zh && project.descriptionZh
            ? project.descriptionZh
            : project.description,
        tags: project.tags,
        year: project.year,
        githubUrl: project.github,
        demoUrl: project.demo,
        coverImage: project.image || undefined,
      };
    },
    [language],
  );

  if (loading) {
    return <BrandLoading message={t('projects.loadingProjects')} />;
  }

  if (error) {
    return (
      <ErrorState
        variant="page"
        title={t('projects.errorLoadingData')}
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
      <Seo
        title={language === 'en' ? 'Projects' : '项目'}
        description={
          language === 'en'
            ? 'Software projects and engineering work by Silan Hu.'
            : '胡思蓝的软件项目与工程作品。'
        }
        path="/projects"
        lang={language as 'en' | 'zh'}
      />
      <div className="max-w-6xl mx-auto px-4">
        {/* Header — title + search + plan Segmented + tag chips. */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <BlogHeader
            eyebrow={language === 'en' ? 'Work' : '作品'}
            title={t('projects.title')}
            description={t('projects.subtitle', { defaultValue: '' }) || undefined}
            afterHero={
              currentPlan && (
                <CurrentPlanSubtitle
                  plan={currentPlan}
                  language={language}
                  onViewAllPlans={() => navigate('/plans')}
                />
              )
            }
            search={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t('projects.searchPlaceholder')}
            typeOptions={planOptions}
            selectedType={selectedPlan}
            onTypeChange={setSelectedPlan}
            typeLabel={language === 'en' ? 'Plan' : '计划'}
            tags={tags}
            selectedTag={selectedTag}
            onTagChange={setSelectedTag}
            tagLabel={language === 'en' ? 'Tech' : '技术'}
            formatTag={(tag) =>
              tag === 'all' ? t('projects.all') : tag
            }
          />
        </motion.div>

        {/* Projects Grid — masonry / waterfall layout of ds ProjectCards. */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedPlan}-${selectedTag}-${searchQuery}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Masonry
              items={filteredProjects}
              getKey={(project) => project.id}
              renderItem={(project) => (
                <ProjectCard
                  project={toProjectCardData(project)}
                  onOpen={() => handleProjectView(project)}
                />
              )}
            />
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredProjects.length === 0 && !loading && (
          <motion.div
            className="py-20"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <EmptyState
              icon={<FolderGit2 />}
              title={t('projects.noProjectsFound')}
              description={t('projects.adjustSearchCriteria')}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ProjectGallery; 
