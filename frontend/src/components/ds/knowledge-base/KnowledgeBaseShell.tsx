// KnowledgeBaseShell — the Yuque-style 3-column reading layout.
//
//   ┌──────────────┬────────────────────────────────┬──────────────┐
//   │  BookNav     │  Centre content (scrollable)   │  DOMOutline  │
//   │  (fixed L)   │  - breadcrumb / title          │  (fixed R)   │
//   │              │  - body                        │              │
//   │              │  - ArticleFooter (at bottom)   │              │
//   │  WordCount   │                                │              │
//   └──────────────┴────────────────────────────────┴──────────────┘
//                                                      [👍] [💬]  ← EngagementFAB
//
// Both rails are fixed overlays anchored under the global top-nav (`top-12`).
// The middle column gets `lg:mx-60` so the rails don't sit on top of content.
// Below `lg` the rails collapse to icons or hide.
import React, { useRef } from 'react';
import { cn } from '../../../lib/utils';
import BookNav, { type BookNavChapter } from './BookNav';
import DOMOutline from './DOMOutline';
import EngagementFAB from './EngagementFAB';

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
  likes: number;
  commentsCount: number;
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
      {/* Left rail — book nav. Hidden below lg. Width matches Yuque (288px).
          Border is inline-styled because Tailwind's `border-r` was being
          reset to 0px by an upstream reset elsewhere in the project. */}
      <aside
        className={cn(
          'fixed left-0 top-12 bottom-0 z-30 hidden w-72 lg:block',
          'bg-ds-surface-1',
        )}
        style={{ borderRight: '1px solid var(--color-backgroundTertiary, #e5e5e5)' }}
      >
        <BookNav
          overview={overview}
          chapters={chapters}
          currentId={activeChapter}
        />
      </aside>

      {/* Right rail — outline. Hidden below lg. */}
      <aside
        className={cn(
          'fixed right-0 top-12 bottom-0 z-30 hidden w-60 lg:block',
          'overflow-y-auto px-5 pt-6',
        )}
      >
        <DOMOutline containerSelector={outlineContainerSelector} activeKey={activeChapter} />
      </aside>

      {/* Centre — flow content. Left rail is w-72, right rail w-60. */}
      <div className="lg:ml-72 lg:mr-60">
        <div ref={centreRef} className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-10">
          {children}
        </div>
      </div>

      {/* Word count — fixed marker anchored to the bottom of the centre
          column, just inside the left rail's right edge (Yuque-style
          "366 Word" overlay). Behaves like the EngagementFAB: doesn't
          scroll with content. */}
      {typeof wordCount === 'number' && (
        <div
          className={cn(
            'fixed bottom-3 z-30 hidden lg:block',
            'font-mono text-[12px] text-ds-fg-subtle',
            'pointer-events-none select-none',
          )}
          style={{ left: 'calc(18rem + 1rem)' }}
        >
          {wordCount} Word
        </div>
      )}

      {/* Floating engagement pills */}
      <EngagementFAB
        likes={likes}
        comments={commentsCount}
        onLikeClick={handleLikeClick}
        onCommentClick={handleCommentClick}
      />
    </>
  );
};

export default KnowledgeBaseShell;
