import {
  $applyNodeReplacement,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  TextNode,
  type EditorConfig,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  defineExtension,
  configExtension,
} from 'lexical';
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  $generateNodesFromMarkdownString,
  MdastCommonMarkExtension,
  MdastExtension,
  MdastGfmExtension,
  MdastHtmlExtension,
  MdastImportExtension,
  MdastShortcutsExtension,
  type MdastExportHandler,
} from '@lexical/mdast';
import { TabIndentationExtension } from '@lexical/extension';
import { CodeExtension } from '@lexical/code';
import { $isListItemNode } from '@lexical/list';
import {
  AutoLinkExtension,
  autoLinkEmailMatcher,
  autoLinkUrlMatcher,
} from '@lexical/link';
import type { MarkdownEditorPlugin } from '../extensionPoints';
import { MarkdownImageExtension } from './MarkdownImage';
import { MarkdownTableSemanticsExtension } from './MarkdownTable';

import { cleanMarkdownHeadings } from './MarkdownHygiene';

export const SOURCE_TREE_SYNC_TAG = 'markdown-source-tree-sync';
export const EXTERNAL_MARKDOWN_SYNC_TAG = 'external-markdown-sync';
export const REVIEW_DECORATION_TAG = 'review-decoration';

const escapeInlineHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/** Markdown has no underline syntax, so preserve that explicit toolbar action
 * as a small semantic HTML island. MdastHtmlExtension imports the same markup
 * through Lexical's official DOM rules, retaining every combined text format. */
const $exportUnderlinedText: MdastExportHandler = (node) => {
  if (!$isTextNode(node) || !node.hasFormat('underline')) return null;
  let value = escapeInlineHtml(node.getTextContent());
  if (node.hasFormat('code')) value = `<code>${value}</code>`;
  if (node.hasFormat('bold')) value = `<strong>${value}</strong>`;
  if (node.hasFormat('italic')) value = `<em>${value}</em>`;
  if (node.hasFormat('strikethrough')) value = `<s>${value}</s>`;
  if (node.hasFormat('subscript')) value = `<sub>${value}</sub>`;
  if (node.hasFormat('superscript')) value = `<sup>${value}</sup>`;
  return { type: 'html', value: `<u>${value}</u>` };
};

const MarkdownUnderlineExtension = defineExtension({
  dependencies: [
    configExtension(MdastImportExtension, {
      exportRules: [{ $export: $exportUnderlinedText, type: 'text' }],
    }),
  ],
  name: 'silan/markdown-underline',
});

type SerializedReviewTextNode = Spread<{
  explanation: string;
  findingId: string;
  severity: string;
}, SerializedTextNode>;

/** A transient syntax-tree annotation. Markdown export treats it as normal text. */
export class ReviewTextNode extends TextNode {
  __findingId: string;
  __severity: string;
  __explanation: string;

  static getType() {
    return 'review-text';
  }

  static clone(node: ReviewTextNode) {
    return new ReviewTextNode(
      node.__text,
      node.__findingId,
      node.__severity,
      node.__explanation,
      node.__key,
    );
  }

  static importJSON(serialized: SerializedReviewTextNode) {
    return new ReviewTextNode(
      serialized.text,
      serialized.findingId,
      serialized.severity,
      serialized.explanation,
    ).updateFromJSON(serialized);
  }

  constructor(
    text: string,
    findingId: string,
    severity: string,
    explanation: string,
    key?: NodeKey,
  ) {
    super(text, key);
    this.__findingId = findingId;
    this.__severity = severity;
    this.__explanation = explanation;
  }

  exportJSON(): SerializedReviewTextNode {
    return {
      ...super.exportJSON(),
      explanation: this.__explanation,
      findingId: this.__findingId,
      severity: this.__severity,
      type: 'review-text',
      version: 1,
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    this.#decorateElement(element);
    return element;
  }

  updateDOM(previous: this, dom: HTMLElement, config: EditorConfig) {
    const replace = super.updateDOM(previous, dom, config);
    if (!replace) this.#decorateElement(dom);
    return replace;
  }

  #decorateElement(element: HTMLElement) {
    element.classList.add(
      'deepseek-review-mark',
      `deepseek-review-mark--${this.__severity}`,
    );
    element.dataset.reviewFinding = this.__findingId;
    element.title = this.__explanation;
  }

  getFindingId() {
    return this.getLatest().__findingId;
  }
}

export function $createReviewTextNode(
  text: string,
  findingId: string,
  severity: string,
  explanation: string,
) {
  return $applyNodeReplacement(
    new ReviewTextNode(text, findingId, severity, explanation),
  );
}

export function $isReviewTextNode(node: LexicalNode | null | undefined): node is ReviewTextNode {
  return node instanceof ReviewTextNode;
}

const editorTheme = {
  code: 'lexical-code-block',
  codeHighlight: {
    atrule: 'lexical-code-token lexical-code-token--property',
    attr: 'lexical-code-token lexical-code-token--property',
    boolean: 'lexical-code-token lexical-code-token--boolean',
    builtin: 'lexical-code-token lexical-code-token--builtin',
    cdata: 'lexical-code-token lexical-code-token--comment',
    char: 'lexical-code-token lexical-code-token--string',
    class: 'lexical-code-token lexical-code-token--class',
    'class-name': 'lexical-code-token lexical-code-token--class',
    comment: 'lexical-code-token lexical-code-token--comment',
    constant: 'lexical-code-token lexical-code-token--constant',
    deleted: 'lexical-code-token lexical-code-token--deleted',
    doctype: 'lexical-code-token lexical-code-token--comment',
    entity: 'lexical-code-token lexical-code-token--operator',
    function: 'lexical-code-token lexical-code-token--function',
    important: 'lexical-code-token lexical-code-token--important',
    inserted: 'lexical-code-token lexical-code-token--inserted',
    keyword: 'lexical-code-token lexical-code-token--keyword',
    namespace: 'lexical-code-token lexical-code-token--namespace',
    number: 'lexical-code-token lexical-code-token--number',
    operator: 'lexical-code-token lexical-code-token--operator',
    prolog: 'lexical-code-token lexical-code-token--comment',
    property: 'lexical-code-token lexical-code-token--property',
    punctuation: 'lexical-code-token lexical-code-token--punctuation',
    regex: 'lexical-code-token lexical-code-token--regex',
    selector: 'lexical-code-token lexical-code-token--selector',
    string: 'lexical-code-token lexical-code-token--string',
    symbol: 'lexical-code-token lexical-code-token--constant',
    tag: 'lexical-code-token lexical-code-token--tag',
    url: 'lexical-code-token lexical-code-token--url',
    variable: 'lexical-code-token lexical-code-token--variable',
  },
  list: {
    checklist: 'lexical-check-list',
    listitem: 'lexical-list-item',
    listitemChecked: 'lexical-list-item--checked',
    listitemUnchecked: 'lexical-list-item--unchecked',
    nested: { listitem: 'lexical-list-item--nested' },
    ol: 'lexical-ordered-list',
    ul: 'lexical-unordered-list',
  },
  text: {
    bold: 'lexical-text-bold',
    code: 'lexical-text-code',
    italic: 'lexical-text-italic',
    strikethrough: 'lexical-text-strikethrough',
    underline: 'lexical-text-underline',
  },
  table: 'lexical-table',
  tableCell: 'lexical-table-cell',
  tableCellHeader: 'lexical-table-cell--header',
  tableCellSelected: 'lexical-table-cell--selected',
  tableRow: 'lexical-table-row',
  tableScrollableWrapper: 'lexical-table-scroll',
  tableSelection: 'lexical-table--selection',
};

export function createMarkdownEditorExtension(
  readOnly: boolean,
  plugins: readonly MarkdownEditorPlugin[],
  initialMarkdown: string,
) {
  return defineExtension({
    $initialEditorState: () => $replaceDocumentFromMarkdown(initialMarkdown),
    dependencies: [
      MdastCommonMarkExtension,
      MdastGfmExtension,
      MarkdownTableSemanticsExtension,
      MdastHtmlExtension,
      CodeExtension,
      MarkdownUnderlineExtension,
      MdastExtension,
      MarkdownImageExtension,
      configExtension(MdastShortcutsExtension, { disabled: readOnly }),
      configExtension(TabIndentationExtension, {
        $canIndent: $isListItemNode,
        disabled: readOnly,
        maxIndent: 6,
      }),
      ...(!readOnly ? [configExtension(AutoLinkExtension, {
        matchers: [autoLinkUrlMatcher, autoLinkEmailMatcher],
      })] : []),
      ...plugins.flatMap((plugin) => plugin.extensions || []),
    ],
    editable: !readOnly,
    name: 'silan/markdown-editor',
    namespace: 'silan-markdown-editor',
    nodes: [ReviewTextNode, ...plugins.flatMap((plugin) => plugin.nodes || [])],
    onError: (error: Error) => {
      throw error;
    },
    theme: editorTheme,
  });
}

export function $replaceDocumentFromMarkdown(markdown: string) {
  $convertFromMarkdownString(cleanMarkdownHeadings(markdown));
}

export function $documentToMarkdown() {
  return cleanMarkdownHeadings($convertToMarkdownString());
}

export function $insertMarkdown(markdown: string) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  selection.insertNodes($generateNodesFromMarkdownString(cleanMarkdownHeadings(markdown)));
  return true;
}

export function readMarkdown(editor: LexicalEditor) {
  return editor.read(() => $documentToMarkdown());
}

export function readEditorSnapshot<T>(
  editor: LexicalEditor,
  editorState: EditorState,
  reader: () => T,
) {
  return editorState.read(reader, { editor });
}

export function replaceMarkdown(
  editor: LexicalEditor,
  markdown: string,
  tag = EXTERNAL_MARKDOWN_SYNC_TAG,
) {
  editor.update(() => {
    $replaceDocumentFromMarkdown(markdown);
  }, { discrete: true, tag });
}
