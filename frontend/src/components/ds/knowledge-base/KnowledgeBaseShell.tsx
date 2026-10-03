// KnowledgeBaseShell — the Yuque-style 3-column reading layout.
//
//   ┌──────────────┬────────────────────────────────┬──────────────┐
//   │  BookNav     │  Centre content (scrollable)   │  DOMOutline  │
//   │  (sticky L)  │  - breadcrumb / title          │  (sticky R)  │
//   │              │  - body                        │              │
//   │              │  - ArticleFooter (at bottom)   │              │
//   │  WordCount   │                                │              │
//   └──────────────┴────────────────────────────────┴──────────────┘
//                                                      [👍] [💬]  ← EngagementFAB
//
// Desktop rails are sticky children of the shell's own grid, not viewport
// overlays. That keeps the reader chrome scoped to the article/idea body, so
// it cannot cover the global footer when the page scrolls past the content.
// Below `lg` the rails collapse to compact native navigation.
import React, { useState, useRef, useCallback } from 'react';
import { cn } from '../../../lib/utils';
import BookNav, { type BookNavChapter } from './BookNav';
import DOMOutline from './DOMOutline';
import EngagementFAB from './EngagementFAB';
import { Modal } from '../Modal';
import '../ContentOverlay.css';
import { BookOpen, Check, ChevronDown } from 'lucide-react';
import { useLanguage } from '../../LanguageContext';
import { scrollToAnchor } from '../../../lib/scrollToAnchor';

const MOBILE_OVERVIEW_ID = '__mobile_overview__';
const READER_MAX_WIDTH = '64rem';
const LEFT_RAIL_WIDTH = '16rem';
const OUTLINE_TRACK_MINIMUM = {
  collapsed: '3.5rem',
  expanded: '15rem',
} as const;

export interface KnowledgeBaseShellProps {
  // Left rail
  /**
   * Optional pinned-top item — the book's intro / overview page. Acts like a
   * normal chapter but renders with an icon (Lightbulb by default; pass a
   * custom one for non-Moment contexts, e.g. BookOpen for a Blog series).
   */
  overview?: {
    label: string;
    icon?: import('lucide-react').LucideIcon;
    onClick: () => void;
    isActive?: boolean;
  };
  chapters: BookNavChapter[];
  /**
   * Optional controlled current chapter. Omit to let the shell auto-detect
   * the chapter the reader is currently scrolled to (recommended for long
   * layouts where every chapter is rendered top-to-bottom).
   */
  currentChapterId?: string;
  wordCount?: number;
  showLeftRail?: boolean;

  // Centre
  children: React.ReactNode;
  /** Page identity spans the reader and outline, beside the full-height book rail. */
  header?: React.ReactNode;
  navigation?: React.ReactNode;
  contentClassName?: string;

  // Right rail Outline behaviour
  outlineContainerSelector?: string;
  outlineHeadingSelector?: string;
  outlineDefaultCollapsed?: boolean;

  // FAB
  likes?: number;
  commentsCount?: number;
  // CSS selector inside the body that the comment FAB scrolls to. Defaults
  // to `#kb-comments`, which ArticleFooter wraps the comments section in.
  commentsAnchor?: string;
}

const KnowledgeBaseShell: React.FC<KnowledgeBaseShellProps> = ({
  overview,
  chapters,
  currentChapterId,
  wordCount,
  showLeftRail = true,
  children,
  header,
  navigation,
  contentClassName,
  outlineContainerSelector,
  outlineHeadingSelector,
  outlineDefaultCollapsed = false,
  likes,
  commentsCount,
  commentsAnchor = '#kb-comments',
}) => {
  const centreRef = useRef<HTMLDivElement>(null);
  const [outlineCollapsed, setOutlineCollapsed] = useState(outlineDefaultCollapsed);
  const [headingCount, setHeadingCount] = useState(0);
  const hideOutline = Boolean(navigation) && headingCount === 0;
  const outlineMode = outlineCollapsed ? 'collapsed' : 'expanded';
  // Equal outer tracks center the bounded reader + outline as one unit.
  // The chapter rail keeps its full-height position at the page edge.
  const readerColumn = showLeftRail ? 3 : 2;
  const bodyRow = (header ? 2 : 1) + (navigation ? 1 : 0);
  const gridTemplateColumns = [
    ...(showLeftRail ? [LEFT_RAIL_WIDTH] : []),
    'minmax(0, 1fr)',
    `minmax(0, ${READER_MAX_WIDTH})`,
    hideOutline ? '0px' : OUTLINE_TRACK_MINIMUM[outlineMode],
    'minmax(0, 1fr)',
  ].join(' ');
  // Tab semantics: caller drives currentChapterId. Fall back to first chapter
  // so something is highlighted even before a click.
  const activeChapter = currentChapterId ?? chapters[0]?.id ?? '';
  const mobileChapter = overview?.isActive ? MOBILE_OVERVIEW_ID : activeChapter;
  const mobileOptions = [
    ...(overview ? [{ value: MOBILE_OVERVIEW_ID, label: overview.label }] : []),
    ...chapters.map((chapter) => ({ value: chapter.id, label: chapter.label })),
  ];
  const currentChapterIndex = chapters.findIndex((chapter) => chapter.id === mobileChapter);
  const currentChapterLabel = chapters[currentChapterIndex]?.label.replace(/^Episode\s+\d+\s*[-–—:]\s*/i, '');
  const showMobileChapterNav = showLeftRail && mobileOptions.length > 1;
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const chapterTrigger = useRef<HTMLButtonElement>(null);
  const { language } = useLanguage();
  const chapterPickerLabel = language === 'zh' ? '系列目录' : 'Series contents';
  const handleMobileChapterChange = (value: string) => {
    setChapterPickerOpen(false);
    if (value === MOBILE_OVERVIEW_ID) {
      overview?.onClick();
      return;
    }
    chapters.find((chapter) => chapter.id === value)?.onClick?.();
  };

  const handleBackToTop = useCallback(() => {
    const scrollRoot = document.querySelector<HTMLElement>('#browser-window');
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant' : 'smooth';
    (scrollRoot ?? window).scrollTo({ top: 0, behavior });
  }, []);

  const handleLikeClick = () => {
    scrollToAnchor('#kb-likes');
  };

  const handleCommentClick = () => {
    scrollToAnchor(commentsAnchor);
  };

  return (
    <>
      {showMobileChapterNav && (
        <nav data-ds aria-label={chapterPickerLabel}
          className="content-dark-overlay sticky top-0 z-20 px-4 lg:hidden">
          <button ref={chapterTrigger} type="button" aria-haspopup="dialog" aria-expanded={chapterPickerOpen}
            onClick={() => setChapterPickerOpen(true)}
            className="mx-auto flex min-h-11 w-full max-w-3xl items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary">
            <BookOpen className="size-4 shrink-0 text-[#ffad70]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ds-sm font-medium text-white">
              {overview?.label || mobileOptions.find((option) => option.value === mobileChapter)?.label}
            </span>
            {currentChapterIndex >= 0 && (
              <span className="flex min-w-0 max-w-[55%] items-center gap-1.5 text-ds-xs text-white/90">
                <span className="shrink-0 font-mono text-[#ffad70]">#{String(currentChapterIndex + 1).padStart(2, '0')}</span>
                <span className="truncate">{currentChapterLabel}</span>
              </span>
            )}
            <ChevronDown className="size-4 shrink-0 text-white/70" aria-hidden />
          </button>
          <Modal open={chapterPickerOpen} onClose={() => setChapterPickerOpen(false)}
            title={chapterPickerLabel} appearance="plain" density="compact" size="sm" placement="mobile-bottom" returnFocusRef={chapterTrigger}
            closeLabel={language === 'zh' ? '关闭目录' : 'Close contents'}>
            <div className="space-y-1">
              {mobileOptions.map((option) => {
                const selected = option.value === mobileChapter;
                const chapterIndex = chapters.findIndex((chapter) => chapter.id === option.value);
                return <button key={option.value} type="button" aria-current={selected ? 'page' : undefined}
                  onClick={() => handleMobileChapterChange(option.value)}
                  className={cn('flex min-h-11 w-full items-center gap-2 rounded-ds-sm px-2 py-2 text-left text-ds-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-primary', selected ? 'bg-ds-primary-soft font-semibold text-ds-primary' : 'text-ds-fg hover:bg-ds-surface-2')}>
                  <span className="w-6 shrink-0 text-ds-xs tabular-nums text-ds-fg-muted">{chapterIndex < 0 ? <BookOpen className="size-4" aria-hidden /> : String(chapterIndex + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 break-words leading-5">{chapterIndex < 0 ? option.label : option.label.replace(/^Episode\s+\d+\s*[-–—:]\s*/i, '')}</span>
                  {selected && <Check className="size-4 shrink-0" aria-hidden />}
                </button>;
              })}
            </div>
          </Modal>
        </nav>
      )}

      <div
        data-kb-shell
        data-outline-mode={outlineMode}
        className={cn(
          'lg:grid lg:min-h-[calc(100dvh-3.5rem)] lg:items-stretch',
          showLeftRail
            ? [
                // MainLayout supplies page padding. Reading shells with a
                // chapter rail are full reading surfaces, so their rails must
                // align to that surface edge instead of inheriting inner text
                // padding as a fake sidebar margin.
                'lg:relative lg:left-1/2 lg:w-[calc(100%+4rem)] lg:-translate-x-1/2',
                'xl:w-[calc(100%+4rem)]',
              ]
            : undefined,
        )}
        style={{ gridTemplateColumns, gridTemplateRows: `${header ? 'auto ' : ''}${navigation ? 'auto ' : ''}minmax(0, 1fr)` }}
      >
        {/* Left rail — book nav. Hidden below lg. Width matches Yuque
            (288px). Border is inline-styled because Tailwind's `border-r`
            was being reset to 0px by an upstream reset elsewhere in the
            project. */}
        {showLeftRail && (
          <aside
            data-kb-left-rail
            className={cn(
              'relative z-30 hidden self-stretch lg:block',
              'min-h-full',
              header && 'lg:col-start-1 lg:row-start-1 lg:row-span-2',
            )}
            style={{
              backgroundColor: 'var(--ds-color-surface-1)' ,
              borderRight: '1px solid var(--color-backgroundTertiary, #e5e5e5)',
            }}
          >
            <div className="sticky top-0 flex h-[calc(100dvh-3.5rem)] flex-col px-2 py-3">
              <BookNav
                overview={overview}
                chapters={chapters}
                currentId={activeChapter}
              />
              {typeof wordCount === 'number' && (
                <div
                  className={cn(
                    'pointer-events-none shrink-0 select-none px-2 pt-3',
                    'font-mono text-ds-2xs leading-[1.3] text-ds-fg-subtle',
                  )}
                >
                  {wordCount} Word
                </div>
              )}
            </div>
          </aside>
        )}

        {header && (
          <div
            data-kb-header
            className={cn('min-w-0 lg:row-start-1 lg:col-span-4', showLeftRail ? 'lg:col-start-2' : 'lg:col-start-1')}
          >
            {header}
          </div>
        )}

        {navigation && (
          <div className="sticky top-0 z-40 min-w-0" style={{ gridColumn: `${showLeftRail ? 2 : 1} / -1`, gridRow: header ? 2 : 1 }}>
            {navigation}
          </div>
        )}

        {/* Centre — flow content. */}
        <div data-kb-reader-track className="min-w-0" style={{ gridColumn: readerColumn, gridRow: bodyRow }}>
          <div
            ref={centreRef}
            className={cn(
              'mx-auto w-full px-5 py-6 sm:px-8 sm:py-8 lg:px-12',
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>

        {/* Right rail — outline. Hidden below lg. */}
        <aside
          data-kb-outline-rail
          style={{ gridColumn: readerColumn + 1, gridRow: bodyRow }}
          className={cn(
            'relative z-30 hidden lg:block',
            'min-h-full transition-[padding] duration-ds-base',
            hideOutline ? 'invisible overflow-hidden px-0' : outlineCollapsed ? 'px-2' : 'px-4 2xl:px-5',
          )}
        >
          <div
            data-outline-scroll
            className={cn(
              'no-scrollbar sticky overflow-y-auto',
              navigation ? 'top-11 max-h-[calc(100dvh-7rem)]' : 'top-0 max-h-[calc(100dvh-4rem)]',
              outlineCollapsed ? 'max-w-14' : 'max-w-[34rem]',
            )}
          >
            <DOMOutline
              containerSelector={outlineContainerSelector}
              headingSelector={outlineHeadingSelector}
              activeKey={activeChapter}
              onHeadingCountChange={setHeadingCount}
              collapsed={outlineCollapsed}
              onCollapsedChange={setOutlineCollapsed}
            />
          </div>
        </aside>
      </div>

      {/* Floating engagement pills */}
      {(typeof likes === 'number' || typeof commentsCount === 'number') && (
        <EngagementFAB
          onBackToTop={handleBackToTop}
          likes={likes}
          comments={commentsCount}
          onLikeClick={typeof likes === 'number' ? handleLikeClick : undefined}
          onCommentClick={typeof commentsCount === 'number' ? handleCommentClick : undefined}
        />
      )}
    </>
  );
};

export default KnowledgeBaseShell;
