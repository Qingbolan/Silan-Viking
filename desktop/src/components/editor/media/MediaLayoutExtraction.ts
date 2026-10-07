import { $selectDroppedBlock } from '../interaction/DocumentBlocks';
import { $getNodeByKey, $getRoot } from 'lexical';
import { $generateNodesFromMarkdownString } from '@lexical/mdast';
import { MediaLayoutDocument } from './MediaLayout';
import { MediaLayoutNode } from './MediaLayoutNode';
import { $isDocumentTitleNode } from '../model/DocumentTitle';
import { planColumnText } from './upstream/src/layout/edits';
import { removeItem, type ItemPosition } from './upstream/src/layout/model';
export type LayoutExtraction = { layoutKey: string; source: string } & (
  { kind: 'column'; side: 'left' | 'right'; from: number; to: number; raw: string }
  | { kind: 'media'; position: ItemPosition }
);
/** One outer-editor transaction owns both removal from the layout and insertion in prose. */
export function $extractLayoutBlock(extraction: LayoutExtraction, targetKey: string, edge: 'before' | 'after'): boolean {
  const layout = $getNodeByKey(extraction.layoutKey), target = $getNodeByKey(targetKey);
  if (!(layout instanceof MediaLayoutNode) || layout.getSource() !== extraction.source || !target || target.getParent() !== $getRoot()) return false;
  const doc = layout.getDocument(); if (!doc.editable || !doc.model || !doc.block) return false;
  let raw: string, remaining: string;
  if (extraction.kind === 'media') {
    const removed = removeItem(doc.model, extraction.position); if (!removed) return false;
    raw = [removed.item.embed.raw, removed.item.caption].filter(Boolean).join('\n\n');
    remaining = doc.change(removed.model);
  } else {
    const column = doc.model.text[extraction.side];
    if (column == null || extraction.from < 0 || extraction.to <= extraction.from || column.slice(extraction.from, extraction.to) !== extraction.raw) return false;
    raw = extraction.raw;
    const text = (column.slice(0, extraction.from) + column.slice(extraction.to)).trim();
    if (!text && !doc.model.rows.length && !doc.model.text[extraction.side === 'left' ? 'right' : 'left']) remaining = '';
    else {
      const plan = planColumnText(doc.block, extraction.side, text);
      if (!plan.fits || !plan.edit) return false;
      remaining = doc.apply(plan.edit);
    }
  }
  const nodes = $generateNodesFromMarkdownString(raw);
  if (!nodes.length) return false;
  if (edge === 'after' || $isDocumentTitleNode(target)) {
    let anchor = target;
    for (const node of nodes) { anchor.insertAfter(node); anchor = node; }
  } else for (const node of nodes) target.insertBefore(node);
  if (new MediaLayoutDocument(remaining).block) layout.setSource(remaining);
  else {
    for (const node of $generateNodesFromMarkdownString(remaining)) layout.insertBefore(node);
    layout.remove();
  }
  $selectDroppedBlock(nodes[0]);
  return true;
}
