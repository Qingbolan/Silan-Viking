import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
import {
  fetchProjectDetailById,
  type ProjectLiker,
} from '../../api/projects/projectApi';
import type { ProjectDetail as ProjectDetailType } from '../../types/api';
import { useSetPageTitle } from '../../layout/PageTitleContext';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import { useProjectEngagement } from './hooks/useProjectEngagement';
import { cn } from '../../lib/utils';
import { scrollToAnchor } from '../../lib/scrollToAnchor';
import type { ContentPart } from '../../types';
import {
  Badge,
  Button,
  Divider,
  BrandLoading,
  ErrorState,
  LoginPromptModal,
  NetworkError,
  KnowledgeBaseShell,
  type BookNavChapter,
} from '../../components/ds';
import Markdown from '../ui/Markdown';
import CompactComments from '../ds/article-footer/CompactComments';
import LikerAvatar from '../ds/article-footer/Avatar';
import { useRequireIdentity } from '../../lib/useRequireIdentity';

const PROJECT_HEADER_ID = 'project-header';
const PROJECT_FEEDBACK_ID = 'tab-issues';

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
  coverNode?: React.ReactNode;
}> = ({ part, label, language, documentTitle, coverNode }) => {
  const body = partBody(part, language);
  if (part.role === 'overview') {
    return (
      <section id={part.role} className="max-w-[68rem] scroll-mt-24">
        {coverNode}
        <Markdown
          className="text-[19px] font-medium leading-[1.65] text-ds-fg"
          documentTitle={documentTitle}
          sectionTitle={label}
        >
          {body}
        </Markdown>
      </section>
    );
  }

  return (
    <section id={part.role} className="scroll-mt-24">
      <h2 className="mb-4 inline-flex items-center gap-2 text-ds-xl font-semibold tracking-[-0.01em] text-ds-fg">
        {React.createElement(roleIcon(part.role), {
          className: 'size-[18px] text-ds-fg-subtle',
          'aria-hidden': true,
        })}
        {label}
      </h2>
      {part.shape === 'entry_list' ? (
        <PartEntryList part={part} />
      ) : (
        <Markdown documentTitle={documentTitle} sectionTitle={label}>{body}</Markdown>
      )}
    </section>
  );
};

const ProjectCoverBlock: React.FC<{
  title: string;
  image?: string;
  websiteUrl?: string;
  language: 'en' | 'zh';
}> = ({ title, image, websiteUrl, language }) => {
  const src = websiteUrl?.trim() || '';
  const normalizedSrc = src && /^https?:\/\//i.test(src) ? src : src ? `https://${src}` : '';
  const openLabel = language === 'zh' ? `打开 ${title}` : `Open ${title}`;

  if (!image) return null;

  const media = <img src={image} alt={title} className="size-full object-cover" />;

  return (
    <div className="mb-8">
      <div className="h-80 overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-2 shadow-ds-2">
        {normalizedSrc ? (
          <a
            href={normalizedSrc}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={openLabel}
            className="block size-full transition duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
          >
            {media}
          </a>
        ) : media}
      </div>
    </div>
  );
};

const ProjectLikerWall: React.FC<{
  likers: ProjectLiker[];
  likesCount: number;
  language: 'en' | 'zh';
}> = ({ likers, likesCount, language }) => {
  if (likesCount <= 0 || likers.length === 0) return null;

  const label = language === 'zh'
    ? `${likesCount} 位读者点赞`
    : `${likesCount} reader${likesCount === 1 ? '' : 's'} liked this`;

  return (
    <div
      className="mb-6 mt-4 grid max-w-[34rem] grid-cols-[repeat(auto-fill,minmax(2.25rem,2.25rem))] gap-2"
      aria-label={label}
    >
      {likers.map((liker, index) => {
        const name = liker.label
          || (liker.kind === 'visitor'
            ? (language === 'zh' ? `访客 ${liker.visitor_number || index + 1}` : `Visitor ${liker.visitor_number || index + 1}`)
            : (language === 'zh' ? '读者' : 'Reader'));
        return (
          <LikerAvatar
            key={`${liker.kind}-${liker.label || liker.visitor_number || index}`}
            name={name}
            src={liker.avatar_url}
            countryCode={liker.country_code}
            visitorNumber={liker.visitor_number}
            size="lg"
            className="rounded-[8px]"
          />
        );
      })}
    </div>
  );
};

const ProjectFeedbackPanel: React.FC<{
  language: 'en' | 'zh';
  likers: ProjectLiker[];
  likesCount: number;
  comments: ReturnType<typeof useProjectEngagement>['comments'];
  commentsCount: number;
  commentsState: ReturnType<typeof useProjectEngagement>['commentsState'];
  commentsError?: string;
  commentSubmitting: boolean;
  interactionError?: string;
  onRetryComments: () => void | Promise<void>;
  onComment: ReturnType<typeof useProjectEngagement>['submitComment'];
  onCommentLike: ReturnType<typeof useProjectEngagement>['toggleCommentLike'];
  isCommentLikePending: ReturnType<typeof useProjectEngagement>['isCommentLikePending'];
  onCommentDelete: ReturnType<typeof useProjectEngagement>['deleteComment'];
  isCommentDeletePending: ReturnType<typeof useProjectEngagement>['isCommentDeletePending'];
}> = ({
  language,
  likers,
  likesCount,
  comments,
  commentsCount,
  commentsState,
  commentsError,
  commentSubmitting,
  interactionError,
  onRetryComments,
  onComment,
  onCommentLike,
  isCommentLikePending,
  onCommentDelete,
  isCommentDeletePending,
}) => {
  const copy = language === 'zh'
    ? {
        title: '项目反馈',
        description: '围绕这个项目的具体问题、建议、使用体验和后续想法。',
        placeholder: '写下项目反馈…',
        postAria: '发布项目反馈',
        empty: '还没有项目反馈',
        count: (count: number) => `共 ${count} 条项目反馈`,
        viewAll: (count: number) => `查看全部 ${count} 条项目反馈`,
      }
    : {
        title: 'Project feedback',
        description: 'Questions, suggestions, usage notes, and follow-up thoughts for this project.',
        placeholder: 'Share project feedback…',
        postAria: 'Post project feedback',
        empty: 'No project feedback yet',
        count: (count: number) => `${count} project feedback`,
        viewAll: (count: number) => `View all ${count} project feedback`,
      };

  return (
    <section id={PROJECT_FEEDBACK_ID} className="scroll-mt-24">
      <header data-ds className="mb-5 flex flex-col gap-2 border-b border-ds-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-ds-2xl font-semibold tracking-[-0.02em] text-ds-fg">
              {copy.title}
            </h2>
            <Badge appearance="soft" tone="neutral">{commentsCount}</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-ds-sm leading-6 text-ds-fg-muted">
            {copy.description}
          </p>
        </div>
      </header>

      <ProjectLikerWall
        likers={likers}
        likesCount={likesCount}
        language={language}
      />

      {interactionError && (
        <p className="mb-3 text-ds-xs text-red-600" role="status">
          {interactionError}
        </p>
      )}

      <CompactComments
        comments={comments}
        state={commentsState}
        error={commentsError}
        submitting={commentSubmitting}
        onRetry={onRetryComments}
        onSubmit={onComment}
        onCommentLike={onCommentLike}
        isCommentLikePending={isCommentLikePending}
        onCommentDelete={onCommentDelete}
        isCommentDeletePending={isCommentDeletePending}
        labels={{
          placeholder: copy.placeholder,
          postAria: copy.postAria,
          empty: copy.empty,
          count: copy.count,
          viewAll: copy.viewAll,
        }}
      />
    </section>
  );
};

const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string>(PROJECT_HEADER_ID);
  const { loginPromptOpen, requireIdentity, resolveLogin, closeLoginPrompt } =
    useRequireIdentity<() => void>();

  const loadProject = useCallback(
    () => id ? fetchProjectDetailById(id, language as 'en' | 'zh') : Promise.resolve(null),
    [id, language],
  );
  const projectResource = useRemoteResource<ProjectDetailType>(id, loadProject);
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
          onClick: () => scrollToAnchor(part.role),
        })),
      );
    }
    entries.push(
      {
        id: PROJECT_FEEDBACK_ID,
        label: language === 'zh' ? '项目反馈' : 'Project feedback',
        onClick: () => scrollToAnchor(PROJECT_FEEDBACK_ID),
      },
    );
    return entries;
  }, [
    language,
    visibleParts,
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
          ? `项目反馈 ${engagement.commentsCount}`
          : `Project feedback ${engagement.commentsCount}`,
        icon: MessageSquareText,
      },
    ],
    [engagement.commentsCount, language, visibleParts],
  );

  const defaultPanel = visibleParts.length === 0
    ? PROJECT_FEEDBACK_ID
    : visibleParts[0].role;
  const [activePanel, setActivePanel] = useState<string>(defaultPanel);
  const activePart = visibleParts.find((part) => part.role === activePanel) ?? null;

  useEffect(() => {
    const nextPanel = visibleParts.length === 0
      ? PROJECT_FEEDBACK_ID
      : visibleParts[0].role;
    setActivePanel(nextPanel);
    setActiveSection(nextPanel);
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) scrollRoot.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [project?.id, visibleParts]);

  useEffect(() => {
    setActiveSection(activePanel);
  }, [activePanel]);

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
  const overviewCoverNode = activePart?.role === 'overview' ? (
    <ProjectCoverBlock
      title={title}
      image={project.image}
      websiteUrl={project.coverSourceType === 'website' ? project.coverWebsiteUrl || homepageUrl : undefined}
      language={language as 'en' | 'zh'}
    />
  ) : undefined;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Seo
        title={title}
        description={project.description || ''}
        path={`/projects/${id}`}
        image={project.image || undefined}
        type="article"
        lang={language as 'en' | 'zh'}
        jsonLd={creativeWorkJsonLd({
          title,
          description: project.description || '',
          path: `/projects/${id}`,
          image: project.image || undefined,
          type: 'SoftwareSourceCode',
        })}
      />
      <KnowledgeBaseShell
        overview={{
          label: title,
          icon: FolderGit2,
          onClick: () => scrollToAnchor(PROJECT_HEADER_ID),
          isActive: activeSection === PROJECT_HEADER_ID,
        }}
        chapters={chapters}
        currentChapterId={activeSection}
        wordCount={wordCount}
        showLeftRail={false}
        contentClassName="max-w-[82rem] lg:px-12"
        outlineContainerSelector="#project-detail-document"
        outlineHeadingSelector="header h1, h2, h3"
      >
        <article id="project-detail-document" className="w-full">
          <header id={PROJECT_HEADER_ID} className="scroll-mt-24 pb-8 pt-6">
            {(project.status?.lifecycle || project.year || hasReportedBuildStatus) && (
              <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] leading-5 text-ds-fg-subtle">
                {project.status?.lifecycle && <span>{project.status.lifecycle}</span>}
                {project.year > 0 && <span>{project.year}</span>}
                {hasReportedBuildStatus && buildStatus && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5',
                      buildStatus === 'passing' ? 'text-ds-success' : 'text-ds-error',
                    )}
                  >
                    <span className="size-1.5 rounded-full bg-current" aria-hidden />
                    {t(`projects.build.${buildStatus}`, { defaultValue: buildStatus })}
                  </span>
                )}
              </div>
            )}

            <h1
              className="max-w-[70rem] text-balance font-display text-ds-fg"
              style={{
                fontSize: 'clamp(3.5rem, 6vw, 5.8rem)',
                lineHeight: 1.03,
                fontWeight: 500,
                letterSpacing: '-0.035em',
              }}
            >
              {title}
            </h1>

            {project.description && (
              <p className="mt-7 max-w-[58rem] text-pretty text-[19px] font-medium leading-[1.55] text-ds-fg-muted">
                {project.description}
              </p>
            )}

            <div className="mt-8 flex flex-col gap-5 border-y border-ds-border py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-ds-sm text-ds-fg-muted">
                {project.status?.license && (
                  <span className="inline-flex items-center gap-1.5">
                    <Shield size={15} className="text-ds-fg-subtle" />
                    {project.status.license}
                  </span>
                )}
                {project.status?.lastUpdated && (
                  <>
                    {project.status?.license && <Divider orientation="vertical" className="h-3.5" />}
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={15} className="text-ds-fg-subtle" />
                      {t('projects.updated')}{' '}
                      {new Date(project.status.lastUpdated).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-SG')}
                    </span>
                  </>
                )}
                <Divider orientation="vertical" className="h-3.5" />
                <button
                  type="button"
                  onClick={() => requireIdentity(engagement.toggleLike, (action) => void action())}
                  disabled={engagement.likePending}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-ds-sm px-1 py-0.5 transition-colors hover:text-ds-error',
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
                <Divider orientation="vertical" className="h-3.5" />
                <span className="font-mono text-ds-xs tabular-nums text-ds-fg-subtle">
                  {engagement.metrics.views_count} views
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

            {project.tags && project.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-1.5">
                {project.tags.map((tag: string) => (
                  <Badge key={tag} tone="neutral" appearance="soft" size="md">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

          </header>

          <nav
            data-ds
            aria-label={language === 'zh' ? '项目详情章节' : 'Project detail sections'}
            className="project-detail-section-nav sticky top-0 z-20 mt-2 flex flex-wrap items-center bg-ds-surface-1"
          >
            {sectionTabs.map((tab) => {
              const Icon = tab.icon;
              const active = activePanel === tab.id;
              return (
                <button
                  data-ds
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActivePanel(tab.id);
                  }}
                  className={cn(
                    'inline-flex h-12 items-center gap-2 rounded-t-ds-md px-4 text-[15px] font-semibold transition',
                    active ? 'text-ds-primary' : 'text-ds-fg-muted hover:text-ds-primary dark:text-white dark:hover:text-ds-primary',
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-8">
            {activePart && (
              <PartPanel
                part={activePart}
                label={roleLabel(activePart.role, language)}
                language={language}
                documentTitle={title}
                coverNode={overviewCoverNode}
              />
            )}

            {activePanel === PROJECT_FEEDBACK_ID && (
              <ProjectFeedbackPanel
                language={language as 'en' | 'zh'}
                likers={engagement.metrics.likers ?? []}
                likesCount={engagement.metrics.likes_count}
                comments={engagement.comments}
                commentsCount={engagement.commentsCount}
                commentsState={engagement.commentsState}
                commentsError={engagement.commentsError}
                commentSubmitting={engagement.commentSubmitting}
                interactionError={engagement.interactionError}
                onRetryComments={engagement.reloadComments}
                onComment={engagement.submitComment}
                onCommentLike={engagement.toggleCommentLike}
                isCommentLikePending={engagement.isCommentLikePending}
                onCommentDelete={engagement.deleteComment}
                isCommentDeletePending={engagement.isCommentDeletePending}
              />
            )}
          </div>
        </article>
      </KnowledgeBaseShell>
      <LoginPromptModal
        open={loginPromptOpen}
        onClose={closeLoginPrompt}
        onResolved={() => resolveLogin((action) => void action())}
      />
    </motion.div>
  );
};

export default ProjectDetail;
