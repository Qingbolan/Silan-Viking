import { ExternalLink, FileText, Github, Globe2, BookOpen, Link2, Paperclip } from 'lucide-react';
import { Badge } from '../../ds/Badge';
import type { BlogResource } from '../types/blog';

const resourcePriority: Record<string, number> = { paper: 0, website: 1, github: 2, documentation: 3, doi: 4 };

const resourceIcons = { github: Github, paper: FileText, doi: FileText, website: Globe2, documentation: BookOpen };

export function ArticleResourceStrip({
  projectName,
  publicationVenue,
  resources,
  language,
}: {
  projectName?: string;
  publicationVenue?: string;
  resources: BlogResource[];
  language: string;
}) {
  if (!projectName && !publicationVenue && resources.length === 0) return null;

  const orderedResources = [...resources].sort((a, b) =>
    (resourcePriority[a.kind] ?? 5) - (resourcePriority[b.kind] ?? 5),
  );

  return (
    <aside
      data-ds
      aria-label={language === 'zh' ? '文章外部资源' : 'Article resources'}
      className="space-y-2 rounded-ds-md bg-ds-surface-2 p-3"
    >
      {(projectName || publicationVenue) && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Paperclip className="size-4 text-ds-primary" aria-hidden />
          {projectName && <strong className="text-ds-base font-semibold tracking-tight text-ds-fg">{projectName}</strong>}
          {publicationVenue && <Badge tone="neutral" size="sm">{publicationVenue}</Badge>}
        </div>
      )}
      {resources.length > 0 && (
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
          {orderedResources.map((resource) => {
            const Icon = resourceIcons[resource.kind as keyof typeof resourceIcons] ?? Link2;
            return (
              <a
                key={`${resource.kind}:${resource.url}`}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ds-hairline group flex min-w-0 items-center gap-2 rounded-ds-sm bg-ds-surface-1 px-3 py-2 text-ds-fg transition-colors hover:text-ds-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Icon className="size-4 shrink-0 text-ds-fg-muted group-hover:text-ds-primary" aria-hidden />
                <span className="min-w-0 flex-1 break-words text-ds-sm font-normal leading-5">{resource.label}</span>
                <ExternalLink className="size-3 shrink-0 text-ds-fg-subtle" aria-hidden />
              </a>
            );
          })}
        </div>
      )}
    </aside>
  );
}
