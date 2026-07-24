import React from 'react';
import { cn } from '../../lib/utils';
import { dsRoot } from '../ds/dsAttr';
import { EDITORIAL_CONTENT_FRAME_CLASS } from '../../layout/contentFrame';

interface MomentsProfileHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  name: string;
  role?: string;
  avatarUrl: string;
  coverUrl: string;
  coverAlt: string;
  className?: string;
}

/**
 * Public identity header for the Moments feed.
 *
 * Desktop and Web intentionally share the same cover/profile mental model,
 * while the public site keeps its own navigation and responsive proportions.
 */
const MomentsProfileHero: React.FC<MomentsProfileHeroProps> = ({
  eyebrow,
  title,
  description,
  name,
  role,
  avatarUrl,
  coverUrl,
  coverAlt,
  className,
}) => (
  <header
    {...dsRoot}
    className={cn(
      'relative mb-24 sm:mb-28 lg:-mx-8 lg:w-[calc(100%_+_4rem)]',
      className,
    )}
  >
    <div className="relative min-h-[17rem] overflow-hidden bg-ds-surface-3 sm:min-h-[clamp(26rem,24vw,34rem)]">
      <img
        src={coverUrl}
        alt={coverAlt}
        className="absolute inset-0 size-full object-cover object-[center_42%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,13,18,0.16)_0%,rgba(7,13,18,0.08)_34%,rgba(7,13,18,0.76)_100%)]"
      />

      <div className="absolute inset-x-0 bottom-0 text-white">
        <div className={cn(EDITORIAL_CONTENT_FRAME_CLASS, 'pb-7 sm:pb-9 2xl:pb-14')}>
          <div className="mb-2 text-ds-xs font-semibold uppercase tracking-[0.16em] text-orange-200">
            {eyebrow}
          </div>
          <h1 className="max-w-4xl text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl 2xl:text-6xl">
            {title}
          </h1>
          <p className="mt-3 max-w-[60ch] text-sm leading-6 text-white/78 sm:text-base sm:leading-7 2xl:text-lg 2xl:leading-8">
            {description}
          </p>
        </div>
      </div>
    </div>

    <div className="absolute -bottom-16 inset-x-0 2xl:-bottom-20">
      <div className={cn(EDITORIAL_CONTENT_FRAME_CLASS, 'flex justify-end')}>
        <div className="flex max-w-full items-start gap-3 sm:gap-4 2xl:gap-5">
          <div className="min-w-0 pt-5 text-right">
            <strong className="block truncate text-xl font-semibold tracking-[-0.025em] text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.55)] sm:text-2xl 2xl:text-3xl">
              {name}
            </strong>
            {role && (
              <span className="mt-1 block line-clamp-2 max-w-64 text-xs leading-5 text-ds-fg-muted sm:text-sm 2xl:max-w-80 2xl:text-base 2xl:leading-6">
                {role}
              </span>
            )}
          </div>
          <img
            src={avatarUrl}
            alt={`${name} portrait`}
            className="size-24 shrink-0 rounded-full border-4 border-ds-canvas bg-ds-surface-3 object-cover shadow-ds-2 sm:size-28 2xl:size-32"
          />
        </div>
      </div>
    </div>
  </header>
);

export default MomentsProfileHero;
