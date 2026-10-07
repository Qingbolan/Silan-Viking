import { $extractLayoutBlock } from '../src/components/editor/media/MediaLayoutExtraction';
import { $readBlockMarkdown, $commitBlockIntoLayout, planBlockIntoLayout, type BlockLayoutZone } from '../src/components/editor/media/MediaBlockDrop';
import { mediaItemDragMode } from '../src/components/editor/media/MediaItemDrag';
import { mediaLayoutSyntax } from '../src/components/editor/media/MediaLayoutSyntax';
import { FormattingToolbar } from '../src/components/editor/plugins/FormattingToolbarPlugin';
import { MediaLayoutNode } from '../src/components/editor/media/MediaLayoutNode';
import { $wrapImageLayout, MediaLayoutController } from '../src/components/editor/media/MediaLayoutController';
import { MediaLayoutDocument, mediaLayoutFromMarkdown } from '../src/components/editor/media/MediaLayout';
import { setBlockWidth, setWrap, moveItem, setCaption } from '../src/components/editor/media/upstream/src/layout/model';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { $documentBlock, $moveDocumentBlock, $selectedDocumentBlock } from '../src/components/editor/interaction/DocumentBlocks';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { HISTORY_PUSH_TAG, UNDO_COMMAND, REDO_COMMAND } from 'lexical';
import { createElement } from 'react';
import { MathPreview, ScientificMarkdownNode } from '../src/components/editor/model/ScientificMarkdown';
import { LexicalEditorPluginRegistry } from '../src/components/editor/extensionPoints';
import { cleanMarkdownHeadings } from '../src/components/editor/model/MarkdownHygiene';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { buildEditorFromExtensions } from '@lexical/extension';
import {
  $createParagraphNode,
  $createNodeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  type LexicalNode,
} from 'lexical';
import {
  $getExtensionOutput,
  INSERT_HORIZONTAL_RULE_COMMAND,
} from '@lexical/extension';
import { MdastImportExtension } from '@lexical/mdast';
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
} from '@lexical/table';
import {
  $documentToMarkdown,
  createMarkdownEditorExtension,
  replaceMarkdown,
  readEditorSnapshot,
} from '../src/components/editor/model/MarkdownDocument';
import {
  $readTableToolbarState,
  runTableToolbarAction,
} from '../src/components/editor/interaction/TableEditingController';
import { $getMarkdownTableAlignments } from '../src/components/editor/model/MarkdownTable';
import {
  $readFormattingSnapshot,
  setBlockFormat,
} from '../src/components/editor/interaction/FormattingController';
import {
  $ensureDocumentTitleNode,
  $getDocumentTitleNode,
  $getDocumentTitleText,
  registerDocumentTitleTransform,
} from '../src/components/editor/model/DocumentTitle';
import { $readSelectionAssistContext } from '../src/components/editor/interaction/SelectionAssist';
import {
  EditorShortcutController,
  resolveEditorShortcut,
} from '../src/components/editor/interaction/EditorShortcutController';
import { calculateOverlayPosition } from '../src/components/editor/interaction/OverlayPositionController';
import { MarkdownSourceProjector } from '../src/components/editor/model/MarkdownSourceProjection';
import {
  $isMarkdownImageNode,
  markdownForImage,
} from '../src/components/editor/model/MarkdownImage';
import {
  $readSelectedImage,
  $removeSelectedImage,
  $updateImage,
  clipboardImageFileName,
  imageClipboardPayload,
  ImageEditingController,
} from '../src/components/editor/interaction/ImageEditingController';

const emptyRegistry = new LexicalEditorPluginRegistry([]);

const source = [
  '# Title',
  '',
  '**Bold** and [Lexical](https://lexical.dev).',
  '',
  '- [x] shipped',
  '- [ ] next',
  '',
  '| Name | State |',
  '| --- | --- |',
  '| editor | ready |',
  '',
  '![cover](asset://cover.png "Cover")',
  '',
  '```ts',
  'const ok = true;',
  '```',
  '',
  '---',
].join('\n');

const editor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, source),
);

const nodeTypes = editor.read(() => {
  const types = new Set<string>();
  const visit = (node: LexicalNode) => {
    types.add(node.getType());
    if ('getChildren' in node && typeof node.getChildren === 'function') {
      node.getChildren().forEach(visit);
    }
  };
  visit($getRoot());
  return types;
});

const output = editor.read(() => $documentToMarkdown());
const sourceProjection = editor.read(() => new MarkdownSourceProjector(
  $getExtensionOutput(MdastImportExtension).registry,
)).project(source);
const projectedText = sourceProjection.map((segment) => segment.text).join('');
const projectedTextFor = (style: (typeof sourceProjection)[number]['styles'][number]) => (
  sourceProjection
    .filter((segment) => segment.styles.includes(style))
    .map((segment) => segment.text)
    .join('')
);

assert.equal(projectedText, source, 'Source styling must preserve every source character');
assert.match(projectedTextFor('heading-1'), /# Title/);
assert.match(projectedTextFor('strong'), /\*\*Bold\*\*/);
assert.match(projectedTextFor('link'), /\[Lexical\]\(https:\/\/lexical\.dev\)/);
assert.match(projectedTextFor('task'), /\[x\] shipped/);
assert.match(projectedTextFor('table'), /\| Name \| State \|/);
assert.match(projectedTextFor('image'), /!\[cover\]/);
assert.match(projectedTextFor('code'), /```ts/);
assert.match(projectedTextFor('marker'), /#/);

for (const type of ['heading', 'link', 'list', 'table', 'markdown-image', 'code', 'horizontalrule']) {
  assert(nodeTypes.has(type), `Expected ${type} in the Lexical syntax tree`);
}
assert.match(output, /\[Lexical\]\(https:\/\/lexical\.dev\)/);
assert.match(output, /\| Name +\| State +\|/);
assert.match(output, /!\[cover\]\(asset:\/\/cover\.png "Cover"\)/);
assert.match(output, /- \[x\] shipped/);

const selectFirstTableCell = () => {
  const table = $getRoot().getChildren().find($isTableNode);
  assert(table, 'Expected table before exercising table toolbar commands');
  const row = table.getFirstChild();
  assert($isTableRowNode(row), 'Expected first table row');
  const cell = row.getFirstChild();
  assert($isTableCellNode(cell), 'Expected first table cell');
  cell.selectStart();
};

const tableDimensions = () => {
  const table = $getRoot().getChildren().find($isTableNode);
  assert(table, 'Expected table while reading dimensions');
  const row = table.getFirstChild();
  assert($isTableRowNode(row), 'Expected first table row while reading dimensions');
  return [table.getChildrenSize(), row.getChildrenSize()];
};

editor.update(selectFirstTableCell, { discrete: true });
assert.deepEqual(editor.read(() => $readTableToolbarState()), {
  cellKey: editor.read(() => {
    const table = $getRoot().getChildren().find($isTableNode);
    const row = table?.getFirstChild();
    const cell = $isTableRowNode(row) ? row.getFirstChild() : null;
    assert($isTableCellNode(cell));
    return cell.getKey();
  }),
  columnCount: 2,
  columnAlignment: null,
  columnIndex: 0,
  rowCount: 2,
  rowIndex: 0,
  tableKey: editor.read(() => {
    const table = $getRoot().getChildren().find($isTableNode);
    assert(table);
    return table.getKey();
  }),
});
runTableToolbarAction(editor, 'insert-row-below');
runTableToolbarAction(editor, 'insert-column-after');
assert.deepEqual(editor.read(tableDimensions), [3, 3]);
runTableToolbarAction(editor, 'delete-row');
runTableToolbarAction(editor, 'delete-column');
assert.deepEqual(editor.read(tableDimensions), [2, 2]);
const mutatedTableMarkdown = editor.read(() => $documentToMarkdown());
const mutatedTableEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, mutatedTableMarkdown),
);
assert.deepEqual(mutatedTableEditor.read(tableDimensions), [2, 2]);
mutatedTableEditor.dispose();

const alignedTableSource = [
  '| Left | Center | Right |',
  '| :--- | :---: | ---: |',
  '| a | b | c |',
].join('\n');
const alignedTableEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, alignedTableSource),
);
alignedTableEditor.update(selectFirstTableCell, { discrete: true });
assert.deepEqual(alignedTableEditor.read(() => {
  const table = $getRoot().getChildren().find($isTableNode);
  assert(table);
  return $getMarkdownTableAlignments(table);
}), ['left', 'center', 'right']);
assert.equal(alignedTableEditor.read(() => {
  const table = $getRoot().getChildren().find($isTableNode);
  const row = table?.getFirstChild();
  const cell = $isTableRowNode(row) ? row.getChildAtIndex(1) : null;
  const paragraph = $isTableCellNode(cell) ? cell.getFirstChild() : null;
  assert($isElementNode(paragraph));
  return paragraph.getFormatType();
}), 'center');
runTableToolbarAction(alignedTableEditor, 'align-right');
assert.deepEqual(alignedTableEditor.read(() => {
  const table = $getRoot().getChildren().find($isTableNode);
  assert(table);
  return $getMarkdownTableAlignments(table);
}), ['right', 'center', 'right']);
assert.match(
  alignedTableEditor.read(() => $documentToMarkdown()),
  /\|\s*-+:\s*\|\s*:-+:\s*\|\s*-+:\s*\|/,
);
runTableToolbarAction(alignedTableEditor, 'insert-column-after');
assert.deepEqual(alignedTableEditor.read(() => {
  const table = $getRoot().getChildren().find($isTableNode);
  assert(table);
  return $getMarkdownTableAlignments(table);
}), ['right', null, 'center', 'right']);
alignedTableEditor.dispose();

const tableRemovalSource = ['| Only |', '| --- |'].join('\n');
for (const action of ['delete-row', 'delete-column', 'delete-table'] as const) {
  const tableEditor = buildEditorFromExtensions(
    createMarkdownEditorExtension(false, emptyRegistry, tableRemovalSource),
  );
  tableEditor.update(selectFirstTableCell, { discrete: true });
  runTableToolbarAction(tableEditor, action);
  const removalState = tableEditor.read(() => ({
    childTypes: $getRoot().getChildren().map((node) => node.getType()),
    hasRangeSelection: $isRangeSelection($getSelection()),
    markdown: $documentToMarkdown(),
  }));
  assert.deepEqual(removalState.childTypes, ['paragraph']);
  assert.equal(removalState.hasRangeSelection, true);
  assert.equal(removalState.markdown, '');
  tableEditor.dispose();
}

const horizontalRuleEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'Before'),
);
horizontalRuleEditor.update(() => $getRoot().selectEnd(), { discrete: true });
assert.equal(
  horizontalRuleEditor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined),
  true,
);
assert.equal(horizontalRuleEditor.read(() => (
  $getRoot().getChildren().some((node) => node.getType() === 'horizontalrule')
)), true);
assert.match(horizontalRuleEditor.read(() => $documentToMarkdown()), /(?:---|\*\*\*|___)/);
horizontalRuleEditor.dispose();

const underlineEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'Persistent underline'),
);
underlineEditor.update(() => {
  const text = $getRoot().getFirstDescendant();
  assert($isTextNode(text));
  text.toggleFormat('underline');
}, { discrete: true });
const underlinedMarkdown = underlineEditor.read(() => $documentToMarkdown());
assert.equal(underlinedMarkdown, '<u>Persistent underline</u>');
underlineEditor.dispose();

const headingEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'Semantic heading'),
);
headingEditor.update(() => $getRoot().selectStart(), { discrete: true });
setBlockFormat(headingEditor, 'h3');
assert.equal(headingEditor.read(() => $documentToMarkdown()), '### Semantic heading');
headingEditor.dispose();

const titleEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, '# Document title\n\nBody'),
);
titleEditor.update(() => {
  const title = $getDocumentTitleNode();
  assert(title, 'Expected the first root-level H1 to own document title semantics');
  title.selectStart();
}, { discrete: true });
assert.equal(titleEditor.read(() => $readFormattingSnapshot().block), 'title');
assert.equal(titleEditor.read(() => $getDocumentTitleNode()?.getTextContent()), 'Document title');
titleEditor.dispose();

const defaultTitleEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'Body without a heading'),
);
defaultTitleEditor.update(() => {
  $ensureDocumentTitleNode();
}, { discrete: true });
assert.equal(
  defaultTitleEditor.read(() => $documentToMarkdown()),
  '#\n\nBody without a heading',
);
assert.equal(defaultTitleEditor.read(() => $getDocumentTitleText()), '');
defaultTitleEditor.update(() => {
  const title = $getDocumentTitleNode();
  assert(title);
  title.clear().append($createTextNode('Edited document title'));
}, { discrete: true });
assert.equal(defaultTitleEditor.read(() => $getDocumentTitleText()), 'Edited document title');
assert.match(defaultTitleEditor.read(() => $documentToMarkdown()), /^# Edited document title/);
defaultTitleEditor.dispose();

const titleLifecycleEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'Body'),
);
const unregisterTitleLifecycle = registerDocumentTitleTransform(
  titleLifecycleEditor,
);
titleLifecycleEditor.update(() => {}, { discrete: true });
assert.equal(titleLifecycleEditor.read(() => $getDocumentTitleText()), '');
titleLifecycleEditor.update(() => {
  $getDocumentTitleNode()?.remove();
}, { discrete: true });
assert.equal(titleLifecycleEditor.read(() => Boolean($getDocumentTitleNode())), true);
assert.equal(titleLifecycleEditor.read(() => $getDocumentTitleText()), '');
assert.match(titleLifecycleEditor.read(() => $documentToMarkdown()), /Body$/);
unregisterTitleLifecycle();
titleLifecycleEditor.dispose();

const sectionHeadingEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'Intro\n\n# Section heading'),
);
sectionHeadingEditor.update(() => {
  assert.equal($getDocumentTitleNode(), null);
  $getRoot().getLastChild()?.selectStart();
}, { discrete: true });
assert.equal(sectionHeadingEditor.read(() => $readFormattingSnapshot().block), 'h1');
sectionHeadingEditor.dispose();

const duplicateSelectionEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, 'repeat alpha\n\nmiddle marker\n\nrepeat omega'),
);
let exactContext: ReturnType<typeof $readSelectionAssistContext> = null;
duplicateSelectionEditor.update(() => {
  const target = $getRoot().getAllTextNodes().find((node) => node.getTextContent() === 'repeat omega');
  assert(target);
  target.select(0, 6);
  const selection = $getSelection();
  assert($isRangeSelection(selection));
  exactContext = $readSelectionAssistContext(selection);
}, { discrete: true });
assert(exactContext);
assert.match(exactContext.beforeContext, /middle marker/);
assert.equal(exactContext.selectedText, 'repeat');
duplicateSelectionEditor.dispose();

const clipboardProjector = editor.read(() => new MarkdownSourceProjector(
  $getExtensionOutput(MdastImportExtension).registry,
));
assert.equal(clipboardProjector.hasSyntax('## Heading\n\n- item'), true);
assert.equal(clipboardProjector.hasSyntax('[Lexical](https://lexical.dev)'), true);
assert.equal(clipboardProjector.hasSyntax('| Left | Right |\n| :--- | ---: |\n| A | B |'), true);
assert.equal(clipboardProjector.hasSyntax('Plain sentence without Markdown.'), false);

const shortcut = (
  key: string,
  overrides: Partial<Parameters<typeof resolveEditorShortcut>[0]> = {},
  mode: 'rich' | 'source' = 'rich',
) => resolveEditorShortcut({
  altKey: false,
  ctrlKey: false,
  key,
  metaKey: true,
  shiftKey: false,
  ...overrides,
}, mode);

assert.deepEqual(shortcut('k'), { kind: 'open-link' });
assert.deepEqual(shortcut('/'), { kind: 'toggle-source' });
assert.deepEqual(shortcut('/', {}, 'source'), { kind: 'toggle-source' });
assert.deepEqual(shortcut('t', { altKey: true }), { kind: 'format', command: 'table' });
assert.deepEqual(shortcut('q', { altKey: true }), { kind: 'block', block: 'quote' });
assert.deepEqual(shortcut('c', { shiftKey: true }), { kind: 'copy-markdown' });
assert.deepEqual(shortcut('v', { shiftKey: true }), { kind: 'paste-plain' });
assert.deepEqual(shortcut('\\'), { kind: 'format', command: 'clear-format' });
assert.deepEqual(shortcut('i', { ctrlKey: true }), { kind: 'open-image' });
assert.equal(shortcut('k', {}, 'source'), null);

const shortcutEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, '**Copy me**'),
);
shortcutEditor.update(() => $getRoot().select(0, $getRoot().getChildrenSize()), { discrete: true });
let copiedMarkdown = '';
let plainTextToPaste = '**literal**';
const shortcutController = new EditorShortcutController(shortcutEditor, {
  clipboard: {
    readText: async () => plainTextToPaste,
    writeText: async (value) => { copiedMarkdown = value; },
  },
  toggleSourceMode: () => {},
});
assert.deepEqual(await shortcutController.run({ kind: 'copy-markdown' }), {
  message: 'Markdown copied',
  phase: 'complete',
});
assert.equal(copiedMarkdown, '**Copy me**');
shortcutEditor.update(() => $getRoot().selectEnd(), { discrete: true });
assert.deepEqual(await shortcutController.run({ kind: 'paste-plain' }), {
  message: 'Plain text pasted',
  phase: 'complete',
});
assert.equal(shortcutEditor.read(() => $getRoot().getTextContent()), 'Copy me**literal**');
assert.equal(
  shortcutEditor.read(() => $documentToMarkdown()),
  '**Copy me**\\*\\*literal\\*\\*',
  'Plain-text paste must stay literal after Markdown persistence and reload',
);

let finishClipboardRead: ((value: string) => void) | null = null;
const staleSelectionController = new EditorShortcutController(shortcutEditor, {
  clipboard: {
    readText: () => new Promise((resolve) => { finishClipboardRead = resolve; }),
    writeText: async () => {},
  },
  toggleSourceMode: () => {},
});
shortcutEditor.update(() => $getRoot().selectEnd(), { discrete: true });
const stalePaste = staleSelectionController.run({ kind: 'paste-plain' });
replaceMarkdown(shortcutEditor, 'Selection replaced');
assert(finishClipboardRead);
finishClipboardRead('must not insert');
assert.deepEqual(await stalePaste, {
  message: 'Selection changed before paste completed',
  phase: 'error',
});
assert.equal(shortcutEditor.read(() => $documentToMarkdown()), 'Selection replaced');
shortcutEditor.dispose();

const imageEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, '![Before](asset://before.png "Old title")'),
);
let imageKey = '';
imageEditor.update(() => {
  const image = $getRoot().getFirstDescendant();
  assert($isMarkdownImageNode(image));
  imageKey = image.getKey();
  const selection = $createNodeSelection();
  selection.add(imageKey);
  $setSelection(selection);
}, { discrete: true });
assert.deepEqual(imageEditor.read(() => $readSelectedImage()), {
  alt: 'Before',
  key: imageKey,
  src: 'asset://before.png',
  title: 'Old title',
});
imageEditor.update(() => {
  assert.equal($updateImage(imageKey, {
    alt: 'After',
    src: 'asset://after.png',
    title: 'New title',
  }), true);
}, { discrete: true });
assert.equal(
  imageEditor.read(() => $documentToMarkdown()),
  '![After](asset://after.png "New title")',
);
imageEditor.update(() => {
  assert.equal($removeSelectedImage(), true);
}, { discrete: true });
assert.equal(imageEditor.read(() => $documentToMarkdown()), '');
imageEditor.dispose();

const insertedImageEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, emptyRegistry, ''),
);
new ImageEditingController(insertedImageEditor).insert([
  { alt: 'Pasted screenshot', src: 'asset://pasted.png', title: null },
], { kind: 'document-end' });
assert.equal(
  insertedImageEditor.read(() => $documentToMarkdown()),
  '![Pasted screenshot](asset://pasted.png)',
);
insertedImageEditor.dispose();

assert.equal(
  markdownForImage({ alt: 'Diagram', src: 'asset://diagram one.png', title: 'System "map"' }),
  '![Diagram](<asset://diagram one.png> "System \\"map\\"")',
);
assert.deepEqual(
  imageClipboardPayload({ alt: 'A&B', src: 'asset://image.png', title: '<title>' }),
  {
    html: '<img src="asset://image.png" alt="A&amp;B" title="&lt;title&gt;">',
    markdown: '![A&B](asset://image.png "<title>")',
  },
);
assert.equal(clipboardImageFileName('image/png', 1, 42), 'pasted-image-42-2.png');

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
  x: left,
  y: top,
  toJSON: () => ({}),
});
const clampedOverlay = calculateOverlayPosition(
  rect(100, 50, 600, 500),
  rect(650, 200, 40, 24),
  { height: 34, width: 220 },
  { minTop: () => 58 },
);
assert.equal(clampedOverlay.placement, 'above');
assert.equal(clampedOverlay.left, 372);
assert.equal(clampedOverlay.visible, true);

const insideImageOverlay = calculateOverlayPosition(
  rect(20, 40, 620, 520),
  rect(70, 180, 520, 280),
  { height: 34, width: 220 },
  { minTop: 58, strategy: 'inside-top' },
);
assert.deepEqual(insideImageOverlay, {
  left: 200,
  placement: 'inside',
  top: 148,
  visible: true,
});

replaceMarkdown(editor, '');
assert.equal(editor.read(() => $getRoot().getChildrenSize()), 1);
assert.equal(editor.read(() => $documentToMarkdown()), '');

let listenerOutput = '';
const unregister = editor.registerUpdateListener(({ editorState }) => {
  listenerOutput = readEditorSnapshot(editor, editorState, () => $documentToMarkdown());
});
editor.update(() => {
  $getRoot().append(
    $createParagraphNode().append($createTextNode('Listener update')),
  );
}, { discrete: true });
unregister();
assert.match(listenerOutput, /Listener update/);

editor.dispose();

// Videos use the same source-backed Markdown syntax as images. Editing must
// preserve the URI so publication can discover and include the owned asset.
for (const extension of ['mp4', 'webm', 'mov', 'm4v']) {
  const markdown = `![Demo](silan://resources/moment/demo/assets/clip.${extension})`;
  const videoEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, markdown));
  assert.equal(videoEditor.read(() => $documentToMarkdown()), markdown);
  const rendered = videoEditor.read(() => {
    const node = $getRoot().getFirstDescendant();
    assert($isMarkdownImageNode(node));
    return renderToStaticMarkup(node.decorate());
  });
  assert.match(rendered, /<video[^>]*controls/);
  assert.doesNotMatch(rendered, /<img/);
  videoEditor.dispose();
}

console.log('Lexical Markdown AST round-trip and video rendering verified.');

const posterMarkdown = '[![Video cover](silan://resources/moment/demo/assets/cover.jpg)](silan://resources/moment/demo/assets/clip.mp4)';
const posterEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, posterMarkdown));
assert.equal(posterEditor.read(() => $documentToMarkdown()), posterMarkdown);
const posterRendered = posterEditor.read(() => {
  const node = $getRoot().getFirstDescendant();
  assert($isMarkdownImageNode(node), 'video poster must import as one media node');
  assert.equal(node.getPoster(), 'silan://resources/moment/demo/assets/cover.jpg');
  return renderToStaticMarkup(node.decorate());
});
assert.match(posterRendered, /<video[^>]*poster="silan:\/\/resources\/moment\/demo\/assets\/cover.jpg"/);
posterEditor.dispose();

const cleanTitleEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, '# Research&#x20;\n\nBody'));
assert.equal(cleanTitleEditor.read(() => $documentToMarkdown()), '# Research\n\nBody');

assert.equal(cleanMarkdownHeadings('# A\u200b&nbsp;B&#x20;'), '# A B');
for (const source of ['~~~md\n# Code&#x20;\n~~~', '# `Code&#x20;`', '[url](https://example.com/a&#x20;)', 'Body  \nHard break', '# [Link](https://example.com/a&#x20;)']) {
  assert.equal(cleanMarkdownHeadings(source), source);
}

// Scientific Markdown must survive the same importer/exporter used by rich mode,
// source mode, clipboard insertion and autosave. Preview HTML is never the source.
const scienceSource = String.raw`# Research

Inline $E=mc^2$ and \(\alpha + \beta\).

\[ \boxed{ \text{fixed semantic operator} \quad\longleftrightarrow\quad ?
\quad\longleftrightarrow\quad \text{free-form Data Agent} } \]

$$
\frac{a}{b} + \sum_{i=1}^{n} i
$$

\`\`\`mermaid
flowchart LR
  A[Capture] --> B[Review]
\`\`\`

\`\`\`ts title="untouched"
const literal = '$x$ and \\[a\\]';
\`\`\`

Literal \`$x$ \[y\]\` and escaped \$price.
`.replaceAll('\\`', '`');
const scienceEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, scienceSource));
const scienceNodes = () => scienceEditor.read(() => {
  const result: ScientificMarkdownNode[] = [];
  const walk = (node: LexicalNode) => {
    if (node instanceof ScientificMarkdownNode) result.push(node);
    if ($isElementNode(node)) node.getChildren().forEach(walk);
  };
  walk($getRoot());
  return result;
});
const initialScience = scienceEditor.read(() => scienceNodes().map((node) => node.getData()));
assert.deepEqual(initialScience.map((data) => data.syntax), ['inlineMath', 'silanLatex', 'silanLatex', 'math', 'silanMermaid']);
assert.equal(initialScience[2].display, true);
assert.match(initialScience[2].value, /fixed semantic operator/);
assert.match(initialScience[4].value, /A\[Capture\] --> B\[Review\]/);
const scienceOutput = scienceEditor.read($documentToMarkdown);
assert.match(scienceOutput, /```ts title="untouched"/);
assert.match(scienceOutput, /```mermaid/);
assert.match(scienceOutput, /\\\[ \\boxed/);
assert.match(scienceOutput, /`\$x\$ \\\[y\\\]`/);
replaceMarkdown(scienceEditor, scienceOutput);
assert.deepEqual(scienceEditor.read(() => scienceNodes().map((node) => node.getData())), initialScience);
scienceEditor.update(() => {
  const find = (node: LexicalNode): ScientificMarkdownNode | undefined => {
    if (node instanceof ScientificMarkdownNode && node.getData().syntax === 'silanMermaid') return node;
    if ($isElementNode(node)) return node.getChildren().map(find).find(Boolean);
  };
  find($getRoot())!.setValue('sequenceDiagram\n  Alice->>Bob: Hello');
}, { discrete: true });
assert.match(scienceEditor.read($documentToMarkdown), /Alice->>Bob: Hello/);
const scienceJson = scienceEditor.getEditorState().toJSON();
scienceEditor.setEditorState(scienceEditor.parseEditorState(scienceJson));
assert.match(scienceEditor.read($documentToMarkdown), /Alice->>Bob: Hello/);
const mathHtml = renderToStaticMarkup(createElement(MathPreview, { value: initialScience[2].value, display: true }));
assert.match(mathHtml, /class="katex-display"/);
assert.match(mathHtml, /<math/);
assert.doesNotMatch(mathHtml, /Formula error/);
const invalidMath = renderToStaticMarkup(createElement(MathPreview, { value: '\\frac{', display: true }));
assert.match(invalidMath, /Formula error/);
assert.match(invalidMath, /\\frac\{/);
const unsafeMath = renderToStaticMarkup(createElement(MathPreview, { value: '\\href{javascript:alert(1)}{x}', display: false }));
assert.doesNotMatch(unsafeMath, /href="javascript:/);
const scienceProjection = scienceEditor.read(() => new MarkdownSourceProjector($getExtensionOutput(MdastImportExtension).registry).project(scienceSource));
assert.equal(scienceProjection.map((segment) => segment.text).join(''), scienceSource);
scienceEditor.dispose();
console.log('Scientific Markdown: TeX delimiters, Mermaid, source preservation, edits, JSON recovery and KaTeX rendering passed.');

const blockEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry,
  '# Title\n\nFirst **paragraph**.\n\n- One\n- Two\n\n$$\nx^2\n$$\n\nLast paragraph.'));
const blockBefore = blockEditor.read($documentToMarkdown);
const keys = blockEditor.read(() => $getRoot().getChildrenKeys());
blockEditor.read(() => {
  const list = $getRoot().getChildren()[2];
  assert($isElementNode(list));
  assert.equal($documentBlock(list.getFirstDescendant())?.getKey(), list.getKey());
});
const history = createEmptyHistoryState();
history.current = { editor: blockEditor, editorState: blockEditor.getEditorState() };
const unregisterBlockHistory = registerHistory(blockEditor, history, 300);
blockEditor.update(() => {
  assert.equal($moveDocumentBlock(keys[2], keys[4], 'after'), true);
}, { discrete: true, tag: HISTORY_PUSH_TAG });
assert.deepEqual(blockEditor.read(() => $getRoot().getChildrenKeys()), [keys[0], keys[1], keys[3], keys[4], keys[2]]);
assert.match(blockEditor.read($documentToMarkdown), /Last paragraph\.\n\n- One\n- Two/);
blockEditor.dispatchCommand(UNDO_COMMAND, undefined);
await Promise.resolve();
assert.equal(blockEditor.read($documentToMarkdown), blockBefore);
blockEditor.dispatchCommand(REDO_COMMAND, undefined);
await Promise.resolve();
assert.equal(blockEditor.read(() => $getRoot().getLastChild()?.getKey()), keys[2]);
blockEditor.update(() => {
  assert.equal($moveDocumentBlock(keys[0], keys[4], 'after'), false, 'title stays first');
  assert.equal($moveDocumentBlock(keys[3], keys[0], 'before'), true, 'drop on title moves after title');
  assert.equal($moveDocumentBlock(keys[3], keys[0], 'after'), false, 'adjacent move is a no-op');
  assert.equal($moveDocumentBlock('deleted', keys[4], 'after'), false);
  const selection = $createNodeSelection(); selection.add(keys[3]); $setSelection(selection);
  assert.equal($selectedDocumentBlock()?.getKey(), keys[3], 'decorator selection is a block');
}, { discrete: true, tag: HISTORY_PUSH_TAG });
assert.deepEqual(blockEditor.read(() => $getRoot().getChildrenKeys()), [keys[0], keys[3], keys[1], keys[4], keys[2]]);
unregisterBlockHistory(); blockEditor.dispose();
console.log('Document blocks: list/decorator moves, Markdown order, title protection and undo/redo passed.');

// The table context must use the caret surface, not a second cell-top overlay.
const toolbarEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry,
  '| A | B |\n| --- | --- |\n| One | Two |'));
toolbarEditor.update(() => {
  const table = $getRoot().getFirstChild();
  assert($isTableNode(table));
  const row = table.getLastChild();
  assert($isTableRowNode(row));
  const cell = row.getLastChild();
  assert($isTableCellNode(cell));
  cell.selectEnd();
}, { discrete: true });
const tableToolbarHtml = renderToStaticMarkup(createElement(FormattingToolbar, {
  editor: toolbarEditor, visible: false, disabled: false, sourceMode: false,
  imageImportEnabled: false, onSourceModeChange: () => {},
}));
assert.equal((tableToolbarHtml.match(/role="toolbar"/g) || []).length, 1);
assert.match(tableToolbarHtml, /data-placement="caret"/);
assert.match(tableToolbarHtml, /aria-label="Table actions"/);
assert.match(tableToolbarHtml, /Row 2\/2 · Column 2\/2/);
assert.match(tableToolbarHtml, /Insert row above/);
assert.match(tableToolbarHtml, /Delete selected column/);
assert.doesNotMatch(tableToolbarHtml, /class="lexical-table-toolbar"/);
toolbarEditor.dispose();
console.log('Table toolbar: one caret surface, retained row/column actions, no cell-top overlay.');

// VML adapter preserves exact embeds, text columns, unknown metadata and history.
const vmlSource = '<!-- vml {"v":2,"width":0.6,"rows":[{"widths":[1,2],"captions":["A {#fig:a}","B"]}],"future":"keep"} -->\nLeft **text**\n![One](asset://one.png "title") ![[two.png|200]]\nRight *text*\n<!-- /vml -->';
const vmlEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, vmlSource));
const readVml = () => vmlEditor.read(() => {
  const node = $getRoot().getFirstChild(); assert(node instanceof MediaLayoutNode);
  const doc = node.getDocument(), key = node.getKey();
  return { getSource: () => doc.source, getDocument: () => doc, getKey: () => key };
});
assert.equal(readVml().getSource(), vmlSource);
assert.equal(readVml().getDocument().model!.rows[0].items.length, 2);
assert.equal(vmlEditor.read($documentToMarkdown), vmlSource);
const vmlKey = readVml().getKey();
const vmlController = new MediaLayoutController(vmlEditor, vmlKey);
const disposeVmlHistory = registerHistory(vmlEditor, createEmptyHistoryState(), 0);
vmlEditor.update(() => $getRoot().selectEnd(), { discrete: true });
vmlController.commit(vmlSource, setBlockWidth(readVml().getDocument().model!, .45));
assert.equal(readVml().getDocument().model!.width, .45);
assert(readVml().getSource().includes('![[two.png|200]]'));
assert(readVml().getSource().includes('"future":"keep"'));
vmlController.commit(vmlSource, setBlockWidth(readVml().getDocument().model!, .2));
assert.equal(readVml().getDocument().model!.width, .45);
vmlEditor.dispatchCommand(UNDO_COMMAND, undefined);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(readVml().getSource(), vmlSource);
vmlEditor.dispatchCommand(REDO_COMMAND, undefined);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(readVml().getDocument().model!.width, .45);
assert(vmlController.text(readVml().getSource(), 'right', 'Updated **right** column'));
assert.equal(readVml().getDocument().model!.text.right, 'Updated **right** column');
const vmlSaved = vmlEditor.read($documentToMarkdown);
replaceMarkdown(vmlEditor, vmlSaved);
assert.equal(vmlEditor.read($documentToMarkdown), vmlSaved);
vmlEditor.setEditorState(vmlEditor.parseEditorState(JSON.stringify(vmlEditor.getEditorState().toJSON())));
assert.equal(readVml().getSource(), vmlSaved);
disposeVmlHistory(); vmlEditor.dispose();
for (const source of [
  '![Figure](asset://figure.png "Original")\nThe lower panels show **original outputs**.',
  '**Before** [reference](https://example.org) ![Figure](asset://figure.png "Original") *After*',
  'Before  \n![Figure](asset://figure.png "Original")  \nAfter',
]) {
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, source));
  const original = editor.read($documentToMarkdown);
  const unregister = registerHistory(editor, createEmptyHistoryState(), 0);
  editor.update(() => $getRoot().selectEnd(), { discrete: true });
  editor.update(() => {
    const paragraph = $getRoot().getFirstChild(); assert($isElementNode(paragraph));
    const image = paragraph.getChildren().find($isMarkdownImageNode); assert(image);
    assert($wrapImageLayout(image.getKey(), { width: 50 }));
  }, { discrete: true, tag: HISTORY_PUSH_TAG });
  const result = editor.read($documentToMarkdown);
  assert.match(result, /<!-- vml/);
  assert.match(result, /!\[Figure\]\(asset:\/\/figure.png "Original"\)/);
  if (source.includes('**Before**')) {
    assert(result.indexOf('**Before**') < result.indexOf('<!-- vml'));
    assert(result.indexOf('*After*') > result.indexOf('/vml'));
  }
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(editor.read($documentToMarkdown), original);
  replaceMarkdown(editor, result);
  assert.equal(editor.read($documentToMarkdown), result);
  unregister(); editor.dispose();
}
const prototype = '<!-- silan-media {"version":1,"width":50,"columns":1,"align":"right","height":300,"weights":[1]} -->\n\n![Old](old.png)\n\n<!-- /silan-media -->';
const migrated = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, prototype));
const migratedSource = migrated.read($documentToMarkdown);
assert.match(migratedSource, /<!-- vml/); assert.doesNotMatch(migratedSource, /silan-media/);
assert.equal(new MediaLayoutDocument(migratedSource).model!.width, .5);
migrated.dispose();
for (const source of ['<!-- vml {"v":99} -->\n![A](a.png)\n<!-- /vml -->', '<!-- vml {bad} -->\n![A](a.png)\n<!-- /vml -->']) {
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, source));
  assert.equal(editor.read($documentToMarkdown), source);
  editor.dispose();
}
console.log('VML adapter: exact-source round trips, wiki embeds, text columns, captions, migration, malformed-data retention, undo and stale-write rejection passed.');

// The actual upstream guides exercise all supported syntax through the Desktop parser.
const guide = (await import('../src/components/editor/media/upstream/guide.json')).default;
const { findV2Blocks } = await import('../src/components/editor/media/upstream/src/format/v2');
for (const language of ['en', 'zh'] as const) {
  const source = guide[language];
  const expected = findV2Blocks(source.split('\n')).map(block => block.lines.join('\n'));
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, source));
  const actual = editor.read(() => $getRoot().getChildren().filter((node): node is MediaLayoutNode => node instanceof MediaLayoutNode).map(node => node.getSource()));
  assert.deepEqual(actual, expected, `${language} guide layouts must all remain byte-preserved`);
  editor.dispose();
}
console.log('Both upstream offline guides parse with all layout sources preserved.');

for (const source of [
  'A [[resources/blog/note/en.md|Related note]] and **bold**.',
  '<!-- vml {"v":2,"type":"text"} -->\r\n- Last item\r\n<!-- /vml -->',
]) {
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, source));
  assert.equal(editor.read($documentToMarkdown), source);
  editor.dispose();
}
for (const source of [
  '```markdown\n<!-- vml {"v":2} -->\n![A](a.png)\n<!-- /vml -->\n```',
  '> <!-- vml {"v":2} -->\n> ![A](a.png)\n> <!-- /vml -->',
  '- <!-- vml {"v":2} -->\n  ![A](a.png)\n  <!-- /vml -->',
]) {
  const tree = fromMarkdown(source, { extensions: [mediaLayoutSyntax], mdastExtensions: [mediaLayoutFromMarkdown] });
  assert.equal(tree.children.some(node => node.type === 'silanMediaLayout'), false);
}
console.log('Wiki links, CRLF layouts and nested/fenced boundary rejection passed.');

{
  const first = '<!-- vml {"v":2,"rows":[{"captions":["Caption {#fig:a}"]}]} -->\n![A](a.png)\n<!-- /vml -->';
  const second = '<!-- vml {"v":2} -->\n![Video](clip.webm)\n<!-- /vml -->';
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, `${first}\n\n${second}`));
  const read = () => editor.read(() => $getRoot().getChildren().filter((node): node is MediaLayoutNode => node instanceof MediaLayoutNode).map(node => ({ key: node.getKey(), source: node.getSource(), model: node.getDocument().model! })));
  const [a, b] = read();
  const history = registerHistory(editor, createEmptyHistoryState(), 0);
  editor.update(() => $getRoot().selectEnd(), { discrete: true });
  const controller = new MediaLayoutController(editor, a.key);
  controller.move(a.source, { row: 0, index: 0 }, b.key, 'stale', { kind: 'beside', position: { row: 0, index: 0 }, side: 'before' });
  assert.equal(read().length, 2);
  controller.move(a.source, { row: 0, index: 0 }, b.key, b.source, { kind: 'beside', position: { row: 0, index: 0 }, side: 'before' });
  assert.equal(read().length, 1);
  assert.equal(read()[0].model.rows[0].items.length, 2);
  assert.equal(read()[0].model.rows[0].items[0].caption, 'Caption {#fig:a}');
  assert.equal(read()[0].model.rows[0].items[1].embed.kind, 'video');
  editor.dispatchCommand(UNDO_COMMAND, undefined);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(read().map(node => node.source), [first, second]);
  history(); editor.dispose();
}
console.log('Cross-layout moves are atomic, retain captions/videos, reject stale targets and undo together.');

// One continuous pointer path can leave and re-enter the same row without changing handles.
assert.deepEqual([150, 201, 99, 150].map(y => mediaItemDragMode(true, 100, { top: 100, bottom: 200 }, y)), ['position', 'move', 'move', 'position']);
assert.equal(mediaItemDragMode(true, 0, { top: 100, bottom: 200 }, 150), 'move');
assert.equal(mediaItemDragMode(false, 100, { top: 100, bottom: 200 }, 150), 'move');
console.log('Direct image drag: position within a row, move outside, and full-width/multi-image movement passed.');

// Ordinary blocks enter a layout in the same transaction that removes their old position.
for (const [block, zone] of [
  ['A **formatted** paragraph with [a link](https://example.org).', { kind: 'text', side: 'left' }],
  ['- First\n- **Second**', { kind: 'text', side: 'right' }],
  ['![New](new.png)', { kind: 'media', target: { kind: 'beside', position: { row: 0, index: 0 }, side: 'after' } }],
] as [string, BlockLayoutZone][]) for (const after of [false, true]) {
  const layout = '<!-- vml {"v":2} -->\n![Original](original.png)\n<!-- /vml -->';
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, after ? `${layout}\n\n${block}` : `${block}\n\n${layout}`));
  const original = editor.read($documentToMarkdown);
  const plan = editor.read(() => {
    const children = $getRoot().getChildren(), source = children[after ? 1 : 0], destination = children[after ? 0 : 1]; assert(destination instanceof MediaLayoutNode);
    const markdown = $readBlockMarkdown(source.getKey())!;
    const next = planBlockIntoLayout(markdown, destination.getSource(), zone); assert(next);
    return { key: source.getKey(), source: markdown, destinationKey: destination.getKey(), destinationSource: destination.getSource(), next, zone };
  });
  const history = registerHistory(editor, createEmptyHistoryState(), 0);
  editor.update(() => $getRoot().selectEnd(), { discrete: true });
  editor.update(() => { assert.equal($commitBlockIntoLayout({ ...plan, source: 'stale' }), false); assert.equal($commitBlockIntoLayout({ ...plan, destinationSource: 'stale' }), false); }, { discrete: true });
  assert.equal(editor.read($documentToMarkdown), original);
  editor.update(() => { assert($commitBlockIntoLayout(plan)); }, { discrete: true, tag: HISTORY_PUSH_TAG });
  assert.equal(editor.read(() => $getRoot().getChildrenSize()), 1);
  const model = new MediaLayoutDocument(editor.read($documentToMarkdown)).model!;
  if (zone.kind === 'text') assert.equal(model.text[zone.side], plan.source);
  else assert.deepEqual(model.rows[0].items.map(item => item.embed.target), ['original.png', 'new.png']);
  editor.dispatchCommand(UNDO_COMMAND, undefined); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(editor.read($documentToMarkdown), original);
  history(); editor.dispose();
}
const textBox = '<!-- vml {"v":2,"type":"text"} -->\nExisting text\n<!-- /vml -->';
const insertedImage = planBlockIntoLayout('![New](new.png)', textBox, { kind: 'media', target: { kind: 'newRow', beforeRow: 0 } });
assert(insertedImage); assert.equal(new MediaLayoutDocument(insertedImage).model!.rows.length, 1);
assert.equal(new MediaLayoutDocument(insertedImage).model!.text.left, 'Existing text');
console.log('Block-to-layout drops: paragraphs, formatted lists, images, text boxes, stale rejection and atomic undo passed.');

// Extraction is an outer-document transaction, including the last item/last text block.
{

  for (const mode of ['media', 'column', 'last-text'] as const) {
    const source = mode === 'last-text'
      ? '<!-- vml {"v":2,"type":"text"} -->\nOnly **text**\n<!-- /vml -->'
      : '<!-- vml {"v":2,"rows":[{"captions":["Caption {#fig:one}"]}]} -->\nFirst **paragraph**\n\n- A\n- B\n![Photo](photo.png)\n<!-- /vml -->';
    const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, `${source}\n\nAfter layout`));
    const original = editor.read($documentToMarkdown);
    const info = editor.read(() => {
      const [layout, target] = $getRoot().getChildren(); assert(layout instanceof MediaLayoutNode);
      const column = layout.getDocument().model!.text.left!;
      const raw = mode === 'last-text' ? column : '- A\n- B';
      return { layoutKey: layout.getKey(), targetKey: target.getKey(), source: layout.getSource(), from: column.indexOf(raw), raw };
    });
    const extraction = mode === 'media' ? { kind: 'media' as const, ...info, position: { row: 0, index: 0 } }
      : { kind: 'column' as const, ...info, side: 'left' as const, to: info.from + info.raw.length };
    const history = registerHistory(editor, createEmptyHistoryState(), 0);
    editor.update(() => $getRoot().selectEnd(), { discrete: true });
    editor.update(() => { assert.equal($extractLayoutBlock({ ...extraction, source: 'stale' }, info.targetKey, 'after'), false); }, { discrete: true });
    assert.equal(editor.read($documentToMarkdown), original);
    editor.update(() => { assert($extractLayoutBlock(extraction, info.targetKey, 'after')); }, { discrete: true, tag: HISTORY_PUSH_TAG });
    editor.read(() => {
      const selected = $selectedDocumentBlock();
      assert(selected, 'drop must establish selection in the outer editor');
      assert.equal(selected.getPreviousSibling()?.getKey(), info.targetKey, 'selection must follow the extracted block, not the stale caret');
    });
    const output = editor.read($documentToMarkdown);
    if (mode === 'media') { assert(output.indexOf('![Photo]') > output.indexOf('After layout')); assert(output.includes('Caption {#fig:one}')); }
    else if (mode === 'column') { assert(output.indexOf('- A') > output.indexOf('After layout')); assert(output.includes('First **paragraph**')); }
    else { assert(!output.includes('<!-- vml')); assert(output.indexOf('Only **text**') > output.indexOf('After layout')); }
    editor.dispatchCommand(UNDO_COMMAND, undefined); await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(editor.read($documentToMarkdown), original);
    history(); editor.dispose();
  }
}
console.log('Layout extraction: media/captions, individual lists, empty-layout cleanup, stale guards and single-step undo passed.');

// A layout can be its own adjacent drop anchor, including extraction of its only image.
for (const edge of ['before', 'after'] as const) {
  const source = '<!-- vml {"v":2} -->\n![Only](only.png)\n<!-- /vml -->';
  const editor = buildEditorFromExtensions(createMarkdownEditorExtension(false, emptyRegistry, source));
  editor.update(() => {
    const layout = $getRoot().getFirstChild(); assert(layout instanceof MediaLayoutNode);
    assert($extractLayoutBlock({ kind: 'media', layoutKey: layout.getKey(), source: layout.getSource(), position: { row: 0, index: 0 } }, layout.getKey(), edge));
  }, { discrete: true });
  const output = editor.read($documentToMarkdown);
  assert(output.includes('![Only](only.png)')); assert(!output.includes('<!-- vml'));
  editor.dispose();
}
