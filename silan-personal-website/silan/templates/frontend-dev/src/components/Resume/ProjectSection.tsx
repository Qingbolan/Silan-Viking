import React, { useMemo } from 'react';
import { useLanguage } from '../../components/LanguageContext';
import { ProfileHero, type ContactItem, type HeroAction, type HeroIllustration, type SocialItem } from '../../components/ds';
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
  /** Desktop-only illustrations for unused hero space. */
  bottomIllustrations?: HeroIllustration[];
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
  bottomIllustrations,
}) => {
  const { language } = useLanguage();
  const zh = language === 'zh';
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

  const heroActions = useMemo<HeroAction[]>(() => {
    const email = contacts.find((contact) => contact.type === 'email')?.value;
    return [
      { label: zh ? '浏览项目' : 'Explore work', href: '/projects', primary: true },
      ...(email ? [{ label: zh ? '联系我' : 'Start a conversation', href: `mailto:${email}` }] : []),
    ];
  }, [contacts, zh]);

  return (
    <ProfileHero
      name={name}
      role={title}
      tagline={current}
      contacts={dsContacts}
      socials={dsSocials}
      actions={heroActions}
      avatarSrc={avatarSrc}
      bottomIllustrations={bottomIllustrations}
      chrome={false}
    />
  );
};

export default ProjectSection;
