import React, { useMemo } from 'react';
import { AlignLeft, FileText, MessageCircle, ThumbsUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { scrollToAnchor } from '../../../lib/scrollToAnchor';

interface SeriesDocumentFrameProps {
  id?: string;
  language: string;
  eyebrow: string;
  title: string;
  summary?: string;
  activeSection?: string;
  likes?: number;
  commentsCount?: number;
  onSectionClick?: (id: string) => void;
  meta?: Array<{
    icon?: LucideIcon;
    label: string;
    content?: React.ReactNode;
  }>;
  children: React.ReactNode;
}

export const SERIES_HEADER_ID = 'kb-series-header';
export const SERIES_SUMMARY_ID = 'kb-series-summary';
export const SERIES_BODY_ID = 'kb-series-body';
export const SERIES_LIKES_ID = 'kb-likes';
export const SERIES_COMMENTS_ID = 'kb-comments';

export const SeriesDocumentFrame: React.FC<SeriesDocumentFrameProps> = ({
  id = 'kb-active-part',
  language,
  eyebrow,
  title,
  summary,
  activeSection = SERIES_HEADER_ID,
  likes,
  commentsCount,
  onSectionClick,
  meta = [],
  children,
}) => {
  const handleSectionClick = onSectionClick ?? scrollToAnchor;
  const sectionTabs = useMemo(() => [
    ...(summary
      ? [{
          id: SERIES_SUMMARY_ID,
          label: language === 'zh' ? '摘要' : 'Summary',
          icon: FileText,
        }]
      : []),
    {
      id: SERIES_BODY_ID,
      label: language === 'zh' ? '正文' : 'Body',
      icon: AlignLeft,
    },
    ...(typeof likes === 'number'
      ? [{
          id: SERIES_LIKES_ID,
          label: language === 'zh' ? `点赞 ${likes}` : `Likes ${likes}`,
          icon: ThumbsUp,
        }]
      : []),
    ...(typeof commentsCount === 'number'
      ? [{
          id: SERIES_COMMENTS_ID,
          label: language === 'zh' ? `评论 ${commentsCount}` : `Comments ${commentsCount}`,
          icon: MessageCircle,
        }]
      : []),
  ], [commentsCount, language, likes, summary]);

  return (
    <div id={id} className="prose-content markdown-body w-full scroll-mt-24">
      <header id={SERIES_HEADER_ID} className="scroll-mt-24 pb-8 pt-6">
        <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] leading-5 text-ds-fg-subtle">
          <span>{eyebrow}</span>
          {meta.map((item) => {
            const Icon = item.icon;
            return (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                {item.content ?? (
                  <>
                    {Icon && <Icon className="size-3.5" aria-hidden />}
                    {item.label}
                  </>
                )}
              </span>
            );
          })}
        </div>

        <h1
          className="max-w-[70rem] text-balance font-display text-ds-fg"
          style={{
            fontSize: 'clamp(3.8rem, 5.8vw, 5.6rem)',
            lineHeight: 1.04,
            fontWeight: 520,
            letterSpacing: '-0.034em',
          }}
        >
          {title}
        </h1>
      </header>

      {sectionTabs.length > 1 && (
        <nav
          data-ds
          aria-label={language === 'zh' ? '系列文章章节' : 'Series article sections'}
          className="mt-2 flex flex-wrap items-end gap-2 border-b border-ds-border"
        >
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              tab.id === SERIES_SUMMARY_ID
                ? activeSection === SERIES_HEADER_ID || activeSection === SERIES_SUMMARY_ID
                : tab.id === SERIES_BODY_ID
                  ? activeSection === SERIES_BODY_ID || (!summary && activeSection === SERIES_HEADER_ID)
                  : activeSection === tab.id;
            return (
              <button
                data-ds
                key={tab.id}
                type="button"
                onClick={() => handleSectionClick(tab.id)}
                className={cn(
                  'inline-flex h-12 items-center gap-2 rounded-t-ds-md px-4 text-[15px] font-semibold transition-colors',
                  active
                    ? 'text-ds-primary'
                    : 'text-ds-fg-muted hover:text-ds-primary',
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </nav>
      )}

      {summary && (
        <section
          id={SERIES_SUMMARY_ID}
          className="scroll-mt-24 rounded-b-ds-lg bg-ds-surface-2 px-6 py-6 sm:px-8"
        >
          <p className="max-w-[58rem] text-pretty text-[19px] font-medium leading-[1.55] text-ds-fg">
            {summary}
          </p>
        </section>
      )}

      <section id={SERIES_BODY_ID} className="mt-12 max-w-[68rem] scroll-mt-24">
        <div className="mb-6 flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
            {language === 'zh' ? '正文' : 'Body'}
          </span>
          <span className="h-px flex-1 bg-ds-border" aria-hidden />
        </div>

        {children}
      </section>
    </div>
  );
};

export default SeriesDocumentFrame;
