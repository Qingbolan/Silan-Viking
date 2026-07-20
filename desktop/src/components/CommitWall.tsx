import React from 'react';
import type { DeploymentPlan, VersionScope } from '../types';

const WEEKS = 53;
const DAY_MS = 86_400_000;
const scopeLabels: Record<VersionScope, string> = {
  resume: 'Resume',
  blog: 'Blog',
  project: 'Projects',
  idea: 'Legacy',
  moment: 'Moments',
};

type CommitWallProps = {
  activity: DeploymentPlan['commit_activity'];
  selectedDate?: string | null;
  onSelect?: (date: string, scopes: VersionScope[]) => void;
};

type TrafficWallProps = {
  activity: Array<{ date: string; visits: number }>;
  noun?: string;
  selectedDate?: string | null;
  onSelect?: (date: string) => void;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const singaporeTodayUtc = () => {
  const singaporeDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return new Date(`${singaporeDate}T00:00:00Z`);
};

const startOfUtcWeek = (date: Date) => (
  new Date(date.getTime() - date.getUTCDay() * DAY_MS)
);

const formatDate = (value: string) => new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${value}T00:00:00Z`));

export function CommitWall({ activity, selectedDate, onSelect }: CommitWallProps) {
  const days = activity.map((day) => ({
    date: day.date,
    count: day.commit_count,
    detail: day.scopes.map((scope) => scopeLabels[scope]).join(', '),
  }));
  return <TileWall activity={days} noun="content commit" selectedDate={selectedDate} onSelect={(date) => {
    const scopes = activity.find((day) => day.date === date)?.scopes ?? [];
    onSelect?.(date, scopes);
  }} />;
}

export function TrafficWall({ activity, noun = 'human visit', selectedDate, onSelect }: TrafficWallProps) {
  return (
    <TileWall
      activity={activity.map((day) => ({ date: day.date, count: day.visits }))}
      noun={noun}
      selectedDate={selectedDate}
      onSelect={onSelect}
    />
  );
}

function TileWall({ activity, noun, selectedDate, onSelect }: {
  activity: Array<{ date: string; count: number; detail?: string }>;
  noun: string;
  selectedDate?: string | null;
  onSelect?: (date: string) => void;
}) {
  const activityByDate = React.useMemo(
    () => new Map(activity.map((day) => [day.date, day])),
    [activity],
  );
  const days = React.useMemo(() => {
    const today = singaporeTodayUtc();
    const currentWeekStart = startOfUtcWeek(today);
    const start = new Date(currentWeekStart.getTime() - (WEEKS - 1) * 7 * DAY_MS);
    const visibleDayCount = Math.floor((today.getTime() - start.getTime()) / DAY_MS) + 1;
    return Array.from({ length: visibleDayCount }, (_, index) => {
      const date = isoDate(new Date(start.getTime() + index * DAY_MS));
      return { date, activity: activityByDate.get(date) };
    });
  }, [activityByDate]);
  const total = days.reduce((sum, day) => sum + (day.activity?.count ?? 0), 0);
  const weekCount = Math.ceil(days.length / 7);
  const monthLabels = Array.from({ length: weekCount }, (_, week) => {
    const date = new Date(`${days[week * 7].date}T00:00:00Z`);
    const previous = week > 0 ? new Date(`${days[(week - 1) * 7].date}T00:00:00Z`) : null;
    return !previous || previous.getUTCMonth() !== date.getUTCMonth()
      ? date.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
      : '';
  });

  return (
    <section className="commit-wall" aria-label={`${total} ${noun}s in the past year`}>
      <div className="commit-wall-head">
        <div>
          <strong>{total} {noun}{total === 1 ? '' : 's'}</strong>
          <span>in the past year</span>
        </div>
        <div className="commit-wall-legend" aria-label="Commit intensity">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}
          <span>More</span>
        </div>
      </div>
      <div className="commit-wall-scroll">
        <div className="commit-wall-chart">
          <div className="commit-wall-months" aria-hidden="true">
            {monthLabels.map((month, index) => <span key={`${month}-${index}`}>{month}</span>)}
          </div>
          <div className="commit-wall-days" aria-hidden="true">
            <span>Mon</span><span>Wed</span><span>Fri</span>
          </div>
          <div className="commit-wall-grid">
            {days.map(({ date, activity: day }) => {
              const count = day?.count ?? 0;
              const level = count === 0 ? 0 : Math.min(4, count);
              const detail = day?.detail;
              const label = count === 0
                ? `No ${noun}s on ${formatDate(date)}`
                : `${count} ${noun}${count === 1 ? '' : 's'} on ${formatDate(date)}${detail ? ` · ${detail}` : ''}`;
              return (
                <button
                  type="button"
                  className="commit-wall-cell"
                  data-level={level}
                  data-selected={selectedDate === date ? 'true' : undefined}
                  key={date}
                  title={label}
                  aria-label={label}
                  onClick={() => count > 0 && onSelect?.(date)}
                  disabled={count === 0 || !onSelect}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
