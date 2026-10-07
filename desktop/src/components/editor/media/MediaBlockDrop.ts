import { $createRangeSelection, $getNodeByKey, $getRoot } from 'lexical';
import { $convertSelectionToMarkdownString } from '@lexical/mdast';
import { $isDocumentTitleNode } from '../model/DocumentTitle';
import { MediaLayoutNode } from './MediaLayoutNode';
import { MediaLayoutDocument, modelSource } from './MediaLayout';
import { insertItem, type MoveTarget } from './upstream/src/layout/model';
import { planColumnText } from './upstream/src/layout/edits';
export type BlockLayoutZone = { kind: 'text'; side: 'left' | 'right' } | { kind: 'media'; target: MoveTarget };
export type BlockLayoutDrop = { key: string; source: string; destinationKey: string; destinationSource: string; next: string; zone: BlockLayoutZone };
export function $readBlockMarkdown(key: string): string | null {
  const node = $getNodeByKey(key), root = $getRoot();
  if (!node || node.getParent() !== root || $isDocumentTitleNode(node)) return null;
  const index = node.getIndexWithinParent(), selection = $createRangeSelection();
  selection.anchor.set(root.getKey(), index, 'element'); selection.focus.set(root.getKey(), index + 1, 'element');
  return $convertSelectionToMarkdownString(selection);
}
export function blockMediaKind(source: string): 'media' | 'text' {
  const doc = new MediaLayoutDocument(`<!-- vml {"v":2} -->\n${source}\n<!-- /vml -->`);
  return doc.editable && doc.model?.rows.length && !doc.model.text.left && !doc.model.text.right ? 'media' : 'text';
}
/** Plan before mutating either owner. Unsupported nested layouts never consume their source. */
export function planBlockIntoLayout(source: string, destination: string, zone: BlockLayoutZone): string | null {
  const doc = new MediaLayoutDocument(destination);
  if (!doc.editable || !doc.model || !doc.block) return null;
  if (zone.kind === 'text') {
    const text = [doc.model.text[zone.side], source].filter(Boolean).join('\n\n');
    const plan = planColumnText(doc.block, zone.side, text);
    if (!plan.fits || !plan.edit) return null;
    const next = doc.apply(plan.edit);
    return new MediaLayoutDocument(next).editable ? next : null;
  }
  if (blockMediaKind(source) !== 'media') return null;
  const incoming = new MediaLayoutDocument(`<!-- vml {"v":2} -->\n${source}\n<!-- /vml -->`).model!;
  let model = { ...doc.model, allText: false };
  // Insert in reverse at the same slot so a multi-image paragraph retains its order.
  if (zone.target.kind === 'newRow') {
    const at = Math.max(0, Math.min(zone.target.beforeRow, model.rows.length));
    model = { ...model, rows: [...model.rows.slice(0, at), ...incoming.rows, ...model.rows.slice(at)] };
  } else for (const item of incoming.rows.flatMap(row => row.items).reverse()) model = insertItem(model, item, zone.target);
  const next = doc.model.rows.length ? doc.change(model) : modelSource({ ...model, text: { left: destination.split('\n').slice(1, -1).join('\n'), right: null } });
  return new MediaLayoutDocument(next).editable ? next : null;
}
export function $commitBlockIntoLayout(drop: BlockLayoutDrop): boolean {
  const node = $getNodeByKey(drop.key), destination = $getNodeByKey(drop.destinationKey);
  if (!node || node instanceof MediaLayoutNode || !(destination instanceof MediaLayoutNode) || destination.getParent() !== $getRoot()
    || destination.getSource() !== drop.destinationSource || $readBlockMarkdown(drop.key) !== drop.source) return false;
  if (planBlockIntoLayout(drop.source, drop.destinationSource, drop.zone) !== drop.next) return false;
  destination.setSource(drop.next); node.remove(); return true;
}
