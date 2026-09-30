import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  CalendarDays,
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import { fetchMoments } from '../api/moments/momentApi';
import { fetchPersonalInfo } from '../api/home/resumeApi';
import { mediaUrl } from '../api/utils';
import type { Moment, PersonalInfo } from '../types/api';
import MomentVideoPlayer from '../components/Moments/MomentVideoPlayer';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import MomentsProfileHero from '../components/Moments/MomentsProfileHero';
import { EDITORIAL_CONTENT_FRAME_CLASS } from '../layout/contentFrame';
import { usePageFilter, type PageFilterOption } from '../layout/PageTitleContext';
import {
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
} from '../components/ds';
import { markdownToPlainExcerpt } from '../lib/markdown';
import { firstMomentVideo } from '../lib/momentMedia';
import { cn } from '../lib/utils';
import { publicAssetUrl } from '../utils/publicAsset';
import { dsRoot } from '../components/ds/dsAttr';

const validDate = (value: string): Date | null => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

interface MomentDateGroup {
  key: string;
  date: Date | null;
  items: Moment[];
}

interface MomentYearGroup {
  year: string;
  dateGroups: MomentDateGroup[];
}

const MOMENT_ROW_CLASS =
  'grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 overflow-hidden rounded-ds-md bg-ds-surface-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4';

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
        title: 'Recent moments',
        description: 'A concise log of current research, projects, and milestones.',
        coverAlt: 'NUS School of Computing',
        errorTitle: 'Moments could not be loaded',
        errorBody: 'The content service did not respond. Try again without losing your filters.',
        emptyTitle: 'No moments in this view',
        emptyBody: 'Change the time filter to see other entries.',
        allTime: 'All time',
        related: 'Related',
      }
    : {
        title: '最新动态',
        description: '研究、项目与阶段成果的简洁时间线。',
        coverAlt: '新加坡国立大学计算机学院',
        errorTitle: '动态加载失败',
        errorBody: '内容服务暂未响应。重试不会丢失当前筛选。',
        emptyTitle: '当前筛选下没有动态',
        emptyBody: '更改时间筛选以查看其他内容。',
        allTime: '全部时间',
        related: '关联内容',
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
    () => moments.filter((moment) => {
      if (!selectedTime) return true;
      const date = validDate(moment.date);
      if (!date || date.getFullYear() !== selectedTime.year) return false;
      return selectedTime.month === undefined || date.getMonth() === selectedTime.month;
    }).sort((left, right) =>
      (validDate(right.date)?.getTime() ?? 0) - (validDate(left.date)?.getTime() ?? 0),
    ),
    [moments, selectedTime],
  );

  const yearGroups = useMemo<MomentYearGroup[]>(() => {
    const groups = new Map<string, Map<string, MomentDateGroup>>();
    filtered.forEach((moment) => {
      const date = validDate(moment.date);
      const year = date ? String(date.getFullYear()) : language === 'en' ? 'Undated' : '未标注日期';
      if (!groups.has(year)) {
        groups.set(year, new Map());
      }
      const dateKey = date ? moment.date : 'undated';
      const dateGroups = groups.get(year)!;
      if (!dateGroups.has(dateKey)) {
        dateGroups.set(dateKey, { key: dateKey, date, items: [] });
      }
      dateGroups.get(dateKey)!.items.push(moment);
    });

    return [...groups.entries()].map(([year, dateGroups]) => ({
      year,
      dateGroups: [...dateGroups.values()]
        .map((dateGroup) => ({
          ...dateGroup,
          items: [...dateGroup.items].sort((left, right) =>
            Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)),
          ),
        }))
        .sort((left, right) => {
          const pinnedOrder =
            Number(right.items.some((moment) => moment.pinned))
            - Number(left.items.some((moment) => moment.pinned));
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
      </>
    );
  }

  return (
    <motion.div
      className="min-h-screen w-full pb-20 sm:pb-14"
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
        name={profileName}
        role={profileRole}
        avatarUrl={avatarUrl}
        coverUrl={coverUrl}
        coverAlt={copy.coverAlt}
      />

      <div className="lg:-mx-8 lg:w-[calc(100%_+_4rem)]">
        {loadState === 'loading' && (
          <div
            {...dsRoot}
            aria-label={language === 'en' ? 'Loading moments' : '正在加载动态'}
            className={cn(EDITORIAL_CONTENT_FRAME_CLASS, 'space-y-1.5')}
          >
            {[0, 1, 2].map((item) => (
              <div key={item} className={cn(MOMENT_ROW_CLASS, 'px-3 py-3 sm:px-4')}>
                <Skeleton className="w-10" />
                <div className="grid gap-5 xl:grid-cols-2">
                  {[0, 1].map((column) => (
                    <div key={column} className="space-y-2">
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
          <div className={EDITORIAL_CONTENT_FRAME_CLASS}>
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
          <div className={cn(EDITORIAL_CONTENT_FRAME_CLASS, 'space-y-5 sm:space-y-7')}>
            {yearGroups.map((group) => (
              <section {...dsRoot} key={group.year} aria-labelledby={`year-${group.year}`}>
                <header className="mb-1.5 grid grid-cols-[3.25rem_minmax(0,1fr)] items-end gap-2 border-b border-ds-border pb-2.5 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4">
                  <h2
                    id={`year-${group.year}`}
                    className="font-mono text-2xl font-semibold leading-none tabular-nums tracking-[-0.055em] text-ds-fg sm:text-3xl lg:text-4xl"
                  >
                    {group.year}
                  </h2>
                  <div aria-hidden />
                </header>

                <ol className="space-y-1.5 sm:space-y-2">
                  {group.dateGroups.map((dateGroup) => {
                    const day = dateGroup.date
                      ? String(dateGroup.date.getDate())
                      : dateGroup.items[0]?.date;
                    const month = dateGroup.date
                      ? dateGroup.date.toLocaleDateString(
                        language === 'en' ? 'en-SG' : 'zh-CN',
                        { month: 'short' },
                      )
                      : '';
                    return (
                      <li
                        key={dateGroup.key}
                        className={MOMENT_ROW_CLASS}
                      >
                        <div className="px-3 pt-3.5 sm:pl-4 sm:pr-0">
                          <time
                            dateTime={dateGroup.key}
                            className="block font-mono text-xl font-medium leading-none tabular-nums tracking-[-0.04em] text-ds-fg sm:text-2xl"
                          >
                            {day}
                          </time>
                          <span className="mt-1 block font-mono text-ds-2xs uppercase tracking-[0.1em] text-ds-fg-subtle">
                            {month}
                          </span>
                        </div>

                        <div
                          className="flex min-w-0 flex-col"
                        >
                          {dateGroup.items.map((moment, index) => {
                            const momentPath = `/moments/${encodeURIComponent(moment.slug || moment.id)}`;
                            const video = firstMomentVideo(moment.description);
                            const excerpt = markdownToPlainExcerpt(moment.description, moment.title);

                            return (
                              <motion.article
                                key={moment.id}
                                ref={(node) => {
                                  if (node) momentElements.current.set(moment.id, node);
                                  else momentElements.current.delete(moment.id);
                                }}
                                className={cn(
                                  'min-w-0 scroll-mt-24 px-3 py-3 sm:px-4 sm:py-3.5',
                                  index > 0 && 'border-t border-ds-border',
                                )}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.15) }}
                              >
                                <div className={cn('group', video && 'grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
                                  {video && (
                                    <Link to={momentPath} aria-label={moment.title}
                                      className="block overflow-hidden rounded-ds-md outline-none focus-visible:shadow-ds-focus">
                                      <MomentVideoPlayer video={video} title={moment.title} preview />
                                    </Link>
                                  )}
                                  <div className="min-w-0">
                                  <Link
                                    to={momentPath}
                                    className="block rounded-ds-sm outline-none focus-visible:shadow-ds-focus"
                                  >
                                    {moment.pinned && (
                                      <span className="mb-2 block font-mono text-ds-2xs font-semibold uppercase tracking-[0.12em] text-ds-primary">
                                        {language === 'en' ? 'Pin' : '置顶'}
                                      </span>
                                    )}
                                    <div className="flex items-start gap-2.5">
                                      <h3 className="moment-feed-title line-clamp-2 min-w-0 flex-1 text-pretty text-ds-lg font-semibold leading-[1.28] tracking-[-0.018em] text-ds-fg transition-colors group-hover:text-ds-primary md:text-ds-xl">
                                        {moment.title}
                                      </h3>
                                      <ArrowUpRight className="mt-1 size-3.5 shrink-0 text-ds-fg-subtle opacity-0 transition-[opacity,transform,color] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ds-primary group-hover:opacity-100" aria-hidden />
                                    </div>

                                    {excerpt && (
                                      <p
                                        className={cn(
                                          'moment-feed-excerpt mt-1.5 line-clamp-3 text-pretty text-ds-sm leading-[1.5] text-ds-fg-muted md:text-ds-base',
                                        )}
                                      >
                                        {excerpt}
                                      </p>
                                    )}

                                    {moment.tags?.length > 0 && (
                                      <div className="mt-2 hidden flex-wrap gap-x-3 gap-y-1 sm:flex">
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
                                        title: copy.related,
                                      }}
                                      className="mt-2.5"
                                    />
                                  )}
                                  </div>
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
      </div>
    </motion.div>
  );
};

export default Moments;
