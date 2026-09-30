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
  return (
    <header data-ds id={id} className="content-hero scroll-mt-24">
      {coverImage && failedCover !== coverImage && (
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
        <h1 className="content-hero__title content-hero__halo font-display text-ds-fg">{title}</h1>
        <div className="content-hero__info content-hero__halo mt-6">
        {metadata && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-ds-sm text-ds-fg-muted">
            {metadata}
          </div>
        )}
        <ContentBreadcrumb title={title} language={language} parent={parent} centered className="mt-6" />
        {details && (
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-ds-xs text-ds-fg-muted">
            {details}
          </div>
        )}
        </div>
      </div>
    </header>
  );
};
