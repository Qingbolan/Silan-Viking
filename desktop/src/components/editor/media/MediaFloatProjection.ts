import { $getRoot, type LexicalEditor } from 'lexical';
import { MediaLayoutNode } from './MediaLayoutNode';
import { findV2Blocks } from './upstream/src/format/v2';
import { effectiveWrapSkips } from './upstream/src/layout/floatOrder';
/** Adjacent opposite floats share an anchor; source skip values stay absolute. */
export function registerMediaFloatProjection(editor: LexicalEditor) {
  const project = () => editor.read(() => {
    const lines: string[] = [];
    const keys = new Map<number, string>();
    for (const node of $getRoot().getChildren()) {
      if (node instanceof MediaLayoutNode) { keys.set(lines.length, node.getKey()); lines.push(...node.getSource().split('\n'), ''); }
      else lines.push('ordinary-block', '');
    }
    const blocks = findV2Blocks(lines), skips = effectiveWrapSkips(lines, blocks);
    blocks.forEach((block, index) => {
      const key = keys.get(block.openLine);
      if (key) editor.getElementByKey(key)?.style.setProperty('--media-skip', String(skips[index] || 0));
    });
  });
  project();
  return editor.registerUpdateListener(project);
}
