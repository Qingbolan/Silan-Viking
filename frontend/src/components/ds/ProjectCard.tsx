// src/components/ds/ProjectCard.tsx
//
// Design-system ProjectCard — a content card for the project gallery.
//
// Self-contained: it takes a plain `ProjectCardData` shape (not the app's
// API model) so it stays decoupled from transport details. When a real
// cover image is given it's used; otherwise a branded NUS-gradient
// placeholder shows the title's initial letter.
import React from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  Code2,
  ExternalLink,
  Github,
  Globe2,
  MonitorUp,
  User,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Card } from './Card';
import { Badge } from './Badge';
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
  documentationUrl?: string;
  relatedLinks?: Array<{
    title: string;
    href: string;
    kind?: 'blog' | 'series' | 'article' | 'episode';
  }>;

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
  coverSourceType?: 'image' | 'website';

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

type ProjectCapability = {
  key: string;
  label: string;
  icon: React.ReactNode;
  tone?: 'primary' | 'neutral';
};

type ProjectActionLink = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  primary: boolean;
};

const present = <T,>(item: T | null | undefined): item is T => item != null;

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
    year, author, githubUrl, demoUrl, documentationUrl, relatedLinks = [],
    coverSourceType, status,
  } = project;

  const shownTags = tags.slice(0, maxTags);
  const overflow = tags.length - shownTags.length;

  // Cover priority: image → video → live demo preview → branded placeholder.
  const showLivePreview =
    !coverImage
    && !coverVideo
    && (livePreview || coverSourceType === 'website')
    && !!demoUrl;

  const primaryCapability: ProjectCapability | undefined = demoUrl
    ? {
        key: 'demo',
        label: 'Live demo',
        icon: <MonitorUp />,
        tone: 'primary' as const,
      }
    : githubUrl
      ? {
          key: 'source',
          label: 'Source code',
          icon: <Code2 />,
          tone: 'primary' as const,
        }
      : relatedLinks.length > 0
        ? {
            key: 'related',
            label: relatedLinks.length === 1 ? 'Related writing' : `${relatedLinks.length} related`,
            icon: <BookOpen />,
            tone: 'primary' as const,
          }
        : undefined;

  const secondaryCapabilities: ProjectCapability[] = [
    githubUrl && primaryCapability?.key !== 'source'
      ? {
          key: 'source',
          label: 'Source',
          icon: <Github />,
        }
      : null,
    demoUrl && primaryCapability?.key !== 'demo'
      ? {
          key: 'demo',
          label: 'Demo',
          icon: <ExternalLink />,
        }
      : null,
    documentationUrl
      ? {
          key: 'docs',
          label: 'Docs',
          icon: <BookOpen />,
        }
      : null,
    relatedLinks.length > 0 && primaryCapability?.key !== 'related'
      ? {
          key: 'related',
          label: relatedLinks.length === 1 ? 'Writing' : `${relatedLinks.length} writing`,
          icon: <BookOpen />,
        }
      : null,
    coverSourceType === 'website'
      ? {
          key: 'cover',
          label: 'Website cover',
          icon: <Globe2 />,
        }
      : null,
  ].filter(present);

  const capabilities = primaryCapability
    ? [primaryCapability, ...secondaryCapabilities.slice(0, 3)]
    : secondaryCapabilities.slice(0, 4);

  const actionLinks: ProjectActionLink[] = [
    demoUrl
      ? {
          key: 'demo',
          label: 'Demo',
          href: demoUrl,
          icon: <ExternalLink />,
          primary: true,
        }
      : null,
    githubUrl
      ? {
          key: 'source',
          label: 'Source',
          href: githubUrl,
          icon: <Github />,
          primary: false,
        }
      : null,
    !demoUrl && !githubUrl && relatedLinks[0]
      ? {
          key: 'related',
          label: 'Read',
          href: relatedLinks[0].href,
          icon: <BookOpen />,
          primary: false,
        }
      : null,
  ].filter(present);

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
          'font-semibold leading-snug tracking-[-0.012em] text-ds-fg',
          isFeature ? 'text-ds-2xl sm:text-[1.65rem]' : 'text-ds-base',
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

      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {capabilities.map((capability, index) => (
            <Badge
              key={capability.key}
              tone={index === 0 && capability.tone === 'primary' ? 'primary' : 'neutral'}
              appearance="soft"
              size="sm"
              className={!hoverChrome ? 'border-0' : undefined}
            >
              {capability.icon}
              {capability.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Tag chips. */}
      {shownTags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
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
      {actionLinks.length > 0 && (
        <div
          className={cn(
            'mt-auto flex flex-wrap items-center gap-1.5 pt-2',
            hoverChrome && 'border-t border-ds-border',
          )}
          // Stop link clicks from also triggering the card's onOpen.
          onClick={(e) => e.stopPropagation()}
        >
          {actionLinks.map((action) => (
            <a
              key={action.key}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              {...dsRoot}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-ds-md px-2.5 text-ds-2xs font-medium transition-[background-color,color,border-color,transform] duration-ds-fast active:scale-[0.97] [&_svg]:size-3.5',
                action.primary
                  ? 'bg-ds-primary text-ds-primary-fg shadow-ds-1 hover:bg-ds-primary-hover'
                  : 'border border-ds-border bg-ds-surface-2 text-ds-fg-muted hover:border-ds-border-strong hover:bg-ds-surface-3 hover:text-ds-fg',
              )}
            >
              {action.icon}
              {action.label}
            </a>
          ))}
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
