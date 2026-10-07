import { createPortal } from 'react-dom';
import { readMediaSettings } from './editor/media/MediaLayoutSettings';
import { MediaEnvironmentProvider } from './editor/media/MediaEnvironment';
import type { MediaWorkspacePort } from './editor/media/MediaWorkspace';
import { MediaReferenceProvider } from './editor/media/MediaReferences';
import { BlockInteractionPlugin } from './editor/plugins/BlockInteractionPlugin';
import { cleanMarkdownHeadings } from './editor/model/MarkdownHygiene';
import React from 'react';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ClickableLinkPlugin } from '@lexical/react/LexicalClickableLinkPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { SelectionAlwaysOnDisplay } from '@lexical/react/LexicalSelectionAlwaysOnDisplay';
import { $getExtensionOutput } from '@lexical/extension';
import { MdastImportExtension } from '@lexical/mdast';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
} from 'lexical';
import {
  Bot,
  Copy,
  MessageSquareWarning,
  Sparkles,
} from 'lucide-react';
import {
  type EditorReviewFinding,
  LexicalEditorPluginRegistry,
  type MarkdownImageImport,
  type MarkdownImageImporter,
  type MarkdownEditorPlugin,
  type MarkdownSelectionAssistAction,
  type MarkdownSelectionAssistRequest,
  type MarkdownSelectionAssistResult,
  type SlashCommandDefinition,
} from './editor/extensionPoints';
import {
  $documentToMarkdown,
  $insertMarkdown,
  $replaceDocumentFromMarkdown,
  createMarkdownEditorExtension,
  EXTERNAL_MARKDOWN_SYNC_TAG,
  readEditorSnapshot,
  readMarkdown,
  replaceMarkdown as replaceEditorMarkdown,
  REVIEW_DECORATION_TAG,
  SOURCE_TREE_SYNC_TAG,
} from './editor/model/MarkdownDocument';
import {
  defaultSlashCommands,
  SlashCommandPlugin,
} from './editor/plugins/SlashCommandPlugin';
import {
  CodeHighlightPlugin,
  EditorKeymapPlugin,
  MarkdownPastePlugin,
} from './editor/plugins/EditorBehaviorPlugin';
import { FormattingToolbar } from './editor/plugins/FormattingToolbarPlugin';
import { SelectionBubblePlugin } from './editor/plugins/SelectionBubblePlugin';
import { ImageEditingPlugin } from './editor/plugins/ImageEditingPlugin';
import { MediaLayoutPlugin } from './editor/media/MediaLayoutPlugin';
import { wrapSourceSelection } from './editor/media/MediaLayoutCommands';
import {
  $focusReviewFinding,
  ReviewPlugin,
} from './editor/plugins/ReviewPlugin';
import { quoteIssueComment } from './editor/interaction/SelectionAssist';
import { resolveEditorShortcut } from './editor/interaction/EditorShortcutController';
import { MarkdownSourceProjector } from './editor/model/MarkdownSourceProjection';
import { MarkdownSourceHighlight } from './editor/plugins/MarkdownSourceHighlight';
import { $getDocumentTitleText } from './editor/model/DocumentTitle';
import {
  DocumentTitlePlugin,
  type MarkdownDocumentMeta,
} from './editor/plugins/DocumentTitlePlugin';
import { ArticleSkeleton } from './ds/Skeleton';

export type {
  EditorReviewFinding,
  MarkdownImageImport,
  MarkdownImageImporter,
  MarkdownEditorPlugin,
  MarkdownSelectionAssistAction,
  MarkdownSelectionAssistRequest,
  MarkdownSelectionAssistResult,
  SlashCommandDefinition,
} from './editor/extensionPoints';

type EditorPhase = 'creating' | 'ready';

export type MarkdownEditorHandle = {
  focus: () => void;
  getMarkdown: () => string;
  getTitle: () => string;
  insertMarkdown: (markdown: string) => string | null;
  replaceMarkdown: (markdown: string) => string | null;
  focusReviewFinding: (findingId: string) => boolean;
};

export type MarkdownEditingMode = 'rich' | 'source';

export type { MarkdownDocumentMeta } from './editor/plugins/DocumentTitlePlugin';

export type MarkdownEditorProps = {
  value: string;
  mediaWorkspace?: MediaWorkspacePort;
  mediaSourcePath?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  toolbarVisible?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  editingMode?: MarkdownEditingMode;
  plugins?: MarkdownEditorPlugin[];
  slashCommands?: SlashCommandDefinition[];
  reviewFindings?: EditorReviewFinding[];
  defaultTitle?: string;
  documentMeta?: MarkdownDocumentMeta;
  onChange?: (value: string) => void;
  onImportImages?: MarkdownImageImporter;
  onEditingModeChange?: (mode: MarkdownEditingMode) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  /** When set, paid selection assists are disabled and this explains why. */
  selectionAssistDisabledReason?: string | null;
  onSelectionAssist?: (
    request: MarkdownSelectionAssistRequest,
  ) => Promise<MarkdownSelectionAssistResult>;
  onReviewFindingActivate?: (findingId: string) => void;
};

function styleRetainedSelection(nodes: readonly HTMLElement[]) {
  nodes.forEach((node) => node.classList.add('lexical-retained-selection'));
}

const emptyPlugins: MarkdownEditorPlugin[] = [];
const emptySlashCommands: SlashCommandDefinition[] = [];

function focusEditorAtEnd(editor: LexicalEditor) {
  editor.update(() => $getRoot().selectEnd(), { discrete: true });
  editor.getRootElement()?.focus({ preventScroll: true });
}

function EditorLifecycle({
  onReady,
  onMarkdownChange,
  sourceMode,
}: {
  onReady: (editor: LexicalEditor | null) => void;
  onMarkdownChange: (markdown: string) => void;
  sourceMode: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const onMarkdownChangeRef = React.useRef(onMarkdownChange);
  const sourceModeRef = React.useRef(sourceMode);
  onMarkdownChangeRef.current = onMarkdownChange;
  sourceModeRef.current = sourceMode;

  React.useLayoutEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  React.useEffect(() => editor.registerUpdateListener(({ editorState, tags }) => {
    if (
      sourceModeRef.current
      || tags.has(EXTERNAL_MARKDOWN_SYNC_TAG)
      || tags.has(SOURCE_TREE_SYNC_TAG)
      || tags.has(REVIEW_DECORATION_TAG)
    ) {
      return;
    }
    const markdown = readEditorSnapshot(editor, editorState, () => $documentToMarkdown());
    onMarkdownChangeRef.current(markdown);
  }), [editor]);

  return null;
}

const MarkdownEditor = React.forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({
    value,
    className = '',
    ariaLabel = 'Markdown editor',
    disabled = false,
    readOnly = false,
    toolbarVisible = false,
    autoFocus = true,
    placeholder = '',
    editingMode,
    plugins = emptyPlugins,
    slashCommands = emptySlashCommands,
    reviewFindings = [],
    defaultTitle = '',
    documentMeta,
    onChange,
    onImportImages,
    onEditingModeChange,
    onKeyDown,
    onSelectionAssist,
    selectionAssistDisabledReason = null,
    onReviewFindingActivate,
    mediaWorkspace,
    mediaSourcePath,
  }, forwardedRef) {
    const sourceRef = React.useRef<HTMLTextAreaElement | null>(null);
    const sourceHighlightRef = React.useRef<HTMLPreElement | null>(null);
    const initialValueRef = React.useRef(value);
    const valueRef = React.useRef(value);
    const defaultTitleRef = React.useRef(defaultTitle);
    const onChangeRef = React.useRef(onChange);
    const reviewFindingsRef = React.useRef(reviewFindings);
    const [phase, setPhase] = React.useState<EditorPhase>('creating');
    const [editor, setEditor] = React.useState<LexicalEditor | null>(null);
    const [uncontrolledMode, setUncontrolledMode] = React.useState<MarkdownEditingMode>('rich');
    const [sourceSelection, setSourceSelection] = React.useState<{
      start: number;
      end: number;
      text: string;
    } | null>(null);
    const [sourceMenu, setSourceMenu] = React.useState<{ x: number; y: number; source: string; start: number; end: number } | null>(null);
    React.useEffect(() => { if (!sourceMenu) return; const close = () => setSourceMenu(null); window.addEventListener('pointerdown', close); return () => window.removeEventListener('pointerdown', close); }, [sourceMenu]);
    const [sourceAssistBusy, setSourceAssistBusy] = React.useState<MarkdownSelectionAssistAction | 'copy' | null>(null);
    const [sourceAssistError, setSourceAssistError] = React.useState('');
    const [sourceInstructionOpen, setSourceInstructionOpen] = React.useState(false);
    const [sourceInstruction, setSourceInstruction] = React.useState('');

    const registry = React.useMemo(() => new LexicalEditorPluginRegistry(plugins), [plugins]);
    const extension = React.useMemo(
      () => createMarkdownEditorExtension(readOnly, registry, initialValueRef.current),
      [registry, readOnly],
    );
    const availableSlashCommands = React.useMemo(
      () => registry.composeCommands(defaultSlashCommands, slashCommands),
      [registry, slashCommands],
    );
    const activeEditingMode = editingMode ?? uncontrolledMode;
    const sourceMode = activeEditingMode === 'source';
    const inactive = disabled || readOnly;
    const hasAppliedInitialFocusRef = React.useRef(false);
    const previousEditingModeRef = React.useRef(activeEditingMode);
    const sourceProjector = React.useMemo(() => (
      editor
        ? editor.read(() => new MarkdownSourceProjector(
          $getExtensionOutput(MdastImportExtension).registry,
        ))
        : null
    ), [editor]);
    const sourceSegments = React.useMemo(
      () => sourceProjector?.project(value) || [],
      [sourceProjector, value],
    );

    onChangeRef.current = onChange;
    defaultTitleRef.current = defaultTitle;
    reviewFindingsRef.current = reviewFindings;

    const handleReady = React.useCallback((createdEditor: LexicalEditor | null) => {
      setEditor(createdEditor);
      setPhase(createdEditor ? 'ready' : 'creating');
      if (createdEditor && readMarkdown(createdEditor) !== valueRef.current) {
        replaceEditorMarkdown(createdEditor, valueRef.current);
      }
    }, []);

    const emitMarkdown = React.useCallback((markdown: string) => {
      if (markdown === valueRef.current) return;
      valueRef.current = markdown;
      onChangeRef.current?.(markdown);
    }, []);

    React.useEffect(() => {
      if (!editor) return;
      editor.setEditable(!inactive);
    }, [editor, inactive]);

    React.useEffect(() => {
      if (!editor || phase !== 'ready' || value === valueRef.current) return;
      valueRef.current = value;
      replaceEditorMarkdown(editor, value);
    }, [editor, phase, value]);

    React.useEffect(() => {
      if (
        hasAppliedInitialFocusRef.current
        || !autoFocus
        || readOnly
        || phase !== 'ready'
      ) return;
      hasAppliedInitialFocusRef.current = true;
      window.requestAnimationFrame(() => {
        if (sourceMode) sourceRef.current?.focus();
        else if (editor) focusEditorAtEnd(editor);
      });
    }, [autoFocus, editor, phase, readOnly, sourceMode]);

    React.useEffect(() => {
      const previousMode = previousEditingModeRef.current;
      previousEditingModeRef.current = activeEditingMode;
      if (previousMode === activeEditingMode || readOnly || phase !== 'ready') return;
      let focusTimer: number | null = null;
      const frame = window.requestAnimationFrame(() => {
        if (sourceMode) sourceRef.current?.focus();
        else focusTimer = window.setTimeout(() => {
          editor?.getRootElement()?.focus({ preventScroll: true });
        }, 0);
      });
      return () => {
        window.cancelAnimationFrame(frame);
        if (focusTimer !== null) window.clearTimeout(focusTimer);
      };
    }, [activeEditingMode, editor, phase, readOnly, sourceMode]);

    const syncSourceToTree = React.useCallback((markdown: string) => {
      valueRef.current = markdown;
      onChangeRef.current?.(markdown);
      if (editor) replaceEditorMarkdown(editor, markdown, SOURCE_TREE_SYNC_TAG);
      return markdown;
    }, [editor]);

    const focus = React.useCallback(() => {
      if (sourceMode) sourceRef.current?.focus();
      else editor?.getRootElement()?.focus({ preventScroll: true });
    }, [editor, sourceMode]);

    const currentMarkdown = React.useCallback(
      () => cleanMarkdownHeadings(sourceMode || !editor ? valueRef.current : readMarkdown(editor)),
      [editor, sourceMode],
    );

    const currentTitle = React.useCallback(() => {
      if (!editor) return defaultTitleRef.current.trim();
      return editor.read(() => $getDocumentTitleText()) || defaultTitleRef.current.trim();
    }, [editor]);

    const insertMarkdown = React.useCallback((markdown: string) => {
      if (inactive) return null;
      if (sourceMode) {
        const current = valueRef.current;
        const start = sourceRef.current?.selectionStart ?? current.length;
        const end = sourceRef.current?.selectionEnd ?? start;
        const next = `${current.slice(0, start)}${markdown}${current.slice(end)}`;
        syncSourceToTree(next);
        window.requestAnimationFrame(() => {
          const caret = start + markdown.length;
          sourceRef.current?.focus();
          sourceRef.current?.setSelectionRange(caret, caret);
        });
        return next;
      }
      if (!editor || phase !== 'ready') return null;
      editor.update(() => {
        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          $getRoot().selectEnd();
          selection = $getSelection();
        }
        if ($isRangeSelection(selection)) $insertMarkdown(markdown);
      }, { discrete: true });
      return readMarkdown(editor);
    }, [editor, inactive, phase, sourceMode, syncSourceToTree]);

    const replaceMarkdown = React.useCallback((markdown: string) => {
      if (inactive || !editor || phase !== 'ready') return null;
      if (sourceMode) {
        syncSourceToTree(markdown);
        window.requestAnimationFrame(() => {
          sourceRef.current?.focus();
          sourceRef.current?.setSelectionRange(markdown.length, markdown.length);
        });
        return markdown;
      }
      editor.update(() => $replaceDocumentFromMarkdown(markdown), { discrete: true });
      return readMarkdown(editor);
    }, [editor, inactive, phase, sourceMode, syncSourceToTree]);

    const focusReviewFinding = React.useCallback((findingId: string) => {
      const finding = reviewFindingsRef.current.find((candidate) => candidate.id === findingId);
      if (!finding) return false;
      if (sourceMode) {
        const offset = valueRef.current.indexOf(finding.quote);
        if (offset < 0) return false;
        sourceRef.current?.focus();
        sourceRef.current?.setSelectionRange(offset, offset + finding.quote.length);
        return true;
      }
      if (!editor) return false;
      let focused = false;
      editor.update(() => {
        focused = $focusReviewFinding(findingId);
      }, { discrete: true });
      if (focused) {
        editor.focus();
        window.requestAnimationFrame(() => {
          editor.getRootElement()
            ?.querySelector<HTMLElement>(`[data-review-finding="${CSS.escape(findingId)}"]`)
            ?.scrollIntoView({ block: 'center' });
        });
      }
      return focused;
    }, [editor, sourceMode]);

    React.useImperativeHandle(forwardedRef, () => ({
      focus,
      focusReviewFinding,
      getMarkdown: currentMarkdown,
      getTitle: currentTitle,
      insertMarkdown,
      replaceMarkdown,
    }), [
      currentMarkdown,
      currentTitle,
      focus,
      focusReviewFinding,
      insertMarkdown,
      replaceMarkdown,
    ]);

    const updateSourceMode = React.useCallback((nextSourceMode: boolean) => {
      const nextMode = nextSourceMode ? 'source' : 'rich';
      if (editingMode === undefined) setUncontrolledMode(nextMode);
      onEditingModeChange?.(nextMode);
    }, [editingMode, onEditingModeChange]);
    const enterSourceMode = React.useCallback(
      () => updateSourceMode(true),
      [updateSourceMode],
    );

    const updateSourceSelection = React.useCallback(() => {
      const textarea = sourceRef.current;
      if (!textarea) return setSourceSelection(null);
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = valueRef.current.slice(start, end);
      setSourceSelection(text.trim() ? { start, end, text } : null);
    }, []);

    const syncSourceScroll = React.useCallback(() => {
      const textarea = sourceRef.current;
      const highlight = sourceHighlightRef.current;
      if (!textarea || !highlight) return;
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }, []);

    React.useLayoutEffect(() => {
      if (sourceMode) syncSourceScroll();
    }, [sourceMode, sourceSegments, syncSourceScroll]);

    React.useEffect(() => setSourceInstructionOpen(false), [sourceSelection]);

    const runSourceSelectionAssist = React.useCallback(async (
      action: MarkdownSelectionAssistAction,
      instruction?: string,
    ) => {
      if (!sourceSelection || (action === 'agent_edit' && !instruction)) return;
      setSourceAssistError('');
      setSourceAssistBusy(action);
      try {
        const result = onSelectionAssist
          ? await onSelectionAssist({
            action,
            afterContext: valueRef.current.slice(sourceSelection.end, sourceSelection.end + 1600),
            beforeContext: valueRef.current.slice(Math.max(0, sourceSelection.start - 1600), sourceSelection.start),
            instruction,
            selectedText: sourceSelection.text,
          })
          : { comment: 'Review this selected passage.' };
        const insertion = action === 'comment_issue'
          ? quoteIssueComment(result.comment?.trim() || 'Review this selected passage.')
          : result.replacement?.trim();
        if (!insertion) return setSourceAssistError('No local edit returned');
        if (
          valueRef.current.slice(sourceSelection.start, sourceSelection.end)
          !== sourceSelection.text
        ) {
          setSourceAssistError('Selection changed before the edit completed');
          return;
        }
        const start = action === 'comment_issue' ? sourceSelection.end : sourceSelection.start;
        const end = sourceSelection.end;
        const next = `${valueRef.current.slice(0, start)}${insertion}${valueRef.current.slice(end)}`;
        syncSourceToTree(next);
        window.requestAnimationFrame(() => {
          const caret = start + insertion.length;
          sourceRef.current?.focus();
          sourceRef.current?.setSelectionRange(caret, caret);
          setSourceSelection(null);
        });
      } catch (reason) {
        setSourceAssistError(String(reason));
      } finally {
        setSourceAssistBusy(null);
      }
    }, [onSelectionAssist, sourceSelection, syncSourceToTree]);

    return (
      <div
        className={[
          'editor-host',
          'novel-editor',
          'lexical-markdown-editor',
          readOnly ? 'novel-editor--preview' : '',
          className,
        ].filter(Boolean).join(' ')}
        data-state={phase}
        data-mode={activeEditingMode}
        data-disabled={inactive ? 'true' : 'false'}
        data-empty={value.trim() ? 'false' : 'true'}
        data-source-model="lexical-ast"
        data-toolbar={!readOnly && toolbarVisible ? 'visible' : 'hidden'}
        data-document-title={defaultTitle && !sourceMode ? 'visible' : 'hidden'}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => {
          if (sourceMode || inactive || !editor || phase !== 'ready') return;
          const target = event.target as HTMLElement;
          // Nested editors own their clicks. Class names alone also match a
          // text column's surface and incorrectly move the outer caret to EOF.
          if (target.closest('.lexical-markdown-editor') !== event.currentTarget) return;
          // Let the editable surface place the caret at the pointer position.
          if (target !== event.currentTarget && !target.classList.contains('novel-editor-root')) return;
          event.preventDefault();
          focusEditorAtEnd(editor);
        }}
      >
        {!readOnly && (
          <FormattingToolbar
            editor={editor}
            visible={toolbarVisible}
            disabled={disabled || phase !== 'ready'}
            imageImportEnabled={Boolean(onImportImages)}
            sourceMode={sourceMode}
            onSourceModeChange={updateSourceMode}
          />
        )}

        <LexicalExtensionComposer extension={extension} contentEditable={null}>
          <MediaEnvironmentProvider workspace={mediaWorkspace} sourcePath={mediaSourcePath}><MediaReferenceProvider>
          <div className="novel-editor-root">
            <RichTextPlugin
              contentEditable={(
                <ContentEditable
                  className="lexical-editor-surface"
                  aria-label={ariaLabel}
                  aria-multiline={!readOnly || undefined}
                  role={readOnly ? 'document' : 'textbox'}
                  data-novel-surface={readOnly ? 'preview' : 'editor'}
                />
              )}
              placeholder={placeholder ? <div className="lexical-placeholder">{placeholder}</div> : null}
              ErrorBoundary={LexicalErrorBoundary}
            />
            {defaultTitle && !readOnly && !sourceMode && (
              <DocumentTitlePlugin defaultTitle={defaultTitle} meta={documentMeta} />
            )}
            {!readOnly && <HistoryPlugin />}
            <ListPlugin />
            <CheckListPlugin disableTakeFocusOnClick={readOnly} />
            <LinkPlugin />
            <ClickableLinkPlugin disabled={!readOnly} />
            <TablePlugin hasCellMerge={false} hasHorizontalScroll />
            <CodeHighlightPlugin />
            {!readOnly && !sourceMode && <SelectionAlwaysOnDisplay onReposition={styleRetainedSelection} />}
            {!readOnly && <EditorKeymapPlugin onToggleSourceMode={enterSourceMode} />}
            {!readOnly && (
              <ImageEditingPlugin
                disabled={disabled || sourceMode}
                offsetForMainToolbar={toolbarVisible}
                onImportImages={onImportImages}
              />
            )}
            {!readOnly && <MarkdownPastePlugin disabled={disabled || sourceMode} />}
            {!readOnly && <MediaLayoutPlugin disabled={disabled || sourceMode} onImportImages={onImportImages} workspace={mediaWorkspace} />}
            {!readOnly && <BlockInteractionPlugin disabled={disabled || sourceMode} />}
            {!readOnly && (
              <SlashCommandPlugin
                commands={availableSlashCommands}
                disabled={disabled || sourceMode}
              />
            )}
            {!readOnly && !sourceMode && (
              <>
                <SelectionBubblePlugin
                  disabled={disabled}
                  offsetForMainToolbar={toolbarVisible}
                  onSelectionAssist={onSelectionAssist}
                  selectionAssistDisabledReason={selectionAssistDisabledReason}
                />
              </>
            )}
            <ReviewPlugin
              findings={reviewFindings}
              onActivate={onReviewFindingActivate}
            />
            <EditorLifecycle
              onReady={handleReady}
              onMarkdownChange={emitMarkdown}
              sourceMode={sourceMode}
            />
            {registry.components().map(({ id, Component }) => (
              <Component key={id} readOnly={readOnly} />
            ))}
          </div>
        </MediaReferenceProvider></MediaEnvironmentProvider>
        </LexicalExtensionComposer>

        {!readOnly && sourceMode && (
          <div
            className="novel-source-surface"
            data-ast-synchronized="true"
            data-syntax-highlighted={sourceProjector ? 'true' : 'false'}
          >
            <MarkdownSourceHighlight
              ref={sourceHighlightRef}
              segments={sourceSegments}
            />
            <textarea
              ref={sourceRef}
              className="novel-source-editor"
              value={value}
              disabled={disabled}
              spellCheck={false}
              aria-label={`${ariaLabel} source`}
              placeholder={placeholder}
              onChange={(event) => syncSourceToTree(event.target.value)}
              onBlur={(event) => syncSourceToTree(cleanMarkdownHeadings(event.target.value))}
              onKeyDown={(event) => {
                const shortcut = readMediaSettings().wrapShortcut;
                if (shortcut && (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === shortcut.toLowerCase()) {
                  event.preventDefault();
                  const next = wrapSourceSelection(value, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
                  if (next) syncSourceToTree(next);
                  return;
                }
                const action = resolveEditorShortcut(event.nativeEvent, 'source');
                if (action?.kind !== 'toggle-source') return;
                event.preventDefault();
                updateSourceMode(false);
              }}
              onContextMenu={event => {
                const start = event.currentTarget.selectionStart, end = event.currentTarget.selectionEnd;
                if (start === end || !wrapSourceSelection(value, start, end)) return;
                event.preventDefault(); setSourceMenu({ x: event.clientX, y: event.clientY, source: value, start, end });
              }}
              onScroll={syncSourceScroll}
              onKeyUp={updateSourceSelection}
              onMouseUp={updateSourceSelection}
              onSelect={updateSourceSelection}
            />
            {sourceMenu && createPortal(<div className="image-layout-context-menu" role="menu" style={{ left: Math.min(sourceMenu.x, window.innerWidth - 240), top: Math.min(sourceMenu.y, window.innerHeight - 60) }} onPointerDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setSourceMenu(null); }}>
              <button role="menuitem" onClick={() => {
                if (valueRef.current === sourceMenu.source) { const next = wrapSourceSelection(sourceMenu.source, sourceMenu.start, sourceMenu.end); if (next) syncSourceToTree(next); }
                setSourceMenu(null);
              }}>将选区转换为布局</button>
            </div>, document.body)}
            {sourceSelection && (
              <div className="novel-source-selection-menu" role="toolbar" aria-label="Selected text actions">
                {sourceInstructionOpen ? (
                  <form
                    className="novel-bubble-instruction"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const instruction = sourceInstruction.trim();
                      if (!instruction) return;
                      setSourceInstructionOpen(false);
                      void runSourceSelectionAssist('agent_edit', instruction);
                    }}
                  >
                    <input
                      value={sourceInstruction}
                      autoFocus
                      aria-label="Local instruction for the selected text"
                      placeholder="Instruction for the agent"
                      onChange={(event) => setSourceInstruction(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setSourceInstructionOpen(false);
                      }}
                    />
                    <button type="submit" disabled={!sourceInstruction.trim()}>Apply</button>
                  </form>
                ) : (
                  <>
                    <button type="button" title="将选中的整行转换为布局" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                      const next = wrapSourceSelection(value, sourceSelection.start, sourceSelection.end);
                      if (next) syncSourceToTree(next);
                    }}>转为布局</button>
                    <button
                      type="button"
                      aria-label="Copy"
                      title="Copy"
                      disabled={Boolean(sourceAssistBusy)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSourceAssistBusy('copy');
                        void navigator.clipboard.writeText(sourceSelection.text)
                          .catch(() => setSourceAssistError('Copy failed'))
                          .finally(() => setSourceAssistBusy(null));
                      }}
                    >
                      <Copy size={14} />
                    </button>
                    {onSelectionAssist && (
                      <>
                        <button
                          type="button"
                          aria-label="Optimize expression"
                          title={selectionAssistDisabledReason || 'Optimize expression · OpenAI (asks for confirmation)'}
                          disabled={Boolean(sourceAssistBusy) || Boolean(selectionAssistDisabledReason)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => void runSourceSelectionAssist('optimize_expression')}
                        >
                          <Sparkles size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Agent local edit"
                          title={selectionAssistDisabledReason || 'Agent local edit · OpenAI (asks for confirmation)'}
                          disabled={Boolean(sourceAssistBusy) || Boolean(selectionAssistDisabledReason)}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setSourceInstruction('');
                            setSourceInstructionOpen(true);
                          }}
                        >
                          <Bot size={14} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label="Comment issue"
                      title={selectionAssistDisabledReason || 'Comment issue · OpenAI (asks for confirmation)'}
                      disabled={Boolean(sourceAssistBusy) || Boolean(selectionAssistDisabledReason)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void runSourceSelectionAssist('comment_issue')}
                    >
                      <MessageSquareWarning size={14} />
                    </button>
                  </>
                )}
                {sourceAssistError && <span>{sourceAssistError}</span>}
              </div>
            )}
          </div>
        )}

        {phase === 'creating' && (
          <div className="novel-editor-state novel-editor-state--loading" role="status" aria-label="Preparing editor">
            <ArticleSkeleton />
          </div>
        )}
      </div>
    );
  },
);

export default MarkdownEditor;
