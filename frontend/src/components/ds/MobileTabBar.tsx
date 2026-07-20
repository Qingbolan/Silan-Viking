// src/components/ds/MobileTabBar.tsx
//
// Mobile-only bottom tab bar — an iOS-style floating Liquid Glass dock.
// Desktop keeps the browser-chrome nav capsules in TopNavigation; on
// narrow viewports those hide (see MainLayout) and this dock is the only
// primary navigation.
//
// Shows a restrained 3 core destinations + a "More" tab that expands the
// rest in a glass sheet — mirroring how iOS system apps (Files, App Store)
// keep a tab bar to a handful of items instead of cramming every route in.
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Home,
  Briefcase,
  Aperture,
  BookOpen,
  Mail,
  MoreHorizontal,
  X,
  Globe,
  Moon,
  Sun,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useTheme } from '../ThemeContext';
import { cn } from '../../lib/utils';
import { dsRoot } from './dsAttr';
import { isNavigationPathActive } from '../../utils/navigation';

interface TabRoute {
  path: string;
  label: string;
  icon: React.ReactNode;
}

// The 3 destinations that stay pinned in the dock.
const PRIMARY_ROUTES = (zh: boolean): TabRoute[] => [
  { path: '/', label: zh ? '主页' : 'Home', icon: <Home size={18} strokeWidth={2} /> },
  { path: '/projects', label: zh ? '项目' : 'Projects', icon: <Briefcase size={18} strokeWidth={2} /> },
  { path: '/blog', label: zh ? '博客' : 'Blog', icon: <BookOpen size={18} strokeWidth={2} /> },
];

// Everything else, revealed through the "More" sheet.
const MORE_ROUTES = (zh: boolean): TabRoute[] => [
  { path: '/moments', label: zh ? '瞬间' : 'Moments', icon: <Aperture size={18} strokeWidth={2} /> },
  { path: '/contact', label: zh ? '联系' : 'Contact', icon: <Mail size={18} strokeWidth={2} /> },
];

/** One dock slot — icon-only, with a floating active pill behind it. */
const TabSlot: React.FC<{
  route: TabRoute;
  active: boolean;
  onClick: () => void;
  reduceMotion: boolean | null;
}> = ({ route, active, onClick, reduceMotion }) => (
  <button
    type="button"
    aria-label={route.label}
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
    className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center active:scale-[0.94] transition-transform duration-ds-fast"
  >
    {active && (
      <motion.span
        layoutId={reduceMotion ? undefined : 'mobile-tab-active-pill'}
        className="absolute inset-0 rounded-full bg-ds-primary/15"
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      />
    )}
    <span
      className={cn(
        'relative z-10 transition-colors duration-ds-fast',
        active ? 'text-ds-primary' : 'text-ds-fg-subtle',
      )}
    >
      {route.icon}
    </span>
  </button>
);

export const MobileTabBar: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { isDarkMode, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const zh = language === 'zh';
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryRoutes = PRIMARY_ROUTES(zh);
  const moreRoutes = MORE_ROUTES(zh);
  const moreActive = moreRoutes.some((r) => isNavigationPathActive(pathname, r.path));

  // Close the sheet on navigation (own route change, not just More items).
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/20 sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setMoreOpen(false)}
              aria-hidden
            />
            <motion.div
              {...dsRoot}
              role="menu"
              aria-label={zh ? '更多页面' : 'More pages'}
              // Same left-1/2 centering axis as the dock below, so the sheet
              // reads as one glass body extending upward from it rather than
              // a second, independently-positioned panel.
              className="ds-liquid-glass fixed bottom-[5.25rem] left-1/2 z-40 w-52 origin-bottom rounded-ds-xl p-1.5 sm:hidden"
              // Motion writes an inline transform for y/scale. Keep the
              // centering x in the same state, otherwise that inline value
              // replaces Tailwind's -translate-x-1/2 and shifts the sheet.
              initial={reduceMotion ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: 6, scale: 0.95 }}
              animate={reduceMotion ? { opacity: 1, x: '-50%' } : { opacity: 1, x: '-50%', y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-50%', y: 6, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            >
              {moreRoutes.map((route) => {
                const active = isNavigationPathActive(pathname, route.path);
                return (
                  <button
                    key={route.path}
                    type="button"
                    role="menuitem"
                    onClick={() => navigate(route.path)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-ds-lg px-3 py-2 text-left transition-colors duration-ds-fast',
                      active ? 'text-ds-primary' : 'text-ds-fg',
                      'active:bg-ds-surface-2/60',
                    )}
                  >
                    <span className={active ? 'text-ds-primary' : 'text-ds-fg-subtle'}>
                      {route.icon}
                    </span>
                    <span className="text-sm font-medium">{route.label}</span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-ds-border" role="separator" />
              <button
                type="button"
                role="menuitem"
                onClick={() => setLanguage(zh ? 'en' : 'zh')}
                className="flex w-full items-center gap-2.5 rounded-ds-lg px-3 py-2 text-left text-ds-fg transition-colors duration-ds-fast active:bg-ds-surface-2/60"
              >
                <Globe size={18} className="text-ds-fg-subtle" />
                <span className="text-sm font-medium">{zh ? 'English' : '中文'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={toggleTheme}
                className="flex w-full items-center gap-2.5 rounded-ds-lg px-3 py-2 text-left text-ds-fg transition-colors duration-ds-fast active:bg-ds-surface-2/60"
              >
                {isDarkMode ? (
                  <Sun size={18} className="text-ds-fg-subtle" />
                ) : (
                  <Moon size={18} className="text-ds-fg-subtle" />
                )}
                <span className="text-sm font-medium">
                  {zh ? (isDarkMode ? '浅色模式' : '深色模式') : isDarkMode ? 'Light mode' : 'Dark mode'}
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav
        {...dsRoot}
        aria-label={zh ? '主导航' : 'Primary navigation'}
        className="ds-liquid-glass fixed bottom-3 left-1/2 z-40 flex w-fit -translate-x-1/2 items-center gap-0.5 rounded-full px-1 py-1 sm:hidden"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
      >
        {primaryRoutes.map((route) => (
          <TabSlot
            key={route.path}
            route={route}
            active={isNavigationPathActive(pathname, route.path)}
            onClick={() => navigate(route.path)}
            reduceMotion={reduceMotion}
          />
        ))}

        {/* More — toggles the sheet above; itself becomes "active" (an X)
            while open, and picks up the active tint if the current route
            lives inside the sheet. */}
        <button
          type="button"
          aria-label={zh ? '更多' : 'More'}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((v) => !v)}
          className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center active:scale-[0.94] transition-transform duration-ds-fast"
        >
          {(moreActive || moreOpen) && (
            <motion.span
              layoutId={reduceMotion ? undefined : 'mobile-tab-active-pill'}
              className="absolute inset-0 rounded-full bg-ds-primary/15"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <span
            className={cn(
              'relative z-10 transition-colors duration-ds-fast',
              moreActive || moreOpen ? 'text-ds-primary' : 'text-ds-fg-subtle',
            )}
          >
            {moreOpen ? <X size={18} strokeWidth={2} /> : <MoreHorizontal size={18} strokeWidth={2} />}
          </span>
        </button>
      </nav>
    </>
  );
};
