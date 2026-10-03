import React from 'react';
import type { LucideIcon } from 'lucide-react';
import AuthorByline from './AuthorByline';
import { ContentHero } from '../../ds/ContentHero';
import { cn } from '../../../lib/utils';

interface SeriesDocumentHeaderProps {
  language: string;
  eyebrow: string;
  title: string;
  coverImage?: string;
  author?: string;
  meta?: Array<{
    icon?: LucideIcon;
    label: string;
    content?: React.ReactNode;
  }>;
}

interface SeriesDocumentFrameProps {
  id?: string;
  summary?: string;
  children: React.ReactNode;
}

export const SERIES_HEADER_ID = 'kb-series-header';
export const SERIES_SUMMARY_ID = 'kb-series-summary';
export const SERIES_BODY_ID = 'kb-series-body';

export const SeriesDocumentHeader: React.FC<SeriesDocumentHeaderProps> = ({
  language, title, eyebrow, coverImage, author = 'Silan Hu', meta = [],
}) => (
      <ContentHero
        id={SERIES_HEADER_ID}
        title={title}
        language={language}
        coverImage={coverImage}
        parent={{ label: language === 'zh' ? '博客' : 'Blog', to: '/blog/' }}
        details={<span>{eyebrow}</span>}
        metadata={<>
          <AuthorByline name={author} />
          {meta.map((item) => {
            const Icon = item.icon;
            return <span key={item.label} className="inline-flex items-center gap-1.5">
              {item.content ?? <>{Icon && <Icon className="size-3.5" aria-hidden />}{item.label}</>}
            </span>;
          })}
        </>}
      />

);

export const SeriesDocumentFrame: React.FC<SeriesDocumentFrameProps> = ({
  id = 'kb-active-part',
  summary,
  children,
}) => {
  return (
    <div data-ds id={id} className="prose-content w-full scroll-mt-24">

      {summary && (
        <section
          id={SERIES_SUMMARY_ID}
          className="scroll-mt-24"
        >
          <p className="!m-0 text-pretty text-ds-lg font-normal italic leading-7 text-ds-fg-muted">
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
