import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Home,
  Briefcase,
  Lightbulb,
  BookOpen,
  Mail,
  Globe,
  Sun,
  Moon,
  Search,
} from 'lucide-react';
import { useLanguage } from '../components/LanguageContext';
import { useTheme } from '../components/ThemeContext';
import GlobalSearch from '../components/Search/GlobalSearch';
import { usePageTitle, usePageSectionState, usePageFilterState } from './PageTitleContext';
import { isNavigationPathActive, primaryNavigationPath } from '../utils/navigation';
import { publicAssetUrl } from '../utils/publicAsset';

// ── Primary page routes ─────────────────────────────────────────────
interface Route {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const ROUTES = (zh: boolean): Route[] => [
  { path: '/',         label: zh ? '主页' : 'Home',     icon: <Home size={16} /> },
  { path: '/projects', label: zh ? '项目' : 'Projects', icon: <Briefcase size={16} /> },
  { path: '/ideas',    label: zh ? '想法' : 'Ideas',    icon: <Lightbulb size={16} /> },
  { path: '/blog',     label: zh ? '博客' : 'Blog',     icon: <BookOpen size={16} /> },
  { path: '/contact',  label: zh ? '联系' : 'Contact',  icon: <Mail size={16} /> },
];

/**
 * Standalone sub-pages that aren't in the primary nav but still need a
 * breadcrumb. Each maps its path to a parent route + a display label,
 * so the address bar can render e.g. `Home / Recent Moments`.
 */
const SUBROUTES = (zh: boolean): Record<string, { parent: string; label: string }> => ({
  '/moments': { parent: '/', label: zh ? '近期更新' : 'Recent Moments' },
  '/search': { parent: '/', label: zh ? '搜索结果' : 'Search Results' },
});

/**
 * Shared material tokens for every chrome-bar capsule.
 *
 * Capsules sit on the desk surface and read as one lifted material: a
 * surface a touch above the desk, carried by a faint shadow. Hover /
 * active backgrounds nudge from there. Keeping this in one place stops
 * the avatar, control, and nav capsules from drifting apart.
 */
const useChromeTokens = () => {
  const { isDarkMode } = useTheme();
  return useMemo(
    () => ({
      capsuleBg: isDarkMode ? 'oklch(0.21 0.012 264)' : 'oklch(1 0 0)',
      hoverBg: isDarkMode ? 'oklch(0.27 0.014 264)' : 'oklch(0.95 0 0)',
      activeBg: isDarkMode ? 'oklch(0.31 0.018 264)' : 'oklch(0.93 0.006 264)',
    }),
    [isDarkMode],
  );
};

/**
 * Splits the route list around the current page.
 *
 * The primary navigation renders as three capsule groups keyed off the
 * page you are on: the routes ordered *before* it, the current page
 * itself, and the routes *after* it. Walking the address bar forward is
 * the same as walking left-to-right across these groups.
 */
const useNavGroups = () => {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const zh = language === 'zh';
  const routes = useMemo(() => ROUTES(zh), [zh]);

  return useMemo(() => {
    const effectivePath = primaryNavigationPath(pathname);
    let idx = routes.findIndex((r) => isNavigationPathActive(effectivePath, r.path));
    if (idx < 0) idx = 0;
    return {
      before: routes.slice(0, idx),
      current: routes[idx],
      after: routes.slice(idx + 1),
      zh,
    };
  }, [routes, pathname, zh]);
};

/** One icon-only capsule group (the before / after segments). */
const NavGroup: React.FC<{ routes: Route[]; ariaLabel: string }> = ({ routes, ariaLabel }) => {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const { capsuleBg, hoverBg } = useChromeTokens();

  if (routes.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex flex-shrink-0 items-center gap-1 rounded-full p-1"
      style={{ backgroundColor: capsuleBg, boxShadow: colors.shadowSm }}
    >
      {routes.map((r) => (
        <button
          key={r.path}
          type="button"
          aria-label={r.label}
          title={r.label}
          onClick={() => navigate(r.path)}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors"
          style={{ color: colors.textSecondary }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = hoverBg;
            e.currentTarget.style.color = colors.textPrimary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = colors.textSecondary;
          }}
        >
          {r.icon}
        </button>
      ))}
    </nav>
  );
};

/** Routes ordered before the current page — far-left chrome capsule. */
export const NavBefore: React.FC = () => {
  const { before, zh } = useNavGroups();
  return <NavGroup routes={before} ariaLabel={zh ? '前面的页面' : 'Earlier pages'} />;
};

/** Routes ordered after the current page — far-right chrome capsule. */
export const NavAfter: React.FC = () => {
  const { after, zh } = useNavGroups();
  return <NavGroup routes={after} ariaLabel={zh ? '后面的页面' : 'Later pages'} />;
};

/**
 * Personal avatar — a fixed headshot acting as a brand mark.
 *
 * Sits at the leading edge of the chrome bar; clicking it navigates to
 * the contact page. The photo is served from `public/image.png`; if it
 * is missing, the button falls back to an initial so the chrome bar
 * never shows a broken image.
 */
export const NavAvatar: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { colors, isDarkMode } = useTheme();
  const { capsuleBg } = useChromeTokens();
  const zh = language === 'zh';

  const [imgOk, setImgOk] = useState(true);

  const fallbackBg = isDarkMode ? 'oklch(0.26 0.04 264)' : 'oklch(0.94 0.02 264)';
  const label = zh ? '关于我' : 'About me';

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => navigate('/contact')}
      className="group flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full p-[3px] transition-transform hover:scale-105"
      style={{ backgroundColor: capsuleBg, boxShadow: colors.shadowSm }}
    >
      <span
        className="flex h-full w-full items-center justify-center overflow-hidden rounded-full"
        style={{ backgroundColor: imgOk ? 'transparent' : fallbackBg }}
      >
        {imgOk ? (
          <img
            src={publicAssetUrl('/image.png')}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <span
            aria-hidden
            className="text-[13px] font-semibold leading-none"
            style={{ color: colors.accent }}
          >
            S
          </span>
        )}
      </span>
    </button>
  );
};

/** One hop in the address-bar trail. */
interface Crumb {
  /** Display text. */
  label: string;
  /** Where clicking the crumb navigates, or undefined for the leaf. */
  to?: string;
  /** Icon, shown only on the leading section crumb. */
  icon?: React.ReactNode;
}

/**
 * Smooth-scroll a section element into view.
 *
 * Page content scrolls inside the `#browser-window` container (see
 * MainLayout), not the window — so we scroll that element, offsetting
 * the target by its position relative to the container's scroll origin.
 */
const scrollToSection = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return;
  const container = document.getElementById('browser-window');
  if (container) {
    const top =
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      24;
    container.scrollTo({ top, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

/** One selectable row in a {@link MenuCrumb} dropdown. */
interface MenuCrumbItem {
  value: string;
  label: string;
  count?: number;
  /** 0 = top-level, 1 = indented child. */
  level?: number;
}

/**
 * A `#label` breadcrumb crumb backed by a dropdown menu.
 *
 * Used by the address bar for both the in-page `#section` anchor and
 * page-scoped `#filter` facets — the only difference is the items and
 * what selecting one does.
 */
const MenuCrumb: React.FC<{
  /** Text shown in accent colour after the `#`. */
  label: string;
  /** Menu rows. */
  items: MenuCrumbItem[];
  /** The value of the currently selected / active row, or null. */
  activeValue: string | null;
  /** Accessible name for the menu. */
  ariaLabel: string;
  onSelect: (value: string) => void;
}> = ({ label, items, activeValue, ariaLabel, onSelect }) => {
  const { colors, isDarkMode } = useTheme();
  const { hoverBg } = useChromeTokens();
  const reduceMotion = useReducedMotion();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click / Escape / route change.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <span ref={ref} className="relative flex flex-shrink-0 items-center gap-1">
      <span aria-hidden style={{ color: colors.textTertiary }}>
        /
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center rounded-full px-1.5 py-0.5 font-medium transition-colors"
        style={{ color: colors.accent }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <span aria-hidden style={{ opacity: 0.6 }}>#</span>
        <span className="max-w-[160px] truncate">{label}</span>
      </button>

      <AnimatePresence>
        {open && items.length > 0 && (
          <motion.ul
            role="listbox"
            aria-label={ariaLabel}
            className="absolute left-0 top-full z-50 mt-2 max-h-[60vh] min-w-[200px] overflow-y-auto rounded-xl p-1"
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={reduceMotion ? undefined : { duration: 0.16, ease: 'easeOut' }}
            style={{
              backgroundColor: isDarkMode ? 'oklch(0.21 0.012 264)' : 'oklch(1 0 0)',
              boxShadow: colors.shadowLg,
            }}
          >
            {items.map((it) => {
              const active = it.value === activeValue;
              return (
                <li key={it.value} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(it.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg py-1.5 pr-3 text-left transition-colors"
                    style={{
                      paddingLeft: it.level ? `${0.75 + it.level * 1}rem` : '0.75rem',
                      color: active ? colors.accent : colors.textSecondary,
                      backgroundColor: active ? hoverBg : 'transparent',
                      fontWeight: active ? 600 : 400,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.backgroundColor = hoverBg;
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span aria-hidden style={{ color: colors.textTertiary }}>#</span>
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.count !== undefined && (
                      <span className="text-xs" style={{ color: colors.textTertiary }}>
                        {it.count}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </span>
  );
};

/**
 * Browser-style address bar.
 *
 * Instead of a raw URL, the field shows a navigable breadcrumb trail:
 * the section the page belongs to, then — on a content detail page —
 * the content's own title (registered via {@link useSetPageTitle}), and
 * finally either the in-page `#section` the reader is on or a page-scoped
 * `#filter` facet, in accent colour. It tracks the route and scroll
 * position the way a real browser address bar tracks location. Search /
 * language / theme sit at the trailing edge as tool icons.
 */
const TopNavigation: React.FC = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const { colors, isDarkMode, toggleTheme } = useTheme();
  const zh = language === 'zh';

  const [searchOpen, setSearchOpen] = useState(false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  const routes = useMemo(() => ROUTES(zh), [zh]);
  const detailTitle = usePageTitle();
  const { sections, activeSectionId } = usePageSectionState();
  const pageFilter = usePageFilterState();

  const activeSection = useMemo(
    () => sections.find((s) => s.id === activeSectionId) ?? sections[0] ?? null,
    [sections, activeSectionId],
  );

  const isActive = useCallback(
    (path: string) => isNavigationPathActive(pathname, path),
    [pathname],
  );

  const section = useMemo(
    () => routes.find((r) => isActive(r.path)) ?? routes[0],
    [routes, isActive],
  );

  // Trail: leading section crumb, plus a sub-page crumb or — on a content
  // detail page — the content title.
  const crumbs = useMemo<Crumb[]>(() => {
    const subroute = SUBROUTES(zh)[pathname];
    const root = subroute
      ? routes.find((r) => r.path === subroute.parent) ?? section
      : section;

    const trail: Crumb[] = [
      {
        label: root.label,
        icon: root.icon,
        // The root crumb links back unless we are already on it.
        to: pathname === root.path ? undefined : root.path,
      },
    ];

    if (subroute) {
      // A standalone sub-page (e.g. /moments): show its own label.
      trail.push({ label: subroute.label });
    } else {
      // A detail route is the section path + one more segment (/blog/:id).
      const isDetail =
        (section.path !== '/' && pathname.startsWith(section.path + '/')) ||
        pathname.startsWith('/episodes/');
      if (isDetail) {
        trail.push({ label: detailTitle ?? (zh ? '加载中…' : 'Loading…') });
      }
    }
    return trail;
  }, [section, routes, pathname, detailTitle, zh]);

  // ⌘K / Ctrl+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const { capsuleBg: fieldBg, hoverBg } = useChromeTokens();

  // Trailing tool icon.
  const Tool: React.FC<{
    label: string;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
    buttonRef?: React.Ref<HTMLButtonElement>;
  }> = ({
    label,
    onClick,
    children,
    className,
    buttonRef,
  }) => (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors sm:h-7 sm:w-7 ${className ?? ''}`}
      style={{ color: colors.textSecondary }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );

  return (
    <>
      <div className="relative min-w-0 flex-1">
        {/* ── Address field ── */}
        <div
          className="flex items-center gap-1 rounded-full py-1 pl-1.5 pr-1.5"
          style={{ backgroundColor: fieldBg, boxShadow: colors.shadowSm }}
        >
          {/* Breadcrumb trail — section, then the content title on detail pages */}
          <nav
            aria-label={zh ? '当前位置' : 'Breadcrumb'}
            className="flex min-w-0 flex-1 items-center justify-center gap-1 px-3 py-0.5 text-[13px]"
          >
            {crumbs.map((c, i) => {
              const isLeaf = i === crumbs.length - 1;
              return (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <span aria-hidden className="flex-shrink-0" style={{ color: colors.textTertiary }}>
                      /
                    </span>
                  )}
                  {c.to ? (
                    <button
                      type="button"
                      onClick={() => navigate(c.to!)}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-full px-1 transition-colors [&_svg]:h-[14px] [&_svg]:w-[14px]"
                      style={{ color: colors.textTertiary }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = colors.accent)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = colors.textTertiary)}
                    >
                      {c.icon && <span aria-hidden className="flex">{c.icon}</span>}
                      <span>{c.label}</span>
                    </button>
                  ) : (
                    <span
                      aria-current={isLeaf ? 'page' : undefined}
                      className={`flex items-center gap-1.5 [&_svg]:h-[14px] [&_svg]:w-[14px] ${
                        isLeaf && crumbs.length > 1 ? 'min-w-0' : 'flex-shrink-0'
                      }`}
                      style={{
                        color: isLeaf ? colors.textPrimary : colors.textTertiary,
                        fontWeight: isLeaf && crumbs.length > 1 ? 500 : 400,
                      }}
                    >
                      {c.icon && <span aria-hidden className="flex flex-shrink-0">{c.icon}</span>}
                      <span className="truncate">{c.label}</span>
                    </span>
                  )}
                </React.Fragment>
              );
            })}

            {/* In-page section — a coloured #anchor crumb with a jump menu */}
            {activeSection && (
              <span className="hidden sm:contents">
                <MenuCrumb
                  label={activeSection.title}
                  ariaLabel={zh ? '跳转到章节' : 'Jump to section'}
                  items={sections.map((s) => ({ value: s.id, label: s.title }))}
                  activeValue={activeSection.id}
                  onSelect={scrollToSection}
                />
              </span>
            )}

            {/* Page-scoped filter — a coloured #facet crumb with a select menu */}
            {pageFilter && (
              <MenuCrumb
                label={
                  pageFilter.options.find((o) => o.value === pageFilter.activeValue)?.label ??
                  pageFilter.allLabel
                }
                ariaLabel={zh ? '筛选' : 'Filter'}
                items={[
                  { value: '', label: pageFilter.allLabel },
                  ...pageFilter.options.map((o) => ({
                    value: o.value,
                    label: o.label,
                    count: o.count,
                    level: o.level,
                  })),
                ]}
                activeValue={pageFilter.activeValue ?? ''}
                onSelect={(v) => pageFilter.onSelect(v === '' ? null : v)}
              />
            )}
          </nav>

          {/* Tools */}
          <div className="flex flex-shrink-0 items-center">
            <Tool buttonRef={searchTriggerRef} label={zh ? '搜索' : 'Search'} onClick={() => setSearchOpen(true)}>
              <Search size={15} />
            </Tool>
            <Tool
              className="hidden sm:flex"
              label={zh ? '切换语言' : 'Toggle language'}
              onClick={() => setLanguage(zh ? 'en' : 'zh')}
            >
              <Globe size={15} />
            </Tool>
            <Tool
              className="hidden sm:flex"
              label={zh ? '切换主题' : 'Toggle theme'}
              onClick={toggleTheme}
            >
              {isDarkMode ? <Sun size={15} /> : <Moon size={15} />}
            </Tool>
          </div>
        </div>
      </div>

      <GlobalSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        returnFocusRef={searchTriggerRef}
      />
    </>
  );
};

export default TopNavigation;
