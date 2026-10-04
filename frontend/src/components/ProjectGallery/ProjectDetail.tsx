import '../ds/ContentOverlay.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle,
  ExternalLink,
  FileText,
  FolderGit2,
  Github,
  Heart,
  Download,
  GraduationCap,
  Shield,
  Calendar,
  Lightbulb,
  ListTree,
  MessageSquareText,
  Rocket,
  Tag,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../LanguageContext';
import { Seo, creativeWorkJsonLd } from '../Seo';
import { canonicalInternalPath } from '../../utils/navigation';
import {
  fetchProjectDetailById,
} from '../../api/projects/projectApi';
import type { ProjectDetail as ProjectDetailType } from '../../types/api';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import { useProjectEngagement } from './hooks/useProjectEngagement';
import { cn } from '../../lib/utils';
import { scrollToAnchor } from '../../lib/scrollToAnchor';
import {
  DEFAULT_CONTENT_AUTHOR,
  DEFAULT_CONTENT_AUTHOR_AVATAR_URL,
} from '../../lib/contentAttribution';
import type { ContentPart } from '../../types';
import {
  Button,
  CardAuthor,
  BrandLoading,
  ErrorState,
  NetworkError,
  KnowledgeBaseShell,
  type BookNavChapter,
} from '../../components/ds';
import Markdown from '../ui/Markdown';
import { ContentHero } from '../ds/ContentHero';
import ArticleFooter from '../ds/ArticleFooter';
import ProjectIssuesList from './ProjectIssuesList';

const PROJECT_HEADER_ID = 'project-header';
const PROJECT_FEEDBACK_ID = 'feedback';

const ROLE_LABELS: Record<string, { en: string; zh: string }> = {
  overview: { en: 'Overview', zh: '概述' },
  abstract: { en: 'Abstract', zh: '摘要' },
  goals: { en: 'Goals', zh: '目标' },
  challenges: { en: 'Challenges', zh: '挑战' },
  solutions: { en: 'Solutions', zh: '解决方案' },
  lessons: { en: 'Lessons', zh: '经验总结' },
  quick_start: { en: 'Quick Start', zh: '快速开始' },
  release_notes: { en: 'Release Notes', zh: '发布说明' },
  progress: { en: 'Latest Progress', zh: '最新进展' },
  result: { en: 'Results', zh: '结果' },
  reference: { en: 'References', zh: '参考文献' },
};

const humanizeRole = (role: string): string =>
  role
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const roleLabel = (role: string, language: string): string => {
  const known = ROLE_LABELS[role];
  if (known) return language === 'en' ? known.en : known.zh;
  return humanizeRole(role);
};

const ROLE_ICONS: Record<string, LucideIcon> = {
  overview: BookOpen,
  abstract: FileText,
  goals: Target,
  challenges: AlertTriangle,
  solutions: Lightbulb,
  lessons: GraduationCap,
  quick_start: Rocket,
  release_notes: Tag,
  progress: BarChart3,
  result: CheckCircle,
  reference: BookOpen,
};

const roleIcon = (role: string): LucideIcon => ROLE_ICONS[role] ?? ListTree;

const partBody = (part: ContentPart, language: string): string =>
  part.body?.[language] ||
  part.body?.[part.canonicalLang] ||
  part.body?.en ||
  Object.values(part.body || {})[0] ||
  '';

const partHasContent = (part: ContentPart, language: string): boolean => {
  if (part.hasContent !== undefined) return part.hasContent;
  if (part.shape === 'entry_list') return (part.entries?.length ?? 0) > 0;
  return partBody(part, language).trim().length > 0;
};

const PartEntryList: React.FC<{ part: ContentPart }> = ({ part }) => (
  <div className="space-y-3">
    {[...(part.entries ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry) => {
        const fields = { ...entry.sharedPayload, ...entry.localizedPayload };
        const rows = Object.entries(fields).filter(
          ([, value]) => value != null && value !== '' && typeof value !== 'object',
        );
        return (
          <div key={entry.id} className="rounded-ds-md border border-ds-border bg-ds-surface-1 p-4">
            {rows.map(([key, value]) => (
              <div key={key} className="flex gap-3 py-1 text-ds-sm">
                <span className="min-w-[8rem] text-ds-fg-subtle">{humanizeRole(key)}</span>
                <span className="text-ds-fg">{String(value)}</span>
              </div>
            ))}
          </div>
        );
      })}
  </div>
);

const PartPanel: React.FC<{
  part: ContentPart;
  label: string;
  language: string;
  documentTitle: string;
}> = ({ part, label, language, documentTitle }) => {
  const body = partBody(part, language);

  return (
    <section id={part.role} aria-label={label} className="scroll-mt-24">
      {part.shape === 'entry_list' ? (
        <PartEntryList part={part} />
      ) : (
        <Markdown className="[&>.markdown-body:first-child>:first-child]:!mt-0 [&>figure:first-child]:!mt-0" documentTitle={documentTitle} sectionTitle={label}>{body}</Markdown>
      )}
    </section>
  );
};

const ProjectDetail: React.FC = () => {
  const { id, section } = useParams<{ id: string; section: string }>();
  const navigate = useNavigate();
  const sectionPath = useCallback((role: string) => canonicalInternalPath(`/projects/${id}${role === 'overview' ? '' : `/${encodeURIComponent(role)}`}`), [id]);
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string>(PROJECT_HEADER_ID);
  const loadProject = useCallback(
    () => id ? fetchProjectDetailById(id, language as 'en' | 'zh', section ?? 'default') : Promise.resolve(null),
    [id, language, section],
  );
  const projectResource = useRemoteResource<ProjectDetailType>(id ? `${id}/${section ?? 'overview'}` : undefined, loadProject, true);
  const project = projectResource.data;
  const engagement = useProjectEngagement({
    projectId: project?.id ?? '',
    language: language as 'en' | 'zh',
    enabled: Boolean(project?.id),
  });

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

  const visibleParts = useMemo(
    () =>
      [...(project?.parts ?? [])]
        .filter((part) => partHasContent(part, language))
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [language, project?.parts],
  );

  const homepageUrl = project?.embedUrl || project?.homepageUrl || project?.demo || '';
  const title = project
    ? (language === 'zh' && project.titleZh ? project.titleZh : project.title)
    : '';

  const wordCount = useMemo(() => {
    const text = [
      project?.description,
      project?.fullDescription,
      ...visibleParts.map((part) => partBody(part, language)),
    ].filter(Boolean).join('\n');
    return text.split(/\s+/).filter(Boolean).length;
  }, [language, project?.description, project?.fullDescription, visibleParts]);

  const chapters: BookNavChapter[] = useMemo(() => {
    const entries: BookNavChapter[] = [];
    if (visibleParts.length > 0) {
      entries.push(
        ...visibleParts.map((part) => ({
          id: part.role,
          label: roleLabel(part.role, language),
          onClick: () => navigate(sectionPath(part.role)),
        })),
      );
    }
    entries.push(
      {
        id: PROJECT_FEEDBACK_ID,
        label: language === 'zh' ? '项目反馈' : 'Project feedback',
        onClick: () => navigate(sectionPath(PROJECT_FEEDBACK_ID)),
      },
    );
    return entries;
  }, [
    language,
    visibleParts, navigate, sectionPath,
  ]);

  const sectionTabs = useMemo(
    () => [
      ...visibleParts.map((part) => ({
        id: part.role,
        label: roleLabel(part.role, language),
        icon: roleIcon(part.role),
      })),
      {
        id: PROJECT_FEEDBACK_ID,
        label: language === 'zh'
          ? '项目反馈'
          : 'Project feedback',
        icon: MessageSquareText,
      },
    ],
    [language, visibleParts],
  );

  const activePanel = section ?? visibleParts[0]?.role ?? PROJECT_FEEDBACK_ID;
  const activePart = visibleParts.find((part) => part.role === activePanel) ?? null;

  useEffect(() => {
    setActiveSection(activePanel);
  }, [id, activePanel]);

  const previousPanel = useRef(activePanel);
  const tabScroll = useRef({ pending: false, loading: false });
  useEffect(() => {
    if (previousPanel.current !== activePanel) {
      previousPanel.current = activePanel;
      tabScroll.current = { pending: true, loading: false };
    }
    if (!tabScroll.current.pending) return;
    if (projectResource.status === 'loading') {
      tabScroll.current.loading = true;
      return;
    }
    if (projectResource.status !== 'ready' || !tabScroll.current.loading) return;
    const frame = requestAnimationFrame(() => {
      const navigation = document.getElementById('project-section-navigation');
      scrollToAnchor('project-section-content', (navigation?.offsetHeight ?? 44) + 8);
      tabScroll.current.pending = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [activePanel, projectResource.status]);

  if (!project && projectResource.status === 'loading') {
    return <BrandLoading inline message={t('projects.loadingProject')} />;
  }

  if (!project && projectResource.status === 'error') {
    return <NetworkError onRetry={projectResource.reload} />;
  }

  if (!project || (section && section !== PROJECT_FEEDBACK_ID && !activePart)) {
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
            <Link to={canonicalInternalPath('/projects')}>
              <Button variant="outline" size="sm">
                {t('projects.backToProjects')}
              </Button>
            </Link>
          }
        />
      </>
    );
  }

  const downloadableAsset = project.versions?.releases
    ?.flatMap((release) => release.assets ?? [])
    .find((asset) => Boolean(asset.downloadUrl));
  const coverWebsite = project.coverSourceType === 'website' ? (project.coverWebsiteUrl || homepageUrl).trim() : '';
  const coverWebsiteUrl = coverWebsite && !/^https?:\/\//i.test(coverWebsite) ? `https://${coverWebsite}` : coverWebsite;

  return (
    <motion.div id="project-detail-document" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={section ? `${roleLabel(activePanel, language)} · ${title}` : title}
        description={project.description || ''}
        path={sectionPath(activePanel)}
        image={project.image || undefined}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title,
          description: project.description || '',
          path: `/projects/${id}`,
          image: project.image || undefined,
          type: 'SoftwareSourceCode',
          lang: language as 'en' | 'zh',
          dateModified: project.status?.lastUpdated,
        })}
      />
      <KnowledgeBaseShell
        header={<ContentHero
          id={PROJECT_HEADER_ID}
          title={title}
          coverImage={project.image}
          summary={project.description || undefined}
          actions={
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              <div className="flex items-center gap-3 text-ds-sm text-ds-fg-muted sm:flex sm:flex-wrap sm:gap-3">
                <button
                  type="button"
                  onClick={() => void engagement.toggleLike()}
                  disabled={engagement.likePending}
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-ds-sm px-1 py-0.5 transition-colors hover:text-ds-error',
                    engagement.metrics.is_liked_by_user && 'text-ds-error',
                    engagement.likePending && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <Heart
                    size={15}
                    className={engagement.metrics.is_liked_by_user ? 'fill-current' : undefined}
                  />
                  {engagement.metrics.likes_count} {t('projects.likes')}
                </button>

              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
                {coverWebsiteUrl && coverWebsiteUrl !== project.demo && (
                  <a className="project-hero-link" href={coverWebsiteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" aria-hidden />
                      {language === 'zh' ? '访问项目网站' : 'Visit project website'}

                  </a>
                )}
                {project.demo && (
                  <a className="project-hero-link project-hero-link--primary" href={project.demo} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" aria-hidden />
                      {t('projects.liveDemo')}

                  </a>
                )}
                {project.github && (
                  <a className="project-hero-link" href={project.github} target="_blank" rel="noopener noreferrer">
                    <Github className="size-4" aria-hidden />
                      {t('projects.sourceCode')}

                  </a>
                )}
                {downloadableAsset && (
                  <a className="project-hero-link" href={downloadableAsset.downloadUrl} download>
                    <Download className="size-4" aria-hidden />
                      {t('projects.download')} {downloadableAsset.name}

                  </a>
                )}
              </div>
            </div>
          }
          language={language}
          parent={{ label: language === 'zh' ? '项目' : 'Projects', to: '/projects/' }}
          metadata={<>
            <Link to={canonicalInternalPath('/')} rel="author" className="transition-colors hover:text-ds-primary">
              <CardAuthor name={DEFAULT_CONTENT_AUTHOR} avatarUrl={DEFAULT_CONTENT_AUTHOR_AVATAR_URL} />
            </Link>
            {project.status?.license && <span className="inline-flex items-center gap-1.5"><Shield size={15} aria-hidden />{project.status.license}</span>}
            {project.status?.lastUpdated && <span className="inline-flex items-center gap-1.5"><Calendar size={15} aria-hidden />
              {t('projects.updated')} {new Date(project.status.lastUpdated).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-SG')}
            </span>}
          </>}
        />}
        overview={{
          label: title,
          icon: FolderGit2,
          onClick: () => scrollToAnchor(PROJECT_HEADER_ID),
          isActive: activeSection === PROJECT_HEADER_ID,
        }}
        navigation={
          <nav
            id="project-section-navigation"
            data-ds
            aria-label={language === 'zh' ? '项目详情章节' : 'Project detail sections'}
            className="content-dark-capsule no-scrollbar  flex min-h-11 flex-nowrap items-center overflow-x-auto px-2"
          >
            {sectionTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activePanel === tab.id;
              return (
                <Link
                  data-ds
                  key={tab.id}
                  to={sectionPath(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-ds-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffad70] focus-visible:-outline-offset-2',
                    active ? 'text-[#ffad70]' : 'text-white/85 hover:text-white',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        }
        chapters={chapters}
        currentChapterId={activePanel}
        wordCount={wordCount}
        showLeftRail={false}
        contentClassName="!py-0 !px-4 sm:!px-5"
        likes={activePanel === PROJECT_FEEDBACK_ID ? undefined : engagement.metrics.likes_count}
        commentsCount={activePanel === PROJECT_FEEDBACK_ID ? undefined : engagement.commentsCount}
        outlineContainerSelector="#project-active-part"
        outlineHeadingSelector="header h1, h2, h3"
      >
        <article data-ds className="w-full">


          <div id="project-section-content" className="pt-2">
            <div id="project-active-part" className="prose-content w-full">
            {projectResource.status === 'loading' ? (
              <BrandLoading inline message={t('projects.loadingProject')} />
            ) : projectResource.status === 'error' ? (
              <NetworkError onRetry={projectResource.reload} />
            ) : activePart && (
              <PartPanel
                part={activePart}
                label={roleLabel(activePart.role, language)}
                language={language}
                documentTitle={title}
              />
            )}

            </div>
            {activePanel === PROJECT_FEEDBACK_ID && (
              <section id={PROJECT_FEEDBACK_ID}>
                <ProjectIssuesList projectId={project.id} />
              </section>
            )}
            {activePanel !== PROJECT_FEEDBACK_ID && <ArticleFooter
              likes={engagement.metrics.likes_count}
              liked={engagement.metrics.is_liked_by_user}
              likePending={engagement.likePending}
              likers={engagement.metrics.likers ?? []}
              shareTitle={title}
              attribution={{ canonicalPath: `/projects/${id}`, kind: 'project' }}
              comments={engagement.comments}
              commentsState={engagement.commentsState}
              commentsError={engagement.commentsError}
              commentSubmitting={engagement.commentSubmitting}
              interactionError={engagement.interactionError}
              onLike={engagement.toggleLike}
              onRetryComments={engagement.reloadComments}
              onComment={engagement.submitComment}
              onCommentLike={engagement.toggleCommentLike}
              isCommentLikePending={engagement.isCommentLikePending}
              onCommentDelete={engagement.deleteComment}
              isCommentDeletePending={engagement.isCommentDeletePending}
            />}
          </div>
        </article>
      </KnowledgeBaseShell>
    </motion.div>
  );
};

// Reset the shell only when entering another project or language, not another tab.
const ProjectDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  return <ProjectDetail key={`${id}:${language}`} />;
};
export default ProjectDetailRoute;
