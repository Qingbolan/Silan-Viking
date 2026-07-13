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

/* --- Branded placeholder ------------------------------------------------- */

/** First letter of the title — e.g. "AI-Native Database..." -> "A". */
function titleInitial(title: string): string {
  const trimmed = title.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

const ProjectPlaceholder: React.FC<{ title: string }> = ({ title }) => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
    {/* NUS-tinted diffusion wash — gentle, orange into blue. */}
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(110% 110% at 16% 10%, color-mix(in oklch, var(--ds-color-primary) 16%, transparent), transparent 60%), ' +
          'radial-gradient(110% 110% at 86% 94%, color-mix(in oklch, var(--ds-color-accent) 13%, transparent), transparent 58%), ' +
          'var(--ds-color-surface-2)',
      }}
    />
    {/* The title initial is the placeholder's centred focal element. */}
    <span className="relative select-none font-display text-5xl font-semibold text-ds-fg-subtle/60">
      {titleInitial(title)}
    </span>
  </div>
);

/* --- Live demo preview --------------------------------------------------- */
//
// A non-interactive, scaled-down iframe of the demo site. The iframe is
// rendered at a desktop width (PREVIEW_W) then CSS-scaled to fill the cover,
// so the whole layout is visible rather than a cropped corner.
// If the site refuses embedding (X-Frame-Options) or fails to load within
// the timeout, `onFail` fires and the card falls back to the placeholder.

const PREVIEW_W = 1280; // virtual desktop width the iframe renders at

const LivePreview: React.FC<{ url: string; onFail: () => void }> = ({ url, onFail }) => {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.3);
  const [loaded, setLoaded] = React.useState(false);

  // Scale = cover width / virtual width, so the page fits edge-to-edge.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / PREVIEW_W);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A cross-origin site that blocks framing never fires `load`; if nothing
  // has loaded within the window, treat it as a failure and fall back.
  React.useEffect(() => {
    const id = setTimeout(() => {
      if (!loaded) onFail();
    }, 6000);
    return () => clearTimeout(id);
  }, [loaded, onFail]);

  const virtualH = wrapRef.current
    ? wrapRef.current.clientHeight / scale
    : 800;

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-ds-surface-2">
      <iframe
        src={url}
        title="Live demo preview"
        loading="lazy"
        // The preview is decorative — never interactive inside the card.
        tabIndex={-1}
        scrolling="no"
        sandbox="allow-scripts allow-same-origin"
        onLoad={() => setLoaded(true)}
        onError={onFail}
        className="pointer-events-none origin-top-left border-0"
        style={{
          width: PREVIEW_W,
          height: virtualH,
          transform: `scale(${scale})`,
        }}
      />
      {/* Slight wash so card text/badges stay legible over busy demos. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/10" />
    </div>
  );
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
  className,
}) => {
  const {
    id, title, description, tags = [],
    coverImage, coverVideo, coverPoster, livePreview,
    year, author, githubUrl, demoUrl, status,
  } = project;

  const shownTags = tags.slice(0, maxTags);
  const overflow = tags.length - shownTags.length;

  // Cover priority: image → video → live demo iframe → branded placeholder.
  // `previewFailed` drops to the placeholder if the demo refuses embedding.
  const [previewFailed, setPreviewFailed] = React.useState(false);
  const showLivePreview =
    !coverImage && !coverVideo && livePreview && !!demoUrl && !previewFailed;

  // `feature` is a wide, horizontal card (cover left, body right); the other
  // sizes are the standard vertical card (cover on top).
  const isFeature = coverSize === 'feature';

  /* --- Cover ------------------------------------------------------------- */
  const cover = (
    <div
      className={cn(
        'relative overflow-hidden border-ds-border',
        isFeature
          // Feature cards stack on phones and become an editorial split at
          // larger widths; a one-column gallery must not squeeze a horizontal
          // card into a handset.
          ? 'h-40 w-full shrink-0 border-b sm:h-auto sm:w-[46%] sm:border-b-0 sm:border-r'
          // Vertical: cover on top at a fixed height.
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
      ) : coverVideo ? (
        <CoverVideo src={coverVideo} poster={coverPoster} />
      ) : showLivePreview ? (
        <LivePreview url={demoUrl!} onFail={() => setPreviewFailed(true)} />
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
      <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity duration-ds-fast group-hover:opacity-100">
        <span className="flex size-6 items-center justify-center rounded-ds-sm bg-ds-surface-1/90 text-ds-primary shadow-ds-1">
          <ArrowUpRight className="size-3.5" />
        </span>
      </div>

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

      {/* --- Footer: links ----------------------------------------------- */}
      {(githubUrl || demoUrl) && (
        <div
          className="mt-auto flex items-center gap-0.5 border-t border-ds-border pt-2"
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
      interactive
      reveal
      onClick={() => onOpen?.(id)}
      className={cn(
        'group flex overflow-hidden',
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
