import React, { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Briefcase, CalendarDays, FileText, FolderGit2, GraduationCap, Lightbulb } from 'lucide-react';
import { fetchMoment } from '../api/moments/momentApi';
import type { Moment } from '../types/api';
import Markdown from '../components/ui/Markdown';
import MomentActions from '../components/Resume/MomentActions';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import { useLanguage } from '../components/LanguageContext';
import { Seo, creativeWorkJsonLd } from '../components/Seo';
import { Badge, BrandLoading, Button, ErrorState, NetworkError, type BadgeProps } from '../components/ds';
import { useRemoteResource } from '../hooks/useRemoteResource';
import { useSetPageTitle } from '../layout/PageTitleContext';
import { markdownToPlainExcerpt, withoutRepeatedTitle } from '../lib/markdown';

type MomentKind = 'work' | 'education' | 'research' | 'publication' | 'project' | 'other';

const KIND_ICONS = {
  work: Briefcase,
  education: GraduationCap,
  research: Lightbulb,
  publication: FileText,
  project: FolderGit2,
  other: CalendarDays,
} as const;

const normalizeKind = (value: string): MomentKind => {
  const kind = value.toLowerCase();
  if (['work', 'job', 'career'].includes(kind)) return 'work';
  if (['education', 'school', 'study'].includes(kind)) return 'education';
  if (['research', 'r&d', 'rd'].includes(kind)) return 'research';
  if (['publication', 'paper', 'pub'].includes(kind)) return 'publication';
  if (['project', 'projects', 'proj'].includes(kind)) return 'project';
  return 'other';
};

const kindLabel = (value: MomentKind, language: 'en' | 'zh') => {
  const labels = language === 'en'
    ? { work: 'Work', education: 'Education', research: 'Research', publication: 'Publication', project: 'Project', other: 'Other' }
    : { work: '工作', education: '教育', research: '研究', publication: '论文', project: '项目', other: '其他' };
  return labels[value];
};

const statusTone = (status: string): NonNullable<BadgeProps['tone']> => {
  if (status === 'completed') return 'success';
  if (status === 'active' || status === 'ongoing') return 'primary';
  return 'neutral';
};

const priorityTone = (priority: string): NonNullable<BadgeProps['tone']> => {
  if (priority === 'high') return 'error';
  if (priority === 'medium') return 'warning';
  return 'neutral';
};

const formatMomentDate = (moment: Moment, language: 'en' | 'zh') => {
  const date = new Date(`${moment.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return moment.date;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-SG', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  }).format(date);
};

const MomentDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language as 'en' | 'zh';

  const loadMoment = useCallback(
    () => slug ? fetchMoment(slug, lang) : Promise.resolve(null),
    [slug, lang],
  );
  const resource = useRemoteResource<Moment>(slug, loadMoment);
  const moment = resource.data;

  useSetPageTitle(
    moment
      ? moment.title
      : resource.status === 'not-found'
        ? (lang === 'zh' ? '动态不存在' : 'Moment not found')
        : resource.status === 'error'
          ? (lang === 'zh' ? '动态暂不可用' : 'Moment unavailable')
          : null,
  );

  const copy = lang === 'zh'
    ? {
        back: '返回动态',
        loading: '正在加载动态',
        notFoundTitle: '动态不存在',
        notFoundBody: '这条动态不存在，或尚未公开。',
        outputs: '关联输出',
        outputKinds: { blog: '文章', project: '项目' },
        priorities: { high: '高优先级', medium: '中优先级', low: '低优先级' },
      }
    : {
        back: 'Back to moments',
        loading: 'Loading moment',
        notFoundTitle: 'Moment not found',
        notFoundBody: 'This moment does not exist or is not public.',
        outputs: 'Related outputs',
        outputKinds: { blog: 'Article', project: 'Project' },
        priorities: { high: 'High priority', medium: 'Medium priority', low: 'Low priority' },
      };

  if (resource.status === 'loading') {
    return <BrandLoading inline message={copy.loading} />;
  }

  if (resource.status === 'error') {
    return <NetworkError onRetry={resource.reload} error={resource.error} />;
  }

  if (!moment) {
    return (
      <>
        <Seo
          title={copy.notFoundTitle}
          description={copy.notFoundBody}
          path={`/moments/${slug ?? ''}`}
          noindex
          lang={lang}
        />
        <ErrorState
          variant="page"
          title={copy.notFoundTitle}
          description={copy.notFoundBody}
          actions={
            <Link to="/moments">
              <Button variant="outline" size="sm">
                {copy.back}
              </Button>
            </Link>
          }
        />
      </>
    );
  }

  const kind = normalizeKind(moment.type);
  const Icon = KIND_ICONS[kind];
  const body = withoutRepeatedTitle(moment.description, moment.title);
  const detailPath = `/moments/${moment.slug || moment.id}`;
  const timestamp =
    moment.created_at && !moment.created_at.startsWith('0001-')
      ? moment.created_at
      : `${moment.date}T00:00:00`;
  const description = markdownToPlainExcerpt(moment.description, moment.title, 180);
  const formattedDate = formatMomentDate(moment, lang);

  return (
    <motion.main
      className="mx-auto min-h-screen max-w-3xl px-4 py-10 sm:px-8 sm:py-14"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Seo
        title={moment.title}
        description={description}
        path={detailPath}
        type="article"
        lang={lang}
        jsonLd={creativeWorkJsonLd({
          title: moment.title,
          description,
          path: detailPath,
        })}
      />

      <button
        type="button"
        onClick={() => navigate('/moments')}
        className="mb-8 inline-flex items-center gap-2 text-ds-sm font-medium text-ds-fg-muted transition-colors hover:text-ds-fg focus-visible:outline-none focus-visible:shadow-ds-focus"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {copy.back}
      </button>

      <article>
        <header className="border-b border-ds-border pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
              <Icon className="size-3.5" aria-hidden />
              {kindLabel(kind, lang)}
            </span>
            <span className="font-mono text-ds-xs tabular-nums text-ds-fg-subtle">
              {formattedDate}
            </span>
          </div>

          <h1 className="text-balance text-ds-4xl font-semibold leading-[1.1] tracking-[-0.03em] text-ds-fg sm:text-ds-5xl">
            {moment.title}
          </h1>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {moment.status && (
              <Badge tone={statusTone(moment.status)} appearance="soft" dot>
                {moment.status}
              </Badge>
            )}
            {moment.priority && (
              <Badge tone={priorityTone(moment.priority)} appearance="outline">
                {copy.priorities[moment.priority as keyof typeof copy.priorities] ?? moment.priority}
              </Badge>
            )}
            {moment.tags?.map((tag) => (
              <Badge key={tag} tone="neutral" appearance="soft">
                #{tag}
              </Badge>
            ))}
          </div>
        </header>

        <Markdown
          documentTitle={moment.title}
          className="mt-8 text-ds-base leading-8 text-ds-fg-muted [&_.vditor-reset]:!pl-0"
        >
          {body}
        </Markdown>

        <MomentRelatedOutputs
          outputs={moment.related_outputs ?? []}
          labels={{
            title: copy.outputs,
            kinds: copy.outputKinds,
          }}
          className="mt-8"
        />

        <MomentActions momentKey={moment.slug || moment.id} timestamp={timestamp} />
      </article>
    </motion.main>
  );
};

export default MomentDetail;
