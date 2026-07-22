const VIEW_DISPLAY_TTL_MS = 60 * 60 * 1000;

export const shouldCreditViewDisplay = (scope: string, entityId: string): boolean => {
  if (typeof window === 'undefined') return false;
  const key = `silan:${scope}-view-display:${entityId}`;
  const now = Date.now();
  try {
    const previous = Number(window.localStorage.getItem(key) || 0);
    if (Number.isFinite(previous) && now - previous < VIEW_DISPLAY_TTL_MS) {
      return false;
    }
    window.localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
};
