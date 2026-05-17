import React, { ReactNode, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import TopNavigation, { NavBefore, NavAfter, NavAvatar } from './TopNavigation';
import { useTheme } from '../components/ThemeContext';
import { NoiseBackground } from '../components/ds';

interface MainLayoutProps {
  children: ReactNode;
}

// Browser-style layout: a chrome bar (a back/forward/reload control
// capsule + the address bar) on a desk surface, with all page content
// inside a rounded "tab content" window — like a browser tab.
const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { colors, isDarkMode } = useTheme();
  const navigate = useNavigate();
  // The progress bar is driven straight through a ref — writing `transform`
  // on every animation frame, never via React state, so scrolling does not
  // re-render MainLayout (and the heavy NoiseBackground) on every event.
  const progressRef = useRef<HTMLDivElement | null>(null);

  // Layered graphite (dark) / paper (light): the desk is the deepest
  // layer, the content window sits a step above it. The desk base stays
  // near-neutral; the NoiseBackground paints the NUS orange + blue glows
  // on top of it, one in each corner.
  const deskBg = isDarkMode ? 'oklch(0.125 0.006 264)' : 'oklch(0.935 0.004 264)';
  const windowBg = isDarkMode ? 'oklch(0.165 0.010 264)' : 'oklch(1 0 0)';
  // Chrome capsules sit on the desk, lifted one more step + a faint shadow.
  const capsuleBg = isDarkMode ? 'oklch(0.21 0.012 264)' : 'oklch(1 0 0)';
  const hoverBg = isDarkMode ? 'oklch(0.27 0.014 264)' : 'oklch(0.95 0 0)';

  // Reading progress along the top edge of the content window. The scroll
  // handler is throttled to one update per animation frame and writes the
  // bar's `transform` straight to the DOM — no React state, no re-render.
  useEffect(() => {
    const el = document.getElementById('browser-window');
    if (!el) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const bar = progressRef.current;
      if (!bar) return;
      const sh = el.scrollHeight - el.clientHeight;
      const ratio = sh > 0 ? Math.min(1, Math.max(0, el.scrollTop / sh)) : 0;
      bar.style.transform = `scaleX(${ratio})`;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    apply();
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // One control button inside the left control capsule.
  const ControlButton: React.FC<{
    label: string;
    onClick: () => void;
    children: React.ReactNode;
  }> = ({ label, onClick, children }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors"
      style={{ color: colors.textSecondary }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: deskBg }}
    >
      {/* Desk material — NUS orange (top-left) + NUS blue (bottom-right)
          glows over a Gaussian-noise grain, behind the chrome and content
          (z-0; the chrome and content window are lifted to z-10 below). */}
      <NoiseBackground glow="nus-duo" intensity={isDarkMode ? 0.08 : 0.06} />

      {/* ── Chrome bar ── */}
      <header className="relative z-10 flex flex-shrink-0 items-center gap-2.5 px-3 py-1.5 sm:px-4">
        {/* Personal avatar — leads to the contact page */}
        <NavAvatar />

        {/* Left control capsule: back / forward / reload */}
        <div
          className="flex flex-shrink-0 items-center gap-0.5 rounded-full p-1"
          style={{ backgroundColor: capsuleBg, boxShadow: colors.shadowSm }}
        >
          <ControlButton label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} />
          </ControlButton>
          <ControlButton label="Forward" onClick={() => navigate(1)}>
            <ArrowRight size={16} />
          </ControlButton>
          <ControlButton label="Reload" onClick={() => window.location.reload()}>
            <RotateCw size={14} />
          </ControlButton>
        </div>

        {/* Pages ordered before the current one */}
        <NavBefore />

        {/* Address bar — leads with the current page's icon */}
        <TopNavigation />

        {/* Pages ordered after the current one */}
        <NavAfter />
      </header>

      {/* ── Content window: the "browser tab" ── */}
      <motion.main
        id="browser-window"
        className="relative z-10 mx-1.5 mb-1.5 flex-1 overflow-y-auto rounded-xl sm:mx-2 sm:mb-2"
        style={{ backgroundColor: windowBg }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Reading progress line — a thin NUS-orange fill pinned to the top
            edge of the content window. A sticky 0-height anchor holds the
            bar so it never occupies layout space (no white seam, content
            still fills to the top); the bar overlays on z-50. */}
        <div className="pointer-events-none sticky left-0 top-0 z-50 h-0 w-full">
          <div
            ref={progressRef}
            className="absolute left-0 top-0 h-[3px] w-full origin-left"
            style={{
              transform: 'scaleX(0)',
              backgroundColor: 'var(--ds-color-primary)',
            }}
          />
        </div>

        {/* Content-window background — a faint NUS diffusion field pinned to
            the window viewport, so the content area itself carries the brand
            glow (not just the desk behind it). Kept low-intensity: this is
            a reading surface. A sticky 0-height anchor holds a fixed-size
            layer that tracks the window without scrolling with content. */}
        <div className="sticky left-0 top-0 z-0 h-0 w-full">
          <div className="absolute left-0 top-0 h-screen w-full overflow-hidden">
            <NoiseBackground
              glow="nus-duo"
              intensity={isDarkMode ? 0.05 : 0.035}
            />
          </div>
        </div>

        <div className="relative z-10 mx-auto px-4 pb-16 pt-2 sm:px-6 lg:px-8">
          {children}
        </div>
      </motion.main>
    </div>
  );
};

export default MainLayout;
