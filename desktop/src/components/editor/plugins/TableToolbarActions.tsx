import React from 'react';
import type { LexicalEditor } from 'lexical';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns3,
  Rows3,
  TableCellsMerge,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import {
  $readTableToolbarState,
  sameTableToolbarState,
  TableEditingController,
  type TableToolbarAction,
  type TableToolbarState,
} from '../interaction/TableEditingController';
import { readEditorSnapshot } from '../model/MarkdownDocument';

type TableToolbarButton = {
  action: TableToolbarAction;
  alignment?: 'left' | 'center' | 'right';
  dividerBefore?: boolean;
  icon: LucideIcon;
  label: string;
  danger?: boolean;
};

const buttons: TableToolbarButton[] = [
  { action: 'align-left', alignment: 'left', icon: AlignLeft, label: 'Align column left' },
  { action: 'align-center', alignment: 'center', icon: AlignCenter, label: 'Align column center' },
  { action: 'align-right', alignment: 'right', icon: AlignRight, label: 'Align column right' },
  { action: 'insert-row-above', dividerBefore: true, icon: ArrowUpToLine, label: 'Insert row above' },
  { action: 'insert-row-below', icon: ArrowDownToLine, label: 'Insert row below' },
  { action: 'insert-column-before', icon: ArrowLeftToLine, label: 'Insert column before' },
  { action: 'insert-column-after', icon: ArrowRightToLine, label: 'Insert column after' },
  { action: 'delete-row', dividerBefore: true, icon: Rows3, label: 'Delete selected row', danger: true },
  { action: 'delete-column', icon: Columns3, label: 'Delete selected column', danger: true },
  { action: 'delete-table', icon: Trash2, label: 'Delete table', danger: true },
];

export function useTableToolbar(editor: LexicalEditor | null) {
  const controller = React.useMemo(() => editor ? new TableEditingController(editor) : null, [editor]);
  const [state, setState] = React.useState<TableToolbarState | null>(() => controller?.readState() || null);

  React.useEffect(() => {
    if (!editor || !controller) { setState(null); return; }
    const update = (next: TableToolbarState | null) => {
      setState((current) => (sameTableToolbarState(current, next) ? current : next));
    };
    update(controller.readState());
    return editor.registerUpdateListener(({ editorState }) => {
      update(readEditorSnapshot(editor, editorState, $readTableToolbarState));
    });
  }, [controller, editor]);

  return { controller, state };
}

/** Table commands share the caret toolbar; they do not own a floating surface. */
export function TableToolbarActions({ controller, state }: { controller: TableEditingController; state: TableToolbarState }) {
  return (<>
      <span className="lexical-table-toolbar__context" title={`Row ${state.rowIndex + 1}/${state.rowCount} · Column ${state.columnIndex + 1}/${state.columnCount}`}>
        <TableCellsMerge size={14} />
        <span>
          R{state.rowIndex + 1}<i aria-hidden="true">·</i>C{state.columnIndex + 1}
        </span>
      </span>
      <span className="lexical-table-toolbar__divider" aria-hidden="true" />
      <div className="lexical-table-toolbar__actions">
        {buttons.map(({ action, alignment, danger, dividerBefore, icon: Icon, label }) => {
          const active = alignment === 'left'
            ? state.columnAlignment === null || state.columnAlignment === 'left'
            : alignment === state.columnAlignment;
          return (
          <React.Fragment key={action}>
            {dividerBefore && (
              <span className="lexical-table-toolbar__divider" aria-hidden="true" />
            )}
            <button
              type="button"
              className={active ? 'active' : ''}
              data-danger={danger ? 'true' : 'false'}
              aria-label={label}
              aria-pressed={alignment ? active : undefined}
              title={label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => controller.run(action)}
            >
              <Icon size={14} />
            </button>
          </React.Fragment>
          );
        })}
      </div>
  </>);
}
