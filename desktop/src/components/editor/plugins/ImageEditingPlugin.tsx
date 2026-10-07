import { useLooseMediaDrag } from '../media/useLooseMediaDrag';
import React from 'react';
import { createPortal } from 'react-dom';
import { INSERT_LAYOUT_PICKER } from '../media/MediaLayoutCommands';
import { readMediaSettings } from '../media/MediaLayoutSettings';
import { isVideoFile, MEDIA_FILE_ACCEPT } from '../../../lib/media';
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
  Columns2,
  GripVertical,
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
import { $wrapImageLayout } from '../media/MediaLayoutController';
import { HISTORY_PUSH_TAG } from 'lexical';
import type { LayoutPreset } from '../media/MediaLayoutController';

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
  const layoutInsertionRef = React.useRef(false);
  React.useEffect(() => {
    const input = insertionInputRef.current;
    const cancel = () => { layoutInsertionRef.current = false; };
    input?.addEventListener('cancel', cancel);
    return () => input?.removeEventListener('cancel', cancel);
  }, []);
  const [selection, setSelection] = React.useState<ImageSelectionState | null>(null);
  const looseDrag = useLooseMediaDrag(editor, selection, disabled);
  const [position, setPosition] = React.useState(hiddenPosition);
  const [dimensions, setDimensions] = React.useState('');
  const [metadataOpen, setMetadataOpen] = React.useState(false);
  const [altDraft, setAltDraft] = React.useState('');
  const [titleDraft, setTitleDraft] = React.useState('');
  const [status, setStatus] = React.useState<ImageImportStatus>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; image: ImageSelectionState } | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const createLayout = (image: ImageSelectionState, options: LayoutPreset = {}) => {
    setContextMenu(null);
    editor.update(() => {
      if (!$wrapImageLayout(image.key, options)) setStatus({ phase: 'error', message: '此图片位于链接、列表或表格等嵌套结构中，暂不支持转换为布局。' });
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
  };

  React.useEffect(() => {
    if (disabled) { setContextMenu(null); return; }
    const openMenu = (event: MouseEvent) => {
      editor.update(() => {
        if (!$selectImageFromDOM(event.target)) return;
        const image = $readSelectedImage();
        if (!image) return;
        event.preventDefault();
        setContextMenu({ x: event.clientX, y: event.clientY, image });
      }, { discrete: true });
    };
    return editor.registerRootListener((root, previous) => {
      previous?.removeEventListener('contextmenu', openMenu);
      root?.addEventListener('contextmenu', openMenu);
    });
  }, [disabled, editor]);

  React.useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const menu = menuRef.current;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - bounds.height - 8))}px`;
    menu.querySelector<HTMLButtonElement>('button')?.focus();
    const close = (event: Event) => {
      if (event.type === 'pointerdown' && menu.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

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
    const files = incomingFiles.flatMap((file) => isVideoFile(file) ? [file] : normalizeImageFiles([file]));
    const asLayout = layoutInsertionRef.current || (readMediaSettings().autoConvert && files.length > 1);
    layoutInsertionRef.current = false;
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
        if (asLayout) controller.insertLayout(imported, insertionPoint);
        else controller.insert(imported, insertionPoint);
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
      editor.registerCommand(INSERT_LAYOUT_PICKER, () => {
        if (disabled) return false;
        layoutInsertionRef.current = true;
        window.requestAnimationFrame(() => insertionInputRef.current?.click());
        return true;
      }, COMMAND_PRIORITY_HIGH),
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
          if (!files.some((file) => file.type.startsWith('image/') || isVideoFile(file))) return false;
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
      {contextMenu && !disabled && createPortal(<div ref={menuRef} className="image-layout-context-menu" role="menu" aria-label="图片布局"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' || event.key === 'Tab') { setContextMenu(null); editor.focus(); return; }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
            const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
            buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
          }
        }}>
        <span className="image-layout-context-menu__label">图片布局</span>
        <button role="menuitem" type="button" onClick={() => createLayout(contextMenu.image)}>创建可拖动布局</button>
        <button role="menuitem" type="button" onClick={() => createLayout(contextMenu.image, { width: 50 })}>半宽 · 50%</button>
        <button role="menuitem" type="button" onClick={() => createLayout(contextMenu.image, { width: 100 })}>通栏 · 100%</button>
        {(['left', 'center', 'right'] as const).map((align, index) => <button role="menuitem" type="button" key={align}
          onClick={() => createLayout(contextMenu.image, { align, width: 60 })}>{['靠左', '居中', '靠右'][index]}排列</button>)}
        <button role="menuitem" type="button" onClick={() => { setMetadataOpen(true); setContextMenu(null); }}>编辑图片说明</button>
      </div>, document.body)}
      <input
        ref={insertionInputRef}
        type="file"
        accept={MEDIA_FILE_ACCEPT}
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
          <button type="button" title="拖入已有布局" aria-label="Drag image into layout" style={{ touchAction: 'none', cursor: 'grab' }} {...looseDrag}><GripVertical size={14} /></button>
          <button type="button" className="lexical-image-toolbar__layout" aria-label="Create media layout" title="创建可调整的图片布局"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => createLayout(selection)}>
            <Columns2 size={14} /><span>图片布局</span>
          </button>
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
