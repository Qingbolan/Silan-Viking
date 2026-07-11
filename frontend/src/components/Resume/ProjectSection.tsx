import React, { useMemo } from 'react';
import { ProfileHero, type ContactItem, type SocialItem } from '../../components/ds';
import { resolveSocialLink } from '../../utils/socialPlatform';

interface ContactInfo {
  type: string;
  value: string;
  bio?: string;
}

interface SocialLink {
  type: string;
  url: string;
}

interface ProjectSectionProps {
  name?: string;
  title?: string;
  current?: string;
  contacts?: ContactInfo[];
  socialLinks?: SocialLink[];
  /** Headshot URL — passed straight through to ProfileHero. */
  avatarSrc?: string;
}

/**
 * Résumé hero. A thin adapter over the ds `ProfileHero` — maps the app's
 * résumé contact / social shapes onto the design-system component.
 */
const ProjectSection: React.FC<ProjectSectionProps> = ({
  name = '',
  title = '',
  current = '',
  contacts = [],
  socialLinks = [],
  avatarSrc,
}) => {
  const dsContacts = useMemo<ContactItem[]>(
    () =>
      (contacts ?? []).map((c) => ({
        // The ds component understands 'email' | 'phone' | 'location';
        // everything else falls back to the location icon.
        type: c.type === 'email' || c.type === 'phone' ? c.type : 'location',
        value: c.value,
      })),
    [contacts],
  );

  const dsSocials = useMemo<SocialItem[]>(
    () =>
      (socialLinks ?? []).map((link) => {
        // Identify the platform from the URL (reliable) then the typed
        // label, so the icon matches GitHub / LinkedIn / … instead of
        // always falling back to a generic globe.
        const { icon, label } = resolveSocialLink(link.url, link.type);
        return {
          label,
          url: link.url || '#',
          icon,
        };
      }),
    [socialLinks],
  );

  return (
    <ProfileHero
      name={name}
      role={title}
      tagline={current}
      contacts={dsContacts}
      socials={dsSocials}
      avatarSrc={avatarSrc}
    />
  );
};

export default ProjectSection;
