import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
  type TextNode,
} from 'lexical';
import type { EditorReviewFinding } from '../extensionPoints';
import {
  $createReviewTextNode,
  $isReviewTextNode,
  EXTERNAL_MARKDOWN_SYNC_TAG,
  REVIEW_DECORATION_TAG,
  SOURCE_TREE_SYNC_TAG,
} from '../model/MarkdownDocument';

type TextEntry = {
  end: number;
  node: TextNode;
  start: number;
};

type FindingRange = {
  end: number;
  finding: EditorReviewFinding;
  start: number;
};

function copyTextShape(source: TextNode, target: TextNode) {
  target.setFormat(source.getFormat());
  target.setStyle(source.getStyle());
  target.setMode(source.getMode());
  target.setDetail(source.getDetail());
  return target;
}

function $removeReviewAnnotations() {
  $getRoot().getAllTextNodes().forEach((node) => {
    if (!$isReviewTextNode(node)) return;
    node.replace(copyTextShape(node, $createTextNode(node.getTextContent())));
  });
}

function $indexDocumentText() {
  const entries: TextEntry[] = [];
  let text = '';
  let previousParentKey = '';

  $getRoot().getAllTextNodes().forEach((node) => {
    const parentKey = node.getParent()?.getKey() || '';
    if (text && previousParentKey && parentKey !== previousParentKey) {
      text += '\n';
    }
    const start = text.length;
    text += node.getTextContent();
    entries.push({ end: text.length, node, start });
    previousParentKey = parentKey;
  });

  return { entries, text };
}

function locateFindings(text: string, findings: readonly EditorReviewFinding[]) {
  const ranges: FindingRange[] = [];
  const occupied: Array<{ start: number; end: number }> = [];

  findings.forEach((finding) => {
    const quote = finding.quote.trim();
    if (!quote) return;
    const start = text.indexOf(quote);
    if (start < 0) return;
    const end = start + quote.length;
    if (occupied.some((range) => start < range.end && end > range.start)) return;
    occupied.push({ start, end });
    ranges.push({ end, finding, start });
  });

  return ranges;
}

export function $applyReviewAnnotations(findings: readonly EditorReviewFinding[]) {
  $removeReviewAnnotations();
  if (findings.length === 0) return;

  const { entries, text } = $indexDocumentText();
  const ranges = locateFindings(text, findings);

  entries.forEach(({ node, start: nodeStart, end: nodeEnd }) => {
    const intersections = ranges
      .filter((range) => range.start < nodeEnd && range.end > nodeStart)
      .sort((left, right) => left.start - right.start);
    if (intersections.length === 0) return;

    const source = node.getTextContent();
    const replacements: TextNode[] = [];
    let cursor = 0;

    intersections.forEach(({ start, end, finding }) => {
      const localStart = Math.max(0, start - nodeStart);
      const localEnd = Math.min(source.length, end - nodeStart);
      if (localStart > cursor) {
        replacements.push(copyTextShape(node, $createTextNode(source.slice(cursor, localStart))));
      }
      replacements.push(copyTextShape(
        node,
        $createReviewTextNode(
          source.slice(localStart, localEnd),
          finding.id,
          finding.severity,
          finding.explanation,
        ),
      ));
      cursor = localEnd;
    });

    if (cursor < source.length) {
      replacements.push(copyTextShape(node, $createTextNode(source.slice(cursor))));
    }
    replacements.forEach((replacement) => node.insertBefore(replacement));
    node.remove();
  });
}

export function $focusReviewFinding(findingId: string) {
  const nodes = $getRoot()
    .getAllTextNodes()
    .filter((node) => $isReviewTextNode(node) && node.getFindingId() === findingId);
  if (nodes.length === 0) return false;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const selection = $createRangeSelection();
  selection.anchor.set(first.getKey(), 0, 'text');
  selection.focus.set(last.getKey(), last.getTextContentSize(), 'text');
  $setSelection(selection);
  return true;
}

export function ReviewPlugin({
  findings,
  onActivate,
}: {
  findings: readonly EditorReviewFinding[];
  onActivate?: (findingId: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const findingsRef = React.useRef(findings);
  const findingsSignature = JSON.stringify(findings.map((finding) => [
    finding.id,
    finding.quote,
    finding.severity,
    finding.explanation,
  ]));
  findingsRef.current = findings;

  const apply = React.useCallback(() => {
    editor.update(() => {
      $applyReviewAnnotations(findingsRef.current);
    }, { discrete: true, tag: REVIEW_DECORATION_TAG });
  }, [editor]);

  React.useEffect(() => {
    apply();
  }, [apply, findingsSignature]);

  React.useEffect(() => editor.registerUpdateListener(({ tags }) => {
    if (
      tags.has(REVIEW_DECORATION_TAG)
      || (!tags.has(EXTERNAL_MARKDOWN_SYNC_TAG) && !tags.has(SOURCE_TREE_SYNC_TAG))
    ) {
      return;
    }
    queueMicrotask(apply);
  }), [apply, editor]);

  React.useEffect(() => {
    const activate = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-review-finding]')
        : null;
      const findingId = target?.dataset.reviewFinding;
      if (findingId) onActivate?.(findingId);
    };
    return editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener('click', activate);
      root?.addEventListener('click', activate);
    });
  }, [editor, onActivate]);

  return null;
}
