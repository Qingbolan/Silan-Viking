// BookNav — Yuque-aligned left rail.
//
// Layout reads top-down: a search input (with ⌘+J hint), a dedicated
// `Overview` row (home icon, the book's intro page), and a `ToC` header
// followed by a flat list of chapters. Active chapter is a tonal-grey
// pill with bold black text — never primary-orange (matches the user's
// Yuque reference).
//
// No book-title banner, no sub-heading expansion. Sub-headings belong to
// the right-rail Outline, not here.
import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Search, Lightbulb } from 'lucide-react';
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
   *  an Idea, FolderGit2 for a Project). */
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
  const [search, setSearch] = useState('');

  const filtered = search
    ? chapters.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()))
    : chapters;

  // Icon for the Overview row — caller-supplied or Lightbulb as a generic
  // Idea-flavoured default (matches the global Idea icon convention used in
  // IdeaPage.tsx and CommunityFeedback.tsx).
  const OverviewIcon = overview?.icon ?? Lightbulb;

  return (
    <div className="flex h-full flex-col bg-ds-surface-1">
      {/* Overview — book title row, pinned top, no separator above */}
      {overview && (
        <div className="px-2 pt-4">
          <button
            type="button"
            onClick={overview.onClick}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[15px]',
              'transition-colors duration-150',
              overview.isActive
                ? 'bg-ds-surface-2 font-semibold text-ds-fg'
                : 'text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
            )}
          >
            <OverviewIcon size={17} className="shrink-0" strokeWidth={1.7} />
            <span className="min-w-0 flex-1 truncate">{overview.label}</span>
          </button>
        </div>
      )}

      {/* Search — square (not pill), tonal grey, ⌘+J kbd hint on the right.
          Sits under Overview (the book title) — like Yuque's nav. */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-fg-subtle"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className={cn(
              'h-9 w-full rounded-md pl-9 pr-16 text-[14px]',
              'bg-ds-surface-2 text-ds-fg placeholder:text-ds-fg-subtle',
              'border border-transparent focus:border-ds-primary/40',
              'focus:outline-none',
            )}
          />
          <kbd
            className={cn(
              'absolute right-2.5 top-1/2 -translate-y-1/2',
              'pointer-events-none select-none',
              'text-[12px] text-ds-fg-subtle font-sans',
            )}
            aria-hidden
          >
            ⌘ + J
          </kbd>
        </div>
      </div>

      {/* Chapter list — flat, no badges, no sub-tree expansion. Active row
          is a tonal-grey pill with bold black text (Yuque-style). */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <ul className="space-y-px">
          {filtered.map((c) => {
            const active = c.id === currentId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={c.onClick}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-8 py-2 text-left text-[15px]',
                    'transition-colors duration-150',
                    active
                      ? 'bg-ds-surface-2 font-semibold text-ds-fg'
                      : 'text-ds-fg-muted hover:bg-ds-surface-2 hover:text-ds-fg',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
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
