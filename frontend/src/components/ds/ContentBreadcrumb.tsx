import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Shared hierarchy for article and Moment detail pages. */
export function ContentBreadcrumb({ title, language, parent, centered = false, className }: {
  title: string; language: string; parent: { label: string; to: string }; centered?: boolean; className?: string;
}) {
  const linkClass = 'rounded-ds-xs transition-colors hover:text-ds-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';
  return <nav aria-label={language === 'zh' ? '面包屑导航' : 'Breadcrumb'} className={cn('text-ds-sm text-ds-fg-muted', className)}>
    <ol className={cn('flex min-w-0 items-center gap-2', centered ? 'flex-wrap justify-center' : '')}>
      <li className="shrink-0"><Link className={linkClass} to="/">{language === 'zh' ? '首页' : 'Home'}</Link></li>
      <li aria-hidden="true"><ChevronRight className="size-3.5 text-ds-primary" /></li>
      <li className="shrink-0"><Link className={linkClass} to={parent.to}>{parent.label}</Link></li>
      <li aria-hidden="true"><ChevronRight className="size-3.5 text-ds-primary" /></li>
      <li aria-current="page" className={cn('min-w-0 text-ds-fg', centered ? 'max-w-full break-words' : 'truncate')}>{title}</li>
    </ol>
  </nav>;
}
