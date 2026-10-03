import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ContentHero } from '../../ds/ContentHero';
import { cn } from '../../../lib/utils';

interface SeriesDocumentFrameProps {
  id?: string;
  language: string;
  eyebrow: string;
  title: string;
  summary?: string;
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

export const SeriesDocumentFrame: React.FC<SeriesDocumentFrameProps> = ({
  id = 'kb-active-part',
  language,
  eyebrow,
  title,
  summary,
  meta = [],
  children,
}) => {
  return (
    <div data-ds id={id} className="prose-content markdown-body w-full scroll-mt-24">
      <ContentHero
        id={SERIES_HEADER_ID}
        title={title}
        language={language}
        parent={{ label: language === 'zh' ? '博客' : 'Blog', to: '/blog/' }}
        metadata={<>
          <span>{eyebrow}</span>
          {meta.map((item) => {
            const Icon = item.icon;
            return <span key={item.label} className="inline-flex items-center gap-1.5">
              {item.content ?? <>{Icon && <Icon className="size-3.5" aria-hidden />}{item.label}</>}
            </span>;
          })}
        </>}
      />

      {summary && (
        <section
          id={SERIES_SUMMARY_ID}
          className="scroll-mt-24 rounded-ds-lg bg-ds-surface-2 px-6 py-6 sm:px-8"
        >
          <p className="max-w-[58rem] text-pretty text-ds-lg font-medium leading-7 text-ds-fg sm:leading-[1.55]">
            {summary}
          </p>
        </section>
      )}

      <section id={SERIES_BODY_ID} className={cn('max-w-[68rem] scroll-mt-24', summary ? 'mt-6' : 'mt-2')}>
        {children}
      </section>
    </div>
  );
};

export default SeriesDocumentFrame;
