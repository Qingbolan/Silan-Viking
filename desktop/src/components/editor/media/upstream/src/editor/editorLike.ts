import type { Editor } from "obsidian";

export interface EditorPosition {
  line: number;
  ch: number;
}

export interface EditorChangeLike {
  from: EditorPosition;
  to?: EditorPosition;
  text: string;
}

/**
 * The subset of Obsidian's Editor that text-rewriting code may depend on.
 * Code written against it can be unit-tested with tests/support/memoryEditor.ts.
 */
export interface EditorLike {
  getValue(): string;
  getLine(line: number): string;
  lineCount(): number;
  lastLine(): number;
  getRange(from: EditorPosition, to: EditorPosition): string;
  replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void;
  /** Applies several changes as one undo step; positions refer to the document before the call. */
  transaction(tx: { changes?: EditorChangeLike[] }, origin?: string): void;
  getCursor(which?: "from" | "to" | "head" | "anchor"): EditorPosition;
  setCursor(pos: EditorPosition): void;
  somethingSelected(): boolean;
}

// Fails `npm run typecheck` if Obsidian's Editor stops satisfying EditorLike.
type AssertEditorLike<T extends EditorLike> = T;
export type ObsidianEditorIsEditorLike = AssertEditorLike<Editor>;
