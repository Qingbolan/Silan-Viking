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
  createMarkdownEditorExtension(false, [], source),
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
  createMarkdownEditorExtension(false, [], mutatedTableMarkdown),
);
assert.deepEqual(mutatedTableEditor.read(tableDimensions), [2, 2]);
mutatedTableEditor.dispose();

const alignedTableSource = [
  '| Left | Center | Right |',
  '| :--- | :---: | ---: |',
  '| a | b | c |',
].join('\n');
const alignedTableEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, [], alignedTableSource),
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
    createMarkdownEditorExtension(false, [], tableRemovalSource),
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
  createMarkdownEditorExtension(false, [], 'Before'),
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
  createMarkdownEditorExtension(false, [], 'Persistent underline'),
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
  createMarkdownEditorExtension(false, [], 'Semantic heading'),
);
headingEditor.update(() => $getRoot().selectStart(), { discrete: true });
setBlockFormat(headingEditor, 'h3');
assert.equal(headingEditor.read(() => $documentToMarkdown()), '### Semantic heading');
headingEditor.dispose();

const titleEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, [], '# Document title\n\nBody'),
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
  createMarkdownEditorExtension(false, [], 'Body without a heading'),
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
  createMarkdownEditorExtension(false, [], 'Body'),
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
  createMarkdownEditorExtension(false, [], 'Intro\n\n# Section heading'),
);
sectionHeadingEditor.update(() => {
  assert.equal($getDocumentTitleNode(), null);
  $getRoot().getLastChild()?.selectStart();
}, { discrete: true });
assert.equal(sectionHeadingEditor.read(() => $readFormattingSnapshot().block), 'h1');
sectionHeadingEditor.dispose();

const duplicateSelectionEditor = buildEditorFromExtensions(
  createMarkdownEditorExtension(false, [], 'repeat alpha\n\nmiddle marker\n\nrepeat omega'),
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
  createMarkdownEditorExtension(false, [], '**Copy me**'),
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
  createMarkdownEditorExtension(false, [], '![Before](asset://before.png "Old title")'),
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
  createMarkdownEditorExtension(false, [], ''),
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
  const videoEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, [], markdown));
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
const posterEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, [], posterMarkdown));
assert.equal(posterEditor.read(() => $documentToMarkdown()), posterMarkdown);
const posterRendered = posterEditor.read(() => {
  const node = $getRoot().getFirstDescendant();
  assert($isMarkdownImageNode(node), 'video poster must import as one media node');
  assert.equal(node.getPoster(), 'silan://resources/moment/demo/assets/cover.jpg');
  return renderToStaticMarkup(node.decorate());
});
assert.match(posterRendered, /<video[^>]*poster="silan:\/\/resources\/moment\/demo\/assets\/cover.jpg"/);
posterEditor.dispose();

const cleanTitleEditor = buildEditorFromExtensions(createMarkdownEditorExtension(false, [], '# Research&#x20;\n\nBody'));
assert.equal(cleanTitleEditor.read(() => $documentToMarkdown()), '# Research\n\nBody');

assert.equal(cleanMarkdownHeadings('# A\u200b&nbsp;B&#x20;'), '# A B');
for (const source of ['~~~md\n# Code&#x20;\n~~~', '# `Code&#x20;`', '[url](https://example.com/a&#x20;)', 'Body  \nHard break', '# [Link](https://example.com/a&#x20;)']) {
  assert.equal(cleanMarkdownHeadings(source), source);
}
