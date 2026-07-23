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
  /** Latest episode in a series — surfaced as a dedicated meta row between
   *  the excerpt and the tags so the reader can see what's freshest without
   *  opening the series. Rendered only when `kind === 'series'`. */
  latestEpisode?: { title: string; episodeNumber?: number };
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
    <span className="relative max-w-[calc(100%-2rem)] select-none overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ds-sm uppercase tracking-[0.18em] text-ds-fg-subtle">
      {refCode(id)}
    </span>
  </div>
);

const splitQuoteLead = (text: string): { lead: string; rest: string } => {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return { lead: '', rest: '' };
  const sentence = normalized.match(/^(.{24,180}?[.!?。！？])\s+(.+)$/);
  if (sentence) return { lead: sentence[1], rest: sentence[2] };
  const softBreak = normalized.match(/^(.{42,130}?)\s+(.+)$/);
  if (softBreak) return { lead: softBreak[1], rest: softBreak[2] };
  return { lead: normalized, rest: '' };
};

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
    kind = 'article', episodeCount, latestEpisode, coverImage,
  } = post;

  const shownTags = tags.slice(0, maxTags);
  const overflow = tags.length - shownTags.length;
  const isFeature = coverSize === 'feature';
  const isSeries = kind === 'series';
  const quoteCard = !coverImage && !isSeries;
  const seriesProgress =
    isSeries && episodeCount != null && episodeCount > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((latestEpisode?.episodeNumber ?? episodeCount) / episodeCount) * 100,
          ),
        )
      : 0;

  if (quoteCard) {
    const quote = splitQuoteLead(excerpt || title);

    return (
      <Card
        variant="elevated"
        padding="none"
        interactive
        reveal
        onClick={() => onOpen?.(id)}
        className={cn(
          'group flex h-full min-h-[18rem] overflow-hidden bg-ds-surface-1',
          className,
        )}
      >
        <div className="relative flex min-h-0 flex-1 flex-col p-5 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-12 right-3 font-serif text-[9rem] leading-none opacity-10 transition-transform duration-ds-slow group-hover:translate-y-[-0.2rem]"
            style={{ color: 'var(--color-textTertiary)' }}
          >
            &rdquo;
          </div>

          <div className="relative z-10 flex items-center justify-between gap-3">
            <Badge tone="neutral" appearance="soft" size="sm">
              <FileText />
              Article
            </Badge>
            {readTime && (
              <span className="font-mono text-[11px] text-ds-fg-subtle">
                {readTime}
              </span>
            )}
          </div>

          <blockquote className="relative z-10 mt-5 flex-1">
            <p className="line-clamp-6 text-[1.05rem] leading-7 tracking-[-0.01em] text-ds-fg sm:text-[1.12rem] sm:leading-8">
              {quote.lead && (
                <span
                  className="box-decoration-clone rounded-[0.18rem] px-1 text-ds-fg"
                  style={{ backgroundColor: 'var(--ds-color-primary-soft)' }}
                >
                  {quote.lead}
                </span>
              )}
              {quote.rest && (
                <>
                  {' '}
                  <span className="text-ds-fg-muted">{quote.rest}</span>
                </>
              )}
            </p>
          </blockquote>

          <div className="relative z-10 mt-5 space-y-3">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ds-fg-subtle">
              {date && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3" />
                  {date}
                </span>
              )}
            </div>

            <h3 className="line-clamp-2 text-ds-lg font-semibold leading-snug tracking-[-0.015em] text-ds-fg">
              {title}
            </h3>

            {shownTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
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
        </div>
      </Card>
    );
  }

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
          className={cn(
            'size-full object-cover transition-transform duration-ds-slow ease-ds-out-expo group-hover:scale-[1.04]',
            isSeries && 'scale-[1.04]',
          )}
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

      <div
        className={cn(
          'absolute right-2.5 top-2.5 opacity-0 transition-opacity duration-ds-fast group-hover:opacity-100',
          isSeries && 'hidden',
        )}
      >
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
  const body = isSeries ? (
    <div
      className={cn(
        'relative flex flex-1 flex-col overflow-hidden border-t border-ds-border/70',
        isFeature ? 'min-w-0 p-6' : 'p-4',
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ds-primary-soft/55 to-transparent"
      />

      <div className="relative z-10 flex items-start gap-3">
        <h3
          className={cn(
            'min-w-0 flex-1 font-semibold leading-tight tracking-[-0.018em] text-ds-fg',
            isFeature ? 'line-clamp-2 text-ds-xl' : 'line-clamp-2 text-[1.45rem]',
          )}
        >
          {title}
        </h3>
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-ds-md bg-ds-primary text-ds-primary-fg shadow-ds-1 transition-transform duration-ds-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
          <ArrowUpRight className="size-4" />
        </span>
      </div>

      {excerpt && (
        <p className="relative z-10 mt-3 line-clamp-2 text-ds-sm leading-relaxed text-ds-fg-muted">
          {excerpt}
        </p>
      )}

      <div className="relative z-10 mt-auto overflow-hidden rounded-ds-md border border-ds-primary/20 bg-ds-primary-soft/65 p-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ds-primary">
              Latest episode
            </div>
            <p className="mt-1 line-clamp-1 text-ds-sm font-semibold leading-snug text-ds-fg">
              {latestEpisode?.title ?? 'Open the series'}
            </p>
          </div>
          {episodeCount != null && (
            <div className="shrink-0 text-right">
              <div className="font-mono text-ds-lg font-semibold leading-none text-ds-primary">
                {latestEpisode?.episodeNumber ?? episodeCount}
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ds-fg-subtle">
                of {episodeCount}
              </div>
            </div>
          )}
        </div>

        {episodeCount != null && episodeCount > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ds-surface-1" aria-hidden>
            <span
              className="block h-full rounded-full bg-ds-primary"
              style={{ width: `${seriesProgress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  ) : (
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
        isSeries && '-translate-y-0.5 border-ds-primary/20 shadow-ds-3',
        className,
      )}
    >
      {cover}
      {body}
    </Card>
  );
};
