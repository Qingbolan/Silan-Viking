// Floating reading shortcuts; engagement actions remain in ArticleFooter.
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ThumbsUp, MessageCircle, Rocket } from 'lucide-react';
import { cn } from '../../../lib/utils';
import './EngagementFAB.css';

interface EngagementFABProps {
  likes?: number;
  comments?: number;
  onLikeClick?: () => void;
  onCommentClick?: () => void;
  onBackToTop: () => void;
}

const formatCount = (n: number): string => (n >= 100 ? '99+' : String(n));

const FabPill: React.FC<{
  icon: React.ReactNode;
  count?: number;
  ariaLabel: string;
  onClick?: () => void;
}> = ({ icon, count, ariaLabel, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={ariaLabel}
    title={ariaLabel}
    className={cn(
      'group relative flex h-10 w-10 items-center justify-center rounded-full',
      'bg-ds-surface-1 text-ds-fg-muted shadow-ds-2',
      'border border-ds-border transition-all duration-150',
      'hover:-translate-y-0.5 hover:shadow-ds-3 hover:text-ds-fg active:scale-95',
    )}
  >
    {icon}
    {typeof count === 'number' && <span
      className={cn(
        'absolute -bottom-1 -right-1 min-w-[20px] rounded-full',
        'bg-ds-surface-1 px-1 text-center text-[10px] font-medium text-ds-fg-muted',
        'border border-ds-border',
      )}
    >
      {formatCount(count)}
    </span>}
  </button>
);

const EngagementFAB: React.FC<EngagementFABProps> = ({
  likes,
  comments,
  onLikeClick,
  onCommentClick,
  onBackToTop,
}) => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const reduceMotion = useReducedMotion();
  const [flight, setFlight] = useState<
    { phase: 'idle' } | { phase: 'launching' | 'arrived'; progress: number }
  >({ phase: 'idle' });
  const launching = flight.phase === 'launching';
  const launch = () => {
    if (!launching) setFlight({ phase: 'launching', progress: 0 });
  };

  useEffect(() => {
    if (!launching) return;
    const root = document.querySelector<HTMLElement>('#browser-window');
    const scroller = root ?? document.documentElement;
    const startTop = scroller.scrollTop;
    let frame = 0;
    let lastTop = startTop;
    let lastMovement = performance.now();
    const track = (now: number) => {
      const top = scroller.scrollTop;
      if (top <= 1) {
        setFlight({ phase: 'arrived', progress: 1 });
        return;
      }
      if (top !== lastTop) lastMovement = now;
      // Stop the flight when scrolling is interrupted or cannot advance.
      if (top > lastTop + 1 || now - lastMovement > 250) {
        setFlight({ phase: 'idle' });
        return;
      }
      lastTop = top;
      setFlight({ phase: 'launching', progress: Math.max(0, Math.min(1, 1 - top / startTop)) });
      frame = requestAnimationFrame(track);
    };
    onBackToTop();
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [launching, onBackToTop]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('#browser-window');
    const scroller = root ?? document.documentElement;
    const eventTarget = root ?? window;
    const updateVisibility = () => {
      const viewportHeight = root ? root.clientHeight : window.innerHeight;
      if (scroller.scrollTop > 160) {
        setFlight((current) => current.phase === 'arrived' ? { phase: 'idle' } : current);
      }
      setShowBackToTop(
        scroller.scrollHeight > viewportHeight + 1 && scroller.scrollTop > 160,
      );
    };
    eventTarget.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    const observer = new ResizeObserver(updateVisibility);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    updateVisibility();
    return () => {
      eventTarget.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      observer.disconnect();
    };
  }, []);

  return (
    // The mobile reading column uses the canonical ArticleFooter for these
    // actions; a second fixed stack would cover text. Desktop keeps the
    // shortcuts where the wider viewport has room for them.
    <div className="fixed bottom-6 right-6 z-30 hidden flex-col gap-3 sm:flex">
      <AnimatePresence initial={false}>
        {(showBackToTop || launching) && (
          <motion.div
            key="back-to-top"
            initial={{ opacity: 0, height: 0, marginBottom: -12, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, height: 40, marginBottom: 0, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: -12, y: reduceMotion ? 0 : 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
          >
            <FabPill
              icon={
                <span
                  className={cn('reading-rocket', launching && 'reading-rocket--launching')}
                  style={{
                    transform: reduceMotion ? undefined : `translateY(${-42 * (flight.phase === 'idle' ? 0 : flight.progress)}px)`,
                    opacity: flight.phase === 'arrived' ? 0 : 1,
                  }}
                  aria-hidden="true"
                >
                  <Rocket size={18} className="reading-rocket__ship" />
                  <span className="reading-rocket__exhaust" />
                </span>
              }
              ariaLabel="Back to top"
              onClick={launch}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {typeof likes === 'number' && (
        <FabPill
          icon={<ThumbsUp size={18} />}
          count={likes}
          ariaLabel="Likes"
          onClick={onLikeClick}
        />
      )}
      {typeof comments === 'number' && (
        <FabPill
          icon={<MessageCircle size={18} />}
          count={comments}
          ariaLabel="Comments"
          onClick={onCommentClick}
        />
      )}
    </div>
  );
};

export default EngagementFAB;
