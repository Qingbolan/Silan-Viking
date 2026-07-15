// src/components/ds/IdeaCard.tsx
//
// Design-system IdeaCard — a dashed-outline "pinboard" card for research
// ideas (no cover; an idea is text-led). The title is the clear focal
// point; status, category, links and date are quiet supporting metadata.
import React from 'react';
import { ArrowUpRight, FileText, FolderGit2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Badge } from './Badge';

/** The research lifecycle, in order. */
export type IdeaStatus =
  | 'draft'
  | 'hypothesis'
  | 'experimenting'
  | 'validating'
  | 'published'
  | 'concluded';

/** Card width / layout. `feature` is a wide horizontal card. */
export type IdeaCardSize = 'compact' | 'standard' | 'feature';

export interface IdeaCardData {
  id: string;
  title: string;
  description?: string;
  /** Research stage — drives the status marker. */
  status: IdeaStatus;
  /** Topic / field category. */
  category?: string;
  tags?: string[];
  /** Created or last-updated date — any displayable string. */
  date?: string;
  /** Number of blog posts this idea has produced. */
  linkedBlogs?: number;
  /** Number of projects this idea is linked to. */
  linkedProjects?: number;
}

export interface IdeaCardProps {
  idea: IdeaCardData;
  onOpen?: (_id: string) => void;
  maxTags?: number;
  /** Card width / layout. Default `standard`. */
  size?: IdeaCardSize;
  className?: string;
}

/** Per-status label + dot colour token. */
const STATUS_META: Record<IdeaStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--ds-color-fg-subtle, var(--color-textTertiary))' },
  hypothesis: { label: 'Hypothesis', color: 'var(--ds-color-primary)' },
  experimenting: { label: 'Experimenting', color: 'var(--ds-color-warning)' },
  validating: { label: 'Validating', color: 'var(--ds-color-warning)' },
  published: { label: 'Published', color: 'var(--ds-color-success)' },
  concluded: { label: 'Concluded', color: 'var(--ds-color-success)' },
};

/**
 * An idea is an inspiration note — light and informal. The card is a
 * dashed-outline pinboard card (à la a sticky note): no cover, no icon,
 * a quiet dashed border that turns solid + tinted on hover.
 */
export const IdeaCard: React.FC<IdeaCardProps> = ({
  idea,
  onOpen,
  maxTags = 4,
  size = 'standard',
  className,
}) => {
  const {
    id, title, description, status, category, tags = [], date,
    linkedBlogs = 0, linkedProjects = 0,
  } = idea;
  const meta = STATUS_META[status];
  const shownTags = tags.slice(0, maxTags);
  const overflow = tags.length - shownTags.length;
  const isFeature = size === 'feature';
  const hasLinks = linkedBlogs > 0 || linkedProjects > 0;

  /* --- Eyebrow: status + category — quiet supporting metadata. ----------- */
  const eyebrow = (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-ds-2xs font-medium uppercase tracking-[0.07em] text-ds-fg-muted">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: meta.color }}
        />
        {meta.label}
      </span>
      {category && (
        <>
          <span className="text-ds-2xs text-ds-border-strong">·</span>
          <span className="truncate text-ds-2xs uppercase tracking-[0.07em] text-ds-fg-subtle">
            {category}
          </span>
        </>
      )}
      <ArrowUpRight className="ml-auto size-4 shrink-0 text-ds-fg-subtle opacity-0 transition-opacity duration-ds-fast group-hover:opacity-100" />
    </div>
  );

  /* --- Title — the focal point: large + bold. ---------------------------- */
  const heading = (
    <h3
      className={cn(
        'font-semibold tracking-[-0.015em] text-ds-fg',
        // The title clearly leads — larger than body, tight leading.
        isFeature ? 'line-clamp-2 text-ds-2xl leading-[1.2]' : 'line-clamp-2 text-ds-lg leading-snug',
      )}
    >
      {title}
    </h3>
  );

  /* --- Description — secondary, muted. ----------------------------------- */
  const desc = description && (
    <p
      className={cn(
        'leading-relaxed text-ds-fg-muted',
        isFeature ? 'line-clamp-3 text-ds-sm' : 'line-clamp-2 text-ds-xs',
      )}
    >
      {description}
    </p>
  );

  /* --- Footer — tags, linked-content counts, date. ----------------------- */
  const footer = (shownTags.length > 0 || hasLinks || date) && (
    <div className="mt-auto flex flex-col gap-2 pt-1">
      {shownTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shownTags.map((tag) => (
            <Badge key={tag} tone="neutral" appearance="soft" size="sm">
              {tag}
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge tone="primary" appearance="soft" size="sm">
              +{overflow}
            </Badge>
          )}
        </div>
      )}
      {(hasLinks || date) && (
        <div className="flex items-center justify-between gap-3 text-ds-2xs text-ds-fg-subtle">
          {/* Linked blogs / projects produced from this idea. */}
          <div className="flex items-center gap-3">
            {linkedBlogs > 0 && (
              <span className="inline-flex items-center gap-1" title={`${linkedBlogs} linked posts`}>
                <FileText className="size-3" />
                {linkedBlogs}
              </span>
            )}
            {linkedProjects > 0 && (
              <span className="inline-flex items-center gap-1" title={`${linkedProjects} linked projects`}>
                <FolderGit2 className="size-3" />
                {linkedProjects}
              </span>
            )}
          </div>
          {date && <span className="shrink-0 whitespace-nowrap">{date}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div
      {...dsRoot}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(id);
        }
      }}
      className={cn(
        'group flex cursor-pointer rounded-ds-lg',
        // Dashed pinboard outline — quiet by default; firms to a solid
        // primary edge + a faint lift on hover.
        'border border-dashed border-ds-border-strong bg-ds-surface-1',
        'transition-[border-color,background-color,transform,box-shadow]',
        'duration-ds-normal ease-ds-emphasized',
        'hover:-translate-y-0.5 hover:border-solid hover:border-ds-primary hover:shadow-ds-2',
        'outline-none focus-visible:shadow-ds-focus',
        // `h-full` fills the grid cell so a row of idea cards stays even
        // (grid stretch + body flex-1); content is never clipped.
        // feature → wide horizontal; others → vertical.
        isFeature ? 'h-56 flex-row items-stretch' : 'h-full flex-col',
        className,
      )}
    >
      {isFeature ? (
        <>
          {/* Left: the title block leads. */}
          <div className="flex w-[44%] shrink-0 flex-col gap-2.5 overflow-hidden border-r border-dashed border-ds-border p-6">
            {eyebrow}
            {heading}
            {footer}
          </div>
          {/* Right: the elaboration. */}
          <div className="flex flex-1 flex-col justify-center p-6">{desc}</div>
        </>
      ) : (
        <div className="flex flex-1 flex-col gap-2.5 p-4">
          {eyebrow}
          {heading}
          {desc}
          {footer}
        </div>
      )}
    </div>
  );
};
