// src/components/ds/BlogCard.tsx
//
// Design-system BlogCard — a content card for the blog stack. Mirrors
// ProjectCard's cover system (sizes, branded placeholder, feature layout)
// but carries blog metadata: date, author, read time, article/series kind.
import React from 'react';
import { Calendar, User, FileText, Layers, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';
import { Badge } from './Badge';

export type BlogCoverSize = 'compact' | 'standard' | 'tall' | 'feature';

export interface BlogCardData {
  id: string;
  title: string;
  /** Short summary / excerpt. */
  excerpt?: string;
  /** Topic tags. */
  tags?: string[];
  /** Publish date — any displayable string. */
  date?: string;
  author?: string;
  /** Estimated read time, e.g. "5 min read". */
  readTime?: string;
  /** Article (single post) or series (multi-part). */
  kind?: 'article' | 'series';
  /** Episode count — shown for `series`. */
  episodeCount?: number;
  /** Cover image. Omit for the branded placeholder. */
  coverImage?: string;
}

export interface BlogCardProps {
  post: BlogCardData;
  onOpen?: (_id: string) => void;
  maxTags?: number;
  coverSize?: BlogCoverSize;
  className?: string;
}

// Only the COVER has a fixed height (it's an image/preview region). The
// card body is free to size to its content; cards in a CSS-grid row are
// kept even by the grid's default `align-items: stretch` + the body's
// `flex-1`. This way text is never clipped.
const COVER_HEIGHT: Record<Exclude<BlogCoverSize, 'feature'>, string> = {
  compact: 'h-[8.5rem]',
  standard: 'h-[11rem]',
  tall: 'h-[14.5rem]',
};

/* --- Branded placeholder ------------------------------------------------- */

/** A stable reference code from the id — e.g. "BLOG · 20240716 · 6656". */
function refCode(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `BLOG · ${(h % 9000) + 1000}`;
}

const BlogPlaceholder: React.FC<{ id: string }> = ({ id }) => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(110% 110% at 84% 8%, color-mix(in oklch, var(--ds-color-accent) 16%, transparent), transparent 60%), ' +
          'radial-gradient(110% 110% at 12% 96%, color-mix(in oklch, var(--ds-color-primary) 12%, transparent), transparent 58%), ' +
          'var(--ds-color-surface-2)',
      }}
    />
    {/* The reference code is the placeholder's centred focal element. */}
    <span className="relative select-none whitespace-nowrap font-mono text-ds-sm uppercase tracking-[0.18em] text-ds-fg-subtle">
      {refCode(id)}
    </span>
  </div>
);

/* --- BlogCard ------------------------------------------------------------ */

export const BlogCard: React.FC<BlogCardProps> = ({
  post,
  onOpen,
  maxTags = 4,
  coverSize = 'standard',
  className,
}) => {
  const {
    id, title, excerpt, tags = [], date, author, readTime,
    kind = 'article', episodeCount, coverImage,
  } = post;

  const shownTags = tags.slice(0, maxTags);
  const overflow = tags.length - shownTags.length;
  const isFeature = coverSize === 'feature';
  const isSeries = kind === 'series';
  /* --- Cover ------------------------------------------------------------- */
  const cover = (
    <div
      className={cn(
        'relative overflow-hidden border-ds-border',
        isFeature
          ? 'w-[46%] shrink-0 border-r'
          : cn('shrink-0 border-b', COVER_HEIGHT[coverSize]),
      )}
    >
      {coverImage ? (
        <img
          src={coverImage}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-ds-slow ease-ds-out-expo group-hover:scale-[1.04]"
        />
      ) : (
        <BlogPlaceholder id={id} />
      )}

      {/* Kind pill, top-left — article or series. */}
      <div className="absolute left-2.5 top-2.5">
        <Badge tone={isSeries ? 'primary' : 'neutral'} appearance="soft" size="sm">
          {isSeries ? <Layers /> : <FileText />}
          {isSeries ? 'Series' : 'Article'}
        </Badge>
      </div>

      {/* Episode count (series) or read time (article), top-right. */}
      {(isSeries && episodeCount != null) || readTime ? (
        <div className="absolute right-2.5 top-2.5">
          <Badge tone="neutral" appearance="soft" size="sm">
            {isSeries && episodeCount != null
              ? `${episodeCount} episodes`
              : readTime}
          </Badge>
        </div>
      ) : null}

      <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity duration-ds-fast group-hover:opacity-100">
        <span className="flex size-6 items-center justify-center rounded-ds-sm bg-ds-surface-1/90 text-ds-primary shadow-ds-1">
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>

      {/* Meta strip — date · author, pinned to the cover's bottom edge on a
          gradient scrim so it reads over any cover content. */}
      {(date || author) && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-x-3 bg-gradient-to-t from-black/45 to-transparent px-3 pb-2 pt-6 text-ds-2xs font-medium text-white">
          {date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {date}
            </span>
          )}
          {author && (
            <span className="inline-flex items-center gap-1">
              <User className="size-3" />
              {author}
            </span>
          )}
        </div>
      )}
    </div>
  );

  /* --- Body -------------------------------------------------------------- */
  const body = (
    <div
      className={cn(
        // The body sizes to its content; `flex-1` lets it fill any extra
        // height when the grid stretches this card to match a taller
        // sibling — so the footer stays pinned to the bottom (mt-auto).
        'flex flex-1 flex-col gap-2',
        isFeature ? 'min-w-0 gap-2.5 p-6' : 'p-3.5',
      )}
    >
      {/* Date · author now live on the cover's bottom edge (see `cover`). */}
      <h3
        className={cn(
          'font-semibold leading-snug tracking-[-0.01em] text-ds-fg',
          isFeature ? 'line-clamp-2 text-ds-xl' : 'line-clamp-2 text-ds-base',
        )}
      >
        {title}
      </h3>

      {excerpt && (
        <p
          className={cn(
            'leading-relaxed text-ds-fg-muted',
            isFeature ? 'line-clamp-3 text-ds-sm' : 'line-clamp-2 text-ds-xs',
          )}
        >
          {excerpt}
        </p>
      )}

      {shownTags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1 pt-1">
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
    </div>
  );

  return (
    <Card
      variant="elevated"
      padding="none"
      interactive
      reveal
      onClick={() => onOpen?.(id)}
      className={cn(
        'group flex overflow-hidden',
        // `h-full` makes the card fill its grid cell, so a row of cards is
        // even (the grid stretches them); the body absorbs the slack.
        isFeature ? 'h-72 flex-row' : 'h-full flex-col',
        className,
      )}
    >
      {cover}
      {body}
    </Card>
  );
};
