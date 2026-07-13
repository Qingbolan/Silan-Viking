// Lightweight browser fingerprint for local authorization (no PII)
// Combines userAgent, language, platform, hardwareConcurrency, and timezone
// and stores a stable UUID in localStorage for consistency.

const STORAGE_KEY = 'client_fingerprint_v1';

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
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }

  const raw = generateRawFingerprint();
  // Add a random nonce once to avoid collisions across users sharing exact env
  const nonce = Math.random().toString(36).slice(2, 8);
  const fp = `${raw}-${nonce}`;
  try {
    localStorage.setItem(STORAGE_KEY, fp);
  } catch {
    // The in-memory value still works for the current page lifetime.
  }
  return fp;
}

export function resetClientFingerprint(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Reset is best-effort when storage access is blocked.
  }
}

