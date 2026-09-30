import React from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { Moment } from '../../types/api';
import { canonicalInternalPath } from '../../utils/navigation';

function JumpLink({ moment, next, language }: { moment: Moment | null; next?: boolean; language: 'en' | 'zh' }) {
  const label = language === 'zh' ? (next ? '下一篇' : '上一篇') : (next ? 'Next' : 'Previous');
  const Icon = next ? ArrowRight : ArrowLeft;
  const content = <><span className="flex items-center gap-2 text-ds-xs text-ds-fg-muted"><Icon className="size-3.5" />{label}</span><span className="mt-1 block truncate text-ds-sm font-medium">{moment?.title || (language === 'zh' ? '没有更多动态' : 'No more moments')}</span></>;
  const classes = 'min-w-0 rounded-ds-sm px-3 py-2';
  return moment ? <Link to={canonicalInternalPath(`/moments/${encodeURIComponent(moment.slug || moment.id)}`)} className={`${classes} transition-colors hover:bg-ds-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary`}>{content}</Link> : <div aria-disabled="true" className={`${classes} opacity-40`}>{content}</div>;
}

export default function MomentJumpBar({ previous, next, language, visible }: {
  previous: Moment | null; next: Moment | null; language: 'en' | 'zh'; visible: boolean;
}) {
  if (!visible || (!previous && !next)) return null;
  return createPortal(
    <nav aria-label={language === 'zh' ? '底部动态跳转' : 'Moment quick navigation'}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 rounded-ds-lg border border-ds-border bg-ds-surface-1 p-1.5 text-ds-fg shadow-ds-2">
      <JumpLink moment={previous} language={language} />
      <button type="button" aria-label={language === 'zh' ? '回到顶部' : 'Back to top'} title={language === 'zh' ? '回到顶部' : 'Back to top'}
        className="rounded-full p-3 text-ds-fg-muted transition-colors hover:bg-ds-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary"
        onClick={() => document.getElementById('browser-window')?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>
        <ArrowUp className="size-4" />
      </button>
      <JumpLink moment={next} next language={language} />
    </nav>, document.body,
  );
}

/** The page owns scrolling; no polling or scroll listeners are needed on window. */
export function useMomentJumpBar(rail: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const root = document.getElementById('browser-window');
    const navigation = rail.current;
    if (!root || !navigation) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bounds = root.getBoundingClientRect();
      const target = navigation.getBoundingClientRect();
      const fullyVisible = target.top >= bounds.top && target.bottom <= bounds.bottom;
      setVisible(root.scrollTop > 48 && !fullyVisible);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    root.addEventListener('scroll', schedule, { passive: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(root); resize.observe(navigation);
    measure();
    return () => { root.removeEventListener('scroll', schedule); resize.disconnect(); cancelAnimationFrame(frame); };
  }, [rail]);
  return visible;
}
