import React, { useCallback, useEffect, useState } from 'react';
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
import {
  fetchProjectDetailById,
  likeProject,
  recordProjectView,
  getProjectMetrics,
  type ProjectMetricsResponse
} from '../../api/projects/projectApi';
import { getClientFingerprint } from '../../utils/fingerprint';
import ProjectTabs from './ProjectTabs';
import type { ProjectDetail as ProjectDetailType } from '../../types/api';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import {
  Container,
  Section,
  Badge,
  Button,
  Divider,
  BrandLoading,
  ErrorState,
  NetworkError,
} from '../../components/ds';

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<ProjectMetricsResponse | null>(null);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [liking, setLiking] = useState(false);

  const loadProject = useCallback(
    () => id ? fetchProjectDetailById(id, language as 'en' | 'zh') : Promise.resolve(null),
    [id, language],
  );
  const projectResource = useRemoteResource<ProjectDetailType>(id, loadProject);
  const project = projectResource.data;

  // Reflect the project title in the address-bar breadcrumb.
  useSetPageTitle(
    project
      ? (language === 'zh' && project.titleZh ? project.titleZh : project.title)
      : projectResource.status === 'not-found'
        ? t('projects.projectNotFound')
        : projectResource.status === 'error'
          ? (language === 'zh' ? '项目暂不可用' : 'Project unavailable')
          : null,
  );

  // Initialize fingerprint
  useEffect(() => {
    const initFingerprint = async () => {
      const fp = await getClientFingerprint();
      setFingerprint(fp);
    };
    initFingerprint();
  }, []);

  useEffect(() => {
    setMetrics(null);
  }, [project?.id]);

  // Record view and load metrics when project and fingerprint are ready
  useEffect(() => {
    const recordViewAndLoadMetrics = async () => {
      if (!fingerprint || !project) return;

      const projectId = project.id;

      try {
        // Record view
        await recordProjectView(projectId, fingerprint, {
          language: language as 'en' | 'zh'
        });

        // Load metrics
        const metricsData = await getProjectMetrics(projectId, {
          fingerprint,
          language: language as 'en' | 'zh'
        });

        setMetrics(metricsData);
      } catch (err) {
        console.error('Error recording view or loading metrics:', err);
      }
    };

    recordViewAndLoadMetrics();
  }, [fingerprint, project, language]);
  
  // Handle like/unlike project
  const handleLikeProject = async () => {
    if (!project || !fingerprint || liking) return;

    setLiking(true);
    try {
      // Toggle like
      const response = await likeProject(project.id, fingerprint, {
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
  
  if (projectResource.status === 'loading') {
    return <BrandLoading inline message={t('projects.loadingProject')} />;
  }

  if (projectResource.status === 'error') {
    return <NetworkError onRetry={projectResource.reload} />;
  }

  if (!project) {
    return (
      <>
        <Seo
          title={t('projects.projectNotFound')}
          description={t('projects.projectNotFound')}
          path={`/projects/${id ?? ''}`}
          noindex
          lang={language as 'en' | 'zh'}
        />
        <ErrorState
          variant="page"
          title={t('projects.projectNotFound')}
          description={
            language === 'zh'
              ? '该项目不存在，或尚未公开。'
              : 'This project does not exist or is not public.'
          }
          actions={
            <Link to="/projects">
              <Button variant="outline" size="sm">
                {t('projects.backToProjects')}
              </Button>
            </Link>
          }
        />
      </>
    );
  }

  const buildStatus = project.status?.buildStatus;
  const hasReportedBuildStatus = buildStatus === 'passing' || buildStatus === 'failing';
  const downloadableAsset = project.versions?.releases
    ?.flatMap((release) => release.assets ?? [])
    .find((asset) => Boolean(asset.downloadUrl));

  const seoTitle =
    language === 'zh' && project.titleZh ? project.titleZh : project.title;

  return (
    <motion.div className="lg:ml-72" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={seoTitle}
        description={project.description || ''}
        path={`/projects/${id}`}
        image={project.image || undefined}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title: seoTitle,
          description: project.description || '',
          path: `/projects/${id}`,
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
            {/* Eyebrow row — only authored lifecycle/build facts. */}
            {(project.status?.lifecycle || project.year || hasReportedBuildStatus) && (
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {project.status?.lifecycle && (
                  <span className="inline-flex items-center gap-1.5 text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
                    <span className="size-1.5 rounded-full bg-ds-primary" aria-hidden />
                    {project.status.lifecycle}
                  </span>
                )}
                {project.year > 0 && (
                  <span className="font-mono text-ds-xs tabular-nums text-ds-fg-subtle">
                    {project.year}
                  </span>
                )}
                {(project.status?.lifecycle || project.year > 0) && hasReportedBuildStatus && (
                  <Divider orientation="vertical" className="h-3" />
                )}
                {hasReportedBuildStatus && buildStatus && (
                  <span
                    className={`inline-flex items-center gap-1.5 text-ds-xs font-medium uppercase tracking-[0.08em] ${
                      buildStatus === 'passing'
                        ? 'text-ds-success'
                        : buildStatus === 'failing'
                          ? 'text-ds-error'
                          : 'text-ds-fg-subtle'
                    }`}
                  >
                    <span
                      className="size-1.5 rounded-full bg-current"
                      aria-hidden
                    />
                    {t(`projects.build.${buildStatus}`, {
                      defaultValue: buildStatus,
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
            {(project.status?.license || project.status?.lastUpdated) && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
              {project.status?.license && (
                <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
                  <Shield size={15} className="text-ds-fg-subtle" />
                  {project.status.license}
                </span>
              )}
              {project.status?.lastUpdated && (
                <>
                  {project.status?.license && <Divider orientation="vertical" className="h-3.5" />}
                  <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
                    <Calendar size={15} className="text-ds-fg-subtle" />
                    {t('projects.updated')} {new Date(project.status.lastUpdated).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-SG')}
                  </span>
                </>
              )}
              </div>
            )}

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
                  type="button"
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
                {downloadableAsset && (
                  <a href={downloadableAsset.downloadUrl} download>
                    <Button variant="secondary" size="sm" leadingIcon={<Download />}>
                      {t('projects.download')} {downloadableAsset.name}
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* --- Tabs --------------------------------------------------- */}
          {/* Keep the navigation outside transformed animation containers:
              CSS fixed positioning is otherwise scoped to that ancestor and
              the rail moves with the article instead of the viewport. */}
          <div className="mt-6">
            <ProjectTabs
              projectData={project}
              projectId={project.id}
              documentTitle={language === 'zh' && project.titleZh ? project.titleZh : project.title}
            />
          </div>
        </Section>
      </Container>
    </motion.div>
  );
};

export default ProjectDetail;
