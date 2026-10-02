import { apiUrl, formatLanguage } from './utils';
import { getClientFingerprint } from '../utils/fingerprint';
import { isPrerenderRuntime } from '../utils/runtimeContext';

/** Browser-only observation; fetching content during prerender never records a view. */
export const recordContentView = async (
  endpoint: string,
  language: 'en' | 'zh' = 'en',
): Promise<boolean> => {
  if (isPrerenderRuntime()) return false;
  try {
    const response = await fetch(apiUrl(`${endpoint}?lang=${formatLanguage(language)}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fingerprint: getClientFingerprint(),
        user_agent_full: navigator.userAgent,
        referrer: document.referrer,
        landing_url: window.location.href,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};
