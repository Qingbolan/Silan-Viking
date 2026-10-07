/** Geometry shared by the visual caret and typing toolbar. Coordinates are viewport CSS pixels. */
export type CaretGeometry = { left: number; top: number; height: number; collapsed: boolean };

export function caretToolbarPosition(
  host: { left: number; top: number; right: number; bottom: number },
  caret: CaretGeometry,
  toolbarHeight: number,
) {
  const room = host.right - caret.left - 18;
  const width = Math.min(460, Math.max(120, host.right - host.left - 16), Math.max(160, room));
  const beside = room >= 160;
  return {
    left: Math.max(8, Math.min(caret.left - host.left + 10, host.right - host.left - width - 8)),
    top: Math.max(4, beside ? caret.top - host.top + (caret.height - toolbarHeight) / 2 : caret.top - host.top + caret.height + 8),
    width,
  };
}

export function readCaretGeometry(root: HTMLElement): CaretGeometry | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.focusNode || !root.contains(selection.focusNode) || !selection.rangeCount) return null;
  const node = selection.focusNode;
  const offset = selection.focusOffset;
  const range = root.ownerDocument.createRange();
  range.setStart(node, offset); range.collapse(true);
  let rect = range.getClientRects()[0];
  let nearby: Node | null = node;
  if (node.nodeType !== Node.TEXT_NODE) {
    nearby = node.childNodes[offset > 0 ? offset - 1 : 0] || node;
    while (nearby && nearby.nodeType !== Node.TEXT_NODE && nearby.childNodes.length) {
      if (nearby instanceof HTMLElement && nearby.contentEditable === 'false') { nearby = node; break; }
      nearby = offset > 0 ? nearby.lastChild : nearby.firstChild;
    }
  }
  const element = nearby?.nodeType === Node.TEXT_NODE ? nearby.parentElement : node as HTMLElement;
  if (!element) return null;
  const style = getComputedStyle(element);
  const fontSize = parseFloat(style.fontSize);
  if (!rect?.height && nearby?.nodeType === Node.TEXT_NODE && nearby.textContent?.length) {
    const textOffset = nearby === node ? offset : offset > 0 ? nearby.textContent.length : 0;
    const index = Math.max(0, textOffset - 1);
    range.setStart(nearby, index); range.setEnd(nearby, Math.min(index + 1, nearby.textContent.length));
    const character = range.getClientRects()[0];
    if (character) rect = new DOMRect(textOffset ? character.right : character.left, character.top, 0, character.height);
  }
  if (!rect?.height) {
    // Empty paragraph/title: preserve native selection, measure its content line.
    const bounds = element.getBoundingClientRect();
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2;
    rect = new DOMRect(bounds.left + (parseFloat(style.paddingLeft) || 0),
      bounds.top + (parseFloat(style.paddingTop) || 0), 0, lineHeight);
  }
  if (!rect || !Number.isFinite(fontSize) || fontSize <= 0) return null;
  const viewport = root.getBoundingClientRect();
  const top = rect.top + (rect.height - fontSize) / 2;
  if (top < viewport.top || top + fontSize > viewport.bottom || rect.left < viewport.left || rect.left > viewport.right) return null;
  return { left: rect.left, top, height: fontSize, collapsed: selection.isCollapsed };
}
