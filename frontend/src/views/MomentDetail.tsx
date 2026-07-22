import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Briefcase, CalendarDays, FileText, FolderGit2, GraduationCap, Lightbulb, X } from 'lucide-react';
import { fetchMoment } from '../api/moments/momentApi';
import type { Moment } from '../types/api';
import Markdown from '../components/ui/Markdown';
import MomentActions from '../components/Resume/MomentActions';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import { useLanguage } from '../components/LanguageContext';
import { Seo, creativeWorkJsonLd } from '../components/Seo';
import { Badge, BrandLoading, NetworkError, type BadgeProps } from '../components/ds';
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

// Xiaohongshu-style detail overlay: a centered modal (article left, a
// full-height interaction rail right) on a scrim over whatever page is
// behind it — never a full-page navigation. `/moments/:slug` still resolves
// directly (shared links, refresh) by rendering this same overlay on top of
// an empty scrim.
const MomentDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const lang = language as 'en' | 'zh';
  const panelRef = useRef<HTMLDivElement>(null);

  const loadMoment = useCallback(
    () => slug ? fetchMoment(slug, lang) : Promise.resolve(null),
    [slug, lang],
  );
  const resource = useRemoteResource<Moment>(slug, loadMoment);
  const moment = resource.data;

  const close = useCallback(() => navigate('/moments'), [navigate]);

  useSetPageTitle(
    moment
      ? moment.title
      : resource.status === 'not-found'
        ? (lang === 'zh' ? '动态不存在' : 'Moment not found')
        : resource.status === 'error'
          ? (lang === 'zh' ? '动态暂不可用' : 'Moment unavailable')
          : null,
  );

  // Esc closes, body scroll locks while the overlay is open — same contract
  // as the ds Modal, reimplemented here because this dialog needs a fully
  // custom two-pane body rather than the standard title/description/footer
  // shape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [close]);

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

  const detailPath = `/moments/${slug ?? ''}`;
  const description = moment ? markdownToPlainExcerpt(moment.description, moment.title, 180) : '';

  const body = resource.status === 'loading' ? (
    <div className="flex min-h-[24rem] items-center justify-center">
      <BrandLoading inline message={copy.loading} />
    </div>
  ) : resource.status === 'error' ? (
    <div className="flex min-h-[24rem] items-center justify-center p-8">
      <NetworkError onRetry={resource.reload} error={resource.error} />
    </div>
  ) : !moment ? (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-ds-xl font-semibold text-ds-fg">{copy.notFoundTitle}</h1>
      <p className="max-w-sm text-ds-sm text-ds-fg-muted">{copy.notFoundBody}</p>
    </div>
  ) : (
    <MomentDetailBody moment={moment} lang={lang} copy={copy} />
  );

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 flex items-stretch justify-center bg-ds-surface-1 p-0 sm:items-center sm:bg-transparent sm:p-4 lg:p-6"
        style={{ zIndex: 1100 }}
        role="dialog"
        aria-modal="true"
      >
        {moment && (
          <Seo
            title={moment.title}
            description={description}
            path={detailPath}
            type="article"
            lang={lang}
            jsonLd={creativeWorkJsonLd({ title: moment.title, description, path: detailPath })}
          />
        )}

        <motion.div
          className="absolute inset-0 hidden bg-ds-overlay sm:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={close}
        />

        <motion.div
          data-ds
          ref={panelRef}
          tabIndex={-1}
          className="relative flex h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-ds-surface-1 [box-shadow:none] focus:outline-none focus-visible:outline-none sm:h-[min(90dvh,54rem)] sm:w-[min(94vw,76rem)] sm:rounded-ds-xl sm:[box-shadow:var(--ds-elevation-4)] xl:w-[min(88vw,82rem)]"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <button
            type="button"
            onClick={close}
            aria-label={copy.back}
            className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex size-10 items-center justify-center rounded-full bg-ds-surface-1/90 text-ds-fg shadow-ds-2 backdrop-blur transition-colors hover:bg-ds-surface-2 focus-visible:outline-none focus-visible:shadow-ds-focus sm:left-3 sm:top-3 sm:size-9"
          >
            <X className="size-5" aria-hidden />
          </button>

          {body}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body,
  );
};

// The two-pane body — article on the left (scrolls on its own), the
// interaction rail on the right (fixed to the panel's full height, its own
// comment list scrolls independently). Below lg it becomes a full-screen
// detail page: one scroll root, content first, actions/comments in flow.
const MomentDetailBody: React.FC<{
  moment: Moment;
  lang: 'en' | 'zh';
  copy: {
    outputs: string;
    outputKinds: { blog: string; project: string };
    priorities: { high: string; medium: string; low: string };
  };
}> = ({ moment, lang, copy }) => {
  const kind = normalizeKind(moment.type);
  const Icon = KIND_ICONS[kind];
  const bodyText = withoutRepeatedTitle(moment.description, moment.title);
  const timestamp =
    moment.created_at && !moment.created_at.startsWith('0001-')
      ? moment.created_at
      : `${moment.date}T00:00:00`;
  const formattedDate = formatMomentDate(moment, lang);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_26rem]">
      <article className="min-w-0 px-5 pb-8 pt-[calc(4.75rem+env(safe-area-inset-top))] sm:px-8 sm:pt-16 lg:h-full lg:overflow-y-auto lg:px-12 lg:pb-12 lg:pt-16">
        <div className="mx-auto max-w-[44rem]">
          <header className="border-b border-ds-border pb-0">
            <h1 className="text-balance text-[2rem] font-semibold leading-[1.12] tracking-[-0.03em] text-ds-fg sm:text-ds-4xl lg:text-[2.75rem]">
              {moment.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-1.5 text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
                <Icon className="size-3.5" aria-hidden />
                {kindLabel(kind, lang)}
              </span>
              <time dateTime={moment.date} className="font-mono text-ds-xs tabular-nums text-ds-fg-subtle">
                {formattedDate}
              </time>
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
            className="mt-5 text-ds-base leading-8 text-ds-fg-muted sm:text-[1.05rem] [&_.vditor-reset]:!pl-0"
          >
            {bodyText}
          </Markdown>

          <MomentRelatedOutputs
            outputs={moment.related_outputs ?? []}
            labels={{
              title: copy.outputs,
              kinds: copy.outputKinds,
            }}
            className="mt-8"
          />

          {/* Below lg, the interaction rail collapses back into the
              article flow — the sidebar variant only makes sense with
              room beside the text. */}
          <div className="mt-8 lg:hidden">
            <MomentActions momentKey={moment.slug || moment.id} timestamp={timestamp} />
          </div>
        </div>
      </article>

      <aside className="hidden h-full min-w-0 border-l border-ds-border bg-ds-surface-2 lg:flex lg:flex-col">
        <MomentActions momentKey={moment.slug || moment.id} timestamp={timestamp} variant="sidebar" />
      </aside>
    </div>
  );
};

export default MomentDetail;
