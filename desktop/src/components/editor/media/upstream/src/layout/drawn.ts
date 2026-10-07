import { hasSideText, type V2Block } from "../format/v2.ts";
import { layoutDependencies } from "./documentSnapshot.ts";

/**
 * What the layouts drawn for a note in reading view show beyond the section each is drawn in
 * (docs/DESIGN.md, section 4.2). Obsidian re-renders only the sections whose text changed, so a
 * layout can go on showing settings or text that changed in another section; comparing what the
 * layouts were drawn from with the note's new text tells when the whole view needs drawing again.
 */
export interface Drawn {
  /** The layout comment lines of the note, and the numbers of its figures, tables and equations. */
  comments: string;
  /** Every line of each layout with text beside its media, in order; null for one not drawn yet. */
  texts: Array<string | null>;
  /** Full body dependency while a float's influence has no proven end. */
  dependencies?: string;
}

/** What layouts drawn from `blocks` show; `numbers` tells the numbers their text and captions show. */
export function drawnFrom(blocks: readonly V2Block[], numbers = "", lines: readonly string[] = []): Drawn {
  return {
    comments: [...(numbers === "" ? [] : [numbers]), ...blocks.map((block) => `${block.lines[0] ?? ""}\n${block.lines[block.lines.length - 1] ?? ""}`)].join("\n"),
    texts: blocks.filter(hasSideText).map((block) => block.lines.join("\n")),
    dependencies: layoutDependencies(lines, blocks),
  };
}

/**
 * Records that a layout was drawn from the note described by `current`. `textIndex` is the layout's
 * place among the layouts with text beside their media, or -1 for one without text; the other layouts
 * with text keep what they were drawn from. A section left empty, because its text is drawn in
 * another one, draws nothing and records nothing.
 */
export function recordDrawn(previous: Drawn | undefined, current: Drawn, textIndex: number): Drawn {
  const texts = textIndex < 0
    ? previous?.texts ?? current.texts.map(() => null)
    : current.texts.map((text, index) => (index === textIndex ? text : previous?.texts[index] ?? null));
  return { comments: current.comments, texts, dependencies: current.dependencies };
}

/**
 * Whether the drawn layouts miss something of the note's current text. A layout with text that has
 * not been drawn yet misses nothing: it will be drawn from the text of its time.
 */
export function isStale(drawn: Drawn, current: Drawn): boolean {
  return drawn.comments !== current.comments
    || drawn.dependencies !== current.dependencies
    || drawn.texts.length !== current.texts.length
    || drawn.texts.some((text, index) => text !== null && text !== current.texts[index]);
}
