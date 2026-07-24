// src/components/ds/ProfileHero.tsx
//
// Design-system ProfileHero — a full-bleed editorial opening for a résumé /
// about page. The portrait is a visual anchor; the copy and a small set of
// explicit actions provide the visitor's next step without turning the hero
// into a dashboard or a profile card.
//
// Self-contained: takes plain `ContactItem[]` / `SocialItem[]`, decoupled
// from the app's résumé model.
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, Mail, Phone, MapPin, Globe } from 'lucide-react';
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

export interface HeroAction {
  label: string;
  href: string;
  /** The first action is the visual primary action by default. */
  primary?: boolean;
}

export interface HeroIllustration {
  src: string;
  alt?: string;
  /** Full-colour bitmap or theme-inverted transparent line art. */
  tone?: 'full-color' | 'line-art';
  className?: string;
}

export interface ProfileHeroProps {
  name: string;
  /** Role / research focus. */
  role?: string;
  /** Standfirst line under the role (e.g. current status). */
  tagline?: string;
  contacts?: ContactItem[];
  socials?: SocialItem[];
  /** A small, explicit next step — avoids making visitors infer an action from icon-only navigation. */
  actions?: HeroAction[];
  /**
   * Headshot URL. When present, an xl Avatar is rendered above the name
   * (centred), giving the hero an identity anchor instead of leaving the
   * name floating in empty space.
   */
  avatarSrc?: string;
  /** Optional illustrations for the desktop-only empty space near the hero footer. */
  bottomIllustrations?: HeroIllustration[];
  /** Disable static rings, shadows, and separator lines for cardless pages. */
  chrome?: boolean;
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
  actions = [],
  avatarSrc,
  bottomIllustrations = [],
  chrome = true,
  className,
}) => {
  const illustrationSlots = [
    'bottom-9 right-8 hidden h-36 w-36 lg:block xl:right-14 xl:h-44 xl:w-44',
    'bottom-7 right-36 hidden h-44 w-44 opacity-[0.58] xl:right-56 xl:block xl:h-56 xl:w-56',
  ];

  return (
    <section
      {...dsRoot}
      className={cn(
        'relative isolate mx-auto w-full max-w-5xl overflow-hidden px-4 py-8 sm:px-10 sm:py-14',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 size-64 rounded-full bg-ds-primary/10 blur-3xl sm:-translate-y-1/3 sm:translate-x-1/3 sm:size-80" />
      <div aria-hidden className="pointer-events-none absolute left-6 top-0 h-20 w-px bg-ds-primary/50 sm:left-10" />

      {avatarSrc && (
        <motion.div
          {...fade(0)}
          className={cn(
            'absolute right-6 top-8 z-10 size-28 rounded-full sm:right-10 sm:top-12 sm:size-36',
            chrome && 'shadow-[0_16px_36px_-24px_rgba(0,0,0,0.72)] ring-1 ring-black/15 dark:ring-white/25',
          )}
          animate={{ opacity: 1, y: [0, -3, 0] }}
          transition={{ opacity: { duration: 0.45 }, y: { duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
        >
          <Avatar
            src={avatarSrc}
            name={name}
            size="xl"
            bordered={false}
            className="size-full rounded-full shadow-none"
          />
        </motion.div>
      )}

      <div className="relative z-10 min-w-0 max-w-3xl pt-24 sm:pt-20">
        <motion.p
          {...fade(0.03)}
          className="max-w-[12rem] font-mono text-[0.6875rem] font-medium uppercase leading-5 tracking-[0.18em] text-ds-primary sm:max-w-none"
        >
          NUS · Computing / AI Systems
        </motion.p>

        {name && (
          <motion.h1
            {...fade(0.08)}
            className="mt-4 max-w-[7ch] text-[clamp(3.75rem,16vw,5.5rem)] font-semibold leading-[0.88] tracking-[-0.065em] text-ds-fg sm:max-w-none sm:text-7xl"
          >
            {name}
          </motion.h1>
        )}

        {role && (
          <motion.p
            {...fade(0.15)}
            className="mt-8 max-w-[19rem] text-xl font-medium leading-[1.24] tracking-[-0.02em] text-ds-fg sm:max-w-2xl sm:text-3xl"
          >
            {role}
          </motion.p>
        )}

        {tagline && (
          <motion.p
            {...fade(0.21)}
            className="mt-4 max-w-[20rem] text-sm leading-6 text-ds-fg-muted sm:max-w-xl sm:text-ds-base"
          >
            {tagline}
          </motion.p>
        )}

        {actions.length > 0 && (
          <motion.nav {...fade(0.27)} aria-label="Profile actions" className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            {actions.map((action, index) => {
              const primary = action.primary ?? index === 0;
              return (
                <a
                  key={`${action.href}-${action.label}`}
                  href={action.href}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-all duration-ds-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ds-ring',
                    primary
                      ? cn(
                          'rounded-full bg-ds-primary px-5 text-ds-primary-fg hover:-translate-y-0.5 hover:bg-ds-primary-hover',
                          chrome && 'shadow-sm',
                        )
                      : 'text-ds-fg-muted underline decoration-ds-border-strong underline-offset-4 hover:text-ds-fg hover:decoration-ds-primary',
                  )}
                >
                  {action.label}
                  {primary && <ArrowUpRight size={16} aria-hidden />}
                </a>
              );
            })}
          </motion.nav>
        )}
      </div>

      {bottomIllustrations.map((illustration, index) => (
        <motion.img
          key={`${illustration.src}-${index}`}
          {...fade(0.48 + index * 0.05)}
          src={illustration.src}
          alt={illustration.alt ?? ''}
          aria-hidden={illustration.alt ? undefined : true}
          className={cn(
            'pointer-events-none absolute z-0 select-none object-contain',
            illustrationSlots[index] ?? illustrationSlots[illustrationSlots.length - 1],
            illustration.tone === 'line-art' && 'dark:invert',
            illustration.className,
          )}
          draggable={false}
        />
      ))}

      {/* Contact information is a quiet proof line, not a second visual block. */}
      {contacts.length > 0 && (
        <motion.div
          {...fade(0.34)}
          className={cn(
            'relative z-10 mt-9 flex flex-col gap-0.5 pt-3 sm:mt-12 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2',
            chrome && 'border-t border-ds-border',
          )}
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
              'group inline-flex min-h-11 items-center gap-2 pr-2 text-ds-sm text-ds-fg-muted transition-colors duration-ds-fast';
            return href ? (
              <a
                key={i}
                href={href}
                className={cn(
                  cls,
                  'rounded-ds-md hover:text-ds-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-ring',
                )}
              >
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

      {/* Social links remain secondary but have reliable touch targets. */}
      {socials.length > 0 && (
        <motion.div
          {...fade(0.4)}
          className="relative z-10 mt-2 flex gap-1 sm:mt-3"
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
                'inline-flex size-11 items-center justify-center rounded-full text-ds-fg-muted',
                'transition-colors duration-ds-fast ease-ds-standard active:scale-95',
                'hover:bg-ds-primary-soft hover:text-ds-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-ring',
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
};
