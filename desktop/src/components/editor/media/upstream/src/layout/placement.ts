import { findV2Blocks, isDrawable, MAX_WRAP_SKIP, serializeOpener, type V2Block, type WrapSide } from "../format/v2.ts";
import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";
import { isEditable, planModelEdit, type BlockEdit } from "./edits.ts";
import { adjacentOppositeFloat, visualWrapSkip } from "./floatOrder.ts";
import { metaFromModel, modelFromBlock, setSkip, setWrap, type LayoutModel } from "./model.ts";

/**
 * Moving a whole layout block to another place in its note (docs/DESIGN.md, section 3), together
 * with the side it floats to and how many lines down it starts.
 */

export interface Placement {
  /** The line the block goes in front of; the line count means the end of the note. */
  line: number;
  wrap: WrapSide | null;
  /** How many lines below its place a wrapped block starts; ignored without wrapping. */
  skip: number;
}

export interface GapTop {
  line: number;
  /** Where the gap is on screen. */
  top: number;
}

/** Resolve the block at its current widget position before falling back to a unique text match. */
export function blockForMove(lines: readonly string[], expected: V2Block, line: number): V2Block | "not-found" | "ambiguous" {
  const matches = findV2Blocks(lines).filter((block) => block.lines.length === expected.lines.length
    && block.lines.every((text, index) => text === expected.lines[index]));
  return matches.find((block) => block.openLine === line)
    ?? (matches.length === 1 ? matches[0] : matches.length === 0 ? "not-found" : "ambiguous");
}

const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])[ \t]/;
const HEADING = /^#{1,6}(?:[ \t]|$)/;
const CLOSE_LINE = /^<!-- \/vml -->[ \t]*$/;

/**
 * The lines a block may be moved in front of: the first line of each top-level Markdown block (after
 * a blank line, a heading or another layout block), plus the end of the note. Code, math, comments,
 * frontmatter, indented lines and the inside of lists and of layout blocks are never split.
 */
export function blockGaps(lines: readonly string[], contexts: readonly LineContext[] = scanMarkdownLines(lines, true),
  blocks: readonly V2Block[] = findV2Blocks(lines, contexts)): number[] {
  const inside = insideBlocks(blocks);
  const gaps: number[] = [];
  for (let line = 0; line < lines.length; line += 1) {
    if (startsBlock(lines, contexts, inside, line)) {
      gaps.push(line);
    }
  }
  // EOF is not outside an unterminated fence, equation, frontmatter or comment.
  if (endIsText(lines, contexts)) {
    gaps.push(lines.length);
  }
  return gaps;
}

/**
 * The lines a block may be moved in front of by dragging: those of blockGaps, and the blank lines
 * of a run of them between two top-level blocks but its first. A layout dropped beside such a run
 * goes there, right where it shows, instead of staying far above with as many lines of skip:
 * then its anchor is drawn whenever it is (wrapGuard.ts needs no stand-in). One blank line between
 * blocks adds nothing: the block in front of the next one shows as high.
 */
export function moveGaps(lines: readonly string[], contexts: readonly LineContext[] = scanMarkdownLines(lines, true),
  blocks: readonly V2Block[] = findV2Blocks(lines, contexts)): number[] {
  const gaps = blockGaps(lines, contexts, blocks);
  const inside = insideBlocks(blocks);
  const blank = (line: number): boolean => stripCarriageReturn(lines[line] ?? "").trim() === ""
    && contexts[line] === "text" && !inside.has(line);
  const extra: number[] = [];
  for (let line = 1; line < lines.length; line += 1) {
    if (!blank(line) || !blank(line - 1)) {
      continue;
    }
    let next = line + 1;
    while (next < lines.length && blank(next)) {
      next += 1;
    }
    if (next === lines.length ? endIsText(lines, contexts) : startsBlock(lines, contexts, inside, next)) {
      extra.push(line);
    }
  }
  return [...gaps, ...extra].sort((a, b) => a - b);
}

function insideBlocks(blocks: readonly V2Block[]): Set<number> {
  const inside = new Set<number>();
  for (const block of blocks) {
    for (let line = block.openLine + 1; line <= block.closeLine; line += 1) {
      inside.add(line);
    }
  }
  return inside;
}

/** Whether `line` starts a top-level Markdown block, which a moved block may go in front of. */
function startsBlock(lines: readonly string[], contexts: readonly LineContext[], inside: ReadonlySet<number>, line: number): boolean {
  const text = stripCarriageReturn(lines[line] ?? "");
  if (text.trim() === "" || contexts[line] !== "text" || /^[ \t]/.test(text) || inside.has(line)) {
    return false;
  }
  if (line > 0 && !followsBlockEnd(lines, contexts, line)) {
    return false;
  }
  return !(LIST_ITEM.test(text) && continuesList(lines, line));
}

function endIsText(lines: readonly string[], contexts: readonly LineContext[]): boolean {
  return (contexts[lines.length] ?? scanMarkdownLines(lines, true).at(-1)) === "text";
}

/**
 * The gap a block dragged to `y` goes to. A wrapped block goes in front of the part of the note the
 * pointer is in, the last gap at or above it, so the pointer can then pick the line it starts at.
 * A block that does not wrap goes to the nearest gap.
 */
export function pickGap(gaps: readonly GapTop[], y: number, wrapped: boolean): GapTop | null {
  if (wrapped) {
    let best: GapTop | null = gaps[0] ?? null;
    for (const gap of gaps) {
      if (gap.top <= y) {
        best = gap;
      }
    }
    return best;
  }
  return gaps.reduce<GapTop | null>((best, gap) => (best === null || Math.abs(gap.top - y) < Math.abs(best.top - y) ? gap : best), null);
}

/** Whether putting `block` in front of `line` leaves it where it is. */
export function isSamePlace(lines: readonly string[], block: V2Block, line: number): boolean {
  if (line === block.openLine) {
    return true;
  }
  let next = block.closeLine + 1;
  while (next < lines.length && stripCarriageReturn(lines[next] ?? "").trim() === "") {
    next += 1;
  }
  return line === next;
}

/**
 * Where a wrapped block dropped to start at `top` goes in the note. CSS places no float above one
 * written before it: behind a float written earlier that starts lower, the block would be pushed
 * down to that float's top, away from where it was dropped. It goes in front of the first such
 * float instead, its skip counted from there; that float, starting lower, keeps its place. Next to
 * an opposite float sharing its anchor, the block stays at its place for orderAdjacentFloat, which
 * also keeps that float's height. `lineTop` gives where a line is drawn, in the units of `top`;
 * where the other floats start follows from their anchors and skips, and from the floats before
 * them, which push them down too.
 */
export function placeAboveEarlierFloats(lines: readonly string[], block: V2Block, placement: Placement, top: number,
  lineTop: (line: number) => number, lineHeight: number): Placement {
  if (placement.wrap === null || lineHeight <= 0) {
    return placement;
  }
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((candidate) => candidate.openLine === block.openLine);
  const skipFrom = (line: number): number => Math.min(MAX_WRAP_SKIP, Math.max(0, Math.round((top - lineTop(line)) / lineHeight)));
  let lowest = Number.NEGATIVE_INFINITY;
  for (const [at, other] of blocks.entries()) {
    if (other.openLine >= placement.line) {
      break;
    }
    if (at === index || !isDrawable(other) || modelFromBlock(other).wrap === null) {
      continue;
    }
    lowest = Math.max(lowest, lineTop(other.openLine) + visualWrapSkip(lines, blocks, at) * lineHeight);
    if (lowest <= top + lineHeight / 2) {
      continue;
    }
    if (index >= 0 && adjacentOppositeFloat(lines, blocks, index, -1) === other) {
      return { line: block.openLine, wrap: placement.wrap, skip: skipFrom(block.openLine) };
    }
    return moveGaps(lines).includes(other.openLine) ? { line: other.openLine, wrap: placement.wrap, skip: skipFrom(other.openLine) } : placement;
  }
  return placement;
}

/** Keep adjacent opposite-side floats in the order of the height they start at. CSS cannot place a
 * later float above an earlier one, so a moved block crossing its neighbor must cross it in the
 * note too.
 */
export function orderAdjacentFloat(lines: readonly string[], block: V2Block, placement: Placement): Placement {
  if (placement.wrap === null || !isSamePlace(lines, block, placement.line)) {
    return placement;
  }
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((candidate) => candidate.openLine === block.openLine);
  if (index < 0) {
    return placement;
  }
  const after = adjacentOppositeFloat(lines, blocks, index, 1);
  if (after && placement.wrap !== modelFromBlock(after).wrap && placement.skip > visualWrapSkip(lines, blocks, index + 1)) {
    return { ...placement, line: after.closeLine + 1 };
  }
  const before = adjacentOppositeFloat(lines, blocks, index, -1);
  if (before && placement.wrap !== modelFromBlock(before).wrap && placement.skip < visualWrapSkip(lines, blocks, index - 1)) {
    return { ...placement, line: before.openLine };
  }
  return placement;
}

/**
 * Plans putting `block` at `placement`. At its own place only the opening comment changes.
 * Elsewhere the block leaves its place, taking one of two surrounding blank lines along, and goes in
 * front of the target line with its body verbatim: after a blank line, and followed by one unless
 * text wraps around it. A wrapped block sits right on top of the text that wraps around it.
 * Returns null when the block cannot be edited, [] when nothing changes.
 */
export function planPlacement(lines: readonly string[], block: V2Block, placement: Placement): BlockEdit[] | null {
  const ordered = orderAdjacentFloat(lines, block, placement);
  const crossedAfter = ordered.line !== placement.line && ordered.line > block.closeLine;
  const afterAdjacent = crossedAfter
    && (ordered.line === lines.length || lines[ordered.line]?.trim() === "");
  const gaps = moveGaps(lines);
  if (!isEditable(block) || !gaps.includes(placement.line) || (!gaps.includes(ordered.line) && !afterAdjacent)) {
    return null;
  }
  const current = modelFromBlock(block);
  const blocks = findV2Blocks(lines);
  const index = blocks.findIndex((candidate) => candidate.openLine === block.openLine);
  const after = placement.wrap === current.wrap && isSamePlace(lines, block, placement.line) && index >= 0
    ? adjacentOppositeFloat(lines, blocks, index, 1) : null;
  // When the neighbor crosses the moved widget, its source anchor ends up one rendered line above
  // the note text. Add that line so its actual screen position stays fixed after the reorder.
  const afterVisual = after ? visualWrapSkip(lines, blocks, index + 1) + (crossedAfter ? 1 : 0) : 0;
  if (afterVisual > MAX_WRAP_SKIP) {
    return null;
  }
  const afterEdit = after ? planModelEdit(after, setSkip(modelFromBlock(after), afterVisual)) : null;
  if (after && afterVisual !== (modelFromBlock(after).skip ?? 0) && !afterEdit) {
    return null;
  }
  // Crossing the float before it makes that float start after this one, so its own height has to be
  // pinned too; the move rewrites the neighbor's opening line and takes the pinned value along.
  const crossedBefore = ordered.line !== placement.line && ordered.line < block.openLine;
  const before = crossedBefore && placement.wrap === current.wrap && index >= 0
    ? adjacentOppositeFloat(lines, blocks, index, -1) : null;
  const beforeVisual = before ? visualWrapSkip(lines, blocks, index - 1) + 1 : 0;
  if (beforeVisual > MAX_WRAP_SKIP) {
    return null;
  }
  let beforeModel: LayoutModel | null = null;
  if (before) {
    beforeModel = setSkip(modelFromBlock(before), beforeVisual);
    if (beforeVisual !== (modelFromBlock(before).skip ?? 0) && !planModelEdit(before, beforeModel)) {
      return null;
    }
  }
  // The blank line it leaves behind next to that float no longer sits between two floats and takes
  // its height again, so the text below moves down a line: the moved block follows it, as that float does.
  const model = setSkip(setWrap(current, ordered.wrap), Math.min(MAX_WRAP_SKIP, ordered.skip + (before ? 1 : 0)));
  if (isSamePlace(lines, block, ordered.line)) {
    const edit = planModelEdit(block, model);
    return [...(edit ? [edit] : []), ...(afterEdit ? [afterEdit] : [])];
  }

  // Unchanged settings keep the opening comment exactly as the user wrote it.
  const moved = [openerFor(block, model), ...block.lines.slice(1)];
  const removal: BlockEdit = { anchorLine: block.openLine, anchorLines: block.lines, start: 0, end: block.lines.length - 1, replacement: [] };
  // The neighbor crossed upward keeps its height by carrying its pinned opening line as the target.
  const target = before && beforeModel && ordered.line === before.openLine ? openerFor(before, beforeModel) : undefined;
  return [removal, insertion(lines, ordered.line, moved, model.wrap !== null, target), ...(afterEdit ? [afterEdit] : [])];
}

/** The opening comment `block` gets once its settings read as `model`; unchanged settings keep it verbatim. */
function openerFor(block: V2Block, model: LayoutModel): string {
  const meta = metaFromModel(model);
  return JSON.stringify(meta) === JSON.stringify(metaFromModel(modelFromBlock(block))) ? block.lines[0] ?? "" : serializeOpener(meta);
}

function insertion(lines: readonly string[], line: number, moved: readonly string[], glued: boolean, overrideTarget?: string): BlockEdit {
  const last = lines.length - 1;
  if (line > last) {
    const end = stripCarriageReturn(lines[last] ?? "");
    // The note ends with a line break: the block goes before it, and the line break stays last.
    if (end.trim() === "" && last > 0) {
      const before = stripCarriageReturn(lines[last - 1] ?? "");
      const head = before.trim() === "" ? [] : [""];
      return { anchorLine: last - 1, anchorLines: [before, end], start: 1, end: 1, replacement: [...head, ...moved, ""] };
    }
    return { anchorLine: last, anchorLines: [end], start: 0, end: 0, replacement: [end, ...(end.trim() === "" ? [] : [""]), ...moved] };
  }

  // The anchor validates the target line exactly as written; only the replacement carries an override.
  const written = stripCarriageReturn(lines[line] ?? "");
  const target = overrideTarget ?? written;
  const tail = glued ? [target] : ["", target];
  if (line === 0) {
    return { anchorLine: 0, anchorLines: [written], start: 0, end: 0, replacement: [...moved, ...tail] };
  }
  // Anchored to the line above as well: a single line of text is often not unique.
  const previous = stripCarriageReturn(lines[line - 1] ?? "");
  const head = previous.trim() === "" ? [] : [""];
  return { anchorLine: line - 1, anchorLines: [previous, written], textOffset: 1, start: 1, end: 1, replacement: [...head, ...moved, ...tail] };
}

function followsBlockEnd(lines: readonly string[], contexts: readonly LineContext[], line: number): boolean {
  // Frontmatter, a code fence, math or a comment just ended.
  if (contexts[line - 1] !== "text") {
    return true;
  }
  const previous = stripCarriageReturn(lines[line - 1] ?? "");
  return previous.trim() === "" || HEADING.test(previous) || CLOSE_LINE.test(previous);
}

/** A list item after blank lines still belongs to the list above it, if there is one. */
function continuesList(lines: readonly string[], line: number): boolean {
  for (let previous = line - 1; previous >= 0; previous -= 1) {
    const text = stripCarriageReturn(lines[previous] ?? "");
    if (text.trim() !== "") {
      return LIST_ITEM.test(text) || /^[ \t]/.test(text);
    }
  }
  return false;
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
