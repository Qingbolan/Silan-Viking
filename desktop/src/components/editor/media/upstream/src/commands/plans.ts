import { findV2Blocks, hasSideText, readEmbedRow, serializeBlock, type V2Block, type V2Meta } from "../format/v2.ts";
import { planWrap } from "../input/insertion.ts";
import { isEditable, wrapLines, type BlockEdit, type LineChange } from "../layout/edits.ts";
import { metaFromModel, modelFromBlock, rowEmbeds } from "../layout/model.ts";
import { scanMarkdownLines } from "../markdown/lineContext.ts";

/**
 * Wraps the non-blank lines of a selection (whole lines) in one layout block. Media lines alone are
 * gathered into rows (planWrap). Lines with text are wrapped as they are, blank lines between them
 * included: text alone makes a text block, text before or after the media makes text columns beside
 * them, and text between rows of media makes a block of text with the media as figures in it. Code,
 * math and comments go in as text, and so do indented media lines (list content or indented code): with
 * one of them the selection becomes a block of text. A selection starting on an indented line is not
 * wrapped: that line belongs to the list item or code block above it. Nothing is planned unless the lines lie outside any block and the
 * new block reads back as one that can be edited, with exactly these lines in it: a code fence the
 * selection only starts, for one, would take the closing comment in.
 */
export function planWrapSelection(lines: readonly string[], fromLine: number, toLine: number): LineChange | null {
  const targets: number[] = [];
  for (let line = Math.min(fromLine, toLine); line <= Math.max(fromLine, toLine); line += 1) {
    if ((lines[line] ?? "").trim() !== "") {
      targets.push(line);
    }
  }
  const first = targets[0];
  const last = targets[targets.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  const text = (line: number): string => stripCarriageReturn(lines[line] ?? "");
  const isMedia = (line: number): boolean => readEmbedRow(text(line), line) !== null;
  // An indented first line belongs to the list item or indented code block above it: a block
  // starting there would take it out of the list, and code would read as layout text or rows.
  if (INDENTED.test(text(first))) {
    return null;
  }
  if (targets.every(isMedia)) {
    return planWrap(lines, targets, { mergeWithPrevious: false });
  }

  const contexts = scanMarkdownLines(lines);
  const blocks = findV2Blocks(lines, contexts);
  if (blocks.some((block) => block.openLine <= last && block.closeLine >= first)) {
    return null;
  }

  const body = lines.slice(first, last + 1).map(stripCarriageReturn);
  // Text before or after the media makes text columns beside them; anything else is a block of text,
  // with its media lines as figures in it. An indented media line is list content or indented code:
  // as a row it would lose its indentation once rewritten, so it stays text, in a block of text.
  const columns = targets.some(isMedia) && !targets.some((line) => isMedia(line) && INDENTED.test(text(line)));
  const attempts = columns ? [wrapLines(body), wrapLines(body, TEXT_META)] : [wrapLines(body, TEXT_META)];
  for (const replacement of attempts) {
    const after = [...lines.slice(0, first), ...replacement, ...lines.slice(last + 1)];
    const closeLine = first + replacement.length - 1;
    const found = findV2Blocks(after);
    const wrapped = found.filter((block) => block.openLine <= closeLine && block.closeLine >= first);
    const block = wrapped[0];
    const fits = wrapped.length === 1
      && block !== undefined
      && block.openLine === first
      && block.closeLine === closeLine
      && isEditable(block)
      && blocks.length === found.length - 1;
    if (fits) {
      return { from: first, to: last, replacement };
    }
  }
  return null;
}

const TEXT_META: V2Meta = { rows: [], extra: { type: "text" } };
const INDENTED = /^[ \t]/;

interface Position {
  line: number;
  ch: number;
}

/**
 * The lines a selection covers. Whole lines selected with Shift+Down or by dragging end at the start
 * of the line after them, which the selection does not take any of.
 */
export function selectedLines(from: Position, to: Position): { from: number; to: number } {
  const [start, end] = from.line < to.line || (from.line === to.line && from.ch <= to.ch) ? [from, to] : [to, from];
  return { from: start.line, to: end.ch === 0 && end.line > start.line ? end.line - 1 : end.line };
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

export function blockAt(lines: readonly string[], line: number): V2Block | null {
  return findV2Blocks(lines).find((block) => block.openLine <= line && line <= block.closeLine) ?? null;
}

/**
 * Merges the block around `line` with the next one, when only blank lines separate them. Blocks with
 * text beside their media are not merged: the text of one would end up between rows of the other.
 * The merged block keeps the first block's settings, so the next block may only set what the first
 * sets the same way, unknown keys included: nothing it says is dropped.
 */
export function planMergeWithNext(lines: readonly string[], line: number): LineChange | null {
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((block) => block.openLine <= line && line <= block.closeLine);
  const current = blocks[index];
  const next = blocks[index + 1];
  const mergeable = (block: V2Block | undefined): block is V2Block => block !== undefined && isEditable(block) && !hasSideText(block);
  if (index < 0 || !mergeable(current) || !mergeable(next) || !settingsKept(current, next)) {
    return null;
  }
  for (let between = current.closeLine + 1; between < next.openLine; between += 1) {
    if ((lines[between] ?? "").trim() !== "") {
      return null;
    }
  }

  const first = modelFromBlock(current);
  const merged = { ...first, rows: [...first.rows, ...modelFromBlock(next).rows] };
  return { from: current.openLine, to: next.closeLine, replacement: serializeBlock(metaFromModel(merged), rowEmbeds(merged)) };
}

/** Whether every block setting of `next` is set the same way in `first`, which the merged block keeps. */
function settingsKept(first: V2Block, next: V2Block): boolean {
  return Object.entries(next.meta.extra).every(([key, value]) => JSON.stringify(first.meta.extra[key]) === JSON.stringify(value));
}

/** Commands and input conversion use the same source validation and write boundary as gestures. */
export function lineChangeEdit(lines: readonly string[], change: LineChange): BlockEdit {
  const contexts = scanMarkdownLines(lines, true);
  // A complete fence/equation selection is enclosed at its following text boundary; its body
  // stays verbatim. Partial constructs were already rejected by the planner's round-trip check.
  let textOffset = 0;
  while (change.from + textOffset <= change.to && contexts[change.from + textOffset] !== "text") textOffset++;
  return { anchorLine: change.from, anchorLines: lines.slice(change.from, change.to + 1).map(stripCarriageReturn),
    textOffset, start: 0, end: change.to - change.from, replacement: change.replacement };
}
