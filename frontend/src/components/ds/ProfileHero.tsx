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
  className,
}) => (
  <section
    {...dsRoot}
    className={cn('mx-auto max-w-3xl px-4 py-16 text-center sm:py-20', className)}
  >
    {/* Name — the focal point. */}
    {name && (
      <motion.h1
        {...fade(0)}
        className="text-5xl font-bold leading-[1.05] tracking-[-0.025em] text-ds-fg md:text-6xl"
      >
        {name}
      </motion.h1>
    )}

    {/* Role — flowing NUS brand gradient (orange ⇄ lifted blue). Fixed
        brand hues via `.ds-text-gradient-flow`, so it is identical in
        light and dark; the gradient pans on a slow loop. */}
    {role && (
      <motion.p
        {...fade(0.08)}
        className="ds-text-gradient-flow mt-3 text-xl font-semibold sm:text-2xl"
      >
        {role}
      </motion.p>
    )}

    {/* Tagline — quiet standfirst. */}
    {tagline && (
      <motion.p
        {...fade(0.16)}
        className="mx-auto mt-4 max-w-xl text-ds-base leading-[1.6] text-ds-fg-muted"
      >
        {tagline}
      </motion.p>
    )}

    {/* Contact row — inline, hairline-quiet. */}
    {contacts.length > 0 && (
      <motion.div
        {...fade(0.24)}
        className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
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

    {/* Social links — square hairline buttons; hover lifts to NUS orange. */}
    {socials.length > 0 && (
      <motion.div
        {...fade(0.32)}
        className="mt-7 flex justify-center gap-2.5"
      >
        {socials.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.label}
            className={cn(
              'flex size-10 items-center justify-center rounded-ds-md border border-ds-border bg-ds-surface-1 text-ds-fg-muted',
              'transition-colors duration-ds-fast ease-ds-standard',
              'hover:border-ds-primary/30 hover:bg-ds-primary-soft hover:text-ds-primary',
              '[&_svg]:size-[18px]',
            )}
          >
            {s.icon ?? <Globe className="size-[18px]" />}
          </a>
        ))}
      </motion.div>
    )}
  </section>
);
