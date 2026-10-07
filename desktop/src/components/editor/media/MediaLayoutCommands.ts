import { $isDocumentTitleNode } from '../model/DocumentTitle';
import { $createRangeSelection, $getRoot, $getSelection, $isRangeSelection, $isNodeSelection, $setSelection, createCommand } from 'lexical';
import { $convertSelectionToMarkdownString } from '@lexical/mdast';
import { MediaLayoutNode, $createMediaLayout } from './MediaLayoutNode';
import { planWrapSelection } from './upstream/src/commands/plans';
import { applyLineChanges } from './upstream/src/layout/edits';

export const WRAP_MEDIA_SELECTION = createCommand<void>('silan/media/wrap-selection');
export const OPEN_MEDIA_SETTINGS = createCommand<void>('silan/media/settings');
export const OPEN_MEDIA_GUIDE = createCommand<void>('silan/media/guide');
export const INSERT_LAYOUT_PICKER = createCommand<void>('silan/media/insert');
export const REVIEW_UNWRAP_MEDIA = createCommand<void>('silan/media/review-unwrap');

export function wrapSourceSelection(source: string, start: number, end: number): string | null {
  const lines = source.split('\n');
  const from = source.slice(0, start).split('\n').length - 1;
  const to = source.slice(0, Math.max(start, end - 1)).split('\n').length - 1;
  const plan = planWrapSelection(lines, from, to);
  return plan ? applyLineChanges(lines, [plan]).join('\n') : null;
}

function $selectedLayoutPlan() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) && !$isNodeSelection(selection)) return null;
  const root = $getRoot();
  const keys = new Set(selection.getNodes().map((node) => node.getTopLevelElement()?.getKey()));
  const children = root.getChildren();
  const selected = children.filter((node) => keys.has(node.getKey()));
  if (!selected.length || selected.some((node) => node instanceof MediaLayoutNode || $isDocumentTitleNode(node))) return null;
  const first = children.indexOf(selected[0]), last = children.indexOf(selected[selected.length - 1]);
  const whole = $createRangeSelection();
  whole.anchor.set(root.getKey(), first, 'element'); whole.focus.set(root.getKey(), last + 1, 'element');
  const source = $convertSelectionToMarkdownString(whole);
  const wrapped = wrapSourceSelection(source, 0, source.length);
  if (!wrapped) return null;
  return { selected, wrapped };
}
export function $canWrapSelectedBlocks() { return $selectedLayoutPlan() !== null; }
export function $wrapSelectedBlocks() {
  const plan = $selectedLayoutPlan();
  if (!plan) return false;
  const { selected, wrapped } = plan;
  const layout = $createMediaLayout(wrapped);
  selected[0].insertBefore(layout);
  selected.forEach((node) => node.remove());
  layout.selectNext(); return true;
}
