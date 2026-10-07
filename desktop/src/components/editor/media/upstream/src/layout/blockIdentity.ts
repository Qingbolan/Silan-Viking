import type { V2Block } from "../format/v2.ts";
import type { BlockEdit, EditFailure } from "./edits.ts";

const identities = new WeakMap<V2Block, string>();

/** Runtime metadata is kept outside the parsed format and never serialized. */
export function identifyBlock(block: V2Block, id: string): void {
  identities.set(block, id);
}

export function blockIdentity(block: V2Block): string | undefined {
  return identities.get(block);
}

/** Resolve a rendered instance before the old raw-text anchor fallback can select another copy. */
export function bindBlockEdits(edits: readonly BlockEdit[], refs: readonly { id: string; block: V2Block }[]):
  { ok: true; edits: BlockEdit[] } | EditFailure {
  const byId = new Map(refs.map(ref => [ref.id, ref.block]));
  const bound: BlockEdit[] = [];
  for (const edit of edits) {
    if (!edit.blockId) {
      bound.push(edit);
      continue;
    }
    const block = byId.get(edit.blockId);
    if (!block || block.lines.length !== edit.anchorLines.length
      || !block.lines.every((line, index) => line === edit.anchorLines[index])) {
      return { ok: false, reason: "not-found" };
    }
    bound.push({ ...edit, anchorLine: block.openLine });
  }
  return { ok: true, edits: bound };
}
