import type { LayoutExtraction } from '../media/MediaLayoutExtraction';
import { $addUpdateTag, $createNodeSelection, $isElementNode, $setSelection, SKIP_SCROLL_INTO_VIEW_TAG, $getNodeByKey, $getSelection, $isNodeSelection, $isRangeSelection, $isRootNode, createCommand, type LexicalNode } from 'lexical';
import { $isDocumentTitleNode } from '../model/DocumentTitle';
export const START_BLOCK_DRAG = createCommand<{ key: string; extraction?: LayoutExtraction; pointerId: number; x: number; y: number }>('silan/start-block-drag');

/** Lists, quotes, tables and decorators move as complete root-level blocks. */
export function $documentBlock(node: LexicalNode | null): LexicalNode | null {
  if (!node || $isRootNode(node)) return null;
  let block = node;
  while (block.getParent() && !$isRootNode(block.getParent())) block = block.getParent()!;
  return $isRootNode(block.getParent()) ? block : null;
}

export function $selectedDocumentBlock(): LexicalNode | null {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) return $documentBlock(selection.anchor.getNode());
  if ($isNodeSelection(selection)) return $documentBlock(selection.getNodes()[0] || null);
  return null;
}

export function $moveDocumentBlock(sourceKey: string, targetKey: string, edge: 'before' | 'after'): boolean {
  const source = $documentBlock($getNodeByKey(sourceKey));
  const target = $documentBlock($getNodeByKey(targetKey));
  if (!source || !target || source === target || $isDocumentTitleNode(source)) return false;
  // The title owns the first slot; dropping there means the first body position.
  const after = edge === 'after' || $isDocumentTitleNode(target);
  if (after && target.getNextSibling() === source) return false;
  if (!after && target.getPreviousSibling() === source) return false;
  if (after) target.insertAfter(source); else target.insertBefore(source);
  $selectDroppedBlock(source);
  return true;
}

/** Drop selection belongs to the moved block, without scrolling to an old caret. */
export function $selectDroppedBlock(block: LexicalNode): void {
  $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
  if ($isElementNode(block)) block.selectStart();
  else {
    const selection = $createNodeSelection();
    selection.add(block.getKey());
    $setSelection(selection);
  }
}
