/**
 * Classifies every line of a Markdown document in a single pass.
 *
 * Layout blocks and auto-conversion may only touch "text" lines. When a
 * construct is ambiguous, the scanner leans toward a non-text context:
 * missing a layout block is harmless, rewriting a code sample is not.
 */

export type LineContext = "text" | "code" | "frontmatter" | "math" | "comment";

interface FenceLine {
  quoteDepth: number;
  indent: number;
  /** The fence follows a list marker on the same line, e.g. "- ```js". */
  listMarker: boolean;
  marker: "`" | "~";
  length: number;
  info: string;
}

type ScanState =
  | { kind: "text" }
  | { kind: "frontmatter" }
  | { kind: "code"; fence: FenceLine }
  | { kind: "math" }
  | { kind: "html-comment" }
  | { kind: "obsidian-comment" };

const TEXT: ScanState = { kind: "text" };
// Optional blockquote markers, then indentation that may include a list marker ("- ", "1. "),
// then the fence run and its info string.
const FENCE_PATTERN = /^((?:[ \t]*>)*)([ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)?)(`{3,}|~{3,})(.*)$/;
const INLINE_CODE_PATTERN = /(`+)[\s\S]*?\1/g;

export function scanMarkdownLines(lines: readonly string[], includeEnd = false): LineContext[] {
  const contexts: LineContext[] = [];
  let state: ScanState = hasFrontmatter(lines) ? { kind: "frontmatter" } : TEXT;

  lines.forEach((rawLine, index) => {
    const [context, nextState] = classifyLine(stripCarriageReturn(rawLine), index, state);
    contexts.push(context);
    state = nextState;
  });

  if (includeEnd) contexts.push(classifyLine("vml insertion boundary", lines.length, state)[0]);
  return contexts;
}

function classifyLine(line: string, index: number, state: ScanState): [LineContext, ScanState] {
  switch (state.kind) {
    case "frontmatter":
      return ["frontmatter", index > 0 && line.trimEnd() === "---" ? TEXT : state];
    case "code":
      return ["code", isClosingFence(line, state.fence) ? TEXT : state];
    case "math":
      return ["math", line.trimEnd().endsWith("$$") ? TEXT : state];
    case "html-comment": {
      const close = line.indexOf("-->");
      if (close < 0) {
        return ["comment", state];
      }
      return ["comment", opensHtmlComment(line.slice(close + 3)) ? state : TEXT];
    }
    case "obsidian-comment":
      return ["comment", countOccurrences(withoutInlineCode(line), "%%") % 2 === 1 ? TEXT : state];
    case "text":
      return classifyTextLine(line);
  }
}

function classifyTextLine(line: string): [LineContext, ScanState] {
  const fence = readFenceLine(line);
  // A backtick run followed by more backticks on the same line is inline code, not a fence.
  if (fence && !(fence.marker === "`" && fence.info.includes("`"))) {
    return ["code", { kind: "code", fence }];
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("$$")) {
    return ["math", trimmed.slice(2).includes("$$") ? TEXT : { kind: "math" }];
  }

  const visible = withoutInlineCode(line);
  if (opensHtmlComment(visible)) {
    return ["comment", { kind: "html-comment" }];
  }
  if (countOccurrences(visible, "%%") % 2 === 1) {
    // Only a line that starts with %% opens a multi-line comment. An unmatched %% elsewhere
    // (e.g. in a heading) stays on its own line, as Obsidian renders it; toggling on it would
    // flip every comment after it inside out.
    return ["comment", visible.trimStart().startsWith("%%") ? { kind: "obsidian-comment" } : TEXT];
  }

  return ["text", TEXT];
}

function readFenceLine(line: string): FenceLine | null {
  const match = FENCE_PATTERN.exec(line);
  if (!match) {
    return null;
  }

  const run = match[3] ?? "";
  return {
    quoteDepth: countOccurrences(match[1] ?? "", ">"),
    indent: measureIndent(match[2] ?? ""),
    listMarker: (match[2] ?? "").trim() !== "",
    marker: run.startsWith("~") ? "~" : "`",
    length: run.length,
    info: match[4] ?? "",
  };
}

function isClosingFence(line: string, opening: FenceLine): boolean {
  const fence = readFenceLine(line);
  return fence !== null
    && !fence.listMarker
    && fence.marker === opening.marker
    && fence.length >= opening.length
    && fence.info.trim() === ""
    && fence.quoteDepth === opening.quoteDepth
    && fence.indent <= Math.max(3, opening.indent);
}

function hasFrontmatter(lines: readonly string[]): boolean {
  if (stripCarriageReturn(lines[0] ?? "").trimEnd() !== "---") {
    return false;
  }

  return lines.some((line, index) => index > 0 && stripCarriageReturn(line).trimEnd() === "---");
}

function opensHtmlComment(text: string): boolean {
  let searchFrom = 0;
  for (;;) {
    const open = text.indexOf("<!--", searchFrom);
    if (open < 0) {
      return false;
    }

    const close = text.indexOf("-->", open + 4);
    if (close < 0) {
      return true;
    }
    searchFrom = close + 3;
  }
}

function withoutInlineCode(line: string): string {
  return line.replace(INLINE_CODE_PATTERN, "");
}

function measureIndent(whitespace: string): number {
  let width = 0;
  for (const char of whitespace) {
    width += char === "\t" ? 4 : 1;
  }
  return width;
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
