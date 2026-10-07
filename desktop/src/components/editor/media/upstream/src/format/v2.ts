import { scanMarkdownLines, type LineContext } from "../markdown/lineContext.ts";

/**
 * v2 layout format: plain media embeds wrapped in HTML comments.
 *
 *   <!-- vml {"v":2,"rows":[{"height":240,"widths":[1,1.4]}]} -->
 *   ![[a.png]] ![alt](b.png)
 *   <!-- /vml -->
 *
 * Every body line made of media embeds only is one layout row. Settings live in the opening comment
 * and are matched to rows by position. The embeds themselves are never rewritten, only moved verbatim.
 *
 * Other lines are text shown beside the media, as ordinary Markdown: the lines before the first row
 * to its left, the lines after the last row to its right. A block with text and no row is a text
 * block: its text is one column (held as its left text). Text between two rows makes the block
 * invalid. See docs/DESIGN.md, section 1.
 */

export type MediaKind = "image" | "video";
export type EmbedSyntax = "wiki" | "markdown";
export type Align = "left" | "center" | "right";
export type CaptionAlign = "left" | "center";
/** The side a layout floats to, with the note's own text wrapping around it. */
export type WrapSide = "left" | "right";
/** How the text beside a layout's media lines up with them vertically. */
export type TextAlign = "top" | "center" | "bottom";
/** How the lines of a layout's text line up across it; left is the default. */
export type TextJustify = "left" | "center" | "right" | "justify";
export type V2RowMeta = Record<string, unknown>;

export interface V2Meta {
  rows: V2RowMeta[];
  /** Unknown top-level keys, written back unchanged. */
  extra: Record<string, unknown>;
}

export interface V2Embed {
  /** Exact source text of the embed. */
  raw: string;
  syntax: EmbedSyntax;
  /** Path used to find the file: decoded, without subpath, size or title. */
  target: string;
  alt: string;
  kind: MediaKind;
  /** Width written in the embed itself, e.g. the 300 in ![[a.png|300]]. */
  nativeWidth: number | null;
  line: number;
  from: number;
  to: number;
}

export interface V2Row {
  line: number;
  embeds: V2Embed[];
}

/** Text written in a block beside its media. */
export interface V2Text {
  /** First and last non-blank line of the text. */
  from: number;
  to: number;
  /** The lines from `from` to `to`, blank ones included, without \r. */
  lines: string[];
}

export type TextSide = "left" | "right";

export interface V2Block {
  openLine: number;
  closeLine: number;
  /** Exact lines of the block (without \r), used to find and validate it before writing. */
  lines: string[];
  rows: V2Row[];
  /** Text before the first row, shown left of the media; in a text block, all of its text. */
  leftText: V2Text | null;
  /** Text after the last row, shown right of the media. */
  rightText: V2Text | null;
  meta: V2Meta;
  metaError: string | null;
  /** First body line out of place: text between two rows. Invalid blocks are left to Obsidian. */
  invalidLine: number | null;
}

export interface ResolvedRow {
  height: number;
  /** One positive weight per embed. */
  widths: number[];
  /** Share of the container width for a single-embed row; null means natural size. */
  width: number | null;
  align: Align;
  captions: Array<string | null>;
  captionAlign: CaptionAlign;
}

export const CLOSE_LINE = "<!-- /vml -->";
export const DEFAULT_ROW_HEIGHT = 220;
export const MIN_ROW_HEIGHT = 80;
export const MAX_ROW_HEIGHT = 900;
export const MAX_EMBEDS_PER_ROW = 4;
export const MIN_BLOCK_WIDTH = 0.2;
/** Width of a wrapped layout that sets none: text needs room beside it. */
export const DEFAULT_WRAP_WIDTH = 0.4;
/** A wrapped layout leaves at least a fifth of the width to the text. */
export const MAX_WRAP_WIDTH = 0.8;
export const MAX_WRAP_SKIP = 40;
export const MAX_TEXT_COLUMNS = 4;
/** Space between text columns, in em. */
export const DEFAULT_COLUMN_GAP = 2;
export const MAX_COLUMN_GAP = 6;
/** The size of a layout's text, relative to the note's. */
export const MIN_TEXT_SIZE = 0.5;
export const MAX_TEXT_SIZE = 2;

export const IMAGE_EXTENSIONS = new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mkv", "mov", "mp4", "ogv", "webm"]);
const OPEN_PATTERN = /^<!-- vml(?:[ \t]+(.*?))?[ \t]*-->[ \t]*$/;
const CLOSE_PATTERN = /^<!-- \/vml -->[ \t]*$/;
// A wiki embed, or a Markdown image whose destination is <...> or allows one level of
// parentheses (e.g. "image (1).png"), followed by an optional title.
const EMBED_PATTERN = /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(\s*(<[^>\n]*>|(?:[^()\s]|\([^()\s]*\))*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const SIZE_PATTERN = /^(\d+)(?:x\d+)?$/;
const REMOTE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

export function findV2Blocks(
  lines: readonly string[],
  contexts: readonly LineContext[] = scanMarkdownLines(lines),
): V2Block[] {
  const blocks: V2Block[] = [];
  let open: { line: number; metaText: string | undefined } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = stripCarriageReturn(lines[index] ?? "");
    if (contexts[index] !== "text") {
      // Code, math and comments inside a block are text of the block; the block still ends on a
      // line of plain text, so one that never leaves them never closes. Frontmatter is no text.
      if (contexts[index] === "frontmatter") {
        open = null;
      }
      continue;
    }

    const opening = OPEN_PATTERN.exec(line);
    if (opening) {
      open = { line: index, metaText: opening[1] };
      continue;
    }

    if (open && CLOSE_PATTERN.test(line)) {
      blocks.push(buildBlock(lines, contexts, open.line, index, open.metaText));
      open = null;
    }
  }

  return blocks;
}

export function parseMeta(text: string | undefined): { meta: V2Meta; error: string | null } {
  const empty: V2Meta = { rows: [], extra: {} };
  if (text === undefined || text.trim() === "") {
    return { meta: empty, error: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { meta: empty, error: error instanceof Error ? error.message : String(error) };
  }

  if (!isRecord(parsed)) {
    return { meta: empty, error: "Layout settings must be a JSON object" };
  }

  const { v: version, rows, ...extra } = parsed;
  if (version !== undefined && version !== 2) {
    return { meta: empty, error: `Unsupported layout format version: ${JSON.stringify(version)}` };
  }

  // Rows that are not a list of objects cannot be written back as they were: a rewrite would drop
  // them, row heights and captions with them, so the block is not editable.
  if (rows !== undefined && !(Array.isArray(rows) && rows.every(isRecord))) {
    return { meta: empty, error: "Layout rows must be a JSON array of objects" };
  }

  return {
    meta: {
      rows: Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [],
      extra,
    },
    error: null,
  };
}

export function resolveRow(block: V2Block, rowIndex: number): ResolvedRow {
  return resolveRowMeta(block.meta.rows[rowIndex] ?? {}, block.rows[rowIndex]?.embeds.length ?? 0);
}

/** Applies the tolerance rules (docs/DESIGN.md, section 1.3): anything missing or invalid falls back to a default. */
export function resolveRowMeta(meta: V2RowMeta, embedCount: number): ResolvedRow {
  const settings = readRowMeta(meta, embedCount);

  return {
    height: settings.height ?? DEFAULT_ROW_HEIGHT,
    widths: settings.widths ?? new Array<number>(embedCount).fill(1),
    width: settings.width,
    align: settings.align ?? "center",
    captions: settings.captions ?? new Array<string | null>(embedCount).fill(null),
    captionAlign: settings.captionAlign ?? "left",
  };
}

/** The settings a row actually sets. Missing or invalid values come back as null. */
export interface RowSettings {
  height: number | null;
  widths: number[] | null;
  width: number | null;
  align: Align | null;
  /** Free horizontal position of a single item; takes precedence over align. */
  offset: number | null;
  captions: Array<string | null> | null;
  captionAlign: CaptionAlign | null;
  /** Keys this version does not understand, written back unchanged. */
  extra: V2RowMeta;
}

const ROW_KEYS = new Set(["height", "widths", "width", "align", "offset", "captions", "captionAlign"]);

export function readRowMeta(meta: V2RowMeta, embedCount: number): RowSettings {
  const height = finiteNumber(meta.height);
  const width = finiteNumber(meta.width);
  const offset = finiteNumber(meta.offset);

  return {
    height: height === null ? null : clamp(Math.round(height), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT),
    widths: positiveNumbers(meta.widths, embedCount),
    width: embedCount === 1 && width !== null && width >= 0.1 && width <= 1 ? width : null,
    align: embedCount === 1 && isAlign(meta.align) ? meta.align : null,
    offset: embedCount === 1 && offset !== null && offset >= 0 && offset <= 1 ? offset : null,
    captions: captionList(meta.captions, embedCount),
    captionAlign: meta.captionAlign === "left" || meta.captionAlign === "center" ? meta.captionAlign : null,
    extra: Object.fromEntries(Object.entries(meta).filter(([key]) => !ROW_KEYS.has(key))),
  };
}

/** The block's share of the container width (top-level `width`); null when unset, invalid or full. */
export function readBlockWidth(value: unknown): number | null {
  const width = finiteNumber(value);
  return width !== null && width >= MIN_BLOCK_WIDTH && width < 1 ? width : null;
}

/** The side the block floats to with text wrapping around it (top-level `wrap`); null when unset or invalid. */
export function readBlockWrap(value: unknown): WrapSide | null {
  return value === "left" || value === "right" ? value : null;
}

/** How many lines below its place a wrapped block starts (top-level `skip`); null when unset, invalid or 0. */
export function readBlockSkip(value: unknown): number | null {
  const skip = finiteNumber(value);
  return skip !== null && skip >= 1 && skip <= MAX_WRAP_SKIP ? Math.round(skip) : null;
}

/** How the text beside the media lines up with them (top-level `valign`); null when unset, invalid or the top. */
export function readBlockValign(value: unknown): TextAlign | null {
  return value === "center" || value === "bottom" ? value : null;
}

/** Whether a block is all text, media lines included (top-level `type`). */
export function readBlockType(value: unknown): "text" | null {
  return value === "text" ? value : null;
}

/** How many columns a text block's text flows through (top-level `cols`); null when unset, invalid or 1. */
export function readTextColumns(value: unknown): number | null {
  const cols = finiteNumber(value);
  return cols !== null && Number.isInteger(cols) && cols >= 2 && cols <= MAX_TEXT_COLUMNS ? cols : null;
}

/** The space between text columns in em (top-level `gap`); null when unset or invalid. */
export function readColumnGap(value: unknown): number | null {
  const gap = finiteNumber(value);
  return gap !== null && gap >= 0 && gap <= MAX_COLUMN_GAP ? gap : null;
}

/** How a layout's text lines up across it (top-level `textAlign`); null when unset, invalid or left. */
export function readTextJustify(value: unknown): Exclude<TextJustify, "left"> | null {
  return value === "center" || value === "right" || value === "justify" ? value : null;
}

/** The size of a layout's text relative to the note's (top-level `size`); null when unset, invalid or 1. */
export function readTextSize(value: unknown): number | null {
  const size = finiteNumber(value);
  return size !== null && size >= MIN_TEXT_SIZE && size <= MAX_TEXT_SIZE && size !== 1 ? size : null;
}

/** Where a layout narrower than its container and not floating sits (top-level `align`); null when unset, invalid or left. */
export function readBlockAlign(value: unknown): Exclude<Align, "left"> | null {
  return value === "center" || value === "right" ? value : null;
}

/** Writes the opening comment. Settings are omitted entirely when there are none, to keep the line short. */
export function serializeOpener(meta: V2Meta): string {
  const rows = trimTrailingEmptyRows(meta.rows.map(withoutUndefined));
  if (rows.length === 0 && Object.keys(meta.extra).length === 0) {
    return "<!-- vml -->";
  }

  // Without row settings, `rows` is left out too: every version reads a missing `rows` as none.
  const json = JSON.stringify({ v: 2, ...meta.extra, ...(rows.length > 0 ? { rows } : {}) }, roundNumbers)
    // "--" may only appear inside strings; escaping it keeps the comment from closing early.
    .replace(/--/g, "-\\u002d")
    // An odd number of "%%" would make the whole line read as an Obsidian comment.
    .replace(/%/g, "\\u0025");
  return `<!-- vml ${json} -->`;
}

/** Row text made of the embeds' exact source, separated by single spaces. */
export function serializeRow(embeds: readonly V2Embed[]): string {
  return embeds.map((embed) => embed.raw).join(" ");
}

export function serializeBlock(meta: V2Meta, rows: ReadonlyArray<readonly V2Embed[]>): string[] {
  return [serializeOpener(meta), ...rows.map(serializeRow), CLOSE_LINE];
}

export function mediaKindOf(target: string): MediaKind | null {
  const path = target.split(/[?#]/)[0] ?? target;
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  return null;
}

export function isRemoteTarget(target: string): boolean {
  return REMOTE_PATTERN.test(target);
}

function buildBlock(
  lines: readonly string[],
  contexts: readonly LineContext[],
  openLine: number,
  closeLine: number,
  metaText: string | undefined,
): V2Block {
  const { meta, error } = parseMeta(metaText);
  // A block of text holds no rows: its media lines are text too.
  const allText = error === null && readBlockType(meta.extra.type) !== null;
  const rows: V2Row[] = [];
  const left: number[] = [];
  const right: number[] = [];
  let invalidLine: number | null = null;

  for (let line = openLine + 1; line < closeLine; line += 1) {
    const text = stripCarriageReturn(lines[line] ?? "");
    if (text.trim() === "") {
      continue;
    }

    // Code, math and comments are text, whatever they hold.
    const embeds = contexts[line] === "text" && !allText ? readEmbedRow(text, line) : null;
    if (!embeds) {
      (rows.length === 0 ? left : right).push(line);
    } else if (right.length > 0) {
      // The text before this row came after another one: it belongs to neither side.
      invalidLine ??= right[0] ?? line;
    } else {
      rows.push({ line, embeds });
    }
  }

  return {
    openLine,
    closeLine,
    lines: lines.slice(openLine, closeLine + 1).map(stripCarriageReturn),
    rows,
    leftText: textPart(lines, left),
    rightText: textPart(lines, right),
    meta,
    metaError: error,
    invalidLine,
  };
}

function textPart(lines: readonly string[], textLines: readonly number[]): V2Text | null {
  const from = textLines[0];
  const to = textLines[textLines.length - 1];
  if (from === undefined || to === undefined) {
    return null;
  }
  return { from, to, lines: lines.slice(from, to + 1).map(stripCarriageReturn) };
}

/** Whether a block has text beside its media. */
export function hasSideText(block: V2Block): boolean {
  return block.leftText !== null || block.rightText !== null;
}

/** Whether a block holds text and no media: its text is one column, which may float like media. */
export function isTextBlock(block: V2Block): boolean {
  return block.rows.length === 0 && block.leftText !== null;
}

/** Whether a block has text in columns beside its media. */
export function hasTextColumns(block: V2Block): boolean {
  return block.rows.length > 0 && hasSideText(block);
}

/** Whether the plugin draws a block: it is valid and has media or text. */
export function isDrawable(block: V2Block): boolean {
  return block.invalidLine === null && (block.rows.length > 0 || isTextBlock(block));
}

/** The side a block floats to. A block with text beside its media does not float. */
export function blockWrap(block: V2Block): WrapSide | null {
  return block.metaError === null && !hasTextColumns(block) ? readBlockWrap(block.meta.extra.wrap) : null;
}

/** Returns the embeds of a row, or null when the line holds anything but media embeds. */
export function readEmbedRow(text: string, line: number): V2Embed[] | null {
  const embeds: V2Embed[] = [];
  let leftover = "";
  let cursor = 0;

  for (const match of text.matchAll(EMBED_PATTERN)) {
    const from = match.index ?? 0;
    leftover += text.slice(cursor, from);
    cursor = from + match[0].length;

    const parsed = match[1] !== undefined
      ? { syntax: "wiki" as const, ...parseWikiEmbed(match[1]) }
      : { syntax: "markdown" as const, ...parseMarkdownEmbed(match[2] ?? "", match[3] ?? "") };
    const kind = mediaKindOf(parsed.target);
    if (!kind) {
      return null;
    }
    embeds.push({ raw: match[0], ...parsed, kind, line, from, to: cursor });
  }

  leftover += text.slice(cursor);
  return embeds.length > 0 && leftover.trim() === "" ? embeds : null;
}

function parseWikiEmbed(inner: string): { target: string; alt: string; nativeWidth: number | null } {
  const [path = "", ...options] = inner.split("|");
  return { target: (path.split("#")[0] ?? "").trim(), ...splitSize(options) };
}

function parseMarkdownEmbed(
  altText: string,
  destination: string,
): { target: string; alt: string; nativeWidth: number | null } {
  let path = destination.startsWith("<") && destination.endsWith(">") ? destination.slice(1, -1) : destination;
  if (!isRemoteTarget(path)) {
    path = path.split("#")[0] ?? path;
    try {
      path = decodeURIComponent(path);
    } catch {
      // Not valid percent-encoding: keep the path as written.
    }
  }
  return { target: path.trim(), ...splitSize(altText.split("|")) };
}

function splitSize(parts: string[]): { alt: string; nativeWidth: number | null } {
  const last = parts[parts.length - 1]?.trim() ?? "";
  const size = SIZE_PATTERN.exec(last);
  if (size) {
    return { alt: parts.slice(0, -1).join("|").trim(), nativeWidth: Number(size[1]) };
  }
  return { alt: parts.join("|").trim(), nativeWidth: null };
}

function positiveNumbers(value: unknown, count: number): number[] | null {
  return Array.isArray(value)
    && value.length === count
    && value.every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)
    ? value as number[]
    : null;
}

function captionList(value: unknown, count: number): Array<string | null> | null {
  return Array.isArray(value)
    && value.length === count
    && value.every((item) => item === null || typeof item === "string")
    ? value as Array<string | null>
    : null;
}

function withoutUndefined(row: V2RowMeta): V2RowMeta {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

function trimTrailingEmptyRows(rows: V2RowMeta[]): V2RowMeta[] {
  let end = rows.length;
  while (end > 0 && Object.keys(rows[end - 1] ?? {}).length === 0) {
    end -= 1;
  }
  return rows.slice(0, end);
}

function roundNumbers(_key: string, value: unknown): unknown {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isAlign(value: unknown): value is Align {
  return value === "left" || value === "center" || value === "right";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
