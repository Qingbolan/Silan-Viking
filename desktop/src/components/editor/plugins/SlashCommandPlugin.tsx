import { INSERT_LAYOUT_PICKER, OPEN_MEDIA_SETTINGS, OPEN_MEDIA_GUIDE, REVIEW_UNWRAP_MEDIA } from '../media/MediaLayoutCommands';
import React from 'react';
import { createPortal } from 'react-dom';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type TextNode,
} from 'lexical';
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text';
import { $setBlocksType } from '@lexical/selection';
import { INSERT_CHECK_LIST_COMMAND } from '@lexical/list';
import { INSERT_TABLE_COMMAND } from '@lexical/table';
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/extension';
import {
  CalendarDays,
  CheckSquare,
  FileText,
  Sigma,
  Workflow,
  Hash,
  Heading2,
  Image,
  Link2,
  Minus,
  Quote,
  Table2,
} from 'lucide-react';
import type {
  MarkdownCommandContext,
  MarkdownSelectionRange,
  SlashCommandDefinition,
} from '../extensionPoints';
import { $insertMarkdown } from '../model/MarkdownDocument';
import {
  $captureSelectionRange,
  $restoreSelectionRange,
  $selectionRangeForTextNode,
} from '../model/SelectionRange';

function createCommandContext(
  editor: LexicalEditor,
  range: MarkdownSelectionRange,
): MarkdownCommandContext {
  const deleteTrigger = () => {
    editor.update(() => {
      $restoreSelectionRange(range).removeText();
    }, { discrete: true });
  };

  return {
    deleteTrigger,
    editor,
    insertMarkdown: (markdown) => {
      editor.update(() => {
        const selection = $restoreSelectionRange(range);
        selection.removeText();
        $insertMarkdown(markdown);
      }, { discrete: true });
    },
    range,
  };
}

function $selectionRangeForQuery(
  nodeToRemove: TextNode | null,
  matchingString: string,
): MarkdownSelectionRange | null {
  if (nodeToRemove) return $selectionRangeForTextNode(nodeToRemove);
  const range = $captureSelectionRange();
  if (!range || range.anchorType !== 'text' || range.anchorKey !== range.focusKey) return null;
  const triggerLength = matchingString.length + 1;
  return {
    ...range,
    anchorOffset: Math.max(0, range.anchorOffset - triggerLength),
  };
}

const transformAfterDeletingTrigger = (
  transform: () => void,
) => ({ editor, range }: MarkdownCommandContext) => {
  editor.update(() => {
    const selection = $restoreSelectionRange(range);
    selection.removeText();
    transform();
  }, { discrete: true });
};

function tableCommand(rows: number, columns: number): SlashCommandDefinition {
  return {
    id: `table-${rows}x${columns}`,
    title: `${rows} × ${columns} table`,
    description: `Insert a table with ${rows} rows and ${columns} columns.`,
    keywords: ['table', 'grid', `${rows}x${columns}`],
    icon: Table2,
    run: ({ editor, deleteTrigger }) => {
      deleteTrigger();
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        columns: String(columns),
        includeHeaders: { columns: false, rows: true },
        rows: String(rows),
      });
    },
  };
}

export const defaultSlashCommands: SlashCommandDefinition[] = [
  {
    id: 'media-layout-insert', title: '图片与视频布局', description: '导入媒体并创建可拖动布局。', keywords: ['media', 'layout', 'image', 'video', '图片', '布局'], icon: Image,
    run: ({ editor, deleteTrigger }) => { deleteTrigger(); editor.dispatchCommand(INSERT_LAYOUT_PICKER, undefined); },
  },
  {
    id: 'media-text-box', title: '文字布局框', description: '可调整宽度、环绕和多栏的文字框。', keywords: ['text', 'columns', '文字', '双栏'], icon: FileText,
    run: ({ insertMarkdown }) => insertMarkdown('<!-- vml {"v":2,"type":"text"} -->\n在此输入文字。\n<!-- /vml -->'),
  },
  ...[
    { id: 'media-layout-settings', title: '图文布局设置', command: OPEN_MEDIA_SETTINGS },
    { id: 'media-layout-examples', title: '图文布局功能示例', command: OPEN_MEDIA_GUIDE },
    { id: 'media-layout-unwrap-all', title: '移除当前文档全部布局…', command: REVIEW_UNWRAP_MEDIA },
  ].map(({ id, title, command }): SlashCommandDefinition => ({ id, title, description: 'Adjustable Media', keywords: ['media', 'layout', '布局'], icon: Image,
    run: ({ editor, deleteTrigger }) => { deleteTrigger(); editor.dispatchCommand(command, undefined); },
  })),
  {
    id: 'paragraph',
    title: 'Paragraph',
    description: 'Return the current block to body text.',
    keywords: ['normal', 'paragraph', 'body', 'text'],
    icon: FileText,
    run: transformAfterDeletingTrigger(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createParagraphNode());
    }),
  },
  {
    id: 'heading',
    title: 'Heading',
    description: 'Start a section title.',
    keywords: ['h2', 'heading', 'title', 'section'],
    icon: Heading2,
    run: transformAfterDeletingTrigger(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createHeadingNode('h2'));
    }),
  },
  {
    id: 'todo',
    title: 'Task',
    description: 'Add a checkbox action item.',
    keywords: ['todo', 'task', 'checkbox', 'action'],
    icon: CheckSquare,
    run: ({ editor, deleteTrigger }) => {
      deleteTrigger();
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
    },
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a quote or important sentence.',
    keywords: ['quote', 'blockquote', 'citation'],
    icon: Quote,
    run: transformAfterDeletingTrigger(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) $setBlocksType(selection, () => $createQuoteNode());
    }),
  },
  {
    id: 'event',
    title: 'Event record',
    description: 'Structured moment: what changed, evidence, next action.',
    keywords: ['event', 'moment', 'status', '记录', '事件'],
    icon: CalendarDays,
    run: ({ insertMarkdown }) => insertMarkdown(
      '## Event\n\n- Time: \n- What changed: \n- Evidence: \n- Next action: \n',
    ),
  },
  {
    id: 'decision',
    title: 'Decision',
    description: 'Record the choice, reason, and follow-up.',
    keywords: ['decision', 'decide', 'choice', '决定'],
    icon: FileText,
    run: ({ insertMarkdown }) => insertMarkdown(
      '## Decision\n\n- Decision: \n- Reason: \n- Tradeoff: \n- Follow-up: \n',
    ),
  },
  {
    id: 'internal-link',
    title: 'Internal link',
    description: 'Obsidian-style placeholder for linking knowledge.',
    keywords: ['link', 'wiki', 'obsidian', 'backlink', '双链'],
    icon: Link2,
    run: ({ insertMarkdown }) => insertMarkdown('[[Untitled]]'),
  },
  {
    id: 'tag',
    title: 'Tag',
    description: 'Add a lightweight knowledge tag.',
    keywords: ['tag', 'hash', 'label'],
    icon: Hash,
    run: ({ insertMarkdown }) => insertMarkdown('#topic '),
  },
  {
    id: 'math',
    title: 'Formula',
    description: 'Insert an editable LaTeX formula.',
    keywords: ['math', 'latex', 'equation', '公式'],
    icon: Sigma,
    run: ({ insertMarkdown }) => insertMarkdown('$$\nE = mc^2\n$$\n'),
  },
  {
    id: 'mermaid',
    title: 'Mermaid diagram',
    description: 'Insert an editable flowchart or diagram.',
    keywords: ['mermaid', 'diagram', 'flowchart', '图表', '流程图'],
    icon: Workflow,
    run: ({ insertMarkdown }) => insertMarkdown('```mermaid\nflowchart LR\n  A[Start] --> B[Done]\n```\n'),
  },
  tableCommand(3, 3),
  {
    id: 'divider',
    title: 'Divider',
    description: 'Separate two blocks.',
    keywords: ['hr', 'divider', 'line'],
    icon: Minus,
    run: ({ editor, deleteTrigger }) => {
      deleteTrigger();
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
    },
  },
  {
    id: 'image-prompt',
    title: 'Image prompt',
    description: 'Inline image-generation request block.',
    keywords: ['image', 'media', 'ai', 'generate'],
    icon: Image,
    run: ({ insertMarkdown }) => insertMarkdown(
      '```silan-ai-image\nprompt: \nstyle: editorial documentary\nratio: 1:1\n```\n',
    ),
  },
];

class SlashCommandOption extends MenuOption {
  readonly command: SlashCommandDefinition;

  constructor(command: SlashCommandDefinition) {
    super(command.id);
    this.command = command;
  }
}

function dynamicTableCommands(query: string | null): SlashCommandDefinition[] {
  const match = query?.match(/^([1-9]|1\d|20)x([1-9]|1\d|20)$/i);
  if (!match) return [];
  return [tableCommand(Number(match[1]), Number(match[2]))];
}

export function SlashCommandPlugin({
  commands,
  disabled,
}: {
  commands: readonly SlashCommandDefinition[];
  disabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = React.useState<string | null>(null);
  const trigger = useBasicTypeaheadTriggerMatch('/', { minLength: 0 });
  const options = React.useMemo(() => {
    if (disabled) return [];
    const normalizedQuery = query?.trim().toLocaleLowerCase() || '';
    const dynamic = dynamicTableCommands(normalizedQuery);
    const filtered = commands.filter((command) => (
      !normalizedQuery
      || command.title.toLocaleLowerCase().includes(normalizedQuery)
      || command.id.toLocaleLowerCase().includes(normalizedQuery)
      || command.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(normalizedQuery))
    ));
    const seen = new Set<string>();
    return [...dynamic, ...filtered]
      .filter((command) => {
        if (seen.has(command.id)) return false;
        seen.add(command.id);
        return true;
      })
      .map((command) => new SlashCommandOption(command));
  }, [commands, disabled, query]);

  const selectOption = React.useCallback((
    option: SlashCommandOption,
    nodeToRemove: TextNode | null,
    closeMenu: () => void,
    matchingString: string,
  ) => {
    const range = $selectionRangeForQuery(nodeToRemove, matchingString);
    if (!range) return;
    closeMenu();
    option.command.run(createCommandContext(editor, range));
    window.requestAnimationFrame(() => editor.focus());
  }, [editor]);

  if (disabled) return null;

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      anchorClassName="novel-slash-anchor"
      onQueryChange={setQuery}
      onSelectOption={selectOption}
      options={options}
      triggerFn={trigger}
      menuRenderFn={(anchorRef, {
        selectedIndex,
        selectOptionAndCleanUp,
        setHighlightedIndex,
      }, matchingString) => (
        anchorRef.current
          ? createPortal(
            <div className="novel-slash-menu" aria-label="Slash commands">
              <div className="novel-slash-query">
                <span>/</span>
                <strong>{matchingString ? `Commands matching “${matchingString}”` : 'Insert block'}</strong>
                <small>↑↓ move · Enter select · Esc close</small>
              </div>
              {options.length === 0 && (
                <div className="novel-slash-empty">No matching command.</div>
              )}
              {options.map((option, index) => {
                const Icon = option.command.icon;
                return (
                  <button
                    key={option.key}
                    ref={option.setRefElement}
                    type="button"
                    cmdk-item=""
                    role="option"
                    aria-selected={index === selectedIndex}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectOptionAndCleanUp(option);
                    }}
                  >
                    <Icon size={16} />
                    <span>
                      <strong>{option.command.title}</strong>
                      <small>{option.command.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>,
            anchorRef.current,
          )
          : null
      )}
    />
  );
}
