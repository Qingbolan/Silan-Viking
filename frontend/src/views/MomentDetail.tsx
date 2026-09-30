import React, { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { fetchMoment } from '../api/moments/momentApi';
import { fetchPersonalInfo } from '../api/home/resumeApi';
import { mediaUrl } from '../api/utils';
import type { Moment, PersonalInfo } from '../types/api';
import Markdown from '../components/ui/Markdown';
import MomentVideoPlayer from '../components/Moments/MomentVideoPlayer';
import { momentVideoContent } from '../lib/momentMedia';
import MomentActions from '../components/Resume/MomentActions';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import { useLanguage } from '../components/LanguageContext';
import { Seo, creativeWorkJsonLd } from '../components/Seo';
import { Avatar, Badge, BrandLoading, NetworkError } from '../components/ds';
import { useRemoteResource } from '../hooks/useRemoteResource';
import { useSetPageTitle } from '../layout/PageTitleContext';
import { markdownToPlainExcerpt, withoutRepeatedTitle } from '../lib/markdown';
import { normalizeContentTimestamp } from '../utils/contentTimestamp';
import { canonicalInternalPath } from '../utils/navigation';
import { publicAssetUrl } from '../utils/publicAsset';

const formatMomentDate = (moment: Moment, language: 'en' | 'zh') => {
  const date = new Date(`${moment.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return moment.date;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-SG', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  }).format(date);
};

const firstValidContentTimestamp = (...values: Array<string | null | undefined>): string | undefined => {
  for (const value of values) {
    const timestamp = normalizeContentTimestamp(value);
    if (timestamp) return timestamp;
  }
  return undefined;
};

// Standalone detail page (Xiaohongshu note-style split: article left, a
// sticky interaction rail right on desktop; single column with the actions
// in flow below lg). `/moments/:slug` is a real page navigation — the
// browser chrome's back button and the in-page back link both return to
// the moments list.
const MomentDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { language } = useLanguage();
  const lang = language as 'en' | 'zh';

  const loadMoment = useCallback(
    () => slug ? fetchMoment(slug, lang) : Promise.resolve(null),
    [slug, lang],
  );
  const resource = useRemoteResource<Moment>(slug, loadMoment);
  const moment = resource.data;
  const loadAuthor = useCallback(() => fetchPersonalInfo(lang), [lang]);
  const authorResource = useRemoteResource<PersonalInfo>(`moment-author-${lang}`, loadAuthor);
  const authorName = authorResource.data?.full_name || 'Silan Hu';
  const authorAvatarUrl = authorResource.data?.avatar_url
    ? mediaUrl(authorResource.data.avatar_url)
    : publicAssetUrl('/image.png');

  useSetPageTitle(
    moment
      ? moment.title
      : resource.status === 'not-found'
        ? (lang === 'zh' ? '动态不存在' : 'Moment not found')
        : resource.status === 'error'
          ? (lang === 'zh' ? '动态暂不可用' : 'Moment unavailable')
          : null,
  );

  const copy = lang === 'zh'
    ? {
        back: '返回动态',
        loading: '正在加载动态',
        notFoundTitle: '动态不存在',
        notFoundBody: '这条动态不存在，或尚未公开。',
        related: '关联内容',
      }
    : {
        back: 'Back to moments',
        loading: 'Loading moment',
        notFoundTitle: 'Moment not found',
        notFoundBody: 'This moment does not exist or is not public.',
        related: 'Related',
      };

  const detailPath = `/moments/${slug ?? ''}`;
  const description = moment ? markdownToPlainExcerpt(moment.description, moment.title, 180) : '';

  const body = resource.status === 'loading' ? (
    <div className="flex min-h-[24rem] items-center justify-center">
      <BrandLoading inline message={copy.loading} />
    </div>
  ) : resource.status === 'error' ? (
    <div className="flex min-h-[24rem] items-center justify-center p-8">
      <NetworkError onRetry={resource.reload} error={resource.error} />
    </div>
  ) : !moment ? (
    <div className="flex min-h-[24rem] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-ds-xl font-semibold text-ds-fg">{copy.notFoundTitle}</h1>
      <p className="max-w-sm text-ds-sm text-ds-fg-muted">{copy.notFoundBody}</p>
    </div>
  ) : (
    <MomentDetailBody
      moment={moment}
      lang={lang}
      copy={copy}
      authorName={authorName}
      authorAvatarUrl={authorAvatarUrl}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[76rem] px-5 pb-0 pt-4 sm:px-8 sm:pt-7 lg:px-0">
      {moment && (
        <Seo
          title={moment.title}
          description={description}
          path={detailPath}
          type="article"
          lang={lang}
          jsonLd={creativeWorkJsonLd({
            title: moment.title,
            description,
            path: detailPath,
            lang,
            datePublished: firstValidContentTimestamp(moment.date, moment.created_at),
            dateModified: firstValidContentTimestamp(moment.updated_at, moment.created_at, moment.date),
          })}
        />
      )}

      <Link
        to={canonicalInternalPath('/moments')}
        className="inline-flex min-h-9 items-center gap-1.5 text-ds-sm font-medium text-ds-fg-muted transition-colors hover:text-ds-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {copy.back}
      </Link>

      <div className="mt-3 sm:mt-5">{body}</div>
    </div>
  );
};

// Video Moments use a wide watch page with discussion below the description.
// Text Moments retain their article and sticky interaction rail.
const MomentDetailBody: React.FC<{
  moment: Moment;
  lang: 'en' | 'zh';
  copy: {
    related: string;
  };
  authorName: string;
  authorAvatarUrl: string;
}> = ({ moment, lang, copy, authorName, authorAvatarUrl }) => {
  const { video, body: remainingBody } = momentVideoContent(moment.description);
  const bodyText = withoutRepeatedTitle(remainingBody, moment.title);
  // A Moment is a dated public record. Its interaction footer must use the
  // same public date as the article header; creation time is projection
  // metadata and can differ after imports or migrations.
  const timestamp = `${moment.date}T00:00:00`;
  const formattedDate = formatMomentDate(moment, lang);

  return (
    <div className={video ? 'mx-auto max-w-[68rem]' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10 xl:grid-cols-[minmax(0,1fr)_26rem]'}>
      <article className="min-w-0 pb-5 sm:pb-8">
        <div className={video ? 'w-full' : 'mx-auto max-w-[44rem]'}>
          {video && <div className="mb-5"><MomentVideoPlayer video={video} title={moment.title} /></div>}
          <header>
            <h1 className="moment-detail-title text-pretty text-[1.625rem] font-semibold leading-[1.16] tracking-[-0.025em] text-ds-fg sm:text-ds-3xl lg:text-ds-4xl">
              {moment.title}
            </h1>

            <div className="mt-3.5 flex min-w-0 items-center gap-2">
              <Avatar
                src={authorAvatarUrl}
                name={authorName}
                size="sm"
                bordered={false}
                className="size-7"
              />
              <Link
                to={canonicalInternalPath('/')}
                className="min-w-0 truncate rounded-ds-xs text-[0.9375rem] font-semibold leading-[1.35] text-ds-primary transition-colors hover:text-ds-primary-hover hover:underline focus-visible:shadow-ds-focus"
              >
                {authorName}
              </Link>
              <span className="text-ds-fg-subtle" aria-hidden>·</span>
              <time dateTime={moment.date} className="shrink-0 text-ds-sm tabular-nums text-ds-fg-subtle">
                {formattedDate}
              </time>
            </div>

            {moment.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {moment.tags.map((tag) => (
                <Badge key={tag} tone="neutral" appearance="soft">
                  #{tag}
                </Badge>
                ))}
              </div>
            )}
          </header>

          <Markdown
            documentTitle={moment.title}
            className="moment-detail-prose mt-5 text-ds-base leading-[1.68] text-ds-fg-muted sm:text-ds-lg [&_.markdown-body]:!pl-0"
          >
            {bodyText}
          </Markdown>

          <MomentRelatedOutputs
            outputs={moment.related_outputs ?? []}
            labels={{
              title: copy.related,
            }}
            className="mt-6"
          />

          {/* Below lg, the interaction rail collapses back into the
              article flow — the sidebar variant only makes sense with
              room beside the text. */}
          <div className={video ? 'mt-6' : 'mt-6 lg:hidden'}>
            <MomentActions momentKey={moment.slug || moment.id} timestamp={timestamp} />
          </div>
        </div>
      </article>

      {!video && <aside className="hidden lg:block">
        {/* Sticky rail: the sidebar variant needs a bounded height so its
            comment list scrolls internally while the article keeps using
            the page scroll. */}
        <div className="sticky top-6 h-[calc(100dvh-10rem)] min-h-[24rem] overflow-hidden rounded-ds-lg border border-ds-border bg-ds-surface-2">
          <MomentActions momentKey={moment.slug || moment.id} timestamp={timestamp} variant="sidebar" />
        </div>
      </aside>}
    </div>
  );
};

export default MomentDetail;
