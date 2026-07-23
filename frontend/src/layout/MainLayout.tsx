import React, { ReactNode, useRef, useEffect, useLayoutEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import TopNavigation, { NavAfter, NavAvatar } from './TopNavigation';
import { useTheme } from '../components/ThemeContext';
import { useLanguage } from '../components/LanguageContext';
import { MobileTabBar } from '../components/ds';
import Footer from './Footer';

interface MainLayoutProps {
  children: ReactNode;
}

// Browser-style layout: a chrome bar (a back/forward/reload control
// capsule + the address bar) on a desk surface, with all page content
// inside a rounded "tab content" window — like a browser tab.
const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { colors, isDarkMode } = useTheme();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
  const isSearchRoute = normalizedPathname === '/search';
  // The progress bar is driven straight through a ref — writing `transform`
  // on every animation frame, never via React state, so scrolling does not
  // re-render MainLayout (and the heavy NoiseBackground) on every event.
  const progressRef = useRef<HTMLDivElement | null>(null);

  // The app scrolls inside the browser-window surface, not window. Route
  // changes therefore reset this owner once, centrally; page components do
  // not guess which scroll container happens to be active.
  useLayoutEffect(() => {
    document.getElementById('browser-window')?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

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
      className={[
        'relative flex w-full flex-col overflow-hidden',
        isSearchRoute ? 'h-[100svh] sm:h-dvh' : 'h-dvh',
      ].join(' ')}
      style={{ backgroundColor: deskBg }}
    >
      <a
        href="#browser-window"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('browser-window')?.focus();
        }}
        className="fixed left-4 top-2 z-60 -translate-y-16 rounded-ds-md bg-ds-fg px-4 py-2 text-ds-sm font-medium text-ds-bg shadow-ds-3 transition-transform focus:translate-y-0"
      >
        {language === 'zh' ? '跳到主要内容' : 'Skip to main content'}
      </a>

      {/* Desk material — plain neutral surface (deskBg). Per silan
          2026-05-22: drop the NUS-duo NoiseBackground entirely, the
          orange→blue gradient was competing with content. */}

      {/* ── Chrome bar ──
          Mobile (silan, 2026-05-22): the chrome was a crammed icon strip on
          narrow viewports — back/fwd/reload + page hops + tools all jostled
          the address bar down to a two-character label. Browsers have system
          back gestures and the page has a bottom action bar already, so on
          mobile we hide everything except the avatar + address bar and let
          TopNavigation own the row. Desktop (sm+) keeps the full chrome. */}
      <header
        className={[
          'relative z-10 flex-shrink-0 items-center gap-2 px-3 py-1.5 sm:gap-2.5 sm:px-4',
          isSearchRoute ? 'hidden sm:flex' : 'flex',
        ].join(' ')}
      >
        {/* Personal avatar — leads to the contact page */}
        <NavAvatar />

        {/* Left control capsule: back / forward / reload */}
        <div
          className="hidden flex-shrink-0 items-center gap-0.5 rounded-full p-1 sm:flex"
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

        {/* Desktop page shortcuts used to split around the active route here.
            That click-after navigation movement is disabled; the fixed
            desktop shortcut group now lives on the right side only. */}

        {/* Address bar — leads with the current page's icon */}
        <TopNavigation />

        {/* Pages ordered after the current one — desktop only. */}
        <div className="hidden sm:contents">
          <NavAfter />
        </div>
      </header>

      {/* ── Content window: the "browser tab" ── */}
      <motion.main
        id="browser-window"
        tabIndex={-1}
        aria-label={language === 'zh' ? '页面主要内容' : 'Page content'}
        className={[
          'relative z-10 flex-1 overflow-x-hidden overflow-y-auto',
          isSearchRoute
            ? 'mx-0 mb-0 rounded-none sm:mx-2 sm:mb-2 sm:rounded-xl'
            : 'mx-1.5 mb-1.5 rounded-xl sm:mx-2 sm:mb-2',
        ].join(' ')}
        style={{ backgroundColor: isSearchRoute ? undefined : windowBg }}
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

        {/* Content-window background — plain windowBg (set on motion.main).
            Per silan 2026-05-22: dropped the inner NoiseBackground too. */}

        <div className="relative z-10 mx-auto w-full max-w-full min-w-0 lg:px-8">
          {children}
        </div>
        {isSearchRoute ? <div className="hidden sm:block"><Footer /></div> : <Footer />}
      </motion.main>

      {/* Mobile-only glass dock — the primary nav on viewports where the
          desktop chrome capsules (NavBefore/NavAfter) are hidden. Purely
          `fixed` + z-40, floating above scrolling content like iOS's own
          floating tab bars — it never reserves layout space of its own. */}
      {!isSearchRoute && <MobileTabBar />}
    </div>
  );
};

export default MainLayout;
