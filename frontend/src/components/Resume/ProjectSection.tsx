import React, { useMemo } from 'react';
import { Github, Linkedin, Globe } from 'lucide-react';
import { ProfileHero, type ContactItem, type SocialItem } from '../../components/ds';

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
        const type = link.type || 'unknown';
        return {
          label: type.charAt(0).toUpperCase() + type.slice(1),
          url: link.url || '#',
          icon:
            type === 'github' ? <Github /> :
            type === 'linkedin' ? <Linkedin /> :
            <Globe />,
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
    />
  );
};

export default ProjectSection;
