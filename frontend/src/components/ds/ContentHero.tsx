import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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
        <nav aria-label={language === 'zh' ? '面包屑导航' : 'Breadcrumb'} className="mt-6 text-ds-sm text-ds-fg-muted">
          <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            <li><Link className="content-hero__link" to="/">{language === 'zh' ? '首页' : 'Home'}</Link></li>
            <li aria-hidden="true"><ChevronRight className="size-4 text-ds-primary" /></li>
            <li><Link className="content-hero__link" to={parent.to}>{parent.label}</Link></li>
            <li aria-hidden="true"><ChevronRight className="size-4 text-ds-primary" /></li>
            <li aria-current="page" className="min-w-0 max-w-full break-words text-ds-fg">{title}</li>
          </ol>
        </nav>
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
