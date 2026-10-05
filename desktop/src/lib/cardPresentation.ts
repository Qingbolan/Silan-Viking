/** Suppress a synopsis that repeats the title, including punctuation-only differences. */
export function cardExcerpt(title: string, excerpt: string): string {
  const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const heading = normalize(title);
  const summary = normalize(excerpt);
  if (!summary || summary === heading) return '';
  if (heading.length >= 24 && (summary.startsWith(heading) || heading.startsWith(summary)
    || (summary.length >= 48 && summary.slice(0, 48) === heading.slice(0, 48)))) return '';
  return excerpt.trim();
}
