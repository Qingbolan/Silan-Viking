// src/components/ds/ProfileHero.tsx
//
// Design-system ProfileHero — the opening block of a résumé / about page:
// a centered name, a brand-gradient role line, an optional standfirst,
// a contact row and social links.
//
// The role line uses the NUS brand gradient (orange → blue) clipped to the
// text — the one place a gradient is on-brand, since it pairs the primary
// and accent hues directly.
//
// Self-contained: takes plain `ContactItem[]` / `SocialItem[]`, decoupled
// from the app's résumé model.
import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Globe } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { Avatar } from './Avatar';

export interface ContactItem {
  /** Drives the icon + the link protocol. */
  type: 'email' | 'phone' | 'location' | string;
  value: string;
}

export interface SocialItem {
  /** A label; an `icon` may be supplied for non-standard links. */
  label: string;
  url: string;
  icon?: React.ReactNode;
}

export interface ProfileHeroProps {
  name: string;
  /** Role / headline — rendered in the NUS brand gradient. */
  role?: string;
  /** Standfirst line under the role (e.g. current status). */
  tagline?: string;
  contacts?: ContactItem[];
  socials?: SocialItem[];
  /**
   * Headshot URL. When present, an xl Avatar is rendered above the name
   * (centred), giving the hero an identity anchor instead of leaving the
   * name floating in empty space. Falls back to initials on load failure.
   */
  avatarSrc?: string;
  className?: string;
}

/** Icon for a contact row, by type. */
const contactIcon = (type: string) => {
  if (type === 'email') return <Mail className="size-[18px]" />;
  if (type === 'phone') return <Phone className="size-[18px]" />;
  return <MapPin className="size-[18px]" />;
};

/** Build the href for a contact value. */
const contactHref = (type: string, value: string) => {
  if (type === 'email') return `mailto:${value}`;
  if (type === 'phone') return `tel:${value}`;
  return undefined;
};

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
});

export const ProfileHero: React.FC<ProfileHeroProps> = ({
  name,
  role,
  tagline,
  contacts = [],
  socials = [],
  avatarSrc,
  className,
}) => (
  <section
    {...dsRoot}
    className={cn('mx-auto w-full max-w-5xl px-4 py-10 sm:py-14', className)}
  >
    {/* Card — bordered, faint grid backdrop, sits on the page. Replaces
        the previous centered name-floating-in-space layout (silan,
        2026-05-22) with a zangwei.dev-style left-text / right-portrait
        composition. */}
    <motion.div
      {...fade(0)}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-ds-border bg-ds-surface-1 shadow-sm',
        'px-6 py-8 sm:px-10 sm:py-12',
      )}
    >
      {/* Faint grid backdrop — pure CSS, no asset. Two crossed linear
          gradients drawn at 32px intervals, very low contrast so it reads
          as paper grain not graph paper. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--ds-color-border) 1px, transparent 1px),' +
            'linear-gradient(to bottom, var(--ds-color-border) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 80%)',
          WebkitMaskImage:
            'radial-gradient(ellipse at center, black 40%, transparent 80%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between sm:gap-12">
        {/* Text column */}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          {name && (
            <motion.h1
              {...fade(0.04)}
              className="text-6xl font-bold leading-[1.02] tracking-[-0.03em] text-ds-fg sm:text-7xl"
            >
              {name}
            </motion.h1>
          )}

          {/* Role — quiet muted line (was a flowing brand-gradient that
              competed with the name; zangwei.dev keeps this small + grey). */}
          {role && (
            <motion.p
              {...fade(0.08)}
              className="mt-4 text-ds-base text-ds-fg-muted sm:text-ds-lg"
            >
              {role}
            </motion.p>
          )}

          {/* Tagline */}
          {tagline && (
            <motion.p
              {...fade(0.14)}
              className="mt-3 max-w-xl text-ds-sm leading-[1.65] text-ds-fg-subtle sm:text-ds-base"
            >
              {tagline}
            </motion.p>
          )}
        </div>

        {/* Portrait column */}
        {avatarSrc && (
          <motion.div {...fade(0.06)} className="shrink-0">
            <Avatar
              src={avatarSrc}
              name={name}
              size="xl"
              className="size-36 ring-[6px] ring-ds-bg shadow-lg md:size-40"
            />
          </motion.div>
        )}
      </div>
    </motion.div>

    {/* Contact row — sits below the card, inline + hairline-quiet. */}
    {contacts.length > 0 && (
      <motion.div
        {...fade(0.2)}
        className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
      >
        {contacts.map((c, i) => {
          const href = contactHref(c.type, c.value);
          const body = (
            <>
              <span className="text-ds-fg-subtle transition-colors duration-ds-fast group-hover:text-ds-primary">
                {contactIcon(c.type)}
              </span>
              {c.value}
            </>
          );
          const cls =
            'group inline-flex items-center gap-2 text-ds-sm text-ds-fg-muted transition-colors duration-ds-fast';
          return href ? (
            <a key={i} href={href} className={cn(cls, 'hover:text-ds-fg')}>
              {body}
            </a>
          ) : (
            <span key={i} className={cls}>
              {body}
            </span>
          );
        })}
      </motion.div>
    )}

    {/* Social links — bare icon row (silan, 2026-05-22). zangwei.dev-style:
        no chip, no border, just a wide-spaced row of muted glyphs that
        darken on hover. Larger icons (22px) because they're the only mass
        on this row now. */}
    {socials.length > 0 && (
      <motion.div
        {...fade(0.28)}
        className="mt-8 flex justify-center gap-7"
      >
        {socials.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            title={s.label}
            className={cn(
              'inline-flex items-center justify-center text-ds-fg-muted',
              'transition-colors duration-ds-fast ease-ds-standard',
              'hover:text-ds-fg',
              '[&_svg]:size-[22px]',
            )}
          >
            {s.icon ?? <Globe className="size-[22px]" />}
          </a>
        ))}
      </motion.div>
    )}
  </section>
);
