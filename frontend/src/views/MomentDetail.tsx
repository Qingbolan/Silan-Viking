import React, { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMoment, fetchMoments } from '../api/moments/momentApi';
import { fetchPersonalInfo } from '../api/home/resumeApi';
import { mediaUrl } from '../api/utils';
import type { Moment, PersonalInfo } from '../types/api';
import Markdown from '../components/ui/Markdown';
import MomentVideoPlayer from '../components/Moments/MomentVideoPlayer';
import { momentVideoContent } from '../lib/momentMedia';
import MomentReadingRail from '../components/Moments/MomentReadingRail';
import MomentScrollTransition from '../components/Moments/MomentScrollTransition';
import { adjacentMoments } from '../lib/momentNavigation';
import { ContentBreadcrumb } from '../components/ds/ContentBreadcrumb';
import MomentRelatedOutputs from '../components/Moments/MomentRelatedOutputs';
import { useLanguage } from '../components/LanguageContext';
import { Seo, creativeWorkJsonLd } from '../components/Seo';
import { Avatar, Badge, BrandLoading, NetworkError } from '../components/ds';
import { useRemoteResource, type RemoteResource } from '../hooks/useRemoteResource';
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
  const loadTimeline = useCallback(() => fetchMoments(lang), [lang]);
  const timeline = useRemoteResource<Moment[]>(`moment-timeline-${lang}`, loadTimeline);
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

        loading: '正在加载动态',
        notFoundTitle: '动态不存在',
        notFoundBody: '这条动态不存在，或尚未公开。',
        related: '关联内容',
      }
    : {

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
      key={moment.id}
      moment={moment}
      timeline={timeline}
      lang={lang}
      copy={copy}
      authorName={authorName}
      authorAvatarUrl={authorAvatarUrl}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[84rem] px-5 pb-32 pt-4 sm:px-8 sm:pt-6">
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

      <ContentBreadcrumb
        title={moment?.title || (lang === 'zh' ? '动态详情' : 'Moment')}
        language={lang}
        parent={{ label: lang === 'zh' ? '动态' : 'Moments', to: canonicalInternalPath('/moments') }}
        className="border-b border-ds-border pb-5"
      />

      <div className="mt-6 sm:mt-8">{body}</div>
    </div>
  );
};

// Media, prose and discussion follow the same vertical reading order.
const MomentDetailBody: React.FC<{
  moment: Moment;
  timeline: RemoteResource<Moment[]>;
  lang: 'en' | 'zh';
  copy: {
    related: string;
  };
  authorName: string;
  authorAvatarUrl: string;
}> = ({ moment, timeline, lang, copy, authorName, authorAvatarUrl }) => {
  const { video, body: remainingBody } = momentVideoContent(moment.description);
  const bodyText = withoutRepeatedTitle(remainingBody, moment.title);
  const formattedDate = formatMomentDate(moment, lang);

  return (
    <MomentScrollTransition {...adjacentMoments(timeline.data ?? [], moment.id)} ready={timeline.status === 'ready'} language={lang}>
    <div className="mx-auto flex w-full max-w-[52rem] flex-col gap-6">
      <article className="w-full min-w-0 pb-5 sm:pb-8">
        <div className={'w-full'}>
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
            className="moment-detail-prose mt-6 max-w-[65ch] text-ds-base leading-[1.68] text-ds-fg-muted sm:text-ds-lg [&_.markdown-body]:!pl-0"
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

        </div>
      </article>

      <MomentReadingRail moment={moment} timeline={timeline} language={lang} />
    </div>
    </MomentScrollTransition>
  );
};

export default MomentDetail;
