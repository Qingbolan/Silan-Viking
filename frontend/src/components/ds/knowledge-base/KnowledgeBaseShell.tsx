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

const MOBILE_OVERVIEW_ID = '__mobile_overview__';

export interface KnowledgeBaseShellProps {
  // Left rail
  /**
   * Optional pinned-top item — the book's intro / overview page. Acts like a
   * normal chapter but renders with an icon (Lightbulb by default; pass a
   * custom one for non-Idea contexts, e.g. BookOpen for a Blog series).
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

  // Centre
  children: React.ReactNode;

  // Right rail Outline behaviour
  outlineContainerSelector?: string;

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
  children,
  outlineContainerSelector,
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
  const handleMobileChapterChange = (value: string) => {
    if (value === MOBILE_OVERVIEW_ID) {
      overview?.onClick();
      return;
    }
    chapters.find((chapter) => chapter.id === value)?.onClick?.();
  };

  const handleLikeClick = () => {
    const el = document.querySelector('#kb-likes');
    if (!el) return;
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) {
      const top = (el as HTMLElement).getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - 24;
      scrollRoot.scrollTo({ top, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCommentClick = () => {
    const el = document.querySelector(commentsAnchor);
    if (!el) return;
    const scrollRoot = document.querySelector('#browser-window') as HTMLElement | null;
    if (scrollRoot) {
      const top = (el as HTMLElement).getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - 24;
      scrollRoot.scrollTo({ top, behavior: 'smooth' });
    } else {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Compact chapter navigation below desktop breakpoints. A native
          select keeps long book titles usable and invokes the platform's
          accessible picker on touch devices. */}
      {mobileOptions.length > 1 && (
        <nav
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

      <div className="lg:grid lg:grid-cols-[18rem_minmax(0,1fr)_15rem]">
        {/* Left rail — book nav. Hidden below lg. Width matches Yuque
            (288px). Border is inline-styled because Tailwind's `border-r`
            was being reset to 0px by an upstream reset elsewhere in the
            project. */}
        <aside
          data-kb-left-rail
          className={cn(
            'relative z-30 hidden bg-ds-surface-1 lg:block',
            'min-h-full',
          )}
          style={{ borderRight: '1px solid var(--color-backgroundTertiary, #e5e5e5)' }}
        >
          <div className="sticky top-0 flex max-h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)] flex-col">
            <BookNav
              overview={overview}
              chapters={chapters}
              currentId={activeChapter}
            />
            {typeof wordCount === 'number' && (
              <div
                className={cn(
                  'pointer-events-none shrink-0 select-none px-4 pb-3 pt-2',
                  'font-mono text-[12px] text-ds-fg-subtle',
                )}
              >
                {wordCount} Word
              </div>
            )}
          </div>
        </aside>

        {/* Centre — flow content. */}
        <div className="min-w-0">
          <div ref={centreRef} className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-10">
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
            <DOMOutline containerSelector={outlineContainerSelector} activeKey={activeChapter} />
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
