import { $copyNode, $createParagraphNode, $getNodeByKey, $getRoot, $getSelection, $isElementNode, $isParagraphNode, $isTextNode, $isLineBreakNode, $isRangeSelection, HISTORY_PUSH_TAG, type LexicalEditor, type LexicalNode } from 'lexical';
import { $generateNodesFromMarkdownString } from '@lexical/mdast';
import { $isMarkdownImageNode, markdownForImage, type MarkdownImageData } from '../model/MarkdownImage';
import { $createMediaLayout, MediaLayoutNode } from './MediaLayoutNode';
import { MediaLayoutDocument, modelSource, sourceFromImages } from './MediaLayout';
import { insertItem, moveItem, removeItem, setBlockWidth, setTextLayout, type LayoutModel, type ItemPosition, type MoveTarget } from './upstream/src/layout/model';
import { planColumnText } from './upstream/src/layout/edits';
import { readEmbedRow, type TextSide } from './upstream/src/format/v2';
import type { MediaDropTarget } from './MediaDropTarget';

export function $moveLooseMedia(key: string, expectedSource: string, target: MediaDropTarget) {
  const image = $getNodeByKey(key), destination = $getNodeByKey(target.key);
  if (!$isMarkdownImageNode(image) || image.getSource() !== expectedSource || !(destination instanceof MediaLayoutNode) || destination.getSource() !== target.source) return false;
  const doc = destination.getDocument();
  if (!doc.editable || !doc.model) return false;
  const raw = markdownForImage({ src: image.getSource(), alt: image.getAltText(), title: image.getTitle(), poster: image.getPoster() });
  const embed = readEmbedRow(raw, 0)?.[0]; if (!embed) return false;
  const next = insertItem(doc.model, { embed, weight: null, caption: null }, target.target);
  if (next === doc.model) return false;
  destination.setSource(doc.change(next));
  const parent = image.getParent(); image.remove();
  if ($isParagraphNode(parent) && parent.isEmpty()) parent.remove();
  return true;
}

export type LayoutPreset = { width?: number; align?: 'left' | 'center' | 'right' };
function $mediaInParagraph(node: LexicalNode | null): MarkdownImageData[] | null {
  if (!$isParagraphNode(node)) return null;
  const items: MarkdownImageData[] = [];
  for (const child of node.getChildren()) {
    if ($isLineBreakNode(child) || ($isTextNode(child) && !child.getTextContent().trim())) continue;
    if (!$isMarkdownImageNode(child)) return null;
    items.push({ src: child.getSource(), alt: child.getAltText(), title: child.getTitle(), poster: child.getPoster() });
  }
  return items.length ? items : null;
}
export function $wrapImageLayout(key: string, options: LayoutPreset = {}) {
  const image = $getNodeByKey(key);
  if (!$isMarkdownImageNode(image)) return false;
  const paragraph = image.getParent();
  if (!$isParagraphNode(paragraph) || paragraph.getParent()?.getType() !== 'root') return false;
  const siblings = $mediaInParagraph(paragraph);
  const items = siblings || [{ src: image.getSource(), alt: image.getAltText(), title: image.getTitle(), poster: image.getPoster() }];
  const doc = new MediaLayoutDocument(sourceFromImages(items));
  if (!doc.model) return false;
  let model = doc.model;
  if (options.width) model = setBlockWidth(model, options.width / 100);
  if (options.align) model = setTextLayout(model, { align: options.align });
  const layout = $createMediaLayout(modelSource(model));
  if (!siblings) {
    const separator = (node: LexicalNode) => $isLineBreakNode(node) || ($isTextNode(node) && !node.getTextContent().trim());
    const before = image.getPreviousSiblings(), after = image.getNextSiblings();
    while (before.length && separator(before[before.length - 1])) before.pop();
    while (after.length && separator(after[0])) after.shift();
    if (before.length) paragraph.insertBefore($copyNode(paragraph).append(...before));
    if (after.length) paragraph.insertAfter($copyNode(paragraph).append(...after));
  }
  paragraph.replace(layout); layout.selectNext(); return true;
}
function $replaceWithMarkdown(node: MediaLayoutNode, source: string) {
  const nodes = $generateNodesFromMarkdownString(source);
  for (const next of nodes) node.insertBefore(next);
  if (!nodes.length && $getRoot().getChildrenSize() === 1) node.insertBefore($createParagraphNode());
  node.remove();
}
export class MediaLayoutController {
  constructor(private readonly editor: LexicalEditor, private readonly key: string) {}
  commit(expected: string, next: LayoutModel) {
    return this.source(expected, new MediaLayoutDocument(expected).change(next));
  }
  source(expected: string, source: string) {
    let changed = false;
    this.editor.update(() => {
      const node = $getNodeByKey(this.key);
      if (!(node instanceof MediaLayoutNode) || node.getSource() !== expected || expected === source) return;
      const doc = new MediaLayoutDocument(source);
      if (doc.block) node.setSource(source); else $replaceWithMarkdown(node, source);
      changed = true;
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
    return changed;
  }
  text(expected: string, side: TextSide, value: string) {
    const doc = new MediaLayoutDocument(expected);
    if (!doc.block) return false;
    const plan = planColumnText(doc.block, side, value);
    return plan.fits && (!plan.edit || this.source(expected, doc.apply(plan.edit)));
  }
  canJoinNext() { return this.editor.read(() => {
    const next = $getNodeByKey(this.key)?.getNextSibling();
    return next instanceof MediaLayoutNode || !!$mediaInParagraph(next || null);
  }); }
  joinNext() {
    this.editor.update(() => {
      const node = $getNodeByKey(this.key);
      if (!(node instanceof MediaLayoutNode)) return;
      const next = node.getNextSibling();
      const own = node.getDocument();
      const items = $mediaInParagraph(next);
      const other = next instanceof MediaLayoutNode ? next.getDocument() : items ? new MediaLayoutDocument(sourceFromImages(items)) : null;
      if (!own.editable || !own.model || !other?.editable || !other.model || !next) return;
      // Text columns may not be silently merged through media rows.
      if (own.model.text.right || other.model.text.left) return;
      node.setSource(modelSource({ ...own.model, rows: [...own.model.rows, ...other.model.rows], text: { left: own.model.text.left, right: other.model.text.right } }));
      next.remove();
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
  }
  unwrap() { this.editor.update(() => {
    const node = $getNodeByKey(this.key);
    if (node instanceof MediaLayoutNode && node.getDocument().editable) $replaceWithMarkdown(node, node.getSource().split('\n').slice(1, -1).join('\n'));
  }, { discrete: true, tag: HISTORY_PUSH_TAG }); }
  moveOut(position: ItemPosition) {
    this.editor.update(() => {
      const node = $getNodeByKey(this.key);
      if (!(node instanceof MediaLayoutNode)) return;
      const doc = node.getDocument(); if (!doc.model || !doc.editable) return;
      const result = removeItem(doc.model, position); if (!result) return;
      const images = $generateNodesFromMarkdownString(result.item.embed.raw);
      let anchor: LexicalNode = node;
      for (const image of images) { anchor.insertAfter(image); anchor = image; }
      const remaining = doc.change(result.model);
      if (new MediaLayoutDocument(remaining).block) node.setSource(remaining); else $replaceWithMarkdown(node, remaining);
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
  }
  move(expected: string, position: ItemPosition, targetKey: string, targetSource: string, target: MoveTarget) {
    this.editor.update(() => {
      const node = $getNodeByKey(this.key), destination = $getNodeByKey(targetKey);
      if (!(node instanceof MediaLayoutNode) || !(destination instanceof MediaLayoutNode) || node.getSource() !== expected || destination.getSource() !== targetSource) return;
      const doc = node.getDocument(), other = destination.getDocument();
      if (!doc.editable || !other.editable || !doc.model || !other.model) return;
      if (node === destination) { node.setSource(doc.change(moveItem(doc.model, position, target))); return; }
      const removed = removeItem(doc.model, position); if (!removed) return;
      const inserted = insertItem(other.model, removed.item, target);
      if (inserted === other.model) return;
      destination.setSource(other.change(inserted));
      const rest = doc.change(removed.model);
      if (new MediaLayoutDocument(rest).block) node.setSource(rest); else $replaceWithMarkdown(node, rest);
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
  }
}
