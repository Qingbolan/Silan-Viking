import React, { ReactNode, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import TopNavigation, { NavBefore, NavAfter, NavAvatar } from './TopNavigation';
import { useTheme } from '../components/ThemeContext';

interface MainLayoutProps {
  children: ReactNode;
}

// Browser-style layout: a chrome bar (a back/forward/reload control
// capsule + the address bar) on a desk surface, with all page content
// inside a rounded "tab content" window — like a browser tab.
const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { colors, isDarkMode } = useTheme();
  const navigate = useNavigate();
  const [scrollProgress, setScrollProgress] = useState(0);

  // Layered graphite (dark) / paper (light): the desk is the deepest
  // layer, the content window sits a step above it.
  const deskBg = isDarkMode ? 'oklch(0.115 0.008 264)' : 'oklch(0.93 0 0)';
  const windowBg = isDarkMode ? 'oklch(0.165 0.010 264)' : 'oklch(1 0 0)';
  // Chrome capsules sit on the desk, lifted one more step + a faint shadow.
  const capsuleBg = isDarkMode ? 'oklch(0.21 0.012 264)' : 'oklch(1 0 0)';
  const hoverBg = isDarkMode ? 'oklch(0.27 0.014 264)' : 'oklch(0.95 0 0)';

  // Reading progress along the top edge of the content window.
  useEffect(() => {
    const el = document.getElementById('browser-window');
    if (!el) return;
    const onScroll = () => {
      const sh = el.scrollHeight - el.clientHeight;
      setScrollProgress(sh > 0 ? Math.min(100, Math.max(0, (el.scrollTop / sh) * 100)) : 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
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
      className="flex h-screen w-screen flex-col overflow-hidden"
      style={{ backgroundColor: deskBg }}
    >
      {/* ── Chrome bar ── */}
      <header className="flex flex-shrink-0 items-center gap-2.5 px-3 py-1.5 sm:px-4">
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
        className="relative mx-2 mb-2 flex-1 overflow-y-auto rounded-xl sm:mx-3 sm:mb-3"
        style={{ backgroundColor: windowBg }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Reading progress line */}
        <div className="sticky left-0 top-0 z-50 h-0.5 w-full">
          <div
            className="h-full transition-all duration-200 ease-out"
            style={{ width: `${scrollProgress}%`, backgroundColor: colors.primary }}
          />
        </div>

        <div className="mx-auto px-4 pb-16 pt-2 sm:px-6 lg:px-8">{children}</div>
      </motion.main>
    </div>
  );
};

export default MainLayout;
