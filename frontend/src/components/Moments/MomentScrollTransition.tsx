import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeft } from 'lucide-react';
import type { Moment } from '../../types/api';
import { canonicalInternalPath } from '../../utils/navigation';

import { markdownToPlainExcerpt } from '../../lib/markdown';

const THRESHOLD = 150;
type Gesture = { phase: 'idle' | 'pulling' | 'leaving'; distance: number; direction: 'previous' | 'next' };

/** Owns the end-of-page gesture, independent of the article and discussion. */
export default function MomentScrollTransition({ previous, next, ready, language, children }: {
  previous: Moment | null; next: Moment | null; ready: boolean; language: 'en' | 'zh'; children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const [gesture, setGesture] = React.useState<Gesture>({ phase: 'idle', distance: 0, direction: 'next' });
  const current = React.useRef<Gesture>(gesture);
  const target = gesture.direction === 'previous' ? previous : next;
  const destination = target ? canonicalInternalPath(`/moments/${encodeURIComponent(target.slug || target.id)}`) : gesture.direction === 'previous' && ready ? '/' : null;
  const update = React.useCallback((value: Gesture) => {
    current.current = value;
    setGesture(value);
  }, []);
  const finish = React.useCallback(() => {
    if (current.current.phase !== 'pulling') return;
    update(current.current.distance >= THRESHOLD
      ? { ...current.current, phase: 'leaving', distance: THRESHOLD }
      : { phase: 'idle', distance: 0, direction: 'next' });
  }, [update]);

  React.useEffect(() => {
    const root = document.getElementById('browser-window');
    if (!root || !ready) return;
    let releaseTimer = 0;
    let lastScroll = performance.now();
    let touchY: number | null = null;
    const atTop = () => root.scrollTop <= 3;
    const atBottom = () => root.scrollHeight - root.clientHeight - root.scrollTop <= 3;
    const interactive = (target: EventTarget | null) => target instanceof Element
      && Boolean(target.closest('input, textarea, button, a, video, [contenteditable="true"], [role="dialog"]'));
    const scroll = () => { lastScroll = performance.now(); };
    const pull = (distance: number, direction: 'previous' | 'next') => {
      if (current.current.phase === 'leaving') return;
      update({ phase: 'pulling', direction, distance: Math.min(THRESHOLD * 1.8, Math.max(0, distance)) });
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || interactive(event.target) || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (current.current.phase === 'leaving') return;
      const direction = event.deltaY < 0 ? 'previous' : 'next';
      const available = direction === 'previous' ? atTop() : next && atBottom();
      if (!available || !event.deltaY) {
        if (current.current.phase === 'pulling') update({ phase: 'idle', distance: 0, direction });
        return;
      }
      if (current.current.phase === 'idle' && performance.now() - lastScroll < 220) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1);
      pull((current.current.direction === direction ? current.current.distance : 0) + delta, direction);
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(finish, 160);
    };
    const touchStart = (event: TouchEvent) => {
      touchY = ((atTop()) || (next && atBottom())) && event.touches.length === 1 && !interactive(event.target)
        ? event.touches[0].clientY : null;
    };
    const touchMove = (event: TouchEvent) => {
      if (touchY === null || event.touches.length !== 1) return;
      const distance = touchY - event.touches[0].clientY;
      const direction = distance < 0 ? 'previous' : 'next';
      if (!(direction === 'previous' ? atTop() : next && atBottom())) {
        update({ phase: 'idle', distance: 0, direction });
        return;
      }
      event.preventDefault();
      pull(Math.abs(distance), direction);
    };
    const touchEnd = () => { touchY = null; finish(); };
    const cancel = () => {
      touchY = null;
      if (current.current.phase !== 'leaving') update({ phase: 'idle', distance: 0, direction: 'next' });
    };
    root.addEventListener('scroll', scroll, { passive: true });
    root.addEventListener('wheel', wheel, { passive: false });
    root.addEventListener('touchstart', touchStart, { passive: true });
    root.addEventListener('touchmove', touchMove, { passive: false });
    root.addEventListener('touchend', touchEnd);
    root.addEventListener('touchcancel', cancel);
    return () => {
      window.clearTimeout(releaseTimer);
      root.removeEventListener('scroll', scroll);
      root.removeEventListener('wheel', wheel);
      root.removeEventListener('touchstart', touchStart);
      root.removeEventListener('touchmove', touchMove);
      root.removeEventListener('touchend', touchEnd);
      root.removeEventListener('touchcancel', cancel);
    };
  }, [ready, next, finish, update]);

  const leaving = gesture.phase === 'leaving';
  const pullingPrevious = gesture.direction === 'previous' && gesture.phase !== 'idle';
  const sign = gesture.direction === 'previous' ? 1 : -1;
  return <motion.div
    initial={reducedMotion ? false : { opacity: 0, y: 28 }}
    animate={{
      opacity: leaving ? 0 : 1,
      y: reducedMotion ? 0 : leaving ? sign * 100 : sign * Math.min(88, gesture.distance * 0.4),
    }}
    transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
    onAnimationComplete={() => {
      if (current.current.phase === 'leaving' && destination) {
        navigate(destination);
        document.getElementById('browser-window')?.scrollTo({ top: 0, behavior: 'instant' });
      }
    }}>
    {ready && <motion.div
      initial={false}
      animate={{ height: pullingPrevious ? Math.min(220, gesture.distance * 1.3) : 0, opacity: pullingPrevious ? 1 : 0 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 28 }}
      aria-hidden={!pullingPrevious}
      className="mx-auto max-w-[52rem] overflow-hidden">
      <div className="border-b border-ds-border pb-5">
        {previous ? <>
        <div className="mb-3 flex items-center justify-between text-ds-sm text-ds-fg-muted">
          <span className="flex items-center gap-2"><ArrowLeft className="size-4" />{language === 'zh' ? '上一条' : 'Previous'}</span>
          <time dateTime={previous.date}>{previous.date}</time>
        </div>
        <h2 className="line-clamp-2 text-ds-xl font-semibold text-ds-fg">{previous.title}</h2>
        <p className="mt-2 line-clamp-2 text-ds-sm text-ds-fg-muted">{markdownToPlainExcerpt(previous.description, previous.title, 180)}</p>
        <p className="mt-3 text-ds-xs text-ds-fg-subtle" role="status">{gesture.distance >= THRESHOLD
          ? language === 'zh' ? '松开，阅读上一条' : 'Release to read the previous moment'
          : language === 'zh' ? '继续向上滑动，阅读上一条' : 'Scroll further to read the previous moment'}</p>
        </> : <>
          <h2 className="flex items-center gap-2 text-ds-xl font-semibold text-ds-fg"><ArrowLeft className="size-5" />{language === 'zh' ? '回到主页' : 'Back to home'}</h2>
          <p className="mt-2 text-ds-sm text-ds-fg-muted">{language === 'zh' ? '已经是最新一条动态' : 'You’re at the latest moment'}</p>
          <p className="mt-3 text-ds-xs text-ds-fg-subtle" role="status">{gesture.distance >= THRESHOLD
            ? language === 'zh' ? '松开，回到主页' : 'Release to go home'
            : language === 'zh' ? '继续向上滑动，回到主页' : 'Scroll further to go home'}</p>
        </>}
      </div>
    </motion.div>}
    {children}
    {next && <div className="mx-auto mt-8 max-w-[52rem] text-center text-ds-fg-muted">
      <ArrowDown className="mx-auto mb-2 size-4" aria-hidden />
      <p className="text-ds-xs" role="status">
        {gesture.direction === 'next' && gesture.distance >= THRESHOLD
          ? language === 'zh' ? '松开，阅读下一条' : 'Release to read the next moment'
          : language === 'zh' ? '继续向下滑动，阅读下一条' : 'Scroll further to read the next moment'}
      </p>
      <p className="mt-1 truncate text-ds-sm">{next.title}</p>
    </div>}
  </motion.div>;
}
