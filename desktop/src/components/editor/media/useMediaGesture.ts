import { findDocumentDrop, type DocumentDropTarget } from './DocumentDropTarget';
import { $extractLayoutBlock } from './MediaLayoutExtraction';
import { mediaItemDragMode } from './MediaItemDrag';
import { MediaDragScroll } from './MediaDragScroll';
import { clearMediaDrop, findMediaDrop, showMediaDrop, type MediaDropTarget } from './MediaDropTarget';
import React from 'react';
import { $getNodeByKey, HISTORY_PUSH_TAG, type LexicalEditor } from 'lexical';
import { MediaLayoutNode } from './MediaLayoutNode';
import { MediaLayoutController } from './MediaLayoutController';
import { MediaLayoutDocument } from './MediaLayout';
import { frameResizeDirection, positionOffset, resizePair } from './upstream/src/layout/geometry';
import { effectiveWidth, rowOffset, scaleRows, setBlockWidth, setPosition, setRowHeight, setSingleWidth, setWeights, type ItemPosition, type LayoutModel } from './upstream/src/layout/model';

type Kind = 'item' | 'single-width' | 'row-height' | 'columns' | 'frame-width' | 'frame-height' | 'frame-scale';
type Target = MediaDropTarget;
type Gesture = { kind: Kind; pointer: number; x: number; y: number; position: ItemPosition; source: string; base: LayoutModel; next: LayoutModel; width: number; height: number; rowWidth: number; widths: number[]; itemWidth: number; target: Target | null; outside: DocumentDropTarget | null; dropMode: boolean; moved: boolean; singles: (number | null)[] };
export function useMediaGesture(editor: LexicalEditor, nodeKey: string, document: MediaLayoutDocument, frame: React.RefObject<HTMLDivElement>, enabled: boolean) {
  const scroll = React.useRef<MediaDragScroll | null>(null);
  const suppressClick = React.useRef(false);
  const [dragging, setDragging] = React.useState<{ position: ItemPosition; x: number; y: number } | null>(null);
  const active = React.useRef<Gesture | null>(null);
  const [outside, setOutside] = React.useState<DocumentDropTarget | null>(null);
  const [preview, setPreview] = React.useState<LayoutModel | null>(null);
  const controller = React.useMemo(() => new MediaLayoutController(editor, nodeKey), [editor, nodeKey]);
  const cancel = React.useCallback(() => {
    scroll.current?.stop(); scroll.current = null;
    const outer = editor.getElementByKey(nodeKey);
    const model = editor.read(() => { const node = $getNodeByKey(nodeKey); return node instanceof MediaLayoutNode ? node.getDocument().model : null; });
    if (outer && model && !model.text.left && !model.text.right) outer.style.setProperty('--media-width', `${(effectiveWidth(model) || 1) * 100}%`);
    active.current = null; setPreview(null); setDragging(null); setOutside(null); clearMediaDrop(editor.getRootElement());
  }, [editor, nodeKey]);
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && active.current) { event.preventDefault(); cancel(); } };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); clearMediaDrop(editor.getRootElement()); scroll.current?.stop(); };
  }, [cancel, editor]);
  React.useEffect(cancel, [document.source, enabled, cancel]);
  function begin(event: React.PointerEvent, kind: Kind, position: ItemPosition) {
    const model = document.model, element = frame.current;
    if (!model || !element || !enabled || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = element.querySelector<HTMLElement>('.vml-media')?.getBoundingClientRect() || element.getBoundingClientRect();
    const row = element.querySelector<HTMLElement>(`[data-row="${position.row}"]`);
    const widths = Array.from(row?.querySelectorAll<HTMLElement>('.vml-item') || [], (item) => item.getBoundingClientRect().width);
    active.current = { kind, pointer: event.pointerId, x: event.clientX, y: event.clientY, position, source: document.source, base: model, next: model,
      width: bounds.width, height: bounds.height, rowWidth: row?.getBoundingClientRect().width || bounds.width, widths, itemWidth: widths[position.index] || bounds.width, target: null, outside: null, dropMode: false, moved: false,
      singles: model.rows.map((row, index) => row.items.length === 1 ? (element.querySelector<HTMLElement>(`[data-row="${index}"] .vml-item`)?.getBoundingClientRect().width || bounds.width) / bounds.width : null) };
  }
  function move(event: React.PointerEvent) {
    const state = active.current; if (!state || state.pointer !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < 4) return;
    state.moved = true;
    const { base, position } = state;
    let next = base;
    if (state.kind === 'item') {
      const row = frame.current?.querySelector<HTMLElement>(`[data-row="${position.row}"]`);
      const bounds = row?.getBoundingClientRect();
      const free = state.rowWidth - state.itemWidth;
      const sideways = mediaItemDragMode(base.rows[position.row]?.items.length === 1, free, bounds, event.clientY) === 'position';
      state.dropMode = !sideways;
      if (sideways) {
        scroll.current?.stop(); scroll.current = null;
        state.target = null; state.outside = null; setOutside(null); clearMediaDrop(editor.getRootElement());
        state.next = setPosition(base, position.row, positionOffset(rowOffset(base.rows[position.row]) * free, dx, free, 10));
        setPreview(state.next); setDragging(null);
        return;
      }
      state.next = base; setPreview(null); setDragging({ position, x: event.clientX, y: event.clientY });
      const root = editor.getRootElement();
      if (root && !scroll.current) scroll.current = new MediaDragScroll(root, (x, y) => {
        if (active.current) { active.current.target = findMediaDrop(editor, x, y); active.current.outside = active.current.target ? null : findDocumentDrop(editor, x, y, nodeKey); setOutside(active.current.outside); showMediaDrop(editor, active.current.target); }
      });
      scroll.current?.update(event.clientX, event.clientY);
      state.target = findMediaDrop(editor, event.clientX, event.clientY);
      state.outside = state.target ? null : findDocumentDrop(editor, event.clientX, event.clientY, nodeKey);
      setOutside(state.outside);
      showMediaDrop(editor, state.target);
      return;
    }
    if (state.kind === 'row-height') next = setRowHeight(base, position.row, (base.rows[position.row].height || 220) + dy);
    if (state.kind === 'columns') next = setWeights(base, position.row, resizePair(state.widths, position.index, dx, 60));
    if (state.kind === 'single-width') next = setSingleWidth(base, position.row, (state.itemWidth + dx) / state.rowWidth);
    if (state.kind === 'frame-width' || state.kind === 'frame-scale') {
      const factor = Math.max(.2, 1 + frameResizeDirection(base) * dx / state.width);
      next = setBlockWidth(base, (effectiveWidth(base) || 1) * factor);
      if (state.kind === 'frame-scale') next = scaleRows(next, factor, state.singles, 1);
    }
    if (state.kind === 'frame-height') next = scaleRows(base, Math.max(.2, 1 + dy / state.height), state.singles);
    state.next = next; setPreview(next);
    // DOM-only preview. The node model is committed once, after release.
    if (state.kind.startsWith('frame-')) {
      const outer = editor.getElementByKey(nodeKey);
      if (outer && !base.text.left && !base.text.right) outer.style.setProperty('--media-width', `${(effectiveWidth(next) || 1) * 100}%`);
    }
  }
  function finish(event: React.PointerEvent) {
    const state = active.current; if (!state || state.pointer !== event.pointerId) return;
    event.stopPropagation();
    if (state.moved) {
      suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0);
      if (state.kind === 'item' && state.dropMode && state.target) controller.move(state.source, state.position, state.target.key, state.target.source, state.target.target);
      else if (state.kind === 'item' && state.dropMode && state.outside) {
        const target = state.outside;
        editor.update(() => {
          if ($getNodeByKey(target.key)?.getTextContent() !== target.text) return;
          $extractLayoutBlock({ kind: 'media', layoutKey: nodeKey, source: state.source, position: state.position }, target.key, target.edge);
        }, { discrete: true, tag: HISTORY_PUSH_TAG });
      }
      else if (state.kind !== 'item' || !state.dropMode) controller.commit(state.source, state.next);
    }
    cancel();
  }
  return { preview, dragging, outside, onClickCapture: (event: React.MouseEvent) => {
    if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
  }, handle: (kind: Kind, position: ItemPosition = { row: 0, index: 0 }) => ({
    onPointerDown: (event: React.PointerEvent) => begin(event, kind, position), onPointerMove: move, onPointerUp: finish,
    onPointerCancel: cancel, onLostPointerCapture: () => { if (active.current) cancel(); },
  }) };
}
