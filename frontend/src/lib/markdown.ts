import { fromMarkdown } from 'mdast-util-from-markdown';
import type { RootContent } from 'mdast';

const headingText = (node: RootContent): string => {
  if ('children' in node) return node.children.map(headingText).join('');
  if (node.type === 'image') return node.alt ?? '';
  return 'value' in node ? node.value : '';
};

const normalizedTitle = (value: string): string =>
  value.normalize('NFKC').replace(/[\u200b\ufeff]/g, '').replace(/[—–]+/g, '-').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/** Compare rendered text, including entities and inline formatting, only at the document start. */
export const withoutRepeatedTitle = (markdown: string, title?: string): string => {
  if (!title) return markdown;
  const first = fromMarkdown(markdown).children[0];
  if (first?.type !== 'heading') return markdown;
  const renderedTitle = fromMarkdown(title).children.map(headingText).join('');
  if (normalizedTitle(headingText(first)) !== normalizedTitle(renderedTitle)) return markdown;
  const end = first.position?.end.offset;
  return end === undefined ? markdown : markdown.slice(end).trimStart();
};

export const markdownToPlainExcerpt = (
  markdown: string,
  title: string,
  maxLength = 220,
) => {
  const plain = withoutRepeatedTitle(markdown ?? '', title)
    // An excerpt is always rendered beside its own title. If the document
    // opens with an alternate/editorial heading, omit that heading as well
    // instead of repeating it as summary prose.
    .replace(/^\s*#{1,6}\s+[^\r\n]+(?:\r?\n|$)/, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[!\[[^\]]*]\([^)]*\)]\([^)]*\)/g, ' ')
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
