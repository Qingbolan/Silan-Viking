// src/components/Resume/RecentSection.tsx
//
// Résumé "recent moments" panel — a year/month grouped activity timeline.
// The homepage and dedicated moments page share the same chronological model;
// filtering changes the entries, never the layout mode.
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Markdown from '../ui/Markdown';
import { Segmented, Badge } from '../../components/ds';
import type { SegmentedOption } from '../../components/ds';
import { withoutRepeatedTitle } from '../../lib/markdown';

export interface RecentItem {
  id: string;
  type: 'work' | 'education' | 'research' | 'publication' | 'project';
  title: string;
  description: string;
  date: string;
  tags: string[];
  status: 'active' | 'ongoing' | 'completed';
  priority: 'high' | 'medium' | 'low';
  pinned?: boolean;
}

interface RecentSectionProps {
  data: RecentItem[];
  title: string;
  delay?: number;
}

type NormalizedType = 'work' | 'education' | 'research' | 'publication' | 'project' | 'other';

/** Normalize free-form types to a known set. */
const normalizeType = (raw: string): NormalizedType => {
  const s = (raw || '').toLowerCase();
  if (['work', 'job', 'career'].includes(s)) return 'work';
  if (['education', 'school', 'study'].includes(s)) return 'education';
  if (['research', 'r&d', 'rd'].includes(s)) return 'research';
  if (['publication', 'paper', 'pub'].includes(s)) return 'publication';
  if (['project', 'projects', 'proj'].includes(s)) return 'project';
  return 'other';
};

const TYPE_ORDER: Array<Exclude<NormalizedType, 'other'>> = [
  'work', 'education', 'research', 'publication', 'project',
];

/** Status → Badge tone. */
const STATUS_TONE: Record<RecentItem['status'], 'success' | 'primary' | 'neutral'> = {
  active: 'success',
  ongoing: 'primary',
  completed: 'neutral',
};

const RecentSection: React.FC<RecentSectionProps> = ({ data, title, delay = 0 }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en';
  const [filter, setFilter] = useState<string>('all');
  const navigate = useNavigate();

  /* --- Relative time label. --------------------------------------------- */
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    const diffDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
    const formatter = new Intl.RelativeTimeFormat(
      locale,
      { numeric: 'auto' },
    );
    if (diffDays >= 365) return formatter.format(-Math.floor(diffDays / 365), 'year');
    if (diffDays >= 30) return formatter.format(-Math.floor(diffDays / 30), 'month');
    return formatter.format(-diffDays, 'day');
  };

  /* --- Priority dot. ----------------------------------------------------- */
  const priorityIcon = (priority: RecentItem['priority']) => {
    if (priority === 'high') return <Zap className="size-3 text-ds-error" />;
    if (priority === 'medium') return <Clock className="size-3 text-ds-warning" />;
    return <Eye className="size-3 text-ds-fg-subtle" />;
  };

  /* --- Normalize + derive the available type filters. ------------------- */
  const normalized = useMemo(
    () => data.map((item) => ({ ...item, _type: normalizeType(item.type) })),
    [data],
  );

  const typeOptions = useMemo<SegmentedOption[]>(() => {
    const counts: Record<string, number> = {};
    normalized.forEach((i) => { counts[i._type] = (counts[i._type] || 0) + 1; });
    const labelMap: Record<string, string> = {
      work: t('resume.work', { defaultValue: 'Work' }),
      education: t('resume.education', { defaultValue: 'Education' }),
      research: t('resume.research', { defaultValue: 'Research' }),
      publication: t('resume.publication', { defaultValue: 'Publication' }),
      project: t('resume.project', { defaultValue: 'Project' }),
    };
    return [
      { value: 'all', label: t('resume.all_types', { defaultValue: 'All Types' }) },
      ...TYPE_ORDER.filter((ty) => (counts[ty] || 0) > 0).map((ty) => ({
        value: ty,
        label: labelMap[ty] ?? ty,
      })),
    ];
  }, [normalized, t]);

  useEffect(() => {
    if (!typeOptions.some((o) => o.value === filter)) setFilter('all');
  }, [typeOptions, filter]);

  const filteredData = useMemo(() => {
    const source = filter === 'all'
      ? normalized
      : normalized.filter((item) => item._type === filter);
    return [...source].sort(
      (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
        || new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [normalized, filter]);

  const groupedData = useMemo(() => {
    const groups = new Map<string, {
      label: string;
      year: number;
      month: number;
      pinned: boolean;
      items: typeof filteredData;
    }>();
    filteredData.forEach((item) => {
      const date = new Date(item.date);
      const valid = !Number.isNaN(date.getTime());
      const year = valid ? date.getFullYear() : 0;
      const month = valid ? date.getMonth() : 0;
      const key = item.pinned
        ? 'pinned'
        : valid ? `${year}-${String(month + 1).padStart(2, '0')}` : 'unknown';
      const label = item.pinned
        ? locale.startsWith('zh') ? '置顶' : 'Pinned'
        : valid
        ? new Intl.DateTimeFormat(
            locale,
            { year: 'numeric', month: 'long' },
          ).format(date)
        : item.date;
      const group = groups.get(key) ?? {
        label,
        year,
        month,
        pinned: Boolean(item.pinned),
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    });
    return [...groups.values()].sort((a, b) =>
      Number(b.pinned) - Number(a.pinned)
      || b.year - a.year
      || b.month - a.month,
    );
  }, [filteredData, locale]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <div className="p-7">
          {/* Header — title + a primary-tone Segmented type filter. */}
          <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <h3 className="text-xl font-bold tracking-[-0.015em] text-ds-fg sm:text-2xl">
              {title}
            </h3>
            {typeOptions.length > 1 && (
              <Segmented
                value={filter}
                onChange={setFilter}
                options={typeOptions}
                size="sm"
                tone="primary"
              />
            )}
          </div>

          {/* Year/month groups with day-led entries, like a chronological journal. */}
          <div
            className="space-y-10"
            role="list"
            aria-label={t('resume.moments', { defaultValue: 'Recent moments' })}
          >
            {groupedData.map((group) => (
              <section key={`${group.year}-${group.month}`} aria-label={group.label}>
                <h4 className="mb-4 border-b border-ds-border pb-2 font-mono text-ds-xs font-medium uppercase tracking-[0.08em] text-ds-fg-subtle">
                  {group.label}
                </h4>
                <div className="divide-y divide-ds-border">
                  {group.items.map((item, index) => {
                    const date = new Date(item.date);
                    const day = Number.isNaN(date.getTime()) ? '—' : String(date.getDate()).padStart(2, '0');
                    return (
                      <motion.article
                        key={item.id}
                        role="link"
                        tabIndex={0}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.16) }}
                        onClick={() => navigate(`/moments?id=${encodeURIComponent(item.id)}`)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigate(`/moments?id=${encodeURIComponent(item.id)}`);
                          }
                        }}
                        aria-label={`${t('resume.view_details', { defaultValue: 'View details' })}: ${item.title}`}
                        className="group grid cursor-pointer grid-cols-[3rem_minmax(0,1fr)] gap-4 py-5 outline-none transition-colors hover:bg-ds-surface-2 focus-visible:shadow-ds-focus sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-6 sm:px-2"
                      >
                        <time
                          dateTime={item.date}
                          className="font-mono text-2xl font-medium tabular-nums text-ds-fg sm:text-3xl"
                        >
                          {day}
                        </time>
                        <div className="min-w-0">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex min-w-0 items-center gap-2">
                              {item.pinned && (
                                <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ds-primary">
                                  {locale.startsWith('zh') ? '置顶' : 'PIN'}
                                </span>
                              )}
                              {priorityIcon(item.priority)}
                              <h5 className="truncate text-ds-base font-semibold text-ds-fg transition-colors group-hover:text-ds-primary">
                                {item.title}
                              </h5>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Badge
                                tone={STATUS_TONE[item.status]}
                                appearance="soft"
                                size="sm"
                                dot
                                className="border-0"
                              >
                                {t(`resume.status.${item.status}`)}
                              </Badge>
                              <span className="whitespace-nowrap text-ds-xs text-ds-fg-subtle">
                                {getRelativeTime(item.date)}
                              </span>
                            </div>
                          </div>
                          {item.description && (
                            <Markdown className="mt-2 line-clamp-2 text-ds-sm leading-6 text-ds-fg-muted">
                              {withoutRepeatedTitle(item.description, item.title)}
                            </Markdown>
                          )}
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
      </div>
    </motion.section>
  );
};

export default RecentSection;
