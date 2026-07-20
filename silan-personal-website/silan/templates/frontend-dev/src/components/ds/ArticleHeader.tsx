// src/components/ds/ArticleHeader.tsx
//
// Design-system ArticleHeader — the header block for a blog post / episode
// detail page. This is a PAGE-LEVEL header, not a card: it's the opening
// of the page body, so it has no container chrome — depth comes from clear
// grouping and hairline rules, not a card surface.
//
// Built from ds primitives (Stack / Divider / Badge / IconButton).
//
// Layout intent:
//   • The title is the sole focal point.
//   • Title + summary are one tight group.
//   • The byline (author · date · read time · episode) is one inline,
//     peer-level group separated by hairline rules.
//   • Tags are a separate group.
//   • The stats / actions row is a footer, set apart by a full-width rule.
import React from 'react';
import { User, Calendar, Clock, Play, Eye, Heart, Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Stack } from './Layout';
import { Divider } from './Layout';
import { Badge } from './Badge';
import { IconButton } from './IconButton';

export interface ArticleHeaderData {
  title: string;
  /** Optional summary / standfirst under the title. */
  summary?: string;
  author?: string;
  /** Publish date — any displayable string. */
  date?: string;
  /** Read time, e.g. "17 min read". */
  readTime?: string;
  /** Episode label for a series part, e.g. "Episode 2 / 2". */
  episode?: string;
  tags?: string[];
  /** Stats — omit a field to hide it. */
  views?: number;
  likes?: number;
}

export interface ArticleHeaderProps {
  article: ArticleHeaderData;
  /** Whether the reader has liked this article. */
  liked?: boolean;
  onLike?: () => void;
  onShare?: () => void;
  className?: string;
}

/** One peer item in the byline. */
const BylineItem: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
    <span className="text-ds-fg-subtle [&_svg]:size-[15px]">{icon}</span>
    {children}
  </span>
);

export const ArticleHeader: React.FC<ArticleHeaderProps> = ({
  article,
  liked = false,
  onLike,
  onShare,
  className,
}) => {
  const { title, summary, author, date, readTime, episode, tags = [], views, likes } =
    article;

  // Build the byline as peer items, joined by vertical hairline dividers.
  const bylineItems = [
    author && <BylineItem key="a" icon={<User />}>{author}</BylineItem>,
    date && <BylineItem key="d" icon={<Calendar />}>{date}</BylineItem>,
    readTime && <BylineItem key="r" icon={<Clock />}>{readTime}</BylineItem>,
    episode && <BylineItem key="e" icon={<Play />}>{episode}</BylineItem>,
  ].filter(Boolean);

  return (
    <header {...dsRoot} className={cn('w-full', className)}>
      {/* Spacing is set per-group, not as a uniform rhythm. */}
      <Stack gap={4}>
        {/* Group 1 — title + summary (tight: they belong together). */}
        <Stack gap={3}>
          <h1 className="text-ds-4xl font-semibold leading-[1.25] tracking-[-0.02em] text-ds-fg">
            {title}
          </h1>
          {summary && (
            <p className="max-w-2xl text-ds-lg leading-[1.6] text-ds-fg-muted">
              {summary}
            </p>
          )}
        </Stack>

        {/* Group 2 — byline: inline peers split by vertical hairlines. */}
        {bylineItems.length > 0 && (
          <Stack direction="row" gap={3} align="center" wrap>
            {bylineItems.map((item, i) => (
              <React.Fragment key={i}>
                {item}
                {i < bylineItems.length - 1 && (
                  <Divider orientation="vertical" className="h-3.5" />
                )}
              </React.Fragment>
            ))}
          </Stack>
        )}

        {/* Group 3 — tags. */}
        {tags.length > 0 && (
          <Stack direction="row" gap={2} wrap>
            {tags.map((tag, i) => (
              <Badge key={i} tone="neutral" appearance="soft" size="md">
                {tag}
              </Badge>
            ))}
          </Stack>
        )}
      </Stack>

      {/* Footer — stats + actions, set apart by a full-width hairline. */}
      <Divider className="my-5" />
      <div className="flex items-center gap-3">
        {views != null && (
          <span className="inline-flex items-center gap-1.5 text-ds-sm text-ds-fg-muted">
            <Eye className="size-4 text-ds-fg-subtle" />
            {views}
          </span>
        )}
        <button
          {...dsRoot}
          type="button"
          onClick={onLike}
          aria-pressed={liked}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-ds-sm px-1 py-0.5 text-ds-sm',
            'transition-colors duration-ds-fast',
            liked ? 'text-ds-error' : 'text-ds-fg-muted hover:text-ds-fg',
          )}
        >
          <Heart className={cn('size-4', liked && 'fill-current')} />
          {likes ?? 0}
        </button>
        <div className="ml-auto">
          <IconButton label="Share" size="sm" variant="ghost" onClick={onShare}>
            <Share2 />
          </IconButton>
        </div>
      </div>
    </header>
  );
};
