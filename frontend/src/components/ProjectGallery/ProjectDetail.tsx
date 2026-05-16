import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ExternalLink,
  Github,
  Heart,
  Eye,
  Download,
  Shield,
  Calendar,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../LanguageContext';
import { getPlanDisplay } from '../../utils/iconMap';
import { fetchAnnualPlanByName } from '../../api/plans/planApi';
import { fetchProjectDetailById } from '../../api';
import {
  likeProject,
  recordProjectView,
  getProjectMetrics,
  type ProjectMetricsResponse
} from '../../api/projects/projectApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import ProjectTabs from './ProjectTabs';
import type { ProjectDetail as ProjectDetailType } from '../../types/api';
import { useSetPageTitle } from '../../layout/PageTitleContext';

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [plan, setPlan] = useState<any>(null);
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ProjectMetricsResponse | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [liking, setLiking] = useState(false);

  // Reflect the project title in the address-bar breadcrumb.
  useSetPageTitle(
    project ? (language === 'zh' && project.titleZh ? project.titleZh : project.title) : null,
  );

  // Initialize fingerprint
  useEffect(() => {
    const initFingerprint = async () => {
      const fp = await getClientFingerprint();
      setFingerprint(fp);
    };
    initFingerprint();
  }, []);

  // Fetch project data
  useEffect(() => {
    const loadProject = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch project details with language support
        const projectData = await fetchProjectDetailById(id, language as 'en' | 'zh');

        if (projectData) {
          setProject(projectData);
        } else {
          setError(t('projects.projectNotFound'));
        }
      } catch (err) {
        console.error('Error loading project:', err);
        setError(t('projects.failedToLoadProject'));
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [id, language]);

  // Record view and load metrics when project and fingerprint are ready
  useEffect(() => {
    const recordViewAndLoadMetrics = async () => {
      if (!id || !fingerprint || !project) return;

      try {
        // Get user identity if available
        const getCurrentUser = () => {
          try {
            const raw = localStorage.getItem('auth_user');
            if (!raw) return null;
            const rawUser = JSON.parse(raw);
            if (rawUser && (rawUser.id || rawUser.email || rawUser.name)) {
              return {
                id: rawUser.id || rawUser.sub || rawUser.user_id,
                name: rawUser.name || rawUser.given_name || 'User',
                email: rawUser.email,
              };
            }
          } catch {}
          return null;
        };

        const user = getCurrentUser();

        // Record view
        await recordProjectView(id, fingerprint, {
          userIdentityId: user?.id,
          language: language as 'en' | 'zh'
        });

        // Load metrics
        const metricsData = await getProjectMetrics(id, {
          fingerprint,
          userIdentityId: user?.id,
          language: language as 'en' | 'zh'
        });

        setMetrics(metricsData);
      } catch (err) {
        console.error('Error recording view or loading metrics:', err);
      }
    };

    recordViewAndLoadMetrics();
  }, [id, fingerprint, project, language]);
  
  // Fetch plan data
  useEffect(() => {
    const loadPlan = async () => {
      if (project?.planId) {
        try {
          const planData = await fetchAnnualPlanByName(project.planId, language);
          setPlan(planData);
        } catch (error) {
          console.error('Failed to load plan:', error);
        }
      }
    };
    
    loadPlan();
  }, [project?.planId, language]);

  // Handle like/unlike project
  const handleLikeProject = async () => {
    if (!id || !fingerprint || liking) return;

    setLiking(true);
    try {
      // Get user identity if available
      const getCurrentUser = () => {
        try {
          const raw = localStorage.getItem('auth_user');
          if (!raw) return null;
          const rawUser = JSON.parse(raw);
          if (rawUser && (rawUser.id || rawUser.email || rawUser.name)) {
            return {
              id: rawUser.id || rawUser.sub || rawUser.user_id,
              name: rawUser.name || rawUser.given_name || 'User',
              email: rawUser.email,
            };
          }
        } catch {}
        return null;
      };

      const user = getCurrentUser();

      // Toggle like
      const response = await likeProject(id, fingerprint, {
        userIdentityId: user?.id,
        language: language as 'en' | 'zh'
      });

      // Update metrics with new data
      setMetrics(prev => prev ? {
        ...prev,
        likes_count: response.likes_count,
        is_liked_by_user: response.is_liked_by_user
      } : {
        likes_count: response.likes_count,
        views_count: 0,
        is_liked_by_user: response.is_liked_by_user
      });
    } catch (err) {
      console.error('Error liking project:', err);
    } finally {
      setLiking(false);
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-theme-primary mx-auto mb-4"></div>
          <p className="text-theme-secondary">
            {t('projects.loadingProject')}
          </p>
        </div>
      </div>
    );
  }
  
  if (error || !project) {
    return (
      <div className="container mx-auto px-6 py-12">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-theme-primary mb-4">
            {error || t('projects.projectNotFound')}
          </h1>
          <Link 
            to="/projects"
            className="text-theme-600 hover:underline"
          >
            {t('projects.backToProjects')}
          </Link>
        </div>
      </div>
    );
  }

  const planDisplay = plan ? getPlanDisplay(plan) : null;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          {/* Project Header */}
          <div className="bg-theme-surface rounded-xl p-6 shadow-sm border border-theme-border">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1">
                {/* Plan Badge */}
                {plan && planDisplay && (
                  <div className="flex items-center gap-2 mb-3">
                    {planDisplay}
                    <span className="text-sm font-medium text-theme-secondary">
                      {language === 'en' ? plan.name : plan.nameZh}
                    </span>
                  </div>
                )}

                {/* Title and Description */}
                <h1 className="text-3xl font-bold text-theme-primary mb-3">
                  {language === 'zh' && project.titleZh ? project.titleZh : project.title}
                </h1>
                <p className="text-lg text-theme-secondary mb-4">
                  {project.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {project.tags?.map((tag: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-theme-100 text-theme-800 rounded-full text-sm font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Quick Stats */}
                <div className="flex flex-wrap items-center gap-6 text-sm text-theme-secondary">
                  <button
                    onClick={handleLikeProject}
                    disabled={liking}
                    className={`flex items-center gap-1 transition-colors hover:text-red-500 ${
                      metrics?.is_liked_by_user ? 'text-red-500' : 'text-theme-secondary'
                    } ${liking ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <Heart
                      size={16}
                      className={metrics?.is_liked_by_user ? 'fill-current' : ''}
                    />
                    <span>{metrics?.likes_count || 0} {t('projects.likes')}</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <Eye size={16} />
                    <span>{metrics?.views_count || 0} views</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Download size={16} />
                    <span>{project.metrics?.downloads || 0} {t('projects.downloads')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Shield size={16} />
                    <span>{project.status?.license || 'MIT'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar size={16} />
                    <span>{t('projects.updated')} {project.status?.lastUpdated}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3 lg:min-w-[200px]">
                {project.demo && (
                  <a
                    href={project.demo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 bg-theme-600 text-white px-4 py-2 rounded-lg hover:bg-theme-700 transition-colors"
                  >
                    <ExternalLink size={16} />
                    {t('projects.liveDemo')}
                  </a>
                )}
                {project.github && (
                  <a
                    href={project.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 border border-theme-border text-theme-primary px-4 py-2 rounded-lg hover:bg-theme-surface transition-colors"
                  >
                    <Github size={16} />
                    {t('projects.sourceCode')}
                  </a>
                )}
                <button className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                  <Download size={16} />
                  {t('projects.download')} v{project.versions?.latest || '1.0.0'}
                </button>
              </div>
            </div>

            {/* Project Image */}
            {project.image && (
              <div className="mt-6">
                <img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-64  project-image-placeholder rounded-lg"
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* Tabs Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <ProjectTabs projectData={project} />
        </motion.div>
      </div>
    </div>
  );
};

export default ProjectDetail; 