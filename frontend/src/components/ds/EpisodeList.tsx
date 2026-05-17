// src/components/ds/EpisodeList.tsx
//
// Design-system EpisodeList — the episode navigator for a content series.
// A vertical list of episodes; each row shows its number, title and length.
// The currently-open episode is highlighted (filled number chip, primary
// text, a pulsing dot) and is not clickable.
//
// Self-contained: takes a plain `EpisodeListItem[]`, decoupled from the
// app's EpisodeData model.
import React from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';

export interface EpisodeListItem {
  id: string;
  title: string;
  /** Sequence number shown in the leading chip. */
  episodeNumber: number;
  /** Length in minutes — shown as "Nm" when present. */
  durationMinutes?: number;
}

export interface EpisodeListProps {
  items: EpisodeListItem[];
  /** Id of the episode currently being viewed — highlighted, not clickable. */
  currentId?: string;
  onSelect?: (_id: string) => void;
  /** Section heading. Defaults to "Episodes". */
  title?: string;
  /** Hide the heading bar entirely — show just the list of rows. */
  hideHeader?: boolean;
  className?: string;
}

export const EpisodeList: React.FC<EpisodeListProps> = ({
  items,
  currentId,
  onSelect,
  title = 'Episodes',
  hideHeader = false,
  className,
}) => (
  <section {...dsRoot} className={cn('w-full', className)}>
    {/* Heading — omitted when `hideHeader`. */}
    {!hideHeader && (
      <div className="mb-1 flex items-center px-2.5 py-1">
        <h4 className="text-ds-2xs font-semibold uppercase tracking-[0.08em] text-ds-fg-muted">
          {title}
        </h4>
        <span className="ml-auto text-ds-2xs font-mono text-ds-fg-subtle">
          {items.length}
        </span>
      </div>
    )}

    {/* Rows. `list-none` strips the legacy disc bullet. */}
    <ul className="max-h-96 list-none divide-y divide-ds-border overflow-y-auto">
      {items.map((ep) => {
        const isCurrent = ep.id === currentId;
        return (
          <li key={ep.id} className="list-none">
            <motion.button
              {...dsRoot}
              type="button"
              disabled={isCurrent}
              onClick={() => !isCurrent && onSelect?.(ep.id)}
              whileHover={isCurrent ? undefined : { x: 2 }}
              whileTap={isCurrent ? undefined : { scale: 0.99 }}
              className={cn(
                'flex w-full items-center gap-2 px-2.5 py-1.5 text-left outline-none',
                'transition-colors duration-ds-fast ease-ds-standard',
                'focus-visible:bg-ds-surface-2',
                // The current row is marked by the chip + a thin left rail —
                // no heavy fill. Others just hover-tint.
                isCurrent
                  ? 'cursor-default border-l-2 border-l-ds-primary'
                  : 'border-l-2 border-l-transparent hover:bg-ds-surface-2',
              )}
            >
              {/* Number chip — filled NUS-orange when current; this is the
                  primary current-episode signal. */}
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-ds-sm font-mono text-ds-2xs font-medium',
                  isCurrent
                    ? 'bg-ds-primary text-white'
                    : 'bg-ds-surface-3 text-ds-fg-muted',
                )}
              >
                {ep.episodeNumber}
              </span>

              {/* Title + length. */}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate text-ds-xs',
                    isCurrent
                      ? 'font-semibold text-ds-primary'
                      : 'font-medium text-ds-fg',
                  )}
                >
                  {ep.title}
                </span>
                {ep.durationMinutes != null && (
                  <span className="mt-0.5 inline-flex items-center gap-1 text-ds-2xs text-ds-fg-subtle">
                    <Clock className="size-3" />
                    {ep.durationMinutes}m
                  </span>
                )}
              </span>
            </motion.button>
          </li>
        );
      })}
    </ul>
  </section>
);
