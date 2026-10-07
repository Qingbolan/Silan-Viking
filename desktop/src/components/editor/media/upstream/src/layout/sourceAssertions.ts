/** A source dependency that is checked without rewriting any of its lines. */
export interface SourceAssertion {
  fromLine: number;
  lines: readonly string[];
}

/** Assertions belong to one snapshot; unlike old block anchors they are never relocated by search. */
export function sourceAssertionsMatch(lines: readonly string[], readSet: readonly SourceAssertion[]): boolean {
  return readSet.every(assertion => assertion.fromLine >= 0
    && assertion.lines.length > 0
    && assertion.fromLine + assertion.lines.length <= lines.length
    && assertion.lines.every((line, index) => lines[assertion.fromLine + index] === line));
}
