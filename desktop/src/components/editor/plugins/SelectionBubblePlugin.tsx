import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND, type TextFormatType } from 'lexical';
import {
  Bold,
  Bot,
  Braces,
  Copy,
  Italic,
  Link2,
  MessageSquareWarning,
  Sparkles,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react';
import type {
  MarkdownSelectionAssistAction,
  MarkdownSelectionAssistRequest,
  MarkdownSelectionAssistResult,
  MarkdownSelectionRange,
} from '../extensionPoints';
import {
  $readFormattingSnapshot,
  FormattingController,
  type FormattingSnapshot,
} from '../interaction/FormattingController';
import {
  OverlayPositionController,
  readEditorToolbarInset,
  type OverlayPosition,
} from '../interaction/OverlayPositionController';
import { $readSelectionAssistContext, quoteIssueComment } from '../interaction/SelectionAssist';
import { $insertMarkdown, readEditorSnapshot } from '../model/MarkdownDocument';
import { $captureSelectionRange, $tryRestoreSelectionRange } from '../model/SelectionRange';

type BubbleState = {
  context: Omit<MarkdownSelectionAssistRequest, 'action' | 'instruction'>;
  formatting: FormattingSnapshot;
  range: MarkdownSelectionRange;
};

const hiddenPosition: OverlayPosition = {
  left: 0,
  placement: 'above',
  top: 0,
  visible: false,
};

export function SelectionBubblePlugin({
  disabled,
  offsetForMainToolbar,
  onSelectionAssist,
  selectionAssistDisabledReason = null,
}: {
  disabled: boolean;
  offsetForMainToolbar: boolean;
  selectionAssistDisabledReason?: string | null;
  onSelectionAssist?: (
    request: MarkdownSelectionAssistRequest,
  ) => Promise<MarkdownSelectionAssistResult>;
}) {
  const [editor] = useLexicalComposerContext();
  const controller = React.useMemo(() => new FormattingController(editor), [editor]);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const nativeRangeRef = React.useRef<Range | null>(null);
  const [bubble, setBubble] = React.useState<BubbleState | null>(null);
  const [position, setPosition] = React.useState(hiddenPosition);
  const [busyAction, setBusyAction] = React.useState<MarkdownSelectionAssistAction | 'copy' | null>(null);
  const [error, setError] = React.useState('');
  const [instructionOpen, setInstructionOpen] = React.useState(false);
  const [instruction, setInstruction] = React.useState('');
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [href, setHref] = React.useState('');

  React.useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    let next: BubbleState | null = null;
    readEditorSnapshot(editor, editorState, () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) return;
      const context = $readSelectionAssistContext(selection);
      const range = $captureSelectionRange();
      if (!context || !range) return;
      next = { context, formatting: $readFormattingSnapshot(), range };
    });

    const nativeSelection = window.getSelection();
    if (!next || disabled || !nativeSelection?.rangeCount) {
      nativeRangeRef.current = null;
      setBubble(null);
      setPosition(hiddenPosition);
      return;
    }
    nativeRangeRef.current = nativeSelection.getRangeAt(0).cloneRange();
    setBubble(next);
  }), [disabled, editor]);

  React.useLayoutEffect(() => {
    const overlay = bubbleRef.current;
    const root = editor.getRootElement()?.parentElement;
    if (!bubble || !overlay || !root) return undefined;
    const mainToolbar = offsetForMainToolbar
      ? root.parentElement?.querySelector<HTMLElement>('.novel-toolbar') || null
      : null;
    setPosition(hiddenPosition);
    const positioning = new OverlayPositionController({
      container: root,
      onPosition: setPosition,
      observedElements: mainToolbar ? [mainToolbar] : [],
      options: { minTop: () => readEditorToolbarInset(root, offsetForMainToolbar) },
      overlay,
      readAnchor: () => nativeRangeRef.current?.getBoundingClientRect() || null,
    });
    positioning.connect();
    return () => positioning.dispose();
  }, [bubble, editor, offsetForMainToolbar]);

  if (!bubble || disabled) return null;

  const restore = () => {
    let restored = false;
    editor.update(() => {
      restored = Boolean($tryRestoreSelectionRange(bubble.range));
    }, { discrete: true });
    return restored;
  };

  const runAssist = async (action: MarkdownSelectionAssistAction, localInstruction?: string) => {
    if (action === 'agent_edit' && !localInstruction) return;
    setError('');
    setBusyAction(action);
    try {
      const result = onSelectionAssist
        ? await onSelectionAssist({ action, ...bubble.context, instruction: localInstruction })
        : { comment: 'Review this selected passage.' };
      if (action === 'comment_issue') {
        const markdown = quoteIssueComment(result.comment?.trim() || 'Review this selected passage.');
        let applied = false;
        editor.update(() => {
          const selection = $tryRestoreSelectionRange(bubble.range);
          if (!selection) return;
          const end = selection.isBackward() ? selection.anchor : selection.focus;
          selection.anchor.set(end.key, end.offset, end.type);
          selection.focus.set(end.key, end.offset, end.type);
          $insertMarkdown(markdown);
          applied = true;
        }, { discrete: true });
        if (!applied) setError('Selection changed before the edit completed');
        return;
      }
      const replacement = result.replacement?.trim();
      if (!replacement) {
        setError('No local edit returned');
        return;
      }
      let applied = false;
      editor.update(() => {
        const selection = $tryRestoreSelectionRange(bubble.range);
        if (!selection) return;
        selection.insertText(replacement);
        applied = true;
      }, { discrete: true });
      if (!applied) setError('Selection changed before the edit completed');
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusyAction(null);
    }
  };

  const formatButton = (
    label: string,
    icon: LucideIcon,
    format: TextFormatType,
    active: boolean,
  ) => {
    const Icon = icon;
    return (
      <button
        key={label}
        type="button"
        className={active ? 'active' : ''}
        aria-label={label}
        title={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (!restore()) return;
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
        }}
      >
        <Icon size={14} />
      </button>
    );
  };

  return (
    <div
      ref={bubbleRef}
      className="novel-bubble-menu"
      data-placement={position.placement}
      data-positioned={position.visible ? 'true' : 'false'}
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible ? 'visible' : 'hidden',
      }}
    >
      {instructionOpen ? (
        <form
          className="novel-bubble-instruction"
          onSubmit={(event) => {
            event.preventDefault();
            const value = instruction.trim();
            if (!value) return;
            setInstructionOpen(false);
            void runAssist('agent_edit', value);
          }}
        >
          <input
            value={instruction}
            autoFocus
            aria-label="Local instruction for the selected text"
            placeholder="Instruction for the agent"
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setInstructionOpen(false);
            }}
          />
          <button type="submit" disabled={!instruction.trim()}>Apply</button>
        </form>
      ) : (
        <>
          {formatButton('Bold', Bold, 'bold', bubble.formatting.bold)}
          {formatButton('Italic', Italic, 'italic', bubble.formatting.italic)}
          {formatButton('Strikethrough', Strikethrough, 'strikethrough', bubble.formatting.strike)}
          {formatButton('Inline code', Braces, 'code', bubble.formatting.inlineCode)}
          <span className="novel-bubble-divider" aria-hidden="true" />
          <button
            type="button"
            aria-label="Copy"
            title="Copy"
            disabled={Boolean(busyAction)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setBusyAction('copy');
              void navigator.clipboard.writeText(bubble.context.selectedText)
                .catch(() => setError('Copy failed'))
                .finally(() => setBusyAction(null));
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
                disabled={Boolean(busyAction) || Boolean(selectionAssistDisabledReason)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void runAssist('optimize_expression')}
              >
                <Sparkles size={14} />
              </button>
              <button
                type="button"
                aria-label="Agent local edit"
                title={selectionAssistDisabledReason || 'Agent local edit · OpenAI (asks for confirmation)'}
                disabled={Boolean(busyAction) || Boolean(selectionAssistDisabledReason)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setInstruction('');
                  setInstructionOpen(true);
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
            disabled={Boolean(busyAction) || Boolean(selectionAssistDisabledReason)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void runAssist('comment_issue')}
          >
            <MessageSquareWarning size={14} />
          </button>
          <span className="novel-bubble-divider" aria-hidden="true" />
          <button
            type="button"
            className={bubble.formatting.link || linkOpen ? 'active' : ''}
            aria-label="Link"
            title={bubble.formatting.link ? 'Remove link' : 'Add link'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (bubble.formatting.link) controller.setLink(null, bubble.range);
              else {
                setHref('');
                setLinkOpen((current) => !current);
              }
            }}
          >
            <Link2 size={14} />
          </button>
          {linkOpen && (
            <form
              className="novel-bubble-link"
              onSubmit={(event) => {
                event.preventDefault();
                if (!href.trim()) return;
                controller.setLink(href.trim(), bubble.range);
                setHref('');
                setLinkOpen(false);
              }}
            >
              <input
                value={href}
                inputMode="url"
                autoComplete="url"
                autoFocus
                aria-label="Link destination"
                placeholder="Paste a URL"
                onChange={(event) => setHref(event.target.value)}
              />
              <button type="submit" disabled={!href.trim()}>Apply</button>
            </form>
          )}
        </>
      )}
      {error && <span className="novel-bubble-error">{error}</span>}
    </div>
  );
}
