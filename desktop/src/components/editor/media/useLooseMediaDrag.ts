import { MediaDragScroll } from './MediaDragScroll';
import React from 'react';
import { HISTORY_PUSH_TAG, type LexicalEditor } from 'lexical';
import { $moveLooseMedia } from './MediaLayoutController';
import { clearMediaDrop, findMediaDrop, showMediaDrop } from './MediaDropTarget';
export function useLooseMediaDrag(editor: LexicalEditor, image: { key: string; src: string } | null, disabled: boolean) {
  const scroll = React.useRef<MediaDragScroll | null>(null);
  const state = React.useRef<{ pointer: number; x: number; y: number; key: string; src: string; moved: boolean } | null>(null);
  const cancel = React.useCallback(() => { scroll.current?.stop(); scroll.current = null; state.current = null; clearMediaDrop(editor.getRootElement()); }, [editor]);
  React.useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); cancel(); };
  }, [cancel]);
  React.useEffect(cancel, [disabled, image?.key, cancel]);
  return {
    onPointerDown(event: React.PointerEvent) {
      if (!image || disabled || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      state.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, key: image.key, src: image.src, moved: false };
    },
    onPointerMove(event: React.PointerEvent) {
      const start = state.current; if (!start || start.pointer !== event.pointerId) return;
      event.stopPropagation();
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6 && !start.moved) return;
      const root = editor.getRootElement();
      if (root && !scroll.current) scroll.current = new MediaDragScroll(root, (x, y) => showMediaDrop(editor, findMediaDrop(editor, x, y)));
      scroll.current?.update(event.clientX, event.clientY);
      start.moved = true; showMediaDrop(editor, findMediaDrop(editor, event.clientX, event.clientY));
    },
    onPointerUp(event: React.PointerEvent) {
      const start = state.current;
      if (start?.moved && start.pointer === event.pointerId) {
        const target = findMediaDrop(editor, event.clientX, event.clientY);
        if (target) editor.update(() => $moveLooseMedia(start.key, start.src, target), { discrete: true, tag: HISTORY_PUSH_TAG });
      }
      cancel();
    },
    onPointerCancel: cancel, onLostPointerCapture: cancel,
  };
}
