import { findV2Blocks, isDrawable } from "../format/v2.ts";

/** Only the export copy gets placeholders; the vault's Markdown is never rewritten. */
export function printPlan(text: string, token: string) {
  const lines = text.split("\n");
  const blocks = findV2Blocks(lines).filter(isDrawable);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    lines.splice(block.openLine, block.closeLine - block.openLine + 1,
      "", `<div data-vml-print="${token}-${index}"></div>`, "");
  }
  return { markdown: lines.join("\n"), blocks };
}
