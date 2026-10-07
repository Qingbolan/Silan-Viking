import React from 'react';
import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical';
import { caretToolbarPosition, readCaretGeometry } from './CaretGeometry';

type Chrome = { toolbar: React.CSSProperties; caret: React.CSSProperties | null };
const hidden: Chrome = { toolbar: { visibility: 'hidden' }, caret: null };

export function useCaretChrome(editor: LexicalEditor | null, toolbar: React.RefObject<HTMLDivElement>, enabled: boolean, tableCellKey?: string) {
  const [chrome, setChrome] = React.useState<Chrome>(hidden);
  React.useLayoutEffect(() => {
    const root = editor?.getRootElement();
    const menu = toolbar.current;
    const host = menu?.closest<HTMLElement>('.novel-editor');
    if (!enabled || !editor || !root || !host || !menu) { setChrome(hidden); return; }
    let frame = 0;
    let composing = false;
    const clearCaret = () => root.removeAttribute('data-measured-caret');
    const measure = () => {
      frame = 0;
      if (menu.contains(root.ownerDocument.activeElement)) {
        clearCaret(); setChrome((previous) => ({ ...previous, caret: null })); return;
      }
      const textSelection = editor.read(() => $isRangeSelection($getSelection()));
      let geometry = !composing && textSelection && root.ownerDocument.activeElement === root ? readCaretGeometry(root) : null;
      // Multi-cell selection has no text caret, but retains the same command surface.
      if (!geometry && !composing && !textSelection && tableCellKey && root.ownerDocument.activeElement === root) {
        const cell = editor.getElementByKey(tableCellKey)?.getBoundingClientRect();
        if (cell) geometry = { left: cell.right, top: cell.top, height: cell.height, collapsed: false };
      }
      if (!geometry) { clearCaret(); setChrome(hidden); return; }
      const bounds = host.getBoundingClientRect();
      root.toggleAttribute('data-measured-caret', geometry.collapsed);
      setChrome({
        toolbar: { ...caretToolbarPosition(bounds, geometry, menu.offsetHeight || 38), transform: 'none', visibility: 'visible' },
        caret: geometry.collapsed ? { left: geometry.left - bounds.left, top: geometry.top - bounds.top, height: geometry.height } : null,
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const startComposition = () => { composing = true; clearCaret(); setChrome(hidden); };
    const endComposition = () => { composing = false; schedule(); };
    const unregister = editor.registerUpdateListener(schedule);
    root.ownerDocument.addEventListener('selectionchange', schedule);
    root.addEventListener('compositionstart', startComposition);
    root.addEventListener('compositionend', endComposition);
    host.addEventListener('focusin', schedule); host.addEventListener('focusout', schedule);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule); observer.observe(root);
    schedule();
    return () => {
      cancelAnimationFrame(frame); clearCaret(); unregister(); observer.disconnect();
      root.ownerDocument.removeEventListener('selectionchange', schedule);
      root.removeEventListener('compositionstart', startComposition); root.removeEventListener('compositionend', endComposition);
      host.removeEventListener('focusin', schedule); host.removeEventListener('focusout', schedule);
      window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
    };
  }, [editor, enabled, toolbar, tableCellKey]);
  return chrome;
}
