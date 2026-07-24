import React from 'react';
import { ExternalLink, Fingerprint } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  contentAttributionLabels,
  contentAuthorDisplayName,
  contentAuthorProfileUrl,
  contentCanonicalUrl,
  contentReproductionNotice,
  type AttributedContentKind,
} from '../../lib/contentAttribution';
import { useLanguage } from '../LanguageContext';
import { dsRoot } from './dsAttr';

export interface ContentAttributionProps {
  canonicalPath: string;
  kind: AttributedContentKind;
  author?: string;
  className?: string;
}

const ContentAttribution: React.FC<ContentAttributionProps> = ({
  canonicalPath,
  kind,
  author,
  className,
}) => {
  const { language } = useLanguage();
  const locale = language as 'en' | 'zh';
  const labels = contentAttributionLabels(locale, kind);
  const canonicalUrl = contentCanonicalUrl(canonicalPath, locale);
  const authorUrl = contentAuthorProfileUrl(locale);

  return (
    <aside
      {...dsRoot}
      aria-label={labels.heading}
      data-content-attribution={kind}
      data-canonical-source={canonicalUrl}
      className={cn(
        'border-y border-ds-border py-5 text-ds-sm text-ds-fg-muted',
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ds-fg-subtle">
        <Fingerprint className="size-3.5" aria-hidden />
        <span>{labels.heading}</span>
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="font-medium text-ds-fg-subtle">{labels.author}</dt>
        <dd>
          <a
            href={authorUrl}
            rel="author"
            className="font-medium text-ds-fg underline decoration-ds-border underline-offset-4 transition-colors hover:text-ds-primary hover:decoration-current"
          >
            {contentAuthorDisplayName(author)}
          </a>
        </dd>

        <dt className="font-medium text-ds-fg-subtle">{labels.reproduction}</dt>
        <dd className="max-w-[58rem] leading-6">
          {contentReproductionNotice(locale)}
        </dd>

        <dt className="font-medium text-ds-fg-subtle">{labels.canonical}</dt>
        <dd>
          <a
            href={canonicalUrl}
            rel="bookmark"
            className="inline-flex items-center gap-1.5 font-medium text-ds-fg underline decoration-ds-border underline-offset-4 transition-colors hover:text-ds-primary hover:decoration-current"
          >
            {canonicalUrl}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </dd>
      </dl>
    </aside>
  );
};

export default ContentAttribution;
