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
import { fetchPersonalInfo } from '../api/home/resumeApi';
import { mediaUrl } from '../api/utils';
import type { Moment, PersonalInfo } from '../types/api';
import MomentActions from '../components/Resume/MomentActions';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import MomentsProfileHero from '../components/Moments/MomentsProfileHero';
import { usePageFilter, type PageFilterOption } from '../layout/PageTitleContext';
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../components/ds';
import { markdownToPlainExcerpt } from '../lib/markdown';
import { cn } from '../lib/utils';
import { publicAssetUrl } from '../utils/publicAsset';
import { dsRoot } from '../components/ds/dsAttr';

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

const validDate = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface MomentTimelineItem {
  moment: Moment;
  kind: UpdateKind;
}

interface MomentDateGroup {
  key: string;
  date: Date | null;
  items: MomentTimelineItem[];
}

interface MomentYearGroup {
  year: string;
  dateGroups: MomentDateGroup[];
}

const TIMELINE_CONTAINER_CLASS = 'mx-auto w-full max-w-[1440px] px-4 sm:px-8';

const Moments: React.FC = () => {
  const { language } = useLanguage();
  const [moments, setUpdates] = useState<Moment[]>([]);
  const [profile, setProfile] = useState<PersonalInfo | null>(null);
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
        coverAlt: 'NUS School of Computing',
        errorTitle: 'Moments could not be loaded',
        errorBody: 'The content service did not respond. Try again without losing your filters.',
        emptyTitle: 'No moments in this view',
        emptyBody: 'Change the time filter to see other entries.',
        allTime: 'All time',
        outputs: 'Outputs',
        outputKinds: { blog: 'Article', project: 'Project' },
      }
    : {
        eyebrow: '近况',
        title: '最新动态',
        description: '研究、项目与阶段成果的简洁时间线。',
        coverAlt: '新加坡国立大学计算机学院',
        errorTitle: '动态加载失败',
        errorBody: '内容服务暂未响应。重试不会丢失当前筛选。',
        emptyTitle: '当前筛选下没有动态',
        emptyBody: '更改时间筛选以查看其他内容。',
        allTime: '全部时间',
        outputs: '输出',
        outputKinds: { blog: '文章', project: '项目' },
      };

  const load = useCallback(async () => {
    setLoadState('loading');
    const [momentsResult, profileResult] = await Promise.allSettled([
      fetchMoments(language as 'en' | 'zh'),
      fetchPersonalInfo(language as 'en' | 'zh'),
    ]);
    if (profileResult.status === 'fulfilled') {
      setProfile(profileResult.value);
    }
    if (momentsResult.status === 'fulfilled') {
      setUpdates(momentsResult.value);
      setLoadState('ready');
    } else {
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

  const yearGroups = useMemo<MomentYearGroup[]>(() => {
    const groups = new Map<string, Map<string, MomentDateGroup>>();
    filtered.forEach((item) => {
      const date = validDate(item.moment.date);
      const year = date ? String(date.getFullYear()) : language === 'en' ? 'Undated' : '未标注日期';
      if (!groups.has(year)) {
        groups.set(year, new Map());
      }
      const dateKey = date ? item.moment.date : 'undated';
      const dateGroups = groups.get(year)!;
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, { key: dateKey, date, items: [] });
      }
      dateGroups.get(dateKey)!.items.push(item);
    });

    return [...groups.entries()].map(([year, dateGroups]) => ({
      year,
      dateGroups: [...dateGroups.values()]
        .map((dateGroup) => ({
          ...dateGroup,
          items: [...dateGroup.items].sort((left, right) =>
            Number(Boolean(right.moment.pinned)) - Number(Boolean(left.moment.pinned)),
          ),
        }))
        .sort((left, right) => {
          const pinnedOrder =
            Number(right.items.some(({ moment }) => moment.pinned))
            - Number(left.items.some(({ moment }) => moment.pinned));
          return pinnedOrder || (right.date?.getTime() ?? 0) - (left.date?.getTime() ?? 0);
        }),
    }));
  }, [filtered, language]);

  const profileName = profile?.full_name || 'Silan Hu';
  const profileRole = profile?.title || (
    language === 'en'
      ? 'AI systems researcher and full-stack engineer'
      : 'AI 系统研究者与全栈工程师'
  );
  const avatarUrl = profile?.avatar_url
    ? mediaUrl(profile.avatar_url)
    : publicAssetUrl('/image.png');
  const coverUrl = mediaUrl('silan://resources/resume/assets/nus-computing-cover.png');

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
      className="min-h-screen w-full pb-12 sm:pb-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Seo
        title={copy.title}
        description={copy.description}
        path="/moments"
        lang={language as 'en' | 'zh'}
      />

      <MomentsProfileHero
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        name={profileName}
        role={profileRole}
        avatarUrl={avatarUrl}
        coverUrl={coverUrl}
        coverAlt={copy.coverAlt}
      />

      {loadState === 'loading' && (
        <div
          {...dsRoot}
          aria-label={language === 'en' ? 'Loading moments' : '正在加载动态'}
          className={cn(TIMELINE_CONTAINER_CLASS, 'divide-y divide-ds-border border-t border-ds-border')}
        >
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 py-7 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6">
              <Skeleton className="w-12" />
              <div className="grid gap-8 xl:grid-cols-2">
                {[0, 1].map((column) => (
                  <div key={column} className="space-y-3">
                    <Skeleton className="w-2/3" />
                    <Skeleton className="w-full" />
                    <Skeleton className="w-4/5" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loadState === 'ready' && filtered.length === 0 && (
        <div className={TIMELINE_CONTAINER_CLASS}>
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
        </div>
      )}

      {loadState === 'ready' && filtered.length > 0 && (
        <div className={cn(TIMELINE_CONTAINER_CLASS, 'space-y-14')}>
          {yearGroups.map((group) => (
            <section {...dsRoot} key={group.year} aria-labelledby={`year-${group.year}`}>
              <header className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-end gap-3 border-b border-ds-border pb-4 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6 sm:pb-5">
                <h2
                  id={`year-${group.year}`}
                  className="font-mono text-xl font-semibold leading-none tabular-nums tracking-[-0.06em] text-ds-fg sm:text-2xl lg:text-3xl"
                >
                  {group.year}
                </h2>
                <div aria-hidden />
              </header>

              <ol>
                {group.dateGroups.map((dateGroup) => {
                  const isMultiEntryDay = dateGroup.items.length > 1;
                  const day = dateGroup.date
                    ? String(dateGroup.date.getDate())
                    : dateGroup.items[0]?.moment.date;
                  const month = dateGroup.date
                    ? dateGroup.date.toLocaleDateString(
                      language === 'en' ? 'en-SG' : 'zh-CN',
                      { month: 'short' },
                    )
                    : '';
                  return (
                    <li
                      key={dateGroup.key}
                      className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-b border-ds-border sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6"
                    >
                      <div className="pt-7 sm:pt-8">
                        <time
                          dateTime={dateGroup.key}
                          className="block font-mono text-2xl font-medium leading-none tabular-nums tracking-[-0.06em] text-ds-fg sm:text-3xl"
                        >
                          {day}
                        </time>
                        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-ds-fg-subtle">
                          {month}
                        </span>
                      </div>

                      <div
                        className={cn(
                          'grid min-w-0 gap-x-8 xl:gap-x-10',
                          isMultiEntryDay && 'xl:grid-cols-2',
                        )}
                      >
                        {dateGroup.items.map(({ moment, kind: momentKind }, index) => {
                          const Icon = KIND_ICONS[momentKind];
                          const momentPath = `/moments/${encodeURIComponent(moment.slug || moment.id)}`;
                          const excerpt = markdownToPlainExcerpt(moment.description, moment.title);

                          return (
                            <motion.article
                              key={moment.id}
                              ref={(node) => {
                                if (node) momentElements.current.set(moment.id, node);
                                else momentElements.current.delete(moment.id);
                              }}
                              className={cn(
                                'min-w-0 scroll-mt-24 py-7 sm:py-8',
                                index > 0 && 'border-t border-ds-border',
                                isMultiEntryDay && index % 2 === 1 && 'xl:border-l xl:pl-10',
                                isMultiEntryDay && index === 1 && 'xl:border-t-0',
                              )}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.15) }}
                            >
                              <div className={cn('group', !isMultiEntryDay && 'max-w-[82ch]')}>
                                <Link
                                  to={momentPath}
                                  className="block rounded-ds-sm outline-none focus-visible:shadow-ds-focus"
                                >
                                  <span className="mb-2 inline-flex items-center gap-2 text-ds-xs text-ds-fg-subtle">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Icon className="size-3.5" aria-hidden />
                                      {kindLabel(momentKind)}
                                    </span>
                                    {moment.pinned && (
                                      <>
                                        <span aria-hidden>·</span>
                                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ds-primary">
                                          {language === 'en' ? 'Pin' : '置顶'}
                                        </span>
                                      </>
                                    )}
                                  </span>
                                  <div className="flex items-start gap-3">
                                    <h3 className="min-w-0 flex-1 text-balance text-ds-xl font-semibold leading-tight tracking-[-0.025em] text-ds-fg transition-colors group-hover:text-ds-primary sm:text-ds-2xl">
                                      {moment.title}
                                    </h3>
                                    <ArrowUpRight className="mt-1 size-4 shrink-0 text-ds-fg-subtle opacity-0 transition-[opacity,transform,color] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ds-primary group-hover:opacity-100" aria-hidden />
                                  </div>

                                  {excerpt && (
                                    <p
                                      className={cn(
                                        'mt-3 text-pretty text-ds-sm leading-6 text-ds-fg-muted sm:text-ds-base sm:leading-7',
                                        isMultiEntryDay ? 'line-clamp-3' : 'line-clamp-4',
                                      )}
                                    >
                                      {excerpt}
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
                                </Link>

                                {moment.related_outputs?.length > 0 && (
                                  <MomentRelatedOutputs
                                    outputs={moment.related_outputs}
                                    variant="feed"
                                    labels={{
                                      title: copy.outputs,
                                      kinds: copy.outputKinds,
                                    }}
                                    className="mt-5"
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
                                  timestampDisplay="hidden"
                                />
                              </div>
                            </motion.article>
                          );
                        })}
                      </div>
                    </li>
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
