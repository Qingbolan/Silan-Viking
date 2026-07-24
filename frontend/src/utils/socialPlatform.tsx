import React from 'react';
import {
  Github,
  Linkedin,
  Twitter,
  Youtube,
  Instagram,
  Facebook,
  Send,
  Mail,
  Globe,
  GraduationCap,
} from 'lucide-react';

const PyPiIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3.5 19.5 7.8v8.4L12 20.5l-7.5-4.3V7.8L12 3.5Z" />
    <path d="M4.9 8.1 12 12.2l7.1-4.1" />
    <path d="M12 12.2v8" />
    <text
      x="12"
      y="15.7"
      fill="currentColor"
      stroke="none"
      textAnchor="middle"
      fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontSize="4.5"
      fontWeight="700"
      letterSpacing="-0.2"
    >
      Py
    </text>
  </svg>
);

const NpmIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.75" y="7.25" width="18.5" height="9.5" rx="1.5" />
    <text
      x="12"
      y="14.4"
      fill="currentColor"
      stroke="none"
      textAnchor="middle"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
      fontSize="5.7"
      fontWeight="800"
      letterSpacing="-0.6"
    >
      npm
    </text>
  </svg>
);

/**
 * Resolving a social link to its platform — by URL first, name second.
 *
 * A `social_links` entry carries a `platform` label and a `url`. The label
 * is author-typed ("GitHub", "github", "GH", …) so it cannot be matched
 * exactly; the URL host is reliable. This module identifies the platform
 * from the URL host, falling back to the label, so a link always shows the
 * right icon instead of a generic globe.
 */

/** A recognised social platform. `website` is the catch-all. */
export type SocialPlatform =
  | 'github'
  | 'linkedin'
  | 'twitter'
  | 'youtube'
  | 'instagram'
  | 'facebook'
  | 'telegram'
  | 'scholar'
  | 'pypi'
  | 'npm'
  | 'email'
  | 'website';

/** Per-platform host fragments and the lucide icon to render. */
const PLATFORMS: {
  id: SocialPlatform;
  label: string;
  hosts: string[];
  icon: React.ReactNode;
}[] = [
  { id: 'github', label: 'GitHub', hosts: ['github.com', 'github.io'], icon: <Github /> },
  { id: 'linkedin', label: 'LinkedIn', hosts: ['linkedin.com', 'linked.in'], icon: <Linkedin /> },
  { id: 'twitter', label: 'X', hosts: ['twitter.com', 'x.com'], icon: <Twitter /> },
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be'], icon: <Youtube /> },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com'], icon: <Instagram /> },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.com'], icon: <Facebook /> },
  { id: 'telegram', label: 'Telegram', hosts: ['t.me', 'telegram.me'], icon: <Send /> },
  { id: 'scholar', label: 'Google Scholar', hosts: ['scholar.google.com', 'scholar.google.'], icon: <GraduationCap /> },
  { id: 'pypi', label: 'PyPI', hosts: ['pypi.org', 'pythonhosted.org'], icon: <PyPiIcon /> },
  { id: 'npm', label: 'npm', hosts: ['npmjs.com'], icon: <NpmIcon /> },
];

/**
 * Identify a social link's platform.
 *
 * `url` is checked first — its host is the reliable signal. If the URL is
 * absent or unrecognised, `name` (the author-typed platform label) is matched
 * as a substring. Anything unmatched is `website`.
 */
export function identifySocialPlatform(url?: string, name?: string): SocialPlatform {
  const u = (url || '').toLowerCase();
  if (u.startsWith('mailto:') || u.includes('@')) {
    // A bare email or a mailto link.
    if (u.startsWith('mailto:') || /^[^/]+@[^/]+\.[^/]+$/.test(u)) return 'email';
  }
  for (const p of PLATFORMS) {
    if (p.hosts.some((h) => u.includes(h))) return p.id;
  }
  // Fall back to the typed label.
  const n = (name || '').toLowerCase().trim();
  if (n) {
    for (const p of PLATFORMS) {
      if (n.includes(p.id) || n.includes(p.label.toLowerCase())) return p.id;
    }
    if (n.includes('mail') || n.includes('email')) return 'email';
    if (n.includes('scholar')) return 'scholar';
  }
  return 'website';
}

/** The lucide icon element for a resolved platform. */
export function socialPlatformIcon(platform: SocialPlatform): React.ReactNode {
  if (platform === 'email') return <Mail />;
  if (platform === 'website') return <Globe />;
  return PLATFORMS.find((p) => p.id === platform)?.icon ?? <Globe />;
}

/** A clean display label for a resolved platform. */
export function socialPlatformLabel(platform: SocialPlatform): string {
  if (platform === 'email') return 'Email';
  if (platform === 'website') return 'Website';
  return PLATFORMS.find((p) => p.id === platform)?.label ?? 'Website';
}

/**
 * One-shot helper: resolve a link's icon and label from its url + name.
 * `preferTypedLabel` keeps the author's own label when it is non-empty —
 * useful where the label is shown verbatim (e.g. "Personal Site").
 */
export function resolveSocialLink(
  url?: string,
  name?: string,
): { platform: SocialPlatform; icon: React.ReactNode; label: string } {
  const platform = identifySocialPlatform(url, name);
  return {
    platform,
    icon: socialPlatformIcon(platform),
    label: socialPlatformLabel(platform),
  };
}
