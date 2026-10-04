import { useCallback, useEffect, useState } from 'react';

export function useRocketFlight(onBackToTop: () => void) {
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

  const resetOnScroll = useCallback(() => setFlight(current => current.phase === 'arrived' ? { phase: 'idle' } : current), []);
  return { flight, launching, launch, resetOnScroll };
}
