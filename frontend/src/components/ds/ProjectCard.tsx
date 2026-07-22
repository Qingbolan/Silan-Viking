// src/components/ds/ProjectCard.tsx
//
// Design-system ProjectCard — a content card for the project gallery.
//
// Self-contained: it takes a plain `ProjectCardData` shape (not the app's
// API model) so it stays decoupled from transport details. When a real
// cover image is given it's used; otherwise a branded NUS-gradient
// placeholder shows the title's initial letter.
import React from 'react';
import { Github, ExternalLink, ArrowUpRight, Calendar, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Card } from './Card';
import { Badge } from './Badge';
import { IconButton } from './IconButton';
import { ProjectLivePreview, ProjectPlaceholder } from './ProjectPreviewSurface';

/**
 * How tall the cover is, relative to the card width.
 *   compact  16:7  — cover is a slim band
 *   standard 2:1   — the balanced default
 *   tall     4:3   — cover-led card
 *   feature  3:2, and the body sits as an overlay — for hero / pinned cards
 */
export type CoverSize = 'compact' | 'standard' | 'tall' | 'feature';

export interface ProjectCardData {
  id: string;
  title: string;
  description?: string;
  /** Tech-stack / topic tags. */
  tags?: string[];
  /** Year — shown in the placeholder reference code + the cover meta strip. */
  year?: number | string;
  /** Author / owner — shown in the cover meta strip. */
  author?: string;
  githubUrl?: string;
  demoUrl?: string;

  /* --- Cover content — first one set wins, in this order ---------------- */
  /** A static preview image / screenshot. */
  coverImage?: string;
  /** A cover video (MP4/WebM). Plays muted + looped automatically. */
  coverVideo?: string;
  /** Poster frame shown before `coverVideo` loads. */
  coverPoster?: string;
  /**
   * Live, scaled, non-interactive iframe of `demoUrl`. Used only when no
   * image/video is set. Falls back to the placeholder if embedding fails.
   */
  livePreview?: boolean;

  /** Optional status pill (e.g. "Active", "Archived"). */
  status?: { label: string; tone?: 'success' | 'neutral' | 'warning' };
}

export interface ProjectCardProps {
  project: ProjectCardData;
  onOpen?: (_id: string) => void;
  /** Cap the visible tags; the rest collapse into a "+N" chip. */
  maxTags?: number;
  /** How much room the cover takes. Default `standard`. */
  coverSize?: CoverSize;
  /** Disable hover-only shadows, reveal borders, and affordance chrome. */
  hoverChrome?: boolean;
  className?: string;
}

// Only the COVER has a fixed height (it's an image/preview region). The
// card body sizes to its content; a row of cards is kept even by the CSS
// grid's default `align-items: stretch` + the card's `h-full` + the body's
// `flex-1`. Text is therefore never clipped.
const COVER_HEIGHT: Record<Exclude<CoverSize, 'feature'>, string> = {
  compact: 'h-[8.5rem]',
  standard: 'h-[11rem]',
  tall: 'h-[14.5rem]',
};

/* --- Cover video --------------------------------------------------------- */
//
// Autoplaying, muted, looping cover video — behaves like a GIF. `muted` +
// `playsInline` are required for autoplay on mobile / Safari.

const CoverVideo: React.FC<{ src: string; poster?: string }> = ({ src, poster }) => (
  <video
    src={src}
    poster={poster}
    autoPlay
    muted
    loop
    playsInline
    preload="metadata"
    tabIndex={-1}
    className="size-full object-cover transition-transform duration-ds-slow ease-ds-out-expo group-hover:scale-[1.04]"
  />
);

/* --- ProjectCard --------------------------------------------------------- */

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpen,
  maxTags = 5,
  coverSize = 'standard',
  hoverChrome = true,
  className,
}) => {
  const {
    id, title, description, tags = [],
    coverImage, coverVideo, coverPoster, livePreview,
    year, author, githubUrl, demoUrl, status,
  } = project;

  const shownTags = tags.slice(0, maxTags);
  const overflow = tags.length - shownTags.length;

  // Cover priority: image → video → live demo preview → branded placeholder.
  const showLivePreview =
    !coverImage && !coverVideo && livePreview && !!demoUrl;

  // `feature` is a wide, horizontal card (cover left, body right); the other
  // sizes are the standard vertical card (cover on top).
  const isFeature = coverSize === 'feature';

  /* --- Cover ------------------------------------------------------------- */
  const cover = (
    <div
      className={cn(
        'relative overflow-hidden',
        hoverChrome && 'border-ds-border',
        isFeature
          // Feature cards stack on phones and become an editorial split at
          // larger widths; a one-column gallery must not squeeze a horizontal
          // card into a handset.
          ? cn(
              'h-40 w-full shrink-0 sm:h-auto sm:w-[46%]',
              hoverChrome && 'border-b sm:border-b-0 sm:border-r',
            )
          // Vertical: cover on top at a fixed height.
          : cn('shrink-0', hoverChrome && 'border-b', COVER_HEIGHT[coverSize]),
      )}
    >
      {coverImage ? (
        <img
          src={coverImage}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-ds-slow ease-ds-out-expo group-hover:scale-[1.04]"
        />
      ) : coverVideo ? (
        <CoverVideo src={coverVideo} poster={coverPoster} />
      ) : showLivePreview ? (
        <ProjectLivePreview url={demoUrl!} fallbackTitle={title} />
      ) : (
        <ProjectPlaceholder title={title} />
      )}

      {/* Status pill, top-left. */}
      {status && (
        <div className="absolute left-2.5 top-2.5">
          <Badge tone={status.tone ?? 'neutral'} appearance="soft" size="sm" dot>
            {status.label}
          </Badge>
        </div>
      )}

      {/* Hover affordance, top-right. */}
      {hoverChrome && (
        <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity duration-ds-fast group-hover:opacity-100">
          <span className="flex size-6 items-center justify-center rounded-ds-sm bg-ds-surface-1/90 text-ds-primary shadow-ds-1">
            <ArrowUpRight className="size-3.5" />
          </span>
        </div>
      )}

      {/* Meta strip — year · author, pinned to the cover's bottom edge on a
          gradient scrim (matches BlogCard). */}
      {(year != null || author) && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-x-3 bg-gradient-to-t from-black/45 to-transparent px-3 pb-2 pt-6 text-ds-2xs font-medium text-white">
          {year != null && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              {year}
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
        // The body sizes to its content; `flex-1` fills any slack when the
        // grid stretches this card to a taller sibling.
        'flex flex-1 flex-col gap-2',
        isFeature ? 'min-w-0 gap-3 p-4 sm:p-6' : 'p-3.5',
      )}
    >
      <h3
        className={cn(
          'font-semibold leading-snug tracking-[-0.01em] text-ds-fg',
          isFeature ? 'text-ds-xl' : 'text-ds-base',
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            'leading-relaxed text-ds-fg-muted',
            isFeature ? 'line-clamp-3 text-ds-sm' : 'line-clamp-2 text-ds-xs',
          )}
        >
          {description}
        </p>
      )}

      {/* Tag chips. */}
      {shownTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shownTags.map((tag) => (
            <Badge key={tag} tone="neutral" appearance="soft" size="sm" className={!hoverChrome ? 'border-0' : undefined}>
              {tag}
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge tone="primary" appearance="soft" size="sm" className={!hoverChrome ? 'border-0' : undefined}>
              +{overflow}
            </Badge>
          )}
        </div>
      )}

      {/* --- Footer: links ----------------------------------------------- */}
      {(githubUrl || demoUrl) && (
        <div
          className={cn(
            'mt-auto flex items-center gap-0.5 pt-2',
            hoverChrome && 'border-t border-ds-border',
          )}
          // Stop link clicks from also triggering the card's onOpen.
          onClick={(e) => e.stopPropagation()}
        >
          {githubUrl && (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" {...dsRoot}>
              <IconButton label="View source on GitHub" size="sm" variant="ghost">
                <Github />
              </IconButton>
            </a>
          )}
          {demoUrl && (
            <a href={demoUrl} target="_blank" rel="noopener noreferrer" {...dsRoot}>
              <IconButton label="Open live demo" size="sm" variant="ghost">
                <ExternalLink />
              </IconButton>
            </a>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Card
      variant="elevated"
      padding="none"
      interactive={hoverChrome}
      reveal={hoverChrome}
      onClick={() => onOpen?.(id)}
      className={cn(
        'group flex overflow-hidden',
        !hoverChrome && 'border-0 bg-transparent shadow-none',
        // `h-full` makes the card fill its grid cell; a row of cards stays
        // even via the grid's stretch + the body's flex-1.
        isFeature ? 'h-auto flex-col sm:h-72 sm:flex-row' : 'h-full flex-col',
        className,
      )}
    >
      {cover}
      {body}
    </Card>
  );
};
