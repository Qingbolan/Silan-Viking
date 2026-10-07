import { fromMarkdown } from 'mdast-util-from-markdown';
import type {
  CompiledMdast,
  MdastNode,
  MdastParent,
} from '@lexical/mdast';

export type MarkdownSourceStyle =
  | 'blockquote'
  | 'code'
  | 'delete'
  | 'emphasis'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'html'
  | 'image'
  | 'inline-code'
  | 'link'
  | 'list'
  | 'marker'
  | 'strong'
  | 'table'
  | 'task'
  | 'thematic-break';

export type MarkdownSourceSegment = {
  end: number;
  start: number;
  styles: readonly MarkdownSourceStyle[];
  text: string;
};

type SourceRange = {
  end: number;
  start: number;
};

type StyleEvent = {
  delta: 1 | -1;
  style: MarkdownSourceStyle;
};

const markerBearingParents = new Set([
  'blockquote',
  'delete',
  'emphasis',
  'heading',
  'link',
  'linkReference',
  'listItem',
  'strong',
  'tableCell',
  'tableRow',
]);

const styleOrder: MarkdownSourceStyle[] = [
  'blockquote',
  'list',
  'task',
  'table',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'heading-5',
  'heading-6',
  'strong',
  'emphasis',
  'delete',
  'inline-code',
  'code',
  'link',
  'image',
  'html',
  'thematic-break',
  'marker',
];

/**
 * Produces a character-perfect visual projection of Markdown using the exact
 * micromark/mdast registry compiled for the owning Lexical editor. The source
 * remains the single editable string; these segments are a disposable view
 * model derived from AST positions and never become editor state.
 */
export class MarkdownSourceProjector {
  readonly #registry: CompiledMdast;

  constructor(registry: CompiledMdast) {
    this.#registry = registry;
  }

  project(source: string): readonly MarkdownSourceSegment[] {
    if (!source) return [];
    const root = fromMarkdown(source, {
      extensions: this.#registry.micromarkExtensions,
      mdastExtensions: this.#registry.mdastExtensions,
    }) as MdastParent;
    const events = new Map<number, StyleEvent[]>();

    const annotate = (
      range: SourceRange | null,
      style: MarkdownSourceStyle,
    ) => {
      if (!range) return;
      const start = Math.max(0, Math.min(source.length, range.start));
      const end = Math.max(start, Math.min(source.length, range.end));
      if (start === end) return;
      pushEvent(events, start, { delta: 1, style });
      pushEvent(events, end, { delta: -1, style });
    };

    const visit = (node: MdastNode) => {
      const range = sourceRange(node);
      const style = semanticStyle(node);
      if (style) annotate(range, style);

      if (node.type === 'code' && range) {
        annotateCodeFence(source, range, annotate);
      }

      if ('children' in node) {
        const parent = node as MdastParent;
        if (range && markerBearingParents.has(node.type)) {
          annotateChildGaps(parent, range, (gap) => annotate(gap, 'marker'));
        }
        parent.children.forEach(visit);
      }
    };

    root.children.forEach(visit);
    return renderSegments(source, events);
  }

  /**
   * Classifies clipboard text with the same compiled grammar used by source
   * highlighting and Markdown import. Plain paragraphs have no semantic
   * ranges; any decorated AST range means importing the text preserves a
   * Markdown construct instead of treating its markers literally.
   */
  hasSyntax(source: string): boolean {
    return this.project(source).some((segment) => segment.styles.length > 0);
  }
}

function sourceRange(node: MdastNode): SourceRange | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return typeof start === 'number' && typeof end === 'number'
    ? { end, start }
    : null;
}

function semanticStyle(node: MdastNode): MarkdownSourceStyle | null {
  switch (node.type) {
    case 'heading':
      return `heading-${Math.min(6, Math.max(1, node.depth))}` as MarkdownSourceStyle;
    case 'blockquote':
      return 'blockquote';
    case 'list':
    case 'listItem':
      return node.type === 'listItem' && node.checked !== null && node.checked !== undefined
        ? 'task'
        : 'list';
    case 'strong':
      return 'strong';
    case 'emphasis':
      return 'emphasis';
    case 'delete':
      return 'delete';
    case 'inlineMath':
    case 'silanLatex':
    case 'inlineCode':
      return 'inline-code';
    case 'math':
    case 'silanMermaid':
    case 'code':
      return 'code';
    case 'link':
    case 'linkReference':
    case 'definition':
      return 'link';
    case 'image':
    case 'imageReference':
      return 'image';
    case 'html':
      return 'html';
    case 'table':
    case 'tableRow':
    case 'tableCell':
      return 'table';
    case 'thematicBreak':
      return 'thematic-break';
    case 'break':
      return 'marker';
    default:
      return null;
  }
}

function annotateChildGaps(
  parent: MdastParent,
  parentRange: SourceRange,
  annotate: (range: SourceRange) => void,
) {
  const children = parent.children
    .map(sourceRange)
    .filter((range): range is SourceRange => Boolean(range))
    .sort((left, right) => left.start - right.start);
  let cursor = parentRange.start;
  children.forEach((child) => {
    if (child.start > cursor) annotate({ end: child.start, start: cursor });
    cursor = Math.max(cursor, child.end);
  });
  if (cursor < parentRange.end) annotate({ end: parentRange.end, start: cursor });
}

function annotateCodeFence(
  source: string,
  range: SourceRange,
  annotate: (range: SourceRange, style: MarkdownSourceStyle) => void,
) {
  const fence = source[range.start];
  if (fence !== '`' && fence !== '~') return;
  const firstLineEnd = source.indexOf('\n', range.start);
  if (firstLineEnd < 0 || firstLineEnd >= range.end) {
    annotate(range, 'marker');
    return;
  }
  annotate({ end: firstLineEnd, start: range.start }, 'marker');
  const finalLineStart = source.lastIndexOf('\n', range.end - 1) + 1;
  if (finalLineStart > firstLineEnd && finalLineStart < range.end) {
    annotate({ end: range.end, start: finalLineStart }, 'marker');
  }
}

function pushEvent(
  events: Map<number, StyleEvent[]>,
  offset: number,
  event: StyleEvent,
) {
  const atOffset = events.get(offset) || [];
  atOffset.push(event);
  events.set(offset, atOffset);
}

function renderSegments(
  source: string,
  events: ReadonlyMap<number, readonly StyleEvent[]>,
) {
  const boundaries = [...new Set([0, source.length, ...events.keys()])]
    .sort((left, right) => left - right);
  const active = new Map<MarkdownSourceStyle, number>();
  const segments: MarkdownSourceSegment[] = [];

  boundaries.forEach((start, index) => {
    for (const event of events.get(start) || []) {
      const count = (active.get(event.style) || 0) + event.delta;
      if (count > 0) active.set(event.style, count);
      else active.delete(event.style);
    }
    const end = boundaries[index + 1];
    if (end === undefined || start === end) return;
    const styles = styleOrder.filter((style) => active.has(style));
    const text = source.slice(start, end);
    const previous = segments[segments.length - 1];
    if (previous && sameStyles(previous.styles, styles)) {
      previous.end = end;
      previous.text += text;
      return;
    }
    segments.push({ end, start, styles, text });
  });
  return segments;
}

function sameStyles(
  left: readonly MarkdownSourceStyle[],
  right: readonly MarkdownSourceStyle[],
) {
  return left.length === right.length
    && left.every((style, index) => style === right[index]);
}
