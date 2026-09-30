import type { Moment } from '../types/api';

/** Newest-first chronological reading order; API order breaks same-day ties. */
export function adjacentMoments(items: Moment[], currentId: string) {
  const ordered = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const index = ordered.findIndex(item => item.id === currentId || item.slug === currentId);
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    next: index >= 0 ? ordered[index + 1] ?? null : null,
  };
}
