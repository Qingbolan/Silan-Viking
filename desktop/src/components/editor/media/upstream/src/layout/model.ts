import {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_WRAP_WIDTH,
  MAX_EMBEDS_PER_ROW,
  MAX_ROW_HEIGHT,
  MAX_WRAP_SKIP,
  MAX_WRAP_WIDTH,
  MIN_BLOCK_WIDTH,
  MAX_COLUMN_GAP,
  MAX_TEXT_COLUMNS,
  MAX_TEXT_SIZE,
  MIN_ROW_HEIGHT,
  MIN_TEXT_SIZE,
  hasTextColumns as blockHasTextColumns,
  readBlockAlign,
  readBlockSkip,
  readBlockType,
  readBlockValign,
  readBlockWidth,
  readBlockWrap,
  readColumnGap,
  readRowMeta,
  readTextColumns,
  readTextJustify,
  readTextSize,
  type Align,
  type CaptionAlign,
  type TextAlign,
  type TextJustify,
  type V2Block,
  type V2Embed,
  type V2Meta,
  type V2RowMeta,
  type V2Text,
  type WrapSide,
} from "../format/v2.ts";

/**
 * Editable layout model built from a v2 block.
 *
 * Settings are null when the note does not set them, so writing a model back records only what
 * the user actually changed and the opening comment stays short. Every operation returns a new
 * model; embeds travel with their items verbatim.
 */

export interface LayoutItem {
  embed: V2Embed;
  /** Column weight; null means an equal share. */
  weight: number | null;
  caption: string | null;
}

export interface LayoutRow {
  items: LayoutItem[];
  height: number | null;
  /** Share of the container width; single-item rows only. */
  width: number | null;
  /** Single-item rows only. */
  align: Align | null;
  /** Free horizontal position, 0 (left) to 1 (right); single-item rows only, overrides align. */
  offset: number | null;
  captionAlign: CaptionAlign | null;
  /** Row keys this version does not understand, written back unchanged. */
  extra: V2RowMeta;
}

/** Text written in the block beside its media, drawn as Markdown. */
export interface LayoutText {
  /** The lines before the first row, shown left of the media; in a layout without media, all of its text. */
  left: string | null;
  /** The lines after the last row, shown right of the media. */
  right: string | null;
}

export interface LayoutModel {
  rows: LayoutRow[];
  /**
   * The block's share of the container width, taken by its media, or by its text in a layout without
   * media; null means full width, or DEFAULT_WRAP_WIDTH with text beside the layout (wrapped, or
   * written in the block beside its media).
   */
  width: number | null;
  /** The side the layout floats to, with the note's text wrapping around it; null means no wrapping. */
  wrap: WrapSide | null;
  /** How many lines below its place a wrapped layout starts; null starts it right there. */
  skip: number | null;
  /** Text beside the media. A layout with text beside its media does not float; one with text and no media does. */
  text: LayoutText;
  /** How that text lines up with the media; null means at the top. */
  valign: TextAlign | null;
  /** Whether all of the block is text, media lines included: a layout of text with figures in it. */
  allText: boolean;
  /** How the text of a layout without media flows: through this many columns; null means one. */
  cols: number | null;
  /** The space between those columns, in em; null means DEFAULT_COLUMN_GAP. */
  gap: number | null;
  /** How the lines of the layout's text line up across it; null means left. */
  textAlign: Exclude<TextJustify, "left"> | null;
  /** The size of the layout's text relative to the note's; null means the same. */
  size: number | null;
  /** Where a layout narrower than its container sits when it does not float; null means left. */
  align: Exclude<Align, "left"> | null;
  extra: Record<string, unknown>;
}

export interface ItemPosition {
  row: number;
  index: number;
}

export type MoveTarget =
  | { kind: "beside"; position: ItemPosition; side: "before" | "after" }
  /** A new row inserted before `beforeRow`, counted before the move; `rows.length` appends. */
  | { kind: "newRow"; beforeRow: number };

const ALIGN_OFFSETS: ReadonlyArray<readonly [Align, number]> = [["left", 0], ["center", 0.5], ["right", 1]];

export function modelFromBlock(block: V2Block): LayoutModel {
  const { width, wrap, skip, valign, type, cols, gap, textAlign, size, align, ...rest } = block.meta.extra;
  // A layout with text beside its media does not float; its wrap settings are kept as written.
  const columns = blockHasTextColumns(block);
  const extra = columns ? { ...definedOnly({ wrap, skip }), ...rest } : rest;
  return {
    rows: block.rows.map((row, rowIndex) => {
      const settings = readRowMeta(block.meta.rows[rowIndex] ?? {}, row.embeds.length);
      return {
        items: row.embeds.map((embed, index) => ({
          embed,
          weight: settings.widths?.[index] ?? null,
          caption: settings.captions?.[index] ?? null,
        })),
        height: settings.height,
        width: settings.width,
        align: settings.align,
        offset: settings.offset,
        captionAlign: settings.captionAlign,
        extra: settings.extra,
      };
    }),
    width: readBlockWidth(width),
    wrap: columns ? null : readBlockWrap(wrap),
    skip: columns ? null : readBlockSkip(skip),
    text: { left: markdownOf(block.leftText), right: markdownOf(block.rightText) },
    valign: readBlockValign(valign),
    allText: readBlockType(type) !== null,
    cols: readTextColumns(cols),
    gap: readColumnGap(gap),
    textAlign: readTextJustify(textAlign),
    size: readTextSize(size),
    align: readBlockAlign(align),
    extra,
  };
}

function markdownOf(text: V2Text | null): string | null {
  return text === null ? null : text.lines.join("\n");
}

/** Whether the layout has text: beside its media, or on its own. */
export function hasText(model: LayoutModel): boolean {
  return model.text.left !== null || model.text.right !== null;
}

/** Whether the layout is text alone, without media: one column that may float like media. */
export function isTextOnly(model: LayoutModel): boolean {
  return model.rows.length === 0 && hasText(model);
}

/** Whether the layout has text in columns beside its media. Such a layout does not float. */
export function hasTextColumns(model: LayoutModel): boolean {
  return model.rows.length > 0 && hasText(model);
}

/**
 * Whether text can be added beside the layout's media. Text beside media stops a layout from
 * floating, so a wrapped layout would change shape under the first letter typed, and its text editor
 * with it; it has to stop wrapping first.
 */
export function canAddText(model: LayoutModel): boolean {
  return model.rows.length > 0 && model.wrap === null;
}

export function metaFromModel(model: LayoutModel): V2Meta {
  return {
    rows: model.rows.map((row) => {
      const single = row.items.length === 1;
      const meta: V2RowMeta = { ...row.extra };
      if (row.height !== null) {
        meta.height = row.height;
      }
      if (!single && row.items.some((item) => item.weight !== null)) {
        meta.widths = row.items.map((item) => item.weight ?? 1);
      }
      if (single && row.width !== null) {
        meta.width = row.width;
      }
      if (single && row.offset !== null) {
        meta.offset = row.offset;
      } else if (single && row.align !== null) {
        meta.align = row.align;
      }
      if (row.items.some((item) => item.caption !== null)) {
        meta.captions = row.items.map((item) => item.caption);
      }
      if (row.captionAlign !== null) {
        meta.captionAlign = row.captionAlign;
      }
      return meta;
    }),
    extra: {
      ...(model.width === null ? {} : { width: model.width }),
      ...(model.wrap === null ? {} : { wrap: model.wrap }),
      // Without wrapping, skip means nothing; without text beside the media, neither does valign.
      ...(model.wrap === null || model.skip === null ? {} : { skip: model.skip }),
      ...(model.valign === null || !hasTextColumns(model) ? {} : { valign: model.valign }),
      ...(model.allText ? { type: "text" } : {}),
      ...(model.cols === null ? {} : { cols: model.cols }),
      ...(model.cols === null || model.gap === null ? {} : { gap: model.gap }),
      ...(model.textAlign === null ? {} : { textAlign: model.textAlign }),
      ...(model.size === null ? {} : { size: model.size }),
      ...(model.align === null ? {} : { align: model.align }),
      ...model.extra,
    },
  };
}

export function rowEmbeds(model: LayoutModel): V2Embed[][] {
  return model.rows.map((row) => row.items.map((item) => item.embed));
}

/** Where a single item sits, from 0 (left) to 1 (right). */
export function rowOffset(row: LayoutRow): number {
  const align = row.align ?? "center";
  return row.offset ?? ALIGN_OFFSETS.find(([name]) => name === align)?.[1] ?? 0.5;
}

export function moveItem(model: LayoutModel, source: ItemPosition, target: MoveTarget): LayoutModel {
  const rows = cloneRows(model.rows);
  const sourceRow = rows[source.row];
  const item = sourceRow?.items[source.index];
  if (!sourceRow || !item) {
    return model;
  }

  if (target.kind === "beside") {
    const targetRow = rows[target.position.row];
    if (!targetRow?.items[target.position.index]) {
      return model;
    }
    if (target.position.row === source.row && target.position.index === source.index) {
      return model;
    }

    sourceRow.items.splice(source.index, 1);
    let index = target.position.index;
    if (targetRow === sourceRow && source.index < index) {
      index -= 1;
    }
    // A weight only means something relative to its own row.
    const moved = targetRow === sourceRow ? item : { ...item, weight: averageWeight(targetRow) };
    targetRow.items.splice(index + (target.side === "after" ? 1 : 0), 0, moved);
  } else {
    const alreadyAlone = sourceRow.items.length === 1
      && (target.beforeRow === source.row || target.beforeRow === source.row + 1);
    if (alreadyAlone) {
      return model;
    }

    sourceRow.items.splice(source.index, 1);
    const beforeRow = Math.min(Math.max(target.beforeRow, 0), rows.length);
    rows.splice(beforeRow, 0, { ...rowLike(sourceRow), items: [{ ...item, weight: null }] });
  }

  return { ...model, rows: rebalance(rows.filter((row) => row.items.length > 0)) };
}

/** Takes an item out of the layout; the caller decides where it goes next. */
export function removeItem(model: LayoutModel, position: ItemPosition): { model: LayoutModel; item: LayoutItem } | null {
  const rows = cloneRows(model.rows);
  const [item] = rows[position.row]?.items.splice(position.index, 1) ?? [];
  if (!item) {
    return null;
  }
  return { model: { ...model, rows: rows.filter((row) => row.items.length > 0) }, item };
}

/** Adds an item taken from another layout or from a plain line, e.g. one dragged in. */
export function insertItem(model: LayoutModel, item: LayoutItem, target: MoveTarget): LayoutModel {
  const rows = cloneRows(model.rows);

  if (target.kind === "beside") {
    const targetRow = rows[target.position.row];
    if (!targetRow?.items[target.position.index]) {
      return model;
    }
    const inserted = { ...item, weight: averageWeight(targetRow) };
    targetRow.items.splice(target.position.index + (target.side === "after" ? 1 : 0), 0, inserted);
  } else {
    const beforeRow = Math.min(Math.max(target.beforeRow, 0), rows.length);
    rows.splice(beforeRow, 0, {
      items: [{ ...item, weight: null }],
      height: null,
      width: null,
      align: null,
      offset: null,
      captionAlign: null,
      extra: {},
    });
  }

  return { ...model, rows: rebalance(rows) };
}

export function setRowHeight(model: LayoutModel, rowIndex: number, height: number): LayoutModel {
  if (!Number.isFinite(height)) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({ ...row, height: clampHeight(height) }));
}

export function setWeights(model: LayoutModel, rowIndex: number, weights: readonly number[]): LayoutModel {
  const row = model.rows[rowIndex];
  const valid = row !== undefined
    && weights.length === row.items.length
    && weights.every((weight) => Number.isFinite(weight) && weight > 0);
  if (!valid) {
    return model;
  }
  return updateRow(model, rowIndex, (current) => ({
    ...current,
    items: current.items.map((item, index) => ({ ...item, weight: weights[index] ?? item.weight })),
  }));
}

export function setSingleWidth(model: LayoutModel, rowIndex: number, width: number): LayoutModel {
  if (model.rows[rowIndex]?.items.length !== 1 || !Number.isFinite(width)) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({ ...row, width: clampSingleWidth(width) }));
}

export function setAlign(model: LayoutModel, rowIndex: number, align: Align): LayoutModel {
  if (model.rows[rowIndex]?.items.length !== 1) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({ ...row, align, offset: null }));
}

/**
 * Places a single item anywhere from 0 (left) to 1 (right). Left, center and right are stored as
 * `align`, which older versions of the plugin understand too; anything in between as `offset`.
 */
export function setPosition(model: LayoutModel, rowIndex: number, offset: number): LayoutModel {
  if (model.rows[rowIndex]?.items.length !== 1 || !Number.isFinite(offset)) {
    return model;
  }
  const value = round(Math.min(1, Math.max(0, offset)));
  const align = ALIGN_OFFSETS.find(([, at]) => at === value)?.[0];
  return updateRow(model, rowIndex, (row) => (align ? { ...row, align, offset: null } : { ...row, align: null, offset: value }));
}

/**
 * Sets the block's share of the container width. Full width is the default and is not stored; a
 * layout with text beside it stays narrow enough to leave the text room (maxBlockWidth).
 */
export function setBlockWidth(model: LayoutModel, width: number): LayoutModel {
  if (!Number.isFinite(width)) {
    return model;
  }
  const value = round(Math.min(maxBlockWidth(model), Math.max(MIN_BLOCK_WIDTH, width)));
  return { ...model, width: value >= 1 ? null : value };
}

/**
 * Keeps single items the size they are on screen across a change of the block's width, as the
 * frame's right edge does: the frame tightens or loosens around them instead of scaling them, which
 * is the corner's job. A stored width is a share of the item's row, so it is converted to the row's
 * new width; an item is never wider than its row, so once the frame reaches it, it narrows with the
 * frame. Items without a stored width already have a size of their own.
 *
 * The row is the block less what its frame takes from it, `inset`; `available` is the width the
 * block's own share is of. Both are in pixels: the inset does not scale with the block, so a ratio of
 * block widths alone would leave the item a little off its size.
 */
export function keepSingleSizes(before: LayoutModel, after: LayoutModel, available: number, inset = 0): LayoutModel {
  const rowWidth = (model: LayoutModel): number => (effectiveWidth(model) ?? 1) * available - inset;
  const from = rowWidth(before);
  const to = rowWidth(after);
  if (!(from > 0 && to > 0) || from === to) {
    return after;
  }
  const ratio = from / to;
  return {
    ...after,
    // Not rounded here: while the frame is dragged, the item would wobble by up to a pixel. Writing
    // the opening comment rounds it, once.
    rows: after.rows.map((row) => (row.items.length === 1 && row.width !== null ? { ...row, width: clampSingleWidth(row.width * ratio) } : row)),
  };
}

/** The widest a layout may be: full width, or MAX_WRAP_WIDTH with text beside it. */
export function maxBlockWidth(model: LayoutModel): number {
  return besideText(model) ? MAX_WRAP_WIDTH : 1;
}

/** The share of the container width a layout's media is drawn at; null means full width. */
export function effectiveWidth(model: LayoutModel): number | null {
  return model.width ?? (besideText(model) ? DEFAULT_WRAP_WIDTH : null);
}

/** Whether text sits beside the layout: the note's text around its float, or its own text beside its media. */
function besideText(model: LayoutModel): boolean {
  return model.wrap !== null || hasTextColumns(model);
}

/**
 * Floats the layout to one side with the note's text wrapping around it, or stops the wrapping
 * (null). The text needs room beside the layout: a layout at full width gets DEFAULT_WRAP_WIDTH and
 * a wider one than MAX_WRAP_WIDTH is narrowed to it. Without wrapping, `skip` means nothing and goes.
 * A layout with text beside its media does not float and stays as it is.
 */
export function setWrap(model: LayoutModel, wrap: WrapSide | null): LayoutModel {
  if (hasTextColumns(model)) {
    return model;
  }
  if (wrap === null) {
    return model.wrap === null && model.skip === null ? model : { ...model, wrap: null, skip: null };
  }
  const width = Math.min(model.width ?? DEFAULT_WRAP_WIDTH, MAX_WRAP_WIDTH);
  return model.wrap === wrap && model.width === width ? model : { ...model, wrap, width };
}

/** How many lines below its place a wrapped layout starts; 0 starts it right there. */
export function setSkip(model: LayoutModel, skip: number): LayoutModel {
  if (model.wrap === null || !Number.isFinite(skip)) {
    return model;
  }
  const value = Math.min(MAX_WRAP_SKIP, Math.max(0, Math.round(skip)));
  const next = value === 0 ? null : value;
  return next === model.skip ? model : { ...model, skip: next };
}

/** Lines the text beside the media up with them: at the top (the default), in the middle or at the bottom. */
export function setValign(model: LayoutModel, valign: TextAlign): LayoutModel {
  const next = valign === "top" ? null : valign;
  return !hasTextColumns(model) || next === model.valign ? model : { ...model, valign: next };
}

/** The settings of a layout's text, as the text settings of a layout show them. */
export interface TextLayout {
  cols: number;
  gap: number | null;
  textAlign: TextJustify;
  size: number;
  align: Align;
}

/**
 * Sets how a layout's text is laid out. Columns are for a layout of text alone; where a layout sits
 * only matters when it does not float. Values out of range are brought into it; defaults are not stored.
 */
export function setTextLayout(model: LayoutModel, layout: Partial<TextLayout>): LayoutModel {
  const next = { ...model };
  if (layout.cols !== undefined && Number.isFinite(layout.cols) && isTextOnly(model)) {
    const cols = Math.min(MAX_TEXT_COLUMNS, Math.max(1, Math.round(layout.cols)));
    next.cols = cols === 1 ? null : cols;
  }
  if (layout.gap !== undefined) {
    next.gap = layout.gap === null || !Number.isFinite(layout.gap) ? null : round(Math.min(MAX_COLUMN_GAP, Math.max(0, layout.gap)));
  }
  if (next.cols === null) {
    next.gap = null;
  }
  if (layout.textAlign !== undefined) {
    next.textAlign = layout.textAlign === "left" ? null : layout.textAlign;
  }
  if (layout.size !== undefined && Number.isFinite(layout.size)) {
    const size = round(Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, layout.size)));
    next.size = size === 1 ? null : size;
  }
  if (layout.align !== undefined) {
    next.align = layout.align === "left" ? null : layout.align;
  }
  return next;
}

/** The text settings of a layout, defaults filled in. */
export function textLayoutOf(model: LayoutModel): TextLayout {
  return { cols: model.cols ?? 1, gap: model.gap, textAlign: model.textAlign ?? "left", size: model.size ?? 1, align: model.align ?? "left" };
}

/**
 * Scales every row's height by `factor`. With `singleWidths`, rows of a single item grow too, by
 * scaling their width; their height follows it. A row without a stored width uses the share it
 * currently takes up, given by `singleWidths` for that row. When the container itself scales,
 * pass 1 for `singleWidthFactor`: keep that share instead of scaling single items twice.
 */
export function scaleRows(model: LayoutModel, factor: number, singleWidths?: ReadonlyArray<number | null>, singleWidthFactor = factor): LayoutModel {
  if (!Number.isFinite(factor) || factor <= 0) {
    return model;
  }
  return {
    ...model,
    rows: model.rows.map((row, index) => {
      if (row.items.length !== 1) {
        return { ...row, height: clampHeight((row.height ?? DEFAULT_ROW_HEIGHT) * factor) };
      }
      const current = row.width ?? singleWidths?.[index] ?? null;
      return singleWidths && current !== null ? { ...row, width: clampSingleWidth(round(current * singleWidthFactor)) } : row;
    }),
  };
}

/**
 * The row shares its width by the media's aspect ratios again. A row that already does comes back
 * unchanged, so nothing gets written.
 */
export function resetWeights(model: LayoutModel, rowIndex: number): LayoutModel {
  if (!model.rows[rowIndex]?.items.some((item) => item.weight !== null)) {
    return model;
  }
  return updateRow(model, rowIndex, (row) => ({ ...row, items: row.items.map((item) => ({ ...item, weight: null })) }));
}

export function setCaption(model: LayoutModel, position: ItemPosition, caption: string | null): LayoutModel {
  const text = caption?.trim() || null;
  if (!model.rows[position.row]?.items[position.index]) {
    return model;
  }
  return updateRow(model, position.row, (row) => ({
    ...row,
    items: row.items.map((item, index) => (index === position.index ? { ...item, caption: text } : item)),
  }));
}

export function setCaptionAlign(model: LayoutModel, rowIndex: number, captionAlign: CaptionAlign): LayoutModel {
  return updateRow(model, rowIndex, (row) => ({ ...row, captionAlign }));
}

/** Splits rows with more than MAX_EMBEDS_PER_ROW items; the extra rows keep the row's height. */
function rebalance(rows: LayoutRow[]): LayoutRow[] {
  return rows.flatMap((row) => {
    if (row.items.length <= MAX_EMBEDS_PER_ROW) {
      return [row];
    }

    const chunks: LayoutRow[] = [];
    for (let start = 0; start < row.items.length; start += MAX_EMBEDS_PER_ROW) {
      const items = row.items.slice(start, start + MAX_EMBEDS_PER_ROW);
      chunks.push(start === 0 ? { ...row, items } : { ...rowLike(row), items });
    }
    return chunks;
  });
}

function rowLike(row: LayoutRow): LayoutRow {
  return { items: [], height: row.height, width: null, align: null, offset: null, captionAlign: row.captionAlign, extra: {} };
}

function averageWeight(row: LayoutRow): number | null {
  const weights = row.items.map((item) => item.weight).filter((weight): weight is number => weight !== null);
  return weights.length > 0 ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length : null;
}

function updateRow(model: LayoutModel, rowIndex: number, update: (row: LayoutRow) => LayoutRow): LayoutModel {
  const row = model.rows[rowIndex];
  if (!row) {
    return model;
  }
  return { ...model, rows: model.rows.map((current, index) => (index === rowIndex ? update(current) : current)) };
}

function cloneRows(rows: readonly LayoutRow[]): LayoutRow[] {
  return rows.map((row) => ({ ...row, items: [...row.items] }));
}

function clampHeight(height: number): number {
  return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, Math.round(height)));
}

function clampSingleWidth(width: number): number {
  return Math.min(1, Math.max(0.1, width));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function definedOnly(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
