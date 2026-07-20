// Lightweight browser fingerprint for local authorization (no PII)
// Combines userAgent, language, platform, hardwareConcurrency, and timezone
// and stores a stable browser ID in both a first-party cookie and localStorage.
// The cookie is the cross-page identity contract; localStorage preserves
// continuity for existing visitors and privacy-restricted environments.

const STORAGE_KEY = 'client_fingerprint_v1';
const COOKIE_KEY = 'silan_visitor_id';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const readCookie = (): string | undefined => {
  try {
    const prefix = `${COOKIE_KEY}=`;
    return document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
  } catch {
    return undefined;
  }
};

const persistBrowserID = (value: string) => {
  try {
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  } catch {
    // Cookies can be unavailable in privacy-restricted contexts.
  }
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // The in-memory value still works for the current page lifetime.
  }
};

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function generateRawFingerprint(): string {
  const navigatorInfo = [
    navigator.userAgent,
    navigator.language,
    (navigator as any).platform,
    (navigator as any).hardwareConcurrency,
    (navigator as any).deviceMemory,
  ].join('|');

  const screenInfo = [
    window.screen.width,
    window.screen.height,
    window.devicePixelRatio,
  ].join('x');

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'tz';

  return hashString(`${navigatorInfo}|${screenInfo}|${tz}`);
}

export function getClientFingerprint(): string {
  const cookieValue = readCookie();
  if (cookieValue) {
    const decoded = decodeURIComponent(cookieValue);
    persistBrowserID(decoded);
    return decoded;
  }

  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      persistBrowserID(existing);
      return existing;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }

  const raw = generateRawFingerprint();
  // Add a random nonce once to avoid collisions across users sharing exact env
  const nonce = Math.random().toString(36).slice(2, 8);
  const fp = `${raw}-${nonce}`;
  persistBrowserID(fp);
  return fp;
}

export function resetClientFingerprint(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Reset is best-effort when storage access is blocked.
  }
  try {
    document.cookie = `${COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // Reset is best-effort when cookie access is blocked.
  }
}
