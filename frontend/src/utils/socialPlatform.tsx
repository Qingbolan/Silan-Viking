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
} from 'lucide-react';

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
