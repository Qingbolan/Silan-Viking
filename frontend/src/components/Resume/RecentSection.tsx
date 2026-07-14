// src/components/Resume/RecentSection.tsx
//
// Résumé "recent updates" panel — a ds-styled timeline of the latest
// work / research / publication entries. A primary-tone Segmented filters
// by type; each entry is a quiet
// hairline list-row with a Badge status marker. A height-clipped list
// fades into a ds Button CTA when there is more than fits.
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Zap, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Markdown from '../ui/Markdown';
import { Segmented, Badge, Button } from '../../components/ds';
import type { SegmentedOption } from '../../components/ds';

export interface RecentItem {
  id: string;
  type: 'work' | 'education' | 'research' | 'publication' | 'project';
  title: string;
  description: string;
  date: string;
  tags: string[];
  status: 'active' | 'ongoing' | 'completed';
  priority: 'high' | 'medium' | 'low';
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
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const navigate = useNavigate();

  /* --- Relative time label. --------------------------------------------- */
  const getRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const diffDays = Math.floor(
      Math.abs(Date.now() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    if (diffYears > 0) return t('resume.years_ago', { years: diffYears });
    if (diffMonths > 0) return t('resume.months_ago', { months: diffMonths });
    return t('resume.days_ago', { days: diffDays });
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
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [normalized, filter]);

  /* --- Detect whether the list is visually height-clipped. -------------- */
  useEffect(() => {
    const check = () => {
      const el = listRef.current;
      if (!el) return;
      setIsTruncated(el.scrollHeight > el.clientHeight + 2);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [filteredData]);

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

          {/* Clipped list of recent entries. */}
          <div
            className="relative"
            role="list"
            aria-label={t('resume.recent_updates', { defaultValue: 'Recent updates' })}
          >
            <div
              ref={listRef}
              className="max-h-72 space-y-2 overflow-hidden sm:max-h-80 lg:max-h-96"
            >
              {filteredData.map((item, index) => (
                <motion.div
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() =>
                    navigate(`/recent-updates?id=${encodeURIComponent(item.id)}`)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/recent-updates?id=${encodeURIComponent(item.id)}`);
                    }
                  }}
                  aria-label={`${t('resume.view_details', { defaultValue: 'View details' })}: ${item.title}`}
                  className={[
                    'group flex w-full cursor-pointer items-center gap-3 rounded-ds-md px-3 py-2',
                    'transition-colors',
                    'duration-ds-fast ease-ds-standard',
                    'hover:bg-ds-surface-2',
                    'outline-none focus-visible:shadow-ds-focus',
                  ].join(' ')}
                >
                  {/* Single-row layout (silan, 2026-05-22): title • inline
                      description (truncated) • status • relative time.
                      Tags + priority dropped from the row view — they
                      stayed in the detail view. */}
                  {priorityIcon(item.priority)}

                  <h4 className="shrink-0 text-ds-sm font-semibold text-ds-fg transition-colors duration-ds-fast group-hover:text-ds-primary">
                    {item.title}
                  </h4>

                  {item.description && (
                    <Markdown
                      className={[
                        'min-w-0 flex-1 truncate text-ds-sm text-ds-fg-muted',
                        // Kill markdown's default block wrappers so the
                        // description renders inline on a single row.
                        '[&_p]:m-0 [&_p]:inline [&_div]:m-0 [&_div]:inline',
                      ].join(' ')}
                    >
                      {item.description}
                    </Markdown>
                  )}

                  <Badge
                    tone={STATUS_TONE[item.status]}
                    appearance="soft"
                    size="sm"
                    dot
                    className="shrink-0 border-0"
                  >
                    {t(`resume.status.${item.status}`)}
                  </Badge>

                  <span className="shrink-0 whitespace-nowrap text-ds-xs text-ds-fg-subtle">
                    {getRelativeTime(item.date)}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Fade overlay + CTA when the list is clipped. */}
            {isTruncated && (
              <>
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-ds-bg"
                />
                <div className="absolute inset-x-0 bottom-2 flex justify-center">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => navigate('/recent-updates')}
                  >
                    {t('resume.view_all', { defaultValue: 'Show More' })}
                  </Button>
                </div>
              </>
            )}
          </div>
      </div>
    </motion.section>
  );
};

export default RecentSection;
