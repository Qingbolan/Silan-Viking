import React from 'react';
import { ImageOff, RefreshCw, VideoOff } from 'lucide-react';
import { Button } from '../../../ds';
import { useLanguage } from '../../../LanguageContext';

interface MediaUnavailableProps {
  kind: 'image' | 'video';
  unpublished?: boolean;
  onRetry?: () => void;
}

/**
 * Explicit state for media that is absent or failed to load.
 *
 * A broken asset is content state, not decorative content: never replace it
 * with a fabricated third-party image. The reader should know whether the
 * author has not published the asset yet or a real request failed.
 */
export const MediaUnavailable: React.FC<MediaUnavailableProps> = ({
  kind,
  unpublished = false,
  onRetry,
}) => {
  const { language } = useLanguage();
  const zh = language === 'zh';
  const Icon = kind === 'image' ? ImageOff : VideoOff;

  const title = unpublished
    ? zh ? '媒体尚未发布' : 'Media not published'
    : zh ? `${kind === 'image' ? '图片' : '视频'}加载失败` : `${kind === 'image' ? 'Image' : 'Video'} could not be loaded`;
  const description = unpublished
    ? zh ? '这篇内容引用的媒体资源尚未上传。' : 'This article references a media asset that has not been uploaded.'
    : zh ? '请检查网络后重试；如果问题持续存在，资源可能已被移动。' : 'Retry after checking your connection. The asset may have moved if the problem persists.';

  return (
    <div
      role={unpublished ? 'status' : 'alert'}
      className="flex min-h-64 flex-col items-center justify-center gap-3 bg-ds-surface-2 px-6 py-12 text-center"
    >
      <span className="grid size-11 place-items-center rounded-xl bg-ds-surface-3 text-ds-fg-subtle">
        <Icon size={21} strokeWidth={1.8} aria-hidden />
      </span>
      <div className="max-w-md space-y-1">
        <p className="m-0 text-sm font-semibold text-ds-fg">{title}</p>
        <p className="m-0 text-sm leading-6 text-ds-fg-muted">{description}</p>
      </div>
      {!unpublished && onRetry && (
        <Button size="sm" variant="secondary" leadingIcon={<RefreshCw size={14} />} onClick={onRetry}>
          {zh ? '重试' : 'Retry'}
        </Button>
      )}
    </div>
  );
};
