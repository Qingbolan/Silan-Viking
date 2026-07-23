// src/components/ds/BlogHeader.tsx
//
// Design-system BlogHeader — the page intro + filter bar for a content
// index (the Blog / writing landing page). It is a PAGE-LEVEL block, not a
// card: depth comes from grouping and hairline rules, not a surface.
//
// Three stacked groups:
//   1. Hero      — eyebrow + title + standfirst, centered.
//   2. Tools     — a search field beside the content-type Segmented.
//   3. Topics    — a wrap of topic-tag chips; the active chip is NUS-orange.
//
// Self-contained: takes plain string arrays, decoupled from BlogData. The
// parent owns all filter state and passes values + change handlers down.
import React from 'react';
import { Search, LayoutGrid, Tag as TagIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Input } from './Input';
import { Segmented, type SegmentedOption } from './DataDisplay';

export interface BlogHeaderProps {
  /** Small overline above the title. Defaults to "Writing". */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Standfirst paragraph under the title. */
  description?: React.ReactNode;
  /**
   * Extra content rendered directly under the hero (title + description)
   * and above the search / filter toolbar — e.g. a context strip.
   */
  afterHero?: React.ReactNode;

  /* --- Search (optional — omit for a hero-only header) --- */
  search?: string;
  onSearchChange?: (_value: string) => void;
  searchPlaceholder?: string;

  /* --- Content-type Segmented (optional) --- */
  /** Segmented options; an `icon` per option is honoured. */
  typeOptions?: SegmentedOption[];
  selectedType?: string;
  onTypeChange?: (_value: string) => void;
  /** Label before the Segmented. Defaults to "Type". */
  typeLabel?: React.ReactNode;

  /* --- Topic-tag chips --- */
  /** All topic tags. The first item is treated as the "all" reset chip. */
  tags?: string[];
  selectedTag?: string;
  onTagChange?: (_tag: string) => void;
  /** Label before the tag row. Defaults to "Topics". */
  tagLabel?: React.ReactNode;
  /** Map a tag value to its display label (e.g. 'all' → 'All'). */
  formatTag?: (_tag: string) => string;

  className?: string;
}

/** One topic chip — soft NUS-orange when active, hairline pill otherwise. */
const TagChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    {...dsRoot}
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      'max-w-full min-w-0 rounded-full border px-3 py-1 text-ds-xs font-medium',
      'transition-colors duration-ds-fast ease-ds-standard outline-none',
      'focus-visible:shadow-ds-focus',
      active
        ? 'border-ds-primary/30 bg-ds-primary-soft text-ds-primary'
        : 'border-ds-border bg-ds-surface-1 text-ds-fg-muted hover:border-ds-fg-subtle hover:text-ds-fg',
    )}
  >
    <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
      {label}
    </span>
  </button>
);

/** Inline label for a filter row. */
const FilterLabel: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="inline-flex shrink-0 items-center gap-1.5 text-ds-xs font-medium text-ds-fg-subtle [&_svg]:size-3.5">
    {icon}
    {children}
  </span>
);

export const BlogHeader: React.FC<BlogHeaderProps> = ({
  eyebrow = 'Writing',
  title,
  description,
  afterHero,
  search,
  onSearchChange,
  searchPlaceholder = 'Search articles…',
  typeOptions,
  selectedType,
  onTypeChange,
  typeLabel = 'Type',
  tags,
  selectedTag,
  onTagChange,
  tagLabel = 'Topics',
  formatTag,
  className,
}) => {
  // The toolbar groups are independently optional — a header with only a
  // title (e.g. a contact page) renders the hero alone.
  const showSearch = typeof onSearchChange === 'function';
  const showSegmented = !!typeOptions && typeOptions.length > 0;
  const showTags = !!tags && tags.length > 0 && typeof onTagChange === 'function';

  return (
    <header {...dsRoot} className={cn('w-full max-w-full min-w-0 overflow-hidden', className)}>
      {/* Group 1 — hero. Centered, the title is the sole focal point. */}
      <div className="mx-auto max-w-2xl min-w-0 text-center">
        {eyebrow && (
          <div className="mb-2 text-ds-xs font-medium uppercase tracking-[0.14em] text-ds-primary">
            {eyebrow}
          </div>
        )}
        <h1 className="text-4xl font-bold leading-[1.05] tracking-[-0.025em] text-ds-fg sm:text-5xl md:text-6xl">
          {title}
        </h1>
        {description && (
          <p className="mx-auto mt-4 max-w-xl text-base leading-[1.6] text-ds-fg-muted sm:text-lg">
            {description}
          </p>
        )}
      </div>

      {/* Optional context strip — between the hero and the toolbar. */}
      {afterHero && <div className="mt-6 min-w-0 max-w-full">{afterHero}</div>}

      {/* Group 2 — tools: search + content-type + topic chips. The whole
          toolbar is omitted for a hero-only header (no search, no filters). */}
      {(showSearch || showSegmented || showTags) && (
        <div className="mt-8 min-w-0 max-w-full border-t border-ds-border pt-5 sm:mt-10">
          {(showSearch || showSegmented) && (
            <div className="flex min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {showSearch && (
                <div className="w-full min-w-0 sm:max-w-xs">
                  <Input
                    leadingIcon={<Search />}
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => onSearchChange?.(e.target.value)}
                    aria-label={searchPlaceholder}
                  />
                </div>
              )}
              {showSegmented && (
                <div className="flex w-full min-w-0 flex-col items-start gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-2.5">
                  <FilterLabel icon={<LayoutGrid />}>{typeLabel}</FilterLabel>
                  <Segmented
                    className="w-full sm:w-auto"
                    tone="primary"
                    value={selectedType ?? ''}
                    onChange={(v) => onTypeChange?.(v)}
                    options={typeOptions ?? []}
                  />
                </div>
              )}
            </div>
          )}

          {/* Group 3 — topic chips. */}
          {showTags && (
            <div className="mt-4 grid min-w-0 max-w-full gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-2">
              <FilterLabel icon={<TagIcon />}>{tagLabel}</FilterLabel>
              <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:contents">
                {tags!.map((tag) => (
                  <TagChip
                    key={tag}
                    label={formatTag ? formatTag(tag) : tag}
                    active={tag === selectedTag}
                    onClick={() => onTagChange!(tag)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
