// BookNav — Yuque-aligned left rail.
//
// Layout reads top-down: a dedicated `Overview` row (book title), then a
// compact flat list of chapters. Active chapter uses the site theme color,
// but remains visually subordinate to the document title in the centre pane.
//
// No book-title banner, no sub-heading expansion. Sub-headings belong to
// the right-rail Outline, not here.
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Lightbulb } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface BookNavChapter {
  id: string;
  label: string;
  /** Optional small numeric / duration chip rendered before the label. */
  badge?: string;
  onClick?: () => void;
}

interface BookNavProps {
  /** Optional row pinned to the top — "Overview" / book cover. Acts as the
   *  book's intro page. Caller may pass a custom icon (e.g. Lightbulb for
   *  a Moment, FolderGit2 for a Project). */
  overview?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    isActive?: boolean;
  };
  chapters: BookNavChapter[];
  currentId: string;
}

const BookNav: React.FC<BookNavProps> = ({
  overview,
  chapters,
  currentId,
}) => {
  // Icon for the Overview row — caller-supplied or Lightbulb as a generic
  // Moment-flavoured default (matches the global Moment icon convention).
  const OverviewIcon = overview?.icon ?? Lightbulb;

  return (
    <div data-ds className="flex min-h-0 flex-1 flex-col bg-transparent">
      {/* Overview — compact series title row, aligned with article chrome. */}
      {overview && (
        <div className="shrink-0 mb-1 border-b border-ds-border pb-1">
          <button
            type="button"
            onClick={overview.onClick}
            aria-current={overview.isActive ? 'page' : undefined}
            className={cn(
              'flex w-full items-start gap-2 rounded-ds-sm px-2 py-1 text-left text-ds-sm leading-5',
              'transition-colors duration-ds-fast',
              overview.isActive
                ? 'font-semibold text-ds-primary'
                : 'font-semibold text-ds-fg hover:text-ds-primary',
            )}
          >
            <OverviewIcon
              size={18}
              className={cn(
                'mt-0.5 shrink-0',
                overview.isActive ? 'text-ds-primary' : 'text-ds-fg-muted',
              )}
              strokeWidth={1.8}
            />
            <span className="min-w-0 flex-1 break-words">{overview.label}</span>
          </button>
        </div>
      )}

      {/* Chapter list — flat and compact. Sub-headings belong to the right
          outline; the left rail is only for switching episodes. */}
      <nav className="min-h-0 flex-1 overflow-y-auto pb-2">
        <ul>
          {chapters.map((c) => {
            const episode = c.label.match(/^Episode\s+(\d+(?:\.\d+)*)\s*[-–—:]\s*(.+)$/i);
            const rawNumber = c.badge || episode?.[1];
            const number = rawNumber && /^\d+(?:\.\d+)*\.?$/.test(rawNumber)
              ? rawNumber.replace(/\.$/, '').split('.').map(Number).join('.') + (rawNumber.replace(/\.$/, '').includes('.') ? '' : '.')
              : rawNumber;
            const active = c.id === currentId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={c.onClick}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex w-full items-start gap-2 rounded-ds-sm px-2 py-1.5 text-left text-ds-sm leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary',
                    'transition-colors duration-ds-fast',
                    active
                      ? 'font-medium text-ds-primary'
                      : 'text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
                  )}
                >
                  {(episode || c.badge) && <span className="min-w-5 shrink-0 font-mono text-ds-xs tabular-nums leading-5 opacity-70">{number}</span>}
                  <span className="min-w-0 flex-1 break-words">{episode?.[2] || c.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

    </div>
  );
};

export default BookNav;
