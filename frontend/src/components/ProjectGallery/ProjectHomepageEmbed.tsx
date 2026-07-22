import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Monitor, RefreshCw } from 'lucide-react';
import { Button, Skeleton } from '../ds';
import { cn } from '../../lib/utils';

interface ProjectHomepageEmbedProps {
  url: string;
  title: string;
  description?: string;
  language: 'en' | 'zh';
  className?: string;
  immersive?: boolean;
}

const normalizeEmbedUrl = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const ProjectHomepageEmbed: React.FC<ProjectHomepageEmbedProps> = ({
  url,
  title,
  description,
  language,
  className,
  immersive = false,
}) => {
  const src = useMemo(() => normalizeEmbedUrl(url), [url]);
  const [frameKey, setFrameKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setTimedOut(false);
    const timer = window.setTimeout(() => {
      setTimedOut((current) => current || !loaded);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [frameKey, loaded, src]);

  const copy = language === 'zh'
    ? {
        label: '项目主页',
        loading: '正在加载项目主页',
        blockedTitle: '该站点可能禁止内嵌显示',
        blockedBody: '如果预览区域保持空白，请在新窗口打开项目主页。',
        open: '打开主页',
        reload: '重新加载',
      }
    : {
        label: 'Project home',
        loading: 'Loading project home',
        blockedTitle: 'This site may block embedded display',
        blockedBody: 'If the preview stays blank, open the project home in a new window.',
        open: 'Open home',
        reload: 'Reload',
      };

  if (!src) return null;

  return (
    <section id="project-home" className={cn('scroll-mt-24', className)} aria-labelledby="project-home-title">
      <div className={cn(
        'mb-4 flex gap-3',
        immersive ? 'justify-end' : 'flex-col sm:flex-row sm:items-end sm:justify-between',
      )}>
        {!immersive && (
          <div>
            <div className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
              <Monitor className="size-3.5" aria-hidden />
              {copy.label}
            </div>
            <h2 id="project-home-title" className="text-ds-2xl font-semibold tracking-[-0.02em] text-ds-fg">
              {title}
            </h2>
            {description && (
              <p className="mt-1 max-w-[56rem] text-ds-sm leading-6 text-ds-fg-muted">
                {description}
              </p>
            )}
          </div>
        )}
        {immersive && <h2 id="project-home-title" className="sr-only">{title}</h2>}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leadingIcon={<RefreshCw />}
            onClick={() => setFrameKey((value) => value + 1)}
          >
            {copy.reload}
          </Button>
          <a href={src} target="_blank" rel="noopener noreferrer">
            <Button size="sm" leadingIcon={<ExternalLink />}>
              {copy.open}
            </Button>
          </a>
        </div>
      </div>

      <div className={cn(
        'relative overflow-hidden border border-ds-border bg-ds-surface-2 shadow-ds-2',
        immersive ? 'rounded-ds-md' : 'rounded-ds-lg',
      )}>
        {!loaded && (
          <div className="absolute inset-0 z-10 bg-ds-surface-2 p-4" aria-label={copy.loading}>
            <Skeleton className="mb-4 h-8 w-48" />
            <Skeleton className="mb-3 h-5 w-2/3" />
            <Skeleton className="h-[28rem] w-full rounded-ds-md" />
          </div>
        )}
        {timedOut && (
          <div className="absolute inset-x-4 bottom-4 z-20 rounded-ds-md border border-ds-border bg-ds-surface-1/94 p-4 shadow-ds-2 backdrop-blur">
            <p className="text-ds-sm font-semibold text-ds-fg">{copy.blockedTitle}</p>
            <p className="mt-1 text-ds-xs leading-5 text-ds-fg-muted">{copy.blockedBody}</p>
          </div>
        )}
        <iframe
          key={frameKey}
          src={src}
          title={title}
          loading="lazy"
          sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
          onLoad={() => setLoaded(true)}
          className={cn(
            'w-full border-0 bg-white',
            immersive ? 'h-[calc(100dvh-16rem)] min-h-[42rem]' : 'h-[72dvh] min-h-[34rem]',
          )}
        />
      </div>
    </section>
  );
};

export default ProjectHomepageEmbed;
