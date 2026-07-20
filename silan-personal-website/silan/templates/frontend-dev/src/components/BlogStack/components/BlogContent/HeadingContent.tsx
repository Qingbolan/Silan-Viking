import React from 'react';
import { Link2 } from 'lucide-react';
import { BlogContent } from '../../types/blog';
import Markdown from '../../../ui/Markdown';
import { useLanguage } from '../../../LanguageContext';
import { useToast } from '../../../ds';

interface HeadingContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
}

export const HeadingContent: React.FC<HeadingContentProps> = ({
  item,
  index,
  isWideScreen
}) => {
  const { language } = useLanguage();
  const toast = useToast();
  // Generate stable, anchor-friendly ID
  const slugify = (s: string) =>
    (s || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/#[^\s]*/g, '')
      .replace(/[?]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  const readableSlug = slugify(item.content);
  const anchorId = readableSlug ? `${readableSlug}-${index + 1}` : item.id;

  // Ensure we have a valid level (1-6), default to 2
  const level = Math.max(1, Math.min(6, item.level || 2)) as 1 | 2 | 3 | 4 | 5 | 6;
  const Tag = `h${level}` as const;

  // Font scale — wide-screen bumps each level up a notch. Font weight steps
  // down as level increases (h1 bold, h2 semibold, h3+ medium).
  const sizeClass = isWideScreen
    ? ['', 'text-[2rem]', 'text-[1.75rem]', 'text-[1.5rem]', 'text-[1.25rem]', 'text-[1.125rem]', 'text-[1rem]'][level]
    : ['', 'text-[1.75rem]', 'text-[1.5rem]', 'text-[1.25rem]', 'text-[1.125rem]', 'text-[1rem]', 'text-[0.9rem]'][level];
  const weightClass = level === 1 ? 'font-bold' : level === 2 ? 'font-semibold' : 'font-medium';
  const leadingClass = level === 1 ? 'leading-[1.2]' : 'leading-[1.3]';

  // Asymmetric spacing — a section break needs more air above it than
  // below it, so the heading reads as "new section starts here" rather
  // than sitting flush with the paragraph that follows. h1 (the article
  // title) skips the top gap since it has nothing above it to separate
  // from; deeper levels (h3+) get a smaller break since they're
  // sub-divisions of the section, not a fresh one.
  const marginTop = level === 1 ? '0' : level === 2 ? '3.5rem' : '2.5rem';
  const marginBottom = level === 1 ? '1.5rem' : '1rem';

  return (
    <div
      id={anchorId}
      className={`heading-content group relative ${isWideScreen ? 'wide-screen' : ''}`}
      style={{
        scrollMarginTop: '100px',
        marginTop,
        marginBottom
      }}
    >
      <Tag className={`font-display pr-9 text-theme-text-primary tracking-[-0.01em] ${sizeClass} ${weightClass} ${leadingClass}`}>
        <Markdown inline>{item.content}</Markdown>
      </Tag>
      <a
        href={`#${anchorId}`}
        onClick={async (event) => {
          event.preventDefault();
          const url = new URL(window.location.href);
          url.hash = anchorId;
          window.history.replaceState(null, '', url);
          document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          try {
            await navigator.clipboard.writeText(url.toString());
            toast.success(language === 'zh' ? '章节链接已复制' : 'Section link copied');
          } catch {
            toast.error(language === 'zh' ? '无法复制章节链接' : 'Section link could not be copied');
          }
        }}
        aria-label={language === 'zh' ? '复制此章节链接' : 'Copy link to this section'}
        className="absolute right-0 top-1 inline-flex size-8 items-center justify-center rounded-ds-md text-ds-fg-subtle opacity-0 transition hover:bg-ds-surface-2 hover:text-ds-primary focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ds-focus group-hover:opacity-100"
      >
        <Link2 className="size-4" aria-hidden />
      </a>

      {/* A quiet accent rule under h1/h2 — single brand color, no gradient. */}
      {(level === 1 || level === 2) && (
        <div
          className="heading-divider mt-2 h-[2px] rounded-full bg-theme-accent/70"
          style={{ width: level === 1 ? '100%' : '60%' }}
        />
      )}
    </div>
  );
};
