import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';

/** Remove editor/paste whitespace artifacts from headings, never code or URLs. */
export function cleanMarkdownHeadings(markdown: string): string {
  const edits: { start: number; end: number; value: string }[] = [];
  const visit = (node: RootContent) => {
    if (node.type === 'heading') {
      const texts = node.children.filter(child => child.type === 'text');
      for (const text of texts) {
        const start = text.position?.start.offset;
        const end = text.position?.end.offset;
        if (start === undefined || end === undefined) continue;
        let value = markdown.slice(start, end)
          .replace(/\u200b|\ufeff|&#(?:x200b|8203|xfeff|65279);/gi, '')
          .replace(/\u00a0|&nbsp;|&#(?:xa0|160);/gi, ' ');
        if (text === node.children[0]) value = value.replace(/^(?:[ \t]|&#(?:x20|32);)+/gi, '');
        if (text === node.children[node.children.length - 1]) value = value.replace(/(?:[ \t]|&#(?:x20|32);)+$/gi, '');
        if (value !== markdown.slice(start, end)) edits.push({ start, end, value });
      }
      return;
    }
    if ('children' in node) node.children.forEach(visit);
  };
  fromMarkdown(markdown).children.forEach(visit);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    markdown = markdown.slice(0, edit.start) + edit.value + markdown.slice(edit.end);
  }
  return markdown;
}
