import { useMemo, useState } from 'react';
import { fromMarkdown } from 'mdast-util-from-markdown';
import type { Nodes } from 'mdast';

const nodeText = (node: Nodes): string => 'value' in node
  ? node.value
  : 'children' in node ? node.children.map((child) => nodeText(child as Nodes)).join('') : '';

/** Source-derived headings stay current in rich, source and preview modes. */
export function ContentOutline({ markdown, language }: { markdown: string; language: string }) {
  const [active, setActive] = useState<number | null>(null);
  const headings = useMemo(() => {
    const result: { text: string; depth: number; start: number; end: number }[] = [];
    const visit = (node: Nodes) => {
      if (node.type === 'heading') result.push({
        text: nodeText(node), depth: node.depth,
        start: node.position?.start.offset ?? 0, end: node.position?.end.offset ?? 0,
      });
      if ('children' in node) node.children.forEach((child) => visit(child as Nodes));
    };
    visit(fromMarkdown(markdown));
    return result;
  }, [markdown]);

  const focus = (index: number) => {
    const heading = headings[index];
    const root = document.querySelector('.content-writing-panel:not(.is-hidden)');
    if (!root) return;
    const textarea = root.querySelector<HTMLTextAreaElement>('.markdown-workspace-editor:not([aria-hidden="true"]) textarea');
    if (textarea && textarea.getClientRects().length) {
      textarea.focus();
      textarea.setSelectionRange(heading.start, heading.end);
      const line = markdown.slice(0, heading.start).split('\n').length - 1;
      textarea.scrollTop = Math.max(0, line * (parseFloat(getComputedStyle(textarea).lineHeight) || 24) - textarea.clientHeight / 3);
      textarea.dispatchEvent(new Event('scroll'));
    } else {
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
      const matches = [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')]
        .filter((el) => el.getClientRects().length && normalize(el.textContent || '') === normalize(heading.text));
      const occurrence = headings.slice(0, index).filter((h) => normalize(h.text) === normalize(heading.text)).length;
      const target = matches[occurrence];
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    setActive(index);
  };

  if (!headings.length) return <p className="content-outline-empty">{language === 'zh' ? '添加标题后，大纲会显示在这里。' : 'Add headings to see the document outline.'}</p>;
  const minDepth = Math.min(...headings.map((h) => h.depth));
  return <div className="content-outline" role="group" aria-label="Document outline">
    {headings.map((heading, index) => <button
      type="button" key={`${heading.start}:${heading.text}`}
      className={`content-tree-row content-outline-row ${active === index ? 'active' : ''}`}
      style={{ paddingLeft: 16 + (heading.depth - minDepth) * 14 }}
      aria-current={active === index ? 'location' : undefined}
      onClick={() => focus(index)}
    ><span>{heading.text}</span></button>)}
  </div>;
}
