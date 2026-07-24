import React from 'react';
import {
  type LucideIcon,
  Bold,
  Braces,
  CalendarDays,
  CheckSquare,
  Code2,
  FileText,
  Hash,
  Heading2,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Undo2,
} from 'lucide-react';
import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootAttrsCtx,
  rootCtx,
} from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { history, redoCommand, undoCommand } from '@milkdown/kit/plugin/history';
import { indent } from '@milkdown/kit/plugin/indent';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import {
  commonmark,
  createCodeBlockCommand,
  insertHrCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  gfm,
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm';
import { TextSelection } from '@milkdown/kit/prose/state';
import { callCommand, getMarkdown, insert, replaceAll } from '@milkdown/kit/utils';

type EditorPhase = 'idle' | 'creating' | 'ready' | 'failed';
type ToolbarCommand =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'bullet-list'
  | 'ordered-list'
  | 'quote'
  | 'code-block'
  | 'inline-code'
  | 'divider'
  | 'table'
  | 'undo'
  | 'redo';

type SlashCommand = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  markdown: string;
  inline?: boolean;
};

export type MarkdownEditorHandle = {
  focus: () => void;
  getMarkdown: () => string;
  insertMarkdown: (markdown: string) => string | null;
  replaceMarkdown: (markdown: string) => string | null;
};

type MarkdownEditorProps = {
  value: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  toolbarVisible?: boolean;
  autoFocus?: boolean;
  showStatus?: boolean;
  placeholder?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

type ToolbarProps = {
  disabled: boolean;
  sourceMode: boolean;
  onCommand: (command: ToolbarCommand) => void;
  onLink: (href: string) => void;
  onSourceModeChange: (sourceMode: boolean) => void;
};

const toolbarButtons: Array<{
  command: ToolbarCommand;
  label: string;
  icon: LucideIcon;
  dividerBefore?: boolean;
}> = [
  { command: 'heading', label: 'Heading', icon: Heading2 },
  { command: 'bold', label: 'Bold', icon: Bold },
  { command: 'italic', label: 'Italic', icon: Italic },
  { command: 'strike', label: 'Strikethrough', icon: Strikethrough },
  { command: 'bullet-list', label: 'Bullet list', icon: List, dividerBefore: true },
  { command: 'ordered-list', label: 'Ordered list', icon: ListOrdered },
  { command: 'quote', label: 'Blockquote', icon: Quote },
  { command: 'code-block', label: 'Code block', icon: Braces, dividerBefore: true },
  { command: 'inline-code', label: 'Inline code', icon: Braces },
  { command: 'divider', label: 'Divider', icon: Minus },
  { command: 'table', label: 'Table', icon: Table2 },
  { command: 'undo', label: 'Undo', icon: Undo2, dividerBefore: true },
  { command: 'redo', label: 'Redo', icon: Redo2 },
];

const slashCommands: SlashCommand[] = [
  {
    id: 'heading',
    title: 'Heading',
    description: 'Start a section title.',
    keywords: ['h2', 'heading', 'title', 'section'],
    icon: Heading2,
    markdown: '## ',
  },
  {
    id: 'todo',
    title: 'Task',
    description: 'Add a checkbox action item.',
    keywords: ['todo', 'task', 'checkbox', 'action'],
    icon: CheckSquare,
    markdown: '- [ ] ',
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a quote or important sentence.',
    keywords: ['quote', 'blockquote', 'citation'],
    icon: Quote,
    markdown: '> ',
  },
  {
    id: 'event',
    title: 'Event record',
    description: 'Structured moment: what changed, evidence, next action.',
    keywords: ['event', 'moment', 'status', '记录', '事件'],
    icon: CalendarDays,
    markdown: '## Event\n\n- Time: \n- What changed: \n- Evidence: \n- Next action: \n',
  },
  {
    id: 'decision',
    title: 'Decision',
    description: 'Record the choice, reason, and follow-up.',
    keywords: ['decision', 'decide', 'choice', '决定'],
    icon: FileText,
    markdown: '## Decision\n\n- Decision: \n- Reason: \n- Tradeoff: \n- Follow-up: \n',
  },
  {
    id: 'internal-link',
    title: 'Internal link',
    description: 'Obsidian-style placeholder for linking knowledge.',
    keywords: ['link', 'wiki', 'obsidian', 'backlink', '双链'],
    icon: Link2,
    markdown: '[[Untitled]]',
    inline: true,
  },
  {
    id: 'tag',
    title: 'Tag',
    description: 'Add a lightweight knowledge tag.',
    keywords: ['tag', 'hash', 'label'],
    icon: Hash,
    markdown: '#topic ',
    inline: true,
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Insert a small Markdown table.',
    keywords: ['table', 'grid'],
    icon: Table2,
    markdown: '| Field | Value |\n| --- | --- |\n|  |  |\n',
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Separate two blocks.',
    keywords: ['hr', 'divider', 'line'],
    icon: Minus,
    markdown: '---\n',
  },
  {
    id: 'image-prompt',
    title: 'Image prompt',
    description: 'Inline image-generation request block.',
    keywords: ['image', 'media', 'ai', 'generate'],
    icon: Image,
    markdown: '```silan-ai-image\nprompt: \nstyle: editorial documentary\nratio: 1:1\n```\n',
  },
];

const commandMatches = (command: SlashCommand, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [command.title, command.description, ...command.keywords]
    .join(' ')
    .toLowerCase()
    .includes(needle);
};

const commandInsertion = (current: string, command: SlashCommand) => {
  const markdown = command.markdown;
  if (command.inline) return markdown;
  if (!current.trim()) return markdown;
  if (/^\s*$/.test(markdown)) return markdown;
  if (markdown.startsWith('\n') || current.endsWith('\n\n')) return markdown;
  if (current.endsWith('\n')) return `\n${markdown}`;
  return `\n\n${markdown}`;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const inlineTokenPattern = /(`[^`\n]+`)|(!?\[[^\]\n]+\]\([^)]+\))|(\[\[[^\]\n]+\]\])|(^|[\s([{])(#[-\p{L}\p{N}_/]+)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/gu;

const span = (className: string, value: string) => (
  `<span class="${className}">${escapeHtml(value)}</span>`
);

const highlightInlineMarkdown = (line: string) => {
  let highlighted = '';
  let lastIndex = 0;

  for (const match of line.matchAll(inlineTokenPattern)) {
    const matchText = match[0];
    const index = match.index ?? 0;
    highlighted += escapeHtml(line.slice(lastIndex, index));

    if (match[1]) highlighted += span('md-src-inline-code', match[1]);
    else if (match[2]) highlighted += span(match[2].startsWith('!') ? 'md-src-image' : 'md-src-link', match[2]);
    else if (match[3]) highlighted += span('md-src-wiki-link', match[3]);
    else if (match[5]) {
      highlighted += escapeHtml(match[4] ?? '');
      highlighted += span('md-src-tag', match[5]);
    } else if (match[6] || match[7]) highlighted += span('md-src-strong', matchText);
    else if (match[8] || match[9]) highlighted += span('md-src-emphasis', matchText);
    else highlighted += escapeHtml(matchText);

    lastIndex = index + matchText.length;
  }

  highlighted += escapeHtml(line.slice(lastIndex));
  return highlighted || '&nbsp;';
};

const highlightMarkdownSource = (markdown: string) => {
  const lines = markdown.split('\n');
  let inCodeFence = false;

  return lines.map((line) => {
    const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fence) {
      inCodeFence = !inCodeFence;
      return `${escapeHtml(fence[1])}${span('md-src-fence', fence[2])}${span('md-src-code-info', fence[3])}`;
    }

    if (inCodeFence) return span('md-src-code-line', line || ' ');

    const heading = line.match(/^(#{1,6})(\s+.*)$/);
    if (heading) {
      return `${span('md-src-heading-marker', heading[1])}${span('md-src-heading-text', heading[2])}`;
    }

    const quote = line.match(/^(\s*>+)(\s?.*)$/);
    if (quote) {
      return `${span('md-src-quote-marker', quote[1])}${span('md-src-quote-text', quote[2])}`;
    }

    const task = line.match(/^(\s*)([-+*])(\s+\[[ xX]\]\s+)(.*)$/);
    if (task) {
      return `${escapeHtml(task[1])}${span('md-src-list-marker', task[2])}${span('md-src-task-marker', task[3])}${highlightInlineMarkdown(task[4])}`;
    }

    const unordered = line.match(/^(\s*)([-+*])(\s+)(.*)$/);
    if (unordered) {
      return `${escapeHtml(unordered[1])}${span('md-src-list-marker', unordered[2])}${escapeHtml(unordered[3])}${highlightInlineMarkdown(unordered[4])}`;
    }

    const ordered = line.match(/^(\s*)(\d+\.)(\s+)(.*)$/);
    if (ordered) {
      return `${escapeHtml(ordered[1])}${span('md-src-list-marker', ordered[2])}${escapeHtml(ordered[3])}${highlightInlineMarkdown(ordered[4])}`;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) return span('md-src-table', line || ' ');
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return span('md-src-hr', line);

    return highlightInlineMarkdown(line);
  }).join('\n');
};

function MarkdownToolbar({
  disabled,
  sourceMode,
  onCommand,
  onLink,
  onSourceModeChange,
}: ToolbarProps) {
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [href, setHref] = React.useState('https://');

  const submitLink = (event: React.FormEvent) => {
    event.preventDefault();
    const nextHref = href.trim();
    if (!nextHref) return;
    onLink(nextHref);
    setHref('https://');
    setLinkOpen(false);
  };

  return (
    <div className="milkdown-toolbar" role="toolbar" aria-label="Markdown formatting">
      {toolbarButtons.map(({ command, label, icon: Icon, dividerBefore }) => (
        <React.Fragment key={command}>
          {dividerBefore && <span className="milkdown-toolbar-divider" aria-hidden="true" />}
          <button
            type="button"
            disabled={disabled || sourceMode}
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onCommand(command)}
          >
            <Icon size={15} />
          </button>
        </React.Fragment>
      ))}
      <span className="milkdown-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled || sourceMode}
        className={linkOpen ? 'active' : ''}
        title="Link"
        aria-label="Link"
        aria-expanded={linkOpen}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setLinkOpen((current) => !current)}
      >
        <Link2 size={15} />
      </button>
      <span className="milkdown-toolbar-divider" aria-hidden="true" />
      <button
        type="button"
        disabled={disabled}
        className={sourceMode ? 'active' : ''}
        title={sourceMode ? 'Switch to rich editor' : 'Switch to source mode'}
        aria-label={sourceMode ? 'Switch to rich editor' : 'Switch to source mode'}
        aria-pressed={sourceMode}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onSourceModeChange(!sourceMode)}
      >
        <Code2 size={15} />
      </button>
      {linkOpen && (
        <form className="milkdown-link-popover" onSubmit={submitLink}>
          <label htmlFor="milkdown-link-href">Link destination</label>
          <div>
            <input
              id="milkdown-link-href"
              value={href}
              inputMode="url"
              autoComplete="url"
              autoFocus
              onChange={(event) => setHref(event.target.value)}
            />
            <button type="submit" disabled={disabled || !href.trim()}>Apply</button>
          </div>
        </form>
      )}
    </div>
  );
}

function SlashCommandMenu({
  query,
  selectedIndex,
  commands,
  onSelect,
}: {
  query: string;
  selectedIndex: number;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
}) {
  return (
    <div
      className="milkdown-slash-menu"
      role="listbox"
      aria-label="Slash commands"
      aria-activedescendant={commands[selectedIndex] ? `slash-command-${commands[selectedIndex].id}` : undefined}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="milkdown-slash-query">
        <span>/</span>
        <strong>{query || 'command'}</strong>
        <small>Enter to insert · Esc to close</small>
      </div>
      {commands.length === 0 ? (
        <div className="milkdown-slash-empty">No matching block.</div>
      ) : commands.map((command, index) => {
        const Icon = command.icon;
        return (
          <button
            id={`slash-command-${command.id}`}
            key={command.id}
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            className={index === selectedIndex ? 'active' : ''}
            onClick={() => onSelect(command)}
          >
            <Icon size={16} />
            <span>
              <strong>{command.title}</strong>
              <small>{command.description}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
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
    showStatus = true,
    placeholder,
    onChange,
    onKeyDown,
  }, forwardedRef) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const sourceRef = React.useRef<HTMLTextAreaElement | null>(null);
    const sourceHighlightRef = React.useRef<HTMLPreElement | null>(null);
    const editorRef = React.useRef<Editor | null>(null);
    const valueRef = React.useRef(value);
    const onChangeRef = React.useRef(onChange);
    const disabledRef = React.useRef(disabled || readOnly);
    const [phase, setPhase] = React.useState<EditorPhase>('idle');
    const [failure, setFailure] = React.useState('');
    const [slashOpen, setSlashOpen] = React.useState(false);
    const [slashQuery, setSlashQuery] = React.useState('');
    const [slashIndex, setSlashIndex] = React.useState(0);
    const [sourceMode, setSourceMode] = React.useState(false);

    const visibleSlashCommands = React.useMemo(
      () => slashCommands.filter((command) => commandMatches(command, slashQuery)).slice(0, 8),
      [slashQuery],
    );
    const highlightedSource = React.useMemo(() => highlightMarkdownSource(value), [value]);

    React.useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);

    React.useEffect(() => {
      disabledRef.current = disabled || readOnly;
      const editor = editorRef.current;
      if (!editor || phase !== 'ready') return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.setProps({ editable: () => !disabledRef.current });
      });
    }, [disabled, phase, readOnly]);

    React.useEffect(() => {
      const root = rootRef.current;
      if (!root) return undefined;

      let disposed = false;
      valueRef.current = value;
      setPhase('creating');
      setFailure('');

      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, value);
          ctx.set(rootAttrsCtx, {
            'data-milkdown-surface': readOnly ? 'preview' : 'editor',
          });
          ctx.update(editorViewOptionsCtx, (previous) => ({
            ...previous,
            editable: () => !disabledRef.current,
            attributes: {
              ...previous.attributes,
              'aria-label': ariaLabel,
              ...(readOnly ? {} : { 'aria-multiline': 'true' }),
              role: readOnly ? 'document' : 'textbox',
            },
          }));
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previousMarkdown) => {
            if (markdown === previousMarkdown || markdown === valueRef.current) return;
            valueRef.current = markdown;
            onChangeRef.current?.(markdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(cursor)
        .use(indent)
        .use(listener);

      editorRef.current = editor;
      void editor.create()
        .then(() => {
          if (disposed) {
            return editor.destroy();
          }
          setPhase('ready');
          if (autoFocus && !readOnly) {
            editor.action((ctx) => ctx.get(editorViewCtx).focus());
          }
          return undefined;
        })
        .catch((reason: unknown) => {
          if (disposed) return;
          setFailure(reason instanceof Error ? reason.message : String(reason));
          setPhase('failed');
        });

      return () => {
        disposed = true;
        if (editorRef.current === editor) editorRef.current = null;
        void editor.destroy();
      };
    }, [ariaLabel, autoFocus, readOnly]);

    React.useEffect(() => {
      const editor = editorRef.current;
      if (!editor || phase !== 'ready') return;
      const current = editor.action(getMarkdown());
      if (current === value) {
        valueRef.current = value;
        return;
      }
      valueRef.current = value;
      editor.action(replaceAll(value));
    }, [phase, value]);

    const focus = React.useCallback(() => {
      if (sourceMode) {
        sourceRef.current?.focus();
        return;
      }
      editorRef.current?.action((ctx) => ctx.get(editorViewCtx).focus());
    }, [sourceMode]);

    const currentMarkdown = React.useCallback(() => (
      sourceMode ? valueRef.current : (editorRef.current?.action(getMarkdown()) ?? valueRef.current)
    ), [sourceMode]);

    const applySourceValue = React.useCallback((nextValue: string) => {
      valueRef.current = nextValue;
      onChangeRef.current?.(nextValue);
      return nextValue;
    }, []);

    const insertMarkdown = React.useCallback((markdown: string) => {
      if (sourceMode) {
        if (disabledRef.current) return null;
        const textarea = sourceRef.current;
        const current = valueRef.current;
        const start = textarea?.selectionStart ?? current.length;
        const end = textarea?.selectionEnd ?? start;
        const nextValue = `${current.slice(0, start)}${markdown}${current.slice(end)}`;
        applySourceValue(nextValue);
        window.requestAnimationFrame(() => {
          const nextCaret = start + markdown.length;
          sourceRef.current?.focus();
          sourceRef.current?.setSelectionRange(nextCaret, nextCaret);
        });
        return nextValue;
      }

      const editor = editorRef.current;
      if (!editor || phase !== 'ready' || disabledRef.current) return null;
      editor.action(insert(markdown));
      const nextValue = editor.action(getMarkdown());
      if (nextValue !== valueRef.current) {
        valueRef.current = nextValue;
        onChangeRef.current?.(nextValue);
      }
      return nextValue;
    }, [applySourceValue, phase, sourceMode]);

    const replaceMarkdown = React.useCallback((markdown: string) => {
      if (sourceMode) {
        if (disabledRef.current) return null;
        applySourceValue(markdown);
        window.requestAnimationFrame(() => {
          sourceRef.current?.focus();
          sourceRef.current?.setSelectionRange(markdown.length, markdown.length);
        });
        return markdown;
      }

      const editor = editorRef.current;
      if (!editor || phase !== 'ready' || disabledRef.current) return null;
      editor.action(replaceAll(markdown));
      const nextValue = editor.action(getMarkdown());
      valueRef.current = nextValue;
      onChangeRef.current?.(nextValue);
      return nextValue;
    }, [applySourceValue, phase, sourceMode]);

    React.useImperativeHandle(forwardedRef, () => ({
      focus,
      getMarkdown: currentMarkdown,
      insertMarkdown,
      replaceMarkdown,
    }), [currentMarkdown, focus, insertMarkdown, replaceMarkdown]);

    const runCommand = React.useCallback((command: ToolbarCommand) => {
      const editor = editorRef.current;
      if (!editor || phase !== 'ready' || disabledRef.current) return;
      switch (command) {
        case 'heading':
          editor.action(callCommand(wrapInHeadingCommand.key, 2));
          break;
        case 'bold':
          editor.action(callCommand(toggleStrongCommand.key));
          break;
        case 'italic':
          editor.action(callCommand(toggleEmphasisCommand.key));
          break;
        case 'strike':
          editor.action(callCommand(toggleStrikethroughCommand.key));
          break;
        case 'bullet-list':
          editor.action(callCommand(wrapInBulletListCommand.key));
          break;
        case 'ordered-list':
          editor.action(callCommand(wrapInOrderedListCommand.key));
          break;
        case 'quote':
          editor.action(callCommand(wrapInBlockquoteCommand.key));
          break;
        case 'code-block':
          editor.action(callCommand(createCodeBlockCommand.key));
          break;
        case 'inline-code':
          editor.action(callCommand(toggleInlineCodeCommand.key));
          break;
        case 'divider':
          editor.action(callCommand(insertHrCommand.key));
          break;
        case 'table':
          editor.action(callCommand(insertTableCommand.key, { row: 3, col: 3 }));
          break;
        case 'undo':
          editor.action(callCommand(undoCommand.key));
          break;
        case 'redo':
          editor.action(callCommand(redoCommand.key));
          break;
      }
      focus();
    }, [focus, phase]);

    const applyLink = React.useCallback((href: string) => {
      const editor = editorRef.current;
      if (!editor || phase !== 'ready' || disabledRef.current) return;
      editor.action(callCommand(toggleLinkCommand.key, { href }));
      focus();
    }, [focus, phase]);

    const closeSlashMenu = React.useCallback(() => {
      setSlashOpen(false);
      setSlashQuery('');
      setSlashIndex(0);
    }, []);

    const updateSourceMode = React.useCallback((nextSourceMode: boolean) => {
      closeSlashMenu();
      setSourceMode(nextSourceMode);
      window.requestAnimationFrame(() => {
        if (nextSourceMode) {
          sourceRef.current?.focus();
          return;
        }
        editorRef.current?.action((ctx) => ctx.get(editorViewCtx).focus());
      });
    }, [closeSlashMenu]);

    const insertSlashCommand = React.useCallback((command: SlashCommand) => {
      const current = currentMarkdown();
      insertMarkdown(commandInsertion(current, command));
      closeSlashMenu();
      focus();
    }, [closeSlashMenu, currentMarkdown, focus, insertMarkdown]);

    React.useEffect(() => {
      setSlashIndex(0);
    }, [slashQuery]);

    React.useEffect(() => {
      if (slashIndex < visibleSlashCommands.length) return;
      setSlashIndex(Math.max(0, visibleSlashCommands.length - 1));
    }, [slashIndex, visibleSlashCommands.length]);

    const focusDocumentEnd = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      if (sourceMode) return;
      if (readOnly || disabledRef.current || phase !== 'ready') return;
      const target = event.target as HTMLElement;
      if (
        target !== event.currentTarget
        && !target.classList.contains('milkdown-editor-root')
        && !target.classList.contains('milkdown')
      ) {
        return;
      }
      event.preventDefault();
      editorRef.current?.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
        view.focus();
      });
    }, [phase, readOnly, sourceMode]);

    const characterCount = Array.from(value).length;

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!sourceMode && !readOnly && !disabledRef.current && phase === 'ready') {
        if (slashOpen) {
          if (event.key === 'Escape') {
            event.preventDefault();
            closeSlashMenu();
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSlashIndex((current) => (
              visibleSlashCommands.length === 0 ? 0 : (current + 1) % visibleSlashCommands.length
            ));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSlashIndex((current) => (
              visibleSlashCommands.length === 0
                ? 0
                : (current - 1 + visibleSlashCommands.length) % visibleSlashCommands.length
            ));
            return;
          }
          if (event.key === 'Enter' || event.key === 'Tab') {
            const command = visibleSlashCommands[slashIndex];
            if (command) {
              event.preventDefault();
              insertSlashCommand(command);
              return;
            }
          }
          if (event.key === 'Backspace') {
            event.preventDefault();
            if (!slashQuery) closeSlashMenu();
            else setSlashQuery((current) => current.slice(0, -1));
            return;
          }
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            setSlashQuery((current) => `${current}${event.key}`);
            return;
          }
        } else if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          setSlashOpen(true);
          setSlashQuery('');
          setSlashIndex(0);
          return;
        }
      }

      onKeyDown?.(event);
    }, [
      closeSlashMenu,
      insertSlashCommand,
      onKeyDown,
      phase,
      readOnly,
      slashIndex,
      slashOpen,
      slashQuery,
      sourceMode,
      visibleSlashCommands,
    ]);

    const handleSourceKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLDivElement>);
    }, [onKeyDown]);

    const updateSourceText = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
      applySourceValue(event.target.value);
    }, [applySourceValue]);

    const syncSourceHighlightScroll = React.useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
      const highlight = sourceHighlightRef.current;
      if (!highlight) return;
      highlight.scrollTop = event.currentTarget.scrollTop;
      highlight.scrollLeft = event.currentTarget.scrollLeft;
    }, []);

    return (
      <div
        className={[
          'editor-host',
          'milkdown-editor',
          readOnly ? 'milkdown-editor--preview' : '',
          className,
        ].filter(Boolean).join(' ')}
        data-state={phase}
        data-mode={sourceMode ? 'source' : 'rich'}
        data-disabled={disabled || readOnly ? 'true' : 'false'}
        data-empty={value.trim() ? 'false' : 'true'}
        onMouseDown={focusDocumentEnd}
        onKeyDown={handleKeyDown}
      >
        {!readOnly && toolbarVisible && (
          <MarkdownToolbar
            disabled={disabled || phase !== 'ready'}
            sourceMode={sourceMode}
            onCommand={runCommand}
            onLink={applyLink}
            onSourceModeChange={updateSourceMode}
          />
        )}
        <div ref={rootRef} className="milkdown-editor-root" />
        {!readOnly && sourceMode && (
          <>
            <pre
              ref={sourceHighlightRef}
              className="milkdown-source-highlight"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: highlightedSource }}
            />
            <textarea
              ref={sourceRef}
              className="milkdown-source-editor"
              value={value}
              disabled={disabled}
              spellCheck={false}
              aria-label={`${ariaLabel} source`}
              placeholder={placeholder}
              onChange={updateSourceText}
              onKeyDown={handleSourceKeyDown}
              onScroll={syncSourceHighlightScroll}
            />
          </>
        )}
        {!readOnly && !sourceMode && slashOpen && (
          <SlashCommandMenu
            query={slashQuery}
            selectedIndex={slashIndex}
            commands={visibleSlashCommands}
            onSelect={insertSlashCommand}
          />
        )}
        {placeholder && !sourceMode && value.trim() === '' && phase !== 'failed' && (
          <div className="milkdown-editor-placeholder" aria-hidden="true">{placeholder}</div>
        )}
        {phase === 'creating' && <div className="milkdown-editor-state">Preparing editor…</div>}
        {phase === 'failed' && (
          <div className="milkdown-editor-state is-error" role="alert">
            Editor could not start{failure ? `: ${failure}` : '.'}
          </div>
        )}
        {!readOnly && showStatus && (
          <footer className="milkdown-editor-status" aria-label="Editor status">
            <span>{sourceMode ? 'Source · Markdown / GFM' : 'Milkdown · Markdown / GFM'}</span>
            <span>{characterCount.toLocaleString()} characters</span>
          </footer>
        )}
      </div>
    );
  },
);

export default MarkdownEditor;
