import React from 'react';
import { cn } from '../../lib/utils';
import { dsRoot } from '../ds/dsAttr';
import { EDITORIAL_CONTENT_FRAME_CLASS } from '../../layout/contentFrame';

interface MomentsProfileHeroProps {
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
      'relative mb-14 sm:mb-16 lg:-mx-8 lg:w-[calc(100%_+_4rem)]',
      className,
    )}
  >
    <div className="relative min-h-[10.5rem] overflow-hidden bg-ds-surface-3 sm:min-h-[clamp(16rem,17vw,21rem)]">
      <img
        src={coverUrl}
        alt={coverAlt}
        className="absolute inset-0 size-full object-cover object-[center_42%]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,13,18,0.16)_0%,rgba(7,13,18,0.08)_34%,rgba(7,13,18,0.76)_100%)]"
      />
    </div>

    <div className="absolute -bottom-6 inset-x-0 sm:-bottom-8 2xl:-bottom-10">
      <div className={cn(EDITORIAL_CONTENT_FRAME_CLASS, 'flex justify-end')}>
        <div className="flex w-full max-w-full items-center justify-end gap-3 sm:gap-4 2xl:gap-5">
          <div className="relative min-w-0 flex-1 text-right">
            <strong className="block truncate text-lg font-semibold tracking-[-0.02em] text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.55)] sm:text-xl 2xl:text-2xl">
              {name}
            </strong>
            {role && (
              <span className="absolute right-0 top-full mt-0.5 block w-max max-w-[calc(100vw-8rem)] text-[11px] leading-4 text-ds-fg-muted sm:max-w-64 sm:text-xs sm:leading-5 2xl:max-w-72 2xl:text-sm">
                {role}
              </span>
            )}
          </div>
          <img
            src={avatarUrl}
            alt={`${name} portrait`}
            className="size-20 shrink-0 rounded-full border-[3px] border-ds-canvas bg-ds-surface-3 object-cover shadow-ds-2 sm:size-24 2xl:size-28"
          />
        </div>
      </div>
    </div>
  </header>
);

export default MomentsProfileHero;
