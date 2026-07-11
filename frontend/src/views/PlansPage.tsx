import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Target,
  BookOpen,
  Lightbulb,
  Briefcase,
  ChevronRight,
  AlertCircle,
  Search,
  X,
  Award,
  BarChart3,
} from 'lucide-react';
import { useTheme } from '../components/ThemeContext';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import { IdeaData } from '../types';
import { AnnualPlan, Project } from '../types/api';
import { BlogData } from '../components/BlogStack/types/blog';
import { fetchAnnualPlans, fetchProjectsWithAnnualPlans } from '../api';
import { fetchIdeas } from '../api';
import { fetchBlogPosts } from '../api';
import { getPlanDisplay } from '../utils/iconMap';

interface PlanHeaderCardProps {
  plan: AnnualPlan;
  index: number;
}

const PlanHeaderCard: React.FC<PlanHeaderCardProps> = ({ plan, index }) => {
  const { language } = useLanguage();
  
  // Get plan icon display
  const planIcon = getPlanDisplay(plan, { size: 24 });
  
  return (
    <motion.div
      className="bg-theme-surface border border-theme-border rounded-2xl p-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {/* Plan Icon or Fallback */}
          <div className="relative w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center">
            {plan.image ? (
              <img 
                src={plan.image} 
                alt={language === 'en' ? plan.name : plan.nameZh}
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fallback to blog-style background
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    parent.className = 'w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg bg-gradient-to-br from-theme-primary to-theme-primary-hover';
                    parent.textContent = (language === 'en' ? plan.name : plan.nameZh).charAt(0);
                  }
                }}
              />
            ) : planIcon ? (
              <div className="w-12 h-12 bg-gradient-primary rounded-xl flex items-center justify-center text-white">
                {planIcon}
              </div>
            ) : (
              /* Blog-style fallback background */
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg bg-gradient-to-br from-theme-primary to-theme-primary-hover">
                {(language === 'en' ? plan.name : plan.nameZh).charAt(0)}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-theme-primary">
                {language === 'en' ? plan.name : plan.nameZh}
              </h2>
              {language === 'zh' && (
                <span className="text-sm text-theme-secondary font-mono">
                  {plan.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-theme-secondary">
              <Calendar size={16} />
              <span>{plan.year}</span>
              <span>•</span>
              <span>{plan.projectCount} {language === 'en' ? 'Projects' : '项目'}</span>
            </div>
          </div>
        </div>
        <motion.div
          className="p-2 rounded-lg bg-theme-primary/10 text-theme-primary"
          whileHover={{ scale: 1.05 }}
        >
          <Award size={24} />
        </motion.div>
      </div>
      <p className="text-theme-secondary text-lg leading-relaxed">
        {language === 'en' ? plan.description : plan.descriptionZh}
      </p>
    </motion.div>
  );
};

interface ObjectivesCardProps {
  plan: AnnualPlan;
  index: number;
}

const ObjectivesCard: React.FC<ObjectivesCardProps> = ({ plan, index }) => {
  const { language } = useLanguage();
  
  return (
    <motion.div
      className="bg-theme-surface border border-theme-border rounded-2xl p-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 + 0.1 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <Target size={24} className="text-theme-primary" />
        <h3 className="text-xl font-semibold text-theme-primary">
          {language === 'en' ? 'Objectives' : '目标'}
        </h3>
      </div>
      <div className="space-y-3">
        {(language === 'en' ? plan.objectives : plan.objectivesZh).map((objective: string, idx: number) => (
          <motion.div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-lg bg-theme-surface-elevated hover:bg-theme-card transition-colors"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: idx * 0.1 }}
            whileHover={{ x: 4 }}
          >
            <div className="w-2 h-2 rounded-full bg-theme-primary mt-2 flex-shrink-0" />
            <span className="text-theme-secondary">{objective}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

interface ProjectsCardProps {
  plan: AnnualPlan;
  projects: Project[];
  index: number;
}

const ProjectsCard: React.FC<ProjectsCardProps> = ({ plan, projects, index }) => {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const planProjects = projects.filter(project => project.annualPlan === plan.name);

  const handleProjectClick = useCallback((project: Project) => {
    navigate(`/projects/${project.id}`);
  }, [navigate]);

  return (
    <motion.div
      className="bg-theme-surface border border-theme-border rounded-2xl p-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 + 0.2 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Briefcase size={24} className="text-theme-primary" />
          <h3 className="text-xl font-semibold text-theme-primary">
            {language === 'en' ? 'Projects' : '项目'}
          </h3>
          <span className="text-sm text-theme-secondary">({planProjects.length})</span>
        </div>
        {planProjects.length > 0 && (
          <motion.div
            className="text-theme-secondary hover:text-theme-primary transition-colors cursor-pointer"
            whileHover={{ scale: 1.05 }}
          >
            <ChevronRight size={20} />
          </motion.div>
        )}
      </div>

      {planProjects.length === 0 ? (
        <div className="text-center py-8 text-theme-secondary">
          <Briefcase size={32} className="mx-auto mb-2 opacity-50" />
          <p>{language === 'en' ? 'No projects yet' : '暂无项目'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {planProjects.map((project, idx) => (
            <motion.div
              key={project.id}
              className="p-4 rounded-lg border border-theme-surface-tertiary bg-theme-surface-elevated hover:bg-theme-card cursor-pointer transition-colors group"
              onClick={() => handleProjectClick(project)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.1 }}
              whileHover={{ y: -2 }}
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-semibold text-theme-primary group-hover:text-theme-accent transition-colors">
                  {project.name}
                </h4>
                <span className="text-xs text-theme-secondary">{project.year}</span>
              </div>
              <p className="text-sm text-theme-secondary mb-3 line-clamp-2">
                {project.description}
              </p>
              <div className="flex flex-wrap gap-1">
                {(project.tags || []).map((tag: string, tagIdx: number) => (
                  <span
                    key={tagIdx}
                    className="px-2 py-1 text-xs rounded-full bg-theme-primary/10 text-theme-primary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

interface RelatedContentCardProps {
  plan: AnnualPlan;
  ideas: IdeaData[];
  blogs: BlogData[];
  index: number;
}

const RelatedContentCard: React.FC<RelatedContentCardProps> = ({ plan, ideas, blogs, index }) => {
  const { language } = useLanguage();
  const navigate = useNavigate();

  // Simple content matching logic based on tags
     const relatedIdeas = ideas.filter(idea =>
     idea.tags.some(tag => 
       plan.projects.some((project: any) => 
         project.name.toLowerCase().includes(tag.toLowerCase()) ||
         tag.toLowerCase().includes('ai') ||
         tag.toLowerCase().includes('blockchain') ||
         tag.toLowerCase().includes('web')
       )
     )
   ).slice(0, 3);

     const relatedBlogs = blogs.filter(blog =>
     blog.tags.some(tag => 
       plan.projects.some((project: any) => 
         project.name.toLowerCase().includes(tag.toLowerCase()) ||
         tag.toLowerCase().includes('ai') ||
         tag.toLowerCase().includes('blockchain') ||
         tag.toLowerCase().includes('web')
       )
     )
   ).slice(0, 3);

  const handleIdeaClick = useCallback((idea: IdeaData) => {
    navigate(`/ideas/${idea.id}`);
  }, [navigate]);

  const handleBlogClick = useCallback((blog: BlogData) => {
    navigate(`/blog/${blog.id}`);
  }, [navigate]);

  if (relatedIdeas.length === 0 && relatedBlogs.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="bg-theme-surface border border-theme-border rounded-2xl p-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 + 0.3 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <BookOpen size={24} className="text-theme-primary" />
        <h3 className="text-xl font-semibold text-theme-primary">
          {language === 'en' ? 'Related Content' : '相关内容'}
        </h3>
      </div>

      <div className="space-y-4">
        {relatedIdeas.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={16} className="text-theme-secondary" />
              <span className="text-sm font-medium text-theme-secondary">
                {language === 'en' ? 'Ideas' : '想法'} ({relatedIdeas.length})
              </span>
            </div>
            <div className="space-y-2">
              {relatedIdeas.map((idea) => (
                <motion.div
                  key={idea.id}
                  className="p-3 rounded-lg bg-theme-surface-elevated hover:bg-theme-card cursor-pointer transition-colors group"
                  onClick={() => handleIdeaClick(idea)}
                  whileHover={{ x: 4 }}
                >
                  <h5 className="font-medium text-theme-primary group-hover:text-theme-accent transition-colors text-sm">
                    {idea.title}
                  </h5>
                  <p className="text-xs text-theme-secondary mt-1 line-clamp-2">
                    {idea.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {relatedBlogs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-theme-secondary" />
              <span className="text-sm font-medium text-theme-secondary">
                {language === 'en' ? 'Blogs' : '博客'} ({relatedBlogs.length})
              </span>
            </div>
            <div className="space-y-2">
              {relatedBlogs.map((blog) => (
                <motion.div
                  key={blog.id}
                  className="p-3 rounded-lg bg-theme-surface-elevated hover:bg-theme-card cursor-pointer transition-colors group"
                  onClick={() => handleBlogClick(blog)}
                  whileHover={{ x: 4 }}
                >
                  <h5 className="font-medium text-theme-primary group-hover:text-theme-accent transition-colors text-sm">
                    {language === 'en' ? blog.title : (blog.titleZh || blog.title)}
                  </h5>
                  <p className="text-xs text-theme-secondary mt-1 line-clamp-2">
                    {language === 'en' ? blog.summary : (blog.summaryZh || blog.summary)}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface StatisticsCardProps {
  plan: AnnualPlan;
  projects: Project[];
  ideas: IdeaData[];
  blogs: BlogData[];
  index: number;
}

const StatisticsCard: React.FC<StatisticsCardProps> = ({ plan, projects, ideas, blogs, index }) => {
  const { language } = useLanguage();
  
  const planProjects = projects.filter(project => project.annualPlan === plan.name);
  const relatedIdeas = ideas.filter(idea =>
    idea.tags.some(tag => 
      planProjects.some(project => 
        project.tags.some((projectTag: string) => 
          tag.toLowerCase().includes(projectTag.toLowerCase()) ||
          projectTag.toLowerCase().includes(tag.toLowerCase())
        )
      )
    )
  );
  const relatedBlogs = blogs.filter(blog =>
    blog.tags.some(tag => 
      planProjects.some(project => 
        project.tags.some((projectTag: string) => 
          tag.toLowerCase().includes(projectTag.toLowerCase()) ||
          projectTag.toLowerCase().includes(tag.toLowerCase())
        )
      )
    )
  );

  const stats = [
    {
      label: language === 'en' ? 'Projects' : '项目',
      value: planProjects.length,
      icon: Briefcase,
      color: 'text-theme-600'
    },
    {
      label: language === 'en' ? 'Ideas' : '想法',
      value: relatedIdeas.length,
      icon: Lightbulb,
      color: 'text-yellow-600'
    },
    {
      label: language === 'en' ? 'Blogs' : '博客',
      value: relatedBlogs.length,
      icon: BookOpen,
      color: 'text-green-600'
    },
    {
      label: language === 'en' ? 'Completion' : '完成度',
      value: `${Math.round((planProjects.length / plan.projectCount) * 100)}%`,
      icon: BarChart3,
      color: 'text-theme-accent'
    }
  ];

  return (
    <motion.div
      className="bg-theme-surface border border-theme-border rounded-2xl p-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: index * 0.1 + 0.4 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 size={24} className="text-theme-primary" />
        <h3 className="text-xl font-semibold text-theme-primary">
          {language === 'en' ? 'Statistics' : '统计'}
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, idx) => (
          <motion.div
            key={idx}
            className="text-center p-4 rounded-lg bg-theme-surface-elevated hover:bg-theme-card transition-colors"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: idx * 0.1 }}
            whileHover={{ scale: 1.02 }}
          >
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg mx-auto mb-2 ${stat.color} bg-current/10`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <div className="text-2xl font-bold text-theme-primary">{stat.value}</div>
            <div className="text-xs text-theme-secondary">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

const PlansPage: React.FC = () => {
  const [plans, setPlans] = useState<AnnualPlan[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [blogs, setBlogs] = useState<BlogData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { colors } = useTheme();
  const { language } = useLanguage();

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

        // Load all sources concurrently but independently — one source
        // failing (e.g. a transient dev-server restart) must not blank
        // the entire page.
        const [plansRes, projectsRes, ideasRes, blogsRes] =
          await Promise.allSettled([
            fetchAnnualPlans(language),
            fetchProjectsWithAnnualPlans(language),
            fetchIdeas({}, language),
            fetchBlogPosts({}, language),
          ]);

        if (!isMounted) return;

        const plansData =
          plansRes.status === 'fulfilled' ? plansRes.value : [];
        const projectsData =
          projectsRes.status === 'fulfilled' ? projectsRes.value : [];
        const ideasData =
          ideasRes.status === 'fulfilled' ? ideasRes.value : [];
        const blogsData =
          blogsRes.status === 'fulfilled' ? blogsRes.value : [];

        setPlans(
          [...plansData].sort(
            (a: AnnualPlan, b: AnnualPlan) => b.year - a.year,
          ),
        );
        setProjects(projectsData);
        setIdeas(ideasData);
        setBlogs(blogsData);

        // Only surface a hard error if every source failed.
        const allFailed = [plansRes, projectsRes, ideasRes, blogsRes].every(
          (r) => r.status === 'rejected',
        );
        if (allFailed) {
          setError(language === 'en' ? 'Failed to load data' : '加载数据失败');
        }
        setLoading(false);
      } catch (err) {
        if (isMounted) {
          setError(language === 'en' ? 'Failed to load data' : '加载数据失败');
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [language]);

  // Filter plans based on search
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) {
      return plans;
    }

    const query = searchQuery.toLowerCase().trim();
    return plans.filter(plan =>
      plan.name.toLowerCase().includes(query) ||
      plan.description.toLowerCase().includes(query) ||
      plan.objectives.some((obj: string) => obj.toLowerCase().includes(query))
    );
  }, [plans, searchQuery]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="status"
          aria-live="polite"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full loading-gradient" />
          <p className="text-theme-secondary">
            {language === 'en' ? 'Loading annual plans...' : '加载年度计划中...'}
          </p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
        >
          <AlertCircle size={48} className="mx-auto mb-4 text-theme-error" />
          <h2 className="text-xl font-semibold mb-2 text-theme-primary">
            {language === 'en' ? 'Error Loading Data' : '数据加载出错'}
          </h2>
          <p className="text-theme-secondary">{error}</p>
        </motion.div>
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
      <Seo
        title={language === 'en' ? 'Plans' : '计划'}
        description={
          language === 'en'
            ? 'Annual plans and strategic objectives of Silan Hu.'
            : '胡思蓝的年度计划与战略目标。'
        }
        path="/plans"
        lang={language as 'en' | 'zh'}
      />
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-4 text-theme-primary">
            {language === 'en' ? 'Annual Plans' : '年度计划'}
          </h1>
          <p className="text-xl text-theme-secondary max-w-3xl mx-auto">
            {language === 'en' ? 
              'Yearly roadmaps showcasing projects, objectives, and achievements across different focus areas.' :
              '年度路线图，展示不同重点领域的项目、目标和成就。'
            }
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          className="max-w-md mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="relative">
            <Search
              size={20}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-theme-secondary"
            />
            <input
              type="text"
              placeholder={
                language === 'en' ? 'Search plans...' : '搜索计划...'
              }
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-12 pr-12 py-3 rounded-xl border border-theme-border bg-theme-surface text-theme-primary focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent transition-all duration-300"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-theme-secondary hover:text-theme-primary transition-colors"
                aria-label="Clear search"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </motion.div>

        {/* Plans */}
        <AnimatePresence mode="wait">
          <motion.div
            key={searchQuery}
            className="space-y-16"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {filteredPlans.map((plan, index) => (
              <div key={plan.name} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Header Card - Full width on mobile, half on desktop */}
                  <div className="lg:col-span-2">
                    <PlanHeaderCard plan={plan} index={index} />
                  </div>
                  
                  {/* Objectives Card */}
                  <ObjectivesCard plan={plan} index={index} />
                  
                  {/* Statistics Card */}
                  <StatisticsCard 
                    plan={plan} 
                    projects={projects} 
                    ideas={ideas} 
                    blogs={blogs} 
                    index={index} 
                  />
                  
                  {/* Projects Card - Full width */}
                  <div className="lg:col-span-2">
                    <ProjectsCard plan={plan} projects={projects} index={index} />
                  </div>
                  
                  {/* Related Content Card - Full width */}
                  <div className="lg:col-span-2">
                    <RelatedContentCard 
                      plan={plan} 
                      ideas={ideas} 
                      blogs={blogs} 
                      index={index} 
                    />
                  </div>
                </div>
                
                {/* Divider between plans */}
                {index < filteredPlans.length - 1 && (
                  <div className="border-t border-theme-border my-16" />
                )}
              </div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredPlans.length === 0 && !loading && (
          <motion.div
            className="text-center py-20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            role="status"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center bg-theme-surface border border-theme-border">
              <Calendar size={32} className="text-theme-secondary" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-theme-primary">
              {language === 'en' ? 'No plans found' : '未找到计划'}
            </h3>
            <p className="text-theme-secondary">
              {language === 'en'
                ? 'Try adjusting your search criteria.'
                : '尝试调整搜索条件。'}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default PlansPage; 