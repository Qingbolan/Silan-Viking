import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, Outlet, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  FileText,
  FolderGit2,
  GraduationCap,
  Lightbulb,
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import { fetchMoments } from '../api/moments/momentApi';
import type { Moment } from '../types/api';
import MomentActions from '../components/Resume/MomentActions';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import { usePageFilter, type PageFilterOption } from '../layout/PageTitleContext';
import {
  Badge,
  BlogHeader,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  type BadgeProps,
} from '../components/ds';
import { markdownToPlainExcerpt } from '../lib/markdown';

type UpdateKind = 'work' | 'education' | 'research' | 'publication' | 'project' | 'other';

const normalizeKind = (value: string): UpdateKind => {
  const kind = value.toLowerCase();
  if (['work', 'job', 'career'].includes(kind)) return 'work';
  if (['education', 'school', 'study'].includes(kind)) return 'education';
  if (['research', 'r&d', 'rd'].includes(kind)) return 'research';
  if (['publication', 'paper', 'pub'].includes(kind)) return 'publication';
  if (['project', 'projects', 'proj'].includes(kind)) return 'project';
  return 'other';
};

const KIND_ICONS = {
  work: Briefcase,
  education: GraduationCap,
  research: Lightbulb,
  publication: FileText,
  project: FolderGit2,
  other: CalendarDays,
} as const;

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

const validDate = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface MomentTimelineItem {
  moment: Moment;
  kind: UpdateKind;
}

interface MomentMonthGroup {
  key: string;
  label: string;
  items: MomentTimelineItem[];
}

const Moments: React.FC = () => {
  const { language } = useLanguage();
  const [moments, setUpdates] = useState<Moment[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedTime, setSelectedTime] = useState<{ year: number; month?: number } | null>(null);
  const [searchParams] = useSearchParams();
  const selectedMomentId = searchParams.get('id');
  const momentElements = useRef(new Map<string, HTMLElement>());

  const copy = language === 'en'
    ? {
        eyebrow: 'Now',
        title: 'Recent moments',
        description: 'A concise log of current research, projects, and milestones.',
        errorTitle: 'Moments could not be loaded',
        errorBody: 'The content service did not respond. Try again without losing your filters.',
        emptyTitle: 'No moments in this view',
        emptyBody: 'Change the time filter to see other entries.',
        allTime: 'All time',
        outputs: 'Outputs',
        outputKinds: { blog: 'Article', project: 'Project' },
        priorities: { high: 'High priority', medium: 'Medium priority', low: 'Low priority' },
      }
    : {
        eyebrow: '近况',
        title: '最新动态',
        description: '研究、项目与阶段成果的简洁时间线。',
        errorTitle: '动态加载失败',
        errorBody: '内容服务暂未响应。重试不会丢失当前筛选。',
        emptyTitle: '当前筛选下没有动态',
        emptyBody: '更改时间筛选以查看其他内容。',
        allTime: '全部时间',
        outputs: '输出',
        outputKinds: { blog: '文章', project: '项目' },
        priorities: { high: '高优先级', medium: '中优先级', low: '低优先级' },
      };

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      setUpdates(await fetchMoments(language as 'en' | 'zh'));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = useMemo(
    () => moments.map((moment) => ({ moment, kind: normalizeKind(moment.type) })),
    [moments],
  );

  const monthNames = useMemo(
    () =>
      language === 'en'
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    [language],
  );

  const timelineOptions = useMemo<PageFilterOption[]>(() => {
    const timeline = new Map<number, Map<number, number>>();
    moments.forEach((moment) => {
      const date = validDate(moment.date);
      if (!date) return;
      const year = date.getFullYear();
      const month = date.getMonth();
      if (!timeline.has(year)) timeline.set(year, new Map());
      const months = timeline.get(year)!;
      months.set(month, (months.get(month) ?? 0) + 1);
    });
    return [...timeline.entries()]
      .sort(([a], [b]) => b - a)
      .flatMap(([year, months]) => {
        const entries: PageFilterOption[] = [{
          value: String(year),
          label: String(year),
          count: [...months.values()].reduce((sum, count) => sum + count, 0),
          level: 0,
        }];
        [...months.entries()]
          .sort(([a], [b]) => b - a)
          .forEach(([month, count]) => entries.push({
            value: `${year}-${month}`,
            label: monthNames[month],
            count,
            level: 1,
          }));
        return entries;
      });
  }, [moments, monthNames]);

  const timelineValue = selectedTime
    ? selectedTime.month === undefined
      ? String(selectedTime.year)
      : `${selectedTime.year}-${selectedTime.month}`
    : null;

  const handleTimelineSelect = useCallback((value: string | null) => {
    if (!value) {
      setSelectedTime(null);
      return;
    }
    const [year, month] = value.split('-').map(Number);
    setSelectedTime({ year, month: Number.isNaN(month) ? undefined : month });
  }, []);

  usePageFilter(
    useMemo(
      () => timelineOptions.length > 0 ? {
        options: timelineOptions,
        activeValue: timelineValue,
        allLabel: copy.allTime,
        onSelect: handleTimelineSelect,
      } : null,
      [timelineOptions, timelineValue, copy.allTime, handleTimelineSelect],
    ),
  );

  const filtered = useMemo(
    () => normalized.filter(({ moment }) => {
      if (!selectedTime) return true;
      const date = validDate(moment.date);
      if (!date || date.getFullYear() !== selectedTime.year) return false;
      return selectedTime.month === undefined || date.getMonth() === selectedTime.month;
    }).sort((left, right) =>
      (validDate(right.moment.date)?.getTime() ?? 0) - (validDate(left.moment.date)?.getTime() ?? 0),
    ),
    [normalized, selectedTime],
  );

  const monthGroups = useMemo<MomentMonthGroup[]>(() => {
    const groups = new Map<string, MomentMonthGroup>();
    filtered.forEach((item) => {
      const date = validDate(item.moment.date);
      const key = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : 'undated';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: date
            ? new Intl.DateTimeFormat(language === 'en' ? 'en-SG' : 'zh-CN', {
                month: 'long',
                year: 'numeric',
              }).format(date)
            : language === 'en' ? 'Undated' : '未标注日期',
          items: [],
        });
      }
      groups.get(key)!.items.push(item);
    });

    return [...groups.values()].map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) =>
        Number(Boolean(right.moment.pinned)) - Number(Boolean(left.moment.pinned))
        || (validDate(right.moment.date)?.getTime() ?? 0) - (validDate(left.moment.date)?.getTime() ?? 0),
      ),
    }));
  }, [filtered, language]);

  useEffect(() => {
    if (loadState !== 'ready' || !selectedMomentId) return;
    const selected = moments.find((moment) =>
      moment.id === selectedMomentId || moment.slug === selectedMomentId
    );
    if (!selected) return;
    setSelectedTime(null);
    requestAnimationFrame(() => {
      momentElements.current.get(selected.id)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [loadState, moments, selectedMomentId]);

  const kindLabel = (value: UpdateKind) => {
    const labels = language === 'en'
      ? { work: 'Work', education: 'Education', research: 'Research', publication: 'Publication', project: 'Project', other: 'Other' }
      : { work: '工作', education: '教育', research: '研究', publication: '论文', project: '项目', other: '其他' };
    return labels[value];
  };

  if (loadState === 'error') {
    return (
      <>
        <Seo
          title={copy.errorTitle}
          description={copy.errorBody}
          path="/moments"
          lang={language as 'en' | 'zh'}
        />
        <ErrorState
          variant="page"
          title={copy.errorTitle}
          description={copy.errorBody}
          onRetry={() => void load()}
        />
        <Outlet />
      </>
    );
  }

  return (
    <motion.div
      className="mx-auto min-h-screen max-w-5xl px-4 py-12 sm:px-8 sm:py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Seo
        title={copy.title}
        description={copy.description}
        path="/moments"
        lang={language as 'en' | 'zh'}
      />

      <BlogHeader
        className="mb-10"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      {loadState === 'loading' && (
        <div aria-label={language === 'en' ? 'Loading moments' : '正在加载动态'} className="space-y-0 divide-y divide-ds-border">
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid grid-cols-[5rem_1fr] gap-5 py-7 sm:grid-cols-[7rem_1fr]">
              <Skeleton className="w-16" />
              <div className="space-y-3">
                <Skeleton className="w-2/3" />
                <Skeleton className="w-full" />
                <Skeleton className="w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {loadState === 'ready' && filtered.length === 0 && (
        <EmptyState
          icon={<CalendarDays />}
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={selectedTime ? (
            <Button variant="outline" size="sm" onClick={() => setSelectedTime(null)}>
              {copy.allTime}
            </Button>
          ) : undefined}
        />
      )}

      {loadState === 'ready' && filtered.length > 0 && (
        <div className="space-y-16">
          {monthGroups.map((group) => (
            <section key={group.key} aria-labelledby={`month-${group.key}`}>
              <header className="grid grid-cols-1 border-b border-ds-border pb-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-7">
                <div aria-hidden />
                <h2
                  id={`month-${group.key}`}
                  className="font-mono text-ds-sm font-semibold uppercase tracking-[0.12em] text-ds-fg-muted"
                >
                  {group.label}
                </h2>
              </header>

              <ol className="space-y-6 sm:space-y-8">
                {group.items.map(({ moment, kind: momentKind }, index) => {
                  const Icon = KIND_ICONS[momentKind];
                  const date = validDate(moment.date);
                  const previousDate = index > 0 ? group.items[index - 1].moment.date : undefined;
                  const showDay = moment.pinned || moment.date !== previousDate;
                  const day = date
                    ? String(date.getDate()).padStart(2, '0')
                    : moment.date;
                  const weekday = date?.toLocaleDateString(language === 'en' ? 'en-SG' : 'zh-CN', {
                    weekday: 'short',
                  });
                  const momentPath = `/moments/${encodeURIComponent(moment.slug || moment.id)}`;
                  const excerpt = markdownToPlainExcerpt(moment.description, moment.title);

                  return (
                    <motion.li
                      key={moment.id}
                      ref={(node) => {
                        if (node) momentElements.current.set(moment.id, node);
                        else momentElements.current.delete(moment.id);
                      }}
                      className="grid scroll-mt-24 grid-cols-1 gap-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-7"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.2) }}
                    >
                      <div className="flex items-center gap-3 sm:block sm:pt-4">
                        {moment.pinned ? (
                          <span className="font-mono text-ds-lg font-medium tracking-[-0.03em] text-ds-fg sm:text-ds-xl">
                            {language === 'en' ? 'Pin' : '置顶'}
                          </span>
                        ) : showDay ? (
                          <>
                            <time
                              dateTime={moment.date}
                              className="font-mono text-3xl font-medium leading-none tabular-nums tracking-[-0.05em] text-ds-fg sm:text-4xl"
                            >
                              {day}
                            </time>
                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ds-fg-subtle sm:mt-2 sm:block">
                              {weekday}
                            </span>
                          </>
                        ) : (
                          <span className="hidden h-8 sm:block" aria-hidden />
                        )}
                      </div>

                      <article className="min-w-0">
                        <div className="group max-w-[68ch] overflow-hidden rounded-[10px] border border-ds-border-strong bg-ds-surface-2 shadow-[0_1px_0_rgba(17,17,17,0.03)] transition-[border-color,background-color,box-shadow] hover:border-ds-fg-subtle hover:bg-ds-surface-3 hover:shadow-ds-1">
                          <Link
                            to={momentPath}
                            className={`block p-4 outline-none focus-visible:shadow-ds-focus sm:p-5 ${
                              moment.related_outputs?.length > 0 ? 'pb-3 sm:pb-3' : ''
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <span className="mb-2 inline-flex items-center gap-1.5 text-ds-xs text-ds-fg-subtle">
                                  <Icon className="size-3.5" aria-hidden />
                                  {kindLabel(momentKind)}
                                </span>
                                <h3 className="text-balance text-ds-xl font-semibold leading-tight tracking-[-0.02em] text-ds-fg group-hover:text-ds-primary sm:text-ds-2xl">
                                  {moment.title}
                                </h3>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-1.5">
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
                              </div>
                            </div>

                            {excerpt && (
                              <p className="mt-3 line-clamp-3 text-ds-sm leading-6 text-ds-fg-muted sm:text-ds-base">
                                {excerpt}
                                <span className="ml-1 font-medium text-ds-fg-subtle group-hover:text-ds-primary">
                                  {language === 'zh' ? '更多' : 'More'}
                                </span>
                              </p>
                            )}

                            {moment.tags?.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
                                {moment.tags.map((tag) => (
                                  <span key={tag} className="font-mono text-ds-xs text-ds-fg-subtle">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {!(moment.related_outputs?.length > 0) && (
                              <div className="mt-4 flex items-center justify-end text-ds-xs font-medium text-ds-fg-subtle">
                                <span className="inline-flex items-center gap-1 transition-colors group-hover:text-ds-primary">
                                  {language === 'zh' ? '查看详情' : 'Open detail'}
                                  <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                                </span>
                              </div>
                            )}
                          </Link>

                          {moment.related_outputs?.length > 0 && (
                            <MomentRelatedOutputs
                              outputs={moment.related_outputs}
                              labels={{
                                title: copy.outputs,
                                kinds: copy.outputKinds,
                              }}
                              className="px-4 pb-4 sm:px-5"
                            />
                          )}
                          <MomentActions
                            momentKey={moment.slug || moment.id}
                            timestamp={
                              moment.created_at && !moment.created_at.startsWith('0001-')
                                ? moment.created_at
                                : `${moment.date}T00:00:00`
                            }
                            variant="compact"
                          />
                        </div>
                      </article>
                    </motion.li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {/* The detail overlay renders here when the route matches
          /moments/:slug — a modal on top of this list, not a page swap. */}
      <Outlet />
    </motion.div>
  );
};

export default Moments;
