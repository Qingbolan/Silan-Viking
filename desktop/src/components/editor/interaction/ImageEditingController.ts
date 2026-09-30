import {
  $createNodeSelection,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  createCommand,
  type LexicalEditor,
} from 'lexical';
import type {
  MarkdownImageImport,
  MarkdownSelectionRange,
} from '../extensionPoints';
import {
  $createMarkdownImageNode,
  $isMarkdownImageNode,
  markdownForImage,
  type MarkdownImageData,
} from '../model/MarkdownImage';
import {
  $captureSelectionRange,
  $tryRestoreSelectionRange,
} from '../model/SelectionRange';

export const OPEN_IMAGE_PICKER_COMMAND = createCommand<void>('OPEN_IMAGE_PICKER_COMMAND');

export type ImageSelectionState = MarkdownImageData & {
  key: string;
};

export type ImageInsertionPoint =
  | { kind: 'range'; range: MarkdownSelectionRange }
  | { kind: 'after-image'; key: string }
  | { kind: 'document-end' };

export function $readSelectedImage(): ImageSelectionState | null {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const images = selection.getNodes().filter($isMarkdownImageNode);
  if (images.length !== 1) return null;
  const image = images[0];
  return {
    alt: image.getAltText(),
    key: image.getKey(),
    src: image.getSource(),
    poster: image.getPoster(),
    title: image.getTitle(),
  };
}

export function sameImageSelection(
  left: ImageSelectionState | null,
  right: ImageSelectionState | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.alt === right.alt
    && left.key === right.key
    && left.src === right.src
    && left.title === right.title
    && left.poster === right.poster;
}

export function $selectImageFromDOM(target: EventTarget | null) {
  const element = target instanceof Element
    ? target.closest<HTMLElement>('[data-image-node="true"]')
    : null;
  if (!element) return false;
  const node = $getNearestNodeFromDOMNode(element);
  if (!$isMarkdownImageNode(node)) return false;
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
  return true;
}

export function $removeSelectedImage() {
  const selected = $readSelectedImage();
  if (!selected) return false;
  const image = $getNodeByKey(selected.key);
  if (!$isMarkdownImageNode(image)) return false;
  const parent = image.getParent();
  const next = image.getNextSibling();
  const previous = image.getPreviousSibling();
  image.remove();

  if (next?.isAttached()) next.selectStart();
  else if (previous?.isAttached()) previous.selectEnd();
  else if ($isElementNode(parent) && parent.isAttached()) parent.selectStart();
  else {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.selectStart();
  }
  return true;
}

export function $updateImage(key: string, image: MarkdownImageImport) {
  const node = $getNodeByKey(key);
  if (!$isMarkdownImageNode(node)) return false;
  node
    .setSource(image.src)
    .setAltText(image.alt)
    .setTitle(image.title || null);
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
  return true;
}

export function $insertImages(
  images: readonly MarkdownImageImport[],
  insertionPoint: ImageInsertionPoint,
) {
  if (images.length === 0) return false;
  const nodes = images.map((image) => (
    $createMarkdownImageNode(image.src, image.alt, image.title || null)
  ));

  if (insertionPoint.kind === 'after-image') {
    const anchor = $getNodeByKey(insertionPoint.key);
    if ($isMarkdownImageNode(anchor) && anchor.isAttached()) {
      let previous = anchor;
      nodes.forEach((node) => {
        previous.insertAfter(node);
        previous = node;
      });
      const selection = $createNodeSelection();
      selection.add(previous.getKey());
      $setSelection(selection);
      return true;
    }
  }

  if (insertionPoint.kind === 'range') {
    const selection = $tryRestoreSelectionRange(insertionPoint.range);
    if (selection) {
      selection.insertNodes(nodes);
      return true;
    }
  }

  $getRoot().selectEnd();
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  selection.insertNodes(nodes);
  return true;
}

export function captureImageInsertionPoint(editor: LexicalEditor): ImageInsertionPoint {
  return editor.read(() => {
    const range = $captureSelectionRange();
    if (range) return { kind: 'range', range };
    const image = $readSelectedImage();
    if (image) return { kind: 'after-image', key: image.key };
    return { kind: 'document-end' };
  });
}

export function imageClipboardPayload(image: MarkdownImageData) {
  const markdown = markdownForImage(image);
  const attributes = [
    `src="${escapeHtml(image.src)}"`,
    `alt="${escapeHtml(image.alt)}"`,
    image.title ? `title="${escapeHtml(image.title)}"` : '',
  ].filter(Boolean).join(' ');
  return { html: `<img ${attributes}>`, markdown };
}

export function writeImageClipboardEvent(
  event: ClipboardEvent | KeyboardEvent | null,
  image: MarkdownImageData,
) {
  if (!event || !('clipboardData' in event) || !event.clipboardData) return false;
  const payload = imageClipboardPayload(image);
  event.preventDefault();
  event.clipboardData.setData('text/plain', payload.markdown);
  event.clipboardData.setData('text/markdown', payload.markdown);
  event.clipboardData.setData('text/html', payload.html);
  return true;
}

export async function copyImageToSystemClipboard(image: MarkdownImageData) {
  const payload = imageClipboardPayload(image);
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    await navigator.clipboard.writeText(payload.markdown);
    return 'markdown' as const;
  }

  const entries: Record<string, Blob> = {
    'text/html': new Blob([payload.html], { type: 'text/html' }),
    'text/markdown': new Blob([payload.markdown], { type: 'text/markdown' }),
    'text/plain': new Blob([payload.markdown], { type: 'text/plain' }),
  };
  try {
    const blob = await fetchImageBlob(image.src);
    if (blob) entries[blob.type] = blob;
    await navigator.clipboard.write([new ClipboardItem(entries)]);
    return blob ? 'image' as const : 'markdown' as const;
  } catch {
    await navigator.clipboard.writeText(payload.markdown);
    return 'markdown' as const;
  }
}

async function fetchImageBlob(src: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(src, { signal: controller.signal });
    const blob = await response.blob();
    return response.ok && blob.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

const mimeExtensions: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

export function clipboardImageFileName(mime: string, index: number, now = Date.now()) {
  return `pasted-image-${now}-${index + 1}.${mimeExtensions[mime] || 'png'}`;
}

export function normalizeImageFiles(
  files: readonly File[],
  now = Date.now(),
) {
  return files
    .filter((file) => file.type.startsWith('image/'))
    .map((file, index) => {
      if (file.name && /\.[a-z0-9]{2,5}$/i.test(file.name)) return file;
      return new File(
        [file],
        clipboardImageFileName(file.type, index, now),
        { type: file.type || 'image/png' },
      );
    });
}

export class ImageEditingController {
  readonly #editor: LexicalEditor;

  constructor(editor: LexicalEditor) {
    this.#editor = editor;
  }

  readSelection() {
    return this.#editor.read(() => $readSelectedImage());
  }

  captureInsertionPoint() {
    return captureImageInsertionPoint(this.#editor);
  }

  insert(images: readonly MarkdownImageImport[], point: ImageInsertionPoint) {
    this.#editor.update(() => $insertImages(images, point), { discrete: true });
  }

  update(key: string, image: MarkdownImageImport) {
    this.#editor.update(() => $updateImage(key, image), { discrete: true });
  }

  remove() {
    this.#editor.update($removeSelectedImage, { discrete: true });
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
