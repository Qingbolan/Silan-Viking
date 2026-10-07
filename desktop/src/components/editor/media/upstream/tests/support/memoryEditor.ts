import type { EditorChangeLike, EditorLike, EditorPosition } from "../../src/editor/editorLike.ts";

export interface RecordedEdit {
  from: EditorPosition;
  to: EditorPosition;
  text: string;
}

/**
 * In-memory EditorLike for tests.
 *
 * Out-of-range positions throw instead of being clamped, so tests expose code
 * that computes bad positions. The selection is mapped through every
 * replacement the way CodeMirror 6 maps a cursor by default (assoc = -1).
 */
export class MemoryEditor implements EditorLike {
  readonly edits: RecordedEdit[] = [];
  transactionCount = 0;
  private text: string;
  private anchor = 0;
  private head = 0;

  constructor(text = "") {
    this.text = text;
  }

  getValue(): string {
    return this.text;
  }

  getLine(line: number): string {
    const lines = this.lines();
    if (!Number.isInteger(line) || line < 0 || line >= lines.length) {
      throw new RangeError(`Line ${line} is out of range (0-${lines.length - 1})`);
    }
    return lines[line] ?? "";
  }

  lineCount(): number {
    return this.lines().length;
  }

  lastLine(): number {
    return this.lineCount() - 1;
  }

  getRange(from: EditorPosition, to: EditorPosition): string {
    const [start, end] = ordered(this.offsetOf(from), this.offsetOf(to));
    return this.text.slice(start, end);
  }

  replaceRange(replacement: string, from: EditorPosition, to: EditorPosition = from): void {
    const [start, end] = ordered(this.offsetOf(from), this.offsetOf(to));
    this.replaceOffsets(start, end, replacement);
  }

  transaction(tx: { changes?: EditorChangeLike[] }): void {
    const changes = (tx.changes ?? [])
      .map((change) => {
        const [start, end] = ordered(this.offsetOf(change.from), this.offsetOf(change.to ?? change.from));
        return { start, end, text: change.text };
      })
      .sort((a, b) => b.start - a.start);
    changes.forEach((change, index) => {
      const later = changes[index - 1];
      if (later && change.end > later.start) {
        throw new RangeError("Transaction changes overlap");
      }
    });

    this.transactionCount += 1;
    // Bottom-up, so every position still refers to the original document.
    for (const change of changes) {
      this.replaceOffsets(change.start, change.end, change.text);
    }
  }

  private replaceOffsets(start: number, end: number, replacement: string): void {
    this.edits.push({ from: this.positionOf(start), to: this.positionOf(end), text: replacement });
    this.text = `${this.text.slice(0, start)}${replacement}${this.text.slice(end)}`;
    this.anchor = mapOffset(this.anchor, start, end, replacement.length);
    this.head = mapOffset(this.head, start, end, replacement.length);
  }

  getCursor(which: "from" | "to" | "head" | "anchor" = "head"): EditorPosition {
    switch (which) {
      case "anchor":
        return this.positionOf(this.anchor);
      case "from":
        return this.positionOf(Math.min(this.anchor, this.head));
      case "to":
        return this.positionOf(Math.max(this.anchor, this.head));
      case "head":
        return this.positionOf(this.head);
    }
  }

  setCursor(pos: EditorPosition): void {
    this.anchor = this.offsetOf(pos);
    this.head = this.anchor;
  }

  /** Mirrors Editor.setSelection; not part of EditorLike. */
  setSelection(anchor: EditorPosition, head: EditorPosition = anchor): void {
    this.anchor = this.offsetOf(anchor);
    this.head = this.offsetOf(head);
  }

  somethingSelected(): boolean {
    return this.anchor !== this.head;
  }

  private lines(): string[] {
    return this.text.split("\n");
  }

  private offsetOf(pos: EditorPosition): number {
    const lineText = this.getLine(pos.line);
    if (!Number.isInteger(pos.ch) || pos.ch < 0 || pos.ch > lineText.length) {
      throw new RangeError(`Column ${pos.ch} is out of range on line ${pos.line} (0-${lineText.length})`);
    }

    let offset = 0;
    const lines = this.lines();
    for (let line = 0; line < pos.line; line += 1) {
      offset += (lines[line] ?? "").length + 1;
    }
    return offset + pos.ch;
  }

  private positionOf(offset: number): EditorPosition {
    const before = this.text.slice(0, offset).split("\n");
    return { line: before.length - 1, ch: (before[before.length - 1] ?? "").length };
  }
}

function ordered(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

function mapOffset(offset: number, start: number, end: number, insertedLength: number): number {
  if (offset < start) {
    return offset;
  }
  if (offset > end) {
    return offset + insertedLength - (end - start);
  }
  if (offset === end && end > start) {
    return start + insertedLength;
  }
  // Inside the replaced range, or exactly at a pure insertion point.
  return start;
}
