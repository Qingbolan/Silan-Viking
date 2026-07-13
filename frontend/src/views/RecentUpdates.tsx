import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  CalendarDays,
  FileText,
  FolderGit2,
  GraduationCap,
  Lightbulb,
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { Seo } from '../components/Seo';
import { fetchUpdates } from '../api/updates/updateApi';
import type { RecentUpdate } from '../types/api';
import Markdown from '../components/ui/Markdown';
import { usePageFilter, type PageFilterOption } from '../layout/PageTitleContext';
import {
  Alert,
  Badge,
  BlogHeader,
  Button,
  EmptyState,
  Skeleton,
  type BadgeProps,
} from '../components/ds';

type UpdateKind = 'work' | 'education' | 'research' | 'publication' | 'project' | 'other';

const KIND_ORDER: UpdateKind[] = ['project', 'research', 'publication', 'work', 'education', 'other'];

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

const RecentUpdates: React.FC = () => {
  const { language } = useLanguage();
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [kind, setKind] = useState<'all' | UpdateKind>('all');
  const [selectedTime, setSelectedTime] = useState<{ year: number; month?: number } | null>(null);

  const copy = language === 'en'
    ? {
        eyebrow: 'Now',
        title: 'Recent updates',
        description: 'A concise log of current research, projects, and milestones.',
        type: 'Type',
        all: 'All',
        errorTitle: 'Updates could not be loaded',
        errorBody: 'The content service did not respond. Try again without losing your filters.',
        retry: 'Try again',
        emptyTitle: 'No updates in this view',
        emptyBody: 'Change the type or time filter to see other entries.',
        allTime: 'All time',
        priorities: { high: 'High priority', medium: 'Medium priority', low: 'Low priority' },
      }
    : {
        eyebrow: '近况',
        title: '最新动态',
        description: '研究、项目与阶段成果的简洁时间线。',
        type: '类型',
        all: '全部',
        errorTitle: '动态加载失败',
        errorBody: '内容服务暂未响应。重试不会丢失当前筛选。',
        retry: '重试',
        emptyTitle: '当前筛选下没有动态',
        emptyBody: '更改类型或时间筛选以查看其他内容。',
        allTime: '全部时间',
        priorities: { high: '高优先级', medium: '中优先级', low: '低优先级' },
      };

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      setUpdates(await fetchUpdates(language as 'en' | 'zh'));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const normalized = useMemo(
    () => updates.map((update) => ({ update, kind: normalizeKind(update.type) })),
    [updates],
  );

  const availableKinds = useMemo(() => {
    const present = new Set(normalized.map((item) => item.kind));
    return KIND_ORDER.filter((item) => present.has(item));
  }, [normalized]);

  useEffect(() => {
    if (kind !== 'all' && !availableKinds.includes(kind)) setKind('all');
  }, [availableKinds, kind]);

  const monthNames = useMemo(
    () =>
      language === 'en'
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    [language],
  );

  const timelineOptions = useMemo<PageFilterOption[]>(() => {
    const timeline = new Map<number, Map<number, number>>();
    updates.forEach((update) => {
      const date = validDate(update.date);
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
  }, [updates, monthNames]);

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
    () => normalized.filter(({ update, kind: updateKind }) => {
      if (kind !== 'all' && updateKind !== kind) return false;
      if (!selectedTime) return true;
      const date = validDate(update.date);
      if (!date || date.getFullYear() !== selectedTime.year) return false;
      return selectedTime.month === undefined || date.getMonth() === selectedTime.month;
    }),
    [normalized, kind, selectedTime],
  );

  const kindLabel = (value: UpdateKind | 'all') => {
    if (value === 'all') return copy.all;
    const labels = language === 'en'
      ? { work: 'Work', education: 'Education', research: 'Research', publication: 'Publication', project: 'Project', other: 'Other' }
      : { work: '工作', education: '教育', research: '研究', publication: '论文', project: '项目', other: '其他' };
    return labels[value];
  };

  const typeOptions = ['all', ...availableKinds].map((value) => ({
    value,
    label: kindLabel(value as UpdateKind | 'all'),
  }));

  return (
    <motion.div
      className="mx-auto min-h-screen max-w-5xl px-4 py-12 sm:px-8 sm:py-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <Seo
        title={copy.title}
        description={copy.description}
        path="/recent-updates"
        lang={language as 'en' | 'zh'}
      />

      <BlogHeader
        className="mb-10"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        typeOptions={typeOptions}
        selectedType={kind}
        onTypeChange={(value) => setKind(value as 'all' | UpdateKind)}
        typeLabel={copy.type}
      />

      {loadState === 'loading' && (
        <div aria-label={language === 'en' ? 'Loading updates' : '正在加载动态'} className="space-y-0 divide-y divide-ds-border">
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

      {loadState === 'error' && (
        <Alert tone="error" title={copy.errorTitle}>
          <p>{copy.errorBody}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void load()}>
            {copy.retry}
          </Button>
        </Alert>
      )}

      {loadState === 'ready' && filtered.length === 0 && (
        <EmptyState
          icon={<CalendarDays />}
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={(kind !== 'all' || selectedTime) ? (
            <Button variant="outline" size="sm" onClick={() => { setKind('all'); setSelectedTime(null); }}>
              {copy.all}
            </Button>
          ) : undefined}
        />
      )}

      {loadState === 'ready' && filtered.length > 0 && (
        <ol className="divide-y divide-ds-border border-y border-ds-border">
          {filtered.map(({ update, kind: updateKind }, index) => {
            const Icon = KIND_ICONS[updateKind];
            const date = validDate(update.date);
            const exactDate = date?.toLocaleDateString(language === 'en' ? 'en-SG' : 'zh-CN', {
              year: 'numeric', month: 'short', day: 'numeric',
            }) ?? update.date;
            return (
              <motion.li
                key={update.id}
                className="grid grid-cols-1 gap-4 py-7 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-7 sm:py-9"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(index * 0.05, 0.2) }}
              >
                <div className="flex items-center gap-2 text-ds-xs text-ds-fg-subtle sm:block">
                  <time dateTime={update.date} className="font-mono tabular-nums">{exactDate}</time>
                  <span className="sm:mt-3 sm:flex sm:items-center sm:gap-1.5">
                    <Icon className="size-3.5" aria-hidden />
                    <span>{kindLabel(updateKind)}</span>
                  </span>
                </div>

                <article className="min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <h2 className="text-balance text-ds-xl font-semibold leading-tight tracking-[-0.02em] text-ds-fg sm:text-ds-2xl">
                      {update.title}
                    </h2>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {update.status && (
                        <Badge tone={statusTone(update.status)} appearance="soft" dot>
                          {update.status}
                        </Badge>
                      )}
                      {update.priority && (
                        <Badge tone={priorityTone(update.priority)} appearance="outline">
                          {copy.priorities[update.priority as keyof typeof copy.priorities] ?? update.priority}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Markdown className="mt-4 text-ds-base leading-7 text-ds-fg-muted">
                    {update.description}
                  </Markdown>

                  {update.tags?.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-x-3 gap-y-1.5">
                      {update.tags.map((tag) => (
                        <span key={tag} className="font-mono text-ds-xs text-ds-fg-subtle">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              </motion.li>
            );
          })}
        </ol>
      )}
    </motion.div>
  );
};

export default RecentUpdates;
