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
import { Seo, creativeWorkJsonLd } from '../Seo';
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
import {
  Container,
  Section,
  Badge,
  Button,
  Divider,
  BrandLoading,
  ErrorState,
} from '../../components/ds';

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
    return <BrandLoading inline message={t('projects.loadingProject')} />;
  }

  if (error || !project) {
    return (
      <ErrorState
        variant="page"
        title={t('projects.projectNotFound')}
        description={typeof error === 'string' ? error : undefined}
        actions={
          <Link to="/projects">
            <Button variant="outline" size="sm">
              {t('projects.backToProjects')}
            </Button>
          </Link>
        }
      />
    );
  }

  const planDisplay = plan ? getPlanDisplay(plan) : null;

  const seoTitle =
    language === 'zh' && project.titleZh ? project.titleZh : project.title;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={seoTitle}
        description={project.description || ''}
        path={`/projects/${project.id}`}
        image={project.image || undefined}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title: seoTitle,
          description: project.description || '',
          path: `/projects/${project.id}`,
          image: project.image || undefined,
          type: 'SoftwareSourceCode',
        })}
      />
      <Container width="content">
        <Section spacing="md">
          {/* --- Header ------------------------------------------------- */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Eyebrow row — plan label + build-status marker. */}
            {(plan || project.status?.buildStatus) && (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {plan && planDisplay && (
                  <span className="inline-flex items-center gap-1.5 text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
                    {planDisplay}
                    {language === 'en' ? plan.name : plan.nameZh}
                  </span>
                )}
                {plan && project.status?.buildStatus && (
                  <Divider orientation="vertical" className="h-3" />
                )}
                {project.status?.buildStatus && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-ds-xs font-medium uppercase tracking-[0.08em] ${
                      project.status.buildStatus === 'passing'
                        ? 'text-ds-success'
                        : project.status.buildStatus === 'failing'
                          ? 'text-ds-error'
                          : 'text-ds-fg-subtle'
                    }`}
                  >
                    <span
                      className="size-1.5 rounded-full bg-current"
                      aria-hidden
                    />
                    {t(`projects.build.${project.status.buildStatus}`, {
                      defaultValue: project.status.buildStatus,
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Title + description — one tight group. */}
            <h1 className="text-ds-4xl font-semibold leading-[1.15] tracking-[-0.02em] text-ds-fg">
              {language === 'zh' && project.titleZh ? project.titleZh : project.title}
            </h1>
            {project.description && (
              <p className="mt-3 max-w-2xl text-ds-lg leading-[1.6] text-ds-fg-muted">
                {project.description}
              </p>
            )}

            {/* Byline — license · updated, inline peers split by hairlines. */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
                <Shield size={15} className="text-ds-fg-subtle" />
                {project.status?.license || 'MIT'}
              </span>
              {project.status?.lastUpdated && (
                <>
                  <Divider orientation="vertical" className="h-3.5" />
                  <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
                    <Calendar size={15} className="text-ds-fg-subtle" />
                    {t('projects.updated')} {project.status.lastUpdated}
                  </span>
                </>
              )}
            </div>

            {/* Tag chips. */}
            {project.tags && project.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.tags.map((tag: string, index: number) => (
                  <Badge key={index} tone="neutral" appearance="soft" size="md">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Cover image. */}
            {project.image && (
              <img
                src={project.image}
                alt={project.title}
                className="mt-6 h-64 w-full rounded-ds-lg border border-ds-border object-cover"
              />
            )}
          </motion.div>

          {/* --- Sticky stats bar — horizontal "topping" that pins to the
              top of the viewport as the content scrolls beneath it. ----- */}
          <div className="sticky top-0 z-20 mt-8 -mx-4 border-b border-ds-border bg-ds-surface-1/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6">
            <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-ds-sm text-ds-fg-muted">
                <button
                  onClick={handleLikeProject}
                  disabled={liking}
                  className={`inline-flex items-center gap-1.5 rounded-ds-sm px-1 py-0.5 transition-colors hover:text-ds-error ${
                    metrics?.is_liked_by_user ? 'text-ds-error' : ''
                  } ${liking ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <Heart
                    size={15}
                    className={metrics?.is_liked_by_user ? 'fill-current' : ''}
                  />
                  {metrics?.likes_count || 0} {t('projects.likes')}
                </button>
                <Divider orientation="vertical" className="h-3.5" />
                <span className="inline-flex items-center gap-1.5">
                  <Eye size={15} className="text-ds-fg-subtle" />
                  {metrics?.views_count || 0} views
                </span>
                <Divider orientation="vertical" className="h-3.5" />
                <span className="inline-flex items-center gap-1.5">
                  <Download size={15} className="text-ds-fg-subtle" />
                  {project.metrics?.downloads || 0} {t('projects.downloads')}
                </span>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {project.demo && (
                  <a href={project.demo} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" leadingIcon={<ExternalLink />}>
                      {t('projects.liveDemo')}
                    </Button>
                  </a>
                )}
                {project.github && (
                  <a href={project.github} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" leadingIcon={<Github />}>
                      {t('projects.sourceCode')}
                    </Button>
                  </a>
                )}
                <Button variant="secondary" size="sm" leadingIcon={<Download />}>
                  {t('projects.download')} v{project.versions?.latest || '1.0.0'}
                </Button>
              </div>
            </div>
          </div>

          {/* --- Tabs --------------------------------------------------- */}
          <motion.div
            className="mt-6"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <ProjectTabs projectData={project} />
          </motion.div>
        </Section>
      </Container>
    </motion.div>
  );
};

export default ProjectDetail; 