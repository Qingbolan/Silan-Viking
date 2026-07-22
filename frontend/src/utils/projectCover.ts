export type ProjectCoverSourceType = 'image' | 'website';

export const normalizeProjectCoverSourceType = (value: unknown): ProjectCoverSourceType => {
  if (value === 'website') return 'website';
  return 'image';
};
