export type CoverSourceType = 'image' | 'website';

const imageCoverPattern = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const localMediaPattern = /^(silan:\/\/|\/api\/v1\/media|\/|\.{0,2}\/)/i;

export const inferCoverSourceType = (value?: string | null): CoverSourceType => {
  const source = value?.trim();
  if (!source) return 'image';
  if (imageCoverPattern.test(source)) return 'image';
  if (localMediaPattern.test(source)) return 'image';
  if (/^https?:\/\//i.test(source)) return 'website';
  return 'image';
};
