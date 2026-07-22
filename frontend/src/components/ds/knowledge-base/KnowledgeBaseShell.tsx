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
import React, { useRef } from 'react';
import { cn } from '../../../lib/utils';
import BookNav, { type BookNavChapter } from './BookNav';
import DOMOutline from './DOMOutline';
import EngagementFAB from './EngagementFAB';
import { Select } from '../Controls';
import { scrollToAnchor } from '../../../lib/scrollToAnchor';

const MOBILE_OVERVIEW_ID = '__mobile_overview__';

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
  contentClassName?: string;

  // Right rail Outline behaviour
  outlineContainerSelector?: string;
  outlineHeadingSelector?: string;

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
  contentClassName,
  outlineContainerSelector,
  outlineHeadingSelector,
  likes,
  commentsCount,
  commentsAnchor = '#kb-comments',
}) => {
  const centreRef = useRef<HTMLDivElement>(null);
  // Tab semantics: caller drives currentChapterId. Fall back to first chapter
  // so something is highlighted even before a click.
  const activeChapter = currentChapterId ?? chapters[0]?.id ?? '';
  const mobileChapter = overview?.isActive ? MOBILE_OVERVIEW_ID : activeChapter;
  const mobileOptions = [
    ...(overview ? [{ value: MOBILE_OVERVIEW_ID, label: overview.label }] : []),
    ...chapters.map((chapter) => ({ value: chapter.id, label: chapter.label })),
  ];
  const showMobileChapterNav = showLeftRail && mobileOptions.length > 1;
  const handleMobileChapterChange = (value: string) => {
    if (value === MOBILE_OVERVIEW_ID) {
      overview?.onClick();
      return;
    }
    chapters.find((chapter) => chapter.id === value)?.onClick?.();
  };

  const handleLikeClick = () => {
    scrollToAnchor('#kb-likes');
  };

  const handleCommentClick = () => {
    scrollToAnchor(commentsAnchor);
  };

  return (
    <>
      {/* Compact chapter navigation below desktop breakpoints. A native
          select keeps long book titles usable and invokes the platform's
          accessible picker on touch devices. */}
      {showMobileChapterNav && (
        <nav
          data-ds
          aria-label="Reading sections"
          className="sticky top-0 z-20 border-b border-ds-border bg-ds-surface-1/92 px-4 py-2 backdrop-blur-md lg:hidden"
        >
          <div className="mx-auto max-w-3xl">
            <Select
              aria-label="Current reading section"
              size="sm"
              value={mobileChapter}
              options={mobileOptions}
              onChange={(event) => handleMobileChapterChange(event.target.value)}
              className="bg-transparent font-medium"
            />
          </div>
        </nav>
      )}

      <div
        className={cn(
          'lg:grid lg:min-h-[calc(100dvh-3.5rem)] lg:items-stretch',
          showLeftRail
            ? [
                'lg:grid-cols-[16.5rem_minmax(0,1fr)_15rem]',
                // MainLayout supplies page padding. Reading shells with a
                // chapter rail are full reading surfaces, so their rails must
                // align to that surface edge instead of inheriting inner text
                // padding as a fake sidebar margin.
                'lg:relative lg:left-1/2 lg:w-[calc(100%+4rem)] lg:-translate-x-1/2',
                'xl:w-[calc(100%+4rem)]',
              ]
            : 'lg:grid-cols-[minmax(0,1fr)_15rem]',
        )}
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
            )}
            style={{
              backgroundColor: 'var(--color-backgroundSecondary, #f5f5f5)',
              borderRight: '1px solid var(--color-backgroundTertiary, #e5e5e5)',
            }}
          >
            <div className="sticky top-0 flex max-h-dvh flex-col px-3.5 py-5">
              <BookNav
                overview={overview}
                chapters={chapters}
                currentId={activeChapter}
              />
              {typeof wordCount === 'number' && (
                <div
                  className={cn(
                    'pointer-events-none shrink-0 select-none px-2 pt-4',
                    'font-mono text-[10.5px] leading-5 text-ds-fg-subtle',
                  )}
                >
                  {wordCount} Word
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Centre — flow content. */}
        <div className="min-w-0">
          <div
            ref={centreRef}
            className={cn('mx-auto max-w-3xl py-6 sm:py-8 lg:px-10', contentClassName)}
          >
            {children}
          </div>
        </div>

        {/* Right rail — outline. Hidden below lg. */}
        <aside
          className={cn(
            'relative z-30 hidden lg:block',
            'min-h-full px-5',
          )}
        >
          <div className="sticky top-0 max-h-[calc(100dvh-4rem)] overflow-y-auto pt-6">
            <DOMOutline
              containerSelector={outlineContainerSelector}
              headingSelector={outlineHeadingSelector}
              activeKey={activeChapter}
            />
          </div>
        </aside>
      </div>

      {/* Floating engagement pills */}
      {(typeof likes === 'number' || typeof commentsCount === 'number') && (
        <EngagementFAB
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
