import type { BlogContent } from '../types/blog';

const normalizedContentText = (value: string): string =>
  value
    .replace(/^#{1,6}\s+/, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

export const isLeadingMetadataDuplicate = (
  item: BlogContent,
  title: string,
  summary?: string,
): boolean => {
  const content = normalizedContentText(item.content);
  if (!content) return false;
  if (content === normalizedContentText(title)) return true;
  return Boolean(summary && content === normalizedContentText(summary));
};

export const stripLeadingMetadataDuplicates = (
  content: BlogContent[],
  title: string,
  summary?: string,
): BlogContent[] => {
  let startIndex = 0;
  while (
    startIndex < content.length &&
    isLeadingMetadataDuplicate(content[startIndex], title, summary)
  ) {
    startIndex += 1;
  }
  return startIndex > 0 ? content.slice(startIndex) : content;
};
