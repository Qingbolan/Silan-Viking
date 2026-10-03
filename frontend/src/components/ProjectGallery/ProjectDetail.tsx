import '../ds/ContentOverlay.css';
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
import { canonicalInternalPath } from '../../utils/navigation';
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
import {
  DEFAULT_CONTENT_AUTHOR,
  DEFAULT_CONTENT_AUTHOR_AVATAR_URL,
} from '../../lib/contentAttribution';
import type { ContentPart } from '../../types';
import {
  Badge,
  Button,
  CardAuthor,
  ContentAttribution,
  Divider,
  BrandLoading,
  ErrorState,
  NetworkError,
  KnowledgeBaseShell,
  type BookNavChapter,
} from '../../components/ds';
import Markdown from '../ui/Markdown';
import { ContentHero } from '../ds/ContentHero';
import CompactComments from '../ds/article-footer/CompactComments';
import LikerAvatar from '../ds/article-footer/Avatar';

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
}> = ({ part, label, language, documentTitle }) => {
  const body = partBody(part, language);
  if (part.role === 'overview') {
    return (
      <section id={part.role} className="max-w-[68rem] scroll-mt-24">
        <Markdown
          className="text-ds-lg font-medium leading-[1.55] text-ds-fg"
          documentTitle={documentTitle}
          sectionTitle={label}
        >
          {body}
        </Markdown>
      </section>
    );
  }

  return (
    <section id={part.role} aria-label={label} className="scroll-mt-24">
      {part.shape === 'entry_list' ? (
        <PartEntryList part={part} />
      ) : (
        <Markdown documentTitle={documentTitle} sectionTitle={label}>{body}</Markdown>
      )}
    </section>
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
        const avatar = (
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
        return liker.actor_id ? (
          <Link
            key={liker.actor_id}
            to={canonicalInternalPath(`/people/${encodeURIComponent(liker.actor_id)}`)}
            aria-label={language === 'zh' ? `查看${name}的资料` : `View ${name}'s profile`}
            className="rounded-[8px] transition-transform hover:-translate-y-0.5 focus-visible:shadow-ds-focus"
          >
            {avatar}
          </Link>
        ) : avatar;
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
          lang: language as 'en' | 'zh',
          dateModified: project.status?.lastUpdated,
        })}
      />
      <KnowledgeBaseShell
        header={<ContentHero
          id={PROJECT_HEADER_ID}
          title={title}
          coverImage={project.image}
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
        chapters={chapters}
        currentChapterId={activeSection}
        wordCount={wordCount}
        showLeftRail={false}
        contentClassName="!py-0 !px-4 sm:!px-5"
        outlineContainerSelector="#project-detail-document"
        outlineHeadingSelector="header h1, h2, h3"
      >
        <article data-ds className="w-full">
          {project.description && (
            <p className="mb-6 max-w-[58rem] text-pretty text-ds-lg font-medium leading-7 text-ds-fg-muted">
              {project.description}
            </p>
          )}
            <div className="mt-4 flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 text-ds-sm text-ds-fg-muted sm:flex sm:flex-wrap sm:gap-3">
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
                <Divider orientation="vertical" className="hidden h-3.5 sm:block" />
                <span className="inline-flex items-center whitespace-nowrap font-mono text-ds-xs tabular-nums text-ds-fg-subtle">
                  {engagement.metrics.views_count} views
                </span>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {coverWebsiteUrl && coverWebsiteUrl !== project.demo && (
                  <a href={coverWebsiteUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" leadingIcon={<ExternalLink />}>
                      {language === 'zh' ? '访问项目网站' : 'Visit project website'}
                    </Button>
                  </a>
                )}
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


          <nav
            data-ds
            aria-label={language === 'zh' ? '项目详情章节' : 'Project detail sections'}
            className="content-dark-capsule no-scrollbar sticky top-0 z-20 -mx-4 flex min-h-11 flex-nowrap items-center overflow-x-auto px-2 sm:-mx-5"
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
                    'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 text-ds-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#ffad70] focus-visible:-outline-offset-2',
                    active ? 'text-[#ffad70]' : 'text-white/85 hover:text-white',
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-6">
            {activePart && (
              <PartPanel
                part={activePart}
                label={roleLabel(activePart.role, language)}
                language={language}
                documentTitle={title}
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

            <ContentAttribution
              canonicalPath={`/projects/${id}`}
              kind="project"
              className="mt-12"
            />
          </div>
        </article>
      </KnowledgeBaseShell>
    </motion.div>
  );
};

export default ProjectDetail;
