export const withoutRepeatedTitle = (markdown: string, title: string) => {
  const lines = markdown.trimStart().split('\n');
  const first = lines[0]?.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (first?.[1].trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase()) {
    return lines.slice(1).join('\n').trimStart();
  }
  return markdown;
};

export const markdownToPlainExcerpt = (
  markdown: string,
  title: string,
  maxLength = 220,
) => {
  const plain = withoutRepeatedTitle(markdown ?? '', title)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}...`;
};
