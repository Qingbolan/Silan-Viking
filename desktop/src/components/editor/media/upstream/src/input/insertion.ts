import { MAX_EMBEDS_PER_ROW, blockWrap, findV2Blocks, hasSideText, readEmbedRow, serializeBlock, type V2Block, type V2Embed } from "../format/v2.ts";
import { isEditable, wrapLines, type LineChange } from "../layout/edits.ts";
import { insertItem, metaFromModel, modelFromBlock, rowEmbeds, type LayoutModel } from "../layout/model.ts";
import { scanMarkdownLines } from "../markdown/lineContext.ts";

export interface WrapOptions {
  /** Join an editable block that ends right above the lines, with only blank lines in between. */
  mergeWithPrevious: boolean;
}

/**
 * Plans how the given media lines become a layout: their embeds are gathered in order into rows
 * of at most four and wrapped in a new block, or appended to the block right above. The lines may
 * be separated by blank lines (a multi-file drop inserts them that way), which are dropped.
 *
 * Returns null, touching nothing, when a line holds anything but media embeds, is indented, is not plain text,
 * already belongs to a block, or when other content sits between the lines.
 */
export function planWrap(lines: readonly string[], lineNumbers: readonly number[], options: WrapOptions): LineChange | null {
  const targets = [...new Set(lineNumbers)].sort((a, b) => a - b);
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }

  const contexts = scanMarkdownLines(lines);
  const blocks = findV2Blocks(lines, contexts);
  if (blocks.some((block) => block.openLine <= last && block.closeLine >= first)) {
    return null;
  }

  const embeds: V2Embed[] = [];
  for (let line = first; line <= last; line += 1) {
    const text = stripCarriageReturn(lines[line] ?? "");
    if (!targets.includes(line)) {
      if (text.trim() !== "") {
        return null;
      }
      continue;
    }

    // An indented line belongs to a list item, or is an indented code block, which the line scan does
    // not tell apart from text: a block written there would take it out of the list, or turn code
    // into a layout, and its rows would lose the indentation.
    const row = contexts[line] === "text" && !/^[ \t]/.test(text) ? readEmbedRow(text, line) : null;
    if (!row) {
      return null;
    }
    embeds.push(...row);
  }

  const previous = options.mergeWithPrevious ? editableBlockRightAbove(blocks, lines, first) : null;
  if (previous) {
    const model = embeds.reduce(appendItem, modelFromBlock(previous));
    return { from: previous.openLine, to: last, replacement: serializeBlock(metaFromModel(model), rowEmbeds(model)) };
  }

  const rows: string[] = [];
  for (let start = 0; start < embeds.length; start += MAX_EMBEDS_PER_ROW) {
    rows.push(embeds.slice(start, start + MAX_EMBEDS_PER_ROW).map((embed) => embed.raw).join(" "));
  }
  return { from: first, to: last, replacement: wrapLines(rows) };
}

function editableBlockRightAbove(blocks: readonly V2Block[], lines: readonly string[], first: number): V2Block | null {
  const block = [...blocks].reverse().find((candidate) => candidate.closeLine < first);
  // New media do not join a block with text beside its media: they get a block of their own. Nor do
  // they join a floating block: it would grow down beside the text, while media dropped below a float
  // go into the note's flow.
  if (!block || !isEditable(block) || hasSideText(block) || blockWrap(block) !== null) {
    return null;
  }
  for (let line = block.closeLine + 1; line < first; line += 1) {
    if ((lines[line] ?? "").trim() !== "") {
      return null;
    }
  }
  return block;
}

/** Adds an embed after the last item; a full last row spills into a new row. */
function appendItem(model: LayoutModel, embed: V2Embed): LayoutModel {
  const item = { embed, weight: null, caption: null };
  const lastRow = model.rows.length - 1;
  const lastIndex = (model.rows[lastRow]?.items.length ?? 0) - 1;
  if (lastRow < 0 || lastIndex < 0) {
    return insertItem(model, item, { kind: "newRow", beforeRow: model.rows.length });
  }
  return insertItem(model, item, { kind: "beside", position: { row: lastRow, index: lastIndex }, side: "after" });
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
