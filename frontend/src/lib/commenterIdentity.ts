import { fetchVisitorGeo } from '../api/geo';
import { getClientFingerprint } from '../utils/fingerprint';

// One site-wide guest identity is shared by every discussion surface. It is
// immediately usable without a form and enriched with coarse location once
// the visitor geo endpoint responds.
export interface StoredCommenter {
  authorName: string;
  customName: boolean;
  countryCode: string;
  regionCode: string;
}

const COMMENTER_KEY = 'article-commenter-v1';
const COMMENTER_EVENT = 'commenter-identity-change';
const UNKNOWN_COUNTRY = 'XX';
const UNKNOWN_REGION = 'NA';
let ensureCommenterPromise: Promise<StoredCommenter> | undefined;

const locationToken = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const token = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
  return token || fallback;
};

const stableGuestID = (fingerprint: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, '0').slice(-7);
};

export const buildDefaultGuestName = (
  countryCode: string,
  regionCode: string,
  fingerprint: string,
): string =>
  `guest-id<${locationToken(countryCode, UNKNOWN_COUNTRY)}/${locationToken(regionCode, UNKNOWN_REGION)}/${stableGuestID(fingerprint)}>`;

const currentFingerprint = (): string => {
  if (typeof window === 'undefined') return 'server-render';
  return getClientFingerprint();
};

export const readCommenter = (): StoredCommenter => {
  const fingerprint = currentFingerprint();
  try {
    const stored = JSON.parse(localStorage.getItem(COMMENTER_KEY) ?? '{}');
    const countryCode = locationToken(stored.countryCode, UNKNOWN_COUNTRY);
    const regionCode = locationToken(stored.regionCode, UNKNOWN_REGION);
    const storedName = typeof stored.authorName === 'string' ? stored.authorName.trim() : '';
    const customName = typeof stored.customName === 'boolean'
      ? stored.customName
      : Boolean(storedName);
    const commenter = {
      authorName: storedName || buildDefaultGuestName(countryCode, regionCode, fingerprint),
      customName,
      countryCode,
      regionCode,
    };
    if (Object.prototype.hasOwnProperty.call(stored, 'authorEmail')) {
      localStorage.setItem(COMMENTER_KEY, JSON.stringify(commenter));
    }
    return commenter;
  } catch {
    return {
      authorName: buildDefaultGuestName(UNKNOWN_COUNTRY, UNKNOWN_REGION, fingerprint),
      customName: false,
      countryCode: UNKNOWN_COUNTRY,
      regionCode: UNKNOWN_REGION,
    };
  }
};

export const persistCommenter = (commenter: StoredCommenter) => {
  try {
    localStorage.setItem(COMMENTER_KEY, JSON.stringify(commenter));
    window.dispatchEvent(new CustomEvent<StoredCommenter>(COMMENTER_EVENT, { detail: commenter }));
  } catch {
    // A blocked storage API must not prevent commenting.
  }
};

export const ensureCommenter = (): Promise<StoredCommenter> => {
  const initial = readCommenter();
  if (initial.customName) return Promise.resolve(initial);
  if (ensureCommenterPromise) return ensureCommenterPromise;

  ensureCommenterPromise = (async () => {
    const geo = await fetchVisitorGeo();
    const current = readCommenter();
    if (current.customName) return current;

    const countryCode = locationToken(geo.country_code, current.countryCode);
    const regionCode = locationToken(geo.region_code || geo.region_name, current.regionCode);
    const resolved = {
      authorName: buildDefaultGuestName(countryCode, regionCode, currentFingerprint()),
      customName: false,
      countryCode,
      regionCode,
    };
    persistCommenter(resolved);
    return resolved;
  })();
  return ensureCommenterPromise;
};

export const updateCommenterName = (authorName: string): StoredCommenter => {
  const current = readCommenter();
  const trimmedName = authorName.trim();
  const updated = {
    ...current,
    authorName: trimmedName || buildDefaultGuestName(
      current.countryCode,
      current.regionCode,
      currentFingerprint(),
    ),
    customName: Boolean(trimmedName),
  };
  persistCommenter(updated);
  return updated;
};

export const subscribeToCommenter = (listener: (commenter: StoredCommenter) => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<StoredCommenter>).detail;
    listener(detail || readCommenter());
  };
  window.addEventListener(COMMENTER_EVENT, handleChange);
  return () => window.removeEventListener(COMMENTER_EVENT, handleChange);
};
