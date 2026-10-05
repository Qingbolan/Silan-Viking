import { Columns2, Eye, PencilLine } from 'lucide-react';
import {
  nextMarkdownWorkspaceView,
  type MarkdownWorkspaceView,
} from '../lib/markdownWorkspaceView';

const viewPresentation: Record<
  MarkdownWorkspaceView,
  { label: string; description: string; Icon: typeof PencilLine }
> = {
  edit: { label: 'Edit', description: 'Rich editing', Icon: PencilLine },
  split: { label: 'Split', description: 'Markdown source and preview', Icon: Columns2 },
  preview: { label: 'Preview', description: 'Rendered preview', Icon: Eye },
};

type MarkdownWorkspaceViewToggleProps = {
  view: MarkdownWorkspaceView;
  className?: string;
  /** Render the current view name next to the icon. */
  showLabel?: boolean;
  onChange: (view: MarkdownWorkspaceView) => void;
};

export function MarkdownWorkspaceViewToggle({
  view,
  className,
  showLabel = false,
  onChange,
}: MarkdownWorkspaceViewToggleProps) {
  const current = viewPresentation[view];
  const nextView = nextMarkdownWorkspaceView(view);
  const next = viewPresentation[nextView];
  const { Icon } = current;

  return (
    <button
      type="button"
      className={className}
      data-view={view}
      onClick={() => onChange(nextView)}
      title={`${current.label} view · switch to ${next.label}`}
      aria-label={`${current.description} view. Switch to ${next.label} view`}
    >
      <Icon size={15} />
      {showLabel && <span>{current.label} view</span>}
    </button>
  );
}
