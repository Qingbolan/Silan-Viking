/**
 * Pure parts of typing Markdown in a layout's text column (docs/DESIGN.md, section 4.2): what the keys
 * and Obsidian's editor commands do there, as in the note's editor, and the link being typed that
 * suggestions are made for. How the text is drawn is in columnStyle.ts.
 */

/** What Enter puts in on a line of a list or a quote, counted from the line's start. */
export interface LineBreak {
  from: number;
  to: number;
  insert: string;
  /** Where the cursor goes. */
  cursor: number;
}

/** Quote markers, indentation, list marker, the space after it and a task's box. */
const LIST_PREFIX = /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)(\[[ xX]\](?:[ \t]+|$))?/;
const QUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)+/;

/**
 * Enter on `line` with the cursor at `at`, as in the note's editor. A list item or a quote line goes
 * on on the next line with the same markers, the next number and an unchecked box; an empty one ends
 * instead, or moves up a level when it is nested (by one `unit` of indentation). Null for other lines,
 * and for a cursor among the markers, where Enter is an ordinary line break.
 */
export function continueList(line: string, at: number, unit: string): LineBreak | null {
  const item = LIST_PREFIX.exec(line);
  const quote = item ? (item[1] ?? "") : (QUOTE_PREFIX.exec(line)?.[0] ?? null);
  if (quote === null) {
    return null;
  }
  const prefix = item ? item[0] : quote;
  if (at < prefix.length) {
    return null;
  }

  if (line.slice(prefix.length).trim() === "") {
    if (!item) {
      // An empty quote line ends a level of the quote.
      const rest = quote.replace(/>[ \t]?$/, "");
      return { from: 0, to: line.length, insert: rest, cursor: rest.length };
    }
    const indent = item[2] ?? "";
    if (indent !== "") {
      const outdented = indent.endsWith(unit) ? indent.slice(0, -unit.length) : indent.replace(/(?:\t| {1,4})$/, "");
      return { from: quote.length, to: quote.length + indent.length, insert: outdented, cursor: line.length - indent.length + outdented.length };
    }
    return { from: quote.length, to: line.length, insert: "", cursor: quote.length };
  }

  let next = quote;
  if (item) {
    const ordered = /^(\d+)([.)])$/.exec(item[3] ?? "");
    const marker = ordered ? `${Number(ordered[1]) + 1}${ordered[2] ?? "."}` : (item[3] ?? "-");
    next = `${quote}${item[2] ?? ""}${marker}${item[4] || " "}${item[5] ? "[ ] " : ""}`;
  }
  return { from: at, to: at, insert: `\n${next}`, cursor: at + 1 + next.length };
}

/** The quote markers a line starts with; its indentation and other markup come after them. */
const QUOTE_MARKERS = /^(?: {0,3}>[ ]?)*/;

function quoteEnd(line: string): number {
  return QUOTE_MARKERS.exec(line)?.[0].length ?? 0;
}

/** Tab, and Obsidian's Indent list: the line gets one `unit` of indentation more, after its quote markers. */
export function indentLine(line: string, unit: string): string {
  const at = quoteEnd(line);
  return line.slice(0, at) + unit + line.slice(at);
}

/** Shift+Tab, and Unindent list: one `unit` of indentation less, after the quote markers; a tab is `tabSize` columns wide. */
export function outdentLine(line: string, unit: string, tabSize: number): string {
  const at = quoteEnd(line);
  const space = /^[ \t]*/.exec(line.slice(at))?.[0] ?? "";
  let column = 0;
  for (const char of space) {
    column = char === "\t" ? column + tabSize - (column % tabSize) : column + 1;
  }
  const target = Math.max(0, column - (unit === "\t" ? tabSize : unit.length));
  const indent = unit === "\t" ? "\t".repeat(Math.floor(target / tabSize)) + " ".repeat(target % tabSize) : " ".repeat(target);
  return line.slice(0, at) + indent + line.slice(at + space.length);
}

/** A line's markup after its quote markers: indentation, then a heading's marker, or a list marker and a task's box. */
interface Markup {
  /** Where the indentation ends. */
  indent: number;
  /** How long the heading's marker is, with the space after it. */
  heading: number;
  /** How long the list marker is, with the space after it. */
  list: number;
  ordered: boolean;
  /** How long the task's box is, with the space after it. */
  box: number;
  checked: boolean;
}

function markupOf(line: string): Markup {
  const quote = quoteEnd(line);
  const indent = quote + (/^[ \t]*/.exec(line.slice(quote))?.[0].length ?? 0);
  const rest = line.slice(indent);
  const heading = /^#{1,6}(?:[ \t]+|$)/.exec(rest)?.[0].length ?? 0;
  const list = heading > 0 ? null : /^([-*+]|\d{1,9}[.)])(?:[ \t]+|$)/.exec(rest);
  const box = list ? /^\[([^\]])\](?:[ \t]+|$)/.exec(rest.slice(list[0].length)) : null;
  return {
    indent,
    heading,
    list: list?.[0].length ?? 0,
    ordered: /^\d/.test(list?.[1] ?? ""),
    box: box?.[0].length ?? 0,
    checked: box !== null && box[1] !== " ",
  };
}

function splice(line: string, from: number, to: number, insert: string): string {
  return line.slice(0, from) + insert + line.slice(to);
}

/** Obsidian's Toggle checkbox status (Ctrl+L): a line becomes a task, and a task is checked or unchecked. */
export function toggleTask(line: string): string {
  const markup = markupOf(line);
  const at = markup.indent + markup.list;
  if (markup.box > 0) {
    return splice(line, at + 1, at + 2, markup.checked ? " " : "x");
  }
  return splice(line, at, at, markup.list > 0 ? "[ ] " : "- [ ] ");
}

/** Cycle bullet/checkbox: a line becomes a list item, an item a task, a task a checked one, and a checked task an item again. */
export function cycleTask(line: string): string {
  const markup = markupOf(line);
  const at = markup.indent + markup.list;
  if (markup.list === 0) {
    return splice(line, markup.indent, markup.indent, "- ");
  }
  if (markup.box === 0) {
    return splice(line, at, at, "[ ] ");
  }
  return markup.checked ? splice(line, at, at + markup.box, "") : splice(line, at + 1, at + 2, "x");
}

/** Toggle bullet list: a line becomes a bullet item; a task loses its box, a numbered item its number, and a bullet item its bullet. */
export function toggleBullet(line: string): string {
  const { indent, list, box, ordered } = markupOf(line);
  if (list === 0) {
    return splice(line, indent, indent, "- ");
  }
  if (ordered) {
    return splice(line, indent, indent + list + box, "- ");
  }
  return box > 0 ? splice(line, indent + list, indent + list + box, "") : splice(line, indent, indent + list, "");
}

/** Toggle numbered list, on the lines of a selection in turn: they become items numbered from 1, and numbered items lose their numbers. */
export function toggleNumbered(lines: readonly string[]): string[] {
  let number = 0;
  return lines.map((line) => {
    const { indent, list, box, ordered } = markupOf(line);
    if (list > 0 && ordered) {
      return box > 0 ? splice(line, indent + list, indent + list + box, "") : splice(line, indent, indent + list, "");
    }
    number += 1;
    return splice(line, indent, indent + list + box, `${number}. `);
  });
}

/** Toggle blockquote: a line becomes quoted, and a quoted line loses a level. */
export function toggleQuote(line: string): string {
  const marker = /^ {0,3}>[ ]?/.exec(line);
  return marker ? line.slice(marker[0].length) : `> ${line}`;
}

/** Set heading: a line becomes a heading of `level`, after its quote markers and indentation; level 0 takes a heading away. */
export function setHeading(line: string, level: number): string {
  const { indent, heading } = markupOf(line);
  if (heading === 0 && level === 0) {
    return line;
  }
  return splice(line, indent, indent + heading, level > 0 ? `${"#".repeat(level)} ` : "");
}

/** The change that turns `before` into `after`: what lies between the parts they share at both ends. Null when they are the same. */
export function lineDiff(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) {
    return null;
  }
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end += 1;
  }
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

/** A piece of a column's text, such as a formatting marker from its syntax tree or a word. */
export interface Span {
  from: number;
  to: number;
}

/** Changes to a column's text, and the selection after them. */
export interface TextChange {
  changes: Array<{ from: number; to: number; insert: string }>;
  anchor: number;
  head: number;
}

/**
 * Obsidian's toggles for bold, italic, strikethrough, highlights, inline code and inline math, as in
 * the note's editor. A selection gets `marker` on both sides, on each line it spans, or loses the
 * markers of this formatting just inside or just around it. Without a selection:
 * - in formatted text, the formatting comes out; right before its closing marker the cursor steps
 *   over the marker instead, and right after its opening marker nothing happens;
 * - in a `word`, the word gets the markers, and the cursor keeps its place in it;
 * - elsewhere an empty pair goes in with the cursor between, and comes out again on a second press.
 * `markers` are the tokens of this formatting's markers, openers and closers in turn, which decide
 * what is formatted, so italic toggled inside bold text never takes the bold markers for its own.
 */
export function toggleFormatting(text: string, from: number, to: number, marker: string, markers: readonly Span[], word: Span | null): TextChange {
  const pairs: Array<[Span, Span]> = [];
  for (let i = 0; i + 1 < markers.length; i += 2) {
    const open = markers[i];
    const close = markers[i + 1];
    if (open && close) {
      pairs.push([open, close]);
    }
  }
  const unwrap = ([open, close]: [Span, Span], anchor: number, head: number): TextChange => ({
    changes: [{ from: open.from, to: open.to, insert: "" }, { from: close.from, to: close.to, insert: "" }],
    anchor,
    head,
  });

  const size = marker.length;
  if (from === to) {
    const inside = pairs.find(([open, close]) => open.to <= from && from <= close.from);
    if (inside) {
      const [open, close] = inside;
      if (open.to < close.from && from === close.from) {
        return { changes: [], anchor: close.to, head: close.to };
      }
      if (open.to < close.from && from === open.to) {
        return { changes: [], anchor: from, head: from };
      }
      const cursor = from - (open.to - open.from);
      return unwrap(inside, cursor, cursor);
    }
    const emptyPair = text.slice(from - size, from) === marker && text.slice(from, from + size) === marker
      && text[from - size - 1] !== marker[0] && text[from + size] !== marker[0];
    if (emptyPair) {
      return { changes: [{ from: from - size, to: from + size, insert: "" }], anchor: from - size, head: from - size };
    }
    if (word && word.from < word.to && word.from <= from && from <= word.to) {
      const cursor = from + size + (from === word.to ? size : 0);
      return { changes: [{ from: word.from, to: word.from, insert: marker }, { from: word.to, to: word.to, insert: marker }], anchor: cursor, head: cursor };
    }
    return { changes: [{ from, to: from, insert: marker + marker }], anchor: from + size, head: from + size };
  }

  const around = pairs.find(([open, close]) => (open.to === from && close.from === to) || (open.from === from && close.to === to));
  if (around) {
    return unwrap(around, around[0].from, around[1].from - (around[0].to - around[0].from));
  }
  // Each line of the selection gets markers of its own.
  const changes: TextChange["changes"] = [];
  for (let start = from; start <= to;) {
    const lineEnd = text.indexOf("\n", start);
    const end = lineEnd < 0 || lineEnd > to ? to : lineEnd;
    if (end > start) {
      changes.push({ from: start, to: start, insert: marker }, { from: end, to: end, insert: marker });
    }
    if (end === to) {
      break;
    }
    start = end + 1;
  }
  const before = (pos: number, atPos: boolean): number => changes.filter((change) => change.from < pos || (atPos && change.from === pos)).length * size;
  return { changes, anchor: from + before(from, true), head: to + before(to, false) };
}

/** Ctrl+K, as in the note's editor: the selection becomes a Markdown link's text with the cursor where its address goes; without one, an empty link. */
export function markdownLink(text: string, from: number, to: number): TextChange {
  const selected = text.slice(from, to);
  const cursor = selected === "" ? from + 1 : from + selected.length + 3;
  return { changes: [{ from, to, insert: `[${selected}]()` }], anchor: cursor, head: cursor };
}

/** Obsidian's Add internal link and Add embed: the selection goes between [[ and ]], or ![[ and ]], with the cursor before the ]]. */
export function internalLink(text: string, from: number, to: number, embed: boolean): TextChange {
  const selected = text.slice(from, to);
  const open = embed ? "![[" : "[[";
  const cursor = from + open.length + selected.length;
  return { changes: [{ from, to, insert: `${open}${selected}]]` }], anchor: cursor, head: cursor };
}

/** Obsidian's Add tag: a # goes in where the selection starts, with the cursor after it. */
export function insertTag(from: number, to: number): TextChange {
  return { changes: [{ from, to: from, insert: "#" }], anchor: Math.min(from, to) + 1, head: Math.min(from, to) + 1 };
}

/** An internal link being typed on a line, counted from the line's start. */
export interface LinkQuery {
  /** Where its [[ starts. */
  from: number;
  /** What is typed between the [[ and the cursor. */
  text: string;
  /** Where a chosen link ends: after the ]] that follows the cursor, or at the cursor. */
  to: number;
  /** Whether it is an embed, with a ! before the [[. */
  embed: boolean;
}

/** The internal link the cursor at `at` is typing on `line`; null outside a link or when it has an alias or size suffix. */
export function linkQueryAt(line: string, at: number): LinkQuery | null {
  const from = at >= 2 ? line.lastIndexOf("[[", at - 2) : -1;
  if (from < 0) {
    return null;
  }
  const text = line.slice(from + 2, at);
  if (/[[\]|]/.test(text)) {
    return null;
  }
  const tail = line.slice(at);
  // Completing the target must not leave an existing alias or image size outside a new link.
  if (/^[^[\]|]*\|/.test(tail)) {
    return null;
  }
  const rest = /^[^[\]|]*\]\]/.exec(tail);
  return { from, text, to: at + (rest?.[0].length ?? 0), embed: line[from - 1] === "!" };
}

/** The name CodeMirror's keymaps give the key of one of Obsidian's hotkeys, such as Mod-Shift-b; null for no key. */
export function keyName(modifiers: readonly string[], key: string): string | null {
  if (key === "") {
    return null;
  }
  const name = key === " " ? "Space" : key.length === 1 ? key.toLowerCase() : key;
  return [...modifiers, name].join("-");
}
