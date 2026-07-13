import React, { useEffect, useState } from 'react';
import { PlayCircle } from 'lucide-react';
import { BlogContent } from '../../types/blog';
import { useLanguage } from '../../../LanguageContext';
import { Badge } from '../../../ds';
import { MediaUnavailable } from './MediaUnavailable';
import { mediaUrl } from '../../../../api/utils';

interface VideoContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
}

export const VideoContent: React.FC<VideoContentProps> = ({ item, index, isWideScreen }) => {
  const { language } = useLanguage();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const unpublished = item.content.startsWith('/api/placeholder');
  const source = unpublished ? item.content : mediaUrl(item.content);
  const webmSource = source.toLowerCase().endsWith('.mp4')
    ? source.slice(0, -4) + '.webm'
    : undefined;

  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [item.content]);

  const retry = () => {
    setFailed(false);
    setAttempt((value) => value + 1);
  };

  return (
    <figure className={`my-16 ${isWideScreen ? 'col-span-2' : ''} break-inside-avoid`}>
      <div className="overflow-hidden rounded-2xl bg-ds-surface-1 ring-1 ring-ds-border-subtle">
        <div className="relative overflow-hidden bg-ds-surface-2">
          {unpublished || failed ? (
            <MediaUnavailable kind="video" unpublished={unpublished} onRetry={retry} />
          ) : (
            <video
              key={`${source}-${attempt}`}
              controls
              className="block aspect-video max-h-[32rem] w-full bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ds-focus"
              preload="metadata"
              onError={() => setFailed(true)}
            >
              <source src={source} type="video/mp4" />
              {webmSource && <source src={webmSource} type="video/webm" />}
              {language === 'en'
                ? 'Your browser does not support HTML video.'
                : '您的浏览器不支持 HTML 视频。'}
            </video>
          )}
        </div>

        {item.caption && (
          <figcaption className="space-y-2 bg-ds-surface-1 p-5 text-center sm:p-6">
              <Badge tone="primary" size="sm">
                <PlayCircle aria-hidden />
                {language === 'zh' ? '视频' : 'Video'} {index + 1}
              </Badge>
              <p className="mx-auto max-w-2xl text-pretty font-serif text-ds-sm leading-6 text-ds-fg-muted">
                {item.caption}
              </p>
          </figcaption>
        )}
      </div>
    </figure>
  );
};
