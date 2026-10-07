import type { EditorChangeLike, EditorLike, EditorPosition } from "../editor/editorLike.ts";
import {
  CLOSE_LINE,
  findV2Blocks,
  hasSideText,
  isTextBlock,
  serializeBlock,
  serializeOpener,
  type TextSide,
  type V2Block,
  type V2Embed,
  type V2Meta,
  type V2Text,
} from "../format/v2.ts";
import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";
import { metaFromModel, rowEmbeds, type LayoutModel } from "./model.ts";
import { sourceAssertionsMatch, type SourceAssertion } from "./sourceAssertions.ts";
import { blockIdentity } from "./blockIdentity.ts";

/**
 * Turns layout changes into validated line edits (docs/DESIGN.md, section 3).
 *
 * An edit is anchored to the exact lines its block had when it was rendered. Before writing, the
 * anchor must still be at its line, or, if the note shifted since, appear exactly once elsewhere in
 * plain text. Otherwise nothing is written. Only the block's own lines ever change.
 */

export interface BlockEdit {
  /** A rendered runtime instance must bind to its current source before raw-text resolution. */
  blockId?: string;
  anchorLine: number;
  anchorLines: string[];
  /** The line within the anchor that must be text; preceding lines only validate context. */
  textOffset?: number;
  /** Replaces anchorLines[start..end] (inclusive). */
  start: number;
  end: number;
  replacement: string[];
}

/** Replaces lines from..to (inclusive) of the current document. */
export interface LineChange {
  from: number;
  to: number;
  replacement: string[];
}

export type EditFailureReason = "not-found" | "ambiguous" | "overlap" | "read-only" | "stale-dependency";

export interface EditFailure {
  ok: false;
  reason: EditFailureReason;
}

export type ResolveResult = { ok: true; changes: LineChange[] } | EditFailure;

/**
 * Only blocks that were read completely may be rewritten. With unreadable settings (a typo, or a
 * newer format version) or text out of place in the body (between two rows), a
 * rewrite would silently drop what we could not read, so such blocks are displayed but never
 * written to (docs/DESIGN.md, section 1.3).
 */
export function isEditable(block: V2Block): boolean {
  return block.metaError === null && block.invalidLine === null;
}

/**
 * Plans the edit for a changed model. A settings-only change rewrites just the opening comment and
 * keeps the body as the user wrote it; moving embeds rewrites the rows, and the text beside them
 * stays exactly as written; a model that lost its last embed removes the block, leaving only its
 * text. A text block has no embeds to begin with: only its settings change.
 * Returns null when there is nothing to write or the block is not editable.
 */
export function planModelEdit(block: V2Block, model: LayoutModel): BlockEdit | null {
  if (!isEditable(block)) {
    return null;
  }
  const embeds = rowEmbeds(model);
  const lastLine = block.lines.length - 1;
  if (embeds.length === 0 && block.rows.length > 0) {
    return anchored(block, 0, lastLine, textLines(block));
  }

  const meta = metaFromModel(model);
  if (sameRows(block, embeds)) {
    const opener = serializeOpener(meta);
    return opener === block.lines[0] ? null : anchored(block, 0, 0, [opener]);
  }
  return anchored(block, 0, lastLine, blockLines(block, meta, embeds));
}

/** The lines right above and below a block in the note, as far as they are known. */
export interface LinesAround {
  before?: string;
  after?: string;
}

/**
 * Rewrites the block without the embed and puts the embed on its own line right after it. The embed
 * line is kept a paragraph of its own: a wrapped block sits right on top of the text it wraps, and an
 * embed glued to that text would join its paragraph and take over the float's anchor.
 */
export function planMoveOut(block: V2Block, model: LayoutModel, embed: V2Embed, around: LinesAround = {}): BlockEdit | null {
  if (!isEditable(block)) {
    return null;
  }
  const embeds = rowEmbeds(model);
  const rest = embeds.length === 0 ? textLines(block) : blockLines(block, metaFromModel(model), embeds);
  const head = rest.length > 0 ? [...rest, ""] : isBlankOrEdge(around.before) ? [] : [""];
  const tail = isBlankOrEdge(around.after) ? [] : [""];
  return anchored(block, 0, block.lines.length - 1, [...head, embed.raw, ...tail]);
}

function isBlankOrEdge(line: string | undefined): boolean {
  return line === undefined || line.trim() === "";
}

/** What planColumnText makes of the text typed on one side of a layout's media. */
export interface ColumnTextPlan {
  /** Whether the text can go on that side as it is. */
  fits: boolean;
  /** The edit; null when there is nothing to write, because the text is there already or does not fit. */
  edit: BlockEdit | null;
}

/**
 * Puts `text`, typed in the layout itself, on one side of the media (docs/DESIGN.md, section 3).
 * Only that side's own lines change: from its first line to its last, or, on a side without text
 * yet, new lines at the top of the body (left) or at its bottom (right). Blank lines around the
 * text are left out, and no text at all takes the side's lines out, except in a text block: its one
 * column, the left one, is never emptied, or the block would be no layout at all. The block must read back with
 * its opening comment, rows and other side as they were and this text on the side: a line of media
 * embeds, a code fence or a layout comment would change what the block is, so such text does not
 * fit and nothing is written.
 */
export function planColumnText(block: V2Block, side: TextSide, text: string): ColumnTextPlan {
  const textBlock = isTextBlock(block);
  if (!isEditable(block) || (block.rows.length === 0 && !(textBlock && side === "left"))) {
    return { fits: false, edit: null };
  }
  const lines = withoutBlankEdges(text.split("\n"));
  if (sameLines(lines, textOf(block, side))) {
    return { fits: true, edit: null };
  }
  if (textBlock && lines.length === 0) {
    return { fits: false, edit: null };
  }

  const part = side === "left" ? block.leftText : block.rightText;
  const closeLine = block.lines.length - 1;
  // Text right above the closing comment keeps a list from taking the comment in (keepListOpen).
  const last = side === "right" || textBlock;
  let edit: BlockEdit;
  if (part) {
    const end = part.to - block.openLine;
    const written = last && end + 1 === closeLine ? keepListOpen(lines) : lines;
    edit = anchored(block, part.from - block.openLine, end, written);
  } else {
    // The comment next to the new lines is written back exactly as it was.
    const edge = side === "left" ? 0 : closeLine;
    const comment = block.lines[edge] ?? "";
    edit = anchored(block, edge, edge, side === "left" ? [comment, ...lines] : [...keepListOpen(lines), comment]);
  }

  const after = [...block.lines];
  after.splice(edit.start, edit.end - edit.start + 1, ...edit.replacement);
  const [reread, ...others] = findV2Blocks(after);
  const fits = reread !== undefined
    && others.length === 0
    && reread.openLine === 0
    && reread.closeLine === after.length - 1
    && onlyColumnTextDiffers(block, reread, side, lines);
  return fits ? { fits, edit } : { fits: false, edit: null };
}

/**
 * Whether `after` is `before` with nothing changed but the text on `side`, which now reads `lines`
 * (blank lines around them aside): the same opening comment, rows and text on the other side, and
 * still a block that can be edited.
 */
export function onlyColumnTextDiffers(before: V2Block, after: V2Block, side: TextSide, lines: readonly string[]): boolean {
  const other = side === "left" ? "right" : "left";
  return isEditable(after)
    && after.lines[0] === before.lines[0]
    && sameRows(after, before.rows.map((row) => row.embeds))
    && sameLines(textOf(after, other), textOf(before, other))
    && sameLines(textOf(after, side), withoutBlankEdges(lines));
}

/** Removes the two layout comments and leaves the body exactly as written. */
export function planUnwrap(block: V2Block): BlockEdit | null {
  return isEditable(block) ? anchored(block, 0, block.lines.length - 1, block.lines.slice(1, -1)) : null;
}

/** Batch commands count and remove only layouts whose complete format can be edited. */
export function planUnwrapAll(blocks: readonly V2Block[]): BlockEdit[] {
  return blocks.flatMap(block => {
    const edit = planUnwrap(block);
    return edit ? [edit] : [];
  });
}

/** Wraps lines in a layout block, with no settings unless given. */
export function wrapLines(lines: readonly string[], meta: V2Meta = { rows: [], extra: {} }): string[] {
  return [serializeOpener(meta), ...keepListOpen(lines), CLOSE_LINE];
}

const LIST_ITEM = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

/**
 * The lines that go right above a closing comment. Obsidian's reading view reads a closing comment
 * right after a list as part of the list's last item, and the text after the block along with it
 * (docs/DESIGN.md, section 4.2), so text ending in a list gets a blank line after it; blank lines in
 * a block are ignored.
 */
export function keepListOpen(lines: readonly string[]): string[] {
  let start = lines.length;
  while (start > 0 && (lines[start - 1] ?? "").trim() !== "") {
    start -= 1;
  }
  const endsInList = start < lines.length && lines.slice(start).some((line) => LIST_ITEM.test(line));
  return endsInList ? [...lines, ""] : [...lines];
}

export function resolveEdits(lines: readonly string[], edits: readonly BlockEdit[], readSet: readonly SourceAssertion[] = []): ResolveResult {
  if (!sourceAssertionsMatch(lines, readSet)) {
    return { ok: false, reason: "stale-dependency" };
  }
  const normalized = lines.map(stripCarriageReturn);
  let contexts: LineContext[] | null = null;
  const contextAt = (line: number): LineContext | undefined => (contexts ??= scanMarkdownLines(normalized, true))[line];

  const changes: LineChange[] = [];
  for (const edit of edits) {
    const at = locateAnchor(normalized, edit, contextAt);
    if (typeof at === "string") {
      return { ok: false, reason: at };
    }

    const from = at + edit.start;
    let to = at + edit.end;
    // Removing a block between two blank lines would leave a double gap, and one at the top of the
    // note a leading blank line; take one of them along.
    if (edit.replacement.length === 0 && (from === 0 || isBlank(normalized[from - 1])) && isBlank(normalized[to + 1])) {
      to += 1;
    }
    // Several edits may validate the same block, provided their written lines do not overlap.
    if (changes.some((change) => from <= change.to && to >= change.from)) {
      return { ok: false, reason: "overlap" };
    }
    changes.push({ from, to, replacement: edit.replacement });
  }

  // Protect every entry point, including commands and future planners that construct raw edits.
  const readOnly = findV2Blocks(normalized, contexts ??= scanMarkdownLines(normalized, true)).filter(block => !isEditable(block));
  if (changes.some(change => readOnly.some(block => change.from <= block.closeLine && change.to >= block.openLine))) {
    return { ok: false, reason: "read-only" };
  }
  return { ok: true, changes: changes.sort((a, b) => b.from - a.from) };
}

export function applyLineChanges(lines: readonly string[], changes: readonly LineChange[]): string[] {
  const result = [...lines];
  for (const change of [...changes].sort((a, b) => b.from - a.from)) {
    result.splice(change.from, change.to - change.from + 1, ...change.replacement);
  }
  return result;
}

/** Applies edits to file content, keeping its line endings; untouched lines stay byte-identical. */
export function applyEditsToText(text: string, edits: readonly BlockEdit[], readSet: readonly SourceAssertion[] = []): { ok: true; text: string } | EditFailure {
  const lines = text.split("\n");
  const resolved = resolveEdits(lines, edits, readSet);
  if (!resolved.ok) {
    return resolved;
  }

  const crlf = text.includes("\r\n");
  const lastLine = lines.length - 1;
  const lastLineHasCr = (lines[lastLine] ?? "").endsWith("\r");
  const changes = crlf
    ? resolved.changes.map((change) => ({
      ...change,
      replacement: change.replacement.map((line, index) => {
        const endsFile = change.to === lastLine && index === change.replacement.length - 1 && !lastLineHasCr;
        return endsFile ? line : `${line}\r`;
      }),
    }))
    : resolved.changes;

  let result = applyLineChanges(lines, changes).join("\n");
  if (crlf && !text.endsWith("\r") && result.endsWith("\r")) {
    result = result.slice(0, -1);
  }
  return { ok: true, text: result };
}

/** Applies edits to an open editor as a single transaction, or changes nothing on failure. */
export function applyEditsToEditor(editor: EditorLike, edits: readonly BlockEdit[], readSet: readonly SourceAssertion[] = []): { ok: true } | EditFailure {
  const lines = editor.getValue().split("\n");
  const resolved = resolveEdits(lines, edits, readSet);
  if (!resolved.ok) {
    return resolved;
  }

  if (resolved.changes.length > 0) {
    editor.transaction({ changes: resolved.changes.map((change) => toEditorChange(lines, change)) });
  }
  return { ok: true };
}

/** A change to text by character offsets, as CodeMirror takes it. */
export interface OffsetChange {
  from: number;
  to: number;
  insert: string;
}

/** Plans edits on `text` as changes by character offsets, all relative to `text`, or fails as a whole. */
export function planOffsetChanges(text: string, edits: readonly BlockEdit[], readSet: readonly SourceAssertion[] = []): { ok: true; changes: OffsetChange[] } | EditFailure {
  const lines = text.split("\n");
  const resolved = resolveEdits(lines, edits, readSet);
  if (!resolved.ok) {
    return resolved;
  }
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const at = (position: EditorPosition): number => (starts[position.line] ?? text.length) + position.ch;
  const changes = resolved.changes.map((change) => {
    const editorChange = toEditorChange(lines, change);
    return { from: at(editorChange.from), to: at(editorChange.to ?? editorChange.from), insert: editorChange.text };
  });
  return { ok: true, changes: changes.sort((a, b) => a.from - b.from) };
}

function toEditorChange(lines: readonly string[], change: LineChange): EditorChangeLike {
  const lineEnd = (line: number) => ({ line, ch: (lines[line] ?? "").length });

  if (change.replacement.length > 0) {
    return { from: { line: change.from, ch: 0 }, to: lineEnd(change.to), text: change.replacement.join("\n") };
  }
  // Deleting whole lines also removes one line break, matching applyLineChanges.
  if (change.to + 1 < lines.length) {
    return { from: { line: change.from, ch: 0 }, to: { line: change.to + 1, ch: 0 }, text: "" };
  }
  if (change.from > 0) {
    return { from: lineEnd(change.from - 1), to: lineEnd(change.to), text: "" };
  }
  return { from: { line: 0, ch: 0 }, to: lineEnd(change.to), text: "" };
}

function locateAnchor(
  lines: readonly string[],
  edit: BlockEdit,
  contextAt: (line: number) => LineContext | undefined,
): number | EditFailureReason {
  const usable = (line: number) => matchesAt(lines, edit.anchorLines, line) && contextAt(line + (edit.textOffset ?? 0)) === "text";
  if (usable(edit.anchorLine)) {
    return edit.anchorLine;
  }

  const hits: number[] = [];
  for (let line = 0; line + edit.anchorLines.length <= lines.length; line += 1) {
    if (usable(line)) {
      hits.push(line);
    }
  }
  if (hits.length === 1) {
    return hits[0] ?? "not-found";
  }
  return hits.length === 0 ? "not-found" : "ambiguous";
}

function matchesAt(lines: readonly string[], expected: readonly string[], at: number): boolean {
  return at >= 0
    && at + expected.length <= lines.length
    && expected.every((line, index) => lines[at + index] === line);
}

function sameRows(block: V2Block, embeds: ReadonlyArray<readonly V2Embed[]>): boolean {
  return block.rows.length === embeds.length
    && block.rows.every((row, index) => {
      const target = embeds[index] ?? [];
      return row.embeds.length === target.length && row.embeds.every((embed, column) => embed.raw === target[column]?.raw);
    });
}

/**
 * The block with new rows. Everything before its first row and after its last one, the text beside
 * the media included, stays exactly as written.
 */
function blockLines(block: V2Block, meta: V2Meta, embeds: ReadonlyArray<readonly V2Embed[]>): string[] {
  const lines = serializeBlock(meta, embeds);
  const first = block.rows[0];
  const last = block.rows[block.rows.length - 1];
  if (!hasSideText(block) || !first || !last) {
    return lines;
  }
  return [
    lines[0] ?? "",
    ...block.lines.slice(1, first.line - block.openLine),
    ...lines.slice(1, -1),
    ...block.lines.slice(last.line - block.openLine + 1),
  ];
}

function textOf(block: V2Block, side: TextSide): readonly string[] {
  return (side === "left" ? block.leftText : block.rightText)?.lines ?? [];
}

function withoutBlankEdges(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim() === "") {
    start += 1;
  }
  while (end > start && (lines[end - 1] ?? "").trim() === "") {
    end -= 1;
  }
  return lines.slice(start, end);
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((line, index) => line === b[index]);
}

/** What stays of a block that loses its last embed: its text, left then right, as separate paragraphs. */
function textLines(block: V2Block): string[] {
  const parts = [block.leftText, block.rightText].filter((part): part is V2Text => part !== null);
  return parts.flatMap((part, index) => (index === 0 ? part.lines : ["", ...part.lines]));
}

function anchored(block: V2Block, start: number, end: number, replacement: string[]): BlockEdit {
  const blockId = blockIdentity(block);
  return { ...(blockId ? { blockId } : {}), anchorLine: block.openLine, anchorLines: block.lines, start, end, replacement };
}

function isBlank(line: string | undefined): boolean {
  return line !== undefined && line.trim() === "";
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
