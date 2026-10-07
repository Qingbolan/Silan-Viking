import { $getNodeByKey, type LexicalEditor } from 'lexical';
import { MediaLayoutNode } from './MediaLayoutNode';
import { dropTarget, type RowBox, type ItemBox } from './upstream/src/layout/geometry';
import type { MoveTarget } from './upstream/src/layout/model';
export type MediaDropTarget = { key: string; source: string; target: MoveTarget };
const classes = ['vml-drop-before', 'vml-drop-after', 'vml-drop-row-before', 'vml-drop-row-after'];
export function clearMediaDrop(root: HTMLElement | null) { for (const cls of classes) root?.querySelectorAll(`.${cls}`).forEach((node) => node.classList.remove(cls)); }
export function findMediaDrop(editor: LexicalEditor, x: number, y: number): MediaDropTarget | null {
  const root = editor.getRootElement();
  const hit = root?.ownerDocument.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layout-key]');
  if (!root || !hit || !root.contains(hit)) return null;
  const key = hit.dataset.layoutKey!;
  const source = editor.read(() => { const node = $getNodeByKey(key); return node instanceof MediaLayoutNode && node.getDocument().editable ? node.getSource() : null; });
  if (!source) return null;
  const rows: RowBox[] = Array.from(hit.querySelectorAll<HTMLElement>('.vml-row')).filter(row => row.closest('[data-layout-key]') === hit).map((row) => ({ row: Number(row.dataset.row), rect: row.getBoundingClientRect() }));
  const items: ItemBox[] = Array.from(hit.querySelectorAll<HTMLElement>('.vml-item')).filter(item => item.closest('[data-layout-key]') === hit).map((item) => ({ row: Number(item.closest<HTMLElement>('.vml-row')!.dataset.row), index: Number(item.dataset.index), rect: item.getBoundingClientRect() }));
  const target = dropTarget(x, y, rows, items); return target ? { key, source, target } : null;
}
export function showMediaDrop(editor: LexicalEditor, drop: MediaDropTarget | null) {
  clearMediaDrop(editor.getRootElement()); if (!drop) return;
  const hit = editor.getElementByKey(drop.key), target = drop.target;
  if (target.kind === 'beside') hit?.querySelector(`[data-row="${target.position.row}"] [data-index="${target.position.index}"]`)?.classList.add(target.side === 'before' ? 'vml-drop-before' : 'vml-drop-after');
  else {
    const row = hit?.querySelector(`[data-row="${target.beforeRow}"]`);
    if (row) row.classList.add('vml-drop-row-before'); else hit?.querySelector('.vml-row:last-child')?.classList.add('vml-drop-row-after');
  }
}
