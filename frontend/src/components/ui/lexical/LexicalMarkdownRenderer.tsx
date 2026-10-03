import React from 'react';
import { CodeExtension, registerCodeHighlighting } from '@lexical/code';
import { configExtension } from '@lexical/extension';
import {
  $convertFromMarkdownString,
  MdastCommonMarkExtension,
  MdastExtension,
  MdastGfmExtension,
  MdastHtmlExtension,
  MdastShortcutsExtension,
} from '@lexical/mdast';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { defineExtension, type EditorThemeClasses } from 'lexical';
import { iconSrcForHref } from '../../../utils/linkIcon';
import { MarkdownMediaExtension } from './MarkdownMediaNode';
import { MarkdownTableSemanticsExtension } from './MarkdownTableSemantics';

interface LexicalMarkdownRendererProps {
  content: string;
  richLinks: boolean;
}

const codeToken = (kind: string): string => `token ${kind}`;

const theme: EditorThemeClasses = {
  code: 'markdown-code-block',
  codeHighlight: {
    atrule: codeToken('property'),
    attr: codeToken('property'),
    boolean: codeToken('boolean'),
    builtin: codeToken('builtin'),
    cdata: codeToken('comment'),
    char: codeToken('string'),
    class: codeToken('class'),
    'class-name': codeToken('class'),
    comment: codeToken('comment'),
    constant: codeToken('constant'),
    deleted: codeToken('deleted'),
    doctype: codeToken('comment'),
    entity: codeToken('operator'),
    function: codeToken('function'),
    important: codeToken('important'),
    inserted: codeToken('inserted'),
    keyword: codeToken('keyword'),
    namespace: codeToken('namespace'),
    number: codeToken('number'),
    operator: codeToken('operator'),
    prolog: codeToken('comment'),
    property: codeToken('property'),
    punctuation: codeToken('punctuation'),
    regex: codeToken('regex'),
    selector: codeToken('selector'),
    string: codeToken('string'),
    symbol: codeToken('constant'),
    tag: codeToken('tag'),
    url: codeToken('url'),
    variable: codeToken('variable'),
  },
  heading: {
    h1: 'markdown-heading markdown-heading--h1',
    h2: 'markdown-heading markdown-heading--h2',
    h3: 'markdown-heading markdown-heading--h3',
    h4: 'markdown-heading markdown-heading--h4',
    h5: 'markdown-heading markdown-heading--h5',
    h6: 'markdown-heading markdown-heading--h6',
  },
  hr: 'markdown-horizontal-rule',
  image: 'markdown-media',
  link: 'markdown-link',
  list: {
    checklist: 'markdown-checklist',
    listitem: 'markdown-list-item',
    listitemChecked: 'task-list-item task-list-item--checked',
    listitemUnchecked: 'task-list-item task-list-item--unchecked',
    nested: { listitem: 'markdown-list-item--nested' },
    ol: 'markdown-list markdown-list--ordered',
    ul: 'markdown-list markdown-list--unordered',
  },
  paragraph: 'markdown-paragraph',
  quote: 'markdown-quote',
  table: 'markdown-table',
  tableCell: 'markdown-table-cell',
  tableCellHeader: 'markdown-table-cell--header',
  tableRow: 'markdown-table-row',
  tableScrollableWrapper: 'markdown-table-scroll',
  text: {
    bold: 'markdown-text--bold',
    code: 'markdown-inline-code',
    italic: 'markdown-text--italic',
    strikethrough: 'markdown-text--strikethrough',
  },
};

const slugifyHeading = (value: string): string => (
  value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
);

const enhanceReadingSurface = (root: HTMLElement, richLinks: boolean): void => {
  const headingSlugs = new Map<string, number>();
  root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const base = slugifyHeading(heading.textContent ?? '') || 'section';
    const occurrence = headingSlugs.get(base) ?? 0;
    headingSlugs.set(base, occurrence + 1);
    heading.id = occurrence === 0 ? base : `${base}-${occurrence + 1}`;
  });

  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }

    if (!richLinks || !href || href.startsWith('#') || !anchor.textContent?.trim()) return;
    anchor.classList.add('markdown-rich-link');
    anchor.dataset.ds = 'rich-link';
    anchor.dataset.richLink = 'true';
    anchor.style.setProperty('--markdown-link-icon', `url("${iconSrcForHref(href)}")`);
  });

  root.querySelectorAll<HTMLElement>('.markdown-table-scroll').forEach((tableWrapper) => {
    tableWrapper.setAttribute('role', 'region');
    tableWrapper.setAttribute('aria-label', 'Scrollable table');
    tableWrapper.tabIndex = 0;
  });
};

const ReadingSurfacePlugin: React.FC<{ richLinks: boolean }> = ({ richLinks }) => {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    let root: HTMLElement | null = null;
    const enhance = () => {
      if (root) enhanceReadingSurface(root, richLinks);
    };
    const unregisterRoot = editor.registerRootListener((nextRoot) => {
      root = nextRoot;
      enhance();
    });
    const unregisterUpdate = editor.registerUpdateListener(enhance);
    enhance();
    return () => {
      unregisterUpdate();
      unregisterRoot();
    };
  }, [editor, richLinks]);

  return null;
};

const CodeHighlightPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  React.useEffect(() => registerCodeHighlighting(editor), [editor]);
  return null;
};

const contentKey = (content: string, richLinks: boolean): string => {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}-${content.length}-${richLinks ? 'rich' : 'plain'}`;
};

export const createPublicMarkdownExtension = (content: string, editable = false) => defineExtension({
  $initialEditorState: () => $convertFromMarkdownString(content),
  dependencies: [
    MdastCommonMarkExtension,
    MdastGfmExtension,
    MarkdownTableSemanticsExtension,
    MdastHtmlExtension,
    CodeExtension,
    MdastExtension,
    MarkdownMediaExtension,
    configExtension(MdastShortcutsExtension, { disabled: !editable }),
  ],
  editable,
  name: 'silan/public-markdown',
  namespace: 'silan-public-markdown',
  onError: (error: Error) => {
    throw error;
  },
  theme,
});

const LexicalMarkdownRenderer: React.FC<LexicalMarkdownRendererProps> = ({ content, richLinks }) => {
  const key = contentKey(content, richLinks);
  const extension = React.useMemo(() => createPublicMarkdownExtension(content), [content]);

  return (
    <LexicalExtensionComposer key={key} extension={extension} contentEditable={null}>
      <RichTextPlugin
        contentEditable={(
          <ContentEditable
            className="markdown-body"
            role="document"
            aria-label="Rendered Markdown"
            spellCheck={false}
          />
        )}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <ListPlugin />
      <CheckListPlugin disableTakeFocusOnClick />
      <LinkPlugin />
      <ClickableLinkPlugin />
      <TablePlugin hasCellMerge={false} hasHorizontalScroll />
      <CodeHighlightPlugin />
      <ReadingSurfacePlugin richLinks={richLinks} />
    </LexicalExtensionComposer>
  );
};

export default LexicalMarkdownRenderer;

