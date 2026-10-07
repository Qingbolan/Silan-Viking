import { TableToolbarActions, useTableToolbar } from './TableToolbarActions';
import { useCaretChrome } from '../interaction/useCaretChrome';
import React from 'react';
import {
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  mergeRegister,
  type LexicalEditor,
} from 'lexical';
import {
  Bold,
  Braces,
  Code2,
  Italic,
  ImagePlus,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
  Underline,
  type LucideIcon,
} from 'lucide-react';
import type { MarkdownSelectionRange } from '../extensionPoints';
import {
  EMPTY_FORMATTING_SNAPSHOT,
  FormattingController,
  $readFormattingSnapshot,
  type BlockFormat,
  type FormattingCommand,
  type FormattingSnapshot,
} from '../interaction/FormattingController';
import { readEditorSnapshot } from '../model/MarkdownDocument';
import { $captureSelectionRange } from '../model/SelectionRange';
import { OPEN_IMAGE_PICKER_COMMAND } from '../interaction/ImageEditingController';
import { OPEN_LINK_EDITOR_COMMAND } from '../interaction/EditorShortcutController';

type ToolbarButton = {
  active: (snapshot: FormattingSnapshot) => boolean;
  command: FormattingCommand;
  dividerBefore?: boolean;
  icon: LucideIcon;
  label: string;
  shortcut?: string;
};

const toolbarButtons: ToolbarButton[] = [
  { active: (state) => state.bold, command: 'bold', icon: Bold, label: 'Bold', shortcut: '⌘B' },
  { active: (state) => state.italic, command: 'italic', icon: Italic, label: 'Italic', shortcut: '⌘I' },
  { active: (state) => state.underline, command: 'underline', icon: Underline, label: 'Underline', shortcut: '⌘U' },
  { active: (state) => state.strike, command: 'strike', icon: Strikethrough, label: 'Strikethrough', shortcut: '⇧⌘S' },
  { active: (state) => state.bulletList, command: 'bullet-list', dividerBefore: true, icon: List, label: 'Bullet list', shortcut: '⇧⌘8' },
  { active: (state) => state.orderedList, command: 'ordered-list', icon: ListOrdered, label: 'Ordered list', shortcut: '⇧⌘7' },
  { active: (state) => state.checkList, command: 'check-list', icon: ListChecks, label: 'Task list' },
  { active: (state) => state.inlineCode, command: 'inline-code', dividerBefore: true, icon: Braces, label: 'Inline code', shortcut: '⌘E' },
  { active: () => false, command: 'divider', icon: Minus, label: 'Divider' },
  { active: () => false, command: 'table', icon: Table2, label: 'Table', shortcut: '⌥⌘T' },
  { active: () => false, command: 'undo', dividerBefore: true, icon: Undo2, label: 'Undo', shortcut: '⌘Z' },
  { active: () => false, command: 'redo', icon: Redo2, label: 'Redo', shortcut: '⇧⌘Z' },
];

const blockOptions: Array<{ label: string; value: BlockFormat }> = [
  { label: 'Title', value: 'title' },
  { label: 'Paragraph', value: 'paragraph' },
  { label: 'Heading 1', value: 'h1' },
  { label: 'Heading 2', value: 'h2' },
  { label: 'Heading 3', value: 'h3' },
  { label: 'Heading 4', value: 'h4' },
  { label: 'Heading 5', value: 'h5' },
  { label: 'Heading 6', value: 'h6' },
  { label: 'Blockquote', value: 'quote' },
  { label: 'Code block', value: 'code' },
];

const codeLanguages = [
  ['', 'Plain text'],
  ['bash', 'Bash'],
  ['css', 'CSS'],
  ['go', 'Go'],
  ['html', 'HTML'],
  ['javascript', 'JavaScript'],
  ['json', 'JSON'],
  ['markdown', 'Markdown'],
  ['python', 'Python'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['tsx', 'TSX'],
  ['typescript', 'TypeScript'],
  ['yaml', 'YAML'],
] as const;

function useFormattingSnapshot(editor: LexicalEditor | null) {
  const controller = React.useMemo(() => (
    editor ? new FormattingController(editor) : null
  ), [editor]);
  const [snapshot, setSnapshot] = React.useState(EMPTY_FORMATTING_SNAPSHOT);
  const [history, setHistory] = React.useState({ redo: false, undo: false });

  React.useEffect(() => {
    if (!editor || !controller) return undefined;
    setSnapshot(controller.readSnapshot());
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        setSnapshot(readEditorSnapshot(editor, editorState, $readFormattingSnapshot));
      }),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (undo) => {
          setHistory((current) => ({ ...current, undo }));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (redo) => {
          setHistory((current) => ({ ...current, redo }));
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [controller, editor]);

  return { controller, history, snapshot };
}

export function FormattingToolbar({
  editor,
  visible,
  disabled,
  imageImportEnabled,
  sourceMode,
  onSourceModeChange,
}: {
  editor: LexicalEditor | null;
  visible: boolean;
  disabled: boolean;
  imageImportEnabled: boolean;
  sourceMode: boolean;
  onSourceModeChange: (sourceMode: boolean) => void;
}) {
  const { controller, history, snapshot } = useFormattingSnapshot(editor);
  const table = useTableToolbar(editor);
  const [tab, setTab] = React.useState<'text' | 'table'>('table');
  const contextualTable = !sourceMode && table.state !== null;
  const shown = visible || contextualTable;
  React.useEffect(() => setTab('table'), [table.state?.tableKey]);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [href, setHref] = React.useState('https://');
  const linkSelectionRef = React.useRef<MarkdownSelectionRange | null>(null);
  const toolbarScrollRef = React.useRef<HTMLDivElement | null>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const chrome = useCaretChrome(editor, toolbarRef, !sourceMode && !disabled, table.state?.cellKey);

  React.useLayoutEffect(() => {
    toolbarScrollRef.current?.scrollTo({ behavior: 'auto', left: 0 });
  }, [snapshot.block, sourceMode, tab]);

  const closeLink = () => {
    setLinkOpen(false);
    linkSelectionRef.current = null;
  };
  const openLink = React.useCallback(() => {
    if (!editor || !controller) return false;
    linkSelectionRef.current = editor.read(() => $captureSelectionRange());
    setHref(controller.readSnapshot().linkHref || 'https://');
    setLinkOpen(true);
    return true;
  }, [controller, editor]);

  React.useEffect(() => {
    if (!editor) return undefined;
    return editor.registerCommand(
      OPEN_LINK_EDITOR_COMMAND,
      () => (disabled || sourceMode || !shown ? false : openLink()),
      COMMAND_PRIORITY_HIGH,
    );
  }, [disabled, editor, openLink, sourceMode, shown]);

  return (<>
    {!sourceMode && chrome.caret && <span key={`${chrome.caret.left}:${chrome.caret.top}:${chrome.caret.height}`} aria-hidden="true" className="lexical-measured-caret" style={chrome.caret} />}
    <div ref={toolbarRef} className="novel-toolbar" data-placement={sourceMode ? 'fixed' : 'caret'} style={{ ...(sourceMode ? {} : chrome.toolbar), display: shown ? undefined : 'none' }}>
      <div
        ref={toolbarScrollRef}
        className="novel-toolbar__scroll"
        role="toolbar"
        aria-label={contextualTable && tab === 'table' ? 'Table actions' : 'Markdown formatting'}
      >
        {contextualTable && <>
          <button type="button" aria-label="Text actions" aria-pressed={tab === 'text'} className={tab === 'text' ? 'active' : ''}
            onMouseDown={(event) => event.preventDefault()} onClick={() => setTab('text')} title="Text actions">Aa</button>
          <button type="button" aria-label="Table actions" aria-pressed={tab === 'table'} className={tab === 'table' ? 'active' : ''}
            onMouseDown={(event) => event.preventDefault()} onClick={() => setTab('table')} title="Table actions"><Table2 size={16} /></button>
          <span className="novel-toolbar-divider" aria-hidden="true" />
        </>}
        {contextualTable && tab === 'table' && table.controller && table.state
          ? <TableToolbarActions controller={table.controller} state={table.state} />
          : <>
        <label className="novel-block-format" title="Block style — ⌘0–⌘6">
          <select
            aria-label="Block style"
            disabled={disabled || sourceMode || !controller}
            value={snapshot.block}
            onChange={(event) => controller?.setBlock(event.target.value as BlockFormat)}
          >
            {blockOptions.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.value === 'title'}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {snapshot.block === 'code' && (
          <label className="novel-code-language" title="Code language">
            <select
              aria-label="Code language"
              disabled={disabled || sourceMode || !controller}
              value={snapshot.codeLanguage}
              onChange={(event) => controller?.setCodeLanguage(event.target.value)}
            >
              {codeLanguages.map(([value, label]) => (
                <option key={value || 'plain'} value={value}>{label}</option>
              ))}
            </select>
          </label>
        )}
        <span className="novel-toolbar-divider" aria-hidden="true" />
        {toolbarButtons.map(({ active, command, dividerBefore, icon: Icon, label, shortcut }) => {
          const pressed = active(snapshot);
          return (
            <React.Fragment key={command}>
              {dividerBefore && <span className="novel-toolbar-divider" aria-hidden="true" />}
              <button
                type="button"
                disabled={
                  disabled
                  || sourceMode
                  || !controller
                  || (command === 'undo' && !history.undo)
                  || (command === 'redo' && !history.redo)
                }
                className={pressed ? 'active' : ''}
                title={shortcut ? `${label} — ${shortcut}` : label}
                aria-label={label}
                aria-pressed={pressed || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => controller?.run(command)}
              >
                <Icon size={16} />
              </button>
            </React.Fragment>
          );
        })}
        {imageImportEnabled && (
          <button
            type="button"
            disabled={disabled || sourceMode || !editor}
            title="Insert image — paste, choose a file, or press ⌃⌘I"
            aria-label="Insert image"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.dispatchCommand(OPEN_IMAGE_PICKER_COMMAND, undefined)}
          >
            <ImagePlus size={16} />
          </button>
        )}
        <span className="novel-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          disabled={disabled || sourceMode || !controller}
          className={linkOpen || snapshot.link ? 'active' : ''}
          title="Link — ⌘K"
          aria-label="Link"
          aria-expanded={linkOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (linkOpen) closeLink();
            else openLink();
          }}
        >
          <Link2 size={16} />
        </button>
        <span className="novel-toolbar-divider" aria-hidden="true" />
        <button
          type="button"
          disabled={disabled}
          className={sourceMode ? 'active' : ''}
          title={`${sourceMode ? 'Switch to rich editor' : 'Switch to source mode'} — ⌘/`}
          aria-label={sourceMode ? 'Switch to rich editor' : 'Switch to source mode'}
          aria-pressed={sourceMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSourceModeChange(!sourceMode)}
        >
          <Code2 size={16} />
        </button>
        </>}
      </div>
      {linkOpen && (
        <form
          className="novel-link-popover"
          onSubmit={(event) => {
            event.preventDefault();
            const nextHref = href.trim();
            if (!controller || !nextHref) return;
            controller.setLink(nextHref, linkSelectionRef.current);
            closeLink();
          }}
        >
          <label htmlFor="lexical-link-href">Link destination</label>
          <div>
            <input
              id="lexical-link-href"
              value={href}
              inputMode="url"
              autoComplete="url"
              autoFocus
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                closeLink();
                editor?.focus();
              }}
            />
            {snapshot.link && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  controller?.setLink(null, linkSelectionRef.current);
                  closeLink();
                }}
              >
                Remove
              </button>
            )}
            <button type="submit" disabled={disabled || !href.trim()}>Apply</button>
          </div>
        </form>
      )}
    </div>
  </>);
}
