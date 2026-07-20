import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText, FolderGit2 } from 'lucide-react';
import type { MomentRelatedOutput } from '../../types/api';
import { cn } from '../../lib/utils';

interface MomentRelatedOutputsProps {
  outputs: MomentRelatedOutput[];
  labels: {
    title: string;
    kinds: Record<MomentRelatedOutput['kind'], string>;
  };
  className?: string;
}

const iconByKind = {
  blog: FileText,
  project: FolderGit2,
} as const;

const MomentRelatedOutputs: React.FC<MomentRelatedOutputsProps> = ({
  outputs,
  labels,
  className,
}) => {
  if (!outputs.length) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="font-mono text-ds-xs font-semibold uppercase tracking-[0.12em] text-ds-fg-subtle">
        {labels.title}
      </div>
      <div className="grid gap-2">
        {outputs.map((output) => {
          const Icon = iconByKind[output.kind];
          return (
            <Link
              key={`${output.kind}-${output.id}`}
              to={output.path}
              className="group grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] border border-ds-border bg-ds-surface-1 px-3 py-2.5 outline-none transition-[border-color,background-color,box-shadow] hover:border-ds-border-strong hover:bg-ds-surface-2 focus-visible:shadow-ds-focus"
            >
              <span className="flex size-9 items-center justify-center rounded-[6px] bg-ds-surface-3 text-ds-fg-muted">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="mb-0.5 flex items-center gap-1.5 text-ds-xs font-medium text-ds-primary">
                  {labels.kinds[output.kind]}
                  {output.relation && (
                    <span className="truncate font-normal text-ds-fg-subtle">/ {output.relation}</span>
                  )}
                </span>
                <span className="block truncate text-ds-sm font-semibold text-ds-fg group-hover:text-ds-primary">
                  {output.title}
                </span>
                {output.description && (
                  <span className="mt-0.5 line-clamp-1 block text-ds-xs leading-5 text-ds-fg-muted">
                    {output.description}
                  </span>
                )}
              </span>
              <ArrowUpRight className="size-3.5 text-ds-fg-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ds-primary" aria-hidden />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default MomentRelatedOutputs;
