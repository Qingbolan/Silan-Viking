import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  PASTE_COMMAND,
  mergeRegister,
} from 'lexical';
import {
  AlertCircle,
  Check,
  Copy,
  Image as ImageIcon,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type {
  MarkdownImageImport,
  MarkdownImageImporter,
} from '../extensionPoints';
import {
  $readSelectedImage,
  $removeSelectedImage,
  $selectImageFromDOM,
  copyImageToSystemClipboard,
  ImageEditingController,
  normalizeImageFiles,
  OPEN_IMAGE_PICKER_COMMAND,
  sameImageSelection,
  type ImageSelectionState,
  writeImageClipboardEvent,
} from '../interaction/ImageEditingController';
import {
  OverlayPositionController,
  readEditorToolbarInset,
  type OverlayPosition,
} from '../interaction/OverlayPositionController';
import { readEditorSnapshot } from '../model/MarkdownDocument';

type ImageImportStatus = {
  phase: 'importing' | 'complete' | 'error';
  message: string;
} | null;

const hiddenPosition: OverlayPosition = {
  left: 0,
  placement: 'above',
  top: 0,
  visible: false,
};

export function ImageEditingPlugin({
  disabled,
  offsetForMainToolbar,
  onImportImages,
}: {
  disabled: boolean;
  offsetForMainToolbar: boolean;
  onImportImages?: MarkdownImageImporter;
}) {
  const [editor] = useLexicalComposerContext();
  const controller = React.useMemo(() => new ImageEditingController(editor), [editor]);
  const toolbarRef = React.useRef<HTMLDivElement | null>(null);
  const insertionInputRef = React.useRef<HTMLInputElement | null>(null);
  const replacementInputRef = React.useRef<HTMLInputElement | null>(null);
  const replacementTargetRef = React.useRef<ImageSelectionState | null>(null);
  const [selection, setSelection] = React.useState<ImageSelectionState | null>(null);
  const [position, setPosition] = React.useState(hiddenPosition);
  const [dimensions, setDimensions] = React.useState('');
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [altDraft, setAltDraft] = React.useState('');
  const [titleDraft, setTitleDraft] = React.useState('');
  const [status, setStatus] = React.useState<ImageImportStatus>(null);

  React.useEffect(() => {
    if (status?.phase !== 'complete') return undefined;
    const timeout = window.setTimeout(() => setStatus(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [status]);

  React.useEffect(() => {
    setMetadataOpen(false);
    setAltDraft(selection?.alt || '');
    setTitleDraft(selection?.title || '');
  }, [selection?.key]);

  const importFiles = React.useCallback(async (
    incomingFiles: readonly File[],
    replacement: ImageSelectionState | null,
  ) => {
    const files = normalizeImageFiles(incomingFiles);
    if (disabled || files.length === 0) return;
    if (!onImportImages) {
      setStatus({ phase: 'error', message: 'Image import is not available for this document.' });
      return;
    }

    const insertionPoint = replacement ? null : controller.captureInsertionPoint();
    setStatus({
      phase: 'importing',
      message: replacement
        ? 'Replacing image…'
        : `Importing ${files.length} image${files.length === 1 ? '' : 's'}…`,
    });
    try {
      const imported = await onImportImages(files);
      if (replacement) {
        const next = imported[0];
        if (next) {
          controller.update(replacement.key, {
            ...next,
            alt: replacement.alt || next.alt,
            title: replacement.title || next.title || null,
          });
        }
      } else if (insertionPoint && imported.length > 0) {
        controller.insert(imported, insertionPoint);
      }
      setStatus({
        phase: 'complete',
        message: imported.length > 0
          ? `${imported.length} image${imported.length === 1 ? '' : 's'} inserted`
          : `${files.length} image${files.length === 1 ? '' : 's'} queued for upload`,
      });
    } catch (reason) {
      setStatus({ phase: 'error', message: String(reason) });
    }
  }, [controller, disabled, onImportImages]);

  React.useEffect(() => {
    const update = (next: ImageSelectionState | null) => {
      setSelection((current) => (sameImageSelection(current, next) ? current : next));
    };
    update(controller.readSelection());
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        update(readEditorSnapshot(editor, editorState, $readSelectedImage));
      }),
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          // Native video controls must receive their click (play, seek, volume).
          if (event.target instanceof Element && event.target.closest('video')) return false;
          if (disabled || !$selectImageFromDOM(event.target)) return false;
          event.preventDefault();
          if (event.detail >= 2) queueMicrotask(() => setMetadataOpen(true));
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          if (disabled || !$removeSelectedImage()) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        (event) => {
          if (disabled || !$removeSelectedImage()) return false;
          event?.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        COPY_COMMAND,
        (event) => {
          const image = $readSelectedImage();
          return image ? writeImageClipboardEvent(event, image) : false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (disabled || !('clipboardData' in event) || !event.clipboardData) return false;
          if (event.clipboardData.getData('text/markdown')) return false;
          const files = Array.from(event.clipboardData.files || []);
          if (!files.some((file) => file.type.startsWith('image/'))) return false;
          event.preventDefault();
          void importFiles(files, null);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        OPEN_IMAGE_PICKER_COMMAND,
        () => {
          if (disabled) return false;
          window.requestAnimationFrame(() => insertionInputRef.current?.click());
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [controller, disabled, editor, importFiles]);

  React.useLayoutEffect(() => {
    if (disabled || !selection) return undefined;
    const imageElement = editor.getElementByKey(selection.key);
    if (!imageElement) return undefined;
    imageElement.dataset.selected = 'true';
    const image = imageElement.querySelector('img');
    const updateDimensions = () => {
      setDimensions(image?.naturalWidth && image.naturalHeight
        ? `${image.naturalWidth} × ${image.naturalHeight}`
        : '');
    };
    image?.addEventListener('load', updateDimensions);
    updateDimensions();
    return () => {
      delete imageElement.dataset.selected;
      image?.removeEventListener('load', updateDimensions);
    };
  }, [disabled, editor, selection]);

  React.useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const root = editor.getRootElement()?.parentElement;
    const image = selection ? editor.getElementByKey(selection.key) : null;
    if (disabled || !selection || !toolbar || !root || !image) return undefined;
    const mainToolbar = offsetForMainToolbar
      ? root.parentElement?.querySelector<HTMLElement>('.novel-toolbar') || null
      : null;
    setPosition(hiddenPosition);
    const positioning = new OverlayPositionController({
      container: root,
      observedElements: [image, ...(mainToolbar ? [mainToolbar] : [])],
      onPosition: setPosition,
      options: {
        minTop: () => readEditorToolbarInset(root, offsetForMainToolbar),
        strategy: 'inside-top',
      },
      overlay: toolbar,
      readAnchor: () => image.getBoundingClientRect(),
    });
    positioning.connect();
    return () => positioning.dispose();
  }, [disabled, editor, metadataOpen, offsetForMainToolbar, selection]);

  const copySelectedImage = async () => {
    if (!selection) return;
    try {
      const copied = await copyImageToSystemClipboard(selection);
      setStatus({
        phase: 'complete',
        message: copied === 'image' ? 'Image and Markdown copied' : 'Image Markdown copied',
      });
    } catch (reason) {
      setStatus({ phase: 'error', message: String(reason) });
    }
  };

  const saveMetadata = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selection) return;
    controller.update(selection.key, {
      alt: altDraft.trim(),
      src: selection.src,
      title: titleDraft.trim() || null,
    });
    setMetadataOpen(false);
    setStatus({ phase: 'complete', message: 'Image description updated' });
  };

  return (
    <>
      <input
        ref={insertionInputRef}
        type="file"
        accept="image/*"
        multiple
        className="editor-assist-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          void importFiles(files, null);
        }}
      />
      <input
        ref={replacementInputRef}
        type="file"
        accept="image/*"
        className="editor-assist-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          const replacement = replacementTargetRef.current;
          replacementTargetRef.current = null;
          void importFiles(files, replacement);
        }}
      />

      {selection && !disabled && (
        <div
          ref={toolbarRef}
          className="lexical-image-toolbar"
          data-placement={position.placement}
          data-positioned={position.visible ? 'true' : 'false'}
          role="toolbar"
          aria-label="Image actions"
          style={{
            left: position.left,
            top: position.top,
            visibility: position.visible ? 'visible' : 'hidden',
          }}
        >
          <span className="lexical-image-toolbar__context">
            <ImageIcon size={14} />
            <span>{dimensions || selection.alt || 'Image'}</span>
          </span>
          <span className="lexical-image-toolbar__divider" aria-hidden="true" />
          <button
            type="button"
            aria-label="Edit image description"
            title="Edit alt text and title"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setMetadataOpen((open) => !open)}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            aria-label="Copy image"
            title="Copy image and Markdown"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void copySelectedImage()}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            aria-label="Replace image"
            title="Replace image file"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              replacementTargetRef.current = selection;
              window.requestAnimationFrame(() => replacementInputRef.current?.click());
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button
            type="button"
            className="danger"
            aria-label="Delete image"
            title="Delete image"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => controller.remove()}
          >
            <Trash2 size={14} />
          </button>

          {metadataOpen && (
            <form className="lexical-image-toolbar__metadata" onSubmit={saveMetadata}>
              <label>
                <span>Alt text</span>
                <input
                  value={altDraft}
                  autoFocus
                  placeholder="Describe the image"
                  onChange={(event) => setAltDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setMetadataOpen(false);
                  }}
                />
              </label>
              <label>
                <span>Title</span>
                <input
                  value={titleDraft}
                  placeholder="Optional hover title"
                  onChange={(event) => setTitleDraft(event.target.value)}
                />
              </label>
              <button type="submit" aria-label="Save image description" title="Save">
                <Check size={14} />
              </button>
            </form>
          )}
        </div>
      )}

      {status && (
        <div
          className="lexical-image-import-status"
          data-state={status.phase}
          role={status.phase === 'error' ? 'alert' : 'status'}
        >
          {status.phase === 'importing'
            ? <LoaderCircle size={14} />
            : status.phase === 'error'
              ? <AlertCircle size={14} />
              : <Check size={14} />}
          <span>{status.message}</span>
          {status.phase === 'error' && (
            <button type="button" aria-label="Dismiss image error" onClick={() => setStatus(null)}>
              <X size={13} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
