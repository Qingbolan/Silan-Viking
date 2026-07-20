export const withoutRepeatedTitle = (markdown: string, title: string) => {
  const lines = markdown.trimStart().split('\n');
  const first = lines[0]?.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
  if (first?.[1].trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase()) {
    return lines.slice(1).join('\n').trimStart();
  }
  return markdown;
};
