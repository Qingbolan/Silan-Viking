const parseTimestamp = (value: string) => {
  const trimmed = value.trim();
  const normalized = trimmed
    // SQLite-style timestamps use a space and may omit the leading hour zero.
    .replace(
      /^(\d{4}-\d{2}-\d{2})\s+(\d):/,
      '$1T0$2:',
    )
    .replace(
      /^(\d{4}-\d{2}-\d{2})\s+(\d{2}):/,
      '$1T$2:',
    )
    // JavaScript dates only need millisecond precision; retain the timezone.
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/\s+([+-]\d{2}:\d{2})(?::\d{2})?$/, '$1');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatShortDate = (value: string) => {
  if (!value) return 'undated';
  const date = parseTimestamp(value);
  if (!date) return 'undated';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatSyncedAgo = (value: string | null) => {
  if (!value) return 'Never synced';
  const date = parseTimestamp(value);
  if (!date) return 'Never synced';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Synced just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days}d ago`;
};

export const slugPreview = (title: string) => {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${slug}-...` : '...';
};
