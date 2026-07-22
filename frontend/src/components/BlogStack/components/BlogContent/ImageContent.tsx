import React, { useEffect, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { BlogContent } from '../../types/blog';
import { useLanguage } from '../../../LanguageContext';
import { Badge, Modal, Skeleton } from '../../../ds';
import { MediaUnavailable } from './MediaUnavailable';
import { mediaUrl } from '../../../../api/utils';

interface ImageContentProps {
  item: BlogContent;
  index: number;
  isWideScreen: boolean;
}

export const ImageContent: React.FC<ImageContentProps> = ({ item, index, isWideScreen }) => {
  const { language } = useLanguage();
  const imageRef = useRef<HTMLImageElement>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const unpublished = item.content.startsWith('/api/placeholder');
  const source = unpublished ? item.content : mediaUrl(item.content);

  useEffect(() => {
    setLoading(true);
    setImageError(false);
    setAttempt(0);
  }, [item.content]);

  useEffect(() => {
    if (unpublished) return;

    const image = imageRef.current;
    if (!image || !image.complete) return;

    setLoading(false);
    setImageError(image.naturalWidth === 0);
  }, [attempt, source, unpublished]);

  const retry = () => {
    setLoading(true);
    setImageError(false);
    setAttempt((value) => value + 1);
  };

  const alt = item.caption || (language === 'zh' ? '文章插图' : 'Article figure');

  return <>
    <figure className={`my-16 break-inside-avoid ${isWideScreen ? 'col-span-2' : ''}`}>
      <div className="overflow-hidden rounded-2xl bg-ds-surface-1 ring-1 ring-ds-border-subtle">
        <div className="relative overflow-hidden bg-ds-surface-2">
          {unpublished || imageError ? (
            <MediaUnavailable kind="image" unpublished={unpublished} onRetry={retry} />
          ) : (
            <div className="relative min-h-48">
              {loading && <Skeleton className="absolute inset-0 h-full min-h-64 w-full rounded-none" />}
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="group relative block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ds-focus"
                aria-label={language === 'zh' ? `查看原图：${alt}` : `Open full-size image: ${alt}`}
              >
                <img
                  ref={imageRef}
                  key={`${source}-${attempt}`}
                  src={source}
                  alt={alt}
                  onLoad={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setImageError(true);
                  }}
                  className={`mx-auto max-h-[37.5rem] w-full object-contain transition duration-300 group-hover:scale-[1.006] ${loading ? 'opacity-0' : 'opacity-100'}`}
                />
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-ds-md bg-black/65 px-2.5 py-1.5 text-ds-xs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 className="size-3.5" aria-hidden />
                  {language === 'zh' ? '查看原图' : 'Full size'}
                </span>
              </button>
            </div>
          )}
        </div>

        {item.caption && (
          <figcaption className="space-y-2 bg-ds-surface-1 p-5 text-center sm:p-6">
              <Badge tone="primary" size="sm">
                {language === 'zh' ? '图' : 'Figure'} {index + 1}
              </Badge>
              <p className="mx-auto max-w-2xl text-pretty font-serif text-ds-sm leading-6 text-ds-fg-muted">
                {item.caption}
              </p>
          </figcaption>
        )}
      </div>
    </figure>
    <Modal
      open={previewOpen}
      onClose={() => setPreviewOpen(false)}
      title={item.caption || (language === 'zh' ? '文章插图' : 'Article figure')}
      size="xl"
      closeLabel={language === 'zh' ? '关闭原图' : 'Close full-size image'}
      className="bg-ds-surface-1 p-3 sm:p-5"
    >
      <img src={source} alt={alt} className="mx-auto max-h-[82dvh] w-auto max-w-full object-contain" />
    </Modal>
  </>;
};
