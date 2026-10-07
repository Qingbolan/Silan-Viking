import { MediaColumnDragContext } from '../media/MediaColumnDragContext';
import { $extractLayoutBlock, type LayoutExtraction } from '../media/MediaLayoutExtraction';
import { $getExtensionOutput } from '@lexical/extension';
import { MdastImportExtension } from '@lexical/mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { $commitBlockIntoLayout, $readBlockMarkdown, blockMediaKind, planBlockIntoLayout, type BlockLayoutDrop, type BlockLayoutZone } from '../media/MediaBlockDrop';
import { clearMediaDrop, findMediaDrop, showMediaDrop } from '../media/MediaDropTarget';
import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { GripVertical, Plus } from 'lucide-react';
import {
  $createParagraphNode, $getNearestNodeFromDOMNode, $getNodeByKey, $getRoot,
  HISTORY_PUSH_TAG, COMMAND_PRIORITY_EDITOR,
} from 'lexical';
import { $documentBlock, $moveDocumentBlock, $selectedDocumentBlock, START_BLOCK_DRAG } from '../interaction/DocumentBlocks';
import { MediaLayoutNode } from '../media/MediaLayoutNode';
import { setWrap, setSkip, hasTextColumns } from '../media/upstream/src/layout/model';
import { wrapZone, skipLines } from '../media/upstream/src/layout/geometry';
import { $isDocumentTitleNode } from '../model/DocumentTitle';

type DropTarget = { layout?: BlockLayoutDrop; height?: number; label?: string; key: string; edge: 'before' | 'after'; top: number; left: number; width: number; wrap?: 'left' | 'right' | null; skip?: number };
type DragState = { phase: 'idle' } | { phase: 'pressed' | 'dragging'; key: string; source: string | null; extraction?: LayoutExtraction; pointerId: number; startX: number; startY: number; x: number; y: number };
type Handle = { key: string; top: number; left: number };

// Root blocks are vertically ordered. Gutter hit testing needs logarithmic layout
// reads even in long documents; direct content hits walk only the DOM ancestry.
function blockBounds(element: HTMLElement) {
  return (element.matches('.lexical-media-layout[data-wrap="left"], .lexical-media-layout[data-wrap="right"]')
    ? element.querySelector<HTMLElement>('.vml-layout') || element : element).getBoundingClientRect();
}
function blockAtY(root: HTMLElement, y: number): HTMLElement | null {
  const blocks = Array.from(root.children) as HTMLElement[];
  return blocks.reduce<HTMLElement | null>((nearest, block) => {
    const distance = (element: HTMLElement) => { const box = blockBounds(element); return y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0; };
    return !nearest || distance(block) < distance(nearest) ? block : nearest;
  }, null);
}

/** Owns hover/selection marking, first-line gutter geometry and block moves. */
export function BlockInteractionPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();
  const columnOwner = React.useContext(MediaColumnDragContext);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const hovered = React.useRef<HTMLElement | null>(null);
  const drag = React.useRef<DragState>({ phase: 'idle' });
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [handle, setHandle] = React.useState<Handle | null>(null);
  const [drop, setDropState] = React.useState<DropTarget | null>(null);
  const lastDrop = React.useRef<DropTarget | null>(null);
  const setDrop = React.useCallback((value: DropTarget | null) => { lastDrop.current = value; setDropState(value); }, []);
  const refresh = React.useRef(() => {});
  React.useLayoutEffect(() => {
    clearMediaDrop(editor.getRootElement());
    if (drop?.layout?.zone.kind === 'media') showMediaDrop(editor, { key: drop.layout.destinationKey, source: drop.layout.destinationSource, target: drop.layout.zone.target });
    return () => clearMediaDrop(editor.getRootElement());
  }, [drop, editor]);
  React.useEffect(() => editor.registerCommand(START_BLOCK_DRAG, (start) => {
    if (disabled) return false;
    hovered.current = editor.getElementByKey(start.key);
    drag.current = { phase: 'pressed', key: start.key, source: $readBlockMarkdown(start.key), extraction: start.extraction, pointerId: start.pointerId, startX: start.x, startY: start.y, x: start.x, y: start.y };
    return true;
  }, COMMAND_PRIORITY_EDITOR), [disabled, editor]);

  React.useEffect(() => editor.registerRootListener((root) => setAnchor(root?.parentElement || null)), [editor]);

  React.useEffect(() => {
    const root = editor.getRootElement();
    if (disabled || !anchor || !root) { setHandle(null); setDrop(null); return; }
    let marked: HTMLElement | null = null;
    let frame = 0;
    const mark = (element: HTMLElement | null) => {
      if (marked === element) return;
      marked?.classList.remove('lexical-active-block');
      marked = element;
      marked?.classList.add('lexical-active-block');
    };
    const update = () => {
      frame = 0;
      const hoveredElement = hovered.current;
      const selected = editor.read(() => {
        const block = $selectedDocumentBlock();
        return block ? editor.getElementByKey(block.getKey()) : null;
      });
      const focused = root.contains(root.ownerDocument.activeElement) || menuRef.current?.contains(root.ownerDocument.activeElement);
      // A column always exposes a grip: hover chooses a block, focus keeps the
      // active block, and an inactive column offers its first block.
      const element = hoveredElement?.isConnected ? hoveredElement
        : columnOwner ? (focused && selected ? selected : root.firstElementChild as HTMLElement | null)
        : null;
      mark(hoveredElement?.isConnected ? hoveredElement : focused ? selected : null);
      if (!element?.isConnected || !root.contains(element)) { setHandle(null); return; }
      const key = editor.read(() => {
        const block = $documentBlock($getNearestNodeFromDOMNode(element));
        return block && (columnOwner || !$isDocumentTitleNode(block)) ? block.getKey() : null;
      });
      if (!key) { setHandle(null); return; }
      const rect = blockBounds(element);
      const origin = anchor.getBoundingClientRect();
      const viewport = root.getBoundingClientRect();
      // A scrolled-out block must not leave a floating handle over another block.
      if (rect.bottom < viewport.top || rect.top > viewport.bottom) { setHandle(null); return; }
      const firstLine = element.querySelector('li, p, th, td') || element;
      const firstRect = firstLine.getBoundingClientRect();
      const style = getComputedStyle(firstLine);
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      const next = { key, left: columnOwner ? rect.left - origin.left - 26 : Math.max(2, rect.left - origin.left - 60),
        top: firstRect.top - origin.top + anchor.scrollTop + (lineHeight - 28) / 2 };
      setHandle((previous) => previous && previous.key === next.key && previous.left === next.left && previous.top === next.top ? previous : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    refresh.current = schedule;
    const pointerMove = (event: PointerEvent) => {
      if (drag.current.phase !== 'idle' || menuRef.current?.contains(event.target as Node)) return;
      const y = event.clientY;
      const rect = root.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right) return;
      let direct = event.target instanceof Element ? event.target : null;
      while (direct && direct !== root && direct.parentElement !== root) direct = direct.parentElement;
      const block = direct?.parentElement === root ? direct as HTMLElement : blockAtY(root, y);
      const bounds = block ? blockBounds(block) : undefined;
      hovered.current = block && bounds && y >= bounds.top && y <= bounds.bottom ? block : null;
      schedule();
    };
    const leave = () => { if (drag.current.phase === 'idle') { hovered.current = null; schedule(); } };
    anchor.addEventListener('pointermove', pointerMove);
    anchor.addEventListener('pointerleave', leave);
    anchor.addEventListener('focusin', schedule);
    anchor.addEventListener('focusout', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    const unregister = editor.registerUpdateListener(schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      unregister(); observer.disconnect(); mark(null);
      hovered.current?.classList.remove('lexical-block-moving');
      hovered.current = null; drag.current = { phase: 'idle' }; refresh.current = () => {};
      anchor.removeEventListener('pointermove', pointerMove);
      anchor.removeEventListener('pointerleave', leave);
      anchor.removeEventListener('focusin', schedule);
      anchor.removeEventListener('focusout', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [anchor, disabled, editor, columnOwner]);

  const finish = React.useCallback(() => {
    hovered.current?.classList.remove('lexical-block-moving');
    drag.current = { phase: 'idle' }; setDrop(null); refresh.current();
  }, []);

  React.useEffect(() => {
    if (disabled || !anchor) return;
    let scrollFrame = 0;
    const locate = (x: number, y: number): DropTarget | null => editor.read(() => {
      const root = editor.getRootElement();
      if (!root) return null;
      const viewport = root.getBoundingClientRect();
      if (x < viewport.left || x > viewport.right || y < viewport.top || y > viewport.bottom) return null;
      let hit = root.ownerDocument.elementFromPoint(x, y);
      while (hit && hit !== root && hit.parentElement !== root) hit = hit.parentElement;
      const element = hit?.parentElement === root ? hit as HTMLElement : blockAtY(root, y);
      if (!element) return null;
      const node = $documentBlock($getNearestNodeFromDOMNode(element));
      if (!node) return null;
      const rect = blockBounds(element);
      const origin = anchor.getBoundingClientRect();
      const state = drag.current;
      const source = state.phase !== 'idle' ? $getNodeByKey(state.key) : null;
      const edgeInset = Math.min(12, rect.height * .2);
      if (state.phase !== 'idle' && state.extraction && node.getKey() === state.key && y > rect.top + edgeInset && y < rect.bottom - edgeInset) return null;
      if (node instanceof MediaLayoutNode && source && !(source instanceof MediaLayoutNode) && state.phase !== 'idle' && state.source
        && source !== node && x >= rect.left && x <= rect.right && y > rect.top + edgeInset && y < rect.bottom - edgeInset) {
        const kind = blockMediaKind(state.source);
        const destinationSource = node.getSource();
        const media = kind === 'media' ? findMediaDrop(editor, x, y) : null;
        const textOnly = !node.getDocument().model?.rows.length;
        const side = textOnly || x < rect.left + rect.width / 2 ? 'left' : 'right';
        const zone: BlockLayoutZone = kind === 'media' ? { kind: 'media', target: media?.target || { kind: 'newRow', beforeRow: 0 } } : { kind: 'text', side };
        const next = planBlockIntoLayout(state.source, destinationSource, zone);
        if (next) return { key: node.getKey(), edge: 'before', top: rect.top - origin.top + anchor.scrollTop,
          left: rect.left - origin.left + (zone.kind === 'text' && side === 'right' ? rect.width / 2 : 0),
          width: zone.kind === 'text' && !textOnly ? rect.width / 2 : rect.width, height: rect.height,
          label: zone.kind === 'media' ? '松开加入图片布局' : textOnly ? '松开添加到文字框' : side === 'left' ? '松开添加到左侧文字' : '松开添加到右侧文字',
          layout: { key: state.key, source: state.source, destinationKey: node.getKey(), destinationSource, next, zone } };
      }
      const model = state.phase !== 'idle' && !state.extraction && source instanceof MediaLayoutNode ? source.getDocument().model : null;
      const wrap = model ? hasTextColumns(model) ? null : wrapZone(x, viewport.left, viewport.right) : undefined;
      const edge = $isDocumentTitleNode(node) ? 'after' : wrap ? 'before' : y >= (rect.top + rect.bottom) / 2 ? 'after' : 'before';
      const skip = wrap ? skipLines(y, rect.top, parseFloat(getComputedStyle(element).lineHeight) || 28, 40) : 0;
      return { key: node.getKey(), edge, top: (edge === 'before' ? rect.top : rect.bottom) - origin.top + anchor.scrollTop,
        left: (wrap === 'right' ? viewport.right - viewport.width * .4 : rect.left) - origin.left, width: wrap ? viewport.width * .4 : rect.width, wrap, skip };
    });
    const autoScroll = () => {
      const state = drag.current;
      if (state.phase !== 'dragging') { scrollFrame = 0; return; }
      let scroller = editor.getRootElement();
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) {
        scroller = scroller.parentElement;
      }
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const delta = state.y < rect.top + 40 ? -10 : state.y > rect.bottom - 40 ? 10 : 0;
        if (delta && state.x >= rect.left && state.x <= rect.right) {
          scroller.scrollTop += delta;
          setDrop(locate(state.x, state.y));
          refresh.current();
        }
      }
      scrollFrame = requestAnimationFrame(autoScroll);
    };
    const move = (event: PointerEvent) => {
      const state = drag.current;
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return;
      if (state.phase === 'pressed' && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4) return;
      event.preventDefault();
      drag.current = { ...state, phase: 'dragging', x: event.clientX, y: event.clientY };
      hovered.current?.classList.add('lexical-block-moving');
      setDrop(locate(event.clientX, event.clientY));
      if (!scrollFrame) scrollFrame = requestAnimationFrame(autoScroll);
    };
    const release = (event: PointerEvent) => {
      const state = drag.current;
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return;
      if (state.phase === 'dragging' && event.type === 'pointerup') {
        const target = lastDrop.current;
        if (target) editor.update(() => {
          if (state.extraction) { $extractLayoutBlock(state.extraction, target.key, target.edge); return; }
          if (target.layout) { $commitBlockIntoLayout(target.layout); return; }
          $moveDocumentBlock(state.key, target.key, target.edge);
          const source = $getNodeByKey(state.key);
          if (source instanceof MediaLayoutNode && target.wrap !== undefined) {
            const doc = source.getDocument();
            if (doc.editable && doc.model) source.setSource(doc.change(setSkip(setWrap(doc.model, target.wrap), target.skip || 0)));
          }
        }, { tag: HISTORY_PUSH_TAG });
      }
      finish();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', finish);
    return () => {
      cancelAnimationFrame(scrollFrame); finish();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', finish);
    };
  }, [anchor, disabled, editor, finish]);

  if (disabled || !anchor) return null;
  return createPortal(<>
    {handle && <div ref={menuRef} className="block-controls" role="group" aria-label="Block controls"
      style={{ top: handle.top, left: handle.left }}>
      <button type="button" className="block-controls__add" aria-label="Add block below" title="Add block below"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.update(() => {
          const block = $documentBlock($getNodeByKey(handle.key));
          if (!block) return;
          const paragraph = $createParagraphNode(); block.insertAfter(paragraph); paragraph.selectStart();
        }, { tag: HISTORY_PUSH_TAG, onUpdate: () => editor.focus() })}><Plus size={15} /></button>
      <button type="button" className="drag-handle" aria-label={columnOwner ? "Move text out of layout" : "Move block"}
        title={columnOwner ? "拖动此文字块到组合块外" : "Drag to move block · Alt+↑/↓ to reorder"}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          if (columnOwner) {
            if (!columnOwner.enabled) return;
            const extraction = editor.read((): LayoutExtraction | null => {
              const node = $getNodeByKey(handle.key); if (!node) return null;
              const registry = $getExtensionOutput(MdastImportExtension).registry;
              const tree = fromMarkdown(columnOwner.column, { extensions: registry.micromarkExtensions, mdastExtensions: registry.mdastExtensions });
              if (tree.children.length !== $getRoot().getChildrenSize()) return null;
              const position = tree.children[node.getIndexWithinParent()]?.position;
              const from = position?.start.offset, to = position?.end.offset;
              if (from === undefined || to === undefined) return null;
              return { kind: 'column', layoutKey: columnOwner.layoutKey, source: columnOwner.source, side: columnOwner.side, from, to, raw: columnOwner.column.slice(from, to) };
            });
            if (extraction) columnOwner.editor.dispatchCommand(START_BLOCK_DRAG, { key: columnOwner.layoutKey, extraction, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
            return;
          }
          drag.current = { phase: 'pressed', key: handle.key, source: editor.read(() => $readBlockMarkdown(handle.key)), pointerId: event.pointerId,
            startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
        }}
        onKeyDown={(event) => {
          if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          editor.update(() => {
            const node = $getNodeByKey(handle.key);
            const sibling = event.key === 'ArrowUp' ? node?.getPreviousSibling() : node?.getNextSibling();
            if (sibling) $moveDocumentBlock(handle.key, sibling.getKey(), event.key === 'ArrowUp' ? 'before' : 'after');
          }, { tag: HISTORY_PUSH_TAG });
        }}><GripVertical size={16} /></button>
    </div>}
    {drop && (drop.layout ? <div className={`lexical-block-layout-target ${drop.layout.zone.kind}`} style={{ top: drop.top, left: drop.left, width: drop.width, height: drop.height }}><span>{drop.label}</span></div>
      : <div className="lexical-block-drop-line" style={{ top: drop.top, left: drop.left, width: drop.width }} />)}
  </>, anchor);
}
