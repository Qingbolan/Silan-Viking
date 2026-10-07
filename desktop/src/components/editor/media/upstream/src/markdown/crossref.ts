import { scanMarkdownLines, type LineContext } from "./lineContext.ts";

/**
 * Numbered figures, tables and equations, and references to them, written as pandoc-crossref reads
 * them, so a draft converts to LaTeX as it is (docs/DESIGN.md, section 1.4):
 *
 *   A paragraph ending in {#fig:scaling} or {#tbl:results} is the caption of figure or table N.
 *   An equation holding \label{eq:loss} is equation N.
 *   @fig:scaling, @tbl:results and @eq:loss refer to them.
 *
 * Numbers follow the order of the labels in the note, layout captions included. Code is never read.
 */

export type RefKind = "fig" | "tbl" | "eq";
export type RefLanguage = "en" | "zh";

export interface RefTarget {
  kind: RefKind;
  /** The label, e.g. "fig:scaling". */
  id: string;
  number: number;
  /** The line the label is on. */
  line: number;
}

export interface RefIndex {
  targets: ReadonlyMap<string, RefTarget>;
  /** Changes whenever a number does. */
  signature: string;
}

/** What may follow the kind in a label: no trailing "." or ":", which end the sentence instead. */
const ID = String.raw`[A-Za-z0-9_][\w.:-]*[\w-]|[A-Za-z0-9_]`;
const CAPTION_LABEL = new RegExp(String.raw`[ \t]*\{#((?:fig|tbl):(?:${ID}))\}`, "g");
const EQUATION_LABEL = new RegExp(String.raw`\\label\{(eq:(?:${ID}))\}`, "g");
const REFERENCE = new RegExp(String.raw`(^|[^\w@\\/])@((?:fig|tbl|eq):(?:${ID}))`, "g");
const INLINE_CODE = /(`+)[\s\S]*?\1/g;
/**
 * A caption label (groups: label) or a reference (groups: the character before it, the label) in drawn
 * text, read as collectRefs reads them: a label it does not number is not taken for one when drawing.
 */
export const DRAWN_TOKEN = new RegExp(String.raw`\{#((?:fig|tbl):(?:${ID}))\}|(^|[^\w@\\/])@((?:fig|tbl|eq):(?:${ID}))`, "g");
const QUICK_CHECK = /\{#(?:fig|tbl):|\\label\{eq:|@(?:fig|tbl|eq):/;

const NAMES: Record<RefLanguage, Record<RefKind, string>> = {
  en: { fig: "Figure", tbl: "Table", eq: "Eq." },
  zh: { fig: "图", tbl: "表", eq: "式" },
};

export const EMPTY_REF_INDEX: RefIndex = { targets: new Map(), signature: "" };

/** Whether `text` has any label or reference at all; most notes have none. */
export function mayHaveRefs(text: string): boolean {
  return QUICK_CHECK.test(text);
}

/** The numbered targets of a note, by label. A label used twice counts where it is first. */
export function collectRefs(lines: readonly string[], contexts: readonly LineContext[] = scanMarkdownLines(lines)): RefIndex {
  const targets = new Map<string, RefTarget>();
  const counts: Record<RefKind, number> = { fig: 0, tbl: 0, eq: 0 };
  const add = (id: string, line: number): void => {
    const kind = id.slice(0, id.indexOf(":")) as RefKind;
    if (!targets.has(id)) {
      counts[kind] += 1;
      targets.set(id, { kind, id, number: counts[kind], line });
    }
  };
  lines.forEach((raw, line) => {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (contexts[line] === "text") {
      for (const match of outsideCode(text).matchAll(CAPTION_LABEL)) {
        add(match[1] ?? "", line);
      }
    } else if (contexts[line] === "math") {
      for (const match of text.matchAll(EQUATION_LABEL)) {
        add(match[1] ?? "", line);
      }
    }
  });
  const signature = Array.from(targets.values(), (target) => `${target.id}=${target.number}`).join(" ");
  return { targets, signature };
}

/** How a reference to `target` reads: "Figure 2", "式 (3)". */
export function refText(target: RefTarget, language: RefLanguage): string {
  const name = NAMES[language][target.kind];
  return target.kind === "eq" ? `${name} (${target.number})` : `${name} ${target.number}`;
}

/** How a caption of `target` starts: "Figure 2.", "图 2". */
export function captionText(target: RefTarget, language: RefLanguage): string {
  const name = NAMES[language][target.kind];
  return language === "zh" ? `${name} ${target.number}` : `${name} ${target.number}.`;
}

/** A reference as the page shows it: the target's text, or ?? for a label nowhere in the note. */
export function refHtml(id: string, index: RefIndex, language: RefLanguage): string {
  const target = index.targets.get(id);
  const cls = target ? "vml-ref" : "vml-ref is-unresolved";
  return `<span class="${cls}" data-vml-ref="${id}">${target ? refText(target, language) : "??"}</span>`;
}

function captionHtml(target: RefTarget, language: RefLanguage): string {
  return `<span class="vml-caption-label" data-vml-label="${target.id}">${captionText(target, language)}</span> `;
}

/**
 * Markdown as it is drawn with its numbers: a caption's label goes, and its paragraph starts with the
 * caption's number; references read as their targets; an equation's label gets its number as a tag,
 * unless the equation has a tag already. Code stays as written.
 */
export function numberMarkdown(markdown: string, index: RefIndex, language: RefLanguage): string {
  if (!mayHaveRefs(markdown)) {
    return markdown;
  }
  const lines = markdown.split("\n");
  const contexts = scanMarkdownLines(lines);
  const result = [...lines];
  const prefixes = new Map<number, string>();

  let mathStart = -1;
  lines.forEach((line, at) => {
    const context = contexts[at];
    if (context === "math") {
      if (mathStart < 0) {
        mathStart = at;
      }
      const trimmed = line.trim();
      const singleLine = trimmed.startsWith("$$") && trimmed.slice(2).includes("$$");
      if (singleLine || contexts[at + 1] !== "math" || trimmed.endsWith("$$") && at > mathStart) {
        tagEquation(result, mathStart, at, index);
        mathStart = -1;
      }
      return;
    }
    mathStart = -1;
    if (context !== "text") {
      return;
    }
    const rewritten = mapOutsideCode(line, (part) => part
      .replace(CAPTION_LABEL, (token: string, id: string) => {
        const target = index.targets.get(id);
        if (!target) {
          return token;
        }
        // A paragraph is the caption of its first label only.
        const start = captionParagraphStart(lines, contexts, at);
        if (!prefixes.has(start)) {
          prefixes.set(start, captionHtml(target, language));
        }
        return "";
      })
      .replace(REFERENCE, (_match: string, before: string, id: string) => before + refHtml(id, index, language)));
    result[at] = rewritten;
  });

  for (const [at, prefix] of prefixes) {
    const line = result[at] ?? "";
    // After the markers of a quote or list item the paragraph is in.
    const marker = /^(?:[ \t]*>)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?/.exec(line)?.[0] ?? "";
    result[at] = marker + prefix + line.slice(marker.length);
  }
  return result.join("\n");
}

/** The first equation label in `tex`, as collectRefs reads labels. */
export function equationLabel(tex: string): string | undefined {
  return new RegExp(EQUATION_LABEL.source).exec(tex)?.[1];
}

/**
 * The label of each display equation of `markdown`, in order, null for one without; code aside. The
 * drawn equations come in the same order, which tells which one a reference goes to.
 */
export function equationLabels(markdown: string): Array<string | null> {
  const lines = markdown.split("\n");
  const contexts = scanMarkdownLines(lines);
  const labels: Array<string | null> = [];
  let open = false;
  lines.forEach((line, at) => {
    if (contexts[at] !== "math") {
      open = false;
      return;
    }
    const trimmed = line.trim();
    if (!open) {
      labels.push(null);
      // A block that closes on its first line is done with it.
      open = !(trimmed.startsWith("$$") && trimmed.length >= 4 && trimmed.slice(2).includes("$$"));
    } else if (trimmed.endsWith("$$")) {
      open = false;
    }
    const label = new RegExp(EQUATION_LABEL.source).exec(line)?.[1];
    if (label !== undefined && labels[labels.length - 1] === null) {
      labels[labels.length - 1] = label;
    }
  });
  return labels;
}

/**
 * Gives the equation on lines from..to the number of its label, as a tag in place of the label, unless
 * it is tagged or unnumbered already. Labels never reach MathJax, which remembers every label it has
 * drawn and fails on one drawn again.
 */
function tagEquation(lines: string[], from: number, to: number, index: RefIndex): void {
  const source = lines.slice(from, to + 1).join("\n");
  let tagged = /\\tag\*?\{/.test(source) || /\\notag|\\nonumber/.test(source);
  for (let at = from; at <= to; at += 1) {
    lines[at] = (lines[at] ?? "").replace(EQUATION_LABEL, (_token: string, id: string) => {
      const target = index.targets.get(id);
      if (!target || tagged) {
        return "";
      }
      tagged = true;
      return `\\tag{${target.number}}`;
    });
  }
}

/** The first line of the paragraph `line` is in. */
export function captionParagraphStart(lines: readonly string[], contexts: readonly LineContext[], line: number): number {
  let start = line;
  const content = (text: string): string => text.replace(/^(?:[ \t]*>[ \t]?)+/, "");
  const quoteDepth = (text: string): number => /^(?:[ \t]*>[ \t]?)+/.exec(text)?.[0].split(">").length ?? 0;
  const boundary = (text: string): boolean => /^(?: {0,3}#{1,6}(?:\s|$)|\s*(?:[-*_]\s*){3,}$|\s*(?:=+|-+)\s*$|\s*\||\s*<)/.test(content(text));
  const item = (text: string): boolean => /^\s*(?:[-*+]|\d{1,9}[.)])\s/.test(content(text));
  const inTable = (at: number): boolean => {
    // Tables can omit their outer pipes. Find their delimiter row rather than treating every pipe
    // in prose as a boundary.
    for (let row = at; row >= 0 && contexts[row] === "text"; row -= 1) {
      const text = content(lines[row] ?? "");
      if (!text.includes("|")) {
        break;
      }
      if (/^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(text)) {
        return true;
      }
    }
    return false;
  };
  while (start > 0 && contexts[start - 1] === "text") {
    const current = lines[start] ?? "";
    const previous = lines[start - 1] ?? "";
    if (content(previous).trim() === "" || boundary(previous) || boundary(current) || inTable(start - 1) || item(current) || quoteDepth(previous) !== quoteDepth(current)) {
      break;
    }
    start -= 1;
  }
  return start;
}

/** `text` with its inline code blanked out, keeping every other character where it is. */
function outsideCode(text: string): string {
  return text.replace(INLINE_CODE, (code) => " ".repeat(code.length));
}

/** Applies `map` to the parts of `line` outside inline code. */
function mapOutsideCode(line: string, map: (part: string) => string): string {
  let result = "";
  let cursor = 0;
  for (const match of line.matchAll(INLINE_CODE)) {
    const at = match.index ?? 0;
    result += map(line.slice(cursor, at)) + match[0];
    cursor = at + match[0].length;
  }
  return result + map(line.slice(cursor));
}
