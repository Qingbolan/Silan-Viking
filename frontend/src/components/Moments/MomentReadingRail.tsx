import React from 'react';
import { useTheme } from '../ThemeContext';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import type { Moment } from '../../types/api';
import type { RemoteResource } from '../../hooks/useRemoteResource';
import { adjacentMoments } from '../../lib/momentNavigation';
import { firstMomentVideo } from '../../lib/momentMedia';
import { markdownToPlainExcerpt } from '../../lib/markdown';
import { mediaUrl } from '../../api/utils';
import { canonicalInternalPath } from '../../utils/navigation';
import MomentJumpBar, { useMomentJumpBar } from './MomentJumpBar';
import MomentActions from '../Resume/MomentActions';

function NeighborPreview({ moment, direction, language }: { moment: Moment | null; direction: 'previous' | 'next'; language: 'en' | 'zh' }) {
  const label = language === 'zh' ? (direction === 'previous' ? '上一篇' : '下一篇') : (direction === 'previous' ? 'Previous' : 'Next');
  const Icon = direction === 'previous' ? ArrowLeft : ArrowRight;
  if (!moment) return <div className="py-4 text-ds-xs text-ds-fg-subtle"><span className="flex items-center gap-2"><Icon className="size-3.5" />{label}</span><p className="mt-2">{language === 'zh' ? '已到时间线边界' : 'You’ve reached the end of the timeline.'}</p></div>;
  const video = firstMomentVideo(moment.description);
  return <Link to={canonicalInternalPath(`/moments/${encodeURIComponent(moment.slug || moment.id)}`)}
    className="group block rounded-ds-sm py-4 outline-none transition-colors hover:text-ds-primary focus-visible:shadow-ds-focus">
    <div className="mb-3 flex items-center justify-between text-ds-xs text-ds-fg-muted"><span className="flex items-center gap-2"><Icon className="size-3.5" />{label}</span><time dateTime={moment.date}>{moment.date}</time></div>
    {video?.poster && <div className="relative mb-3 overflow-hidden rounded-ds-sm bg-ds-surface-3"><img src={mediaUrl(video.poster)} alt="" loading="lazy" className="aspect-video w-full object-cover" /><Play className="absolute bottom-2 right-2 size-7 rounded-full bg-black/70 p-1.5 text-white" aria-hidden /></div>}
    <h2 className="line-clamp-2 text-ds-base font-semibold leading-snug text-ds-fg group-hover:text-ds-primary">{moment.title}</h2>
    <p className="mt-2 line-clamp-3 text-ds-sm leading-relaxed text-ds-fg-muted">{markdownToPlainExcerpt(moment.description, moment.title, 160)}</p>
  </Link>;
}

export default function MomentReadingRail({ moment, timeline, language }: { moment: Moment; timeline: RemoteResource<Moment[]>; language: 'en' | 'zh' }) {
  const { isDarkMode } = useTheme();
  const rail = React.useRef<HTMLElement>(null);
  const jumpVisible = useMomentJumpBar(rail);
  const neighbors = adjacentMoments(timeline.data ?? [], moment.id);
  return <><aside ref={rail} aria-label={language === 'zh' ? '讨论与相邻动态' : 'Discussion and nearby moments'} className="w-full min-w-0 border-t border-ds-border">
    <div className={`overflow-hidden rounded-ds-lg ${isDarkMode ? 'bg-ds-surface-1' : 'bg-ds-surface-2'}`}>
      <section aria-label={language === 'zh' ? '评论' : 'Comments'}>
        <div className="min-w-0">
          <MomentActions momentKey={moment.slug || moment.id} timestamp={`${moment.date}T00:00:00`} variant="sidebar" />
        </div>
      </section>
      <section aria-label={language === 'zh' ? '相邻动态' : 'Nearby moments'} className="mx-4 border-t border-ds-border pb-2 pt-5">
        <div>
          {timeline.status === 'loading' ? <p className="py-6 text-ds-sm text-ds-fg-muted" role="status">{language === 'zh' ? '正在加载相邻动态…' : 'Loading nearby moments…'}</p>
            : timeline.status === 'error' ? <div className="py-6 text-ds-sm"><p>{language === 'zh' ? '暂时无法加载相邻动态。' : 'Nearby moments could not be loaded.'}</p><button type="button" onClick={timeline.reload} className="mt-3 text-ds-primary underline">{language === 'zh' ? '重试' : 'Try again'}</button></div>
            : <div className="divide-y divide-ds-border"><NeighborPreview moment={neighbors.next} direction="next" language={language} /></div>}
        </div>
      </section>
    </div>
  </aside>
    <MomentJumpBar previous={neighbors.previous} next={neighbors.next} language={language} visible={jumpVisible} />
  </>;
}
