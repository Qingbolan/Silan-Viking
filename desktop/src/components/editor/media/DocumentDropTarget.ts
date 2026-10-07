import { $getNodeByKey, $getNearestNodeFromDOMNode, type LexicalEditor } from 'lexical';
import { $isDocumentTitleNode } from '../model/DocumentTitle';
export type DocumentDropTarget = { key: string; edge: 'before' | 'after'; text: string; top: number; left: number; width: number };
export function findDocumentDrop(editor: LexicalEditor, x: number, y: number, layoutKey: string): DocumentDropTarget | null {
  const root = editor.getRootElement(); if (!root) return null;
  const bounds = root.getBoundingClientRect();
  if (x < bounds.left - 40 || x > bounds.right + 40 || y < bounds.top - 30 || y > bounds.bottom + 40) return null;
  let best: DocumentDropTarget | null = null, distance = Infinity;
  for (const element of Array.from(root.children) as HTMLElement[]) {
    const box = (element.matches('.lexical-media-layout') ? element.querySelector('.vml-layout') || element : element).getBoundingClientRect();
    if (element.dataset.layoutKey === layoutKey && y > box.top + 8 && y < box.bottom - 8 && x >= box.left && x <= box.right) return null;
    const key = editor.read(() => { const node = $getNearestNodeFromDOMNode(element); return node?.getKey(); });
    if (!key) continue;
    const title = editor.read(() => $isDocumentTitleNode($getNodeByKey(key)));
    const edge = title ? 'after' : y < (box.top + box.bottom) / 2 ? 'before' : 'after';
    const top = edge === 'before' ? box.top : box.bottom, delta = Math.abs(y - top);
    if (delta < distance) { distance = delta; best = { key, edge, text: editor.read(() => $getNodeByKey(key)?.getTextContent() || ''), top, left: bounds.left, width: bounds.width }; }
  }
  return best;
}
