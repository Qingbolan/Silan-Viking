import React, { useState } from 'react';
import { ContentBreadcrumb } from './ContentBreadcrumb';
import './ContentHero.css';

interface ContentHeroProps {
  id?: string;
  title: string;
  coverImage?: string;
  language: string;
  parent: { label: string; to: string };
  metadata?: React.ReactNode;
  details?: React.ReactNode;
}

/** Shared page identity, independent of reader rails and content type. */
export const ContentHero: React.FC<ContentHeroProps> = ({
  id, title, coverImage, language, parent, metadata, details,
}) => {
  const [failedCover, setFailedCover] = useState<string>();
  const hasCover = Boolean(coverImage && failedCover !== coverImage);
  const breadcrumb = (
    <ContentBreadcrumb title={title} language={language} parent={parent} centered={hasCover} className={hasCover ? 'mt-6' : 'mb-5'} />
  );
  return (
    <header data-ds data-has-cover={hasCover} id={id} className="content-hero scroll-mt-24">
      {hasCover && (
        <img
          key={coverImage}
          src={coverImage}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          onError={() => setFailedCover(coverImage)}
          className="content-hero__image"
        />
      )}
      <div className="content-hero__content">
        {!hasCover && breadcrumb}
        <h1 className="content-hero__title font-display text-ds-fg">{title}</h1>
        <div className="content-hero__info">
        {metadata && (
          <div className="content-hero__metadata flex flex-wrap items-center gap-x-4 gap-y-2 text-ds-sm text-ds-fg-muted">
            {metadata}
          </div>
        )}
        {hasCover && breadcrumb}
        {details && (
          <div className="content-hero__details mt-4 flex flex-wrap gap-x-4 gap-y-1 text-ds-xs text-ds-fg-muted">
            {details}
          </div>
        )}
        </div>
      </div>
    </header>
  );
};
